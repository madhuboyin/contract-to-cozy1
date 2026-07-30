const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  canTransition,
  assertTransition,
  assertClosurePairing,
  canRefreshFromSource,
  applyTransition,
  closureDispositionRuleFor,
  IllegalWorkItemTransitionError,
  InvalidClosureDispositionError,
} = require('../../src/modules/homeOperations/domain/transitions.ts');

test('the full doc-tree happy path is legal end to end', () => {
  const path = ['CANDIDATE', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'REPORTED_COMPLETE', 'VERIFIED', 'CLOSED'];
  for (let i = 0; i < path.length - 1; i += 1) {
    assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]} should be legal`);
    assert.doesNotThrow(() => assertTransition(path[i], path[i + 1]));
  }
});

test('illegal edges are rejected', () => {
  assert.equal(canTransition('CANDIDATE', 'VERIFIED'), false);
  assert.throws(() => assertTransition('CANDIDATE', 'VERIFIED'), IllegalWorkItemTransitionError);

  assert.equal(canTransition('CLOSED', 'ACCEPTED'), false);
  assert.equal(canTransition('CLOSED', 'CANDIDATE'), false);

  // REPORTED_COMPLETE -> SCHEDULED must route back through REOPENED.
  assert.equal(canTransition('REPORTED_COMPLETE', 'SCHEDULED'), false);
  assert.ok(canTransition('REPORTED_COMPLETE', 'REOPENED'));
  assert.ok(canTransition('REOPENED', 'SCHEDULED'));
});

test('assertClosurePairing requires a disposition when closing from CANDIDATE', () => {
  assert.throws(() => assertClosurePairing('CANDIDATE', null), InvalidClosureDispositionError);
  assert.doesNotThrow(() => assertClosurePairing('CANDIDATE', 'NOT_RELEVANT'));
});

test('assertClosurePairing forbids a disposition on a verified-completion close', () => {
  assert.throws(() => assertClosurePairing('VERIFIED', 'DISMISSED'), InvalidClosureDispositionError);
  assert.throws(() => assertClosurePairing('FOLLOW_UP_DUE', 'EXPIRED'), InvalidClosureDispositionError);
  assert.doesNotThrow(() => assertClosurePairing('VERIFIED', null));
});

// ── Home Operations Item #16 ──────────────────────────────────────────────

test('closureDispositionRuleFor: REQUIRED from CANDIDATE, FORBIDDEN from VERIFIED/FOLLOW_UP_DUE, OPTIONAL elsewhere', () => {
  assert.equal(closureDispositionRuleFor('CANDIDATE'), 'REQUIRED');
  assert.equal(closureDispositionRuleFor('VERIFIED'), 'FORBIDDEN');
  assert.equal(closureDispositionRuleFor('FOLLOW_UP_DUE'), 'FORBIDDEN');
  for (const state of ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE', 'IN_PROJECT', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'REOPENED']) {
    assert.equal(closureDispositionRuleFor(state), 'OPTIONAL', `${state} should be OPTIONAL`);
  }
});

test('canRefreshFromSource is true only for CANDIDATE', () => {
  assert.equal(canRefreshFromSource('CANDIDATE'), true);
  for (const state of ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'REPORTED_COMPLETE', 'VERIFIED', 'CLOSED']) {
    assert.equal(canRefreshFromSource(state), false, `${state} must not be refreshable`);
  }
});

test('applyTransition to ACCEPTED sets acceptanceState and acceptedAt', () => {
  const result = applyTransition({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' }, 'ACCEPTED');
  assert.equal(result.state, 'ACCEPTED');
  assert.equal(result.acceptanceState, 'ACCEPTED');
  assert.equal(result.disposition, null);
  assert.equal(result.timestampField, 'acceptedAt');
});

test('applyTransition closing from CANDIDATE with a disposition declines acceptance', () => {
  const result = applyTransition({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' }, 'CLOSED', { disposition: 'NOT_RELEVANT' });
  assert.equal(result.state, 'CLOSED');
  assert.equal(result.acceptanceState, 'DECLINED');
  assert.equal(result.disposition, 'NOT_RELEVANT');
  assert.equal(result.timestampField, 'closedAt');
});

test('applyTransition closing from VERIFIED is genuine completion: no disposition, acceptanceState untouched', () => {
  const result = applyTransition({ state: 'VERIFIED', acceptanceState: 'ACCEPTED' }, 'CLOSED');
  assert.equal(result.state, 'CLOSED');
  assert.equal(result.acceptanceState, 'ACCEPTED');
  assert.equal(result.disposition, null);
});

test('applyTransition rejects an illegal transition before touching disposition logic', () => {
  assert.throws(
    () => applyTransition({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' }, 'VERIFIED'),
    IllegalWorkItemTransitionError,
  );
});

test('applyTransition rejects a disposition on a non-CLOSED destination', () => {
  assert.throws(
    () => applyTransition({ state: 'CANDIDATE', acceptanceState: 'PROPOSED' }, 'ACCEPTED', { disposition: 'NOT_RELEVANT' }),
    InvalidClosureDispositionError,
  );
});
