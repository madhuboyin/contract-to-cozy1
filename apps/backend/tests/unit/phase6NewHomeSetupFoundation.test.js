const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  NewHomePilotAssessmentInputSchema,
  NewHomeLifecycleInputSchema,
  NewHomeTaskUpdateSchema,
} = require('../../src/productFramework/newHomeSetup.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('pilot assessment validates all controlled-expansion signals', () => {
  const valid = {
    demandScore: 4,
    documentAvailability: 'SOME',
    builderFollowupPainScore: 4,
    engagementIntentScore: 4,
    channelSource: 'builder-partner',
    estimatedAcquisitionCents: 12500,
  };
  assert.equal(NewHomePilotAssessmentInputSchema.safeParse(valid).success, true);
  assert.equal(NewHomePilotAssessmentInputSchema.safeParse({ ...valid, demandScore: 6 }).success, false);
  assert.equal(NewHomeLifecycleInputSchema.safeParse({}).success, false);
});

test('new-home task completion requires durable evidence', () => {
  assert.equal(NewHomeTaskUpdateSchema.safeParse({ status: 'COMPLETED' }).success, false);
  assert.equal(NewHomeTaskUpdateSchema.safeParse({
    status: 'COMPLETED',
    completionEvidence: { proofType: 'USER_ATTESTATION' },
  }).success, true);
});

test('schema creates a property-scoped pilot, plan, and responsibility-bearing tasks', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model NewHomePilotAssessment/);
  assert.match(schema, /propertyId\s+String\s+@unique/);
  assert.match(schema, /model NewHomeSetupPlan/);
  assert.match(schema, /model NewHomeSetupTask/);
  assert.match(schema, /responsibility\s+NewHomeResponsibility/);
  assert.match(schema, /@@unique\(\[planId, actionKey\]\)/);
  assert.match(schema, /admissionDecision\s+NewHomePilotAdmissionDecision/);
  assert.match(schema, /reviewedByUserId\s+String\?/);
});

test('service enforces new-construction context and the selective pilot gate', () => {
  const service = read('../../src/services/newHomeSetup.service.ts');
  assert.match(service, /entryPath === 'NEW_HOME_SETUP'/);
  assert.match(service, /propertyOrigin === 'NEW_CONSTRUCTION'/);
  assert.match(service, /assessment\.decision !== 'ELIGIBLE'/);
  assert.match(service, /humanPolicyGateAllows\(assessment\.admissionDecision === 'ADMITTED'/);
  assert.match(service, /APP_CONFIG\.enforceHumanPolicyApprovals/);
  assert.match(service, /LOW_DEMAND_SIGNAL/);
  assert.match(service, /LOW_ENGAGEMENT_INTENT/);
});

test('foundation covers the complete new-home horizon and reuses evidence systems', () => {
  const service = read('../../src/services/newHomeSetup.service.ts');
  for (const action of ['walkthrough:capture', 'punch-list:builder', 'warranty:terms', 'systems:registration', 'inspection:30-day', 'inspection:90-day', 'inspection:one-year', 'recurring:handoff']) {
    assert.match(service, new RegExp(action));
  }
  assert.match(service, /prisma\.document\.count/);
  assert.match(service, /prisma\.warranty\.count/);
  assert.match(service, /prisma\.inventoryItem\.count/);
  assert.match(service, /prisma\.inspectionReport\.count/);
});

test('API and dashboard expose the specialized path without a migration script', () => {
  const routes = read('../../src/routes/newHomeSetup.routes.ts');
  const dashboard = read('../../../frontend/src/app/(dashboard)/dashboard/page.tsx');
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/new-home-plan/page.tsx');
  assert.match(routes, /pilot-assessment/);
  assert.match(routes, /tasks\/:taskId/);
  assert.match(dashboard, /isNewHomeMode/);
  assert.match(dashboard, /new-home-plan/);
  assert.match(page, /Selective pilot gate/);
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  assert.deepEqual(fs.readdirSync(migrationRoot).filter((entry) => /phase.?6|new.?home/i.test(entry)), []);
});

test('completion increment implements detailed rights, evidence, inspection, and handoff workflows', () => {
  const service = read('../../src/services/newHomeSetup.service.ts');
  const routes = read('../../src/routes/newHomeSetup.routes.ts');
  const homeFeed = read('../../src/services/homeActions.service.ts');
  const metrics = read('../../src/services/adminAnalytics/phase6PilotService.ts');
  const warrantyProcessor = read('../../src/services/newHomeWarrantyDeadline.service.ts');
  for (const model of ['NewHomePunchListItem', 'NewHomeBuilderResponse', 'NewHomeWarrantyRight', 'NewHomeSystemRegistration', 'NewHomeEvidenceRecord', 'NewHomeInspectionBundle']) {
    assert.match(read('../../prisma/schema.prisma'), new RegExp(`model ${model}`));
  }
  assert.match(service, /BUILDER_RESPONSE_AND_USER_VERIFICATION/);
  assert.match(service, /sourceCitation/);
  assert.match(warrantyProcessor, /NEW_HOME_WARRANTY_DEADLINE/);
  assert.match(service, /verificationSource: input\.status === 'CONFIRMED' \? 'NEW_HOME_REGISTRATION'/);
  assert.match(service, /new-home-first-year-handoff/);
  assert.match(service, /homeEvent\.create/);
  assert.match(routes, /inspection-bundles/);
  assert.match(routes, /acceptance-status/);
  assert.match(homeFeed, /NewHomeSetupService\.ensureRecurringHandoff/);
  assert.match(metrics, /INSUFFICIENT_EVIDENCE/);
  assert.match(metrics, /phase6-v2/);
  for (const criterion of ['milestoneCompletion', 'unresolvedBlockerHoursPerJourney', 'recommendationComprehension', 'verifiedOutcomeWriteBack', 'providerQualityVisibility', 'recurringCareConversion']) {
    assert.match(metrics, new RegExp(criterion));
  }
});

test('controlled expansion is operator admitted, monitored out of band, and database accepted', () => {
  const adminRoutes = read('../../src/routes/adminAnalytics.routes.ts');
  const warrantyProcessor = read('../../src/services/newHomeWarrantyDeadline.service.ts');
  const worker = read('../../../workers/src/worker.ts');
  const workerNotification = read('../../../workers/stubs/notification-service.ts');
  const adminPage = read('../../../frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx');
  const newHomePage = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/new-home-plan/page.tsx');
  const routePolicy = read('../../../frontend/scripts/product-framework/check-route-disposition.mjs');
  const packageJson = JSON.parse(read('../../package.json'));

  assert.match(adminRoutes, /phase6-pilot\/properties\/:propertyId\/admission/);
  assert.match(adminRoutes, /SYSTEM_SETTINGS_MANAGE/);
  assert.match(warrantyProcessor, /noticeDeadlineAt/);
  assert.match(warrantyProcessor, /await NotificationService\.create[\s\S]+notifiedAt = now/);
  assert.match(worker, /new-home-warranty-deadlines/);
  assert.match(workerNotification, /prisma\.notification\.create/);
  assert.match(workerNotification, /channel: 'IN_APP'/);
  assert.match(adminPage, /Phase 6 controlled pilot and expansion gate/);
  assert.match(newHomePage, /Builder response history|item\.responses/);
  assert.match(newHomePage, /Inspection preparation bundles/);
  assert.match(routePolicy, /new-home-plan/);
  assert.equal(packageJson.scripts['acceptance:phase6'], 'node --test tests/integration/phase6NewHomeControlledPilot.db.test.js');
});
