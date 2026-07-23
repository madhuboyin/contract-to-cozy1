// apps/workers/tests/unit/severeWeatherAlertsDryRun.test.js
//
// Worker audit follow-up slice: severe-weather-alerts is one of the 7
// broadSweep/externalProvider jobs wired for dry-run + manual-trigger
// support. Covers: dry-run skips all incident writes but still counts
// what would happen; a scoped propertyId processes only that property and
// is independently re-checked against the operator allowlist; and a real
// scoped run tags the created incident with a smokeCorrelationId.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

function loadJob({ properties, openIncidents = [], alerts = [] }) {
  const upsertCalls = [];
  const setStatusCalls = [];

  const prismaMock = {
    property: {
      findMany: async () => properties,
    },
    incident: {
      findMany: async (args) => (args?.where?.propertyId ? openIncidents : []),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const incidentServicePath = require.resolve('../../../backend/src/services/incidents/incident.service.ts');
  require.cache[incidentServicePath] = {
    id: incidentServicePath,
    filename: incidentServicePath,
    loaded: true,
    exports: {
      IncidentService: {
        upsertIncident: async (input) => {
          upsertCalls.push(input);
          return { id: 'incident-new' };
        },
        setStatus: async (id, status) => {
          setStatusCalls.push({ id, status });
        },
      },
    },
  };

  const guidancePath = require.resolve('../../../backend/src/services/guidanceEngine/guidanceJourney.service.ts');
  require.cache[guidancePath] = {
    id: guidancePath,
    filename: guidancePath,
    loaded: true,
    exports: { guidanceJourneyService: { ingestSignal: async () => {} } },
  };

  const alertServicePath = require.resolve('../../../backend/src/services/severeWeatherAlert.service.ts');
  require.cache[alertServicePath] = {
    id: alertServicePath,
    filename: alertServicePath,
    loaded: true,
    exports: {
      severeWeatherAlertService: {
        getActiveAlerts: async (lat, lon, onOutcome) => {
          onOutcome?.('ok');
          return alerts;
        },
      },
    },
  };

  // paginateProperties.ts/propertyGeo.ts import `prisma` directly and, once
  // loaded, keep the module-namespace reference they captured at their own
  // first require() — reassigning require.cache[prismaPath] above only
  // affects requires that happen AFTER this point. Without also purging
  // these, every test after the first would silently keep querying the
  // FIRST test's prisma mock instead of its own.
  delete require.cache[require.resolve('../../src/lib/paginateProperties.ts')];
  delete require.cache[require.resolve('../../src/lib/propertyGeo.ts')];

  const jobPath = require.resolve('../../src/jobs/severeWeatherAlerts.job.ts');
  delete require.cache[jobPath];
  return {
    job: require(jobPath),
    getUpsertCalls: () => upsertCalls,
    getSetStatusCalls: () => setStatusCalls,
  };
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
  const { job, getUpsertCalls } = loadJob({ properties: [property()], alerts: [alert()] });

  const result = await job.severeWeatherAlertsJob({ dryRun: true });

  assert.equal(getUpsertCalls().length, 0);
  assert.equal(result.createdOrUpdated, 1);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('no opts (the scheduled tick): behaves exactly like a real run', async () => {
  const { job, getUpsertCalls } = loadJob({ properties: [property()], alerts: [alert()] });

  const result = await job.severeWeatherAlertsJob();

  assert.equal(getUpsertCalls().length, 1);
  assert.equal(result.createdOrUpdated, 1);
});

test('a scoped propertyId processes only that property', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { job, getUpsertCalls } = loadJob({
      properties: [property({ id: 'property-allowed' }), property({ id: 'property-other' })],
      alerts: [alert()],
    });

    await job.severeWeatherAlertsJob({ dryRun: false, propertyId: 'property-allowed' });

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
    const { job } = loadJob({ properties: [property()], alerts: [alert()] });

    await assert.rejects(
      () => job.severeWeatherAlertsJob({ dryRun: true, propertyId: 'property-not-allowed' }),
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
    const { job, getUpsertCalls } = loadJob({
      properties: [property({ id: 'property-allowed' })],
      alerts: [alert()],
    });

    const result = await job.severeWeatherAlertsJob({ dryRun: false, propertyId: 'property-allowed' });

    assert.equal(getUpsertCalls().length, 1);
    assert.match(getUpsertCalls()[0].details.smokeCorrelationId, /^smoke:severe-weather-alerts:/);
    assert.equal(result.smokeCorrelationId, getUpsertCalls()[0].details.smokeCorrelationId);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { job, getUpsertCalls } = loadJob({ properties: [property()], alerts: [alert()] });

  const result = await job.severeWeatherAlertsJob();

  assert.equal(getUpsertCalls()[0].details.smokeCorrelationId, undefined);
  assert.equal(result.smokeCorrelationId, undefined);
});
