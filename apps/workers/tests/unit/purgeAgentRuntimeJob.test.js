// apps/workers/tests/unit/purgeAgentRuntimeJob.test.js
//
// Phase 2 / PR 9 (IPD-003): the daily agent-runtime retention sweep. The batch
// logic itself is unit-tested in the backend (agentRetention.test.js); this
// covers the worker handler's result mapping.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const { runPurgeAgentRuntimeJob } = require('../../src/jobs/purgeAgentRuntime.job.ts');

const NOW = new Date('2026-08-28T03:40:00.000Z');

test('reports the total and per-table deletion counts as a successful run', async () => {
  const result = await runPurgeAgentRuntimeJob({
    now: () => NOW,
    purge: async (now) => {
      assert.equal(now, NOW);
      return {
        deleted: { toolInvocation: 4, llmInvocation: 2, agentState: 1, agentRunReservation: 0, agentRun: 7 },
        total: 14,
      };
    },
  });

  assert.equal(result.examined, 14);
  assert.equal(result.updated, 14);
  assert.equal(result.failed ?? 0, 0);
  assert.equal(result.reason, undefined);
});

test('a no-op sweep is still a success with an explanatory reason', async () => {
  const result = await runPurgeAgentRuntimeJob({
    now: () => NOW,
    purge: async () => ({
      deleted: { toolInvocation: 0, llmInvocation: 0, agentState: 0, agentRunReservation: 0, agentRun: 0 },
      total: 0,
    }),
  });

  assert.equal(result.examined, 0);
  assert.match(result.reason, /past retention/);
});
