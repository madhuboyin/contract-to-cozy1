// FR-FAST-10 / FR-GATE-8 slice 8: SAVED_RESULTS provisional read. The answers are built by the handler's own pure steps (resolveSavedState, buildSavedViewState, savedResultsFromPage) from a hand-made page; the registered handler's
// database read (getAskSavedPage) is NOT exercised here and nothing ran against a real DB.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveSavedState, buildSavedViewState, savedResultsFromPage } = require('../../src/services/ask/handlers/savedResults.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedSavedResultsVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const page = (rows = [], extra = {}) => ({ contractVersion: 'ask-saved-v1', propertyId: 'p1', generatedAt: '2026-11-13T12:00:00Z', archived: false, total: rows.length, totalScope: 'COMPLETE', partial: false, delivered: rows.length, nextCursor: null, truncated: false, counts: { active: rows.length, archived: 0 }, sort: { key: 'sortAt', label: 'Newest' }, query: { search: null, artifactType: null, freshness: null }, filterOptions: { types: [], freshness: [] }, types: [], rows, ...extra });
const built = (message, rows) => { const { state } = resolveSavedState(message, null); return savedResultsFromPage({ page: page(rows), state, viewState: buildSavedViewState(null, state) }); };
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'SAVED_RESULTS', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('SAVED_RESULTS')].flat()) });

test('SAVED_RESULTS is on the allowlist and started for plain saved questions only', () => {
  assert.ok('SAVED_RESULTS' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('SAVED_RESULTS'), true);
  for (const m of ['Show my saved results', 'What have I saved?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'SAVED_RESULTS', m); }
  for (const m of ['Archive my saved quote comparison', 'Delete my saved results']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'SAVED_RESULTS' && d.stage === 'PROVISIONAL', true, m); }
});
test('real saved answers are delivered in the view asked for', () => {
  for (const q of ['Show my saved results', 'Show my archived saved results', 'Find my saved roof quotes']) {
    const checked = gate(q, built(q, [])); assert.equal(checked.semantic.outcome, 'PASS', `${q}: ${JSON.stringify(checked.semantic)}`); assert.deepEqual(checked.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  }
  const restricted = { status: 'READY_WITH_LIMITATIONS', reasonCode: 'SAVED_RESTRICTED', blocks: [{ type: 'EMPTY_STATE', id: 'saved-results-restricted', title: 't', body: 'b', actions: [] }], suggestions: [] };
  assert.equal(groundedSavedResultsVerdict('Show my saved results', restricted).outcome, 'PASS');
});
test('a mismatched answer is withheld', () => {
  const active = built('Show my saved results', []); const archived = built('Show my archived saved results', []);
  const code = (q, a) => groundedSavedResultsVerdict(q, a).reasonCodes[1];
  assert.equal(code('Show my archived saved results', active), 'VIEW_DOES_NOT_MATCH_ARCHIVED_QUESTION'); assert.equal(code('Show my saved results', archived), 'ARCHIVED_VIEW_FOR_A_QUESTION_THAT_DID_NOT_ASK_FOR_IT');
  assert.equal(code('Find my saved roof quotes', active), 'SEARCH_WAS_NOT_APPLIED');
  assert.equal(code('When does my warranty expire?', active), 'QUESTION_NOT_ABOUT_SAVED_RESULTS'); assert.equal(code('Archive my saved results', active), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('Show my saved results', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  assert.equal(gate('Show my archived saved results', active).trust.outcome, 'CLARIFY');
});
