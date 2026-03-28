const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  normalizeFinancialAssumptionInput,
  hasFinancialAssumptionInput,
  deriveFinancialPreferenceDefaults,
  deriveExpenseGrowthRate,
} = require('../../src/services/financialAssumption.service.ts');

const {
  buildAnnualGainSeries,
  buildAnnualCostSeries,
} = require('../../src/services/tools/financialProjectionMath.ts');

test('normalizeFinancialAssumptionInput maps sellingCostRate alias', () => {
  const normalized = normalizeFinancialAssumptionInput({
    appreciationRate: 0.04,
    sellingCostRate: 0.065,
  });

  assert.equal(normalized.appreciationRate, 0.04);
  assert.equal(normalized.sellingCostPercent, 0.065);
});

test('hasFinancialAssumptionInput detects empty vs populated payload', () => {
  assert.equal(hasFinancialAssumptionInput(undefined), false);
  assert.equal(hasFinancialAssumptionInput({}), false);
  assert.equal(hasFinancialAssumptionInput({ inflationRate: 0.03 }), true);
});

test('deriveFinancialPreferenceDefaults responds to risk/cash posture', () => {
  const conservative = deriveFinancialPreferenceDefaults({
    riskTolerance: 'LOW',
    cashBufferPosture: 'TIGHT',
  });
  const aggressive = deriveFinancialPreferenceDefaults({
    riskTolerance: 'HIGH',
    cashBufferPosture: 'STRONG',
  });

  assert.ok(
    (aggressive.appreciationRate || 0) > (conservative.appreciationRate || 0),
    'Expected higher risk posture to imply higher appreciation assumption',
  );
  assert.ok(
    (aggressive.sellingCostPercent || 1) < (conservative.sellingCostPercent || 0),
    'Expected stronger cash posture to imply lower selling-cost assumption',
  );
});

test('deriveExpenseGrowthRate returns bounded weighted growth', () => {
  const rate = deriveExpenseGrowthRate({
    appreciationRate: 0.04,
    inflationRate: 0.035,
    rentGrowthRate: 0.03,
    interestRate: 0.065,
    propertyTaxGrowthRate: 0.03,
    insuranceGrowthRate: 0.06,
    maintenanceGrowthRate: 0.05,
    sellingCostPercent: 0.06,
  });

  assert.ok(rate > 0 && rate < 0.2, `Expected bounded expense growth, got ${rate}`);
});

test('financial projection helpers produce deterministic annual series', () => {
  const gains = buildAnnualGainSeries(100000, 0.04, 3);
  const costs = buildAnnualCostSeries(10000, 0.03, 3);

  assert.equal(gains.length, 3);
  assert.equal(costs.length, 3);
  assert.ok(gains[1] > gains[0], 'Expected compound appreciation gains to increase year-over-year');
  assert.ok(costs[1] > costs[0], 'Expected compound costs to increase year-over-year');
});
