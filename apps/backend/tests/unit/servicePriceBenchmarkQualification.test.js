const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  qualifyServicePriceBenchmark,
} = require('../../src/services/servicePriceBenchmarkQualification.ts');
const {
  ServicePriceRadarEngine,
} = require('../../src/services/servicePriceRadar.engine.ts');

const evaluatedAt = new Date('2026-07-28T12:00:00.000Z');

function benchmark(overrides = {}) {
  return {
    id: 'benchmark-1',
    releaseId: 'release-1',
    normalizedScopeKey: 'hvac:heat_pump_replacement',
    serviceCategory: 'HVAC',
    serviceSubcategory: 'heat_pump_replacement',
    regionType: 'STATE',
    regionKey: 'NJ',
    homeType: null,
    sizeBand: null,
    unit: 'JOB',
    quantityLow: 1,
    quantityHigh: 1,
    currency: 'USD',
    baseLow: 6000,
    baseHigh: 10000,
    baseMedian: 8000,
    percentileLow: 0.25,
    percentileHigh: 0.75,
    sampleSize: 40,
    laborFactor: 1,
    materialFactor: 1,
    complexityFactorJson: null,
    observationNotes: null,
    sourceId: 'source-1',
    sourceKey: 'reviewed-provider',
    sourceName: 'Reviewed Provider',
    sourceUrl: 'https://example.com/methodology',
    licenseSummary: 'Licensed for homeowner-facing aggregate comparisons.',
    sourceRightsStatus: 'APPROVED',
    sourceReviewStatus: 'APPROVED',
    sourceIsActive: true,
    sourceHealthStatus: 'HEALTHY',
    sourceHealthCheckedAt: new Date('2026-07-28T10:00:00.000Z'),
    releaseVersion: '2026-07',
    releaseStatus: 'ACTIVE',
    releaseQualityStatus: 'PASSED',
    observationStart: new Date('2026-01-01T00:00:00.000Z'),
    observationEnd: new Date('2026-06-30T23:59:59.000Z'),
    publishedAt: new Date('2026-07-05T00:00:00.000Z'),
    retrievedAt: new Date('2026-07-06T00:00:00.000Z'),
    effectiveAt: new Date('2026-07-10T00:00:00.000Z'),
    expiresAt: new Date('2026-10-10T00:00:00.000Z'),
    methodologySummary: 'Observed completed jobs normalized by equipment size and scope.',
    geographyDefinitionJson: { type: 'state' },
    cohortDefinitionJson: { service: 'heat-pump replacement' },
    percentileDefinitionJson: { low: 'p25', high: 'p75' },
    reviewedAt: new Date('2026-07-08T00:00:00.000Z'),
    activatedAt: new Date('2026-07-10T00:00:00.000Z'),
    importRunStatus: 'VALIDATED',
    importChecksumSha256: 'a'.repeat(64),
    ...overrides,
  };
}

test('accepts a current, reviewed, healthy, traceable benchmark', () => {
  assert.deepEqual(
    qualifyServicePriceBenchmark(benchmark(), evaluatedAt),
    { qualified: true, reasons: [] },
  );
});

test('fails closed when source health is stale or unhealthy', () => {
  const result = qualifyServicePriceBenchmark(benchmark({
    sourceHealthStatus: 'DEGRADED',
    sourceHealthCheckedAt: new Date('2026-07-25T00:00:00.000Z'),
  }), evaluatedAt);

  assert.equal(result.qualified, false);
  assert.ok(result.reasons.includes('SOURCE_UNHEALTHY'));
  assert.ok(result.reasons.includes('SOURCE_HEALTH_STALE'));
});

test('fails closed for expired, unreviewed, or statistically thin releases', () => {
  const result = qualifyServicePriceBenchmark(benchmark({
    releaseStatus: 'IN_REVIEW',
    reviewedAt: null,
    expiresAt: new Date('2026-07-28T11:00:00.000Z'),
    sampleSize: 2,
  }), evaluatedAt);

  assert.equal(result.qualified, false);
  assert.ok(result.reasons.includes('RELEASE_NOT_ACTIVE'));
  assert.ok(result.reasons.includes('RELEASE_NOT_REVIEWED'));
  assert.ok(result.reasons.includes('RELEASE_NOT_CURRENT'));
  assert.ok(result.reasons.includes('SAMPLE_TOO_SMALL'));
});

test('fails closed when licensing, provenance, methodology, or distribution is invalid', () => {
  const result = qualifyServicePriceBenchmark(benchmark({
    sourceRightsStatus: 'REVOKED',
    sourceUrl: '',
    licenseSummary: '',
    methodologySummary: '',
    baseLow: 10000,
    baseHigh: 9000,
  }), evaluatedAt);

  assert.equal(result.qualified, false);
  assert.ok(result.reasons.includes('SOURCE_RIGHTS_NOT_APPROVED'));
  assert.ok(result.reasons.includes('SOURCE_PROVENANCE_INCOMPLETE'));
  assert.ok(result.reasons.includes('LICENSE_SUMMARY_MISSING'));
  assert.ok(result.reasons.includes('METHODOLOGY_MISSING'));
  assert.ok(result.reasons.includes('PRICE_DISTRIBUTION_INVALID'));
});

test('engine emits a categorical verdict only for a qualified match', () => {
  const engine = new ServicePriceRadarEngine();
  const property = {
    propertyId: 'property-1',
    homeownerProfileId: 'profile-1',
    dwellingType: 'SINGLE_FAMILY_DETACHED',
    propertySize: 1900,
    sizeBand: 'MEDIUM',
    yearBuilt: 1995,
    city: 'Hoboken',
    state: 'NJ',
    zipCode: '07030',
    systems: {
      heatingType: null,
      coolingType: null,
      waterHeaterType: null,
      roofType: null,
      foundationType: null,
      sidingType: null,
      hasDrainageIssues: null,
    },
  };
  const input = {
    serviceCategory: 'HVAC',
    serviceSubcategory: 'heat_pump_replacement',
    serviceLabelRaw: '3 ton heat pump replacement',
    quoteAmount: 8000,
    quoteCurrency: 'USD',
  };
  const record = benchmark();

  const qualified = engine.evaluate(property, input, [], {
    matched: true,
    qualified: true,
    benchmark: record,
    qualificationReasons: [],
  });
  const unqualified = engine.evaluate(property, input, [], {
    matched: false,
    qualified: false,
    benchmark: null,
    qualificationReasons: ['SOURCE_UNHEALTHY'],
  });

  assert.equal(qualified.verdict, 'FAIR');
  assert.equal(qualified.pricingFactorsJson.benchmark.evidenceLevel, 'QUALIFIED_BENCHMARK');
  assert.equal(qualified.pricingFactorsJson.benchmark.sourceName, 'Reviewed Provider');
  assert.equal(unqualified.verdict, 'INSUFFICIENT_DATA');
  assert.equal(unqualified.pricingFactorsJson.benchmark.evidenceLevel, 'CATEGORY_HEURISTIC_ONLY');
});
