const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('upgrade-value questions about a sale go to seller prep; hold/rent and plain sell questions keep the analysis', () => {
  const cases = [
    ['If I sell in 5 years which upgrades are worth doing', 'SELLER_PREP_CHECKLIST'],
    ['which upgrades are worth doing before I sell', 'SELLER_PREP_CHECKLIST'],
    ['what upgrades should I do before selling my house', 'SELLER_PREP_CHECKLIST'],
    ['if I sell in 5 years what improvements add the most value', 'SELLER_PREP_CHECKLIST'],
    // a real write is not hijacked by the seller-prep rule
    ['add the kitchen remodel to my list before I sell', 'INVENTORY_ITEM_CREATE'],
    ['If I sell in 5 years should I hold or rent', 'SELL_HOLD_RENT_ANALYSIS'],
    ['should I sell my house or rent it out', 'SELL_HOLD_RENT_ANALYSIS'],
  ];
  for (const [message, expected] of cases) assert.equal(resolveAskRoutingCascade(message).operation.operationId, expected, message);
});

test('"which upgrades are worth doing" with no goal asks what they are for, one option per goal', () => {
  for (const message of ['which upgrades are worth doing', 'What improvements are worth doing?', 'which renovations are worth it']) {
    const decision = resolveAskRoutingCascade(message);
    assert.equal(decision.stage, 'CLARIFICATION', message);
    assert.equal(decision.requiresClarification, true, message);
    assert.deepEqual(decision.candidates.map((c) => c.operationId), ['SELLER_PREP_CHECKLIST', 'HOME_UPGRADE_SCENARIOS', 'APPLIANCE_FAILURE_RISK'], message);
    assert.deepEqual(decision.candidates[0].reasonCodes, ['UPGRADE_OBJECTIVE_UNKNOWN']);
  }
  // a stated goal never asks
  assert.equal(resolveAskRoutingCascade('which upgrades are worth doing before I sell').operation.operationId, 'SELLER_PREP_CHECKLIST');
});
