const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// The saved-override contract: UPPER_SNAKE keys are canonical, translated once into the estimator's typed fields, validated, never coerced.

const {
  SELL_HOLD_RENT_OVERRIDE_SPECS, parseSellHoldRentOverrides, validateToolOverrideWrite, isSupportedOverrideTool, toolOverrideIssue,
} = require('../../src/services/toolOverrideContract.ts');

// A valid in-range sample for every supported key. The expected estimator field is written out here on purpose, so the test breaks if the mapping drifts.
const SAMPLE = {
  HOME_VALUE_NOW: ['homeValueNow', 610000], MONTHLY_RENT_NOW: ['monthlyRentNow', 4800], APPRECIATION_RATE: ['appreciationRate', 0.05],
  SELLING_COST_RATE: ['sellingCostRate', 0.07], INFLATION_RATE: ['inflationRate', 0.03], PROPERTY_TAX_GROWTH_RATE: ['propertyTaxGrowthRate', 0.025],
  INSURANCE_GROWTH_RATE: ['insuranceGrowthRate', 0.04], MAINTENANCE_GROWTH_RATE: ['maintenanceGrowthRate', 0.035], RENT_GROWTH_RATE: ['rentGrowthRate', 0.02],
  VACANCY_RATE: ['vacancyRate', 0.1], MANAGEMENT_RATE: ['managementRate', 0.09], MORTGAGE_BALANCE: ['mortgageBalance', 350000],
  MORTGAGE_ANNUAL_RATE: ['mortgageAnnualRate', 0.0625], REMAINING_TERM_MONTHS: ['remainingTermMonths', 300], MONTHLY_PAYMENT: ['monthlyPayment', 2400],
};

test('the contract declares exactly the keys the estimator can consume, each UPPER_SNAKE and unique', () => {
  const keys = SELL_HOLD_RENT_OVERRIDE_SPECS.map((item) => item.key);
  assert.deepEqual([...keys].sort(), Object.keys(SAMPLE).sort());
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^[A-Z]+(?:_[A-Z]+)*$/, key);
  assert.equal(new Set(SELL_HOLD_RENT_OVERRIDE_SPECS.map((item) => item.field)).size, keys.length);
});

for (const [key, [field, value]] of Object.entries(SAMPLE)) {
  test(`${key} is translated to the estimator's ${field}`, () => {
    const { values, ignored } = parseSellHoldRentOverrides([{ key, value }]);
    assert.deepEqual(values, { [field]: value });
    assert.deepEqual(ignored, []);
  });
}

test('every key at once translates to every field with nothing ignored', () => {
  const { values, ignored } = parseSellHoldRentOverrides(Object.entries(SAMPLE).map(([key, [, value]]) => ({ key, value })));
  assert.deepEqual(values, Object.fromEntries(Object.values(SAMPLE)));
  assert.deepEqual(ignored, []);
});

test('the UI\'s seven keys, as the page saves them, are all supported', () => {
  for (const key of ['HOME_VALUE_NOW', 'MONTHLY_RENT_NOW', 'APPRECIATION_RATE', 'SELLING_COST_RATE', 'RENT_GROWTH_RATE', 'VACANCY_RATE', 'MANAGEMENT_RATE']) {
    assert.ok(key in SAMPLE, key);
  }
});

test('camel-case names are not keys: they are ignored as unsupported, not translated', () => {
  const { values, ignored } = parseSellHoldRentOverrides([{ key: 'homeValueNow', value: 500000 }, { key: 'appreciationRate', value: 0.04 }, { key: 'home_value_now', value: 500000 }, { key: 'HOME_VALUE', value: 500000 }]);
  assert.deepEqual(values, {});
  assert.deepEqual(ignored.map((issue) => [issue.key, issue.reason]), [['homeValueNow', 'UNSUPPORTED_KEY'], ['appreciationRate', 'UNSUPPORTED_KEY'], ['home_value_now', 'UNSUPPORTED_KEY'], ['HOME_VALUE', 'UNSUPPORTED_KEY']]);
});

