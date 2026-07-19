const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerPlanTaskInputSchema,
  BuyerImportReadinessSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('buyer task contract preserves timing, priority, assignment, and evidence lineage', () => {
  const task = BuyerPlanTaskInputSchema.parse({
    title: 'Evaluate foundation finding',
    actionKey: 'buyer:inspection:finding-1',
    phase: 'FIRST_30_DAYS',
    priority: 'NOW',
    dueAt: '2026-08-01T12:00:00.000Z',
    assignedToUserId: 'user-1',
    lineage: {
      sourceType: 'INSPECTION_FINDING',
      sourceEntityType: 'INSPECTION_FINDING',
      sourceEntityId: 'finding-1',
      guidanceJourneyId: null,
      homeActionKey: 'inspection:finding-1',
    },
  });
  assert.equal(task.phase, 'FIRST_30_DAYS');
  assert.equal(task.priority, 'NOW');
  assert.equal(task.lineage.sourceEntityId, 'finding-1');
});

test('import readiness contract returns an explicit next step', () => {
  const readiness = BuyerImportReadinessSchema.parse({
    propertyId: 'property-1',
    inspectionReports: { total: 1, reviewPending: 1, confirmed: 0, openMaterialFindings: 0 },
    documents: { total: 2, verified: 1, unverified: 1 },
    nextRecommendedStep: 'REVIEW_EXTRACTION',
  });
  assert.equal(readiness.nextRecommendedStep, 'REVIEW_EXTRACTION');
});

test('Prisma buyer plan is property-scoped and source-traceable', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model HomeBuyerChecklist[\s\S]*propertyId\s+String\s+@unique/);
  assert.doesNotMatch(schema, /model HomeBuyerChecklist[\s\S]*homeownerProfileId\s+String\s+@unique[\s\S]*model HomeBuyerTask/);
  assert.match(schema, /model HomeBuyerTask[\s\S]*@@unique\(\[checklistId, actionKey\]\)/);
  assert.match(schema, /model HomeBuyerTask[\s\S]*sourceType\s+BuyerTaskSourceType/);
});

test('Phase 5 endpoints and callers require property context', () => {
  const routes = read('../../src/routes/homeBuyerTask.routes.ts');
  const client = read('../../../frontend/src/lib/api/client.ts');
  assert.match(routes, /properties\/:propertyId\/checklist/);
  assert.match(routes, /properties\/:propertyId\/import-readiness/);
  assert.match(client, /getHomeBuyerChecklist\(propertyId: string\)/);
  assert.match(client, /home-buyer-tasks\/properties\/\$\{propertyId\}/);
});

test('Phase 5 does not add a database migration script', () => {
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  const matches = fs.readdirSync(migrationRoot).filter((entry) => /phase.?5|buyer.?acquisition|90.?day/i.test(entry));
  assert.deepEqual(matches, []);
});
