const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Audit Phase 4: "What about the overdue ones?" narrows the list just shown; "What about my mortgage rate?" is a new question.
let mockRow = null;
const prismaMock = { askExecution: { findFirst: async () => mockRow } };
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { resolveAskFollowUpMessage, conversationalFilterAsOnlyShow, containsFilterContinuation } = require('../../src/services/ask/askFollowUpContext.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const prior = (operationId, message) => ({ id: 'prior-1', sessionId: 's1', operationId, message, resultJson: { blocks: [] }, parametersJson: {}, launchContextJson: null });
const resolve = (message, extra = {}) => resolveAskFollowUpMessage({ sessionId: 's1', propertyId: 'p1', message, ...extra });

test('a conversational narrowing of a maintenance list continues that list', async () => {
  for (const message of ['What about the overdue ones?', 'Which ones are urgent?', 'And the completed ones?', 'How about the due soon ones', 'what about overdue']) {
    mockRow = prior('MAINTENANCE_STATUS', 'Show my maintenance tasks');
    const result = await resolve(message);
    assert.equal(result.forcedOperationId, 'MAINTENANCE_STATUS', message);
    assert.equal(result.isFilterRefinement, true, message);
    assert.equal(result.sourceExecutionId, 'prior-1', message);
    assert.ok(containsFilterContinuation(result.effectiveMessage), `${message} -> ${result.effectiveMessage}`);
    assert.ok(result.effectiveMessage.startsWith('Show my maintenance tasks. Only show'), result.effectiveMessage);
  }
});

test('the rewrite names the filter the homeowner named', () => {
  assert.equal(conversationalFilterAsOnlyShow('What about the overdue ones?', 'MAINTENANCE_STATUS'), 'Only show the overdue ones');
  assert.equal(conversationalFilterAsOnlyShow('Which ones are high priority?', 'HOME_ACTIONS'), 'Only show the high priority ones');
  assert.equal(conversationalFilterAsOnlyShow('How about in the kitchen?', 'MAINTENANCE_STATUS'), 'Only show tasks in the kitchen');
});

test('a declared chip source uses the message alone, like the existing filter chips', async () => {
  mockRow = prior('MAINTENANCE_STATUS', 'Show my maintenance tasks');
  const result = await resolve('What about the overdue ones?', { declaredSourceExecutionId: 'prior-1' });
  assert.equal(result.effectiveMessage, 'Only show the overdue ones');
});

test('a room narrowing continues a maintenance list only', async () => {
  mockRow = prior('MAINTENANCE_STATUS', 'Show my maintenance tasks');
  assert.equal((await resolve('How about in the kitchen?')).forcedOperationId, 'MAINTENANCE_STATUS');
  for (const operationId of ['HOME_ACTIONS', 'WORK_OVERVIEW', 'INVENTORY_LOOKUP']) {
    mockRow = prior(operationId, 'Show it');
    assert.equal((await resolve('How about in the kitchen?')).forcedOperationId, null, operationId);
  }
});

test('a new topic is never taken for a narrowing', async () => {
  mockRow = prior('MAINTENANCE_STATUS', 'Show my maintenance tasks');
  for (const message of ['What about my mortgage rate?', 'What about the kitchen faucet?', 'How about in the budget?', 'And what is my insurance?', 'Which ones are covered by warranty?', 'What about the overdue taxes on my property?']) {
    const result = await resolve(message);
    assert.equal(result.forcedOperationId, null, message);
    assert.equal(result.effectiveMessage, message, message);
    assert.equal(result.sourceExecutionId, null, message);
  }
  assert.equal(resolveAskRoutingCascade('What about my mortgage rate?', { localRoutingEnabled: true }).operation.operationId !== 'MAINTENANCE_STATUS', true);
});

test('a status word only continues a list that has that filter', async () => {
  for (const operationId of ['INVENTORY_LOOKUP', 'DOCUMENT_LOOKUP', 'COVERAGE_GAPS', 'PROPERTY_SUMMARY']) {
    mockRow = prior(operationId, 'Show it');
    assert.equal((await resolve('What about the overdue ones?')).forcedOperationId, null, operationId);
  }
});

test('with no recent list the message is unchanged, and the existing "Only show" wording still works', async () => {
  mockRow = null;
  assert.equal((await resolve('What about the overdue ones?')).forcedOperationId, null);
  mockRow = prior('MAINTENANCE_STATUS', 'Show my maintenance tasks');
  const result = await resolve('Only show the urgent ones');
  assert.equal(result.forcedOperationId, 'MAINTENANCE_STATUS');
  assert.equal(result.effectiveMessage, 'Show my maintenance tasks. Only show the urgent ones');
});