test('malformed values are ignored with a structured reason, never coerced or clamped', () => {
  const rows = [
    { key: 'HOME_VALUE_NOW', value: '500000' },        // a string is not coerced to a number
    { key: 'MONTHLY_RENT_NOW', value: NaN },
    { key: 'APPRECIATION_RATE', value: Infinity },
    { key: 'SELLING_COST_RATE', value: 0.5 },          // 50% is out of range, not clamped to 12%
    { key: 'VACANCY_RATE', value: -0.1 },
    { key: 'MANAGEMENT_RATE', value: 7 },              // a percent typed as a decimal
    { key: 'HOME_VALUE_NOW_2', value: 1 },
    { key: 'REMAINING_TERM_MONTHS', value: 300.5 },    // not a whole number
    { key: 'MORTGAGE_BALANCE', value: 0 },
    { key: 'MONTHLY_PAYMENT', value: null },
    { key: 'RENT_GROWTH_RATE', value: undefined },
  ];
  const { values, ignored } = parseSellHoldRentOverrides(rows);
  assert.deepEqual(values, {});
  assert.deepEqual(ignored.map((issue) => [issue.key, issue.reason]), [
    ['HOME_VALUE_NOW', 'NOT_A_FINITE_NUMBER'], ['MONTHLY_RENT_NOW', 'NOT_A_FINITE_NUMBER'], ['APPRECIATION_RATE', 'NOT_A_FINITE_NUMBER'],
    ['SELLING_COST_RATE', 'OUT_OF_RANGE'], ['VACANCY_RATE', 'OUT_OF_RANGE'], ['MANAGEMENT_RATE', 'OUT_OF_RANGE'], ['HOME_VALUE_NOW_2', 'UNSUPPORTED_KEY'],
    ['REMAINING_TERM_MONTHS', 'NOT_AN_INTEGER'], ['MORTGAGE_BALANCE', 'OUT_OF_RANGE'], ['MONTHLY_PAYMENT', 'NOT_A_FINITE_NUMBER'], ['RENT_GROWTH_RATE', 'NOT_A_FINITE_NUMBER'],
  ]);
  for (const issue of ignored) assert.ok(issue.detail.length > 0);
});

test('range edges are inclusive, and one bad row never discards the good ones', () => {
  const { values, ignored } = parseSellHoldRentOverrides([
    { key: 'APPRECIATION_RATE', value: 0 }, { key: 'APPRECIATION_RATE', value: 0.15 },
    { key: 'SELLING_COST_RATE', value: 0.01 }, { key: 'HOME_VALUE_NOW', value: 9_999 }, { key: 'VACANCY_RATE', value: 0.25 },
  ]);
  assert.equal(values.appreciationRate, 0.15);
  assert.equal(values.sellingCostRate, 0.01);
  assert.equal(values.vacancyRate, 0.25);
  assert.equal(values.homeValueNow, undefined);
  assert.deepEqual(ignored.map((issue) => [issue.key, issue.reason]), [['HOME_VALUE_NOW', 'OUT_OF_RANGE']]);
});

test('writes are validated against the same contract; null clears a key', () => {
  assert.deepEqual(validateToolOverrideWrite('SELL_HOLD_RENT', [{ key: 'HOME_VALUE_NOW', value: 450000 }, { key: 'VACANCY_RATE', value: null }]), []);
  assert.deepEqual(validateToolOverrideWrite('SELL_HOLD_RENT', [{ key: 'homeValueNow', value: 450000 }]).map((issue) => issue.reason), ['UNSUPPORTED_KEY']);
  assert.deepEqual(validateToolOverrideWrite('SELL_HOLD_RENT', [{ key: 'madeUpKey', value: null }]).map((issue) => issue.reason), ['UNSUPPORTED_KEY']);
  assert.deepEqual(validateToolOverrideWrite('SELL_HOLD_RENT', [{ key: 'VACANCY_RATE', value: 4 }]).map((issue) => issue.reason), ['OUT_OF_RANGE']);
  assert.deepEqual(validateToolOverrideWrite('BREAK_EVEN', [{ key: 'HOME_VALUE_NOW', value: 450000 }]).map((issue) => issue.reason), ['UNSUPPORTED_KEY']);
  assert.equal(isSupportedOverrideTool('SELL_HOLD_RENT'), true);
  assert.equal(isSupportedOverrideTool('BREAK_EVEN'), false);
  assert.equal(isSupportedOverrideTool('constructor'), false);
  assert.equal(toolOverrideIssue('SELL_HOLD_RENT', 'HOME_VALUE_NOW', 450000), null);
});

test('MORTGAGE_ANNUAL_RATE follows the shared mortgage-rate rule: 0.1% to 25% as a decimal, a percent typed as a decimal is refused with how to enter it', () => {
  const issue = (value) => parseSellHoldRentOverrides([{ key: 'MORTGAGE_ANNUAL_RATE', value }]).ignored[0];
  assert.equal(parseSellHoldRentOverrides([{ key: 'MORTGAGE_ANNUAL_RATE', value: 0.001 }]).values.mortgageAnnualRate, 0.001);
  assert.equal(parseSellHoldRentOverrides([{ key: 'MORTGAGE_ANNUAL_RATE', value: 0.25 }]).values.mortgageAnnualRate, 0.25);
  assert.match(issue(6.5).detail, /6\.5 looks like a percent.*0\.065 means 6\.5%/);
  assert.match(issue(0.0006).detail, /below 0\.1%/);
  assert.equal(issue(0).reason, 'OUT_OF_RANGE');
  assert.equal(issue(0.2501).reason, 'OUT_OF_RANGE');
  assert.deepEqual(validateToolOverrideWrite('SELL_HOLD_RENT', [{ key: 'MORTGAGE_ANNUAL_RATE', value: 6.5 }]).map((entry) => entry.reason), ['OUT_OF_RANGE']);
});
