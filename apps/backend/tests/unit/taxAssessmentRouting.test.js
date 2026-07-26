const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  SocrataTaxAdapter,
  TAX_ASSESSMENT_FETCH_TIMEOUT_MS,
  buildTaxAssessmentWhereClause,
  validateTaxAssessorDataSource,
} = require('../../src/services/taxAssessorAdapters/socrataTaxAdapter');
const {
  TaxAssessmentFetchService,
  taxCoverageKey,
  taxCoverageRegistration,
} = require('../../src/services/taxAssessmentFetch.service');

function sourceFixture(overrides = {}) {
  return {
    id: 'source-county',
    name: 'Reviewed county source',
    slug: 'reviewed-county',
    status: 'ACTIVE',
    adapterType: 'SOCRATA',
    baseUrl: 'https://data.example.gov',
    datasetId: 'abcd-1234',
    apiKeyEnvVar: null,
    coverageType: 'COUNTY',
    normalizedCoverageKey: 'US-NJ-COUNTY-34021',
    fieldMappingJson: {
      row_id: 'externalId',
      parcel: 'parcelId',
      assessed: 'assessedValueRaw',
      situs: 'situsAddress',
      postal: 'situsPostalCode',
    },
    queryFilterJson: {
      addressColumn: 'situs',
      class_code: "R'1",
      eventTtlDays: 120,
    },
    ...overrides,
  };
}

const property = {
  id: 'property-1',
  address: '123 Main Street',
  city: 'Plainsboro Township',
  state: 'NJ',
  zipCode: '08536',
  countyFips: '34021',
};
const propertyAddress = {
  street: property.address,
  city: property.city,
  state: property.state,
  postalCode: property.zipCode,
  countyFips: property.countyFips,
};

test('coverage routing uses the declared CITY, COUNTY, and STATE key contract', () => {
  assert.equal(taxCoverageKey('CITY', property), 'US-NJ-plainsboro-township');
  assert.equal(taxCoverageKey('COUNTY', property), 'US-NJ-COUNTY-34021');
  assert.equal(taxCoverageKey('STATE', property), 'US-NJ');
  assert.deepEqual(taxCoverageRegistration(sourceFixture()), {
    coverageType: 'county',
    countryCode: 'US',
    countyFips: '34021',
  });
  assert.deepEqual(taxCoverageRegistration(sourceFixture({
    coverageType: 'CITY',
    normalizedCoverageKey: 'US-NJ-plainsboro-township',
  })), {
    coverageType: 'city',
    countryCode: 'US',
    stateCode: 'NJ',
    cityName: 'plainsboro township',
  });
  assert.deepEqual(taxCoverageRegistration(sourceFixture({
    coverageType: 'STATE',
    normalizedCoverageKey: 'US-NJ',
  })), {
    coverageType: 'state',
    countryCode: 'US',
    stateCode: 'NJ',
  });
});

test('source validation rejects malformed datasets and unsafe field mappings', () => {
  assert.deepEqual(validateTaxAssessorDataSource(sourceFixture()), {
    valid: true,
    errors: [],
  });
  const result = validateTaxAssessorDataSource(sourceFixture({
    datasetId: '../secret',
    fieldMappingJson: {
      'bad);delete': 'externalId',
      assessed: 'inventedCanonicalField',
    },
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /datasetId/);
  assert.match(result.errors.join(' '), /Invalid source field/);
  assert.match(result.errors.join(' '), /Unsupported canonical/);
  assert.match(result.errors.join(' '), /situsAddress/);
});

test('SoQL construction validates identifiers and escapes literal values', () => {
  const where = buildTaxAssessmentWhereClause(
    {
      street: "123 O'Neil Street",
      city: 'Plainsboro Township',
      state: 'NJ',
      postalCode: '08536',
    },
    {
      addressColumn: 'situs_address',
      owner_name: "O'Brien",
      active: true,
    },
  );
  assert.match(where, /upper\(situs_address\)/);
  assert.match(where, /O%NEIL%ST/);
  assert.match(where, /owner_name='O''Brien'/);
  assert.match(where, /active=true/);
  assert.throws(
    () => buildTaxAssessmentWhereClause(
      { street: '123 Main St', city: 'X', state: 'NJ' },
      { 'status);drop table': 'active' },
    ),
    /Unsafe Socrata query filter identifier/,
  );
});

test('adapter keeps only address-confident rows and sends an abortable request', async () => {
  let requestedUrl;
  let requestInit;
  const adapter = new SocrataTaxAdapter(
    async (url, init) => {
      requestedUrl = String(url);
      requestInit = init;
      return new Response(JSON.stringify([
        {
          row_id: 'match-1',
          parcel: 'parcel-1',
          assessed: '250000',
          situs: '123 Main St',
          postal: '08536',
        },
        {
          row_id: 'wrong-1',
          parcel: 'parcel-2',
          assessed: '300000',
          situs: '999 Main St',
          postal: '08536',
        },
      ]), { status: 200 });
    },
    async () => {},
    TAX_ASSESSMENT_FETCH_TIMEOUT_MS,
    async () => {},
    { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } },
  );
  const records = await adapter.fetchAssessments(sourceFixture(), propertyAddress);

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'match-1');
  assert.equal(records[0].matchConfidence, 'high');
  assert.equal(records[0].matchMethod, 'address_with_parcel_evidence');
  assert.ok(requestInit.signal instanceof AbortSignal);
  const query = new URL(requestedUrl).searchParams.get('$where');
  assert.match(query, /class_code='R''1'/);
});

test('adapter aborts a fetch that exceeds the bounded timeout', async () => {
  const adapter = new SocrataTaxAdapter(
    (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        'abort',
        () => reject(new DOMException('Timed out', 'AbortError')),
      );
    }),
    async () => {},
    5,
    async () => {},
    { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } },
  );
  await assert.rejects(
    adapter.fetchAssessments(sourceFixture(), propertyAddress),
    /Timed out/,
  );
});

test('batch fetch loads sources once, routes by coverage, and caches duplicate addresses', async () => {
  let sourceReads = 0;
  let adapterCalls = 0;
  const updates = [];
  const db = {
    taxAssessorDataSource: {
      async findMany() {
        sourceReads += 1;
        return [sourceFixture()];
      },
      async update(args) {
        updates.push(args);
        return args.data;
      },
    },
  };
  const service = new TaxAssessmentFetchService(
    db,
    {
      async fetchAssessments() {
        adapterCalls += 1;
        return [{
          externalId: 'record-1',
          situsAddress: '123 Main St',
          matchConfidence: 'high',
          matchMethod: 'address',
          rawData: {},
        }];
      },
    },
    { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } },
  );
  const prepared = await service.prepareSources();
  const batch = await service.fetchForProperties([
    property,
    { ...property, id: 'property-2' },
    { ...property, id: 'property-uncovered', countyFips: '34023' },
  ], prepared);

  assert.equal(sourceReads, 1);
  assert.equal(adapterCalls, 1);
  assert.equal(batch.propertiesCovered, 2);
  assert.equal(batch.propertiesUncovered, 1);
  assert.equal(batch.fetchAttempts, 1);
  assert.equal(batch.fetchSucceeded, 1);
  assert.equal(batch.results.length, 2);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.totalAssessmentsFetched.increment, 1);
});
