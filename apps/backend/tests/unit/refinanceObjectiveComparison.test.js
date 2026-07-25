const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareRefinanceTerms,
} = require('../../dist/refinanceRadar/refinanceObjectiveComparison');

function compare(objective) {
  return compareRefinanceTerms({
    loanBalance: 300_000,
    currentRatePct: 7,
    remainingTermMonths: 360,
    targetRatePct: 5.5,
    closingCostUsd: 8_000,
    discountPoints: 0.5,
    additionalFeesUsd: 1_000,
    lenderCreditsUsd: 1_500,
    objective,
  });
}

test('compares all supported terms under identical assumptions', () => {
  const result = compare('BALANCED');
  assert.deepEqual(
    result.alternatives.map((alternative) => alternative.targetTerm),
    ['THIRTY_YEAR', 'TWENTY_YEAR', 'FIFTEEN_YEAR'],
  );
  assert.equal(
    result.alternatives.filter((alternative) => alternative.isRecommended).length,
    1,
  );
  assert.ok(result.alternatives.every((alternative) => alternative.tradeoffs.length === 3));
  assert.match(result.recommendationExplanation, /same entered rate and cost assumptions/i);
});

test('lower-payment objective selects the largest monthly savings', () => {
  const result = compare('LOWER_PAYMENT');
  const recommended = result.alternatives.find((alternative) => alternative.isRecommended);
  assert.equal(
    recommended.monthlySavings,
    Math.max(...result.alternatives.map((alternative) => alternative.monthlySavings)),
  );
});

test('faster-payoff objective selects the shortest supported term', () => {
  const result = compare('FASTER_PAYOFF');
  assert.equal(result.recommendedTerm, 'FIFTEEN_YEAR');
});

test('lower-total-cost objective selects the greatest lifetime savings', () => {
  const result = compare('LOWER_TOTAL_COST');
  const recommended = result.alternatives.find((alternative) => alternative.isRecommended);
  assert.equal(
    recommended.lifetimeSavings,
    Math.max(...result.alternatives.map((alternative) => alternative.lifetimeSavings)),
  );
});

test('balanced objective avoids a payment increase when an alternative lowers payment', () => {
  const result = compare('BALANCED');
  const recommended = result.alternatives.find((alternative) => alternative.isRecommended);
  assert.ok(result.alternatives.some((alternative) => alternative.monthlySavings >= 0));
  assert.ok(recommended.monthlySavings >= 0);
});
