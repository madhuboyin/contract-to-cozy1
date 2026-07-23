// apps/workers/tests/unit/severeWeatherAlertsJob.test.js
//
// W3 (risk/weather/coverage): getActiveAlerts returns [] both when there
// are genuinely no active alerts AND when the NWS fetch itself failed —
// the job used to auto-resolve every open severe-weather incident whenever
// the alerts array was empty, regardless of why. A transient NWS outage
// could silently close real, still-active incidents. Fixed by tracking
// fetch success alongside the alerts and only resolving on a confirmed-ok
// fetch.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache. This job transitively imports guidanceJourney.service.ts,
// which constructs a GeminiService singleton at module load — that throws if
// GEMINI_API_KEY is unset, so it's stubbed before the real require() below.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

require('ts-node/register');

const { severeWeatherAlertsJob } = require('../../src/jobs/severeWeatherAlerts.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, openIncidents = [], alertsOutcome, alerts = [] }) {
  const setStatusCalls = [];
  const upsertCalls = [];

  const deps = {
    prisma: {
      incident: {
        // Distinguish the per-property open-incidents query (has propertyId)
        // from the 48h stale-safety-net sweep (has updatedAt, no propertyId)
        // — both hit the same model, and the safety net must not mask what
        // this test is actually checking (same-run resolution behavior).
        findMany: async (args) => (args?.where?.propertyId ? openIncidents : []),
      },
    },
    incidentService: {
      upsertIncident: async (input) => {
        upsertCalls.push(input);
        return { id: 'incident-new' };
      },
      setStatus: async (id, status) => {
        setStatusCalls.push({ id, status });
      },
    },
    guidanceJourneyService: { ingestSignal: async () => {} },
    severeWeatherAlertService: {
      getActiveAlerts: async (lat, lon, onOutcome) => {
        onOutcome?.(alertsOutcome);
        return alertsOutcome === 'ok' ? alerts : []; // both "ok, nothing active" and "failed" return []
      },
    },
    logger: noopLogger,
    iterateAllProperties: async function* () {
      for (const p of properties) yield p;
    },
    getPropertyGeo: async (property) => {
      if (typeof property.latitude === 'number' && typeof property.longitude === 'number') {
        return { lat: property.latitude, lon: property.longitude };
      }
      return null;
    },
  };

  return { deps, getSetStatusCalls: () => setStatusCalls, getUpsertCalls: () => upsertCalls };
}

function property(overrides = {}) {
  return {
    id: 'property-1',
    address: '1 Main St',
    zipCode: '08536',
    city: 'Plainsboro',
    state: 'NJ',
    latitude: 40.33,
    longitude: -74.58,
    geocodedZipCode: '08536', // pre-cached so getPropertyGeo skips real geocoding
    ...overrides,
  };
}

function openIncident(overrides = {}) {
  return {
    id: 'incident-1',
    details: { nwsAlertId: 'nws-alert-123' },
    ...overrides,
  };
}

test('does NOT resolve open incidents when the NWS fetch failed (fail-open regression guard)', async () => {
  for (const outcome of ['error', 'timeout', 'http_error']) {
    const { deps, getSetStatusCalls } = fakeDeps({
      properties: [property()],
      openIncidents: [openIncident()],
      alertsOutcome: outcome,
    });

    const result = await severeWeatherAlertsJob(undefined, deps);

    assert.equal(getSetStatusCalls().length, 0, `outcome=${outcome} must not resolve any incident`);
    assert.equal(result.resolved, 0);
  }
});

test('resolves an open incident whose alert genuinely cleared (confirmed-ok empty fetch)', async () => {
  const { deps, getSetStatusCalls } = fakeDeps({
    properties: [property()],
    openIncidents: [openIncident()],
    alertsOutcome: 'ok',
  });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(getSetStatusCalls().length, 1);
  assert.equal(getSetStatusCalls()[0].id, 'incident-1');
  assert.equal(getSetStatusCalls()[0].status, 'RESOLVED');
  assert.equal(result.resolved, 1);
});
