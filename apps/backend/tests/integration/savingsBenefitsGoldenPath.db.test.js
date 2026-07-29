const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.SAVINGS_BENEFITS_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

test('owner-applied database enforces Savings & Benefits editorial and operational integrity', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const requiredColumns = {
      hidden_asset_sources: ['version', 'reviewedVersion', 'lastAuthoredBy'],
      hidden_asset_programs: ['version', 'approvedVersion', 'authoredBy'],
      savings_benefit_partners: ['compensationMayOccur'],
      savings_benefit_actions: [
        'partnerId',
        'handoffStatus',
        'followUpNotificationSentAt',
        'followUpNotificationClaimedAt',
      ],
      hidden_asset_match_outcomes: ['actionId', 'verificationState', 'verifiedAt', 'verifiedBy'],
      home_savings_opportunity_outcomes: ['actionId', 'verificationState', 'verifiedAt', 'verifiedBy'],
    };
    const rows = (await Promise.all(Object.keys(requiredColumns).map((table) => client.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
    `, table)))).flat();
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, columns] of Object.entries(requiredColumns)) {
      for (const column of columns) {
        assert.ok(present.has(`${table}.${column}`), `Missing owner-applied column ${table}.${column}`);
      }
    }

    const staleAttestations = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_sources
      WHERE "lastReviewedAt" IS NOT NULL
        AND ("reviewedVersion" IS NULL OR "reviewedVersion" <> version)
      LIMIT 20
    `);
    assert.deepEqual(staleAttestations, [], 'A source retains a review for a different content version');

    const staleApprovals = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_programs
      WHERE "reviewStatus" IN ('APPROVED', 'PUBLISHED')
        AND ("approvedVersion" IS NULL OR "approvedVersion" <> version)
      LIMIT 20
    `);
    assert.deepEqual(staleApprovals, [], 'An approved/published program has an unapproved content version');

    const invalidVerification = await client.$queryRawUnsafe(`
      SELECT id FROM hidden_asset_match_outcomes
      WHERE "verificationState" = 'VERIFIED'
        AND ("verifiedAt" IS NULL OR "verifiedBy" IS NULL)
      UNION ALL
      SELECT id FROM home_savings_opportunity_outcomes
      WHERE "verificationState" = 'VERIFIED'
        AND ("verifiedAt" IS NULL OR "verifiedBy" IS NULL)
      LIMIT 20
    `);
    assert.deepEqual(invalidVerification, [], 'A VERIFIED outcome is missing its verification attestation');

    const orphanedHandoffs = await client.$queryRawUnsafe(`
      SELECT a.id
      FROM savings_benefit_actions a
      LEFT JOIN savings_benefit_partners p ON p.id = a."partnerId"
      WHERE a."handoffStatus" IS NOT NULL AND p.id IS NULL
      LIMIT 20
    `);
    assert.deepEqual(orphanedHandoffs, [], 'A partner handoff has no durable partner-governance record');
  } finally {
    await client.$disconnect();
  }
});

test('real services persist the reviewed-source author-review-publish golden path', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { savingsBenefitsAdminService } = require('../../src/services/savingsBenefitsAdmin.service.ts');
  const {
    transitionSavingsBenefitProgram,
  } = require('../../src/services/savingsBenefitsGovernance.service.ts');
  const {
    isReviewedProgramCurrent,
  } = require('../../src/services/hiddenAssets/sourceFreshness.ts');
  const { HiddenAssetService } = require('../../src/services/hiddenAssets.service.ts');
  const {
    createCanonicalAction,
    recordCanonicalActionOutcome,
  } = require('../../src/services/savingsBenefitsCanonical.service.ts');
  const {
    revokeHiddenAssetMatchOutcome,
    verifySavingsBenefitOutcome,
  } = require('../../src/services/savingsOutcome.service.ts');
  const {
    savingsBenefitsUnifiedService,
  } = require('../../src/services/savingsBenefitsUnified.service.ts');
  const {
    createSavingsBenefitPartnerComplaint,
    resolveSavingsBenefitPartnerComplaint,
    revokeSavingsBenefitHandoff,
    transitionSavingsBenefitHandoff,
  } = require('../../src/services/savingsBenefitsPartner.service.ts');

  const runId = `savings-benefits-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userIds = [];
  let sourceId;
  let programId;
  let partnerId;
  let evidenceDocumentId;
  try {
    const [author, reviewer, publisher] = await Promise.all(
      ['author', 'reviewer', 'publisher'].map((persona) => prisma.user.create({
        data: {
          email: `${runId}-${persona}@example.invalid`,
          firstName: 'Savings',
          lastName: `Benefits ${persona}`,
          role: 'ADMIN',
          passwordHash: 'acceptance-only-not-a-login',
        },
      })),
    );
    userIds.push(author.id, reviewer.id, publisher.id);

    const source = await savingsBenefitsAdminService.createSource({
      name: `Official acceptance source ${runId}`,
      sourceKind: 'OFFICIAL_GOVERNMENT',
      officialUrl: `https://example.gov/${runId}`,
      reviewSlaDays: 180,
    }, author.id);
    sourceId = source.id;
    assert.equal(source.lastReviewedAt, null);

    const reviewed = await savingsBenefitsAdminService.reviewSource(
      source.id,
      reviewer.id,
      'Acceptance reviewer checked the controlling publication.',
    );
    assert.equal(reviewed.reviewedVersion, reviewed.version);

    const program = await savingsBenefitsAdminService.createProgram({
      sourceId: source.id,
      name: `Golden state benefit ${runId}`,
      category: 'REBATE',
      regionType: 'STATE',
      regionValue: 'NJ',
      benefitType: 'REBATE',
      benefitEstimateMin: 250,
      benefitEstimateMax: 500,
      benefitPeriod: 'ONE_TIME',
      sourceUrl: `https://example.gov/${runId}/program`,
      fundingStatus: 'OPEN',
      rules: [{
        attribute: 'state',
        operator: 'EQUALS',
        value: 'NJ',
        kind: 'MANDATORY',
      }],
    }, author.id);
    programId = program.id;

    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: author.id,
      action: 'SUBMIT_FOR_REVIEW',
      reason: 'Acceptance author submitted the exact content version.',
    });
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: reviewer.id,
      action: 'APPROVE',
      reason: 'Acceptance reviewer approved the official criteria.',
    });
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: publisher.id,
      action: 'PUBLISH',
      reason: 'Acceptance publisher released the approved version.',
    });

    const published = await prisma.hiddenAssetProgram.findUniqueOrThrow({
      where: { id: program.id },
      include: { source: true },
    });
    assert.equal(published.reviewStatus, 'PUBLISHED');
    assert.equal(published.approvedVersion, published.version);
    assert.equal(isReviewedProgramCurrent(published, published.source), true);

    const homeowner = await prisma.user.create({
      data: {
        email: `${runId}-homeowner@example.invalid`,
        firstName: 'Golden',
        lastName: 'Homeowner',
        role: 'HOMEOWNER',
        passwordHash: 'acceptance-only-not-a-login',
        homeownerProfile: {
          create: {
            properties: {
              create: {
                name: 'Golden path home',
                address: '1 Acceptance Way',
                city: 'Trenton',
                state: 'NJ',
                zipCode: '08608',
              },
            },
          },
        },
      },
      include: { homeownerProfile: { include: { properties: true } } },
    });
    userIds.push(homeowner.id);
    const property = homeowner.homeownerProfile.properties[0];
    const scan = await new HiddenAssetService().refreshMatchesInternal(property.id);
    assert.ok(scan.matchesFound >= 1, 'Reviewed program did not produce a property match');
    const match = await prisma.propertyHiddenAssetMatch.findFirstOrThrow({
      where: { propertyId: property.id, programId: program.id },
    });
    const action = await createCanonicalAction(property.id, match.id, homeowner.id, {
      idempotencyKey: `${runId}:prepare`,
      family: 'BENEFIT',
      actionType: 'PREPARE',
    });
    await recordCanonicalActionOutcome(property.id, action.id, homeowner.id, {
      idempotencyKey: `${runId}:submitted`,
      stage: 'SUBMITTED',
    });
    await recordCanonicalActionOutcome(property.id, action.id, homeowner.id, {
      idempotencyKey: `${runId}:approved`,
      stage: 'APPROVED',
    });
    const evidence = await prisma.document.create({
      data: {
        propertyId: property.id,
        // Document Vault authorization stores the homeownerProfile id in uploadedBy.
        uploadedBy: homeowner.homeownerProfile.id,
        type: 'OTHER',
        name: 'Golden award letter',
        fileUrl: `acceptance://${runId}/award`,
        fileSize: 256,
        mimeType: 'application/pdf',
      },
    });
    evidenceDocumentId = evidence.id;
    const received = await recordCanonicalActionOutcome(property.id, action.id, homeowner.id, {
      idempotencyKey: `${runId}:received`,
      stage: 'RECEIVED',
      amountReceived: 500,
      currency: 'USD',
      evidenceNote: 'Award letter received.',
      documentIds: [evidence.id],
    });
    await assert.rejects(
      () => verifySavingsBenefitOutcome(
        'BENEFIT',
        received.id,
        homeowner.id,
        'A recorder must not verify their own outcome.',
      ),
      /different administrator/,
    );
    await verifySavingsBenefitOutcome(
      'BENEFIT',
      received.id,
      reviewer.id,
      'Acceptance reviewer independently checked the award letter.',
    );
    await assert.rejects(
      () => verifySavingsBenefitOutcome(
        'BENEFIT',
        received.id,
        reviewer.id,
        'A verified outcome must not be verified twice.',
      ),
      /already been independently verified/,
    );
    const realized = await savingsBenefitsUnifiedService.getUnified(property.id, homeowner.id);
    assert.equal(realized.realized.length, 1);
    assert.equal(realized.realized[0].verificationState, 'VERIFIED');
    assert.equal(realized.totals.verifiedValueByCurrency.USD, 500);

    await revokeHiddenAssetMatchOutcome(
      received.id,
      homeowner.id,
      'Acceptance correction: the award was reversed.',
    );
    const corrected = await savingsBenefitsUnifiedService.getUnified(property.id, homeowner.id);
    assert.equal(corrected.realized.length, 0);
    assert.equal(corrected.totals.verifiedValueByCurrency.USD, undefined);

    partnerId = `${runId}-partner`;
    await prisma.savingsBenefitPartner.create({
      data: {
        id: partnerId,
        name: 'Acceptance partner',
        status: 'ACTIVE',
        supportedJurisdictions: ['NJ'],
        disclosureVersion: 'acceptance-v1',
        compensationMayOccur: true,
        compensationDisclosure: 'Contract to Cozy may receive compensation.',
        rankingDisclosure: 'Compensation does not influence organic ranking.',
        privacyDisclosure: 'Only the approved opportunity fields are delivered.',
        fulfillmentSlaHours: 24,
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const sharedFields = {
      opportunityId: match.id,
      opportunityFamily: 'BENEFIT',
      opportunityTitle: program.name,
      category: program.category,
    };
    const consent = {
      partnerId,
      disclosureAcknowledged: true,
      consentVersion: 'acceptance-v1',
      consentedAt: new Date().toISOString(),
      compensationMayOccur: true,
      rankingInfluenced: false,
      selectionCriteria: ['Jurisdiction support', 'Program category fit'],
      nonCommercialAlternative: 'Continue independently with the official program.',
      sharedFieldNames: Object.keys(sharedFields),
    };
    await assert.rejects(
      () => createCanonicalAction(property.id, match.id, homeowner.id, {
        idempotencyKey: `${runId}:partner-compensation-mismatch`,
        family: 'BENEFIT',
        actionType: 'PARTNER_HANDOFF_CONSENTED',
        externalOwner: partnerId,
        sharedFields,
        consent: { ...consent, compensationMayOccur: false },
      }),
      /explicit consent contract/,
    );
    await assert.rejects(
      () => createCanonicalAction(property.id, match.id, homeowner.id, {
        idempotencyKey: `${runId}:partner-field-injection`,
        family: 'BENEFIT',
        actionType: 'PARTNER_HANDOFF_CONSENTED',
        externalOwner: partnerId,
        sharedFields: { ...sharedFields, email: homeowner.email },
        consent: { ...consent, sharedFieldNames: [...consent.sharedFieldNames, 'email'] },
      }),
      /approved consent contract/,
    );
    const partnerAction = await createCanonicalAction(property.id, match.id, homeowner.id, {
      idempotencyKey: `${runId}:partner-delivery`,
      family: 'BENEFIT',
      actionType: 'PARTNER_HANDOFF_CONSENTED',
      externalOwner: partnerId,
      sharedFields,
      consent,
    });
    const submittedHandoff = await transitionSavingsBenefitHandoff(
      partnerAction.id,
      'SUBMITTED',
      publisher.id,
      'Acceptance administrator delivered the consented payload.',
      `${runId}:delivery-receipt`,
    );
    assert.equal(submittedHandoff.handoffDeliveryReference, `${runId}:delivery-receipt`);
    await transitionSavingsBenefitHandoff(
      partnerAction.id,
      'ACKNOWLEDGED',
      publisher.id,
      'Acceptance partner acknowledged the delivery.',
    );
    await transitionSavingsBenefitHandoff(
      partnerAction.id,
      'FULFILLED',
      publisher.id,
      'Acceptance partner fulfilled the handoff.',
    );
    const complaint = await createSavingsBenefitPartnerComplaint(
      property.id,
      partnerAction.id,
      homeowner.id,
      'SERVICE',
      'Acceptance complaint after fulfillment.',
    );
    await resolveSavingsBenefitPartnerComplaint(
      complaint.id,
      'RESOLVED',
      'Acceptance reviewer confirmed corrective action.',
      reviewer.id,
    );

    const revocableAction = await createCanonicalAction(property.id, match.id, homeowner.id, {
      idempotencyKey: `${runId}:partner-revocation`,
      family: 'BENEFIT',
      actionType: 'PARTNER_HANDOFF_CONSENTED',
      externalOwner: partnerId,
      sharedFields,
      consent: { ...consent, consentedAt: new Date().toISOString() },
    });
    const revokedHandoff = await revokeSavingsBenefitHandoff(
      property.id,
      revocableAction.id,
      homeowner.id,
      'Acceptance homeowner withdrew consent.',
    );
    assert.equal(revokedHandoff.handoffStatus, 'REVOKED');
    assert.equal(revokedHandoff.state, 'CANCELLED');

    await savingsBenefitsAdminService.updateSource(source.id, {
      name: `${source.name} materially changed`,
      sourceKind: source.sourceKind,
      officialUrl: source.officialUrl,
      reviewSlaDays: source.reviewSlaDays,
      status: source.status,
    }, author.id);
    const invalidatedSource = await prisma.hiddenAssetSource.findUniqueOrThrow({
      where: { id: source.id },
    });
    assert.equal(invalidatedSource.reviewedVersion, null);
    assert.equal(invalidatedSource.lastReviewedAt, null);
    assert.equal(isReviewedProgramCurrent(published, invalidatedSource), false);

    const audited = await prisma.auditLog.count({
      where: {
        userId: { in: userIds },
        entityId: { in: [source.id, program.id] },
      },
    });
    assert.ok(audited >= 7, `Expected the full workflow to be audited, found ${audited} records`);
  } finally {
    if (evidenceDocumentId) await prisma.document.deleteMany({ where: { id: evidenceDocumentId } });
    if (programId) await prisma.hiddenAssetProgram.deleteMany({ where: { id: programId } });
    if (sourceId) await prisma.hiddenAssetSource.deleteMany({ where: { id: sourceId } });
    if (partnerId) await prisma.savingsBenefitPartner.deleteMany({ where: { id: partnerId } });
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }
});
