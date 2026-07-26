const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { severeWeatherAlertsJob } = require('../../src/jobs/severeWeatherAlerts.job.ts');

const noopLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; },
};

function property(overrides = {}) {
  return {
    id: 'property-1',
    zipCode: '08536',
    latitude: 40.33,
    longitude: -74.58,
    ...overrides,
  };
}

function alert(overrides = {}) {
  return {
    nwsAlertId: 'urn:oid:nws-alert-1',
    referencedAlertIds: [],
    hazardFamily: 'STORM',
    event: 'Severe Thunderstorm Warning',
    severity: 'Severe',
    headline: 'Severe Thunderstorm Warning issued.',
    description: 'Damaging winds are possible.',
    instruction: 'Move indoors.',
    sent: '2026-07-26T13:55:00Z',
    effective: '2026-07-26T14:00:00Z',
    onset: '2026-07-26T14:00:00Z',
    expires: '2026-07-26T16:00:00Z',
    ends: null,
    senderName: 'NWS Mount Holly',
    status: 'Actual',
    messageType: 'Alert',
    urgency: 'Immediate',
    certainty: 'Observed',
    canonicalUrl: 'https://api.weather.gov/alerts/urn:oid:nws-alert-1',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-74.70, 40.20],
        [-74.40, 40.20],
        [-74.40, 40.50],
        [-74.70, 40.50],
        [-74.70, 40.20],
      ]],
    },
    ...overrides,
  };
}

function fakeDeps({
  properties = [property()],
  fetchByZip = { '08536': { outcome: 'ok', alerts: [alert()] } },
  ingestOutcome = 'created',
} = {}) {
  const calls = {
    fetches: [],
    registrations: [],
    begins: [],
    completions: [],
    ingestions: [],
  };
  const deps = {
    severeWeatherAlertService: {
      async getActiveAlerts(lat, lon, onOutcome) {
        const matchingProperty = properties.find((item) =>
          item.latitude === lat && item.longitude === lon
        );
        const response = fetchByZip[matchingProperty?.zipCode] ?? {
          outcome: 'error',
          alerts: [],
        };
        calls.fetches.push({ lat, lon, response });
        onOutcome?.(response.outcome);
        return response.alerts;
      },
    },
    registry: {
      async register(input) {
        calls.registrations.push(input);
        return { id: 'nws-source-1', key: input.key };
      },
    },
    runs: {
      async begin(input) {
        calls.begins.push(input);
        return {
          runnable: true,
          reason: 'source is runnable',
          run: { id: 'nws-run-1', correlationId: input.correlationId },
        };
      },
      async complete(runId, input) {
        calls.completions.push({ runId, input });
        return { id: runId, ...input };
      },
    },
    ingestQueue: {
      async enqueue(input) {
        calls.ingestions.push(input);
        return {
          jobId: 'radar-ingest-job-1',
          revisionIdentity: 'revision-1',
          payloadFingerprint: 'fingerprint-1',
          lifecycleStatus: input.observation.lifecycleStatus,
        };
      },
    },
    logger: noopLogger,
    iterateAllProperties: async function* () {
      for (const item of properties) yield item;
    },
    getPropertyGeo: async (item) => ({
      lat: item.latitude,
      lon: item.longitude,
      name: item.zipCode,
    }),
    now: () => new Date('2026-07-26T14:05:00Z'),
    correlationId: () => 'correlation-1',
    env: {
      NODE_ENV: 'test',
      WORKER_EXTERNAL_INGEST_ENABLED: 'true',
    },
  };
  return { calls, deps };
}

test('shared-ZIP fetches are cached and duplicate NWS alerts ingest once', async () => {
  const { calls, deps } = fakeDeps({
    properties: [
      property(),
      property({ id: 'property-2', latitude: 40.34, longitude: -74.57 }),
    ],
  });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(calls.fetches.length, 1);
  assert.equal(calls.ingestions.length, 1);
  assert.equal(result.uniqueAlerts, 1);
  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.sourceRunStatus, 'success');
  assert.equal(calls.completions[0].input.propertiesEvaluated, 2);
  assert.equal(calls.registrations[0].provider, 'National Weather Service');
  assert.equal(calls.registrations[0].sourceType, 'weather_provider');
});

test('failed NWS fetch records failed source health and never resolves or ingests', async () => {
  for (const outcome of ['error', 'timeout', 'http_error']) {
    const { calls, deps } = fakeDeps({
      fetchByZip: { '08536': { outcome, alerts: [] } },
    });

    const result = await severeWeatherAlertsJob(undefined, deps);

    assert.equal(calls.ingestions.length, 0);
    assert.equal(result.resolved, 0);
    assert.equal(result.sourceRunStatus, 'failed');
    assert.equal(calls.completions[0].input.status, 'failed');
    assert.equal(calls.completions[0].input.dataFreshThrough, undefined);
    assert.match(calls.completions[0].input.errorMessage, /fetches failed/);
  }
});

test('confirmed successful empty NWS fetch records successful-empty, not failure', async () => {
  const { calls, deps } = fakeDeps({
    fetchByZip: { '08536': { outcome: 'ok', alerts: [] } },
  });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'successful_empty');
  assert.equal(calls.completions[0].input.status, 'successful_empty');
  assert.deepEqual(calls.completions[0].input.dataFreshThrough, new Date('2026-07-26T14:05:00Z'));
});

test('mixed fetch outcomes remain partial while successful observations ingest', async () => {
  const { calls, deps } = fakeDeps({
    properties: [
      property(),
      property({
        id: 'property-2',
        zipCode: '10019',
        latitude: 40.76,
        longitude: -73.98,
      }),
    ],
    fetchByZip: {
      '08536': { outcome: 'ok', alerts: [alert()] },
      '10019': { outcome: 'timeout', alerts: [] },
    },
  });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(result.sourceRunStatus, 'partial');
  assert.equal(result.fetchSucceeded, 1);
  assert.equal(result.fetchFailed, 1);
  assert.equal(calls.ingestions.length, 1);
  assert.equal(calls.completions[0].input.status, 'partial');
  assert.match(calls.completions[0].input.errorMessage, /1 NWS fetch/);
});

test('provider job has no direct Incident or Guidance projection path', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/jobs/severeWeatherAlerts.job.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /IncidentService|upsertIncident|setStatus/);
  assert.doesNotMatch(source, /guidanceJourneyService|ingestSignal/);
  assert.match(source, /deps\.ingestQueue\.enqueue/);
  assert.match(source, /deps\.runs\.complete/);
});
