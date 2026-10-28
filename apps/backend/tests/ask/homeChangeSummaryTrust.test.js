const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Regression: the found-changes answer leads with its own 'home-change-summary' SUMMARY block, then one CHANGE_SUMMARY per change. The trust
// validator and the typed answer contract both used to demand a CHANGE_SUMMARY/EMPTY_STATE first block, so every answer with changes was replaced
// by "I couldn't verify this answer".

const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { matchesHomeChangeSummaryAnswerContract } = require('../../src/services/ask/askHomeChangeIntent.ts');

const OP = 'HOME_CHANGE_SUMMARY';
const evidence = { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'home-change.summary', operationId: OP, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-28T00:00:00.000Z' }] } };
const summary = { type: 'SUMMARY', id: 'home-change-summary', title: '1 material change in the last 30 days', body: 'Reconciled against the Home Action feed.', tone: 'DEFAULT', actions: [] };
const change = {
  type: 'CHANGE_SUMMARY', id: 'home-change-c1', title: 'Roof updated', source: 'Roof', changeType: 'SOURCE_RECORD_REVISED', summary: 'Roof details changed.',
  effectiveAt: null, detectedAt: '2026-10-27T00:00:00.000Z', materiality: 'IMPORTANT', materialityReasonCodes: [],
  whyItMatters: 'This change is worth reviewing soon.', dateLabel: 'Recorded', confidence: 1, linkedAction: null, reviewAction: null,
  actions: [{ id: 'home-change-older-history', label: 'View older home history', interactionType: 'START_WORKFLOW', message: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS', outcomeKey: 'REVIEW_HOME_TIMELINE', style: 'QUIET' }],
};
const result = (blocks) => ({ status: 'ANSWERED', reasonCode: 'HOME_CHANGE_SUMMARY_FOUND', blocks, suggestions: [], parameters: evidence });

test('an answer with changes keeps its leading summary and passes the trust validator', () => {
  const out = validateAskAnswerTrust({ question: 'What changed around my home lately?', operationId: OP, propertyId: 'prop-1', result: result([summary, change]) });
  assert.equal(out.trust.outcome, 'PASS');
  assert.equal(out.trust.checks.questionCoverage, 'PASS');
  assert.equal(out.result.status, 'ANSWERED');
  assert.deepEqual(out.result.blocks.map((b) => b.id), ['home-change-summary', 'home-change-c1']);
  assert.equal(out.result.blocks[1].actions[0].operationId, 'HOME_TIMELINE_EVENTS');
});

test('the typed answer contract accepts summary + changes, and still rejects a summary with no change', () => {
  assert.equal(matchesHomeChangeSummaryAnswerContract(result([summary, change])), true);
  assert.equal(matchesHomeChangeSummaryAnswerContract(result([summary])), false);
});

test('a different SUMMARY block is not accepted as this operation\'s direct answer', () => {
  const other = { ...summary, id: 'some-other-summary' };
  assert.equal(matchesHomeChangeSummaryAnswerContract(result([other, change])), false);
});
