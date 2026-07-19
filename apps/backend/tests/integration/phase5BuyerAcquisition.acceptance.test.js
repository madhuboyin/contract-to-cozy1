const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerLifecycleUpdateSchema,
  BuyerFindingDispositionInputSchema,
  BuyerDocumentVerificationInputSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('lifecycle anchors are validated and finding dispositions are explicit', () => {
  assert.equal(BuyerLifecycleUpdateSchema.safeParse({}).success, false);
  assert.equal(BuyerLifecycleUpdateSchema.safeParse({ targetCloseDate: '2026-08-15T12:00:00.000Z' }).success, true);
  for (const disposition of ['VERIFIED_FACT', 'PRE_CLOSE_NEGOTIATION', 'POST_CLOSE_ACTION', 'DISMISSED']) {
    assert.equal(BuyerFindingDispositionInputSchema.safeParse({ disposition }).success, true);
  }
  assert.equal(BuyerDocumentVerificationInputSchema.safeParse({ status: 'VERIFIED' }).success, true);
  assert.equal(BuyerDocumentVerificationInputSchema.safeParse({ status: 'UNVERIFIED' }).success, false);
});

test('inspection promotion creates idempotent task and per-finding guidance lineage', () => {
  const service = read('../../src/services/buyerAcquisition.service.ts');
  assert.match(service, /buyer:inspection-finding:\$\{finding\.id\}/);
  assert.match(service, /checklistId_actionKey/);
  assert.match(service, /sourceEntityType: 'INSPECTION_FINDING'/);
  assert.match(service, /duplicateGroupKey: `\$\{propertyId\}:inspection-finding:\$\{finding\.id\}`/);
  assert.match(service, /buyerGuidanceJourneyId: journeyId/);
});

test('day-91 handoff is idempotent and runs from the recurring Home feed boundary', () => {
  const service = read('../../src/services/buyerAcquisition.service.ts');
  const homeFeed = read('../../src/services/homeActions.service.ts');
  assert.match(service, /90 \* DAY_MS/);
  assert.match(service, /propertyMaintenanceTask\.upsert/);
  assert.match(service, /buyer-handoff:\$\{task\.actionKey\}/);
  assert.match(service, /handoffCompletedAt/);
  assert.match(read('../../src/services/HomeBuyerTask.service.ts'), /proofType: 'USER_ATTESTATION'/);
  assert.match(homeFeed, /ensureRecurringHandoff\(userId, propertyId\)/);
});

test('Phase 5 API and UI cover evidence, lifecycle, household assignment, and acceptance status', () => {
  const routes = read('../../src/routes/homeBuyerTask.routes.ts');
  const adminRoutes = read('../../src/routes/adminAnalytics.routes.ts');
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx');
  for (const route of ['evidence-review', 'lifecycle', 'documents/:documentId/verification', 'findings/:findingId/disposition', 'handoff', 'acceptance-status']) {
    assert.match(routes, new RegExp(route.replace(/[/:]/g, (value) => value === '/' ? '\\/' : value)));
  }
  assert.match(page, /listHouseholdMembers/);
  assert.match(page, /Complete with evidence/);
  assert.match(page, /FINDING_DECISIONS/);
  assert.match(page, /getBuyerAcceptanceStatus/);
  assert.match(adminRoutes, /admin\/analytics\/phase5-pilot/);
});

test('schema stores disposition, evidence, lifecycle, and handoff lineage without a migration script', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /buyerDisposition\s+BuyerFindingDisposition/);
  assert.match(schema, /completionEvidenceJson\s+Json\?/);
  assert.match(schema, /anchorOffsetDays\s+Int\?/);
  assert.match(schema, /handedOffMaintenanceTaskId\s+String\?/);
  assert.match(schema, /handoffCompletedAt\s+DateTime\?/);
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  assert.deepEqual(fs.readdirSync(migrationRoot).filter((entry) => /phase.?5|buyer.?acquisition|90.?day/i.test(entry)), []);
});
