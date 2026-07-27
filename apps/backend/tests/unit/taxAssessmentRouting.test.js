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
const {
  NYC_DOF_BRONX_TAX_CLASS_1_PILOT,
  reviewedTaxPilotRuntimeConfig,
} = require('../../src/services/taxAssessorAdapters/reviewedTaxPilotSources');
const {
  upsertReviewedTaxPilotSources,
} = require('../../src/scripts/seedReviewedTaxPilots');

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

test('reviewed Bronx pilot has a valid privacy-bounded split-address contract', () => {
  const source = reviewedTaxPilotRuntimeConfig(
    NYC_DOF_BRONX_TAX_CLASS_1_PILOT,
    'pilot-source',
  );
  assert.deepEqual(validateTaxAssessorDataSource(source), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(taxCoverageRegistration(source), {
    coverageType: 'city',
    countryCode: 'US',
    stateCode: 'NY',
    cityName: 'bronx',
  });

  const where = buildTaxAssessmentWhereClause(
    {
      street: '2563 Tiemann Avenue',
      city: 'Bronx',
      state: 'NY',
      postalCode: '10469',
    },
    source.queryFilterJson,
  );
  assert.match(where, /housenum_lo='2563'/);
  assert.match(where, /upper\(street_name\) like '%TIEMANN%AVE%'/);
  assert.match(where, /zip_code='10469'/);
  assert.match(where, /boro='2'/);
  assert.match(where, /rectype='1'/);
  assert.match(where, /curtaxclass='1'/);
  assert.doesNotMatch(where, /appealInfoUrl|eventTtlDays|assessmentStage/);
});

test('reviewed pilot seeder performs an isolated idempotent source upsert', async () => {
  const calls = [];
  const count = await upsertReviewedTaxPilotSources({
    taxAssessorDataSource: {
      async upsert(input) {
        calls.push(input);
        return input.create;
      },
    },
  });

  assert.equal(count, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, {
    slug: 'nyc-dof-bronx-tax-class-1',
  });
  assert.equal(calls[0].create.datasetId, '8y4t-faws');
  assert.equal(calls[0].create.normalizedCoverageKey, 'US-NY-bronx');
  assert.equal(calls[0].update.queryFilterJson.latestTaxYearOnly, true);
});

test('Bronx pilot selects only reviewed fields and maps official split addresses', async () => {
  let requestedUrl;
  const source = reviewedTaxPilotRuntimeConfig(
    NYC_DOF_BRONX_TAX_CLASS_1_PILOT,
    'pilot-source',
  );
  const adapter = new SocrataTaxAdapter(
    async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify([{
        parid: '2044880067',
        curacttot: '43080',
        pyacttot: '39360',
        year: '2027',
        housenum_lo: '2563',
        street_name: 'TIEMANN AVENUE',
        zip_code: '10469',
      }, {
        parid: '2044880067',
        curacttot: '43080',
        pyacttot: '39360',
        year: '2027',
        housenum_lo: '2563',
        street_name: 'TIEMANN AVENUE',
        zip_code: '10469',
      }, {
        parid: '2044880067',
        curacttot: '39360',
        pyacttot: '40860',
        year: '2026',
        housenum_lo: '2563',
        street_name: 'TIEMANN AVENUE',
        zip_code: '10469',
      }]), { status: 200 });
    },
    async () => {},
    TAX_ASSESSMENT_FETCH_TIMEOUT_MS,
    async () => {},
    { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } },
  );

  const records = await adapter.fetchAssessments(source, {
    street: '2563 Tiemann Avenue',
    city: 'Bronx',
    state: 'NY',
    postalCode: '10469',
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, '2044880067');
  assert.equal(records[0].parcelId, '2044880067');
  assert.equal(records[0].situsAddress, '2563 TIEMANN AVENUE');
  assert.equal(records[0].matchConfidence, 'high');
  assert.equal(records[0].matchMethod, 'address_with_parcel_evidence');
  const requestUrl = new URL(requestedUrl);
  const selected = requestUrl.searchParams.get('$select').split(',');
  assert.deepEqual(selected, [
    'curacttot',
    'housenum_lo',
    'parid',
    'pyacttot',
    'street_name',
    'year',
    'zip_code',
  ]);
  assert.equal(requestUrl.searchParams.get('$order'), 'year DESC');
  assert.doesNotMatch(requestedUrl, /owner|mail_address/);
});

test('Bronx pilot suppresses an ambiguous address that maps to multiple parcels', async () => {
  const source = reviewedTaxPilotRuntimeConfig(
    NYC_DOF_BRONX_TAX_CLASS_1_PILOT,
    'pilot-source',
  );
  const warnings = [];
  const adapter = new SocrataTaxAdapter(
    async () => new Response(JSON.stringify([
      {
        parid: 'parcel-a',
        curacttot: '43080',
        pyacttot: '39360',
        year: '2027',
        housenum_lo: '2563',
        street_name: 'TIEMANN AVENUE',
        zip_code: '10469',
      },
      {
        parid: 'parcel-b',
        curacttot: '44000',
        pyacttot: '40000',
        year: '2027',
        housenum_lo: '2563',
        street_name: 'TIEMANN AVENUE',
        zip_code: '10469',
      },
    ]), { status: 200 }),
    async () => {},
    TAX_ASSESSMENT_FETCH_TIMEOUT_MS,
    async () => {},
    {
      info() {},
      warn(value) { warnings.push(value); },
      error() {},
      debug() {},
      fatal() {},
      child() { return this; },
    },
  );

  const records = await adapter.fetchAssessments(source, {
    street: '2563 Tiemann Avenue',
    city: 'Bronx',
    state: 'NY',
    postalCode: '10469',
  });

  assert.deepEqual(records, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].distinctParcelCount, 2);
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
