const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository({ household = { id: 'hh-1', consentVersion: 'personalization-household-profile-v1', consentedAt: new Date() } } = {}) {
  const calls = [];
  const db = {
    personalizedRecommendation: { findMany: async (query) => { calls.push(['recommendation-list', query]); return []; } },
    household: {
      findFirst: async () => household,
      delete: async (query) => calls.push(['household', query]),
    },
  };
  const prismaMock = { ...db, $transaction: async (callback) => callback(db) };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/personalizationRepository.ts');
  delete require.cache[repoPath];
  return { ...require('../../src/modules/personalization/infrastructure/personalizationRepository.ts'), calls };
}

test('reset deletes only the optional profile aggregate', async () => {
  const { resetHouseholdProfile, calls } = loadRepository();
  assert.equal(await resetHouseholdProfile('prop-1', 'owner-1'), true);
  assert.deepEqual(calls.map(([name]) => name), ['household']);
});
test('reset is a safe no-op when the opted-in household does not exist', async () => {
  const { resetHouseholdProfile, calls } = loadRepository({ household: null });
  assert.equal(await resetHouseholdProfile('prop-1', 'owner-1'), false);
  assert.equal(calls.length, 0);
});

test('default reads are property-scoped and independent of an optional profile', async () => {
  const withoutProfile = loadRepository({ household: null });
  await withoutProfile.listActivePersonalizationRecommendations('prop-1');
  assert.deepEqual(withoutProfile.calls[0][1].where, {
    propertyId: 'prop-1', status: 'ACTIVE',
  });

  const withProfile = loadRepository();
  await withProfile.listActivePersonalizationRecommendations('prop-1');
  assert.deepEqual(withProfile.calls[0][1].where, {
    propertyId: 'prop-1',
    status: 'ACTIVE',
  });
});
