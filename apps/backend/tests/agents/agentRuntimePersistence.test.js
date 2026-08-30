const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { Prisma } = require('@prisma/client');
const {
  claimAgentRunReservation,
  commitAgentRunEpisode,
  writeTerminalAgentRun,
  collectReferencedAgentDefinitionVersions,
  assertAgentDeploymentReadiness,
} = require('../../src/services/agents/agentRunRepository.ts');
const {
  createAgentState,
  compareAndSwapAgentState,
  resolveAgentState,
} = require('../../src/services/agents/agentStateRepository.ts');

const NOW = new Date('2026-08-28T12:00:00.000Z');
const RUNTIME = { reservationLeaseMs: 120_000, reservationRetentionDays: 7, runRetentionDays: 90, stateGraceDays: 7 };

function reservationInput(overrides = {}) {
  return {
    idempotencyKey: 'hvac-repair-replace-specialist:HOME_ACTION_ENGAGEMENT:thread-1',
    agentId: 'hvac-repair-replace-specialist',
    agentVersion: '1.0.0',
    trigger: 'HOME_ACTION_ENGAGEMENT',
    principalUserId: 'user-1',
    propertyId: 'property-1',
    primaryEntityId: 'item-1',
    decisionThreadId: 'thread-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

function terminalRunInput(overrides = {}) {
  return {
    reservationId: 'res-1',
    idempotencyKey: reservationInput().idempotencyKey,
    agentId: 'hvac-repair-replace-specialist',
    agentVersion: '1.0.0',
    definitionDigest: 'digest-abc',
    deploymentRevision: 'deadbeef',
    trigger: 'HOME_ACTION_ENGAGEMENT',
    correlationId: 'corr-1',
    principalUserId: 'user-1',
    propertyId: 'property-1',
    primaryEntityId: 'item-1',
    decisionThreadId: 'thread-1',
    outcome: 'COMPLETED',
    status: { phase: 'RECOMMENDATION_READY', verdict: 'REPLACE' },
    budgetUsage: {
      contextFactsUsed: 12, llmInvocationsUsed: 1, llmCostUsdUsed: 0.02,
      executionMsUsed: 4200, loopIterationsUsed: 3,
    },
    startedAt: NOW,
    finishedAt: new Date(NOW.getTime() + 4200),
    ...overrides,
  };
}

function makeDb({ reservations = [], runs = [], states = [] } = {}) {
  const reservationRows = new Map(reservations.map((r) => [r.id, { ...r }]));
  const runRows = new Map(runs.map((r) => [r.id, { ...r }]));
  const stateRows = new Map(states.map((s) => [s.runId, { ...s }]));
  const toolRows = [];
  const llmRows = [];
  let seq = 0;

  const agentRunReservation = {
    findUnique: async ({ where }) => [...reservationRows.values()].find((r) =>
      (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey)) ?? null,
    findUniqueOrThrow: async ({ where }) => {
      const row = [...reservationRows.values()].find((r) => r.idempotencyKey === where.idempotencyKey);
      if (!row) throw new Error('reservation not found');
      return row;
    },
    create: async ({ data }) => {
      if ([...reservationRows.values()].some((r) => r.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
      }
      seq += 1;
      const row = { id: `res-${seq}`, resultRunId: null, ...data };
      reservationRows.set(row.id, row);
      return row;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const [id, row] of reservationRows) {
        if (where.id && row.id !== where.id) continue;
        if (where.idempotencyKey && row.idempotencyKey !== where.idempotencyKey) continue;
        if (where.correlationId && row.correlationId !== where.correlationId) continue;
        if ('resultRunId' in where && row.resultRunId !== where.resultRunId) continue;
        if (where.leaseExpiresAt?.lte && !(row.leaseExpiresAt <= where.leaseExpiresAt.lte)) continue;
        reservationRows.set(id, { ...row, ...data });
        count += 1;
      }
      return { count };
    },
    findMany: async ({ where = {} }) => [...reservationRows.values()].filter((r) => {
      if ('resultRunId' in where && r.resultRunId !== where.resultRunId) return false;
      if (where.leaseExpiresAt?.gt && !(r.leaseExpiresAt > where.leaseExpiresAt.gt)) return false;
      return true;
    }),
  };

  const agentRun = {
    findUnique: async ({ where }) => [...runRows.values()].find((r) => r.idempotencyKey === where.idempotencyKey) ?? null,
    findUniqueOrThrow: async ({ where }) => {
      const row = [...runRows.values()].find((r) => r.idempotencyKey === where.idempotencyKey);
      if (!row) throw new Error('run not found');
      return row;
    },
    create: async ({ data }) => {
      if ([...runRows.values()].some((r) => r.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
      }
      seq += 1;
      const row = { id: `run-${seq}`, ...data };
      runRows.set(row.id, row);
      return row;
    },
  };

  const agentState = {
    create: async ({ data }) => {
      if (stateRows.has(data.runId)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
      }
      const row = { id: `state-${data.runId}`, resolvedAt: null, ...data };
      stateRows.set(data.runId, row);
      return row;
    },
    findUnique: async ({ where }) => stateRows.get(where.runId) ?? null,
    updateMany: async ({ where, data }) => {
      const row = stateRows.get(where.runId);
      if (!row) return { count: 0 };
      if (where.casVersion !== undefined && row.casVersion !== where.casVersion) return { count: 0 };
      if (where.expectedEvent !== undefined && row.expectedEvent !== where.expectedEvent) return { count: 0 };
      if ('resolvedAt' in where && row.resolvedAt !== where.resolvedAt) return { count: 0 };
      stateRows.set(where.runId, { ...row, ...data });
      return { count: 1 };
    },
    findMany: async ({ where = {} }) => [...stateRows.values()].filter((s) =>
      !('resolvedAt' in where) || s.resolvedAt === where.resolvedAt),
  };

  const toolInvocation = { create: async ({ data }) => { toolRows.push(data); return data; } };
  const llmInvocation = { create: async ({ data }) => { llmRows.push(data); return data; } };

  const db = {
    agentRunReservation, agentRun, agentState, toolInvocation, llmInvocation,
    $transaction: async (cb) => cb({ agentRunReservation, agentRun, agentState, toolInvocation, llmInvocation }),
  };
  return { db, reservationRows, runRows, stateRows, toolRows, llmRows };
}

test('claiming a reservation is an insert that stamps a lease and a retention clock', async () => {
  const store = makeDb();
  const result = await claimAgentRunReservation(reservationInput(), NOW, store.db, RUNTIME);

  assert.equal(result.claimed, true);
  assert.equal(result.reservation.leaseExpiresAt.toISOString(), '2026-08-28T12:02:00.000Z');
  assert.equal(result.reservation.expiresAt.toISOString(), '2026-09-04T12:00:00.000Z');
});

test('a second claim on the same idempotency key does not run and returns the winner', async () => {
  const store = makeDb({
    reservations: [{ id: 'res-1', idempotencyKey: reservationInput().idempotencyKey, resultRunId: 'run-9' }],
  });
  const result = await claimAgentRunReservation(reservationInput(), NOW, store.db, RUNTIME);

  assert.equal(result.claimed, false);
  assert.equal(result.reservation.resultRunId, 'run-9');
  assert.equal(store.reservationRows.size, 1);
});

test('an expired unresolved reservation is reclaimed with a fresh lease', async () => {
  const store = makeDb({
    reservations: [{
      id: 'res-1', ...reservationInput(), resultRunId: null,
      leaseExpiresAt: new Date(NOW.getTime() - 1),
    }],
  });
  const result = await claimAgentRunReservation(reservationInput({ correlationId: 'corr-retry' }), NOW, store.db, RUNTIME);
  assert.equal(result.claimed, true);
  assert.equal(result.reservation.correlationId, 'corr-retry');
  assert.equal(result.reservation.leaseExpiresAt.toISOString(), '2026-08-28T12:02:00.000Z');
});

test('a P2002 insert race resolves to the concurrently-created reservation', async () => {
  const store = makeDb();
  const realFindUnique = store.db.agentRunReservation.findUnique;
  store.db.agentRunReservation.findUnique = async (args) => {
    store.db.agentRunReservation.findUnique = realFindUnique;
    return null;
  };
  store.reservationRows.set('winner', { id: 'winner', idempotencyKey: reservationInput().idempotencyKey, resultRunId: null });

  const result = await claimAgentRunReservation(reservationInput(), NOW, store.db, RUNTIME);
  assert.equal(result.claimed, false);
  assert.equal(result.reservation.id, 'winner');
});

test('writeTerminalAgentRun inserts one terminal run and links its reservation', async () => {
  const store = makeDb({
    reservations: [{ id: 'res-1', ...reservationInput(), resultRunId: null }],
  });
  const run = await writeTerminalAgentRun(terminalRunInput(), NOW, store.db, RUNTIME);

  assert.equal(run.outcome, 'COMPLETED');
  assert.equal(run.primaryEntityId, 'item-1');
  assert.deepEqual(run.statusJson, { phase: 'RECOMMENDATION_READY', verdict: 'REPLACE' });
  assert.equal(run.expiresAt.toISOString(), '2026-11-26T12:00:00.000Z');
  assert.equal(store.runRows.size, 1);
  assert.equal(store.reservationRows.get('res-1').resultRunId, run.id);
});

test('a duplicate terminal write returns the recorded run without inserting again', async () => {
  const store = makeDb({
    reservations: [{ id: 'res-1', idempotencyKey: reservationInput().idempotencyKey, resultRunId: 'run-1' }],
    runs: [{ id: 'run-1', idempotencyKey: reservationInput().idempotencyKey, outcome: 'PAUSED' }],
  });
  const run = await writeTerminalAgentRun(terminalRunInput(), NOW, store.db, RUNTIME);

  assert.equal(run.id, 'run-1');
  assert.equal(run.outcome, 'PAUSED');
  assert.equal(store.runRows.size, 1);
});

test('an episode atomically links ownership, consumes the prior pause, creates the next pause, and writes bounded audits', async () => {
  const store = makeDb({
    reservations: [{ id: 'res-1', ...reservationInput(), resultRunId: null }],
    runs: [{ id: 'run-old', idempotencyKey: 'old', outcome: 'PAUSED' }],
    states: [{ runId: 'run-old', casVersion: 3, expectedEvent: 'RESUME_IN_PROGRESS', resolvedAt: null }],
  });
  const result = await commitAgentRunEpisode({
    ...terminalRunInput({ outcome: 'PAUSED' }),
    consumedState: { runId: 'run-old', expectedCasVersion: 3 },
    pausedState: {
      stateShape: 'agent.repair-replace.state@1.1.0', serializedState: { status: { phase: 'NEEDS_CONTEXT' } },
      expectedEvent: 'SUBMIT_CONTEXT', pauseExpiresAt: new Date('2026-09-04T12:00:00.000Z'),
    },
    toolInvocations: [{
      sequence: 0, toolId: 'REQUEST_CONTEXT', toolVersion: '1.0', input: { key: 'hvac.condition' },
      output: { paused: true }, outcome: 'OK', startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(),
    }],
    llmInvocations: [],
  }, NOW, store.db, RUNTIME);

  assert.equal(store.reservationRows.get('res-1').resultRunId, result.run.id);
  assert.ok(store.stateRows.get('run-old').resolvedAt instanceof Date);
  assert.equal(store.stateRows.get(result.run.id).expectedEvent, 'SUBMIT_CONTEXT');
  assert.equal(result.stateCasVersion, 0);
  assert.equal(store.toolRows.length, 1);
  assert.match(store.toolRows[0].inputHash, /^[0-9a-f]{64}$/);
});

test('a reclaimed reservation fences the expired owner by correlation id', async () => {
  const store = makeDb({
    reservations: [{ id: 'res-1', ...reservationInput({ correlationId: 'corr-new' }), resultRunId: null }],
  });
  await assert.rejects(
    commitAgentRunEpisode(terminalRunInput({ correlationId: 'corr-expired' }), NOW, store.db, RUNTIME),
    /owning reservation/,
  );
  assert.equal(store.reservationRows.get('res-1').resultRunId, null);
});

test('AgentState CAS advances on the expected version and rejects a stale writer', async () => {
  const store = makeDb({ runs: [{ id: 'run-1', idempotencyKey: 'k', outcome: 'PAUSED' }] });
  await createAgentState({
    runId: 'run-1', agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0',
    stateShape: 'agent.hvac-repair-replace.state@1.0.0', serializedState: { step: 'AWAIT_CONTEXT' },
    expectedEvent: 'SUBMIT_CONTEXT', pauseExpiresAt: new Date('2026-08-30T12:00:00.000Z'),
  }, store.db, RUNTIME);

  const first = await compareAndSwapAgentState({
    runId: 'run-1', expectedCasVersion: 0, serializedState: { step: 'SCORING' },
    expectedEvent: 'GET_STATUS', pauseExpiresAt: new Date('2026-08-30T12:00:00.000Z'),
  }, store.db, RUNTIME);
  assert.deepEqual(first, { swapped: true, casVersion: 1 });

  const stale = await compareAndSwapAgentState({
    runId: 'run-1', expectedCasVersion: 0, serializedState: { step: 'X' },
    expectedEvent: 'GET_STATUS', pauseExpiresAt: new Date('2026-08-30T12:00:00.000Z'),
  }, store.db, RUNTIME);
  assert.equal(stale.swapped, false);
  assert.equal(store.stateRows.get('run-1').expiresAt.toISOString(), '2026-09-06T12:00:00.000Z');
});

test('resolveAgentState consumes the paused state exactly once', async () => {
  const store = makeDb({ runs: [{ id: 'run-1', idempotencyKey: 'k', outcome: 'PAUSED' }] });
  await createAgentState({
    runId: 'run-1', agentId: 'a', agentVersion: '1.0.0', stateShape: 's',
    serializedState: {}, expectedEvent: 'SUBMIT_CONTEXT', pauseExpiresAt: NOW,
  }, store.db, RUNTIME);

  assert.equal(await resolveAgentState('run-1', 0, NOW, store.db), true);
  assert.equal(await resolveAgentState('run-1', 0, NOW, store.db), false);
});

test('collectReferencedAgentDefinitionVersions reports paused states and live reservations', async () => {
  const store = makeDb({
    states: [{ runId: 'run-1', agentId: 'hvac-repair-replace-specialist', agentVersion: '1.0.0', resolvedAt: null }],
    reservations: [{
      id: 'res-1', idempotencyKey: 'k', agentId: 'hvac-repair-replace-specialist', agentVersion: '2.0.0',
      resultRunId: null, leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    }],
  });
  const refs = await collectReferencedAgentDefinitionVersions(NOW, store.db);
  assert.deepEqual(refs.map((r) => `${r.agentId}@${r.version}:${r.source}`).sort(), [
    'hvac-repair-replace-specialist@1.0.0:PAUSED_STATE',
    'hvac-repair-replace-specialist@2.0.0:NONTERMINAL_RUN',
  ]);
});

test('assertAgentDeploymentReadiness flags a pinned version that code no longer contains', async () => {
  const store = makeDb({
    states: [{ runId: 'run-1', agentId: 'hvac-repair-replace-specialist', agentVersion: '9.9.9', resolvedAt: null }],
  });
  const issues = await assertAgentDeploymentReadiness(NOW, store.db);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /9\.9\.9 is not registered/);
});
