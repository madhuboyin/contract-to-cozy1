// apps/workers/tests/unit/freezeRiskIncidentsJob.test.js
//
// W3 (risk/weather/coverage): getForecastMinF had no try/catch around its
// fetch/JSON-parse call — a thrown exception (network error, timeout,
// malformed body) used to propagate unhandled out of the whole job,
// skipping every remaining property in the run, not just the one whose
// forecast fetch failed.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ properties, openIncidents = [] }) {
  const upsertCalls = [];
  const setStatusCalls = [];

  const prismaMock = {
    property: {
      findMany: async () => properties,
    },
    incident: {
      findMany: async () => openIncidents,
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

  const jobPath = require.resolve('../../src/jobs/freezeRiskIncidents.job.ts');
  delete require.cache[jobPath];
  return { job: require(jobPath), getUpsertCalls: () => upsertCalls, getSetStatusCalls: () => setStatusCalls };
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
  // getForecastMinF only counts hours within [now, now+36h] — an hour that's
  // already passed (e.g. "this hour" when we're partway through it) gets
  // filtered out, so use now+1h to stay safely inside the window.
  const hourInWindow = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 13) + ':00';
  return {
    ok: true,
    json: async () => ({
      hourly: {
        time: [hourInWindow],
        temperature_2m: [minTempC],
      },
    }),
  };
}

test('a fetch exception for one property does not crash the run or block other properties', async () => {
  const originalFetch = global.fetch;
  let call = 0;
  global.fetch = async () => {
    call += 1;
    if (call === 1) throw new Error('network unreachable');
    return openMeteoResponse(-5); // well below freezing -> should create an incident
  };

  try {
    const { job, getUpsertCalls } = loadJob({
      properties: [property({ id: 'property-failing' }), property({ id: 'property-ok' })],
    });

    const result = await job.freezeRiskIncidentsJob();

    // property-failing's fetch threw -> getForecastMinF returns null -> skipped,
    // no incident, no crash. property-ok's fetch succeeded -> incident created.
    assert.equal(result.createdOrUpdated, 1);
    assert.equal(getUpsertCalls().length, 1);
    assert.equal(getUpsertCalls()[0].propertyId, 'property-ok');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a non-Error thrown value is also handled without crashing the job', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw 'not an Error instance';
  };

  try {
    const { job, getUpsertCalls } = loadJob({ properties: [property()] });

    const result = await job.freezeRiskIncidentsJob();

    assert.equal(result.createdOrUpdated, 0);
    assert.equal(getUpsertCalls().length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
