const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  isUtilitySavingsItem,
  isUtilitySavingsMessage,
} = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');

test('the Ownership Costs utility continuation selects the utility savings lens', () => {
  assert.equal(isUtilitySavingsMessage('Review my utility costs and savings opportunities'), true);
  assert.equal(isUtilitySavingsMessage('Where could I save money on this home?'), false);
});

test('the utility lens includes only utility recurring costs and utility or energy benefits', () => {
  assert.equal(isUtilitySavingsItem('RECURRING_COST', 'ELECTRICITY_GAS'), true);
  assert.equal(isUtilitySavingsItem('BENEFIT', 'UTILITY_INCENTIVE'), true);
  assert.equal(isUtilitySavingsItem('BENEFIT', 'ENERGY_CREDIT'), true);
  assert.equal(isUtilitySavingsItem('RECURRING_COST', 'HOME_INSURANCE'), false);
  assert.equal(isUtilitySavingsItem('BENEFIT', 'INSURANCE_DISCOUNT'), false);
});

test('the utility result suppresses unrelated decision pointers and has an honest empty state', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/ask/handlers/savingsOwnership.handler.ts'), 'utf8');
  assert.match(source, /const scopedRelated = utilityFocus \? \[\] : unified\.relatedOpportunities/);
  assert.match(source, /No utility savings opportunity is currently recorded/);
  assert.match(source, /title: utilityFocus \? 'Utility savings' : 'By category'/);
});
