const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  askExecutionCanRetry,
  buildAskRetryRequest,
} = require('../../src/services/ask/execution/askRetry.ts');

test('Ask retry eligibility matches the response correction capability', () => {
  assert.equal(askExecutionCanRetry('FAILED_RETRYABLE', 'ASK_EXECUTION_INTERRUPTED'), true);
  assert.equal(askExecutionCanRetry('UNAVAILABLE', 'ASK_CONTEXT_PROVIDER_UNAVAILABLE'), true);
  assert.equal(askExecutionCanRetry('UNAVAILABLE', 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION'), false);
  assert.equal(askExecutionCanRetry('ANSWERED', null), false);
  assert.equal(askExecutionCanRetry('FAILED_TERMINAL', null), false);
});

test('Ask retry replays the persisted request and preserves stable action identity', () => {
  const request = buildAskRetryRequest({
    id: 'failed-execution',
    sessionId: 'session',
    propertyId: 'property',
    message: 'What should I do next for “Seal driveway cracks before freezing”?',
    operationId: 'GROUNDED_GUIDANCE',
    launchContextJson: {
      surface: 'ASK_PAGE',
      sourceExecutionId: 'priority-list-execution',
      entityType: 'HOME_ACTION',
      entityId: 'home-action-id',
      actionId: 'review-in-ask',
      returnTo: '/dashboard/ask?propertyId=property',
    },
  }, { clientRequestId: 'retry-request' });

  assert.equal(request.message, 'What should I do next for “Seal driveway cracks before freezing”?');
  assert.equal(request.sessionId, 'session');
  assert.equal(request.propertyId, 'property');
  assert.deepEqual(request.launchContext, {
    surface: 'ASK_PAGE',
    sourceExecutionId: 'priority-list-execution',
    entityType: 'HOME_ACTION',
    entityId: 'home-action-id',
    actionId: 'review-in-ask',
    returnTo: '/dashboard/ask?propertyId=property',
    operationId: 'GROUNDED_GUIDANCE',
  });
});
