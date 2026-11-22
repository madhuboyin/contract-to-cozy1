const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { savedFeedbackByExecution, withSavedFeedback } = require('../../src/services/ask/execution/askFeedbackState.ts');

// BICC-UX-003 (owner decision 2026-11-22): a saved rating returns with the execution after a reload, per attempt, never transferred.
const withStub = async (rows, run) => {
  const original = prisma.feedback.findMany;
  const calls = [];
  prisma.feedback.findMany = async (args) => { calls.push(args); return rows; };
  try { return await run(calls); } finally { prisma.feedback.findMany = original; }
};
const row = (targetId, rating, createdAt, comment = null) => ({ targetId, rating, comment, createdAt: new Date(createdAt) });

test('feedback is looked up for the caller and the listed executions only, newest first', async () => {
  await withStub([], async (calls) => {
    await savedFeedbackByExecution('user-1', ['e1', 'e2', 'e1']);
    assert.deepEqual(calls[0].where, { userId: 'user-1', targetType: 'ASK_EXECUTION', targetId: { in: ['e1', 'e2'] } });
    assert.deepEqual(calls[0].orderBy, { createdAt: 'desc' });
  });
  await withStub([], async (calls) => {
    assert.equal((await savedFeedbackByExecution('user-1', [])).size, 0);
    assert.equal(calls.length, 0, 'no query for an empty list');
  });
});

test('each response reports only the feedback recorded against its own execution id', async () => {
  const rows = [row('e1', 'down', '2026-11-22T10:00:00Z', 'too vague'), row('e1', 'up', '2026-11-22T09:00:00Z'), row('e3', 'weird', '2026-11-22T08:00:00Z')];
  const responses = [{ executionId: 'e1' }, { executionId: 'e2' }, { executionId: 'e3' }];
  const out = await withStub(rows, () => withSavedFeedback('user-1', responses));
  assert.deepEqual(out[0].feedback, { rating: 'DOWN', attemptExecutionId: 'e1', comment: 'too vague', submittedAt: '2026-11-22T10:00:00.000Z' });
  assert.equal(out[1].feedback, null, 'a regenerated attempt with no rating of its own has none');
  assert.equal(out[2].feedback, null, 'an unrecognised stored rating is ignored');
});

test('the response contract carries the field and defaults it to null', () => {
  const { AskExecutionResponseSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  assert.ok(AskExecutionResponseSchema.shape.feedback, 'feedback is part of the contract');
  assert.equal(AskExecutionResponseSchema.shape.feedback.parse(undefined), null);
  assert.equal(AskExecutionResponseSchema.shape.feedback.safeParse({ rating: 'MAYBE', attemptExecutionId: 'e', submittedAt: '2026-11-22T00:00:00.000Z' }).success, false);
});
