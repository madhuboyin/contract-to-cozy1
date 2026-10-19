const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { recordUnknownOutcomeExecutions, ASK_UNKNOWN_OUTCOME_GRACE_MS } = require('../../src/services/ask/askUnknownOutcomeReconciliation.ts');
const { readUnknownOutcomeWork, unknownOutcomeRow } = require('../../src/services/ask/work/unknownOutcomes.reader.ts');
const { readPendingExecutionWork } = require('../../src/services/ask/work/pendingExecutions.reader.ts');
const { readRetryableExecutionWork } = require('../../src/services/ask/work/retryableExecutions.reader.ts');
const { resolveAskWork } = require('../../src/services/ask/work/askWorkResolve.ts');
const { AskExecutionStatusSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { ASK_WORK_PROVIDER_READERS } = require('../../src/services/ask/askWork.service.ts');

const NOW = new Date('2026-10-10T12:00:00.000Z');
const long = new Date(NOW.getTime() - ASK_UNKNOWN_OUTCOME_GRACE_MS - 60_000);

function install({ receipts, moved = 1, marked = 1 }) {
  const calls = { find: [], mark: [], move: [], events: [], undo: [] };
  prisma.askConfirmationReceipt = {
    findMany: async (args) => { calls.find.push(args); return receipts; },
    updateMany: async (args) => { if (args.data.outcomeUnknownAt === null) { calls.undo.push(args); return { count: 1 }; } calls.mark.push(args); return { count: marked }; },
  };
  prisma.askExecution = { updateMany: async (args) => { calls.move.push(args); return { count: moved }; } };
  prisma.askExecutionEvent = { create: async (args) => { calls.events.push(args); return {}; } };
  return calls;
}

test('OUTCOME_UNKNOWN is part of the execution status contract', () => {
  assert.ok(AskExecutionStatusSchema.options.includes('OUTCOME_UNKNOWN'));
});

test('the sweep considers only claimed, never-completed receipts whose lease lapsed past the grace period, on RUNNING executions', async () => {
  const calls = install({ receipts: [] });
  await recordUnknownOutcomeExecutions({ now: NOW });
  const where = calls.find[0].where;
  assert.equal(where.status, 'CLAIMED');
  assert.equal(where.completedAt, null);
  assert.equal(where.outcomeUnknownAt, null);
  assert.equal(where.execution.status, 'RUNNING');
  assert.equal(where.leaseExpiresAt.lte.getTime(), NOW.getTime() - ASK_UNKNOWN_OUTCOME_GRACE_MS, 'a live or recently lapsed lease is never unknown');
});

test('a lapsed claim becomes OUTCOME_UNKNOWN with one event, and nothing else is changed', async () => {
  const calls = install({ receipts: [{ id: 'r1', executionId: 'e1', attemptCount: 2, leaseExpiresAt: long }] });
  const result = await recordUnknownOutcomeExecutions({ now: NOW });
  assert.equal(result.recorded, 1);
  assert.deepEqual(calls.move[0].where, { id: 'e1', status: 'RUNNING' });
  assert.equal(calls.move[0].data.status, 'OUTCOME_UNKNOWN');
  assert.equal(calls.events[0].data.eventType, 'OUTCOME_UNKNOWN_RECORDED');
  assert.equal(calls.mark[0].data.outcomeUnknownAt.getTime(), NOW.getTime());
  assert.deepEqual(Object.keys(calls.move[0].data).sort(), ['reasonCode', 'status']);
});

test('a claim that settled or was re-claimed after the read is left alone, and an execution that moved on undoes the mark', async () => {
  const settled = install({ receipts: [{ id: 'r1', executionId: 'e1', attemptCount: 1, leaseExpiresAt: long }], marked: 0 });
  assert.equal((await recordUnknownOutcomeExecutions({ now: NOW })).recorded, 0);
  assert.equal(settled.move.length, 0);
  const moved = install({ receipts: [{ id: 'r1', executionId: 'e1', attemptCount: 1, leaseExpiresAt: long }], moved: 0 });
  assert.equal((await recordUnknownOutcomeExecutions({ now: NOW })).recorded, 0);
  assert.equal(moved.undo.length, 1, 'no settled command is left reading as unknown');
  assert.equal(moved.events.length, 0);
});

test('the Work reader lists only recorded unknown outcomes, for the caller and this home', async () => {
  const calls = [];
  prisma.askExecution = {
    findMany: async (args) => { calls.push(args); return [{ id: 'e1', sessionId: 's1', message: 'Replace the filter', operationId: 'MAINTENANCE_TASK_COMPLETE', contextVersion: 'c1', updatedAt: NOW, confirmations: [{ outcomeUnknownAt: NOW, attemptCount: 2 }] }]; },
    count: async () => 1, update: () => { throw new Error('no writes'); }, updateMany: () => { throw new Error('no writes'); },
  };
  const page = await readUnknownOutcomeWork({ userId: 'u1', propertyId: 'p1', role: 'VIEWER' }, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  const where = JSON.stringify(calls[0].where);
  assert.match(where, /"status":"OUTCOME_UNKNOWN"/);
  assert.match(where, /"userId":"u1"/);
  assert.match(where, /"propertyId":"p1"/);
  assert.equal(page.rows[0].workKey, 'execution:e1');
  assert.equal(page.rows[0].status.canonical, 'OUTCOME_UNKNOWN');
  assert.equal(page.rows[0].resume.kind, 'CONFIRMATION');
  assert.match(page.rows[0].summary, /will not apply it twice/);
  assert.equal(page.rows[0].freshness.asOf, NOW.toISOString());
  assert.deepEqual((await readUnknownOutcomeWork({ userId: 'u1', propertyId: 'p1', role: 'VIEWER' }, { view: 'ACTIVE', after: null, limit: 5, status: null })).rows, []);
  assert.ok(unknownOutcomeRow);
  assert.ok(ASK_WORK_PROVIDER_READERS.UNKNOWN_OUTCOME_EXECUTIONS);
});

test('failures and live commands are never unknown: the other execution providers do not select OUTCOME_UNKNOWN', async () => {
  const calls = [];
  prisma.askExecution = { findMany: async (args) => { calls.push(args); return []; }, count: async () => 0 };
  await readPendingExecutionWork({ userId: 'u1', propertyId: 'p1', role: 'OWNER' }, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  await readRetryableExecutionWork({ userId: 'u1', propertyId: 'p1', role: 'OWNER' }, { view: 'NEEDS_YOU', after: null, limit: 5, status: null });
  for (const call of calls) assert.doesNotMatch(JSON.stringify(call.where), /OUTCOME_UNKNOWN/);
  assert.match(JSON.stringify(calls[1].where), /"status":"FAILED_RETRYABLE"/);
});

test('opening an unknown-outcome execution reads it through its own provider', async () => {
  prisma.askExecution = { findFirst: async () => ({ status: 'OUTCOME_UNKNOWN', events: [] }) };
  const row = { workKey: 'execution:e1', providerId: 'UNKNOWN_OUTCOME_EXECUTIONS', workType: 'UNKNOWN_OUTCOME_EXECUTION', propertyId: 'p1', lifecycleView: 'NEEDS_YOU', freshness: { version: 'v', asOf: 'a' } };
  const result = await resolveAskWork({ userId: 'u1', propertyId: 'p1', role: 'OWNER', operatingMode: 'OWNING', workKey: 'execution:e1' }, { UNKNOWN_OUTCOME_EXECUTIONS: async () => ({ rows: [row], total: 1, viewCounts: null }) });
  assert.equal(result.outcome, 'AVAILABLE');
  assert.equal(result.row.providerId, 'UNKNOWN_OUTCOME_EXECUTIONS');
});
