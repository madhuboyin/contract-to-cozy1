const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY ||= 'phase2-test-key';

require('ts-node/register');

// Bug fix: the Incidents page's "All" filter sent no status param at all
// (IncidentsClient.tsx converted 'ALL' -> undefined before calling the API),
// and IncidentService.listIncidents treated "no status" identically to
// "ACTIVE" (excluding RESOLVED/EXPIRED/SUPPRESSED) — so "All" could never
// actually surface a resolved incident. 'ALL' is now threaded through as an
// explicit, distinct value end-to-end.

const findManyCalls = [];

const prismaMock = {
  incident: {
    findMany: async ({ where }) => {
      findManyCalls.push(where);
      return [];
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { IncidentService } = require('../../src/services/incidents/incident.service.ts');

test('status "ALL" applies no status filter at all', async () => {
  findManyCalls.length = 0;
  await IncidentService.listIncidents({ propertyId: 'property-1', status: 'ALL' });
  assert.equal('status' in findManyCalls[0], false, 'where clause must not constrain status when ALL is requested');
});

test('no status (the default) still excludes terminal states', async () => {
  findManyCalls.length = 0;
  await IncidentService.listIncidents({ propertyId: 'property-1' });
  assert.deepEqual(findManyCalls[0].status, { notIn: ['RESOLVED', 'EXPIRED', 'SUPPRESSED'] });
});

test('status "ACTIVE" behaves the same as the default (currently-live set)', async () => {
  findManyCalls.length = 0;
  await IncidentService.listIncidents({ propertyId: 'property-1', status: 'ACTIVE' });
  assert.deepEqual(findManyCalls[0].status, { notIn: ['RESOLVED', 'EXPIRED', 'SUPPRESSED'] });
});

test('a specific status still filters to exactly that status', async () => {
  findManyCalls.length = 0;
  await IncidentService.listIncidents({ propertyId: 'property-1', status: 'RESOLVED' });
  assert.equal(findManyCalls[0].status, 'RESOLVED');
});
