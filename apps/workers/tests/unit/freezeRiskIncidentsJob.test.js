// apps/workers/tests/unit/freezeRiskIncidentsJob.test.js
//
// W3 (risk/weather/coverage): getForecastMinF had no try/catch around its
// fetch/JSON-parse call — a thrown exception (network error, timeout,
// malformed body) used to propagate unhandled out of the whole job,
// skipping every remaining property in the run, not just the one whose
// forecast fetch failed.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache. This job transitively imports guidanceJourney.service.ts,
// which constructs a GeminiService singleton at module load — that throws if
// GEMINI_API_KEY is unset, so it's stubbed before the real require() below.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

require('ts-node/register');

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
    const { deps, getUpsertCalls } = fakeDeps({
      properties: [property({ id: 'property-failing' }), property({ id: 'property-ok' })],
    });

    const result = await freezeRiskIncidentsJob(undefined, deps);

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
    const { deps, getUpsertCalls } = fakeDeps({ properties: [property()] });

    const result = await freezeRiskIncidentsJob(undefined, deps);

    assert.equal(result.createdOrUpdated, 0);
    assert.equal(getUpsertCalls().length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
