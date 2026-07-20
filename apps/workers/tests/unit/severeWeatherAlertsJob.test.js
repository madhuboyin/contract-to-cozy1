// apps/workers/tests/unit/severeWeatherAlertsJob.test.js
//
// W3 (risk/weather/coverage): getActiveAlerts returns [] both when there
// are genuinely no active alerts AND when the NWS fetch itself failed —
// the job used to auto-resolve every open severe-weather incident whenever
// the alerts array was empty, regardless of why. A transient NWS outage
// could silently close real, still-active incidents. Fixed by tracking
// fetch success alongside the alerts and only resolving on a confirmed-ok
// fetch.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ property, openIncidents = [], alertsOutcome }) {
  const setStatusCalls = [];
  const upsertCalls = [];

  const prismaMock = {
    property: {
      findMany: async () => [property],
    },
    incident: {
      // Distinguish the per-property open-incidents query (has propertyId)
      // from the 48h stale-safety-net sweep (has updatedAt, no propertyId)
      // — both hit the same model, and the safety net must not mask what
      // this test is actually checking (same-run resolution behavior).
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
          onOutcome?.(alertsOutcome);
          return []; // both "ok, nothing active" and "failed" return []
        },
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/severeWeatherAlerts.job.ts');
  delete require.cache[jobPath];
  return {
    job: require(jobPath),
    getSetStatusCalls: () => setStatusCalls,
    getUpsertCalls: () => upsertCalls,
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

function openIncident(overrides = {}) {
  return {
    id: 'incident-1',
    details: { nwsAlertId: 'nws-alert-123' },
    ...overrides,
  };
}

test('does NOT resolve open incidents when the NWS fetch failed (fail-open regression guard)', async () => {
  for (const outcome of ['error', 'timeout', 'http_error']) {
    const { job, getSetStatusCalls } = loadJob({
      property: property(),
      openIncidents: [openIncident()],
      alertsOutcome: outcome,
    });

    const result = await job.severeWeatherAlertsJob();

    assert.equal(getSetStatusCalls().length, 0, `outcome=${outcome} must not resolve any incident`);
    assert.equal(result.resolved, 0);
  }
});

test('resolves an open incident whose alert genuinely cleared (confirmed-ok empty fetch)', async () => {
  const { job, getSetStatusCalls } = loadJob({
    property: property(),
    openIncidents: [openIncident()],
    alertsOutcome: 'ok',
  });

  const result = await job.severeWeatherAlertsJob();

  assert.equal(getSetStatusCalls().length, 1);
  assert.equal(getSetStatusCalls()[0].id, 'incident-1');
  assert.equal(getSetStatusCalls()[0].status, 'RESOLVED');
  assert.equal(result.resolved, 1);
});
