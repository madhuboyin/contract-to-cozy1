const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  RadarInteractionService,
} = require('../../src/modules/homeEventRadar/services/radarInteraction.service');
const {
  submitRadarFeedbackBodySchema,
  updateRadarStateBodySchema,
} = require('../../src/validators/homeEventRadar.validators');
const {
  radarFeedbackResponseSchema,
  radarInteractionStateResponseSchema,
} = require('../../src/modules/homeEventRadar/contracts/radar.contracts');

const NOW = new Date('2026-07-26T12:00:00.000Z');

function fixture({ matchExists = true } = {}) {
  let state = {
    id: 'state-1',
    propertyRadarMatchId: 'match-1',
    userId: 'user-1',
    state: 'dismissed',
    createdAt: new Date('2026-07-26T10:00:00.000Z'),
    updatedAt: new Date('2026-07-26T11:00:00.000Z'),
  };
  let feedback = null;
  const actions = [];
  const db = {
    propertyRadarMatch: {
      findFirst: async () => matchExists ? { id: 'match-1' } : null,
    },
    propertyRadarState: {
      findUnique: async () => state,
    },
    propertyRadarFeedback: {
      upsert: async ({ create, update }) => {
        feedback = feedback
          ? { ...feedback, ...update, updatedAt: NOW }
          : {
              id: 'feedback-1',
              ...create,
              createdAt: NOW,
              updatedAt: NOW,
            };
        return feedback;
      },
    },
    $transaction: async (work) => work({
      propertyRadarState: {
        upsert: async ({ create, update }) => {
          state = state
            ? { ...state, ...update, updatedAt: NOW }
            : {
                id: 'state-1',
                ...create,
                createdAt: NOW,
                updatedAt: NOW,
              };
          return state;
        },
      },
      propertyRadarAction: {
        create: async ({ data }) => actions.push(data),
      },
    }),
  };
  return {
    actions,
    service: new RadarInteractionService({ db, now: () => NOW }),
  };
}

test('restoring a dismissed match is persisted and audited idempotently', async () => {
  const { actions, service } = fixture();

  const restored = await service.updateState('property-1', 'match-1', 'user-1', 'seen');
  const repeated = await service.updateState('property-1', 'match-1', 'user-1', 'seen');

  assert.equal(restored.state, 'seen');
  assert.equal(repeated.state, 'seen');
  assert.equal(radarInteractionStateResponseSchema.safeParse(restored).success, true);
  assert.deepEqual(actions, [{
    propertyRadarMatchId: 'match-1',
    actionType: 'restore_event',
    actionMetaJson: {
      actorUserId: 'user-1',
      fromState: 'dismissed',
      toState: 'seen',
    },
  }]);
});

test('structured feedback replaces the homeowner response without exposing internal metadata', async () => {
  const { service } = fixture();

  const first = await service.submitFeedback(
    'property-1',
    'match-1',
    'user-1',
    'wrong_location',
    'This alert belongs to another county.',
  );
  const corrected = await service.submitFeedback(
    'property-1',
    'match-1',
    'user-1',
    'stale',
    null,
  );

  assert.equal(first.feedbackType, 'wrong_location');
  assert.equal(first.comment, 'This alert belongs to another county.');
  assert.deepEqual(corrected, {
    feedbackType: 'stale',
    comment: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  assert.equal('metadataJson' in corrected, false);
  assert.equal('userId' in corrected, false);
  assert.equal(radarFeedbackResponseSchema.safeParse(corrected).success, true);
});

test('state and feedback writes fail closed for a match outside the property', async () => {
  const { service } = fixture({ matchExists: false });

  await assert.rejects(
    service.updateState('property-2', 'match-1', 'user-1', 'saved'),
    (error) => error.code === 'RADAR_MATCH_NOT_FOUND',
  );
  await assert.rejects(
    service.submitFeedback('property-2', 'match-1', 'user-1', 'duplicate', null),
    (error) => error.code === 'RADAR_MATCH_NOT_FOUND',
  );
});

test('interaction validators allow only reviewed reasons and bounded safe comments', () => {
  const valid = submitRadarFeedbackBodySchema.parse({
    feedbackType: 'not_relevant',
    comment: '  This does not apply to my home.  ',
  });
  assert.equal(valid.comment, 'This does not apply to my home.');

  assert.equal(submitRadarFeedbackBodySchema.safeParse({
    feedbackType: 'incorrect',
  }).success, false);
  assert.equal(submitRadarFeedbackBodySchema.safeParse({
    feedbackType: 'other',
    comment: 'x'.repeat(501),
  }).success, false);
  assert.equal(submitRadarFeedbackBodySchema.safeParse({
    feedbackType: 'other',
    comment: 'unsafe\u0000comment',
  }).success, false);
  assert.equal(updateRadarStateBodySchema.safeParse({
    state: 'saved',
    stateMetaJson: { arbitrary: true },
  }).success, false);
  assert.equal(updateRadarStateBodySchema.safeParse({
    state: 'new',
  }).success, false);
});
