const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  assertRadarDummyEnvironment,
  createIngestRadarSignalsJob,
  resolveRadarDummyScope,
} = require('../../src/jobs/ingestRadarSignals.job');
const {
  fetchDummyRadarSignals,
  fixtureRevisionAnchor,
} = require('../../src/radar/dummyRadar.client');

const FIXED_NOW = new Date('2026-07-26T14:17:42.000Z');
const PROPERTY = {
  id: 'property-allowlisted',
  address: '94 Ashford Dr',
  city: 'Plainsboro',
  state: 'NJ',
  zipCode: '08536',
};

function createHarness(overrides = {}) {
  const calls = {
    propertyQueries: [],
    registrations: [],
    begins: [],
    completions: [],
    ingestions: [],
  };
  const registry = {
    async register(input) {
      calls.registrations.push(input);
      return { id: `source-${input.family}`, key: input.key };
    },
  };
  const runs = {
    async begin(input) {
      calls.begins.push(input);
      return {
        runnable: true,
        reason: 'source is runnable',
        run: {
          id: `run-${calls.begins.length}`,
          sourceDefinitionId: `source-${input.sourceKey}`,
          status: 'started',
          correlationId: input.correlationId,
          attempt: 1,
        },
      };
    },
    async complete(runId, input) {
      calls.completions.push({ runId, input });
      return { id: runId, ...input };
    },
  };
  const ingestQueue = {
    async enqueue(input) {
      calls.ingestions.push(input);
      return {
        jobId: `ingest-${calls.ingestions.length}`,
        revisionIdentity: 'revision-1',
        payloadFingerprint: 'fingerprint-1',
        lifecycleStatus: input.observation.lifecycleStatus,
      };
    },
  };
  const dependencies = {
    propertyRepository: {
      async findMany(query) {
        calls.propertyQueries.push(query);
        return [PROPERTY];
      },
    },
    registry,
    runs,
    ingestQueue,
    fetchSignals: fetchDummyRadarSignals,
    now: () => FIXED_NOW,
    correlationId: () => 'correlation-fixed',
    env: {
      NODE_ENV: 'test',
      RADAR_DUMMY_TARGET_PROPERTY_IDS: PROPERTY.id,
      RADAR_DUMMY_FIXTURE_SET: 'property_scoped',
    },
    log: {
      info() {},
      warn() {},
      error() {},
    },
    ...overrides,
  };
  return {
    calls,
    dependencies,
    run: createIngestRadarSignalsJob(dependencies),
  };
}

test('fixture job uses canonical source runs and durable ingest enqueueing for every family', async () => {
  const harness = createHarness();
  const result = await harness.run();

  assert.deepEqual(result, {
    testData: true,
    targetProperties: 1,
    rawSignals: 4,
    sourceRuns: 4,
    accepted: 4,
    rejected: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    duplicateRevisions: 0,
    ingestJobsEnqueued: 4,
    matchJobsEnqueued: 0,
  });
  assert.equal(harness.calls.registrations.length, 4);
  assert.equal(harness.calls.begins.length, 4);
  assert.equal(harness.calls.completions.length, 4);
  assert.equal(harness.calls.ingestions.length, 4);

  for (const registration of harness.calls.registrations) {
    assert.equal(registration.sourceType, 'manual_import');
    assert.match(registration.name, /^Test data — Home Event Radar/);
    assert.equal(registration.configJson.testData, true);
    assert.deepEqual(registration.configJson.allowlistedPropertyIds, [PROPERTY.id]);
    assert.deepEqual(registration.coverage, [{
      coverageType: 'postal_code',
      countryCode: 'US',
      postalCode: '08536',
    }]);
  }
  for (const { observation, sourceRunId, correlationId } of harness.calls.ingestions) {
    assert.match(observation.title, /^\[Test data\]/);
    assert.equal(observation.rawPayload.testData, true);
    assert.equal(observation.rawPayload.testDataLabel, 'Test data');
    assert.match(observation.providerRevision, /^fixture-v1:/);
    assert.match(sourceRunId, /^run-/);
    assert.match(correlationId, /^test-fixture:correlation-fixed:/);
  }
  for (const completion of harness.calls.completions) {
    assert.equal(completion.input.status, 'success');
    assert.equal(completion.input.metadataJson.testData, true);
    assert.equal(completion.input.observationsReceived, 1);
  }
});

