const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  compareHomeSavingsOpportunitiesByNetValue,
} = require('../../src/services/homeSavings.service.ts');

function opportunity(overrides) {
  return {
    categoryKey: 'INTERNET',
    estimatedAnnualSavings: null,
    netAnnualSavings: null,
    generatedAt: new Date('2026-07-29T12:00:00.000Z'),
    ...overrides,
  };
}

test('Home Savings ranks lower-gross offers first when their net value is higher', () => {
  const higherGrossLowerNet = opportunity({
    estimatedAnnualSavings: 500,
    netAnnualSavings: 300,
  });
  const lowerGrossHigherNet = opportunity({
    estimatedAnnualSavings: 450,
    netAnnualSavings: 400,
  });

  const ranked = [higherGrossLowerNet, lowerGrossHigherNet]
    .sort(compareHomeSavingsOpportunitiesByNetValue);

  assert.equal(ranked[0], lowerGrossHigherNet);
});

test('legacy opportunities without persisted net value use category switching friction', () => {
  const higherGrossInternet = opportunity({
    categoryKey: 'INTERNET',
    estimatedAnnualSavings: 500,
  });
  const lowerGrossUtility = opportunity({
    categoryKey: 'ELECTRICITY_GAS',
    estimatedAnnualSavings: 450,
  });

  const ranked = [higherGrossInternet, lowerGrossUtility]
    .sort(compareHomeSavingsOpportunitiesByNetValue);

  assert.equal(ranked[0], lowerGrossUtility);
});

test('known net value ranks ahead of an unknown value', () => {
  const unknown = opportunity({ generatedAt: new Date('2026-07-30T12:00:00.000Z') });
  const known = opportunity({ netAnnualSavings: 25 });

  const ranked = [unknown, known].sort(compareHomeSavingsOpportunitiesByNetValue);

  assert.equal(ranked[0], known);
});
