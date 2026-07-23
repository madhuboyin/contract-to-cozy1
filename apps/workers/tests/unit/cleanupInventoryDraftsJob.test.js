// apps/workers/tests/unit/cleanupInventoryDraftsJob.test.js
//
// W4 item 4: cleanupInventoryDraftsJob had no dedicated test. Small, pure
// job — one deleteMany, env-driven TTL with a validated fallback.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { cleanupInventoryDraftsJob } = require('../../src/jobs/cleanupInventoryDrafts.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ deletedCount = 0 } = {}) {
  const calls = { deleteManyArgs: null };
  const deps = {
    prisma: {
      inventoryDraftItem: {
        deleteMany: async (args) => {
          calls.deleteManyArgs = args;
          return { count: deletedCount };
        },
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

test('only targets DRAFT rows older than the default 7-day TTL when unset', async () => {
  await withEnv({ INVENTORY_DRAFT_TTL_DAYS: undefined }, async () => {
    const { deps, calls } = fakeDeps({ deletedCount: 3 });

    const result = await cleanupInventoryDraftsJob(deps);

    assert.equal(result.deletedCount, 3);
    assert.equal(result.ttlDays, 7);
    assert.equal(calls.deleteManyArgs.where.status, 'DRAFT');
    assert.ok(calls.deleteManyArgs.where.updatedAt.lt instanceof Date);
  });
});

test('honors a custom INVENTORY_DRAFT_TTL_DAYS', async () => {
  await withEnv({ INVENTORY_DRAFT_TTL_DAYS: '14' }, async () => {
    const { deps, calls } = fakeDeps({ deletedCount: 0 });

    const result = await cleanupInventoryDraftsJob(deps);

    assert.equal(result.ttlDays, 14);
    const expectedCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(calls.deleteManyArgs.where.updatedAt.lt.getTime() - expectedCutoff) < 5000);
  });
});

test('falls back to the default 7 days for an invalid TTL value instead of a NaN cutoff', async () => {
  await withEnv({ INVENTORY_DRAFT_TTL_DAYS: 'not-a-number' }, async () => {
    const { deps } = fakeDeps({ deletedCount: 0 });

    const result = await cleanupInventoryDraftsJob(deps);

    assert.equal(result.ttlDays, 7);
  });
});

test('falls back to the default 7 days for a zero or negative TTL', async () => {
  await withEnv({ INVENTORY_DRAFT_TTL_DAYS: '-3' }, async () => {
    const { deps } = fakeDeps({ deletedCount: 0 });

    const result = await cleanupInventoryDraftsJob(deps);

    assert.equal(result.ttlDays, 7);
  });
});
