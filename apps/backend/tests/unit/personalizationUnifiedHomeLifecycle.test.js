const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

function loadUseCase(existingSuppression = null) {
  const feedback = [];
  const suppressions = [];
  const updates = [];
  const orchestrationEvents = [];
  const snoozes = [];
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
    orchestrationActionEvent: {
      upsert: async (args) => {
        orchestrationEvents.push(args);
        return { id: `event-${orchestrationEvents.length}` };
      },
    },
    orchestrationActionSnooze: {
      updateMany: async () => ({ count: 1 }),
      create: async (args) => {
        const row = { id: `snooze-${snoozes.length + 1}`, ...args };
        snoozes.push(row);
        return { id: row.id };
      },
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
    orchestrationEvents,
    snoozes,
  };
}

test('snoozing a Home personalization action synchronizes temporary suppression', async () => {
  const { applyPersonalizationHomeActionLifecycle, feedback, suppressions, updates, snoozes } = loadUseCase();
  const nextTriggerAt = new Date(Date.now() + 7 * 86_400_000);
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
    command: 'SNOOZE', reason: 'Review next week', nextTriggerAt,
  });
  assert.equal(feedback[0].create.type, 'SNOOZED');
  assert.equal(feedback[0].create.reasonCode, 'BAD_TIMING');
  assert.equal(feedback[0].create.eventId, 'home:snooze:snooze-1:SNOOZE');
  assert.equal(snoozes.length, 1);
  assert.equal(suppressions[0].create.reason, 'SYSTEM');
  assert.equal(suppressions[0].create.until, nextTriggerAt);
  assert.equal(updates[0].status, 'SUPPRESSED');
});

test('completing a Home personalization action makes the underlying recommendation terminal', async () => {
  const { applyPersonalizationHomeActionLifecycle, suppressions, updates } = loadUseCase();
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
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
    recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
    command: 'NOT_RELEVANT', reason: 'Does not apply to this home', nextTriggerAt: null,
  });
  assert.equal(suppressions[0].create.reason, 'USER_DISMISSED');
  assert.equal(suppressions[0].create.until, null);
  assert.equal(updates[0].status, 'DISMISSED');
});

test('Home commands use canonical personalization feedback values and reasons', async () => {
  const expected = {
    COMPLETE: ['COMPLETED', null, 'COMPLETED'],
    ALREADY_DONE: ['COMPLETED', 'ALREADY_DONE', 'COMPLETED'],
    DEFER: ['SNOOZED', 'BAD_TIMING', 'SYSTEM'],
    SNOOZE: ['SNOOZED', 'BAD_TIMING', 'SYSTEM'],
    DISMISS: ['DISMISSED', 'OTHER', 'USER_DISMISSED'],
    NOT_RELEVANT: ['NOT_RELEVANT', 'NOT_APPLICABLE', 'USER_DISMISSED'],
  };

  for (const [command, [type, reasonCode, suppressionReason]] of Object.entries(expected)) {
    const { applyPersonalizationHomeActionLifecycle, feedback, suppressions } = loadUseCase();
    const nextTriggerAt = ['DEFER', 'SNOOZE'].includes(command)
      ? new Date(Date.now() + 7 * 86_400_000)
      : null;
    await applyPersonalizationHomeActionLifecycle({
      recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
      command, reason: `Test ${command}`, nextTriggerAt,
    });
    assert.equal(feedback[0].create.type, type, command);
    assert.equal(feedback[0].create.reasonCode, reasonCode, command);
    assert.equal(suppressions[0].create.reason, suppressionReason, command);
  }
});

test('repeated snoozes receive distinct feedback event identities', async () => {
  const { applyPersonalizationHomeActionLifecycle, feedback } = loadUseCase();
  for (const days of [7, 14]) {
    await applyPersonalizationHomeActionLifecycle({
      recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
      command: 'SNOOZE', reason: `Review in ${days} days`, nextTriggerAt: new Date(Date.now() + days * 86_400_000),
    });
  }
  assert.equal(feedback.length, 2);
  assert.notEqual(feedback[0].create.eventId, feedback[1].create.eventId);
});

test('orchestration and personalization writes share the same transaction boundary', async () => {
  const { applyPersonalizationHomeActionLifecycle, orchestrationEvents, updates } = loadUseCase();
  await applyPersonalizationHomeActionLifecycle({
    recommendationId: 'rec-1', propertyId: 'property-1', actionKey: 'personalization:rec-1', userId: 'user-1',
    command: 'COMPLETE', reason: 'Completed together', nextTriggerAt: null,
  });
  assert.equal(orchestrationEvents.length, 1);
  assert.equal(updates.length, 1);
  assert.equal(orchestrationEvents[0].create.createdBy, 'user-1');
});
