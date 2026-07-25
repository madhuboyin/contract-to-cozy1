const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceFreshness,
  REFINANCE_FRESHNESS_THRESHOLDS,
} = require('../../dist/refinanceRadar/refinanceFreshness');

const NOW = new Date('2026-07-25T12:00:00.000Z');

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

test('fresh mortgage and weekly market inputs are ready for future alerts', () => {
  const result = buildRefinanceFreshness({
    mortgageDataAsOf: daysAgo(30),
    marketDataAsOf: daysAgo(7),
    marketDataSource: 'FRED',
  }, NOW);

  assert.equal(result.mortgageDataFreshness, 'CURRENT');
  assert.equal(result.marketDataFreshness, 'CURRENT');
  assert.equal(result.alertReadiness, 'READY');
  assert.deepEqual(result.freshnessWarnings, []);
  assert.equal(result.marketDataSource, 'FRED');
});

test('an unknown mortgage balance date keeps estimates available but requires review', () => {
  const result = buildRefinanceFreshness({
    mortgageDataAsOf: null,
    marketDataAsOf: daysAgo(7),
    marketDataSource: 'FRED',
  }, NOW);

  assert.equal(result.mortgageDataFreshness, 'UNKNOWN');
  assert.equal(result.alertReadiness, 'REVIEW_MORTGAGE_DATA');
  assert.match(result.freshnessWarnings[0], /balance date is not recorded/i);
});

test('stale market data takes precedence and fails alert readiness closed', () => {
  const result = buildRefinanceFreshness({
    mortgageDataAsOf: daysAgo(30),
    marketDataAsOf: daysAgo(
      REFINANCE_FRESHNESS_THRESHOLDS.MARKET_STALE_DAYS + 1,
    ),
    marketDataSource: 'FRED',
  }, NOW);

  assert.equal(result.marketDataFreshness, 'STALE');
  assert.equal(result.alertReadiness, 'WAITING_FOR_MARKET_DATA');
  assert.match(result.freshnessWarnings[0], /three weeks old/i);
});

test('aging inputs keep estimates available but fail future external alerts closed', () => {
  const result = buildRefinanceFreshness({
    mortgageDataAsOf: daysAgo(
      REFINANCE_FRESHNESS_THRESHOLDS.MORTGAGE_CURRENT_DAYS + 1,
    ),
    marketDataAsOf: daysAgo(
      REFINANCE_FRESHNESS_THRESHOLDS.MARKET_CURRENT_DAYS + 1,
    ),
  }, NOW);

  assert.equal(result.mortgageDataFreshness, 'AGING');
  assert.equal(result.marketDataFreshness, 'AGING');
  assert.equal(result.alertReadiness, 'WAITING_FOR_MARKET_DATA');
  assert.equal(result.freshnessWarnings.length, 2);
});

test('an implausible future date is unknown rather than treated as current', () => {
  const result = buildRefinanceFreshness({
    mortgageDataAsOf: new Date(NOW.getTime() + 5 * 86_400_000).toISOString(),
    marketDataAsOf: daysAgo(7),
  }, NOW);

  assert.equal(result.mortgageDataFreshness, 'UNKNOWN');
  assert.equal(result.mortgageDataAgeDays, null);
  assert.equal(result.alertReadiness, 'REVIEW_MORTGAGE_DATA');
});
