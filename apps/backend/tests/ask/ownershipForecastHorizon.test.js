const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { ownershipForecastHorizonYears } = require('../../src/services/ask/handlers/savingsOwnership.handler.ts');

const now = new Date(2026, 10, 9);

test('literal offered horizons are kept', () => {
  assert.equal(ownershipForecastHorizonYears('show my 10-year cost forecast', now), 10);
  assert.equal(ownershipForecastHorizonYears('1 year forecast', now), 1);
});

test('named dates take the shortest offered horizon that covers them', () => {
  assert.equal(ownershipForecastHorizonYears('what will ownership cost in 2 years', now), 3);
  assert.equal(ownershipForecastHorizonYears('what will it cost in 4 years', now), 5);
  assert.equal(ownershipForecastHorizonYears('forecast costs in 8 years', now), 10);
  assert.equal(ownershipForecastHorizonYears('forecast costs by 2030', now), 5);
});

test('no date, or beyond 10 years, keeps 5', () => {
  assert.equal(ownershipForecastHorizonYears('forecast my costs', now), 5);
  assert.equal(ownershipForecastHorizonYears('forecast costs in 20 years', now), 5);
});
