const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const QUESTIONS_BY_ID = {
  'q-member': {
    id: 'q-member',
    code: 'household_composition_safety',
    targetTable: 'HOUSEHOLD_MEMBER_SUMMARY',
    targetKey: null,
    valueScore: 8,
    effortScore: 2,
    maxImpressions: 3,
    answerSchema: { type: 'multi_select' },
  },
  'q-pet': {
    id: 'q-pet',
    code: 'household_pets',
    targetTable: 'PET_PROFILE',
    targetKey: null,
    valueScore: 6,
    effortScore: 1,
    maxImpressions: 3,
    answerSchema: { type: 'select_with_detail' },
  },
  'q-goal': {
    id: 'q-goal',
    code: 'goal_aging_in_place',
    targetTable: 'HOUSEHOLD_GOAL',
    targetKey: 'AGING_IN_PLACE',
    valueScore: 7,
    effortScore: 1,
    maxImpressions: 3,
    answerSchema: { type: 'boolean' },
  },
  'q-pref': {
    id: 'q-pref',
    code: 'preference_budget_posture',
    targetTable: 'HOUSEHOLD_PREFERENCE',
    targetKey: 'BUDGET_POSTURE',
    valueScore: 6,
    effortScore: 1,
    maxImpressions: 3,
    answerSchema: { type: 'boolean' },
  },
  'q-lifestyle': {
    id: 'q-lifestyle',
    code: 'lifestyle_travel_frequency',
    targetTable: 'LIFESTYLE_ATTRIBUTE',
    targetKey: 'TRAVEL_FREQUENCY',
    valueScore: 5,
    effortScore: 1,
    maxImpressions: 3,
    answerSchema: { type: 'boolean' },
  },
};

for (const question of Object.values(QUESTIONS_BY_ID)) {
  question.status = 'ACTIVE';
  question.placementContexts = ['PILOT'];
}

