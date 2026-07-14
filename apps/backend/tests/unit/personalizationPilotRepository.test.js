const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository({ household = { id: 'hh-1', consentVersion: 'personalization-pilot-v1', consentedAt: new Date() } } = {}) {
  const calls = [];
  const db = {
    personalizedRecommendation: {
      deleteMany: async (query) => calls.push(['recommendations', query]),
      findMany: async (query) => { calls.push(['recommendation-list', query]); return []; },
    },
    recommendationSuppression: { deleteMany: async (query) => calls.push(['suppressions', query]) },
    traitSnapshot: { deleteMany: async (query) => calls.push(['snapshots', query]) },
    derivedTrait: { deleteMany: async (query) => calls.push(['traits', query]) },
    household: {
      findFirst: async () => household,
      delete: async (query) => calls.push(['household', query]),
    },
  };
  const prismaMock = { ...db, $transaction: async (callback) => callback(db) };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/pilotRepository.ts');
  delete require.cache[repoPath];
  return { ...require('../../src/modules/personalization/infrastructure/pilotRepository.ts'), calls };
}

test('reset removes only household-owned outputs before deleting the optional profile', async () => {
  const { resetPilotHousehold, calls } = loadRepository();
  assert.equal(await resetPilotHousehold('prop-1', 'owner-1'), true);
  assert.deepEqual(calls.map(([name]) => name), ['recommendations', 'suppressions', 'snapshots', 'traits', 'household']);
  assert.deepEqual(calls[0][1].where, { propertyId: 'prop-1', householdId: 'hh-1' });
});
test('reset is a safe no-op when the opted-in household does not exist', async () => {
  const { resetPilotHousehold, calls } = loadRepository({ household: null });
  assert.equal(await resetPilotHousehold('prop-1', 'owner-1'), false);
  assert.equal(calls.length, 0);
});

test('default reads include property-only recommendations without exposing another household', async () => {
  const withoutProfile = loadRepository({ household: null });
  await withoutProfile.listActivePilotRecommendations('prop-1');
  assert.deepEqual(withoutProfile.calls[0][1].where, {
    propertyId: 'prop-1', status: 'ACTIVE', householdId: null,
  });

  const withProfile = loadRepository();
  await withProfile.listActivePilotRecommendations('prop-1', 'hh-1');
  assert.deepEqual(withProfile.calls[0][1].where, {
    propertyId: 'prop-1',
    status: 'ACTIVE',
    OR: [{ householdId: null }, { householdId: 'hh-1' }],
  });
});
