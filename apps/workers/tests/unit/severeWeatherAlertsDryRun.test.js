// apps/workers/tests/unit/severeWeatherAlertsDryRun.test.js
//
// Worker audit follow-up slice: severe-weather-alerts is one of the 7
// broadSweep/externalProvider jobs wired for dry-run + manual-trigger
// support. Covers: dry-run skips all incident writes but still counts
// what would happen; a scoped propertyId processes only that property and
// is independently re-checked against the operator allowlist; and a real
// scoped run tags the created incident with a smokeCorrelationId.
//
// W4 item 1 (DI refactor): dependencies (including iterateAllProperties and
// getPropertyGeo, both plain function references) are injected directly
// instead of via require.cache — this also removes the fragility the old
// version of this comment described, where paginateProperties.ts/
// propertyGeo.ts's own module-cache entries had to be separately purged on
// every test because they import the real prisma singleton directly.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

require('ts-node/register');

const { severeWeatherAlertsJob } = require('../../src/jobs/severeWeatherAlerts.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, openIncidents = [], alerts = [] }) {
  const upsertCalls = [];
  const setStatusCalls = [];

  const deps = {
    prisma: {
      incident: {
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
        onOutcome?.('ok');
        return alerts;
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

  return { deps, getUpsertCalls: () => upsertCalls, getSetStatusCalls: () => setStatusCalls };
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

function alert(overrides = {}) {
  return {
    nwsAlertId: 'nws-alert-1',
    referencedAlertIds: [],
    hazardFamily: 'STORM',
    severity: 'Severe',
    expires: null,
    headline: 'Severe Thunderstorm Warning',
    description: 'desc',
    senderName: 'NWS',
    event: 'Severe Thunderstorm Warning',
    ...overrides,
  };
}

test('dry run: examines and counts alerts but creates/resolves no incidents', async () => {
  const { deps, getUpsertCalls } = fakeDeps({ properties: [property()], alerts: [alert()] });

  const result = await severeWeatherAlertsJob({ dryRun: true }, deps);

  assert.equal(getUpsertCalls().length, 0);
  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('no opts (the scheduled tick): behaves exactly like a real run', async () => {
  const { deps, getUpsertCalls } = fakeDeps({ properties: [property()], alerts: [alert()] });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(getUpsertCalls().length, 1);
  assert.equal(result.createdOrUpdated, 1);
});

test('a scoped propertyId processes only that property', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, getUpsertCalls } = fakeDeps({
      properties: [property({ id: 'property-allowed' }), property({ id: 'property-other' })],
      alerts: [alert()],
    });

    await severeWeatherAlertsJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.equal(getUpsertCalls().length, 1);
    assert.equal(getUpsertCalls()[0].propertyId, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps } = fakeDeps({ properties: [property()], alerts: [alert()] });

    await assert.rejects(
      () => severeWeatherAlertsJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a real scoped run tags the upserted incident with a smokeCorrelationId', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, getUpsertCalls } = fakeDeps({
      properties: [property({ id: 'property-allowed' })],
      alerts: [alert()],
    });

    const result = await severeWeatherAlertsJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.equal(getUpsertCalls().length, 1);
    assert.match(getUpsertCalls()[0].details.smokeCorrelationId, /^smoke:severe-weather-alerts:/);
    assert.equal(result.smokeCorrelationId, getUpsertCalls()[0].details.smokeCorrelationId);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { deps, getUpsertCalls } = fakeDeps({ properties: [property()], alerts: [alert()] });

  const result = await severeWeatherAlertsJob(undefined, deps);

  assert.equal(getUpsertCalls()[0].details.smokeCorrelationId, undefined);
  assert.equal(result.smokeCorrelationId, undefined);
});
