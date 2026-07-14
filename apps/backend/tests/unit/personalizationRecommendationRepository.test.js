const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository() {
  let recommendationUpsert;
  const prismaMock = {
    personalizedRecommendation: {
      upsert: async (args) => {
        recommendationUpsert = args;
        return { id: 'recommendation-1' };
      },
    },
    recommendationExplanation: {
      upsert: async () => ({ id: 'explanation-1' }),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
  const repositoryPath = require.resolve('../../src/modules/personalization/infrastructure/recommendationRepository.ts');
  delete require.cache[repositoryPath];
  return {
    repository: require(repositoryPath),
    getRecommendationUpsert: () => recommendationUpsert,
  };
}

test('reactivating a recommendation clears the prior expiration timestamp', async () => {
  const { repository, getRecommendationUpsert } = loadRepository();
  await repository.upsertRecommendation({
    propertyId: 'property-1',
    definitionId: 'definition-1',
    evaluationRunId: 'run-2',
    ruleVersion: 1,
    contentVersion: 1,
    headline: 'Replace the HVAC filter',
    reasonCodes: [],
    evidence: {},
    score: 80,
    priorityBand: 'HIGH',
    confidence: 1,
  });

  const args = getRecommendationUpsert();
  assert.equal(args.update.status, 'ACTIVE');
  assert.equal(args.update.expiresAt, null);
});
