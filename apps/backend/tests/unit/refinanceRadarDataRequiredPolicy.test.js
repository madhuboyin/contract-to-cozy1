const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DATA_REQUIRED_MIN_RATE_DECLINE_PCT,
  shouldPromptForMissingMortgageDetails,
} = require('../../dist/refinanceRadar/config/refinanceRadar.config');

function policy(overrides = {}) {
  return shouldPromptForMissingMortgageDetails({
    missingFieldCount: 1,
    trend: 'FALLING',
    currentRatePct: 6.25,
    priorRatePct: 6.25 + DATA_REQUIRED_MIN_RATE_DECLINE_PCT,
    ...overrides,
  });
}

test('prompts only when mortgage facts are missing and the decline is meaningful', () => {
  assert.equal(policy(), true);
  assert.equal(policy({ missingFieldCount: 0 }), false);
  assert.equal(policy({ priorRatePct: 6.49 }), false);
});

test('does not prompt for rising, stable, unknown, or insufficient rate history', () => {
  assert.equal(policy({ trend: 'RISING' }), false);
  assert.equal(policy({ trend: 'STABLE' }), false);
  assert.equal(policy({ trend: 'UNKNOWN' }), false);
  assert.equal(policy({ priorRatePct: null }), false);
  assert.equal(policy({ currentRatePct: null }), false);
});
