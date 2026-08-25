const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  FEEDBACK_REASON_CODES,
  isFeedbackReasonCode,
  isSafetySensitiveFeedback,
} = require('../../src/productFramework/feedback.contract.ts');
const {
  buildTypedFeedbackData,
} = require('../../src/services/feedback/typedFeedback.service.ts');
const {
  SubmitAskFeedbackSchema,
  SubmitHomeActionUsefulnessFeedbackSchema,
} = require('../../src/productFramework/ask/ask.contract.ts');

test('FEEDBACK_REASON_CODES covers every HI-FBK-003 meaning exactly once', () => {
  const expected = [
    'USEFUL', 'NOT_USEFUL', 'ALREADY_HANDLED', 'WRONG_FACT', 'WRONG_TIMING',
    'NOT_APPLICABLE', 'DUPLICATE', 'UNCLEAR_EXPLANATION', 'UNSAFE_OR_INAPPROPRIATE',
  ];
  assert.deepEqual([...FEEDBACK_REASON_CODES].sort(), [...expected].sort());
  assert.equal(new Set(FEEDBACK_REASON_CODES).size, FEEDBACK_REASON_CODES.length);
});

test('isFeedbackReasonCode only accepts registered codes', () => {
  for (const code of FEEDBACK_REASON_CODES) assert.equal(isFeedbackReasonCode(code), true);
  assert.equal(isFeedbackReasonCode('MADE_UP_CODE'), false);
  assert.equal(isFeedbackReasonCode(''), false);
});

test('HI-FBK-002: only UNSAFE_OR_INAPPROPRIATE is safety-sensitive', () => {
  assert.equal(isSafetySensitiveFeedback(['UNSAFE_OR_INAPPROPRIATE']), true);
  assert.equal(isSafetySensitiveFeedback(['NOT_USEFUL', 'UNSAFE_OR_INAPPROPRIATE']), true);
  assert.equal(isSafetySensitiveFeedback(['NOT_USEFUL', 'WRONG_FACT']), false);
  assert.equal(isSafetySensitiveFeedback([]), false);
});

test('buildTypedFeedbackData populates both legacy and typed fields', () => {
  const data = buildTypedFeedbackData({
    userId: 'user-1',
    propertyId: 'property-1',
    page: 'home-action:action-1',
    rating: 'useful',
    comment: 'Great catch',
    targetType: 'HOME_ACTION',
    targetId: 'action-1',
    surface: 'COZY',
    reasonCodes: ['USEFUL'],
    contextVersion: 'ctx-v1',
  });
  assert.equal(data.userId, 'user-1');
  assert.equal(data.propertyId, 'property-1');
  assert.equal(data.page, 'home-action:action-1');
  assert.equal(data.rating, 'useful');
  assert.equal(data.comment, 'Great catch');
  assert.equal(data.targetType, 'HOME_ACTION');
  assert.equal(data.targetId, 'action-1');
  assert.equal(data.surface, 'COZY');
  assert.deepEqual(data.reasonCodes, ['USEFUL']);
  assert.equal(data.contextVersion, 'ctx-v1');
  assert.equal(data.recommendationSnapshotId, null);
  assert.equal(data.outcomeObservationId, null);
});

test('buildTypedFeedbackData defaults optional fields and rejects unknown reason codes', () => {
  const data = buildTypedFeedbackData({
    userId: 'user-1',
    propertyId: null,
    page: 'ask:execution:exec-1',
    rating: 'up',
    targetType: 'ASK_EXECUTION',
    targetId: 'exec-1',
    surface: 'COZY',
  });
  assert.equal(data.comment, null);
  assert.deepEqual(data.reasonCodes, []);
  assert.equal(data.contextVersion, null);

  assert.throws(() => buildTypedFeedbackData({
    userId: 'user-1',
    propertyId: null,
    page: 'p',
    rating: 'up',
    targetType: 'OTHER',
    targetId: 'p',
    surface: 'OTHER',
    reasonCodes: ['NOT_A_REAL_CODE'],
  }), /Unknown feedback reason code/);
});

test('Ask feedback schemas accept up to 3 bounded reason codes and reject unregistered ones', () => {
  assert.equal(SubmitAskFeedbackSchema.safeParse({ rating: 'UP', reasonCodes: ['USEFUL'] }).success, true);
  assert.equal(SubmitAskFeedbackSchema.safeParse({ rating: 'DOWN', reasonCodes: ['WRONG_FACT', 'WRONG_TIMING', 'DUPLICATE'] }).success, true);
  assert.equal(SubmitAskFeedbackSchema.safeParse({ rating: 'DOWN', reasonCodes: ['A', 'B', 'C', 'D'] }).success, false);
  assert.equal(SubmitAskFeedbackSchema.safeParse({ rating: 'DOWN', reasonCodes: ['NOT_REAL'] }).success, false);

  assert.equal(SubmitHomeActionUsefulnessFeedbackSchema.safeParse({ rating: 'NOT_USEFUL', reasonCodes: ['ALREADY_HANDLED'] }).success, true);
  assert.equal(SubmitHomeActionUsefulnessFeedbackSchema.safeParse({ rating: 'NOT_USEFUL', reasonCodes: ['NOT_REAL'] }).success, false);
});
