const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { refreshLaunchContext } = require('../../src/services/ask/execution/executeOperation.ts');

// FRD v1.169: a refresh re-ran a focused execution without its focus, so a focused Home Action answer
// came back as the unfocused "N Home Actions are ready to review" feed.

test('a refresh keeps the execution\'s focus so a focused Home Action stays focused', () => {
  const context = refreshLaunchContext({
    id: 'exec-1',
    launchContextJson: { surface: 'ASK_PAGE', entityType: 'HOME_ACTION', entityId: 'operational-work:w1', actionId: 'operational-work:w1', decisionThreadId: 'd1', workItemId: 'w1', journeyId: 'j1' },
  });
  assert.deepEqual(context, {
    entityType: 'HOME_ACTION', entityId: 'operational-work:w1', actionId: 'operational-work:w1',
    decisionThreadId: 'd1', workItemId: 'w1', journeyId: 'j1',
    surface: 'ASK_REFRESH', sourceExecutionId: 'exec-1',
  });
});

test('one-shot mutation hints, the stale context version and the original surface are never re-issued on refresh', () => {
  const context = refreshLaunchContext({
    id: 'exec-2',
    launchContextJson: {
      surface: 'ASK_PAGE', operationId: 'INVENTORY_ITEM_CREATE', documentId: 'doc-1', batchDecisions: [{ entityId: 'a', actionId: 'b' }],
      contextVersion: 'old', returnTo: '/somewhere', capabilityId: 'cap-1', sourceExecutionId: 'some-other-exec', entityId: 'e1', entityType: 'INVENTORY_ITEM',
    },
  });
  assert.deepEqual(context, { entityType: 'INVENTORY_ITEM', entityId: 'e1', surface: 'ASK_REFRESH', sourceExecutionId: 'exec-2' });
  for (const dropped of ['operationId', 'documentId', 'batchDecisions', 'contextVersion', 'returnTo', 'capabilityId']) assert.equal(dropped in context, false, dropped);
  // The refresh is always its own view-state source, never another execution.
  assert.equal(context.sourceExecutionId, 'exec-2');
});

test('missing, malformed or blank stored context degrades to the previous behaviour', () => {
  const base = { surface: 'ASK_REFRESH', sourceExecutionId: 'exec-3' };
  for (const launchContextJson of [undefined, null, 'x', 42, [], ['entityId'], {}, { entityId: '  ', entityType: 5, actionId: null }]) {
    assert.deepEqual(refreshLaunchContext({ id: 'exec-3', launchContextJson }), base);
  }
});

test('the refresh path uses it', () => {
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/execution/executeOperation.ts'), 'utf8');
  assert.match(source, /launchContext: refreshLaunchContext\(execution\)/);
  assert.doesNotMatch(source, /launchContext: \{ surface: 'ASK_REFRESH', sourceExecutionId: execution\.id \}/);
});
