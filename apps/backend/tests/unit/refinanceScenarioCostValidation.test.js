const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runScenarioSchema,
} = require('../../dist/refinanceRadar/validators/refinanceRadar.validators');

const base = {
  targetRate: 5.5,
  targetTerm: 'THIRTY_YEAR',
};

test('scenario validation accepts detailed non-negative cost assumptions', () => {
  const parsed = runScenarioSchema.safeParse({
    ...base,
    closingCostAmount: 8_000,
    discountPoints: 1,
    additionalFeesAmount: 1_250,
    lenderCreditsAmount: 2_000,
  });
  assert.equal(parsed.success, true);
});

test('scenario validation rejects excessive points and negative fees or credits', () => {
  assert.equal(runScenarioSchema.safeParse({
    ...base,
    discountPoints: 5.001,
  }).success, false);
  assert.equal(runScenarioSchema.safeParse({
    ...base,
    additionalFeesAmount: -1,
  }).success, false);
  assert.equal(runScenarioSchema.safeParse({
    ...base,
    lenderCreditsAmount: -1,
  }).success, false);
});

test('scenario validation defaults to a balanced objective and rejects unknown objectives', () => {
  const parsed = runScenarioSchema.parse(base);
  assert.equal(parsed.objective, 'BALANCED');
  assert.equal(runScenarioSchema.safeParse({
    ...base,
    objective: 'MAXIMUM_CASH_OUT',
  }).success, false);
});
