const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD HI-ATT-010: a Booking
// cancellation must be able to roll SCHEDULED/IN_PROGRESS work items back to
// ACCEPTED (via the booking reconciliation service's governed override), but
// a homeowner must never be able to self-serve that same transition through
// the ordinary Home Operations write API.
const {
  legalUserWorkItemTransitions,
  assertUserWorkItemTransition,
  GovernedWorkItemTransitionError,
} = require('../../src/modules/homeOperations/domain/userGovernance.ts');

function item(state, safetyTier = 'LOW_CONSEQUENCE') {
  return { state, safetyTier };
}

test('a homeowner cannot roll a SCHEDULED item back to ACCEPTED', () => {
  const legal = legalUserWorkItemTransitions(item('SCHEDULED'));
  assert.ok(!legal.includes('ACCEPTED'), `expected ACCEPTED to be excluded, got: ${legal.join(', ')}`);
  assert.throws(() => assertUserWorkItemTransition(item('SCHEDULED'), 'ACCEPTED'), GovernedWorkItemTransitionError);
});

test('a homeowner cannot roll an IN_PROGRESS item back to ACCEPTED', () => {
  const legal = legalUserWorkItemTransitions(item('IN_PROGRESS'));
  assert.ok(!legal.includes('ACCEPTED'), `expected ACCEPTED to be excluded, got: ${legal.join(', ')}`);
  assert.throws(() => assertUserWorkItemTransition(item('IN_PROGRESS'), 'ACCEPTED'), GovernedWorkItemTransitionError);
});

test('a homeowner can still accept a CANDIDATE recommendation directly', () => {
  const legal = legalUserWorkItemTransitions(item('CANDIDATE'));
  assert.ok(legal.includes('ACCEPTED'), `expected ACCEPTED to remain legal from CANDIDATE, got: ${legal.join(', ')}`);
  assert.doesNotThrow(() => assertUserWorkItemTransition(item('CANDIDATE'), 'ACCEPTED'));
});

test('a homeowner can still handle a FOLLOW_UP_DUE item directly', () => {
  const legal = legalUserWorkItemTransitions(item('FOLLOW_UP_DUE'));
  assert.ok(legal.includes('ACCEPTED'), `expected ACCEPTED to remain legal from FOLLOW_UP_DUE, got: ${legal.join(', ')}`);
});

test('SCHEDULED still allows the other ordinary homeowner transitions (BLOCKED, DEFERRED, CLOSED excluded per existing rules)', () => {
  const legal = legalUserWorkItemTransitions(item('SCHEDULED'));
  assert.ok(legal.includes('BLOCKED'));
  assert.ok(legal.includes('DEFERRED'));
});
