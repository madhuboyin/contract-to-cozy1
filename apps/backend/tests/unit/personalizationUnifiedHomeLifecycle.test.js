const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

function loadUseCase(existingSuppression = null) {
  const feedback = [];
  const suppressions = [];
  const updates = [];
  const db = {
    personalizedRecommendation: {
      findFirst: async () => ({ id: 'rec-1', definitionId: 'def-1' }),
      update: async ({ data }) => { updates.push(data); return { id: 'rec-1', ...data }; },
    },
    recommendationFeedback: {
      upsert: async (args) => { feedback.push(args); return { id: 'feedback-1' }; },
    },
    recommendationSuppression: {
      findUnique: async () => existingSuppression,
      upsert: async (args) => { suppressions.push(args); return { id: 'suppression-1' }; },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: { $transaction: async (work) => work(db) } },
  };
  const useCasePath = require.resolve('../../src/modules/personalization/application/applyHomeActionLifecycle.usecase.ts');
  delete require.cache[useCasePath];
  return {
    ...require('../../src/modules/personalization/application/applyHomeActionLifecycle.usecase.ts'),
    feedback,
    suppressions,
    updates,
  };
}

test('snoozing a Home personalization action synchronizes temporary suppression', async () => {
  const { applyPersonalizationHomeActionLifecycle, feedback, suppressions, updates } = loadUseCase();
  const nextTriggerAt = new Date(Date.now() + 7 * 86_400_000);
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', userId: 'user-1',
    command: 'SNOOZE', reason: 'Review next week', nextTriggerAt,
  });
  assert.equal(feedback[0].create.type, 'SNOOZE');
  assert.equal(suppressions[0].create.reason, 'SYSTEM');
  assert.equal(suppressions[0].create.until, nextTriggerAt);
  assert.equal(updates[0].status, 'SUPPRESSED');
});

test('completing a Home personalization action makes the underlying recommendation terminal', async () => {
  const { applyPersonalizationHomeActionLifecycle, suppressions, updates } = loadUseCase();
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', userId: 'user-1',
    command: 'COMPLETE', reason: 'Completed from Home', nextTriggerAt: null,
  });
  assert.equal(suppressions[0].create.reason, 'COMPLETED');
  assert.equal(suppressions[0].create.until, null);
  assert.equal(updates[0].status, 'COMPLETED');
  assert.ok(updates[0].expiresAt instanceof Date);
});

test('marking a Home personalization action not relevant creates indefinite user suppression', async () => {
  const { applyPersonalizationHomeActionLifecycle, suppressions, updates } = loadUseCase();
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', userId: 'user-1',
    command: 'NOT_RELEVANT', reason: 'Does not apply to this home', nextTriggerAt: null,
  });
  assert.equal(suppressions[0].create.reason, 'USER_DISMISSED');
  assert.equal(suppressions[0].create.until, null);
  assert.equal(updates[0].status, 'DISMISSED');
});
