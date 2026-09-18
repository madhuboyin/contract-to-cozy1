const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005 (external review, item 2 and
// item 4's "focused tests for preservation, filter transitions"). Both
// functions under test are pure (no DB access), so this imports them
// directly from askOrchestrator.service.ts rather than mocking prisma --
// unlike capabilityInvokePolicyEnforcement.test.js, nothing here executes a
// handler body that would touch the database.
const {
  preservedExecutionHistory,
  mergeMaintenanceViewContinuation,
  resolveMaintenanceCollectionOffset,
} = require('../../src/services/ask/askOrchestrator.service.ts');

test('preservedExecutionHistory stamps a fresh original when the row has no prior result at all', () => {
  const freshBlocks = [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }];
  const history = preservedExecutionHistory(null, freshBlocks);
  assert.deepEqual(history.originalResponse.blocks, freshBlocks);
  assert.equal(history.continuesExecutionId, null);
  assert.ok(history.originalResponse.observedAt);
});

test('preservedExecutionHistory keeps an already-stamped original forever, never the new write\'s own blocks', () => {
  const original = { blocks: [{ type: 'SUMMARY', id: 'orig', title: 'Original', body: 'b', tone: 'DEFAULT', actions: [] }], observedAt: '2026-01-01T00:00:00.000Z' };
  const existing = { originalResponse: original, continuesExecutionId: 'exec-A' };
  const freshBlocks = [{ type: 'WORKFLOW_PROGRESS', id: 'expired', title: 'Expired', status: 'EXPIRED', description: 'd', details: [], actions: [] }];
  const history = preservedExecutionHistory(existing, freshBlocks);
  assert.deepEqual(history.originalResponse, original);
  assert.equal(history.continuesExecutionId, 'exec-A');
});

test('preservedExecutionHistory never mislabels a fresh error/expiry payload as original when a real previous answer already existed', () => {
  // A row from before this policy existed (or a write site it hasn't
  // reached): no originalResponse snapshot, but a real previous answer sat
  // in resultJson.blocks. The external review's specific complaint -- this
  // must become the original, not whatever error blocks this write is
  // about to apply.
  const previousAnswer = [{ type: 'SUMMARY', id: 'answer', title: 'Here is what is pending', body: 'b', tone: 'DEFAULT', actions: [] }];
  const existing = { blocks: previousAnswer };
  const errorBlocks = [{ type: 'ERROR_STATE', id: 'oops', title: 'This got interrupted', body: 'b', retryable: true, actions: [] }];
  const history = preservedExecutionHistory(existing, errorBlocks);
  assert.deepEqual(history.originalResponse.blocks, previousAnswer);
  assert.notDeepEqual(history.originalResponse.blocks, errorBlocks);
});

test('mergeMaintenanceViewContinuation leaves the message untouched when there is no prior view state', () => {
  const { effectiveMessage, isClearAllFilters } = mergeMaintenanceViewContinuation(null, 'Only show overdue tasks');
  assert.equal(effectiveMessage, 'Only show overdue tasks');
  assert.equal(isClearAllFilters, false);
});

test('mergeMaintenanceViewContinuation retains domain and date scope while a status chip replaces only the status dimension', () => {
  // External review finding: "Show HVAC maintenance due this month" ->
  // select Urgent -> select All open must retain HVAC + "this month" and
  // only ever change the status/priority word.
  const priorViewState = { domainScopePhrase: 'hvac', dateScopePhrase: 'this month' };
  const { effectiveMessage, isClearAllFilters } = mergeMaintenanceViewContinuation(priorViewState, 'Only show urgent tasks');
  assert.match(effectiveMessage, /hvac/i);
  assert.match(effectiveMessage, /this month/i);
  assert.match(effectiveMessage, /urgent/i);
  assert.equal(isClearAllFilters, false);
  // The prior turn's own overdue/urgent word must never leak forward --
  // only its domain/date phrases do. This message has neither, so a
  // re-parse of the merged text must not accidentally still say "overdue."
  assert.doesNotMatch(effectiveMessage, /overdue/i);
});

test('mergeMaintenanceViewContinuation switching All open after Urgent correctly clears the prior status word, not just appends a new one', () => {
  const priorViewState = { domainScopePhrase: 'hvac', dateScopePhrase: 'this month' };
  const { effectiveMessage } = mergeMaintenanceViewContinuation(priorViewState, 'Now show all open maintenance tasks');
  assert.match(effectiveMessage, /hvac/i);
  assert.match(effectiveMessage, /this month/i);
  // The regression this exists to catch: concatenating raw turn text meant
  // "urgent" or "overdue" from an earlier turn stayed matchable even after
  // switching to "All open." Merging from structured phrases instead means
  // neither word is present unless this exact message says so.
  assert.doesNotMatch(effectiveMessage, /\burgent\b/i);
  assert.doesNotMatch(effectiveMessage, /\boverdue\b/i);
});

