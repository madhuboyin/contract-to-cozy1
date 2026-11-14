// FR-FAST-10 / FR-GATE-8 slice 9: WORK_OVERVIEW provisional read. Answers are built by the handler's pure steps (resolveWorkState, buildWorkViewState, workOverviewFromPage) from a hand-made page; the registered handler's database
// read is NOT exercised here and nothing ran against a real DB.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveWorkState, buildWorkViewState, workOverviewFromPage } = require('../../src/services/ask/handlers/workOverview.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedWorkOverviewVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const VIEWS = ['NEEDS_YOU', 'ACTIVE', 'WAITING', 'SCHEDULED', 'COMPLETED', 'ARCHIVED'];
const page = (view) => ({ contractVersion: 'ask-work-v1', propertyId: 'p1', generatedAt: '2026-11-13T12:00:00Z', view, total: 0, totalScope: 'COMPLETE', partial: false, delivered: 0, nextCursor: null, truncated: false, viewCounts: Object.fromEntries(VIEWS.map((v) => [v, 0])), sort: { key: 'sortAt', label: 'Newest' }, query: { workType: null, status: null }, providers: [], filterOptions: { workTypes: [], statusesByWorkType: {} }, unscopedPending: [], rows: [] });
const built = (message) => { const { state } = resolveWorkState(message, null); return workOverviewFromPage({ page: page(state.view), state, viewState: buildWorkViewState(null, state) }); };
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'WORK_OVERVIEW', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('WORK_OVERVIEW')].flat()) });

test('WORK_OVERVIEW is on the allowlist and started for plain work questions only', () => {
  assert.ok('WORK_OVERVIEW' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('WORK_OVERVIEW'), true);
  for (const m of ['What needs me?', 'Show my open work']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'WORK_OVERVIEW', m); }
  for (const m of ['Cancel my pending work', 'Start the work on my roof']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'WORK_OVERVIEW' && d.stage === 'PROVISIONAL', true, m); }
});
test('real work answers are delivered in the view asked for', () => {
  for (const q of ['What needs me?', 'Show my open work', 'Show my scheduled work', 'Show my completed work']) {
    const checked = gate(q, built(q)); assert.equal(checked.semantic.outcome, 'PASS', `${q}: ${JSON.stringify(checked.semantic)}`); assert.deepEqual(checked.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  }
  const restricted = { status: 'READY_WITH_LIMITATIONS', reasonCode: 'WORK_RESTRICTED', blocks: [{ type: 'EMPTY_STATE', id: 'work-overview-restricted', title: 't', body: 'b', actions: [] }], suggestions: [] };
  assert.equal(groundedWorkOverviewVerdict('What needs me?', restricted).outcome, 'PASS');
});
test('a mismatched answer is withheld', () => {
  const needs = built('What needs me?'); const scheduled = built('Show my scheduled work');
  const code = (q, a) => groundedWorkOverviewVerdict(q, a).reasonCodes[1];
  assert.equal(code('Show my scheduled work', needs), 'VIEW_DOES_NOT_MATCH_THE_QUESTION'); assert.equal(code('What needs me?', scheduled), 'VIEW_DOES_NOT_MATCH_THE_QUESTION');
  assert.equal(code('When does my warranty expire?', needs), 'QUESTION_NOT_ABOUT_WORK'); assert.equal(code('Cancel the work that needs me', needs), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('What needs me?', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  assert.equal(gate('Show my scheduled work', needs).trust.outcome, 'CLARIFY');
});
