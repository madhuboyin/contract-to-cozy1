// apps/workers/tests/unit/seasonalChecklistExpirationJob.test.js
//
// W4 item 4: expireSeasonalChecklists (registry key
// seasonal-checklist-expiration) had no dedicated test.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { expireSeasonalChecklists, cleanupOldSeasonalChecklists } = require('../../src/jobs/seasonalChecklistExpiration.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function checklistFixture(overrides = {}) {
  return {
    id: 'checklist-1',
    propertyId: 'property-1',
    season: 'SUMMER',
    year: 2026,
    climateRegion: 'TEMPERATE',
    totalTasks: 4,
    tasksCompleted: 4,
    tasksAdded: 0,
    generatedAt: new Date('2026-06-01'),
    status: 'IN_PROGRESS',
    property: { homeownerProfile: {} },
    ...overrides,
  };
}

function fakeDeps({ expiredChecklists, updateShouldFailFor = new Set(), deletedCount = 0 }) {
  const calls = { updates: [] };
  const deps = {
    prisma: {
      seasonalChecklist: {
        findMany: async () => expiredChecklists,
        update: async (args) => {
          calls.updates.push(args);
          if (updateShouldFailFor.has(args.where.id)) {
            throw new Error(`update failed for ${args.where.id}`);
          }
          return { id: args.where.id, ...args.data };
        },
        deleteMany: async () => ({ count: deletedCount }),
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

test('a fully-completed checklist transitions to COMPLETED', async () => {
  const { deps, calls } = fakeDeps({
    expiredChecklists: [checklistFixture({ totalTasks: 4, tasksCompleted: 4 })],
  });

  await expireSeasonalChecklists(deps);

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].data.status, 'COMPLETED');
});

test('a partially-completed checklist transitions to IN_PROGRESS, not COMPLETED', async () => {
  const { deps, calls } = fakeDeps({
    expiredChecklists: [checklistFixture({ totalTasks: 4, tasksCompleted: 2 })],
  });

  await expireSeasonalChecklists(deps);

  assert.equal(calls.updates[0].data.status, 'IN_PROGRESS');
});

test('a checklist with zero total tasks is treated as 0% complete, not COMPLETED', async () => {
  const { deps, calls } = fakeDeps({
    expiredChecklists: [checklistFixture({ totalTasks: 0, tasksCompleted: 0 })],
  });

  await expireSeasonalChecklists(deps);

  assert.equal(calls.updates[0].data.status, 'IN_PROGRESS');
});

test('one checklist failing its update does not abort expiration for the rest of the batch', async () => {
  const { deps, calls } = fakeDeps({
    expiredChecklists: [
      checklistFixture({ id: 'checklist-1', totalTasks: 4, tasksCompleted: 4 }),
      checklistFixture({ id: 'checklist-2', totalTasks: 4, tasksCompleted: 4 }),
    ],
    updateShouldFailFor: new Set(['checklist-1']),
  });

  await assert.doesNotReject(() => expireSeasonalChecklists(deps));

  assert.equal(calls.updates.length, 2, 'both must still be attempted');
});

test('does nothing when there are no expired checklists', async () => {
  const { deps, calls } = fakeDeps({ expiredChecklists: [] });

  await expireSeasonalChecklists(deps);

  assert.equal(calls.updates.length, 0);
});

test('rethrows if the initial findMany query itself fails', async () => {
  const deps = {
    prisma: { seasonalChecklist: { findMany: async () => { throw new Error('db down'); } } },
    logger: noopLogger,
  };

  await assert.rejects(() => expireSeasonalChecklists(deps), /db down/);
});

test('cleanupOldSeasonalChecklists only targets COMPLETED/DISMISSED checklists older than 2 years', async () => {
  const calls = { deleteManyArgs: null };
  const deps = {
    prisma: {
      seasonalChecklist: {
        deleteMany: async (args) => {
          calls.deleteManyArgs = args;
          return { count: 5 };
        },
      },
    },
    logger: noopLogger,
  };

  await cleanupOldSeasonalChecklists(deps);

  assert.deepEqual(calls.deleteManyArgs.where.status.in, ['COMPLETED', 'DISMISSED']);
  assert.ok(calls.deleteManyArgs.where.seasonEndDate.lt instanceof Date);
});