test('mergeMaintenanceViewContinuation "Clear all filters" opts out of merging even with a prior view state', () => {
  const priorViewState = { domainScopePhrase: 'hvac', dateScopePhrase: 'this month' };
  const { effectiveMessage, isClearAllFilters } = mergeMaintenanceViewContinuation(priorViewState, 'Clear all filters and show all open maintenance tasks');
  assert.equal(isClearAllFilters, true);
  assert.doesNotMatch(effectiveMessage, /hvac/i);
  assert.doesNotMatch(effectiveMessage, /this month/i);
});

test('refreshing a Clear all filters result does not replay the clear command', () => {
  const prior = { domainScopePhrase: null, dateScopePhrase: null };
  const result = mergeMaintenanceViewContinuation(prior, 'Clear all filters and show all open maintenance tasks', 'REFRESH');
  assert.equal(result.isClearAllFilters, false);
});

test('refresh retains the stored scope after a status refinement', () => {
  const result = mergeMaintenanceViewContinuation({ domainScopePhrase: 'hvac', dateScopePhrase: 'this month' }, 'Only show urgent tasks', 'REFRESH');
  assert.equal(result.effectiveMessage, 'hvac this month Only show urgent tasks');
  assert.equal(result.isClearAllFilters, false);
});

test('mergeMaintenanceViewContinuation retains room scope through a status-chip continuation like domain and date', () => {
  // External review [P2]: room scope was derived fresh every turn from
  // the message text but never stored in MaintenanceViewState, so unlike
  // domain/date it was silently dropped by any status chip -- "Show
  // Kitchen maintenance" -> "Urgent" used to broaden the result to every
  // room instead of staying scoped to the kitchen.
  const priorViewState = { domainScopePhrase: null, dateScopePhrase: null, roomScopePhrase: 'kitchen' };
  const { effectiveMessage, isClearAllFilters } = mergeMaintenanceViewContinuation(priorViewState, 'Only show urgent tasks');
  assert.match(effectiveMessage, /kitchen/i);
  assert.match(effectiveMessage, /urgent/i);
  assert.equal(isClearAllFilters, false);
});

test('mergeMaintenanceViewContinuation treats a stored row with no roomScopePhrase field the same as none set', () => {
  // A view state persisted before this field existed has no roomScopePhrase
  // key at all (not even null) -- must not throw and must behave exactly
  // like domain/date-only continuation.
  const priorViewState = { domainScopePhrase: 'hvac', dateScopePhrase: null };
  const { effectiveMessage } = mergeMaintenanceViewContinuation(priorViewState, 'Only show urgent tasks');
  assert.match(effectiveMessage, /hvac/i);
  assert.match(effectiveMessage, /urgent/i);
});

test('maintenance pagination reuses the exact effective query instead of parsing the paging control text', () => {
  const priorViewState = {
    domainScopePhrase: 'hvac', dateScopePhrase: 'this month', roomScopePhrase: 'basement',
    queryMessage: 'hvac this month basement Only show urgent tasks',
  };
  const result = mergeMaintenanceViewContinuation(priorViewState, 'Show next maintenance results', 'PAGINATION');
  assert.equal(result.effectiveMessage, priorViewState.queryMessage);
  assert.equal(result.isClearAllFilters, false);
});

test('maintenance pagination restores scope and status for older view state without queryMessage', () => {
  const result = mergeMaintenanceViewContinuation({
    domainScopePhrase: 'hvac', dateScopePhrase: 'this month', roomScopePhrase: 'basement', statusFilter: 'URGENT',
  }, 'Show next maintenance results', 'PAGINATION');
  assert.match(result.effectiveMessage, /hvac/i);
  assert.match(result.effectiveMessage, /this month/i);
  assert.match(result.effectiveMessage, /basement/i);
  assert.match(result.effectiveMessage, /urgent maintenance tasks/i);
  assert.doesNotMatch(result.effectiveMessage, /show next/i);
});

test('maintenance collection offsets page and clamp against canonical totals', () => {
  assert.equal(resolveMaintenanceCollectionOffset(121, 0, 'NEXT'), 50);
  assert.equal(resolveMaintenanceCollectionOffset(121, 50, 'NEXT'), 100);
  assert.equal(resolveMaintenanceCollectionOffset(121, 100, 'NEXT'), 100);
  assert.equal(resolveMaintenanceCollectionOffset(121, 100, 'PREVIOUS'), 50);
  assert.equal(resolveMaintenanceCollectionOffset(1, 50, 'CURRENT'), 0);
});
