// apps/workers/tests/unit/coverageLapseIncidentsJob.test.js
//
// W3 (risk/weather/coverage): the creation query only looks at policies
// still inside its 14-day lookahead window, so once an unresolved
// incident's triggering policy ages out of that window, nothing ever
// re-checks whether the homeowner has since renewed. This tests the added
// resolveCoveredLapseIncidents sweep, which is independent of the creation
// query's window.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ expiringPolicies = [], openIncidents = [], coveringPolicyByPropertyId = {} }) {
  const setStatusCalls = [];

  const prismaMock = {
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
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const incidentServicePath = require.resolve('../../../backend/src/services/incidents/incident.service.ts');
  require.cache[incidentServicePath] = {
    id: incidentServicePath,
    filename: incidentServicePath,
    loaded: true,
    exports: {
      IncidentService: {
        upsertIncident: async () => ({ id: 'incident-new' }),
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

  const jobPath = require.resolve('../../src/jobs/coverageLapseIncidents.job.ts');
  delete require.cache[jobPath];
  return { job: require(jobPath), getSetStatusCalls: () => setStatusCalls };
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
  const { job, getSetStatusCalls } = loadJob({
    openIncidents: [incident()],
    coveringPolicyByPropertyId: { 'property-1': 'new-policy-1' },
  });

  const result = await job.coverageLapseIncidentsJob();

  assert.equal(result.resolved, 1);
  assert.equal(getSetStatusCalls().length, 1);
  assert.equal(getSetStatusCalls()[0].id, 'incident-1');
  assert.equal(getSetStatusCalls()[0].status, 'RESOLVED');
});

test('leaves an open incident alone when the property still has no covering policy', async () => {
  const { job, getSetStatusCalls } = loadJob({
    openIncidents: [incident()],
    coveringPolicyByPropertyId: {},
  });

  const result = await job.coverageLapseIncidentsJob();

  assert.equal(result.resolved, 0);
  assert.equal(getSetStatusCalls().length, 0);
});

test('skips an incident with no parseable expiryDate in its details instead of throwing', async () => {
  const { job, getSetStatusCalls } = loadJob({
    openIncidents: [incident({ details: {} }), incident({ id: 'incident-2', details: { expiryDate: 'not-a-date' } })],
    coveringPolicyByPropertyId: { 'property-1': 'new-policy-1' },
  });

  const result = await job.coverageLapseIncidentsJob();

  assert.equal(result.resolved, 0);
  assert.equal(getSetStatusCalls().length, 0);
});
