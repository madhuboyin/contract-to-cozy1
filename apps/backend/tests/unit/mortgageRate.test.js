const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Owner ruling 2026-10-17: scenario override, then canonical financing-profile rate, then a disclosed assumption only if neither exists. Units are normalised at the
// boundary: a rate is a decimal everywhere (0.065 is 6.5%), the profile stores basis points (650 is 6.5%), and a value that cannot be a rate is refused, not rescaled.

const {
  resolveMortgageRate, rateFromBasisPoints, formatRatePercent, mortgageRateProblem, assertMortgageRateInput,
  MORTGAGE_RATE_MIN, MORTGAGE_RATE_MAX, ASSUMED_MORTGAGE_RATE,
} = require('../../src/services/mortgageRate.ts');

test('unit conversion: basis points become a decimal fraction, and a decimal formats back as the same percent', () => {
  assert.equal(rateFromBasisPoints(650), 0.065);
  assert.equal(rateFromBasisPoints(625), 0.0625);
  assert.equal(rateFromBasisPoints(1), 0.0001);
  assert.equal(formatRatePercent(0.065), '6.5%');
  assert.equal(formatRatePercent(rateFromBasisPoints(625)), '6.25%');
  assert.equal(formatRatePercent(0.0325), '3.25%');
});

test('6.5 is not read as 6.5% and 0.0006 is not read as 0.06% or 6.5%: both are refused with how to enter the rate', () => {
  const percentTypedAsDecimal = mortgageRateProblem(6.5);
  assert.equal(percentTypedAsDecimal.reason, 'LOOKS_LIKE_A_PERCENT');
  assert.match(percentTypedAsDecimal.detail, /0\.065 means 6\.5%/);
  const tooLow = mortgageRateProblem(0.0006);
  assert.equal(tooLow.reason, 'TOO_LOW_FOR_A_RATE');
  assert.match(tooLow.detail, /0\.065 means 6\.5%/);
});

test('the accepted range is inclusive at both edges and everything else is refused, never clamped', () => {
  assert.equal(mortgageRateProblem(MORTGAGE_RATE_MIN), null);
  assert.equal(mortgageRateProblem(MORTGAGE_RATE_MAX), null);
  assert.equal(mortgageRateProblem(0.065), null);
  for (const [value, reason] of [[0, 'OUT_OF_RANGE'], [-0.05, 'OUT_OF_RANGE'], [0.2501, 'LOOKS_LIKE_A_PERCENT'], [100, 'LOOKS_LIKE_A_PERCENT'], [101, 'OUT_OF_RANGE'], [NaN, 'NOT_A_FINITE_NUMBER'], [Infinity, 'NOT_A_FINITE_NUMBER'], ['0.065', 'NOT_A_FINITE_NUMBER'], [null, 'NOT_A_FINITE_NUMBER']]) {
    assert.equal(mortgageRateProblem(value)?.reason, reason, String(value));
  }
});

test('precedence 1: a valid scenario override wins over the canonical profile rate', () => {
  const r = resolveMortgageRate({ scenarioOverride: 0.0425, canonicalRate: 0.0325, assumeIfMissing: true });
  assert.deepEqual([r.rate, r.source, r.ignored], [0.0425, 'SCENARIO_OVERRIDE', []]);
  assert.match(r.disclosure, /you entered for this scenario: 4\.25%/);
  assert.match(r.disclosure, /financing profile is unchanged/);
});

test('precedence 2: with no override the canonical profile rate is used and named as such', () => {
  const r = resolveMortgageRate({ canonicalRate: 0.0325, assumeIfMissing: true });
  assert.deepEqual([r.rate, r.source], [0.0325, 'CANONICAL_PROFILE']);
  assert.match(r.disclosure, /interest rate on your financing profile: 3\.25%/);
});

test('precedence 3: only when neither exists, and only if a mortgage is known, a disclosed assumption is used', () => {
  const assumed = resolveMortgageRate({ assumeIfMissing: true });
  assert.deepEqual([assumed.rate, assumed.source], [ASSUMED_MORTGAGE_RATE, 'MODELING_ASSUMPTION']);
  assert.match(assumed.disclosure, /No usable mortgage interest rate is on record, so this assumes 6\.5%/);
  const none = resolveMortgageRate({ assumeIfMissing: false });
  assert.deepEqual([none.rate, none.source, none.disclosure], [null, null, null]);
});

test('an unusable scenario override is ignored with a reason and the next source applies', () => {
  const r = resolveMortgageRate({ scenarioOverride: 6.5, canonicalRate: 0.0325, assumeIfMissing: true });
  assert.deepEqual([r.rate, r.source], [0.0325, 'CANONICAL_PROFILE']);
  assert.deepEqual(r.ignored.map((issue) => [issue.source, issue.reason]), [['SCENARIO_OVERRIDE', 'LOOKS_LIKE_A_PERCENT']]);
});

test('an unusable canonical rate (a percent stored as basis points) is ignored with a reason, never used, and the assumption is disclosed', () => {
  // 6 stored where 650 was meant converts to 0.0006: far too low to be an annual mortgage rate.
  const r = resolveMortgageRate({ canonicalRate: rateFromBasisPoints(6), assumeIfMissing: true });
  assert.deepEqual([r.rate, r.source], [ASSUMED_MORTGAGE_RATE, 'MODELING_ASSUMPTION']);
  assert.deepEqual(r.ignored.map((issue) => [issue.source, issue.reason]), [['CANONICAL_PROFILE', 'TOO_LOW_FOR_A_RATE']]);
  assert.match(r.ignored[0].detail, /rate on your financing profile was not used/);
});

test('with both candidates unusable and no mortgage to model, nothing is invented', () => {
  const r = resolveMortgageRate({ scenarioOverride: NaN, canonicalRate: 7, assumeIfMissing: false });
  assert.deepEqual([r.rate, r.source], [null, null]);
  assert.equal(r.ignored.length, 2);
});

test('a rate in a request is refused with a structured 400 instead of being rescaled or clamped', () => {
  assert.doesNotThrow(() => assertMortgageRateInput(undefined, 'interestRate'));
  assert.doesNotThrow(() => assertMortgageRateInput(0.065, 'interestRate'));
  assert.throws(() => assertMortgageRateInput(6.5, 'interestRate'), (error) => error.statusCode === 400 && error.code === 'MORTGAGE_RATE_INVALID' && /interestRate: 6\.5 looks like a percent/.test(error.message));
  assert.throws(() => assertMortgageRateInput(0.0006, 'mortgageAnnualRate'), (error) => error.code === 'MORTGAGE_RATE_INVALID');
});
