const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.PHASE6_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
process.env.GEMINI_API_KEY ||= 'phase6-acceptance-placeholder';

test('owner-applied database contains the completed Phase 6 schema', { skip: !databaseUrl }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const requiredColumns = {
      new_home_pilot_assessments: ['admissionDecision', 'admissionReasons', 'cohortKey', 'reviewedByUserId', 'reviewedAt'],
      project_records: ['recommendationComprehensionConfirmed', 'recommendationComprehensionConfirmedAt'],
      new_home_warranty_rights: ['noticeDeadlineAt', 'deadlineTaskId', 'notifiedAt'],
      new_home_inspection_bundles: ['inspectionReportId', 'completedAt'],
    };
    const rows = (await Promise.all(Object.keys(requiredColumns).map((table) => client.$queryRawUnsafe(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
    `, table)))).flat();
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, columns] of Object.entries(requiredColumns)) {
      for (const column of columns) assert.ok(present.has(`${table}.${column}`), `Missing owner-applied column ${table}.${column}`);
    }
  } finally { await client.$disconnect(); }
});

test('Phase 6 database pilot enforces admission, promotes notice deadlines, and completes workflows idempotently', {
  skip: !databaseUrl,
  timeout: 120_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { NewHomeSetupService } = require('../../src/services/newHomeSetup.service.ts');
  const { decidePhase6PilotAdmission, getPhase6PilotMetrics } = require('../../src/services/adminAnalytics/phase6PilotService.ts');
  const { processNewHomeWarrantyDeadlines } = require('../../src/services/newHomeWarrantyDeadline.service.ts');
  const runId = `phase6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userId;
  try {
    const user = await prisma.user.create({
      data: { email: `${runId}@example.invalid`, firstName: 'Phase6', lastName: 'Acceptance', role: 'HOMEOWNER', passwordHash: 'acceptance-only-not-a-login', homeownerProfile: { create: {} } },
      include: { homeownerProfile: true },
    });
    userId = user.id;
    const property = await prisma.property.create({
      data: {
        homeownerProfileId: user.homeownerProfile.id,
        name: `Phase 6 Acceptance ${runId}`, address: '6 Warranty Way', city: 'Testville', state: 'VA', zipCode: '22030',
        dwellingType: 'DETACHED_SINGLE_FAMILY', ownershipForm: 'FEE_SIMPLE', propertyUse: 'PRIMARY_RESIDENCE', occupancyStatus: 'OWNER_OCCUPIED',
      },
    });
    await prisma.propertyOnboarding.create({
      data: { propertyId: property.id, userId: user.id, entryPath: 'NEW_HOME_SETUP', propertyOrigin: 'NEW_CONSTRUCTION', ownershipState: 'RECENT_OWNER' },
    });

    const qualified = await NewHomeSetupService.assessPilot(user.id, property.id, {
      demandScore: 4, documentAvailability: 'SOME', builderFollowupPainScore: 4, engagementIntentScore: 4,
      channelSource: 'phase6-acceptance', estimatedAcquisitionCents: 12500,
    });
    assert.equal(qualified.decision, 'ELIGIBLE');
    assert.equal(qualified.admissionDecision, 'PENDING');
    await assert.rejects(() => NewHomeSetupService.getOrCreatePlan(user.id, property.id), /operator admission/i);

    await decidePhase6PilotAdmission(property.id, user.id, { decision: 'ADMITTED', cohortKey: runId, reasons: [] });
    const plan = await NewHomeSetupService.getOrCreatePlan(user.id, property.id);
    assert.equal(plan.tasks.length, 12);

    const punch = await NewHomeSetupService.createPunchListItem(user.id, property.id, {
      title: 'Acceptance door adjustment', priority: 'SOON', evidenceDocumentIds: [],
    });
    const response = await NewHomeSetupService.addBuilderResponse(user.id, property.id, punch.id, {
      responseType: 'SCHEDULED', message: 'Builder scheduled a return visit.', promisedBy: new Date(Date.now() + 3 * 86_400_000).toISOString(), verifyClosure: false,
    });
    assert.equal(response.item.status, 'SCHEDULED');

    const noticeDeadlineAt = new Date(Date.now() + 10 * 86_400_000);
    const warranty = await NewHomeSetupService.createWarrantyRight(user.id, property.id, {
      coverageTitle: 'Builder workmanship', coverageSummary: 'Acceptance coverage', expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      noticeDeadlineAt: noticeDeadlineAt.toISOString(), sourceCitation: 'Acceptance warranty § 4', verified: true,
    });
    await processNewHomeWarrantyDeadlines({ propertyId: property.id });
    assert.equal(await prisma.propertyMaintenanceTask.count({ where: { propertyId: property.id, actionKey: `new-home:warranty-deadline:${warranty.id}` } }), 1);
    assert.equal(await prisma.notification.count({ where: { entityType: 'NEW_HOME_WARRANTY_RIGHT', entityId: warranty.id } }), 1);
    const promoted = await prisma.newHomeWarrantyRight.findUnique({ where: { id: warranty.id } });
    assert.equal(promoted.status, 'NOTICE_DUE');
    assert.ok(promoted.deadlineTaskId);

    const bundles = await NewHomeSetupService.ensureInspectionBundles(user.id, property.id);
    const report = await prisma.inspectionReport.create({ data: { propertyId: property.id, reportType: 'ANNUAL', inspectionDate: new Date(), sourceFileKey: `${runId}.pdf`, status: 'CONFIRMED' } });
    const completedBundle = await NewHomeSetupService.updateInspectionBundle(user.id, property.id, bundles[0].id, { status: 'COMPLETED', inspectionReportId: report.id });
    assert.equal(completedBundle.status, 'COMPLETED');

    const metrics = await getPhase6PilotMetrics(new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    assert.equal(metrics.expansionGate.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(typeof metrics.expansionGate.recommendationComprehension.value, 'number');
    assert.equal(typeof metrics.expansionGate.providerQualityVisibility.value, 'number');
    assert.equal(typeof metrics.expansionGate.recurringCareConversion.value, 'number');
  } finally {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
