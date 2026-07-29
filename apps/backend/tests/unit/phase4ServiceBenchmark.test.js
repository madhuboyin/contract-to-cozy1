const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { scoreBenchmark } = require('../../src/services/servicePriceRadar.service.ts');

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

function benchmark(overrides = {}) {
  return {
    id: 'benchmark-1',
    normalizedScopeKey: 'hvac:general',
    serviceCategory: 'HVAC',
    serviceSubcategory: null,
    regionType: 'STATE',
    regionKey: 'NJ',
    homeType: null,
    sizeBand: null,
    baseLow: 100,
    baseHigh: 200,
    baseMedian: 150,
    laborFactor: null,
    materialFactor: null,
    complexityFactorJson: null,
    sourceLabel: null,
    ...overrides,
  };
}

test('benchmark matching rejects explicit dwelling and size conflicts', () => {
  assert.equal(
    scoreBenchmark(benchmark({ homeType: 'CONDO' }), property, null),
    Number.NEGATIVE_INFINITY,
  );
  assert.equal(
    scoreBenchmark(benchmark({ sizeBand: 'LARGE' }), property, null),
    Number.NEGATIVE_INFINITY,
  );
});

test('benchmark matching accepts generic or exact canonical property dimensions', () => {
  assert.ok(Number.isFinite(scoreBenchmark(benchmark(), property, null)));
  assert.ok(Number.isFinite(scoreBenchmark(benchmark({
    homeType: 'SINGLE_FAMILY_DETACHED',
    sizeBand: 'MEDIUM',
  }), property, null)));
});

test('benchmark matching rejects a different normalized service scope', () => {
  assert.equal(
    scoreBenchmark(
      benchmark({ normalizedScopeKey: 'hvac:heat_pump_replacement' }),
      property,
      null,
    ),
    Number.NEGATIVE_INFINITY,
  );
});
