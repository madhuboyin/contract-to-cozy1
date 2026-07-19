const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.PHASE3_ACCEPTANCE_DATABASE_URL;
if (process.env.PHASE3_ACCEPTANCE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PHASE3_ACCEPTANCE_DATABASE_URL;
}
process.env.GEMINI_API_KEY ||= 'phase3-acceptance-placeholder';

test('owner-applied database supports Phase 3 verified closure integrity', { skip: !databaseUrl }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const requiredColumns = {
      project_records: ['outcomeStatus', 'verifiedAt', 'followUpHealth', 'followUpCompletedAt', 'writeBackAppliedAt'],
      documents: ['projectId', 'projectProofKey'],
      expenses: ['projectId'],
      warranties: ['projectId'],
      home_events: ['projectId', 'guidanceJourneyId'],
      reviews: ['projectId', 'guidanceJourneyId', 'verifiedOutcome', 'priceVarianceCents'],
      property_maintenance_tasks: ['completionMetadata'],
    };
    const schemaRows = (await Promise.all(Object.keys(requiredColumns).map((table) => client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
    `, table)))).flat();
    const present = new Set(schemaRows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, columns] of Object.entries(requiredColumns)) {
      for (const column of columns) assert.ok(present.has(`${table}.${column}`), `Missing owner-applied column ${table}.${column}`);
    }

    const integrity = await client.$queryRawUnsafe(`
      SELECT p.id
      FROM project_records p
      LEFT JOIN home_events h ON h."projectId" = p.id
      LEFT JOIN expenses e ON e."projectId" = p.id
      WHERE p."outcomeStatus" = 'VERIFIED_SUCCESS'
        AND p."writeBackAppliedAt" IS NOT NULL
        AND (h.id IS NULL OR e.id IS NULL)
      LIMIT 20
    `);
    assert.deepEqual(integrity, [], 'Verified closure has missing HomeEvent or expense write-back');

    const duplicateProof = await client.$queryRawUnsafe(`
      SELECT "projectProofKey", COUNT(*)::int AS count
      FROM documents
      WHERE "projectProofKey" IS NOT NULL
      GROUP BY "projectProofKey"
      HAVING COUNT(*) > 1
    `);
    assert.deepEqual(duplicateProof, [], 'Project proof idempotency keys are duplicated');
  } finally {
    await client.$disconnect();
  }
});

test('Phase 3 pilot runs trigger through verified closure, replay, and follow-up against the database', {
  skip: !databaseUrl,
  timeout: 120_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
  const projectTracker = require('../../src/services/projectTracker.service.ts');
  const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

  const runId = `phase3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = {};
  const now = new Date();
  const daysFromNow = (days) => new Date(now.getTime() + days * 86_400_000).toISOString();

  try {
    const homeowner = await prisma.user.create({
      data: {
        email: `${runId}-homeowner@example.invalid`,
        firstName: 'Phase3',
        lastName: 'Homeowner',
        role: 'HOMEOWNER',
        passwordHash: 'acceptance-only-not-a-login',
        homeownerProfile: { create: {} },
      },
      include: { homeownerProfile: true },
    });
    created.homeownerUserId = homeowner.id;

    const providerUser = await prisma.user.create({
      data: {
        email: `${runId}-provider@example.invalid`,
        firstName: 'Phase3',
        lastName: 'Provider',
        role: 'PROVIDER',
        passwordHash: 'acceptance-only-not-a-login',
        providerProfile: {
          create: {
            businessName: `Phase 3 Acceptance ${runId}`,
            serviceCategories: ['HVAC'],
            status: 'ACTIVE',
            licenseVerified: true,
            insuranceVerified: true,
            categoryEligibility: {
              create: { serviceCategory: 'HVAC', isEligible: true, missingCredentialTypes: [] },
            },
          },
        },
      },
      include: { providerProfile: true },
    });
    created.providerUserId = providerUser.id;

    const property = await prisma.property.create({
      data: {
        homeownerProfileId: homeowner.homeownerProfile.id,
        name: `Phase 3 Acceptance ${runId}`,
        address: '1 Acceptance Way',
        city: 'Testville',
        state: 'VA',
        zipCode: '22030',
        dwellingType: 'DETACHED_SINGLE_FAMILY',
        ownershipForm: 'FEE_SIMPLE',
        propertyUse: 'PRIMARY_RESIDENCE',
        occupancyStatus: 'OWNER_OCCUPIED',
      },
    });
    created.propertyId = property.id;

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        propertyId: property.id,
        name: 'Acceptance HVAC system',
        assetType: 'HVAC_SYSTEM',
        category: 'HVAC',
        condition: 'POOR',
        purchaseCostCents: 900_000,
        isVerified: true,
        verificationSource: 'PHASE3_ACCEPTANCE',
      },
    });

    const service = await prisma.service.create({
      data: {
        providerProfileId: providerUser.providerProfile.id,
        category: 'HVAC',
        name: 'HVAC replacement acceptance service',
        description: 'Isolated Phase 3 database acceptance fixture',
        basePrice: 8500,
        priceUnit: 'flat rate',
      },
    });

    const ingest = await guidanceJourneyService.ingestSignal({
      propertyId: property.id,
      inventoryItemId: inventoryItem.id,
      signalIntentFamily: 'lifecycle_end_or_past_life',
      issueDomain: 'ASSET_LIFECYCLE',
      decisionStage: 'DIAGNOSIS',
      executionReadiness: 'NEEDS_CONTEXT',
      severity: 'HIGH',
      severityScore: 82,
      confidenceScore: 0.97,
      sourceType: 'MANUAL',
      sourceFeatureKey: 'phase3_db_acceptance',
      sourceToolKey: 'phase3-db-acceptance',
      sourceEntityType: 'INVENTORY_ITEM',
      sourceEntityId: inventoryItem.id,
      sourceRunId: runId,
      dedupeKey: runId,
      payloadJson: { symptom: 'not_cooling', observedAt: now.toISOString(), acceptanceRunId: runId },
      actorUserId: homeowner.id,
    });
    const journeyId = ingest.journey.id;
    assert.equal(ingest.journey.journeyTypeKey, 'asset_lifecycle_resolution');
    assert.equal(ingest.journey.templateVersion, 'asset_lifecycle_resolution@3.0.0');

    const booking = await prisma.booking.create({
      data: {
        bookingNumber: `P3-${runId}`,
        homeownerId: homeowner.id,
        providerId: providerUser.id,
        providerProfileId: providerUser.providerProfile.id,
        propertyId: property.id,
        serviceId: service.id,
        inventoryItemId: inventoryItem.id,
        guidanceJourneyId: journeyId,
        guidanceStepKey: 'book_service',
        category: 'HVAC',
        status: 'COMPLETED',
        estimatedPrice: 8500,
        finalPrice: 8750,
        description: 'Replace failed HVAC system',
        completedAt: now,
      },
    });
    created.bookingId = booking.id;

    for (const stepKey of [
      'verify_history',
      'repair_replace_decision',
      'check_coverage',
      'validate_price',
      'compare_quotes',
      'prepare_negotiation',
      'finalize_price',
      'book_service',
    ]) {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: property.id,
        actorUserId: homeowner.id,
        journeyId,
        inventoryItemId: inventoryItem.id,
        sourceEntityType: 'INVENTORY_ITEM',
        sourceEntityId: inventoryItem.id,
        sourceToolKey: 'phase3-db-acceptance',
        stepKey,
        status: 'COMPLETED',
        producedData: { proofType: 'database_acceptance', proofId: `${runId}:${stepKey}`, acceptanceRunId: runId },
      });
    }

    const project = await projectTracker.createProject(property.id, {
      name: 'Acceptance HVAC replacement',
      description: 'Trigger-to-verified-closure database acceptance project',
      projectType: 'HVAC_REPLACEMENT',
      sourceType: 'GUIDANCE',
      guidanceJourneyId: journeyId,
      inventoryItemId: inventoryItem.id,
      bookingId: booking.id,
      contractorId: providerUser.providerProfile.id,
      contractorName: providerUser.providerProfile.businessName,
      executionPath: 'REPLACEMENT',
      fulfillmentMode: 'PROVIDER',
      fundingMode: 'SELF_PAID',
      complexity: 'MAJOR',
      providerRankingRationale: 'Selected solely as an isolated verified acceptance fixture.',
      commercialDisclosure: { sponsored: false, acceptanceRunId: runId },
      contractAmountCents: 850_000,
      startDate: now.toISOString(),
      expectedEndDate: daysFromNow(1),
      homeSystemsAffected: ['HVAC'],
      serviceCategory: 'HVAC',
    });
    created.projectId = project.id;

    await guidanceJourneyService.recordToolCompletion({
      propertyId: property.id,
      actorUserId: homeowner.id,
      journeyId,
      inventoryItemId: inventoryItem.id,
      sourceEntityType: 'PROJECT_RECORD',
      sourceEntityId: project.id,
      sourceToolKey: 'project-tracker',
      stepKey: 'confirm_scope_and_provider',
      status: 'COMPLETED',
      producedData: { proofType: 'project_record', proofId: project.id, projectId: project.id },
    });

    await prisma.projectPayment.create({
      data: {
        projectId: project.id,
        description: 'Final payment',
        amountCents: 875_000,
        triggerType: 'MANUAL',
        status: 'PAID',
        paidDate: now,
      },
    });
    await prisma.projectProgressLog.create({
      data: {
        projectId: project.id,
        entryDate: now,
        entryType: 'MATERIAL_DELIVERY',
        notes: 'Installed and photographed acceptance replacement equipment.',
        photoKeys: [`acceptance/${runId}/installed-unit.jpg`],
        materialType: 'OTHER',
        materialBrand: 'Acceptance Air',
        materialModel: 'P3-9000',
        materialColor: 'Gray',
        materialSupplier: 'Acceptance Supply',
        materialQuantity: '1 system',
        loggedByUserId: homeowner.id,
      },
    });

    const uploadedProof = await prisma.document.create({
      data: {
        propertyId: property.id,
        uploadedBy: homeowner.id,
        type: 'INVOICE',
        name: 'Uploaded acceptance invoice',
        fileUrl: `acceptance/${runId}/invoice.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        metadata: { acceptanceRunId: runId, uploadLifecycle: 'already-uploaded' },
      },
    });

    await guidanceJourneyService.recordToolCompletion({
      propertyId: property.id,
      actorUserId: homeowner.id,
      journeyId,
      sourceEntityType: 'PROJECT_RECORD',
      sourceEntityId: project.id,
      sourceToolKey: 'project-tracker',
      stepKey: 'track_work',
      status: 'COMPLETED',
      producedData: { proofType: 'project_tracking', proofId: project.id, photoCount: 1 },
    });

    const completionPayload = {
      outcomeStatus: 'VERIFIED_SUCCESS',
      actualEndDate: now.toISOString(),
      actualCostCents: 875_000,
      commissioningResult: 'PASSED',
      functionalVerificationResult: 'PASSED',
      safetyCheckResult: 'PASSED',
      inspectionResult: 'NOT_REQUIRED',
      unresolvedExceptions: [],
      proofDocuments: [
        { documentId: uploadedProof.id, proofKey: 'invoice', type: 'INVOICE', name: 'Uploaded acceptance invoice', kind: 'PDF' },
        { proofKey: 'completion-photo', type: 'PHOTO', name: 'Installed system', fileUrl: `acceptance/${runId}/installed-unit.jpg`, fileSize: 2048, mimeType: 'image/jpeg', kind: 'PHOTO' },
      ],
      modelNumber: 'P3-9000',
      serialNumber: `SERIAL-${runId}`,
      providerOutcome: 'COMPLETED_AS_AGREED',
      recommendationOverridden: false,
      recommendationComprehensionConfirmed: true,
      contractorRatingQuality: 5,
      contractorRatingTimeline: 4,
      contractorRatingComms: 5,
      contractorRatingBudget: 4,
      contractorReviewText: 'Acceptance provider delivered a verified outcome.',
      warrantyPeriodMonths: 24,
      warrantyDocumentKey: `acceptance/${runId}/warranty.pdf`,
      completionRecordKey: `acceptance/${runId}/completion.pdf`,
      nextMaintenanceDate: daysFromNow(180),
      nextInspectionDate: daysFromNow(365),
      replacementHorizonDate: daysFromNow(3650),
      followUpDate: daysFromNow(30),
    };

    const closure = await projectTracker.confirmCompletion(project.id, property.id, homeowner.id, completionPayload);
    assert.equal(closure.idempotentReplay, false);

    for (const stepKey of ['verify_outcome', 'capture_proof', 'update_home_record', 'set_future_care']) {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: property.id,
        actorUserId: homeowner.id,
        journeyId,
        sourceEntityType: 'PROJECT_RECORD',
        sourceEntityId: project.id,
        sourceToolKey: 'project-completion',
        stepKey,
        status: 'COMPLETED',
        producedData: { proofType: 'verified_project_closure', proofId: `${project.id}:${stepKey}`, projectId: project.id },
      });
    }

    const beforeReplay = await Promise.all([
      prisma.homeEvent.count({ where: { projectId: project.id } }),
      prisma.document.count({ where: { projectId: project.id } }),
      prisma.expense.count({ where: { projectId: project.id } }),
      prisma.warranty.count({ where: { projectId: project.id } }),
      prisma.projectWriteBack.count({ where: { projectId: project.id } }),
    ]);
    const replay = await projectTracker.confirmCompletion(project.id, property.id, homeowner.id, completionPayload);
    assert.equal(replay.idempotentReplay, true);
    const afterReplay = await Promise.all([
      prisma.homeEvent.count({ where: { projectId: project.id } }),
      prisma.document.count({ where: { projectId: project.id } }),
      prisma.expense.count({ where: { projectId: project.id } }),
      prisma.warranty.count({ where: { projectId: project.id } }),
      prisma.projectWriteBack.count({ where: { projectId: project.id } }),
    ]);
    assert.deepEqual(afterReplay, beforeReplay, 'idempotent replay must not duplicate write-backs');

    const [storedProject, storedJourney, event, expense, warranty, documents, item, materialSpec, review, futureCare] = await Promise.all([
      prisma.projectRecord.findUniqueOrThrow({ where: { id: project.id } }),
      prisma.guidanceJourney.findUniqueOrThrow({ where: { id: journeyId }, include: { steps: { orderBy: { stepOrder: 'asc' } } } }),
      prisma.homeEvent.findFirstOrThrow({ where: { projectId: project.id } }),
      prisma.expense.findUniqueOrThrow({ where: { projectId: project.id } }),
      prisma.warranty.findUniqueOrThrow({ where: { projectId: project.id } }),
      prisma.document.findMany({ where: { projectId: project.id } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItem.id } }),
      prisma.materialSpec.findFirstOrThrow({ where: { projectId: project.id } }),
      prisma.review.findUniqueOrThrow({ where: { projectId: project.id } }),
      prisma.propertyMaintenanceTask.findMany({ where: { propertyId: property.id, actionKey: { startsWith: `project:${project.id}:` } } }),
    ]);

    assert.equal(storedProject.status, 'COMPLETED');
    assert.equal(storedProject.outcomeStatus, 'VERIFIED_SUCCESS');
    assert.ok(storedProject.verifiedAt && storedProject.writeBackAppliedAt);
    assert.equal(storedJourney.status, 'COMPLETED');
    assert.equal(storedJourney.steps.length, 14);
    assert.ok(storedJourney.steps.every((step) => step.status === 'COMPLETED'));
    assert.equal(event.guidanceJourneyId, journeyId);
    assert.equal(event.expenseId, expense.id);
    assert.equal(warranty.inventoryItemId, inventoryItem.id);
    assert.ok(documents.length >= 4);
    assert.equal(new Set(documents.map((document) => document.projectProofKey)).size, documents.length);
    assert.ok(documents.some((document) => document.id === uploadedProof.id && document.verificationStatus === 'VERIFIED'));
    assert.equal(item.condition, 'NEW');
    assert.equal(item.modelNumber, 'P3-9000');
    assert.equal(item.serialNumber, `SERIAL-${runId}`);
    assert.equal(item.isVerified, true);
    assert.equal(materialSpec.manufacturer, 'Acceptance Air');
    assert.equal(review.guidanceJourneyId, journeyId);
    assert.equal(review.verifiedOutcome, true);
    assert.equal(review.priceVarianceCents, 25_000);
    assert.ok(futureCare.some((task) => task.actionKey === `project:${project.id}:follow-up`));

    const followUp = futureCare.find((task) => task.actionKey === `project:${project.id}:follow-up`);
    await PropertyMaintenanceTaskService.updateTaskStatus(homeowner.id, followUp.id, 'COMPLETED', undefined, 'NEEDS_ATTENTION');
    const [followedUpProject, remediation] = await Promise.all([
      prisma.projectRecord.findUniqueOrThrow({ where: { id: project.id } }),
      prisma.propertyMaintenanceTask.findUnique({
        where: { propertyId_actionKey: { propertyId: property.id, actionKey: `project:${project.id}:follow-up-remediation` } },
      }),
    ]);
    assert.equal(followedUpProject.followUpHealth, 'NEEDS_ATTENTION');
    assert.ok(followedUpProject.followUpCompletedAt);
    assert.equal(remediation.status, 'PENDING');
    assert.equal(remediation.priority, 'HIGH');

    const exceptionProject = await projectTracker.createProject(property.id, {
      name: 'Acceptance unsafe exception',
      description: 'Verifies that an unsafe result remains explicit and does not apply success write-backs.',
      projectType: 'CUSTOM',
      sourceType: 'MANUAL',
      executionPath: 'REPAIR',
      fulfillmentMode: 'DIY',
      fundingMode: 'SELF_PAID',
      complexity: 'MAJOR',
      contractAmountCents: 10_000,
      startDate: now.toISOString(),
      homeSystemsAffected: ['OTHER'],
      serviceCategory: 'OTHER',
    });
    const exceptionClosure = await projectTracker.confirmCompletion(exceptionProject.id, property.id, homeowner.id, {
      outcomeStatus: 'UNSAFE',
      actualEndDate: now.toISOString(),
      actualCostCents: 10_000,
      commissioningResult: 'FAILED',
      functionalVerificationResult: 'FAILED',
      safetyCheckResult: 'FAILED',
      inspectionResult: 'UNRESOLVED',
      unresolvedExceptions: [{ code: 'SAFETY_STOP', summary: 'Unsafe condition requires specialist remediation.', blocking: true }],
      proofDocuments: [{
        proofKey: 'unsafe-condition',
        type: 'PHOTO',
        name: 'Unsafe condition evidence',
        fileUrl: `acceptance/${runId}/unsafe-condition.jpg`,
        fileSize: 512,
        mimeType: 'image/jpeg',
        kind: 'PHOTO',
      }],
      providerOutcome: 'NOT_APPLICABLE',
      recommendationOverridden: false,
      recommendationComprehensionConfirmed: false,
      contractorReviewText: 'Work stopped because the condition was unsafe.',
    });
    assert.equal(exceptionClosure.idempotentReplay, false);

    const [storedException, exceptionEvent, exceptionDocuments, exceptionExpense] = await Promise.all([
      prisma.projectRecord.findUniqueOrThrow({ where: { id: exceptionProject.id } }),
      prisma.homeEvent.findFirstOrThrow({ where: { projectId: exceptionProject.id } }),
      prisma.document.findMany({ where: { projectId: exceptionProject.id } }),
      prisma.expense.findFirst({ where: { projectId: exceptionProject.id } }),
    ]);
    assert.equal(storedException.status, 'PAUSED');
    assert.equal(storedException.outcomeStatus, 'UNSAFE');
    assert.equal(storedException.writeBackAppliedAt, null);
    assert.equal(exceptionEvent.type, 'NOTE');
    assert.equal(exceptionEvent.importance, 'HIGH');
    assert.equal(exceptionExpense, null);
    assert.equal(exceptionDocuments.length, 1);
    assert.equal(exceptionDocuments[0].verificationStatus, 'UNVERIFIED');
  } finally {
    if (created.propertyId) {
      await prisma.productAnalyticsEvent.deleteMany({ where: { propertyId: created.propertyId } }).catch(() => {});
      await prisma.document.deleteMany({ where: { propertyId: created.propertyId } }).catch(() => {});
      await prisma.expense.deleteMany({ where: { propertyId: created.propertyId } }).catch(() => {});
      await prisma.warranty.deleteMany({ where: { propertyId: created.propertyId } }).catch(() => {});
      if (created.bookingId) await prisma.booking.deleteMany({ where: { id: created.bookingId } }).catch(() => {});
      await prisma.property.deleteMany({ where: { id: created.propertyId } }).catch(() => {});
    }
    if (created.providerUserId) await prisma.user.deleteMany({ where: { id: created.providerUserId } }).catch(() => {});
    if (created.homeownerUserId) await prisma.user.deleteMany({ where: { id: created.homeownerUserId } }).catch(() => {});
    await prisma.$disconnect();
  }
});

test('Phase 3 completion-proof storage accepts and removes a real object', {
  skip: process.env.PHASE3_ACCEPTANCE_STORAGE !== 'true',
  timeout: 60_000,
}, async () => {
  assert.ok(process.env.S3_BUCKET, 'S3_BUCKET is required for the storage acceptance');
  assert.ok(process.env.S3_ACCESS_KEY_ID, 'S3_ACCESS_KEY_ID is required for the storage acceptance');
  assert.ok(process.env.S3_SECRET_ACCESS_KEY, 'S3_SECRET_ACCESS_KEY is required for the storage acceptance');

  require('ts-node/register/transpile-only');
  const { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const { getS3Client } = require('../../src/services/storage/s3Client.ts');
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET;
  const key = `phase3-acceptance/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from('ContractToCozy Phase 3 proof acceptance'),
      ContentType: 'text/plain',
      Metadata: { lifecycle: 'phase3-acceptance' },
    }));
    const stored = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    assert.equal(stored.ContentType, 'text/plain');
    assert.equal(stored.Metadata?.lifecycle, 'phase3-acceptance');
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
    client.destroy();
  }
});
