const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  AIRNOW_ADAPTER_VERSION,
  airNowAirQualityJob,
  airNowSourceRegistration,
  parseAirNowPayload,
} = require('../../src/jobs/airNowAirQuality.job');
const {
  AIRNOW_ACTIONABLE_AQI,
  AIRNOW_SEARCH_RADIUS_METERS,
  airNowRadarAdapter,
  isActionableAirNowReading,
} = require('../../src/radar/airNowRadarAdapter');

const NOW = new Date('2026-07-26T18:00:00.000Z');

function currentRecord(overrides = {}) {
  return {
    DateObserved: '2026-07-26',
    HourObserved: 13,
    LocalTimeZone: 'EST',
    ReportingArea: 'Central New Jersey',
    StateCode: 'NJ',
    Latitude: 40.35,
    Longitude: -74.58,
    ParameterName: 'PM2.5',
    AQI: 112,
    Category: { Number: 3, Name: 'Unhealthy for Sensitive Groups' },
    ...overrides,
  };
}

function forecastRecord(overrides = {}) {
  return {
    DateIssue: '2026-07-26',
    DateForecast: '2026-07-27',
    ReportingArea: 'Central New Jersey',
    StateCode: 'NJ',
    Latitude: 40.35,
    Longitude: -74.58,
    ParameterName: 'PM2.5',
    AQI: 165,
    Category: { Number: 4, Name: 'Unhealthy' },
    ActionDay: true,
    Discussion: 'Wildfire smoke is expected to affect the reporting area.',
    ...overrides,
  };
}

test('AirNow parser accepts current API envelopes and rejects malformed records', () => {
  const parsed = parseAirNowPayload(
    { Data: [currentRecord(), { AQI: 150 }] },
    'current',
    NOW,
  );

  assert.equal(parsed.readings.length, 1);
  assert.equal(parsed.rejected, 1);
  assert.equal(parsed.readings[0].aqi, 112);
  assert.equal(parsed.readings[0].expiresAt, '2026-07-26T20:00:00.000Z');
  assert.equal(isActionableAirNowReading(parsed.readings[0]), true);

  const below = parseAirNowPayload(
    [currentRecord({ AQI: AIRNOW_ACTIONABLE_AQI - 1, Category: { Number: 2, Name: 'Moderate' } })],
    'current',
    NOW,
  );
  assert.equal(isActionableAirNowReading(below.readings[0]), false);
});

test('AirNow adapter emits bounded reporting-area geography and smoke only with explicit evidence', async () => {
  const current = parseAirNowPayload([currentRecord()], 'current', NOW).readings[0];
  const currentObservation = await airNowRadarAdapter.normalize(current, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });
  assert.equal(currentObservation.sourceFamily, 'air_quality');
  assert.equal(currentObservation.eventType, 'air_quality');
  assert.equal(currentObservation.eventSubType, 'particle_pollution_pm2_5');
  assert.equal(currentObservation.severity, 'moderate');
  assert.deepEqual(currentObservation.geography, {
    type: 'radius',
    center: { latitude: 40.35, longitude: -74.58 },
    radiusMeters: AIRNOW_SEARCH_RADIUS_METERS,
  });
  assert.equal(JSON.stringify(currentObservation.rawPayload).includes('API_KEY'), false);

  const forecast = parseAirNowPayload([forecastRecord()], 'forecast', NOW).readings[0];
  const smokeObservation = await airNowRadarAdapter.normalize(forecast, {
    sourceDefinitionId: 'source-1',
    observedAt: NOW.toISOString(),
  });
  assert.equal(smokeObservation.eventType, 'wildfire_smoke');
  assert.equal(smokeObservation.eventSubType, 'wildfire_smoke');
  assert.equal(smokeObservation.severity, 'high');
  assert.equal(smokeObservation.effectiveAt, '2026-07-27T00:00:00.000Z');

  assert.throws(
    () => airNowRadarAdapter.normalize(
      { ...current, aqi: 100, categoryNumber: 2 },
      { sourceDefinitionId: 'source-1', observedAt: NOW.toISOString() },
    ),
    /below the actionable AQI threshold/,
  );
});

