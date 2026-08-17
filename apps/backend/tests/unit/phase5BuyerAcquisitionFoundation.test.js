const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BuyerPlanTaskInputSchema,
  BuyerImportReadinessSchema,
  BuyerFindingDispositionInputSchema,
  BuyerMilestoneInputSchema,
  BuyerContactInputSchema,
  BuyerTaskCompletionInputSchema,
} = require('../../src/productFramework/buyerAcquisition.contract.ts');
const {
  assertBuyerJourneyStageTransition,
  canTransitionBuyerJourneyStatus,
  deriveBuyerJourneyStage,
} = require('../../src/productFramework/buyerJourneyLifecycle.contract.ts');

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

test('buyer finding review contract has explicit durable dispositions', () => {
  for (const disposition of ['VERIFIED_FACT', 'PRE_CLOSE_NEGOTIATION', 'POST_CLOSE_ACTION', 'DISMISSED']) {
    assert.equal(BuyerFindingDispositionInputSchema.safeParse({ disposition }).success, true);
  }
});

test('Slice 0 contracts reject removed phases and validate milestones, contacts, and evidence completion', () => {
  assert.equal(BuyerPlanTaskInputSchema.safeParse({ title: 'Legacy task', phase: 'PRE_CLOSE' }).success, false);
  assert.equal(BuyerPlanTaskInputSchema.safeParse({ title: 'Review inspection', phase: 'DUE_DILIGENCE' }).success, true);
  assert.equal(BuyerMilestoneInputSchema.safeParse({ milestoneKey: 'buyer:milestone:seller-credit', type: 'CUSTOM' }).success, false);
  assert.equal(BuyerMilestoneInputSchema.safeParse({ milestoneKey: 'buyer:milestone:seller-credit', type: 'CUSTOM', customLabel: 'Seller credit response' }).success, true);
  assert.equal(BuyerContactInputSchema.safeParse({ role: 'LENDER', name: 'Taylor Smith', extra: true }).success, false);
  assert.equal(BuyerTaskCompletionInputSchema.safeParse({ method: 'DOCUMENT' }).success, false);
  assert.equal(BuyerTaskCompletionInputSchema.safeParse({ method: 'DOCUMENT', documentId: 'document-1' }).success, true);
});

test('buyer journey transitions require explicit close evidence and never infer close from a date', () => {
  assert.equal(deriveBuyerJourneyStage({
    currentStage: 'DUE_DILIGENCE',
    ownershipState: 'UNDER_CONTRACT',
    closingPreparationStarted: true,
    closeConfirmed: false,
    daysSinceOwnershipStart: 45,
  }), 'CLOSING_PREP');
  assert.equal(deriveBuyerJourneyStage({
    currentStage: 'CLOSING_PREP',
    ownershipState: 'UNDER_CONTRACT',
    closeConfirmed: false,
  }), 'CLOSING_PREP');
  assert.equal(deriveBuyerJourneyStage({
    currentStage: 'CLOSING_PREP',
    closeConfirmed: true,
    daysSinceOwnershipStart: 0,
  }), 'CLOSED');
  assert.doesNotThrow(() => assertBuyerJourneyStageTransition('CLOSING_PREP', 'CLOSED'));
  assert.throws(() => assertBuyerJourneyStageTransition('DUE_DILIGENCE', 'CLOSED'), /INVALID_BUYER_TRANSITION/);
  assert.equal(canTransitionBuyerJourneyStatus('PAUSED', 'ACTIVE'), true);
  assert.equal(canTransitionBuyerJourneyStatus('CANCELLED', 'ACTIVE'), false);
});

test('Prisma buyer plan is property-scoped and source-traceable', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model HomeBuyerChecklist[\s\S]*propertyId\s+String\s+@unique/);
  assert.doesNotMatch(schema, /model HomeBuyerChecklist[\s\S]*homeownerProfileId\s+String\s+@unique[\s\S]*model HomeBuyerTask/);
  assert.match(schema, /model HomeBuyerTask[\s\S]*@@unique\(\[checklistId, actionKey\]\)/);
  assert.match(schema, /model HomeBuyerTask[\s\S]*sourceType\s+BuyerTaskSourceType/);
  assert.match(schema, /model BuyerJourneyMilestone/);
  assert.match(schema, /model BuyerJourneyContact/);
  const buyerPhaseEnum = schema.match(/enum BuyerPlanPhase\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(buyerPhaseEnum, /\bPRE_CLOSE\b/);
  assert.match(schema, /enum BuyerFindingDisposition\s*\{[\s\S]*?PRE_CLOSE_NEGOTIATION/);
});

test('Phase 5 endpoints and callers require property context', () => {
  const routes = read('../../src/routes/homeBuyerTask.routes.ts');
  const client = read('../../../frontend/src/lib/api/client.ts');
  assert.match(routes, /properties\/:propertyId\/checklist/);
  assert.match(routes, /properties\/:propertyId\/import-readiness/);
  assert.match(client, /getHomeBuyerChecklist\(propertyId: string\)/);
  assert.match(client, /home-buyer-tasks\/properties\/\$\{propertyId\}/);
});

test('buyer plan reads are viewer-safe and do not create or transition lifecycle state', () => {
  const service = read('../../src/services/HomeBuyerTask.service.ts');
  const controller = read('../../src/controllers/homeBuyerTask.controller.ts');
  const readMethod = service.match(/static async getChecklist\([\s\S]*?\n  }/)?.[0] ?? '';
  assert.match(readMethod, /'VIEWER'/);
  assert.match(readMethod, /homeBuyerChecklist\.findUnique/);
  assert.doesNotMatch(readMethod, /\.create\(|\.update\(|getOrCreateChecklist/);
  assert.match(controller, /HomeBuyerTaskService\.getChecklist/);
  assert.doesNotMatch(controller.match(/const handleGetChecklist[\s\S]*?\n};/)?.[0] ?? '', /ensureRecurringHandoff/);
});

test('Phase 5 does not add a database migration script', () => {
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  const matches = fs.readdirSync(migrationRoot).filter((entry) => /phase.?5|buyer.?acquisition|90.?day/i.test(entry));
  assert.deepEqual(matches, []);
});
