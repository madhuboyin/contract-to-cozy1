const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const QUESTIONS_BY_ID = {
  'q-member': { id: 'q-member', code: 'household_composition_safety', status: 'ACTIVE', valueScore: 8, effortScore: 2, maxImpressions: 3, answerSchema: { type: 'multi_select' }, prompt: 'Members?', whyAsked: 'Safety', privacyNote: 'Optional' },
  'q-pet': { id: 'q-pet', code: 'household_pets', status: 'ACTIVE', valueScore: 6, effortScore: 1, maxImpressions: 3, answerSchema: { type: 'select_with_detail' }, prompt: 'Pets?', whyAsked: 'Maintenance', privacyNote: 'Optional' },
  'q-boolean': { id: 'q-boolean', code: 'preference_budget_posture', status: 'ACTIVE', valueScore: 6, effortScore: 1, maxImpressions: 3, answerSchema: { type: 'boolean' }, prompt: 'Budget?', whyAsked: 'Ranking', privacyNote: 'Optional' },
};

function createPrismaMock({
  consentVersion = null,
  ownerUserId = 'owner-1',
  propertyId = 'property-1',
} = {}) {
  const answers = [];
  const prismaMock = {
    $transaction: async (callback) => callback(prismaMock),
    profileQuestion: {
      findUnique: async ({ where }) => QUESTIONS_BY_ID[where.id] || null,
    },
    profileAnswer: {
      findUnique: async ({ where }) => answers.find((answer) => answer.idempotencyKey === where.idempotencyKey) || null,
      findFirst: async ({ where }) => answers.find((answer) =>
        answer.householdId === where.householdId &&
        answer.questionId === where.questionId &&
        answer.action === where.action) || null,
      create: async ({ data }) => {
        const row = { id: `answer-${answers.length + 1}`, createdAt: new Date(), ...data };
        answers.push(row);
        return row;
      },
    },
    household: {
      findFirst: async ({ where }) =>
        where.id === 'hh-1' &&
        where.ownerUserId === ownerUserId &&
        where.properties.some.propertyId === propertyId
          ? { consentVersion, consentedAt: consentVersion ? new Date() : null }
          : null,
    },
  };
  return { prismaMock, answers };
}

const scopedParams = (params) => ({
  householdId: 'hh-1',
  propertyId: 'property-1',
  ownerUserId: 'owner-1',
  ...params,
});

function loadUseCase(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };
  for (const relativePath of [
    '../../src/modules/personalization/infrastructure/profileQuestionRepository.ts',
    '../../src/modules/personalization/infrastructure/consentRepository.ts',
    '../../src/modules/personalization/application/recordProfileAnswer.usecase.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }
  return require('../../src/modules/personalization/application/recordProfileAnswer.usecase.ts');
}

test('duplicate idempotencyKey is a true no-op', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const params = scopedParams({ questionId: 'q-boolean', idempotencyKey: 'evt-1', action: 'ANSWERED', answerJson: { value: true } });
  assert.equal((await recordProfileAnswer(params)).status, 'RECORDED');
  assert.equal((await recordProfileAnswer(params)).status, 'DUPLICATE');
  assert.equal(answers.length, 1);
});

test('returns QUESTION_NOT_FOUND for an unknown questionId', async () => {
  const { prismaMock } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const result = await recordProfileAnswer(scopedParams({ questionId: 'missing', idempotencyKey: 'evt-1', action: 'ANSWERED' }));
  assert.equal(result.status, 'QUESTION_NOT_FOUND');
});

test('SKIPPED and SNOOZED store cooldown events without profile facts', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  await recordProfileAnswer(scopedParams({ questionId: 'q-boolean', idempotencyKey: 'evt-skip', action: 'SKIPPED' }));
  await recordProfileAnswer(scopedParams({ questionId: 'q-boolean', idempotencyKey: 'evt-later', action: 'SNOOZED' }));
  assert.equal(answers.length, 2);
  assert.equal(answers[0].answerJson, null);
  assert.equal(answers[1].answerJson, null);
  const skipDays = (answers[0].nextEligibleAt - answers[0].createdAt) / 86_400_000;
  const laterDays = (answers[1].nextEligibleAt - answers[1].createdAt) / 86_400_000;
  assert.ok(Math.abs(skipDays - 90) < 1);
  assert.ok(Math.abs(laterDays - 14) < 1);
});

test('ANSWERED without consent writes nothing', async () => {
  const { prismaMock, answers } = createPrismaMock();
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const result = await recordProfileAnswer(scopedParams({ questionId: 'q-boolean', idempotencyKey: 'evt-answer', action: 'ANSWERED', answerJson: { value: true } }));
  assert.equal(result.status, 'CONSENT_REQUIRED');
  assert.equal(answers.length, 0);
});

test('invalid ANSWERED payload is rejected before any write', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const result = await recordProfileAnswer(scopedParams({ questionId: 'q-pet', idempotencyKey: 'evt-invalid', action: 'ANSWERED', answerJson: { hasPet: true } }));
  assert.equal(result.status, 'INVALID_ANSWER');
  assert.equal(answers.length, 0);
});

test('consented answers are retained once in ProfileAnswer.answerJson', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const cases = [
    ['q-member', 'evt-member', { hasChildren: true, hasSeniors: false }],
    ['q-pet', 'evt-pet', { hasPet: true, petType: 'DOG' }],
    ['q-boolean', 'evt-boolean', { value: false }],
  ];
  for (const [questionId, idempotencyKey, answerJson] of cases) {
    const result = await recordProfileAnswer(scopedParams({ questionId, idempotencyKey, action: 'ANSWERED', answerJson }));
    assert.equal(result.status, 'RECORDED');
  }
  assert.deepEqual(answers.map((answer) => answer.answerJson), cases.map((entry) => entry[2]));
});

test('rejects a household that is outside the authenticated owner/property scope', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const result = await recordProfileAnswer(scopedParams({
    ownerUserId: 'different-owner',
    questionId: 'q-boolean',
    idempotencyKey: 'evt-wrong-scope',
    action: 'ANSWERED',
    answerJson: { value: true },
  }));
  assert.equal(result.status, 'CONSENT_REQUIRED');
  assert.equal(answers.length, 0);
});

test('a second ANSWERED event with a new idempotency key does not create a duplicate fact', async () => {
  const { prismaMock, answers } = createPrismaMock({ consentVersion: 'v1' });
  const { recordProfileAnswer } = loadUseCase(prismaMock);
  const first = await recordProfileAnswer(scopedParams({
    questionId: 'q-boolean', idempotencyKey: 'evt-first', action: 'ANSWERED', answerJson: { value: true },
  }));
  const second = await recordProfileAnswer(scopedParams({
    questionId: 'q-boolean', idempotencyKey: 'evt-second', action: 'ANSWERED', answerJson: { value: false },
  }));
  assert.equal(first.status, 'RECORDED');
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(answers.length, 1);
});
