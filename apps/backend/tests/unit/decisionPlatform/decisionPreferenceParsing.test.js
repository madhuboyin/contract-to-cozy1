const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  parseOwnershipHorizonFromMessage,
  parseRepairReplaceApproachFromMessage,
} = require('../../../src/services/decisionPlatform/decisionPreferenceService.ts');

test('an explicit save verb plus a sell timeframe parses an ownership horizon (months)', () => {
  assert.deepEqual(parseOwnershipHorizonFromMessage('Please save that we plan to sell in about 18 months'), { planToSell: true, horizonMonths: 18 });
});

test('a sell timeframe in years is converted to months', () => {
  assert.deepEqual(parseOwnershipHorizonFromMessage('Remember that we are selling in 2 years'), { planToSell: true, horizonMonths: 24 });
});

test('a bare timeframe mention with no save verb is never captured — FRD §4.2: never silently infer a material preference', () => {
  assert.equal(parseOwnershipHorizonFromMessage('We plan to sell in about 18 months'), null);
});

test('a save verb with no timeframe mention does not parse', () => {
  assert.equal(parseOwnershipHorizonFromMessage('Please save my preferences'), null);
});

test('an out-of-range horizon is rejected rather than silently clamped', () => {
  assert.equal(parseOwnershipHorizonFromMessage('Save that we plan to sell in 0 months'), null);
  assert.equal(parseOwnershipHorizonFromMessage('Save that we plan to sell in 999 months'), null);
});

test('an explicit save verb plus an approach phrase parses the repair/replace approach', () => {
  assert.deepEqual(parseRepairReplaceApproachFromMessage('Save that I want to minimize upfront cost for HVAC decisions'), { approach: 'MINIMIZE_UPFRONT_COST' });
  assert.deepEqual(parseRepairReplaceApproachFromMessage('Remember I want to minimize long-term cost'), { approach: 'MINIMIZE_LONG_TERM_COST' });
  assert.deepEqual(parseRepairReplaceApproachFromMessage('Note that I want to maximize reliability'), { approach: 'MAXIMIZE_RELIABILITY' });
});

test('an approach phrase with no save verb is never captured', () => {
  assert.equal(parseRepairReplaceApproachFromMessage('I want to minimize upfront cost'), null);
});

test('an unrecognized approach phrase does not parse even with a save verb', () => {
  assert.equal(parseRepairReplaceApproachFromMessage('Save that I want the best deal'), null);
});
