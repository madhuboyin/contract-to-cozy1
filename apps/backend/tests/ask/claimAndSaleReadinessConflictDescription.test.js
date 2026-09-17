const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// P04/D07 fixes (same root cause and fix shape as B06's Buyer conflict
// descriptions, docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md
// / ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md). Pure, extracted
// for direct unit testing. Not independently tested at the
// confirmClaimTransition/confirmSellerPrepItemDecision call-site level --
// those compose a live Prisma lookup, same STATIC-verification boundary
// applied throughout this audit series.
const { claimConflictDescription, saleReadinessItemConflictDescription } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a closed claim names the closure explicitly, not a generic "changed" message', () => {
  const message = claimConflictDescription({ title: 'Roof storm damage', status: 'CLOSED' });
  assert.match(message, /"Roof storm damage" was closed in another session/);
});

test('every other claim status interpolates its real current status', () => {
  assert.match(claimConflictDescription({ title: 'Water damage', status: 'UNDER_REVIEW' }), /is now under review/);
  assert.match(claimConflictDescription({ title: 'Theft claim', status: 'APPROVED' }), /is now approved/);
  assert.match(claimConflictDescription({ title: 'Fire claim', status: 'DENIED' }), /is now denied/);
});

test('an unrecognized claim status falls back to a humanized version rather than throwing', () => {
  const message = claimConflictDescription({ title: 'Liability claim', status: 'SOME_FUTURE_STATUS' });
  assert.match(message, /is now some future status/);
});

test('a sale-readiness item names its current status', () => {
  assert.match(saleReadinessItemConflictDescription({ title: 'Repaint exterior trim', status: 'WAIVED' }), /"Repaint exterior trim" changed in another session/);
  assert.match(saleReadinessItemConflictDescription({ title: 'Repaint exterior trim', status: 'WAIVED' }), /is now waived/);
  assert.match(saleReadinessItemConflictDescription({ title: 'Fix leaking faucet', status: 'PURSUING' }), /is now pursuing/);
  assert.match(saleReadinessItemConflictDescription({ title: 'Fix leaking faucet', status: 'RESOLVED' }), /is now resolved/);
});

test('an unrecognized sale-readiness item status falls back to a humanized version rather than throwing', () => {
  const message = saleReadinessItemConflictDescription({ title: 'Replace HVAC filter', status: 'SOME_FUTURE_STATUS' });
  assert.match(message, /is now some future status/);
});
