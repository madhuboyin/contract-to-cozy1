// apps/workers/tests/unit/coverageLapseIncidentsJob.test.js
//
// W3 (risk/weather/coverage): the creation query only looks at policies
// still inside its 14-day lookahead window, so once an unresolved
// incident's triggering policy ages out of that window, nothing ever
// re-checks whether the homeowner has since renewed. This tests the added
// resolveCoveredLapseIncidents sweep, which is independent of the creation
// query's window.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache. guidanceJourney.service.ts (an unused real import at
// module scope — the actual test calls always go through the injected fake
// below) transitively constructs a GeminiService singleton at import time,
// which throws if GEMINI_API_KEY is unset — stub a value before requiring
// the job so that real, unused module graph can load at all.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { coverageLapseIncidentsJob } = require('../../src/jobs/coverageLapseIncidents.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ expiringPolicies = [], openIncidents = [], coveringPolicyByPropertyId = {} }) {
  const setStatusCalls = [];

  const prisma = {
    insurancePolicy: {
      findMany: async () => expiringPolicies,
      // Used both by the creation loop's "is there already a replacement"
      // check and by the resolution sweep's "is there now a covering
      // policy" check — same shape works for both.
      findFirst: async (args) => {
        const propertyId = args.where.propertyId;
        const covering = coveringPolicyByPropertyId[propertyId];
        return covering ? { id: covering } : null;
      },
    },
    incident: {
      findMany: async () => openIncidents,
    },
  };

  const deps = {
    prisma,
    incidentService: {
      upsertIncident: async () => ({ id: 'incident-new' }),
      setStatus: async (id, status) => {
        setStatusCalls.push({ id, status });
      },
    },
    guidanceJourneyService: { ingestSignal: async () => {} },
    logger: noopLogger,
  };
  return { deps, getSetStatusCalls: () => setStatusCalls };
}

function incident(overrides = {}) {
  return {
    id: 'incident-1',
    propertyId: 'property-1',
    details: { expiryDate: '2026-06-01T00:00:00.000Z' },
    ...overrides,
  };
}

test('resolves an open incident once the property has a covering policy again', async () => {
  const { deps, getSetStatusCalls } = fakeDeps({
    openIncidents: [incident()],
    coveringPolicyByPropertyId: { 'property-1': 'new-policy-1' },
  });

  const result = await coverageLapseIncidentsJob(deps);

  assert.equal(result.resolved, 1);
  assert.equal(getSetStatusCalls().length, 1);
  assert.equal(getSetStatusCalls()[0].id, 'incident-1');
  assert.equal(getSetStatusCalls()[0].status, 'RESOLVED');
});

test('leaves an open incident alone when the property still has no covering policy', async () => {
  const { deps, getSetStatusCalls } = fakeDeps({
    openIncidents: [incident()],
    coveringPolicyByPropertyId: {},
  });

  const result = await coverageLapseIncidentsJob(deps);

  assert.equal(result.resolved, 0);
  assert.equal(getSetStatusCalls().length, 0);
});

test('skips an incident with no parseable expiryDate in its details instead of throwing', async () => {
  const { deps, getSetStatusCalls } = fakeDeps({
    openIncidents: [incident({ details: {} }), incident({ id: 'incident-2', details: { expiryDate: 'not-a-date' } })],
    coveringPolicyByPropertyId: { 'property-1': 'new-policy-1' },
  });

  const result = await coverageLapseIncidentsJob(deps);

  assert.equal(result.resolved, 0);
  assert.equal(getSetStatusCalls().length, 0);
});
