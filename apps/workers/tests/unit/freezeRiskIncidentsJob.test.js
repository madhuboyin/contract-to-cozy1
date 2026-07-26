const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  freezeRiskIncidentsJob,
  getFreezeForecast,
} = require('../../src/jobs/freezeRiskIncidents.job.ts');

const NOW = new Date('2026-07-26T14:05:00Z');
const noopLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; },
};

function property(overrides = {}) {
  return {
    id: 'property-1',
    zipCode: '08536',
    city: 'Plainsboro',
    state: 'NJ',
    latitude: 40.33,
    longitude: -74.58,
    ...overrides,
  };
}

function forecast(minimumFahrenheit, overrides = {}) {
  return {
    status: 'ok',
    forecast: {
      latitude: 40.33,
      longitude: -74.58,
      minimumFahrenheit,
      windowStart: NOW.toISOString(),
      windowEnd: '2026-07-28T02:05:00.000Z',
      sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=40.33&longitude=-74.58',
      rawPayload: { samples: [{ at: '2026-07-27T03:00:00.000Z', celsius: -5 }] },
      ...overrides,
    },
  };
}

function fakeDeps({
  properties = [property()],
  forecasts = {},
  existingEvents = {},
  ingestOutcome = 'created',
  ingestError = null,
} = {}) {
  const calls = {
    registrations: [],
    begins: [],
    completions: [],
    forecasts: [],
    ingestions: [],
    geoCaches: [],
  };
  const deps = {
    registry: {
      async register(input) {
        calls.registrations.push(input);
        return { id: 'freeze-source-1', key: input.key };
      },
    },
    runs: {
      async begin(input) {
        calls.begins.push(input);
        return { runnable: true, run: { id: 'freeze-run-1' } };
      },
      async complete(runId, input) {
        calls.completions.push({ runId, input });
        return { id: runId, ...input };
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.ingestions.push(input);
        if (ingestError) throw ingestError;
        return {
          jobId: 'radar-ingest-job-1',
          revisionIdentity: 'revision-1',
          payloadFingerprint: 'fingerprint-1',
          lifecycleStatus: input.observation.lifecycleStatus,
        };
      },
    },
    eventLookup: {
      async findUnique(query) {
        const providerEventId =
          query.where.sourceDefinitionId_providerEventId.providerEventId;
        return existingEvents[providerEventId] ?? null;
      },
      async findFirst(query) {
        return existingEvents[query.where.providerEventId] ?? null;
      },
    },
    logger: noopLogger,
    iterateAllProperties: async function* () {
      for (const item of properties) yield item;
    },
    async getPropertyGeo(item, cache) {
      calls.geoCaches.push(cache);
      return { lat: item.latitude, lon: item.longitude, name: item.zipCode };
    },
    async getForecast(lat, lon) {
      const item = properties.find(
        (candidate) => candidate.latitude === lat && candidate.longitude === lon,
      );
      calls.forecasts.push({ lat, lon, propertyId: item?.id });
      return forecasts[item?.id] ?? forecast(20);
    },
    now: () => NOW,
    correlationId: () => 'correlation-1',
    sleep: async () => {},
    env: {
      NODE_ENV: 'test',
      WORKER_EXTERNAL_INGEST_ENABLED: 'true',
    },
  };
  return { calls, deps };
}

test('a provider failure preserves lifecycle and does not block another property', async () => {
  const properties = [
    property({ id: 'property-failing' }),
    property({ id: 'property-ok', latitude: 40.34, longitude: -74.57 }),
  ];
  const { calls, deps } = fakeDeps({
    properties,
    forecasts: {
      'property-failing': { status: 'failed', error: 'network unreachable' },
      'property-ok': forecast(18),
    },
  });

  const result = await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.resolved, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.sourceRunStatus, 'partial');
  assert.equal(calls.ingestions.length, 1);
  assert.equal(calls.ingestions[0].observation.geography.propertyId, 'property-ok');
  assert.equal(calls.completions[0].input.status, 'partial');
  assert.equal(calls.completions[0].input.observationsReceived, 1);
  assert.equal(calls.completions[0].input.observationsRejected, 0);
  assert.equal(calls.completions[0].input.metadataJson.forecastsFailed, 1);
  assert.deepEqual(calls.completions[0].input.dataFreshThrough, NOW);
});

