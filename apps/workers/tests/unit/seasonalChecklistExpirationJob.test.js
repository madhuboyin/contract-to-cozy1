// apps/workers/tests/unit/seasonalChecklistExpirationJob.test.js
//
// W4 item 4: expireSeasonalChecklists (registry key
// seasonal-checklist-expiration) had no dedicated test.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

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

function loadJob({ expiredChecklists, updateShouldFailFor = new Set(), deletedCount = 0 }) {
  const calls = { updates: [] };

  const prismaMock = {
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
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const jobPath = require.resolve('../../src/jobs/seasonalChecklistExpiration.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('a fully-completed checklist transitions to COMPLETED', async () => {
  const { expireSeasonalChecklists, calls } = loadJob({
    expiredChecklists: [checklistFixture({ totalTasks: 4, tasksCompleted: 4 })],
  });

  await expireSeasonalChecklists();

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].data.status, 'COMPLETED');
});

test('a partially-completed checklist transitions to IN_PROGRESS, not COMPLETED', async () => {
  const { expireSeasonalChecklists, calls } = loadJob({
    expiredChecklists: [checklistFixture({ totalTasks: 4, tasksCompleted: 2 })],
  });

  await expireSeasonalChecklists();

  assert.equal(calls.updates[0].data.status, 'IN_PROGRESS');
});

test('a checklist with zero total tasks is treated as 0% complete, not COMPLETED', async () => {
  const { expireSeasonalChecklists, calls } = loadJob({
    expiredChecklists: [checklistFixture({ totalTasks: 0, tasksCompleted: 0 })],
  });

  await expireSeasonalChecklists();

  assert.equal(calls.updates[0].data.status, 'IN_PROGRESS');
});

test('one checklist failing its update does not abort expiration for the rest of the batch', async () => {
  const { expireSeasonalChecklists, calls } = loadJob({
    expiredChecklists: [
      checklistFixture({ id: 'checklist-1', totalTasks: 4, tasksCompleted: 4 }),
      checklistFixture({ id: 'checklist-2', totalTasks: 4, tasksCompleted: 4 }),
    ],
    updateShouldFailFor: new Set(['checklist-1']),
  });

  await assert.doesNotReject(() => expireSeasonalChecklists());

  assert.equal(calls.updates.length, 2, 'both must still be attempted');
});

test('does nothing when there are no expired checklists', async () => {
  const { expireSeasonalChecklists, calls } = loadJob({ expiredChecklists: [] });

  await expireSeasonalChecklists();

  assert.equal(calls.updates.length, 0);
});

test('rethrows if the initial findMany query itself fails', async () => {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: { seasonalChecklist: { findMany: async () => { throw new Error('db down'); } } } },
  };
  const jobPath = require.resolve('../../src/jobs/seasonalChecklistExpiration.job.ts');
  delete require.cache[jobPath];
  const { expireSeasonalChecklists } = require(jobPath);

  await assert.rejects(() => expireSeasonalChecklists(), /db down/);
});

test('cleanupOldSeasonalChecklists only targets COMPLETED/DISMISSED checklists older than 2 years', async () => {
  const calls = { deleteManyArgs: null };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        seasonalChecklist: {
          deleteMany: async (args) => {
            calls.deleteManyArgs = args;
            return { count: 5 };
          },
        },
      },
    },
  };
  const jobPath = require.resolve('../../src/jobs/seasonalChecklistExpiration.job.ts');
  delete require.cache[jobPath];
  const { cleanupOldSeasonalChecklists } = require(jobPath);

  await cleanupOldSeasonalChecklists();

  assert.deepEqual(calls.deleteManyArgs.where.status.in, ['COMPLETED', 'DISMISSED']);
  assert.ok(calls.deleteManyArgs.where.seasonEndDate.lt instanceof Date);
});
