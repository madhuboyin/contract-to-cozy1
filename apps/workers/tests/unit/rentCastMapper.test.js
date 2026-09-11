const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  fingerprintRentCastRecord,
  fullCountyFips,
  mapRentCastPropertyRecord,
} = require('../../src/propertyEnrichment/rentCastMapper.ts');

function record(overrides = {}) {
  return {
    id: 'record-1',
    formattedAddress: '5500 Grand Lake Dr, San Antonio, TX 78244',
    addressLine1: '5500 Grand Lake Dr',
    addressLine2: null,
    city: 'San Antonio',
    state: 'TX',
    stateFips: '48',
    zipCode: '78244',
    county: ' Bexar  County ',
    countyFips: '029',
    latitude: 29.475962,
    longitude: -98.351442,
    propertyType: 'Single Family',
    bedrooms: 0,
    bathrooms: 2.5,
    squareFootage: 1878,
    lotSize: 8850.5,
    yearBuilt: 1973,
    assessorID: '05076-103-0500',
    features: {
      cooling: true,
      coolingType: 'Central',
      exteriorType: 'Siding',
      fireplace: true,
      foundationType: 'Slab',
      heating: true,
      heatingType: 'Forced Air',
      pool: true,
      poolType: 'Concrete',
      roofType: 'Asphalt',
    },
    lastSalePrice: 270000,
    lastSaleDate: '2024-11-18T00:00:00.000Z',
    owner: { names: ['Private Owner'] },
    estimatedValue: 300000,
    rent: 2100,
    listing: { price: 310000 },
    taxAssessments: { 2025: { value: 290000 } },
    ...overrides,
  };
}

function factMap(facts) {
  return new Map(facts.map((fact) => [fact.factKey, fact.value]));
}

test('maps every explicit RentCast dwelling type and leaves Land/unknown unsupported', () => {
  const cases = [
    ['Single Family', 'DETACHED_SINGLE_FAMILY'],
    ['Townhouse', 'TOWNHOUSE'],
    ['Condo', 'CONDO_UNIT'],
    ['Apartment', 'APARTMENT_UNIT'],
    ['Multi-Family', 'MULTI_FAMILY'],
    ['Manufactured', 'MANUFACTURED_HOME'],
    ['Land', undefined],
    ['Cabin', undefined],
    [undefined, undefined],
  ];
  for (const [providerType, expected] of cases) {
    const facts = factMap(mapRentCastPropertyRecord(record({ propertyType: providerType }), 2026));
    assert.equal(facts.get('core.dwellingType'), expected);
  }
});

test('maps only valid allowlisted facts and retains zero bedrooms', () => {
  const facts = mapRentCastPropertyRecord(record(), 2026);
  assert.deepEqual(factMap(facts), new Map([
    ['core.dwellingType', 'DETACHED_SINGLE_FAMILY'],
    ['core.yearBuilt', 1973],
    ['core.propertySizeSqFt', 1878],
    ['core.bedrooms', 0],
    ['core.bathrooms', 2.5],
    ['exterior.lotSizeSqFt', 8850.5],
    ['location.county', 'Bexar County'],
    ['location.countyFips', '48029'],
    ['location.geocoded', { latitude: 29.475962, longitude: -98.351442 }],
    ['systems.heatingType', 'HVAC'],
    ['systems.coolingType', 'CENTRAL_AC'],
    ['structure.roofType', 'SHINGLE'],
    ['structure.foundationType', 'SLAB'],
    ['structure.sidingType', 'Siding'],
    ['systems.hasFireplace', true],
    ['exterior.hasPoolOrSpa', true],
  ]));
  const serialized = JSON.stringify(facts);
  assert.doesNotMatch(serialized, /sale|owner|estimate|rent|listing|tax|financ/i);
});

test('combines RentCast state/county components into canonical five-digit FIPS', () => {
  assert.equal(fullCountyFips('48', '029'), '48029');
  assert.equal(fullCountyFips('48', '48029'), '48029');
  assert.equal(fullCountyFips('48', '49029'), null);
  assert.equal(fullCountyFips('4', '029'), null);
  assert.equal(fullCountyFips('48', '29'), null);
});

