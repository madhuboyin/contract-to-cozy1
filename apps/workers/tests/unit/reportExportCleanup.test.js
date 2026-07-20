// apps/workers/tests/unit/reportExportCleanup.test.js
//
// W3 (exports — "bounded retries"): reportExportCleanupTick previously only
// expired READY exports past their retention window; a row stuck in
// GENERATING (worker crashed mid-run) was never reclaimed and stayed there
// forever with no automatic path to FAILED. Now also sweeps stale
// GENERATING rows. The tick body was extracted from the infinite while(true)
// loop specifically so it's callable/testable directly.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRunner({ staleGenerating = [], expired = [] }) {
  const calls = { failedUpdates: [], expiredUpdates: [], deletes: [] };

  const prismaMock = {
    homeReportExport: {
      findMany: async (args) => {
        if (args.where.status === 'GENERATING') return staleGenerating;
        if (args.where.status === 'READY') return expired;
        return [];
      },
      update: async (args) => {
        if (args.data.status === 'FAILED') calls.failedUpdates.push(args);
        if (args.data.status === 'EXPIRED') calls.expiredUpdates.push(args);
        return {};
      },
    },
    homeReportExportEvent: {
      create: async () => ({}),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const deletePath = require.resolve('../../src/storage/deleteObject.ts');
  require.cache[deletePath] = {
    id: deletePath,
    filename: deletePath,
    loaded: true,
    exports: {
      deleteObject: async (bucket, key) => {
        calls.deletes.push({ bucket, key });
      },
    },
  };

  const runnerPath = require.resolve('../../src/runners/reportExport.cleanup.ts');
  delete require.cache[runnerPath];
  return { ...require(runnerPath), calls };
}

test('reclaims a stale GENERATING row to FAILED with an explanatory message', async () => {
  const { reportExportCleanupTick, calls } = loadRunner({
    staleGenerating: [{ id: 'export-stuck', startedAt: new Date(Date.now() - 60 * 60 * 1000) }],
  });

  await reportExportCleanupTick();

  assert.equal(calls.failedUpdates.length, 1);
  assert.equal(calls.failedUpdates[0].where.id, 'export-stuck');
  assert.match(calls.failedUpdates[0].data.errorMessage, /timed out/i);
});

test('deletes the S3 object and expires a READY export past its retention window', async () => {
  const { reportExportCleanupTick, calls } = loadRunner({
    expired: [{ id: 'export-old', storageBucket: 'bucket-1', storageKey: 'key-1' }],
  });

  await reportExportCleanupTick();

  assert.equal(calls.deletes.length, 1);
  assert.equal(calls.deletes[0].bucket, 'bucket-1');
  assert.equal(calls.expiredUpdates.length, 1);
  assert.equal(calls.expiredUpdates[0].data.storageBucket, null);
});

test('does nothing when there is no stale or expired work', async () => {
  const { reportExportCleanupTick, calls } = loadRunner({});

  await reportExportCleanupTick();

  assert.equal(calls.failedUpdates.length, 0);
  assert.equal(calls.expiredUpdates.length, 0);
  assert.equal(calls.deletes.length, 0);
});