test('all provider failures fail health without projecting a resolution', async () => {
  const { calls, deps } = fakeDeps({
    forecasts: {
      'property-1': { status: 'failed', error: 'Open-Meteo timeout' },
    },
    existingEvents: {
      'open-meteo:freeze-risk:property-1': { id: 'event-1', status: 'active' },
    },
  });

  const result = await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'failed');
  assert.equal(result.resolved, 0);
  assert.equal(calls.ingestions.length, 0);
  assert.equal(calls.completions[0].input.dataFreshThrough, undefined);
  assert.match(calls.completions[0].input.errorMessage, /forecast requests failed/);
});

test('a successful warm forecast resolves only an existing active canonical event', async () => {
  const providerEventId = 'open-meteo:freeze-risk:property-1';
  const { calls, deps } = fakeDeps({
    forecasts: { 'property-1': forecast(35) },
    existingEvents: {
      [providerEventId]: { id: 'event-1', status: 'active' },
    },
  });

  const result = await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(result.resolved, 1);
  assert.equal(result.sourceRunStatus, 'success');
  assert.equal(calls.ingestions.length, 1);
  assert.equal(calls.ingestions[0].observation.providerEventId, providerEventId);
  assert.equal(calls.ingestions[0].observation.lifecycleStatus, 'resolved');
  assert.equal(calls.completions[0].input.eventsResolved, 0);
});

test('a warm forecast without a prior event is a verified successful empty run', async () => {
  const { calls, deps } = fakeDeps({
    forecasts: { 'property-1': forecast(35) },
  });

  const result = await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'successful_empty');
  assert.equal(calls.ingestions.length, 0);
  assert.equal(calls.completions[0].input.status, 'successful_empty');
  assert.deepEqual(calls.completions[0].input.dataFreshThrough, NOW);
});

test('source registration, run accounting, and property geo cache are canonical', async () => {
  const properties = [
    property(),
    property({ id: 'property-2', latitude: 40.34, longitude: -74.57 }),
  ];
  const { calls, deps } = fakeDeps({ properties });

  await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(calls.registrations[0].key, 'open-meteo-freeze-forecast');
  assert.equal(calls.registrations[0].provider, 'Open-Meteo');
  assert.equal(calls.registrations[0].sourceType, 'weather_provider');
  assert.equal(calls.registrations[0].freshnessSeconds, 8 * 3_600);
  assert.equal(calls.begins.length, 1);
  assert.equal(calls.completions[0].input.propertiesEvaluated, 2);
  assert.equal(calls.geoCaches.length, 2);
  assert.equal(calls.geoCaches[0], calls.geoCaches[1]);
});

test('complete ingestion rejection fails the source run instead of reporting success', async () => {
  const { calls, deps } = fakeDeps({ ingestError: new Error('invalid observation') });

  const result = await freezeRiskIncidentsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'failed');
  assert.equal(result.failed, 1);
  assert.equal(calls.completions[0].input.observationsRejected, 1);
  assert.match(calls.completions[0].input.errorMessage, /canonical freeze observation/);
});

test('Open-Meteo parser bounds samples to 36 hours and reports provider errors', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        hourly: {
          time: [
            '2026-07-26T13:00',
            '2026-07-27T02:00',
            '2026-07-28T03:00',
          ],
          temperature_2m: [-20, -5, -30],
        },
      }),
    });
    const result = await getFreezeForecast(40.33, -74.58, NOW);
    assert.equal(result.status, 'ok');
    assert.equal(result.forecast.minimumFahrenheit, 23);
    assert.equal(result.forecast.rawPayload.samples.length, 1);

    global.fetch = async () => { throw new Error('network unreachable'); };
    const failed = await getFreezeForecast(40.33, -74.58, NOW);
    assert.deepEqual(failed, { status: 'failed', error: 'network unreachable' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('provider job has no direct Incident or Guidance projection path', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/jobs/freezeRiskIncidents.job.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /IncidentService|upsertIncident|setStatus/);
  assert.doesNotMatch(source, /guidanceJourneyService|ingestSignal/);
  assert.match(source, /deps\.ingestQueue\.enqueue/);
  assert.match(source, /deps\.runs\.complete/);
});
