const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaModule = require('../../src/lib/prisma.ts');
const createModule = require('../../src/services/ask/execution/createAskExecution.ts');
const {
  askExecutionCanRetry,
  buildAskRetryRequest,
  hasRetryableCompatibilityFallback,
  retryAskExecution,
} = require('../../src/services/ask/execution/askRetry.ts');
const { mapPersistedExecution } = require('../../src/services/ask/support/executionState.ts');

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

const incompatibleExecution = (overrides = {}) => ({
  id: 'old-answer', sessionId: 'session', message: 'Show my home ownership costs', status: 'ANSWERED', reasonCode: null,
  propertyId: 'property', operationId: 'OWNERSHIP_COSTS', operationVersion: '1.0', intentFamily: 'STATUS_SUMMARY', contextVersion: 'context-v1',
  resultJson: { schemaVersion: '1.0', blocks: [{ type: 'OLD_UNSUPPORTED_BLOCK' }], captureRequests: [], confirmation: null, clarification: null, suggestions: [] },
  launchContextJson: { surface: 'ASK_PAGE' }, parametersJson: null, skillId: null, skillVersion: null, skillDomain: null,
  createdAt: new Date('2026-10-01T12:00:00.000Z'), updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  ...overrides,
});
const property = { id: 'property', label: 'Main' };

test('an incompatible answered read exposes and authorizes the same compatibility retry', () => {
  const source = incompatibleExecution();
  const mapped = mapPersistedExecution(source, property);
  assert.equal(mapped.blocks[0].id, 'ask-schema-fallback');
  assert.equal(mapped.correctionCapabilities.retryResponse, true);
  assert.match(mapped.blocks[0].body, /creates a new answer from your current home records/i);
  assert.match(mapped.blocks[0].body, /original response remains in your history/i);
  assert.equal(hasRetryableCompatibilityFallback(source, property), true);
});

test('an incompatible command receipt never gains authority to replay the command', () => {
  const source = incompatibleExecution({ status: 'COMPLETED', operationId: 'MAINTENANCE_TASK_CREATE', intentFamily: 'COMMAND' });
  const mapped = mapPersistedExecution(source, property);
  assert.equal(mapped.blocks[0].id, 'ask-schema-fallback');
  assert.equal(mapped.correctionCapabilities.retryResponse, false);
  assert.equal(hasRetryableCompatibilityFallback(source, property), false);
});

test('the retry endpoint creates a new pinned execution for an incompatible answered read', async () => {
  const savedPrisma = prismaModule.prisma;
  const savedCreate = createModule.createAskExecution;
  const source = incompatibleExecution();
  const calls = [];
  prismaModule.prisma = {
    property: { findUnique: async () => ({ id: 'property', name: 'Main', address: '1 Main St', city: 'Boston', state: 'MA' }) },
    askExecution: {
      findFirst: async () => source,
      findUnique: async () => ({ resultJson: { schemaVersion: '1.0', blocks: [] } }),
      update: (args) => ({ kind: 'update', args }),
    },
    askExecutionEvent: { create: (args) => ({ kind: 'event', args }) },
    $transaction: async (writes) => { calls.push(['transaction', writes]); return writes; },
  };
  createModule.createAskExecution = async (userId, request) => {
    calls.push(['create', userId, request]);
    return { executionId: 'new-answer', sessionId: 'session', status: 'ANSWERED', blocks: [], captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { intent: true, entity: false, homeRecord: true, retryResponse: false }, suggestions: [], createdAt: '2026-10-28T12:00:00.000Z', updatedAt: '2026-10-28T12:00:00.000Z' };
  };
  try {
    const result = await retryAskExecution('user', source.id, { clientRequestId: 'compatibility-retry' });
    assert.equal(result.executionId, 'new-answer');
    assert.equal(result.continuesExecutionId, source.id);
    assert.deepEqual(calls[0].slice(0, 2), ['create', 'user']);
    assert.equal(calls[0][2].launchContext.operationId, 'OWNERSHIP_COSTS');
    assert.equal(calls[1][0], 'transaction');
  } finally {
    prismaModule.prisma = savedPrisma;
    createModule.createAskExecution = savedCreate;
  }
});