function createPrismaMock({ consentVersion = null } = {}) {
  const answers = [];
  const memberSummaries = [];
  const pets = [];
  const goals = [];
  const preferences = [];
  const lifestyleAttributes = [];

  function tableMock(rows) {
    return {
      findFirst: async ({ where }) =>
        rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null,
      create: async ({ data }) => {
        const row = { id: `id-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
    };
  }

  const prismaMock = {
    $transaction: async (callback) => callback(prismaMock),
    profileQuestion: {
      findUnique: async ({ where }) => QUESTIONS_BY_ID[where.id] || null,
    },
    profileAnswer: {
      findUnique: async ({ where }) => answers.find((a) => a.idempotencyKey === where.idempotencyKey) || null,
      create: async ({ data }) => {
        const row = { id: `ans-${answers.length + 1}`, ...data };
        answers.push(row);
        return row;
      },
    },
    household: {
      findUnique: async () => (consentVersion ? { consentVersion, consentedAt: new Date() } : { consentVersion: null, consentedAt: null }),
    },
    householdMemberSummary: tableMock(memberSummaries),
    petProfile: tableMock(pets),
    householdGoal: tableMock(goals),
    householdPreference: tableMock(preferences),
    lifestyleAttribute: tableMock(lifestyleAttributes),
  };

  return { prismaMock, answers, memberSummaries, pets, goals, preferences, lifestyleAttributes };
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
    '../../src/modules/personalization/infrastructure/consentRepository.ts',
    '../../src/modules/personalization/infrastructure/compositionDataRepository.ts',
    '../../src/modules/personalization/application/recordProfileAnswer.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/recordProfileAnswer.usecase.ts');
}

test('duplicate idempotencyKey is a true no-op', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  const params = { questionId: 'q-goal', householdId: 'hh-1', idempotencyKey: 'evt-1', action: 'ANSWERED', answerJson: { present: true } };
  const first = await recordProfileAnswer(params);
  const second = await recordProfileAnswer(params);

  assert.equal(first.status, 'RECORDED');
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(answers.length, 1);
});

test('returns QUESTION_NOT_FOUND for an unknown questionId', async () => {
  const { prismaMock } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  const result = await recordProfileAnswer({
    questionId: 'missing',
    householdId: 'hh-1',
    idempotencyKey: 'evt-1',
    action: 'ANSWERED',
  });
  assert.equal(result.status, 'QUESTION_NOT_FOUND');
});

test('SKIPPED sets a 90-day cooldown and never touches consent or composition data', async () => {
  const { prismaMock, answers, goals } = createPrismaMock({ consentVersion: null });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  const result = await recordProfileAnswer({
    questionId: 'q-goal',
    householdId: 'hh-1',
    idempotencyKey: 'evt-skip',
    action: 'SKIPPED',
  });

  assert.equal(result.status, 'RECORDED');
  assert.equal(goals.length, 0);
  assert.ok(answers[0].nextEligibleAt);
  const daysAhead = (answers[0].nextEligibleAt.getTime() - answers[0].askedAt.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(daysAhead - 90) < 1);
});

test('SNOOZED sets a 14-day cooldown', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: null });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-goal',
    householdId: 'hh-1',
    idempotencyKey: 'evt-snooze',
    action: 'SNOOZED',
  });

  const daysAhead = (answers[0].nextEligibleAt.getTime() - answers[0].askedAt.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(daysAhead - 14) < 1);
});

test('ANSWERED without consent returns CONSENT_REQUIRED and writes nothing', async () => {
  const { prismaMock, answers, goals } = createPrismaMock({ consentVersion: null });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  const result = await recordProfileAnswer({
    questionId: 'q-goal',
    householdId: 'hh-1',
    idempotencyKey: 'evt-answer',
    action: 'ANSWERED',
    answerJson: { present: true },
  });

  assert.equal(result.status, 'CONSENT_REQUIRED');
  assert.equal(goals.length, 0);
  assert.equal(answers.length, 0);
});

test('invalid ANSWERED payload is rejected before any write', async () => {
  const { prismaMock, answers, pets } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  const result = await recordProfileAnswer({
    questionId: 'q-pet',
    householdId: 'hh-1',
    idempotencyKey: 'evt-invalid',
    action: 'ANSWERED',
    answerJson: { hasPet: true },
  });

  assert.equal(result.status, 'INVALID_ANSWER');
  assert.equal(pets.length, 0);
  assert.equal(answers.length, 0);
});

test('ANSWERED with consent writes to HOUSEHOLD_MEMBER_SUMMARY (multi-select)', async () => {
  const { prismaMock, memberSummaries } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-member',
    householdId: 'hh-1',
    idempotencyKey: 'evt-member',
    action: 'ANSWERED',
    answerJson: { hasChildren: true, hasSeniors: true },
  });

  assert.equal(memberSummaries.length, 2);
  assert.deepEqual(memberSummaries.map((m) => m.type).sort(), ['CHILD', 'SENIOR']);
});

test('ANSWERED with consent writes to PET_PROFILE only when hasPet is true', async () => {
  const { prismaMock, pets } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-pet',
    householdId: 'hh-1',
    idempotencyKey: 'evt-pet-no',
    action: 'ANSWERED',
    answerJson: { hasPet: false },
  });
  assert.equal(pets.length, 0);

  await recordProfileAnswer({
    questionId: 'q-pet',
    householdId: 'hh-1',
    idempotencyKey: 'evt-pet-yes',
    action: 'ANSWERED',
    answerJson: { hasPet: true, petType: 'DOG' },
  });
  assert.equal(pets.length, 1);
  assert.equal(pets[0].petType, 'DOG');
});

test('ANSWERED with consent writes to HOUSEHOLD_GOAL only when present is true', async () => {
  const { prismaMock, goals } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-goal',
    householdId: 'hh-1',
    idempotencyKey: 'evt-goal-false',
    action: 'ANSWERED',
    answerJson: { present: false },
  });
  assert.equal(goals.length, 0);
});

test('ANSWERED with consent always writes to HOUSEHOLD_PREFERENCE (true or false is meaningful)', async () => {
  const { prismaMock, preferences } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-pref',
    householdId: 'hh-1',
    idempotencyKey: 'evt-pref',
    action: 'ANSWERED',
    answerJson: { value: false },
  });

  assert.equal(preferences.length, 1);
  assert.deepEqual(preferences[0].valueJson, { value: false });
});

test('ANSWERED with consent always writes to LIFESTYLE_ATTRIBUTE (true or false is meaningful)', async () => {
  const { prismaMock, lifestyleAttributes } = createPrismaMock({ consentVersion: 'v1' });
  installPrismaMock(prismaMock);
  const { recordProfileAnswer } = loadUseCase();

  await recordProfileAnswer({
    questionId: 'q-lifestyle',
    householdId: 'hh-1',
    idempotencyKey: 'evt-lifestyle',
    action: 'ANSWERED',
    answerJson: { value: true },
  });

  assert.equal(lifestyleAttributes.length, 1);
  assert.equal(lifestyleAttributes[0].valueBoolean, true);
});
