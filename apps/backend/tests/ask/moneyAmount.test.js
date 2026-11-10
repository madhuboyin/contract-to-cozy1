const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { parseMoneyAmounts, parseMonthlyBudget, moneyFromParts } = require('../../src/services/ask/support/moneyAmount.ts');

test('amounts need a sign or a unit', () => {
  assert.deepEqual(parseMoneyAmounts('in 5 years I have 3 roofs').length, 0);
  assert.deepEqual(parseMoneyAmounts('I have $1,200 and 12k').map((a) => a.dollars), [1200, 12000]);
  assert.equal(parseMoneyAmounts('worth 1.5 million')[0].dollars, 1_500_000);
});

test('monthly budget wording', () => {
  assert.equal(parseMonthlyBudget('I can save $300 a month for the roof').dollars, 300);
  assert.equal(parseMonthlyBudget('about 250 per month').dollars, 250);
  assert.equal(parseMonthlyBudget('a monthly budget of $400').dollars, 400);
  assert.equal(parseMonthlyBudget('replace my roof in 5 years'), null);
  assert.equal(parseMonthlyBudget('I have $5,000 saved'), null);
});

test('moneyFromParts rejects zero and junk', () => {
  assert.equal(moneyFromParts('0'), null);
  assert.equal(moneyFromParts('2', 'k'), 2000);
});
