const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  isLifecycleTransitionAllowed,
  isContextTransitionAllowed,
  computeContextStatus,
} = require('../../../src/services/decisionPlatform/decisionThreadTransitions.ts');

test('legal lifecycle transitions are allowed (FRD §10.2)', () => {
  assert.equal(isLifecycleTransitionAllowed('OPEN', 'GATHERING_CONTEXT'), true);
  assert.equal(isLifecycleTransitionAllowed('OPEN', 'READY_TO_COMPARE'), true);
  assert.equal(isLifecycleTransitionAllowed('GATHERING_CONTEXT', 'READY_TO_COMPARE'), true);
  assert.equal(isLifecycleTransitionAllowed('READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE'), true);
  assert.equal(isLifecycleTransitionAllowed('RECOMMENDATION_AVAILABLE', 'ACTION_IN_PROGRESS'), true);
  assert.equal(isLifecycleTransitionAllowed('RECOMMENDATION_AVAILABLE', 'DECIDED'), true);
  assert.equal(isLifecycleTransitionAllowed('ACTION_IN_PROGRESS', 'DECIDED'), true);
  assert.equal(isLifecycleTransitionAllowed('DECIDED', 'COMPLETED'), true);
  assert.equal(isLifecycleTransitionAllowed('ABANDONED', 'OPEN'), true);
  assert.equal(isLifecycleTransitionAllowed('DECIDED', 'OPEN'), true);
  assert.equal(isLifecycleTransitionAllowed('COMPLETED', 'OPEN'), true);
  assert.equal(isLifecycleTransitionAllowed('ARCHIVED', 'OPEN'), true);
  // "Any state -> ARCHIVED" (FRD §10.2), including from every non-terminal state.
  for (const from of ['OPEN', 'GATHERING_CONTEXT', 'READY_TO_COMPARE', 'RECOMMENDATION_AVAILABLE', 'ACTION_IN_PROGRESS', 'DECIDED', 'COMPLETED', 'ABANDONED']) {
    assert.equal(isLifecycleTransitionAllowed(from, 'ARCHIVED'), true, `${from} -> ARCHIVED should be allowed`);
  }
});

test('illegal lifecycle transitions are rejected — this is the fail-closed P0 negative-test contract (FRD §10.2, §3.8)', () => {
  // Cannot skip straight from OPEN to a downstream state.
  assert.equal(isLifecycleTransitionAllowed('OPEN', 'RECOMMENDATION_AVAILABLE'), false);
  assert.equal(isLifecycleTransitionAllowed('OPEN', 'COMPLETED'), false);
  // A completed decision cannot be "abandoned" — it is already resolved.
  assert.equal(isLifecycleTransitionAllowed('COMPLETED', 'ABANDONED'), false);
  // An already-abandoned thread cannot be abandoned again.
  assert.equal(isLifecycleTransitionAllowed('ABANDONED', 'ABANDONED'), false);
  // ARCHIVED has exactly one legal outbound transition: reopening to OPEN.
  assert.equal(isLifecycleTransitionAllowed('ARCHIVED', 'ARCHIVED'), false);
  assert.equal(isLifecycleTransitionAllowed('ARCHIVED', 'DECIDED'), false);
  // GATHERING_CONTEXT cannot regress to OPEN or jump past READY_TO_COMPARE.
  assert.equal(isLifecycleTransitionAllowed('GATHERING_CONTEXT', 'OPEN'), false);
  assert.equal(isLifecycleTransitionAllowed('GATHERING_CONTEXT', 'RECOMMENDATION_AVAILABLE'), false);
});

test('legal context-health transitions are allowed (FRD §10.3)', () => {
  assert.equal(isContextTransitionAllowed('CURRENT', 'STALE'), true);
  assert.equal(isContextTransitionAllowed('CURRENT', 'CONFLICTED'), true);
  assert.equal(isContextTransitionAllowed('STALE', 'CONFLICTED'), true);
  assert.equal(isContextTransitionAllowed('CONFLICTED', 'STALE'), true);
  assert.equal(isContextTransitionAllowed('CONFLICTED', 'CURRENT'), true);
  assert.equal(isContextTransitionAllowed('STALE', 'CURRENT'), true);
});

test('illegal context-health transitions are rejected, including no-op self-transitions', () => {
  assert.equal(isContextTransitionAllowed('CURRENT', 'CURRENT'), false);
  assert.equal(isContextTransitionAllowed('STALE', 'STALE'), false);
  assert.equal(isContextTransitionAllowed('CONFLICTED', 'CONFLICTED'), false);
});

test('computeContextStatus enforces the CONFLICTED+STALE coexistence precedence rule (FRD §10.3)', () => {
  // Nothing wrong: CURRENT.
  assert.equal(computeContextStatus({ hasUnresolvedConflict: false, hasUnresolvedStale: false }), 'CURRENT');
  // Only stale: STALE.
  assert.equal(computeContextStatus({ hasUnresolvedConflict: false, hasUnresolvedStale: true }), 'STALE');
  // Only conflicted: CONFLICTED.
  assert.equal(computeContextStatus({ hasUnresolvedConflict: true, hasUnresolvedStale: false }), 'CONFLICTED');
  // Both coexist: the externally visible status is CONFLICTED, not STALE.
  assert.equal(computeContextStatus({ hasUnresolvedConflict: true, hasUnresolvedStale: true }), 'CONFLICTED');
});

test('resolving a conflict with a remaining stale reason lands on STALE, not CURRENT (FRD §10.3)', () => {
  // Simulates: contextStatus was CONFLICTED with both a conflict reason and
  // a stale reason in contextIssueCodes. The conflict reason is resolved
  // but the stale reason is not — the FRD requires this to land on STALE,
  // not CURRENT, even though the conflict itself is gone.
  const afterConflictResolved = computeContextStatus({ hasUnresolvedConflict: false, hasUnresolvedStale: true });
  assert.equal(afterConflictResolved, 'STALE');
  assert.notEqual(afterConflictResolved, 'CURRENT');
});
