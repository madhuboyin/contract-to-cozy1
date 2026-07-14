const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository(household) {
  const recommendationQueries = [];
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        household: { findFirst: async () => household },
        derivedTrait: {
          findMany: async () => [{
            traitKey: 'hvacFilterReplacementOverdue',
            valueJson: true,
            source: 'DERIVED',
            computedAt: new Date('2026-07-13T12:00:00.000Z'),
          }],
        },
        personalizedRecommendation: {
          findMany: async (query) => {
            recommendationQueries.push(query);
            return [];
          },
        },
      },
    },
  };
  const repositoryPath = require.resolve('../../src/modules/personalization/infrastructure/contextMapRepository.ts');
  delete require.cache[repositoryPath];
  return { ...require(repositoryPath), recommendationQueries };
}

test('loads property context without an optional household profile', async () => {
  const { loadHouseholdContextMapData, recommendationQueries } = loadRepository(null);
  const result = await loadHouseholdContextMapData('property-1', 'owner-1');

  assert.equal(result.consentVersion, null);
  assert.equal(result.derivedTraits.length, 1);
  assert.deepEqual(recommendationQueries[0].where, {
    propertyId: 'property-1',
    status: 'ACTIVE',
  });
});

test('adds consented profile scope without hiding property-owned outputs', async () => {
  const household = {
    id: 'household-1',
    consentVersion: 'personalization-household-profile-v1',
    consentedAt: new Date('2026-07-13T12:00:00.000Z'),
    properties: [],
    profileAnswers: [],
  };
  const { loadHouseholdContextMapData, recommendationQueries } = loadRepository(household);
  const result = await loadHouseholdContextMapData('property-1', 'owner-1');

  assert.equal(result.consentVersion, 'personalization-household-profile-v1');
  assert.equal('id' in result, false);
  assert.deepEqual(recommendationQueries[0].where, {
    propertyId: 'property-1',
    status: 'ACTIVE',
  });
});