function fakeDeps(fetchResult) {
  const calls = { register: [], begin: [], complete: [], enqueue: [], fetch: 0 };
  const deps = {
    registry: {
      async register(input) {
        calls.register.push(input);
        return { id: 'source-1', key: 'epa-airnow-air-quality' };
      },
    },
    runs: {
      async begin(input) {
        calls.begin.push(input);
        return { runnable: true, reason: 'source is runnable', run: { id: 'run-1' } };
      },
      async complete(runId, input) {
        calls.complete.push({ runId, input });
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.enqueue.push(input);
        return { lifecycleStatus: input.observation.lifecycleStatus };
      },
    },
    async *iterateAllProperties() {
      yield { id: 'property-1', zipCode: '08536' };
      yield { id: 'property-2', zipCode: '08536' };
    },
    async getPropertyGeo() {
      return { lat: 40.35, lon: -74.58 };
    },
    async fetchReadings() {
      calls.fetch += 1;
      return fetchResult;
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    now: () => NOW,
    correlationId: () => 'correlation-1',
    sleep: async () => {},
    env: {
      NODE_ENV: 'test',
      WORKER_JOB_EPA_AIRNOW_AIR_QUALITY_ENABLED: 'true',
    },
  };
  return { calls, deps };
}

test('AirNow job caches by ZIP, filters non-actionable AQI, and queues canonical observations', async () => {
  const current = parseAirNowPayload(
    [currentRecord(), currentRecord({ ParameterName: 'O3', AQI: 80, Category: { Number: 2, Name: 'Moderate' } })],
    'current',
    NOW,
  );
  const forecast = parseAirNowPayload([forecastRecord()], 'forecast', NOW);
  const { calls, deps } = fakeDeps({
    current: { status: 'ok', ...current },
    forecast: { status: 'ok', ...forecast },
  });

  const result = await airNowAirQualityJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'success');
  assert.equal(result.queryPoints, 1);
  assert.equal(result.actionableReadings, 2);
  assert.equal(result.queued, 2);
  assert.equal(calls.fetch, 1);
  assert.equal(calls.register[0].adapterVersion, AIRNOW_ADAPTER_VERSION);
  assert.equal(calls.register[0].sourceType, 'air_quality_provider');
  assert.equal(calls.enqueue.length, 2);
  assert.equal(calls.complete[0].input.status, 'success');
  assert.equal(calls.complete[0].input.propertiesEvaluated, 2);
  assert.equal(calls.complete[0].input.observationsReceived, 2);
});

test('AirNow dry run performs fetch and normalization without durable writes', async () => {
  const current = parseAirNowPayload([currentRecord()], 'current', NOW);
  const { calls, deps } = fakeDeps({
    current: { status: 'ok', ...current },
    forecast: { status: 'ok', readings: [], rejected: 0 },
  });

  const result = await airNowAirQualityJob({ dryRun: true }, deps);

  assert.equal(result.sourceRunStatus, 'dry_run');
  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.queued, 0);
  assert.equal(calls.register.length, 0);
  assert.equal(calls.begin.length, 0);
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.enqueue.length, 0);
});

test('AirNow source stays failed when credentials or both endpoints are unavailable', async () => {
  const failure = { status: 'failed', readings: [], rejected: 0, error: 'AIRNOW_API_KEY is not configured' };
  const { calls, deps } = fakeDeps({ current: failure, forecast: failure });

  const result = await airNowAirQualityJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'failed');
  assert.equal(result.endpointFailed, 2);
  assert.equal(result.queued, 0);
  assert.equal(calls.complete[0].input.status, 'failed');
  assert.equal(calls.complete[0].input.dataFreshThrough, undefined);
  assert.equal(calls.complete[0].input.errorCode, 'AIRNOW_FETCH_FAILED');
});

test('AirNow registration is launch-closed through worker policy but defines US coverage', () => {
  const registration = airNowSourceRegistration({ NODE_ENV: 'production' });
  assert.deepEqual(registration.coverage, [{ coverageType: 'country', countryCode: 'US' }]);
  assert.equal(registration.sourceType, 'air_quality_provider');
  assert.equal(registration.configJson.endpointGeneration, '2026-latitudeLongitude');
});
