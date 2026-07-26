const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node/register/transpile-only');

const {
  buildPropertyGeographyInvalidation,
  hasPropertyLocationIdentityChanged,
  normalizeCountyFips,
  normalizeUsZip,
  propertyCoordinatesSchema,
} = require('../../src/modules/homeEventRadar/domain/propertyGeography');
const {
  normalizedGeographySchema,
} = require('../../src/modules/homeEventRadar/contracts');

const property = {
  address: '94 Ashford Dr',
  city: 'Plainsboro Township',
  state: 'NJ',
  zipCode: '08536',
};

test('normalizes ZIP and county FIPS identifiers', () => {
  assert.equal(normalizeUsZip(' 08536 '), '08536');
  assert.equal(normalizeUsZip('085361234'), '08536-1234');
  assert.equal(normalizeCountyFips('34023'), '34023');
  assert.throws(() => normalizeUsZip('8536'));
  assert.throws(() => normalizeCountyFips('3402'));
});

test('enforces coordinate bounds', () => {
  assert.equal(propertyCoordinatesSchema.safeParse({ latitude: 40.35, longitude: -74.58 }).success, true);
  assert.equal(propertyCoordinatesSchema.safeParse({ latitude: -91, longitude: -74.58 }).success, false);
  assert.equal(propertyCoordinatesSchema.safeParse({ latitude: 40.35, longitude: 181 }).success, false);
});

test('recognizes semantic location changes while ignoring formatting-only edits', () => {
  assert.equal(
    hasPropertyLocationIdentityChanged(property, {
      address: '  94   ASHFORD dr ',
      city: 'Plainsboro Township ',
      state: 'nj',
      zipCode: '08536',
    }),
    false,
  );
  assert.equal(hasPropertyLocationIdentityChanged(property, { zipCode: '08540' }), true);
  assert.equal(hasPropertyLocationIdentityChanged(property, { address: '96 Ashford Dr' }), true);
});

test('builds a fail-closed geography invalidation patch', () => {
  assert.deepEqual(buildPropertyGeographyInvalidation('085361234'), {
    normalizedZipCode: '08536-1234',
    latitude: null,
    longitude: null,
    geocodedZipCode: null,
    county: null,
    countyFips: null,
    geocodingStatus: 'PENDING',
    geocodingProvider: null,
    geocodingVersion: null,
    geocodedAt: null,
    geographyVersion: { increment: 1 },
  });
});

test('accepts a closed GeoJSON polygon fixture and rejects an out-of-bounds point', () => {
  const polygon = normalizedGeographySchema.parse({
    type: 'polygon',
    geoJson: {
      type: 'Polygon',
      coordinates: [[
        [-74.60, 40.34],
        [-74.56, 40.34],
        [-74.56, 40.37],
        [-74.60, 40.34],
      ]],
    },
  });
  assert.equal(polygon.type, 'polygon');
  assert.equal(
    normalizedGeographySchema.safeParse({
      type: 'polygon',
      geoJson: {
        type: 'Polygon',
        coordinates: [[
          [-74.60, 40.34],
          [-74.56, 40.34],
          [-74.56, 40.37],
          [-74.60, 40.37],
        ]],
      },
    }).success,
    false,
  );
  assert.equal(
    normalizedGeographySchema.safeParse({
      type: 'point',
      point: { latitude: 40.35, longitude: -181 },
    }).success,
    false,
  );
});
