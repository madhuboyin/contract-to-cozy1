const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node/register');

const { formatUsdFromCents } = require('../../src/services/replaceRepairAnalysis.service.ts');

test('formats repair and replacement cent values as USD', () => {
  assert.equal(formatUsdFromCents(120000), '$1,200');
  assert.equal(formatUsdFromCents(56160), '$561.60');
  assert.equal(formatUsdFromCents(45063), '$450.63');
  assert.equal(formatUsdFromCents(0), '$0');
});