test('fixture generation is retry-idempotent within a revision window', async () => {
  const first = await fetchDummyRadarSignals([PROPERTY], FIXED_NOW);
  const retry = await fetchDummyRadarSignals(
    [PROPERTY],
    new Date('2026-07-26T14:29:59.000Z'),
  );
  const nextRevision = await fetchDummyRadarSignals(
    [PROPERTY],
    new Date('2026-07-26T14:31:00.000Z'),
  );

  assert.deepEqual(retry, first);
  assert.equal(first[0].providerEventId, nextRevision[0].providerEventId);
  assert.notEqual(first[0].raw.providerRevision, nextRevision[0].raw.providerRevision);
  assert.equal(
    fixtureRevisionAnchor(FIXED_NOW).toISOString(),
    '2026-07-26T14:00:00.000Z',
  );
});

test('production guard is enforced inside the job before property or source access', async () => {
  assert.throws(
    () => assertRadarDummyEnvironment({ NODE_ENV: 'production' }),
    /Refusing to run Home Event Radar test fixtures in production/,
  );
  const harness = createHarness({
    env: {
      NODE_ENV: 'production',
      RADAR_DUMMY_TARGET_PROPERTY_IDS: PROPERTY.id,
    },
  });
  await assert.rejects(harness.run, /Refusing to run Home Event Radar test fixtures in production/);
  assert.equal(harness.calls.propertyQueries.length, 0);
  assert.equal(harness.calls.registrations.length, 0);
});

test('property selection is bounded to explicit IDs or reviewed default postal codes', async () => {
  assert.deepEqual(
    resolveRadarDummyScope({
      RADAR_DUMMY_TARGET_PROPERTY_IDS: 'property-1, property-1, property-2',
      RADAR_DUMMY_TARGET_ZIPS: '08536',
      RADAR_DUMMY_MAX_PROPERTIES: '500',
    }),
    {
      propertyIds: ['property-1', 'property-2'],
      postalCodes: ['08536'],
      maxProperties: 100,
    },
  );
  assert.deepEqual(
    resolveRadarDummyScope({}),
    {
      propertyIds: [],
      postalCodes: ['08536', '10019'],
      maxProperties: 25,
    },
  );

  const harness = createHarness();
  await harness.run();
  assert.deepEqual(
    harness.calls.propertyQueries[0].where,
    { id: { in: [PROPERTY.id] } },
  );
  assert.equal(harness.calls.propertyQueries[0].take, 25);
});

test('one rejected fixture is isolated and produces an explicit partial source run', async () => {
  const rawSignals = await fetchDummyRadarSignals([PROPERTY], FIXED_NOW);
  const weatherSignals = rawSignals.filter((signal) => signal.provider === 'weather_provider');
  weatherSignals.push({
    ...weatherSignals[0],
    providerEventId: 'fixture-weather-rejected',
    raw: {
      ...weatherSignals[0].raw,
      providerRevision: 'fixture-rejected',
    },
  });
  let attempt = 0;
  const harness = createHarness({
    fetchSignals: async () => weatherSignals,
    ingestQueue: {
      async enqueue(input) {
        harness.calls.ingestions.push(input);
        attempt += 1;
        if (attempt === 1) throw new Error('simulated canonical rejection');
        return {
          jobId: 'ingest-accepted',
          revisionIdentity: 'revision-accepted',
          payloadFingerprint: 'fingerprint-accepted',
          lifecycleStatus: input.observation.lifecycleStatus,
        };
      },
    },
  });

  const result = await harness.run();
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.ingestJobsEnqueued, 1);
  assert.equal(result.matchJobsEnqueued, 0);
  assert.equal(harness.calls.completions[0].input.status, 'partial');
  assert.equal(harness.calls.completions[0].input.observationsRejected, 1);
  assert.match(harness.calls.completions[0].input.errorMessage, /simulated canonical rejection/);
});

test('legacy fixture job no longer writes RadarEvent or invokes matching directly', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/jobs/ingestRadarSignals.job.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /upsertCanonicalRadarEvent/);
  assert.doesNotMatch(source, /runMatchingForEvent/);
  assert.match(source, /deps\.ingestQueue\.enqueue/);
  assert.match(source, /deps\.runs\.complete/);
});
