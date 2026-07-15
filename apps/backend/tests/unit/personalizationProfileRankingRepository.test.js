const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository(answers) {
  const calls = [];
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        profileAnswer: {
          findMany: async (query) => {
            calls.push(query);
            return answers;
          },
        },
      },
    },
  };
  const repositoryPath = require.resolve('../../src/modules/personalization/infrastructure/profileRankingRepository.ts');
  delete require.cache[repositoryPath];
  return { ...require('../../src/modules/personalization/infrastructure/profileRankingRepository.ts'), calls };
}

test('loads only answered, allowlisted explicit preferences for the consented household', async () => {
  const { loadExplicitRankingPreferences, calls } = loadRepository([
    { question: { code: 'goal_aging_in_place' }, answerJson: { value: true } },
    { question: { code: 'preference_budget_posture' }, answerJson: { value: false } },
  ]);
  const result = await loadExplicitRankingPreferences('hh-1');
  assert.deepEqual(result, { agingInPlace: true, budgetSensitive: false });
  assert.equal(calls[0].where.householdId, 'hh-1');
  assert.equal(calls[0].where.action, 'ANSWERED');
  assert.deepEqual(calls[0].where.question.code.in.sort(), ['goal_aging_in_place', 'preference_budget_posture']);
});

test('invalid or absent answer values remain unknown and cannot affect ranking', async () => {
  const { loadExplicitRankingPreferences } = loadRepository([
    { question: { code: 'goal_aging_in_place' }, answerJson: { value: 'yes' } },
  ]);
  assert.deepEqual(await loadExplicitRankingPreferences('hh-2'), {
    agingInPlace: null,
    budgetSensitive: null,
  });
});
