const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { readAgentRuntimeControls, AGENT_RUNTIME_RETENTION_BOUNDS, addDays } = require('../../src/config/agentRuntimeControls.ts');
const {
  purgeExpiredAgentRuntime,
  eraseAgentRuntimeForUser,
} = require('../../src/services/agents/agentRetention.service.ts');

const NOW = new Date('2026-08-28T12:00:00.000Z');
const PURGE_TABLES = ['toolInvocation', 'llmInvocation', 'agentState', 'agentRunReservation', 'agentRun'];

test('retention defaults are 90 / 30 / 7 and env overrides are clamped to their bounds', () => {
  const base = readAgentRuntimeControls({});
  assert.equal(base.runRetentionDays, 90);
  assert.equal(base.invocationRetentionDays, 30);
  assert.equal(base.stateGraceDays, 7);

  const tooLow = readAgentRuntimeControls({ AGENT_RUN_RETENTION_DAYS: '1', AGENT_INVOCATION_RETENTION_DAYS: '0', AGENT_STATE_GRACE_DAYS: '-5' });
  assert.equal(tooLow.runRetentionDays, AGENT_RUNTIME_RETENTION_BOUNDS.runRetentionDays.min);
  assert.equal(tooLow.invocationRetentionDays, AGENT_RUNTIME_RETENTION_BOUNDS.invocationRetentionDays.min);
  assert.equal(tooLow.stateGraceDays, AGENT_RUNTIME_RETENTION_BOUNDS.stateGraceDays.min);

  const tooHigh = readAgentRuntimeControls({ AGENT_RUN_RETENTION_DAYS: '9999' });
  assert.equal(tooHigh.runRetentionDays, AGENT_RUNTIME_RETENTION_BOUNDS.runRetentionDays.max);

  const garbage = readAgentRuntimeControls({ AGENT_RUN_RETENTION_DAYS: 'soon' });
  assert.equal(garbage.runRetentionDays, 90);
});

test('addDays is the shared fixed-clock helper', () => {
  assert.equal(addDays(NOW, 30).toISOString(), '2026-09-27T12:00:00.000Z');
});

function purgeDb(counts) {
  const calls = [];
  const delegateFor = (table) => ({
    findMany: async ({ take }) => {
      const remaining = counts[table] ?? 0;
      const n = Math.min(take, remaining);
      return Array.from({ length: n }, (_, i) => ({ id: `${table}-${i}` }));
    },
    deleteMany: async ({ where }) => {
      const n = where.id.in.length;
      counts[table] -= n;
      calls.push({ table, n });
      return { count: n };
    },
  });
  const db = Object.fromEntries(PURGE_TABLES.map((t) => [t, delegateFor(t)]));
  return { db, calls };
}

test('purge sweeps every table by expiresAt, children before AgentRun, in bounded batches', async () => {
  const { db, calls } = purgeDb({
    toolInvocation: 5, llmInvocation: 0, agentState: 3, agentRunReservation: 1, agentRun: 250,
  });
  const result = await purgeExpiredAgentRuntime(NOW, db, 100);

  assert.equal(result.total, 5 + 0 + 3 + 1 + 250);
  assert.deepEqual(result.deleted, {
    toolInvocation: 5, llmInvocation: 0, agentState: 3, agentRunReservation: 1, agentRun: 250,
  });
  // AgentRun is purged last so cascades never race a child's own clock.
  assert.equal(calls[calls.length - 1].table, 'agentRun');
  // 250 AgentRun rows at batchSize 100 => 3 delete passes (100, 100, 50).
  assert.equal(calls.filter((c) => c.table === 'agentRun').length, 3);
});

test('eraseAgentRuntimeForUser deletes by principalUserId immediately, ignoring expiresAt', async () => {
  const deleted = [];
  const db = {
    agentRunReservation: { deleteMany: async ({ where }) => { deleted.push(['res', where]); return { count: 2 }; } },
    agentRun: { deleteMany: async ({ where }) => { deleted.push(['run', where]); return { count: 4 }; } },
  };
  const total = await eraseAgentRuntimeForUser(db, 'user-42');

  assert.equal(total, 6);
  assert.deepEqual(deleted, [
    ['res', { principalUserId: 'user-42' }],
    ['run', { principalUserId: 'user-42' }],
  ]);
});
