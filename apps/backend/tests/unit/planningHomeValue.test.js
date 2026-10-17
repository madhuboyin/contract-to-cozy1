const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Owner ruling 2026-10-16: scenario override > lastAppraisedValue > purchase price (disclosed fallback) > ask. No silent $350,000.

const { resolvePlanningHomeValue, PlanningHomeValueRequiredError } = require('../../src/services/planningHomeValue.ts');

test('a scenario override beats the appraisal and is labelled as local to the analysis', () => {
  const value = resolvePlanningHomeValue({ overrideDollars: 452_000, overrideLabel: 'the home value in your what-if', appraisedCents: 72_500_000, purchasePriceCents: 30_000_000 });
  assert.equal(value.valueDollars, 452_000);
  assert.equal(value.source, 'SCENARIO_OVERRIDE');
  assert.match(value.disclosure, /what-if/);
  assert.match(value.disclosure, /this analysis only/);
});

test('without an override the appraisal wins over the purchase price', () => {
  const value = resolvePlanningHomeValue({ appraisedCents: 72_500_000, purchasePriceCents: 30_000_000 });
  assert.deepEqual([value.valueDollars, value.source], [725_000, 'APPRAISAL']);
});

test('the purchase price is used only as a disclosed fallback', () => {
  const value = resolvePlanningHomeValue({ appraisedCents: null, purchasePriceCents: 45_200_000 });
  assert.deepEqual([value.valueDollars, value.source], [452_000, 'PURCHASE_PRICE_FALLBACK']);
  assert.match(value.disclosure, /No appraisal is on record/);
  assert.match(value.disclosure, /purchase price/);
});

test('zero, negative and non-finite values are treated as missing', () => {
  assert.equal(resolvePlanningHomeValue({ overrideDollars: 0, appraisedCents: 0, purchasePriceCents: 10_000_000 }).source, 'PURCHASE_PRICE_FALLBACK');
  assert.equal(resolvePlanningHomeValue({ overrideDollars: NaN, appraisedCents: -5, purchasePriceCents: 10_000_000 }).source, 'PURCHASE_PRICE_FALLBACK');
});

test('with nothing on record there is no default: the homeowner must be asked', () => {
  assert.throws(() => resolvePlanningHomeValue({}), (error) => error instanceof PlanningHomeValueRequiredError && error.statusCode === 422 && error.code === 'PLANNING_HOME_VALUE_REQUIRED');
  assert.throws(() => resolvePlanningHomeValue({ appraisedCents: null, purchasePriceCents: null, overrideDollars: null }), PlanningHomeValueRequiredError);
});

test('neither financial service keeps a hard-coded home value', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  for (const file of ['sellHoldRent.service.ts', 'breakEven.service.ts']) {
    const source = readFileSync(resolve(__dirname, '../../src/services', file), 'utf8');
    assert.doesNotMatch(source, /350_000|350000/, file);
    assert.match(source, /resolvePlanningHomeValue\(/, file);
    assert.match(source, /lastAppraisedValue: true/, file);
  }
});
