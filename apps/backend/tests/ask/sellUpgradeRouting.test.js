const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

test('upgrade-value questions about a sale go to seller prep; hold/rent and plain sell questions keep the analysis', () => {
  const cases = [
    ['If I sell in 5 years which upgrades are worth doing', 'SELLER_PREP_CHECKLIST'],
    ['which upgrades are worth doing before I sell', 'SELLER_PREP_CHECKLIST'],
    ['what upgrades should I do before selling my house', 'SELLER_PREP_CHECKLIST'],
    ['If I sell in 5 years should I hold or rent', 'SELL_HOLD_RENT_ANALYSIS'],
    ['should I sell my house or rent it out', 'SELL_HOLD_RENT_ANALYSIS'],
  ];
  for (const [message, expected] of cases) assert.equal(resolveAskRoutingCascade(message).operation.operationId, expected, message);
});
