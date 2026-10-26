const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { isRenovationCaseOverviewRequest, renovationCaseRows, renovationNextStep, renovationLifecycleLabel } = require('../../src/services/ask/support/renovationCaseOverview.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const caseRow = (id, name, lifecycle, extra = {}) => ({ id, name, lifecycle, updatedAt: new Date('2026-10-20T00:00:00Z'), ...extra });

test('only a request for the cases themselves is the overview', () => {
  for (const yes of ['Show my renovation cases', 'show my renovations', 'List all renovations.', 'What are my renovation cases?', 'my remodel plans']) assert.equal(isRenovationCaseOverviewRequest(yes), true, yes);
  for (const no of ['Which renovations add the most value?', 'my renovation costs too much', 'Is my renovation ready to start?', 'What renovations should I do']) assert.equal(isRenovationCaseOverviewRequest(no), false, no);
});

test('the overview request routes to the renovation case answer, and the start command still wins', () => {
  assert.equal(resolveAskOperation('Show my renovation cases').operationId, 'RENOVATION_PERMIT_READINESS');
  assert.equal(resolveAskOperation('Start a renovation case.').operationId, 'RENOVATION_CASE_START');
});

test('next steps follow the lifecycle and say which ones Ask cannot do yet', () => {
  assert.deepEqual(renovationNextStep('REQUIREMENTS_RESEARCH'), { title: 'Determine permit, HOA and safety requirements', inAsk: false });
  assert.deepEqual(renovationNextStep('PREPARING_TO_START', 'NOT_READY', 2), { title: 'Resolve 2 blocking readiness items', inAsk: true });
  assert.equal(renovationNextStep('PREPARING_TO_START', 'READY').title, 'Create or open the execution project');
  assert.equal(renovationNextStep('PREPARING_TO_START', null).title, 'Evaluate start readiness');
  assert.equal(renovationLifecycleLabel('APPROVALS_IN_PROGRESS'), 'Approvals in progress');
});

test('each case row carries its stage, readiness, next step and its own action, except the one detailed below', () => {
  const rows = renovationCaseRows([
    caseRow('a', 'Kitchen remodel', 'PREPARING_TO_START', { readinessSummary: { state: 'NOT_READY', blockingItems: 3 }, currentScopeVersion: { approvalStatus: 'APPROVED' } }),
    caseRow('b', 'Deck', 'REQUIREMENTS_RESEARCH'),
  ], 'a');
  assert.deepEqual(rows[0].meta, ['Preparing to start', 'Not ready to start', 'Scope approved', 'Detailed below']);
  assert.equal(rows[0].actions, undefined);
  assert.match(rows[0].description, /Resolve 3 blocking readiness items/);
  assert.deepEqual(rows[1].meta, ['Researching requirements', 'Readiness not evaluated']);
  assert.match(rows[1].description, /not currently available in Ask/);
  assert.equal(rows[1].actions[0].message, 'Is my renovation Deck ready to start?');
  assert.equal(rows[1].actions[0].operationId, 'RENOVATION_PERMIT_READINESS');
});

test('the case list is schema-valid and its row actions survive the answer-trust validator', () => {
  const items = renovationCaseRows([caseRow('a', 'Kitchen', 'IDEA'), caseRow('b', 'Deck', 'IDEA')], 'a');
  const list = { type: 'GROUPED_LIST', filters: [], id: 'renovation-cases', title: 'Your renovation cases', sections: [{ id: 'cases', title: 'Renovation cases', count: 2, items }], actions: [] };
  assert.ok(AskPresentationBlockSchema.safeParse(list).success);
  const result = {
    status: 'ANSWERED', suggestions: [], blocks: [{ type: 'SUMMARY', id: 'renovation-cases-summary', title: 'You have 2 renovation cases', body: 'Listed with their stage.', tone: 'DEFAULT', actions: [] }, list],
    parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'renovation-permit.readiness', operationId: 'RENOVATION_PERMIT_READINESS', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-26T00:00:00.000Z' }] } },
  };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my renovation cases', operationId: 'RENOVATION_PERMIT_READINESS', result, propertyId: 'p1' });
  const kept = validated.blocks.find((block) => block.id === 'renovation-cases').sections[0].items.flatMap((item) => item.actions ?? []);
  assert.equal(kept.length, 1);
});
