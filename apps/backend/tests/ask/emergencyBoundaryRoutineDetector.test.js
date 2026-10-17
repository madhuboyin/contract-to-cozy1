const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');

// Live review finding 2 (2026-10-16): the Home Actions "Review in Ask" prompt quotes the card title, and
// "Smoke & CO Detector Check" matched the CO-alarm emergency wording, returning a 911 gas-leak boundary.

test('the Home Actions Review-in-Ask prompt for the detector card is not an emergency', () => {
  const resolved = resolveAskOperation('What should I do next for “Schedule service for Smoke & CO Detector Check”?');
  assert.notEqual(resolved.operationId, 'EMERGENCY_BOUNDARY');
});

for (const phrase of ['my CO detector is going off', 'The CO alarm is beeping and we feel dizzy', 'I smell gas in the kitchen', 'carbon monoxide alarm went off']) {
  test(`still treats "${phrase}" as an emergency`, () => {
    assert.equal(resolveAskOperation(phrase).operationId, 'EMERGENCY_BOUNDARY');
  });
}
