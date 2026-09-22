const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// FRD Appendix D "planning/refinement" follow-up (the ONLY real
// homeowner-facing "different assumptions" lever anywhere in the app --
// see the traditional Capital Timeline page's own `([5, 10] as const)`
// horizon toggle, confirmed by direct read). Pure (no DB access), same
// convention as parseRefinanceScenarioEdit/isCapitalTimelineAnalysisStale.
const { parseCapitalTimelineHorizonRequest } = require('../../src/services/ask/askOrchestrator.service.ts');

test('a 5-year request is parsed', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Show my capital reserve plan for a 5-year horizon.'), 5);
  assert.equal(parseCapitalTimelineHorizonRequest('5 year horizon please'), 5);
  assert.equal(parseCapitalTimelineHorizonRequest('Show me the 5-Year plan'), 5);
});

test('a 10-year request is parsed', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Show my capital reserve plan for a 10-year horizon.'), 10);
  assert.equal(parseCapitalTimelineHorizonRequest('10 year outlook'), 10);
});

test('a message naming no horizon returns null, not a guessed default', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Create a capital reserve plan for future replacements.'), null);
  assert.equal(parseCapitalTimelineHorizonRequest(''), null);
});

test('an unsupported horizon (not 5 or 10, the only two the traditional page offers) is not matched', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Show me a 20-year horizon'), null);
  assert.equal(parseCapitalTimelineHorizonRequest('Show me a 15-year horizon'), null);
});

test('5 is checked before 10, so a message naming both resolves deterministically rather than ambiguously', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Compare a 5-year horizon against a 10-year horizon'), 5);
});

test('the \\b word boundary rejects a longer number that merely contains "5" or "10" as a substring', () => {
  assert.equal(parseCapitalTimelineHorizonRequest('Show me a 15-year horizon'), null);
  assert.equal(parseCapitalTimelineHorizonRequest('Show me a 100-year horizon'), null);
});

// The answer-trust whitelist strips any action id an operation doesn't declare
// (askAnswerTrustPolicy.ts's OPERATION_ACTION_IDS) -- without these entries the
// re-run buttons would vanish on a real backend while the mocked-API Playwright
// scenario still passed.
test('the horizon re-run actions survive the answer-trust action whitelist', () => {
  const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  for (const horizon of [5, 10]) {
    const action = { id: `rerun-horizon-${horizon}`, label: `Show ${horizon}-year horizon`, interactionType: 'START_WORKFLOW', message: `Show my capital reserve plan for a ${horizon}-year horizon.`, operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' };
    assert.equal(isAskActionApplicable({ action, operationId: 'CAPITAL_RESERVE_PLAN', propertyId: 'property-1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
  }
});
