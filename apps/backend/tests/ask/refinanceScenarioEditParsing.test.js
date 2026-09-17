const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md Phase 3 exit
// criterion / F02 fix (docs/architecture/ASK_COZY_PHASE3_PHASE7_FINANCIAL_ACCEPTANCE_VERIFICATION.md).
// Pure (no DB access), so this imports it directly from
// askOrchestrator.service.ts, same convention as
// maintenanceViewStateContinuity.test.js's mergeMaintenanceViewContinuation.
const { parseRefinanceScenarioEdit } = require('../../src/services/ask/askOrchestrator.service.ts');

test('an explicit rate-only hypothetical is recognized', () => {
  const result = parseRefinanceScenarioEdit('What if my rate were 5.5%?');
  assert.deepEqual(result, { targetRatePct: 5.5, targetTerm: null });
});

test('an explicit term-only hypothetical is recognized', () => {
  const result = parseRefinanceScenarioEdit('What if I refinanced to a 15-year loan?');
  assert.deepEqual(result, { targetRatePct: null, targetTerm: 'FIFTEEN_YEAR' });
});

test('a combined rate and term hypothetical captures both', () => {
  const result = parseRefinanceScenarioEdit('Suppose I refinanced to a 20 year loan at 6.25%');
  assert.deepEqual(result, { targetRatePct: 6.25, targetTerm: 'TWENTY_YEAR' });
});

test('"instead of my current rate" is recognized as scenario framing', () => {
  const result = parseRefinanceScenarioEdit('Instead of my current rate, what about 5%?');
  assert.deepEqual(result, { targetRatePct: 5, targetTerm: null });
});

test('a bare rate or term mention with no hypothetical framing is NOT treated as an edit', () => {
  // This is the deliberate false-positive guard: a homeowner asking whether
  // refinancing is worth it "at 6%" is asking a question about that number
  // being relevant, not necessarily requesting a recalculation.
  const result = parseRefinanceScenarioEdit('Is refinancing worth it at 6%?');
  assert.equal(result, null);
});

test('hypothetical framing with neither a parseable rate nor term returns null', () => {
  const result = parseRefinanceScenarioEdit('What if I refinanced?');
  assert.equal(result, null);
});

test('an unrelated question is never mistaken for a scenario edit', () => {
  const result = parseRefinanceScenarioEdit('Is refinancing worth it right now?');
  assert.equal(result, null);
});

test('the term pattern recognizes word-form numbers too', () => {
  const result = parseRefinanceScenarioEdit('What if I went with a thirty year term?');
  assert.deepEqual(result, { targetRatePct: null, targetTerm: 'THIRTY_YEAR' });
});
