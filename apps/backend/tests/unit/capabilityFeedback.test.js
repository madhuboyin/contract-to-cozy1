const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
process.env.GEMINI_API_KEY ||= 'test-key';

const {
  CapabilityFeedbackInputSchema,
  recordCapabilityFeedback,
} = require('../../src/services/capabilityFeedback.service.ts');
const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');

const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function feedback(overrides = {}) {
  const capability = canonicalCapabilityRegistry.getById('material-specs');
  const source = {
    kind: 'HOME_ACTION',
    id: 'action-1',
    actionId: 'action-1',
    journeyId: null,
    entityType: 'PROJECT',
    entityId: 'project-1',
  };
  return {
    eventId: '33333333-3333-4333-8333-333333333333',
    suggestionId: `material-specs:${source.kind}:${source.id}:context-v1`,
    capabilityId: 'material-specs',
    manifestVersion: capability.version,
    registryVersion: canonicalCapabilityRegistry.version,
    recommendationVersion: 'capability-recommendation-v1',
    contextVersion: 'context-v1',
    surface: 'WORKFLOW',
    type: 'OPENED',
    readiness: 'READY',
    source,
    propertyId: PROPERTY_ID,
    userId: USER_ID,
    ...overrides,
  };
}

function requestBody(overrides = {}) {
  const { propertyId, userId, ...body } = feedback(overrides);
  return body;
}

function dependencies() {
  const receipts = new Map();
  const calls = {
    opened: [],
    commands: [],
    personalization: [],
    lifecycle: [],
  };
  return {
    calls,
    value: {
      withIdempotencyLock: async (eventId, work) => work({
        duplicateRecordedAt: receipts.get(eventId) ?? null,
        run: async (operation) => {
          const result = await operation();
          receipts.set(eventId, new Date(result.recordedAt));
          return result;
        },
      }),
      recordHomeActionOpened: async (...args) => calls.opened.push(args),
      executeHomeActionCommand: async (...args) => calls.commands.push(args),
      recordRecommendationFeedback: async (...args) => {
        calls.personalization.push(args);
        return { status: 'RECORDED', suppressed: false };
      },
      recordLifecycle: async (...args) => {
        calls.lifecycle.push(args);
        return { count: 1 };
      },
      now: () => new Date('2026-07-24T12:00:00.000Z'),
    },
  };
}

test('capability feedback validates manifest and source-bound suggestion identity', () => {
  assert.equal(CapabilityFeedbackInputSchema.safeParse(requestBody()).success, true);
  assert.equal(CapabilityFeedbackInputSchema.safeParse(requestBody({
    suggestionId: 'material-specs:PROJECT:wrong:context-v1',
  })).success, false);
  assert.equal(CapabilityFeedbackInputSchema.safeParse(requestBody({
    manifestVersion: 999,
  })).success, false);
});

test('duplicate opened feedback does not replay Home Action or analytics lifecycle', async () => {
  const deps = dependencies();
  const first = await recordCapabilityFeedback(feedback(), deps.value);
  const duplicate = await recordCapabilityFeedback(feedback(), deps.value);

  assert.equal(first.status, 'RECORDED');
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(deps.calls.opened.length, 1);
  assert.equal(deps.calls.commands.length, 0);
  assert.equal(deps.calls.lifecycle.length, 1);
  assert.equal(deps.calls.lifecycle[0][0].events[0].stage, 'CLICKED');
  assert.equal(
    deps.calls.lifecycle[0][0].events[0].metadata.feedbackEventId,
    feedback().eventId,
  );
});

test('negative Home Action feedback uses the canonical command lifecycle', async () => {
  const deps = dependencies();
  const input = feedback({
    eventId: '44444444-4444-4444-8444-444444444444',
    type: 'NOT_RELEVANT',
    reasonCode: 'NOT_APPLICABLE',
  });
  await recordCapabilityFeedback(input, deps.value);

  assert.equal(deps.calls.commands.length, 1);
  assert.deepEqual(deps.calls.commands[0], [
    PROPERTY_ID,
    'action-1',
    USER_ID,
    {
      command: 'NOT_RELEVANT',
      reason: 'NOT_APPLICABLE',
      consequenceAcknowledged: true,
    },
  ]);
  assert.equal(deps.calls.lifecycle[0][0].events[0].stage, 'NOT_RELEVANT');
});

test('personalization feedback reuses the recommendation feedback event identity', async () => {
  const deps = dependencies();
  const source = {
    kind: 'PERSONALIZATION',
    id: 'recommendation-1',
    actionId: null,
    journeyId: null,
    entityType: null,
    entityId: null,
  };
  const input = feedback({
    eventId: '55555555-5555-4555-8555-555555555555',
    suggestionId: 'material-specs:PERSONALIZATION:recommendation-1:context-v1',
    type: 'DISMISSED',
    source,
  });
  await recordCapabilityFeedback(input, deps.value);

  assert.equal(deps.calls.personalization.length, 1);
  assert.equal(deps.calls.personalization[0][0].eventId, input.eventId);
  assert.equal(deps.calls.personalization[0][0].type, 'DISMISSED');
  assert.equal(deps.calls.personalization[0][0].explicit, true);
});
