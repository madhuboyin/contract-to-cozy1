const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-020, FRD v1.91): the buyer closing-day workspace's five checks as a
// progress ring. The full BUYER_CLOSING_DAY_READINESS handler loads the buyer plan context and the closing-day service,
// so this drives the builder with real-shaped workspace and blockers, then the answer checker over a handler-shaped answer.

const { buyerClosingDayProgress } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');

const PLAN = '/dashboard/properties/p1/buyer-plan';
const workspace = (overrides = {}) => ({ identificationReady: true, requiredDocumentsReady: true, fundsReadinessReviewed: false, blockersReviewed: false, questionsResolved: false, ...overrides });
const blocker = (id, title) => ({ id, title, status: 'PENDING' });

test('the ring is the workspace\'s own count of done checks, with what is counted stated, and tiles for done, not yet and blockers', () => {
  const ring = buyerClosingDayProgress(workspace(), [blocker('b1', 'Lender needs pay stubs')], PLAN);
  assert.equal(ring.id, 'buyer-closing-day-progress');
  assert.equal(ring.percent, 40);
  assert.equal(ring.basis, '2 of 5 closing-day checks done');
  assert.deepEqual(ring.metrics.map((entry) => [entry.label, entry.value, entry.tone]), [['Done', '2', 'DEFAULT'], ['Not yet', '3', 'CAUTION'], ['Blockers', '1', 'CAUTION']]);
  AskPresentationBlockSchema.parse(ring);
});

test('next steps are blockers first, then the checks still to do, at most three, each linking to the plan, with no actions', () => {
  const ring = buyerClosingDayProgress(workspace(), [blocker('b1', 'Lender needs pay stubs'), blocker('b2', 'Insurance binder missing')], PLAN);
  assert.deepEqual(ring.nextSteps.map((step) => step.title), ['Lender needs pay stubs', 'Insurance binder missing', 'Funds readiness reviewed']);
  assert.ok(ring.nextSteps.every((step) => step.href === PLAN && (step.actions ?? []).length === 0));
  const noBlockers = buyerClosingDayProgress(workspace({ fundsReadinessReviewed: true }), [], PLAN);
  assert.deepEqual(noBlockers.nextSteps.map((step) => step.title), ['Blockers reviewed', 'Questions resolved']);
  assert.equal(noBlockers.metrics[2].tone, 'DEFAULT');
});

test('all five done is 100 percent with no steps; no workspace means no ring', () => {
  const done = buyerClosingDayProgress(workspace({ fundsReadinessReviewed: true, blockersReviewed: true, questionsResolved: true }), [], PLAN);
  assert.equal(done.percent, 100);
  assert.deepEqual(done.nextSteps, []);
  assert.equal(buyerClosingDayProgress(null, [], PLAN), null);
});

test('PROGRESS is allowed for the operation in the registry and the buyer closing skill', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.BUYER_CLOSING_DAY_READINESS.allowedBlockTypes.includes('PROGRESS'));
  assert.ok(getSkillForOperation('BUYER_CLOSING_DAY_READINESS').allowedResultBlocks.includes('PROGRESS'));
});

test('the answer checker, with answer relevance on, keeps the closing-day answer with the ring', () => {
  const answer = {
    status: 'READY_WITH_LIMITATIONS', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'buyer-closing-day-summary', title: '1 blocker remains before closing day', tone: 'CAUTION', actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: PLAN, style: 'PRIMARY' }],
        body: 'Confirm your appointment, identification, required documents, funds readiness, and questions before closing day.' },
      buyerClosingDayProgress(workspace(), [blocker('b1', 'Lender needs pay stubs')], PLAN),
      { type: 'GROUPED_LIST', filters: [], id: 'buyer-closing-day-blockers', title: 'Blockers before closing day', description: 'Open or blocking tasks recorded on the Buyer Plan.',
        sections: [{ id: 'blockers', title: 'Blockers', count: 1, items: [{ id: 'b1', title: 'Lender needs pay stubs', description: null, meta: [], status: 'PENDING', href: PLAN }] }], actions: [] },
      { type: 'BOUNDARY', id: 'buyer-closing-day-wire-boundary', title: 'Wire-fraud protection', body: 'Never trust changed emailed wire instructions.', severity: 'INFO', suggestions: [] },
    ],
  };
  const question = 'What do I need for closing day?';
  const checked = validateAskAnswerTrustPipeline({
    question, operationId: 'BUYER_CLOSING_DAY_READINESS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('BUYER_CLOSING_DAY_READINESS')]),
  });
  assert.equal(checked.semantic.outcome, 'PASS', JSON.stringify(checked.semantic));
  assert.equal(checked.result.status, 'READY_WITH_LIMITATIONS');
  assert.ok(checked.result.blocks.some((block) => block.type === 'PROGRESS'));
});
