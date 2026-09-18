const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// B04 design (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md,
// explicit user design decision): server-owned mutation-impact map for
// XREC-001 ("refreshes or invalidates each source result whose membership,
// totals, status or next actions may have changed"). Pure pieces extracted
// for direct unit testing, same convention as mergeEvidence/
// formatUnavailableHomeActionProducers -- the DB-heavy orchestration around
// them (refreshImpactedSiblingExecutions itself) is not independently
// testable without a live database, same STATIC-verification boundary
// applied throughout this audit series.
const {
  ASK_MUTATION_IMPACT_MAP,
  siblingOperationIdsForBuyerTaskMutation,
  selectSiblingRefreshTargets,
  capReconciledChildExecutions,
} = require('../../src/services/ask/askOrchestrator.service.ts');

test('BUYER_TASK_UPDATE declares BUYER_PLAN_STATUS and BUYER_DEADLINES as siblings', () => {
  assert.deepEqual(ASK_MUTATION_IMPACT_MAP.BUYER_TASK_UPDATE, ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']);
});

// B03 fix: BUYER_TASK_COMPLETE previously called no reconciliation
// mechanism at all -- shares the same sibling set as BUYER_TASK_UPDATE
// since completing a task changes the same BUYER_PLAN_STATUS/
// BUYER_DEADLINES membership/counts a reschedule does.
test('BUYER_TASK_COMPLETE declares the same BUYER_PLAN_STATUS/BUYER_DEADLINES siblings', () => {
  assert.deepEqual(ASK_MUTATION_IMPACT_MAP.BUYER_TASK_COMPLETE, ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES']);
});

// P05 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
// reuses this exact mechanism for Claims -- neither confirm handler called
// any reconciliation at all before this fix (confirmed absent, not merely
// unverified, per the audit's own direct re-read of both function bodies).
test('CLAIM_FILE and CLAIM_TRANSITION both declare INCIDENT_CONTINUATION as their sole sibling', () => {
  assert.deepEqual(ASK_MUTATION_IMPACT_MAP.CLAIM_FILE, ['INCIDENT_CONTINUATION']);
  assert.deepEqual(ASK_MUTATION_IMPACT_MAP.CLAIM_TRANSITION, ['INCIDENT_CONTINUATION']);
});

test('a move task adds BUYER_MOVE_STATUS to the base sibling set', () => {
  const base = ASK_MUTATION_IMPACT_MAP.BUYER_TASK_UPDATE;
  assert.deepEqual(siblingOperationIdsForBuyerTaskMutation(base, 'MOVE'), ['BUYER_PLAN_STATUS', 'BUYER_DEADLINES', 'BUYER_MOVE_STATUS']);
});

test('a non-move task (or unknown/null taskType) leaves the base sibling set unchanged', () => {
  const base = ASK_MUTATION_IMPACT_MAP.BUYER_TASK_UPDATE;
  assert.deepEqual(siblingOperationIdsForBuyerTaskMutation(base, 'ACTION'), base);
  assert.deepEqual(siblingOperationIdsForBuyerTaskMutation(base, null), base);
  assert.deepEqual(siblingOperationIdsForBuyerTaskMutation(base, undefined), base);
});

test('selectSiblingRefreshTargets excludes rows with no operationId', () => {
  const candidates = [{ id: 'a', operationId: null }, { id: 'b', operationId: 'BUYER_DEADLINES' }];
  const result = selectSiblingRefreshTargets(candidates, () => false);
  assert.deepEqual(result.map((item) => item.id), ['b']);
});

test('selectSiblingRefreshTargets excludes rows whose operationId is a registered domain command (defense in depth)', () => {
  const candidates = [{ id: 'a', operationId: 'BUYER_TASK_UPDATE' }, { id: 'b', operationId: 'BUYER_DEADLINES' }];
  const isCommandOperation = (operationId) => operationId === 'BUYER_TASK_UPDATE';
  const result = selectSiblingRefreshTargets(candidates, isCommandOperation);
  assert.deepEqual(result.map((item) => item.id), ['b']);
});

test('selectSiblingRefreshTargets keeps only the first (most recent, given pre-sorted input) row per operationId', () => {
  const candidates = [
    { id: 'newest', operationId: 'BUYER_DEADLINES' },
    { id: 'older', operationId: 'BUYER_DEADLINES' },
    { id: 'plan-status', operationId: 'BUYER_PLAN_STATUS' },
  ];
  const result = selectSiblingRefreshTargets(candidates, () => false);
  assert.deepEqual(result.map((item) => item.id), ['newest', 'plan-status']);
});

test('selectSiblingRefreshTargets returns an empty array for an empty input', () => {
  assert.deepEqual(selectSiblingRefreshTargets([], () => false), []);
});

// AskExecutionResponseSchema's childExecutions caps at 3 (ask.contract.ts).
// 1 explicit source + 3 declared siblings (BUYER_PLAN_STATUS/BUYER_DEADLINES/
// BUYER_MOVE_STATUS on a move-task reschedule) is the real worst case this
// guards against -- exceeding the cap would fail response validation on an
// otherwise-successful mutation.
test('capReconciledChildExecutions keeps the explicit source and truncates siblings to stay at the cap of 3', () => {
  const source = ['source'];
  const siblings = ['plan-status', 'deadlines', 'move-status'];
  assert.deepEqual(capReconciledChildExecutions(source, siblings), ['source', 'plan-status', 'deadlines']);
});

test('capReconciledChildExecutions never drops the explicit source, even with a full sibling set', () => {
  const result = capReconciledChildExecutions(['source'], ['a', 'b', 'c', 'd', 'e']);
  assert.equal(result[0], 'source');
  assert.equal(result.length, 3);
});

test('capReconciledChildExecutions with no explicit source still caps siblings at 3', () => {
  assert.deepEqual(capReconciledChildExecutions([], ['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
});

test('capReconciledChildExecutions below the cap keeps everything', () => {
  assert.deepEqual(capReconciledChildExecutions(['source'], ['sibling']), ['source', 'sibling']);
});
