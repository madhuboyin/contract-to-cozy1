// apps/workers/tests/unit/freezeRiskIncidentsDryRun.test.js
//
// Worker audit follow-up slice: freeze-risk-incidents is one of the 7
// broadSweep/externalProvider jobs wired for dry-run + manual-trigger
// support. Covers: dry-run skips all incident writes but still counts
// what would happen; a scoped propertyId both filters which property is
// processed and is independently re-checked against the operator
// allowlist; and a real scoped run tags the created incident with a
// smokeCorrelationId.
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
require('tsconfig-paths/register');

const { freezeRiskIncidentsJob } = require('../../src/jobs/freezeRiskIncidents.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, openIncidents = [] }) {
  const upsertCalls = [];
  const setStatusCalls = [];

  const deps = {
    prisma: {
      incident: {
        findMany: async () => openIncidents,
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

function openMeteoResponse(minTempC) {
  const hourInWindow = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 13) + ':00';
  return {
    ok: true,
    json: async () => ({ hourly: { time: [hourInWindow], temperature_2m: [minTempC] } }),
  };
}

function withFrozenFetch(minTempC, fn) {
  const originalFetch = global.fetch;
  global.fetch = async () => openMeteoResponse(minTempC);
  return fn().finally(() => { global.fetch = originalFetch; });
}

test('dry run: examines and counts freeze risk but creates/resolves no incidents', () =>
  withFrozenFetch(-5, async () => {
    const { deps, getUpsertCalls } = fakeDeps({ properties: [property()] });

    const result = await freezeRiskIncidentsJob({ dryRun: true }, deps);

    assert.equal(getUpsertCalls().length, 0);
    assert.equal(result.createdOrUpdated, 1);
    assert.equal(result.smokeCorrelationId, undefined);
  }));

test('no opts (the daily cron tick): behaves exactly like a real run', () =>
  withFrozenFetch(-5, async () => {
    const { deps, getUpsertCalls } = fakeDeps({ properties: [property()] });

    const result = await freezeRiskIncidentsJob(undefined, deps);

    assert.equal(getUpsertCalls().length, 1);
    assert.equal(result.createdOrUpdated, 1);
  }));

test('a scoped propertyId processes only that property', () =>
  withFrozenFetch(-5, async () => {
    const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
    try {
      const { deps, getUpsertCalls } = fakeDeps({
        properties: [property({ id: 'property-allowed' }), property({ id: 'property-other' })],
      });

      await freezeRiskIncidentsJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

      assert.equal(getUpsertCalls().length, 1);
      assert.equal(getUpsertCalls()[0].propertyId, 'property-allowed');
    } finally {
      process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
    }
  }));

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps } = fakeDeps({ properties: [property()] });

    await assert.rejects(
      () => freezeRiskIncidentsJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a real scoped run tags the upserted incident with a smokeCorrelationId', () =>
  withFrozenFetch(-5, async () => {
    const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
    try {
      const { deps, getUpsertCalls } = fakeDeps({ properties: [property({ id: 'property-allowed' })] });

      const result = await freezeRiskIncidentsJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

      assert.equal(getUpsertCalls().length, 1);
      assert.match(getUpsertCalls()[0].details.smokeCorrelationId, /^smoke:freeze-risk-incidents:/);
      assert.equal(result.smokeCorrelationId, getUpsertCalls()[0].details.smokeCorrelationId);
    } finally {
      process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
    }
  }));

test('an unscoped run (no propertyId) tags nothing', () =>
  withFrozenFetch(-5, async () => {
    const { deps, getUpsertCalls } = fakeDeps({ properties: [property()] });

    const result = await freezeRiskIncidentsJob(undefined, deps);

    assert.equal(getUpsertCalls()[0].details.smokeCorrelationId, undefined);
    assert.equal(result.smokeCorrelationId, undefined);
  }));
