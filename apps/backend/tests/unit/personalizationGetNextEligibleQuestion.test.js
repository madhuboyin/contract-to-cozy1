const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ questions = [], answers = [] } = {}) {
  const prismaMock = {
    profileQuestion: {
      findMany: async ({ where }) => {
        assert.equal(where.status, 'ACTIVE');
        return questions;
      },
    },
    profileAnswer: {
      findMany: async ({ where }) => answers.filter((a) => a.householdId === where.householdId),
    },
  };
  return { prismaMock };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
}

function loadUseCase() {
  const paths = [
    '../../src/modules/personalization/infrastructure/profileQuestionRepository.ts',
    '../../src/modules/personalization/application/getNextEligibleQuestionForHousehold.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/getNextEligibleQuestionForHousehold.usecase.ts');
}

const BASE_QUESTION = {
  id: 'q1',
  code: 'household_composition_safety',
  status: 'ACTIVE',
  targetTable: 'HOUSEHOLD_MEMBER_SUMMARY',
  targetKey: null,
  placementContexts: ['ONBOARDING'],
  valueScore: 8,
  effortScore: 2,
  maxImpressions: 3,
};

test('returns null when no ACTIVE questions match the placement', async () => {
  const { prismaMock } = createPrismaMock({ questions: [{ ...BASE_QUESTION, placementContexts: ['SETTINGS'] }] });
  installPrismaMock(prismaMock);
  const { getNextEligibleQuestionForHousehold } = loadUseCase();

  const result = await getNextEligibleQuestionForHousehold('hh-1', 'ONBOARDING');
  assert.equal(result.question, null);
});

test('returns the question when it has never been asked before', async () => {
  const { prismaMock } = createPrismaMock({ questions: [BASE_QUESTION] });
  installPrismaMock(prismaMock);
  const { getNextEligibleQuestionForHousehold } = loadUseCase();

  const result = await getNextEligibleQuestionForHousehold('hh-1', 'ONBOARDING');
  assert.equal(result.question.id, 'q1');
});

test('returns null once the household already ANSWERED it', async () => {
  const { prismaMock } = createPrismaMock({
    questions: [BASE_QUESTION],
    answers: [{ householdId: 'hh-1', questionId: 'q1', action: 'ANSWERED', nextEligibleAt: null, askedAt: new Date() }],
  });
  installPrismaMock(prismaMock);
  const { getNextEligibleQuestionForHousehold } = loadUseCase();

  const result = await getNextEligibleQuestionForHousehold('hh-1', 'ONBOARDING');
  assert.equal(result.question, null);
});

test('returns null while the weekly cap (2) is already reached, even for an unrelated question', async () => {
  const now = new Date();
  const { prismaMock } = createPrismaMock({
    questions: [BASE_QUESTION, { ...BASE_QUESTION, id: 'q2', code: 'other' }],
    answers: [
      { householdId: 'hh-1', questionId: 'q2', action: 'SKIPPED', nextEligibleAt: new Date(now.getTime() + 1000), askedAt: now },
      { householdId: 'hh-1', questionId: 'q2', action: 'SKIPPED', nextEligibleAt: new Date(now.getTime() + 1000), askedAt: now },
    ],
  });
  installPrismaMock(prismaMock);
  const { getNextEligibleQuestionForHousehold } = loadUseCase();

  const result = await getNextEligibleQuestionForHousehold('hh-1', 'ONBOARDING');
  assert.equal(result.question, null);
});

test('ranks by value/effort and returns the top-ranked eligible question', async () => {
  const lowRank = { ...BASE_QUESTION, id: 'low', code: 'low', valueScore: 2, effortScore: 2 };
  const highRank = { ...BASE_QUESTION, id: 'high', code: 'high', valueScore: 10, effortScore: 1 };
  const { prismaMock } = createPrismaMock({ questions: [lowRank, highRank] });
  installPrismaMock(prismaMock);
  const { getNextEligibleQuestionForHousehold } = loadUseCase();

  const result = await getNextEligibleQuestionForHousehold('hh-1', 'ONBOARDING');
  assert.equal(result.question.id, 'high');
});
