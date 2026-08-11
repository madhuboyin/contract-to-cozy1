const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

let mockRow = null;
const prismaMock = {
  askExecution: {
    findFirst: async (args) => {
      if (!mockRow) return null;
      // Sanity-check the caller is actually scoping the lookback, not
      // reaching across the whole session unbounded.
      assert.ok(args.where.createdAt.gte instanceof Date);
      assert.equal(args.where.sessionId, mockRow.sessionId);
      return mockRow;
    },
  },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const { resolveAskFollowUpMessage } = require('../../src/services/ask/askFollowUpContext.ts');

function priorRow(overrides) {
  return {
    id: 'prior-execution-1',
    sessionId: 'session-1',
    operationId: 'MAINTENANCE_STATUS',
    message: 'What maintenance is overdue?',
    resultJson: { blocks: [] },
    ...overrides,
  };
}

test('no prior execution leaves the message unchanged', async () => {
  mockRow = null;
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.');
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.sourceExecutionId, null);
});

test('a non-continuation message is never rewritten even with a fresh prior execution', async () => {
  mockRow = priorRow();
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Is refinancing worth it right now?' });
  assert.equal(result.effectiveMessage, 'Is refinancing worth it right now?');
  assert.equal(result.sourceExecutionId, null);
});

test('entity continuation substitutes the pronoun with the single prior task title', async () => {
  mockRow = priorRow({
    operationId: 'MAINTENANCE_TASK_COMPLETE',
    message: 'Complete the gutter cleaning task',
    resultJson: {
      blocks: [{
        type: 'WORKFLOW_PROGRESS',
        id: 'maintenance-complete-select',
        details: [{ label: 'Task', value: 'Clean the gutters' }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.match(result.effectiveMessage, /Clean the gutters/);
  assert.equal(result.forcedOperationId, null);
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
});

test('entity continuation resolves against a singular GROUPED_LIST item too', async () => {
  mockRow = priorRow({
    resultJson: {
      blocks: [{
        type: 'GROUPED_LIST',
        id: 'maintenance-list',
        sections: [{ id: 'overdue', title: 'Overdue', count: 1, items: [{ id: 'task-1', title: 'Service the water heater' }] }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Mark that task done.' });
  assert.match(result.effectiveMessage, /Service the water heater/);
});

test('entity continuation refuses to guess when the prior turn named more than one item', async () => {
  mockRow = priorRow({
    resultJson: {
      blocks: [{
        type: 'GROUPED_LIST',
        id: 'maintenance-list',
        sections: [{ id: 'overdue', title: 'Overdue', count: 2, items: [
          { id: 'task-1', title: 'Service the water heater' },
          { id: 'task-2', title: 'Clean the gutters' },
        ] }],
      }],
    },
  });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.', 'ambiguous prior context must not be guessed through');
  assert.equal(result.sourceExecutionId, null);
});

test('filter continuation combines the prior question with the refinement and forces the same operation', async () => {
  mockRow = priorRow({ operationId: 'MAINTENANCE_STATUS', message: 'What maintenance is due soon?' });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Only show the urgent ones.' });
  assert.match(result.effectiveMessage, /What maintenance is due soon\?/);
  assert.match(result.effectiveMessage, /Only show the urgent ones\./);
  assert.equal(result.forcedOperationId, 'MAINTENANCE_STATUS');
  assert.equal(result.sourceExecutionId, 'prior-execution-1');
});

test('filter continuation does not force a non-continuable (command/analysis) operation', async () => {
  mockRow = priorRow({ operationId: 'REFINANCE_ANALYSIS', message: 'Is refinancing worth it now?' });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Only show the urgent ones.' });
  assert.equal(result.forcedOperationId, null, 'refinance analysis is a scenario-bound analysis, not a bare filter refinement target');
});

test('an operationId-less prior execution (boundary/grounded) is not treated as reusable context', async () => {
  mockRow = priorRow({ operationId: null });
  const result = await resolveAskFollowUpMessage({ sessionId: 'session-1', propertyId: 'property-1', message: 'Now complete it.' });
  assert.equal(result.effectiveMessage, 'Now complete it.');
});
