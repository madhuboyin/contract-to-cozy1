const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock({ recommendation = { id: 'rec-1', propertyId: 'prop-1', definitionId: 'def-1' } } = {}) {
  const feedbackRows = [];
  const suppressions = [];
  const recommendationUpdates = [];
  const incidents = [];
  const typedFeedbackRows = [];
  let recommendationRow = { ...recommendation, status: 'ACTIVE' };

  const prismaMock = {
    $transaction: async (work) => work(prismaMock),
    feedback: {
      findFirst: async ({ where }) => typedFeedbackRows.find((row) => row.userId === where.userId && row.targetType === where.targetType && row.targetId === where.targetId && row.surface === where.surface) || null,
      create: async ({ data }) => {
        const row = { id: `typed-feedback-${typedFeedbackRows.length + 1}`, ...data };
        typedFeedbackRows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const index = typedFeedbackRows.findIndex((row) => row.id === where.id);
        typedFeedbackRows[index] = { ...typedFeedbackRows[index], ...data };
        return typedFeedbackRows[index];
      },
    },
    recommendationFeedback: {
      findUnique: async ({ where }) => feedbackRows.find((f) => f.eventId === where.eventId) || null,
      create: async ({ data }) => {
        feedbackRows.push(data);
        return { id: `fb-${feedbackRows.length}`, ...data };
      },
    },
    personalizedRecommendation: {
      findUnique: async ({ where }) => (where.id === recommendationRow.id ? {
        ...recommendationRow,
        definition: { code: 'dryer_vent_cleaning', safetyTier: 'LOW_CONSEQUENCE', governancePolicyVersion: 'phase4-v1' },
      } : null),
      findFirst: async ({ where }) => (where.id === recommendationRow.id && where.definitionId === recommendationRow.definitionId ? { id: recommendationRow.id } : null),
      updateMany: async ({ where, data }) => {
        recommendationUpdates.push({ where, data });
        if (recommendationRow.id === where.id && recommendationRow.status === where.status) {
          recommendationRow = { ...recommendationRow, ...data };
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    recommendationSuppression: {
      findUnique: async ({ where }) => {
        const key = where.propertyId_definitionId;
        return suppressions.find((s) => s.propertyId === key.propertyId && s.definitionId === key.definitionId) || null;
      },
      upsert: async ({ where, create, update }) => {
        const key = where.propertyId_definitionId;
        const idx = suppressions.findIndex((s) => s.propertyId === key.propertyId && s.definitionId === key.definitionId);
        const record = idx >= 0 ? { ...suppressions[idx], ...update } : { ...create };
        if (idx >= 0) suppressions[idx] = record;
        else suppressions.push(record);
        return record;
      },
    },
    recommendationDefinition: {
      findUnique: async ({ where }) => (where.id === recommendationRow.definitionId ? {
        id: recommendationRow.definitionId,
        code: 'dryer_vent_cleaning',
        safetyTier: 'LOW_CONSEQUENCE',
        governancePolicyVersion: 'phase4-v1',
        pausedAt: null,
      } : null),
      update: async () => ({}),
    },
    recommendationIncident: {
      findUnique: async ({ where }) => incidents.find((row) => row.sourceFeedbackId === where.sourceFeedbackId) || null,
      create: async ({ data }) => {
        const row = { id: `incident-${incidents.length + 1}`, ...data, definition: { code: 'dryer_vent_cleaning' } };
        incidents.push(row);
        return row;
      },
    },
    personalizationAuditEvent: { create: async () => ({}) },
  };

  return { prismaMock, feedbackRows, suppressions, recommendationUpdates, incidents, getRecommendationRow: () => recommendationRow };
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
    '../../src/modules/personalization/infrastructure/feedbackRepository.ts',
    '../../src/modules/personalization/infrastructure/suppressionRepository.ts',
    '../../src/modules/personalization/infrastructure/recommendationRepository.ts',
    '../../src/services/personalizationAudit.service.ts',
    '../../src/services/recommendationIncident.service.ts',
    '../../src/modules/personalization/application/recordRecommendationFeedback.usecase.ts',
  ].map((p) => require.resolve(p));
  for (const p of paths) delete require.cache[p];
  return require('../../src/modules/personalization/application/recordRecommendationFeedback.usecase.ts');
}

test('duplicate eventId is a true no-op: no new feedback row, no suppression call', async () => {
  const recommendation = {
    id: 'rec-1',
    propertyId: 'prop-1',
    definitionId: 'def-1',
  };
  const { prismaMock, feedbackRows, suppressions } = createPrismaMock({ recommendation });
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const params = { recommendationId: 'rec-1', eventId: 'evt-1', type: 'NOT_RELEVANT', explicit: true };
  const first = await recordRecommendationFeedback(params);
  const second = await recordRecommendationFeedback(params);

  assert.equal(first.status, 'RECORDED');
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(feedbackRows.length, 1);
  assert.equal(suppressions.length, 1); // only from the first call
});

test('explicit NOT_RELEVANT creates an indefinite definition suppression and dismisses the recommendation', async () => {
  const { prismaMock, suppressions, getRecommendationRow } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const result = await recordRecommendationFeedback({
    recommendationId: 'rec-1',
    eventId: 'evt-2',
    type: 'NOT_RELEVANT',
    explicit: true,
  });

  assert.equal(result.status, 'RECORDED');
  assert.equal(result.suppressed, true);
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].definitionId, 'def-1');
  assert.equal(suppressions[0].until, null);
  assert.equal(getRecommendationRow().status, 'DISMISSED');
});

test('explicit DISMISSED creates a time-bounded definition suppression', async () => {
  const { prismaMock, suppressions } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const result = await recordRecommendationFeedback({
    recommendationId: 'rec-1',
    eventId: 'evt-3',
    type: 'DISMISSED',
    explicit: true,
  });

  assert.equal(result.suppressed, true);
  assert.equal(suppressions[0].definitionId, 'def-1');
  assert.ok(suppressions[0].until instanceof Date);
});

test('implicit VIEWED creates only the feedback row — no suppression, recommendation untouched', async () => {
  const { prismaMock, feedbackRows, suppressions, recommendationUpdates } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const result = await recordRecommendationFeedback({
    recommendationId: 'rec-1',
    eventId: 'evt-4',
    type: 'VIEWED',
    explicit: false,
  });

  assert.equal(result.status, 'RECORDED');
  assert.equal(result.suppressed, false);
  assert.equal(feedbackRows.length, 1);
  assert.equal(suppressions.length, 0);
  assert.equal(recommendationUpdates.length, 0);
});

test('returns RECOMMENDATION_NOT_FOUND when the recommendation does not exist', async () => {
  const { prismaMock } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const result = await recordRecommendationFeedback({
    recommendationId: 'missing-rec',
    eventId: 'evt-5',
    type: 'VIEWED',
    explicit: false,
  });

  assert.equal(result.status, 'RECOMMENDATION_NOT_FOUND');
});

test('explicit complaint opens one idempotently linked recommendation incident', async () => {
  const { prismaMock, incidents } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { recordRecommendationFeedback } = loadUseCase();

  const result = await recordRecommendationFeedback({
    recommendationId: 'rec-1',
    eventId: 'evt-complaint',
    type: 'COMPLAINT',
    explicit: true,
    comment: 'The recommended interval conflicts with the appliance manual.',
    reportedByUserId: 'user-1',
  });

  assert.equal(result.status, 'RECORDED');
  assert.equal(result.incidentOpened, true);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].type, 'COMPLAINT');
  assert.equal(incidents[0].sourceFeedbackId, 'fb-1');
});