test('omits malformed fields individually without failing valid fields', () => {
  const facts = factMap(mapRentCastPropertyRecord(record({
    yearBuilt: 1699,
    squareFootage: 10.5,
    bedrooms: -1,
    bathrooms: -0.5,
    lotSize: 0,
    county: '   ',
    countyFips: '29',
    latitude: 91,
    longitude: -98,
    features: undefined,
  }), 2026));
  assert.deepEqual([...facts.keys()], ['core.dwellingType']);
});

test('omits future years, partial coordinates, and lot size for attached/shared dwellings', () => {
  const condo = factMap(mapRentCastPropertyRecord(record({
    propertyType: 'Condo',
    yearBuilt: 2028,
    longitude: null,
  }), 2026));
  assert.equal(condo.has('core.yearBuilt'), false);
  assert.equal(condo.has('location.geocoded'), false);
  assert.equal(condo.has('exterior.lotSizeSqFt'), false);
  assert.equal(condo.has('exterior.hasPoolOrSpa'), false);
  assert.equal(condo.get('core.dwellingType'), 'CONDO_UNIT');

  const manufactured = factMap(mapRentCastPropertyRecord(record({ propertyType: 'Manufactured' }), 2026));
  assert.equal(manufactured.get('exterior.lotSizeSqFt'), 8850.5);
});

test('maps feature enums conservatively and rejects mixed or unsupported provider values', () => {
  const facts = factMap(mapRentCastPropertyRecord(record({
    features: {
      heating: true,
      heatingType: 'Heat Pump / Forced Air',
      cooling: false,
      coolingType: 'Central',
      roofType: 'Wood Shake',
      foundationType: 'Crawl Space',
      exteriorType: 'Brick / Vinyl',
      fireplace: false,
      pool: true,
      poolType: 'Concrete',
    },
  }), 2026));
  assert.equal(facts.has('systems.heatingType'), false);
  assert.equal(facts.has('systems.coolingType'), false);
  assert.equal(facts.has('structure.roofType'), false);
  assert.equal(facts.get('structure.foundationType'), 'CRAWL_SPACE');
  assert.equal(facts.get('structure.sidingType'), 'Brick / Vinyl');
  assert.equal(facts.get('systems.hasFireplace'), false);
  assert.equal(facts.get('exterior.hasPoolOrSpa'), true);
});

test('does not treat a shared or unclassified pool as a private-property pool', () => {
  for (const poolType of ['Community', 'Public', undefined]) {
    const facts = factMap(mapRentCastPropertyRecord(record({
      features: { pool: true, poolType },
    }), 2026));
    assert.equal(facts.has('exterior.hasPoolOrSpa'), false);
  }
  const noPool = factMap(mapRentCastPropertyRecord(record({
    features: { pool: false },
  }), 2026));
  assert.equal(noPool.get('exterior.hasPoolOrSpa'), false);
});

test('fingerprint is stable for accepted identity/facts and ignores forbidden raw fields', () => {
  const base = record();
  const fingerprint = fingerprintRentCastRecord(base, mapRentCastPropertyRecord(base, 2026));
  const reorderedFacts = [...mapRentCastPropertyRecord(base, 2026)].reverse();
  assert.equal(fingerprintRentCastRecord(base, reorderedFacts), fingerprint);
  assert.equal(
    fingerprintRentCastRecord(record({
      owner: { names: ['Different Owner'] },
      lastSalePrice: 999999,
      estimatedValue: 888888,
    }), mapRentCastPropertyRecord(base, 2026)),
    fingerprint,
  );
  assert.notEqual(
    fingerprintRentCastRecord(record({ squareFootage: 1900 }), mapRentCastPropertyRecord(record({ squareFootage: 1900 }), 2026)),
    fingerprint,
  );
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
});
