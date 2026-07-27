const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  TAX_ASSESSMENT_ADAPTER_VERSION,
  DEFAULT_TAX_ASSESSMENT_INGEST_CRON,
  ingestTaxAssessmentEventsJob,
} = require('../../src/jobs/ingestTaxAssessmentEvents.job');

function sourceFixture() {
  return {
    id: 'tax-source-row-1',
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
      assessed: 'assessedValueRaw',
      situs: 'situsAddress',
    },
    queryFilterJson: { addressColumn: 'situs' },
  };
}

function propertyFixture(id = 'property-1') {
  return {
    id,
    address: '123 Main Street',
    city: 'Plainsboro Township',
    state: 'NJ',
    zipCode: '08536',
    countyFips: '34021',
    latitude: null,
    longitude: null,
    geocodedZipCode: null,
  };
}

function recordFixture() {
  return {
    externalId: 'assessment-1',
    parcelId: 'parcel-1',
    assessedValueRaw: '250000',
    previousAssessedValueRaw: '200000',
    assessmentDate: '2026-07-01',
    taxYear: '2026',
    situsAddress: '123 Main St',
    situsPostalCode: '08536',
    matchConfidence: 'high',
    matchMethod: 'address_with_parcel_evidence',
    rawData: {},
  };
}

function fakeDeps(overrides = {}) {
  const calls = {
    register: [],
    begin: [],
    complete: [],
    enqueue: [],
    fetch: [],
  };
  const source = sourceFixture();
  const property = propertyFixture();
  const prepared = {
    sources: [source],
    coverage: [{
      coverageType: 'county',
      countryCode: 'US',
      countyFips: '34021',
    }],
    invalidSources: 0,
  };
  const deps = {
    registry: {
      async register(input) {
        calls.register.push(input);
        return { id: 'radar-source-1', key: 'tax-assessment-ingest' };
      },
    },
    runs: {
      async begin(input) {
        calls.begin.push(input);
        return {
          runnable: true,
          reason: 'source is runnable',
          run: { id: 'run-1', correlationId: input.correlationId },
        };
      },
      async complete(runId, input) {
        calls.complete.push({ runId, input });
        return input;
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.enqueue.push(input);
        return {
          jobId: 'job-1',
          revisionIdentity: 'revision-1',
          payloadFingerprint: 'fingerprint-1',
          lifecycleStatus: input.observation.lifecycleStatus,
        };
      },
    },
    fetchService: {
      async prepareSources() {
        return prepared;
      },
      async fetchForProperties(properties, sourceSet, options) {
        calls.fetch.push({ properties, sourceSet, options });
        return {
          results: [{ property, dataSource: source, records: [recordFixture()] }],
          propertiesExamined: 2,
          propertiesCovered: 1,
          propertiesUncovered: 1,
          fetchAttempts: 1,
          fetchSucceeded: 1,
          fetchFailed: 0,
          invalidSources: 0,
        };
      },
    },
    async *iterateAllProperties() {
      yield property;
      yield propertyFixture('property-uncovered');
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    now: () => new Date('2026-07-26T18:00:00.000Z'),
    correlationId: () => 'correlation-1',
    env: { NODE_ENV: 'test' },
    ...overrides,
  };
  return { calls, deps };
}

test('tax ingest registers reviewed coverage and queues durable canonical observations', async () => {
  const { calls, deps } = fakeDeps();

  const result = await ingestTaxAssessmentEventsJob(undefined, deps);

  assert.deepEqual(result, {
    examined: 3,
    refreshed: 1,
    skipped: 1,
    failed: 0,
    reason: undefined,
    smokeCorrelationId: undefined,
    sourceRunStatus: 'success',
    configuredJurisdictions: 1,
    invalidJurisdictions: 0,
    coveredProperties: 1,
    uncoveredProperties: 1,
    fetchAttempts: 1,
    fetchSucceeded: 1,
    fetchFailed: 0,
    rawRecords: 1,
    queued: 1,
    rejected: 0,
    dryRun: false,
  });
  assert.equal(calls.register[0].adapterVersion, TAX_ASSESSMENT_ADAPTER_VERSION);
  assert.equal(calls.register[0].scheduleCron, DEFAULT_TAX_ASSESSMENT_INGEST_CRON);
  assert.deepEqual(calls.register[0].coverage, [{
    coverageType: 'county',
    countryCode: 'US',
    countyFips: '34021',
  }]);
  assert.equal(calls.begin[0].triggerType, 'scheduled');
  assert.equal(calls.enqueue.length, 1);
  assert.equal(calls.enqueue[0].observation.sourceFamily, 'tax');
  assert.equal(calls.enqueue[0].observation.geography.propertyId, 'property-1');
  assert.equal(calls.enqueue[0].observation.expiresAt, '2026-10-29T00:00:00.000Z');
  assert.equal(calls.complete[0].input.status, 'success');
  assert.equal(calls.complete[0].input.observationsReceived, 1);
  assert.equal(calls.fetch[0].options.recordBookkeeping, true);
});

test('tax source registration reports the resolved runtime cron override', async () => {
  const { calls, deps } = fakeDeps({
    env: {
      NODE_ENV: 'test',
      TAX_ASSESSMENT_INGEST_CRON: '15 7 * * 2',
    },
  });

  await ingestTaxAssessmentEventsJob(undefined, deps);

  assert.equal(calls.register[0].scheduleCron, '15 7 * * 2');
});

test('dry run fetches and validates without canonical or bookkeeping writes', async () => {
  const { calls, deps } = fakeDeps();

  const result = await ingestTaxAssessmentEventsJob({ dryRun: true }, deps);

  assert.equal(result.sourceRunStatus, 'dry_run');
  assert.equal(result.refreshed, 1);
  assert.equal(result.queued, 0);
  assert.equal(calls.register.length, 0);
  assert.equal(calls.begin.length, 0);
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.enqueue.length, 0);
  assert.equal(calls.fetch[0].options.recordBookkeeping, false);
});

test('provider and observation failures are structured and preserve source health semantics', async () => {
  const { calls, deps } = fakeDeps({
    ingestQueue: {
      async enqueue() {
        throw new Error('queue unavailable');
      },
    },
  });
  const originalFetch = deps.fetchService.fetchForProperties;
  deps.fetchService.fetchForProperties = async (...args) => ({
    ...(await originalFetch(...args)),
    fetchFailed: 1,
  });

  const result = await ingestTaxAssessmentEventsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'failed');
  assert.equal(result.failed, 2);
  assert.equal(result.rejected, 1);
  assert.equal(calls.complete[0].input.status, 'failed');
  assert.equal(calls.complete[0].input.dataFreshThrough.toISOString(), '2026-07-26T18:00:00.000Z');
  assert.match(calls.complete[0].input.errorMessage, /observations were rejected/);
});
