// apps/workers/tests/unit/materialSpecExportCleanup.test.js
//
// W3 (exports — "exact-record expiration" + "bounded retries"):
// MaterialSpecExport.expiresAt was set at creation (7 days) but nothing
// ever enforced it — no equivalent of reportExport.cleanup.ts existed for
// this export type, so the S3 object and DB row lived forever regardless
// of expiresAt. This new runner mirrors that one: expire COMPLETED rows
// past expiresAt (deleting the object, flipping to the new EXPIRED status)
// and reclaim rows stuck in GENERATING past a timeout.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRunner({ staleGenerating = [], expired = [], s3Bucket = 'test-bucket', clearS3Bucket = false }) {
  const calls = { failedUpdates: [], expiredUpdates: [], deletes: [] };
  const originalBucket = process.env.S3_BUCKET;
  if (clearS3Bucket) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = s3Bucket;

  const prismaMock = {
    materialSpecExport: {
      findMany: async (args) => {
        if (args.where.status === 'GENERATING') return staleGenerating;
        if (args.where.status === 'COMPLETED') return expired;
        return [];
      },
      update: async (args) => {
        if (args.data.status === 'FAILED') calls.failedUpdates.push(args);
        if (args.data.status === 'EXPIRED') calls.expiredUpdates.push(args);
        return {};
      },
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

  const runnerPath = require.resolve('../../src/runners/materialSpecExport.cleanup.ts');
  delete require.cache[runnerPath];
  const mod = require(runnerPath);
  return {
    ...mod,
    calls,
    restore: () => {
      if (originalBucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = originalBucket;
    },
  };
}

test('reclaims a stale GENERATING row to FAILED', async () => {
  const { materialSpecExportCleanupTick, calls, restore } = loadRunner({
    staleGenerating: [{ id: 'export-stuck' }],
  });
  try {
    await materialSpecExportCleanupTick();
    assert.equal(calls.failedUpdates.length, 1);
    assert.equal(calls.failedUpdates[0].where.id, 'export-stuck');
    assert.match(calls.failedUpdates[0].data.errorMessage, /timed out/i);
  } finally {
    restore();
  }
});

test('deletes the S3 object and expires a COMPLETED export past its retention window', async () => {
  const { materialSpecExportCleanupTick, calls, restore } = loadRunner({
    expired: [{ id: 'export-old', fileKey: 'key-1' }],
  });
  try {
    await materialSpecExportCleanupTick();
    assert.equal(calls.deletes.length, 1);
    assert.equal(calls.deletes[0].bucket, 'test-bucket');
    assert.equal(calls.deletes[0].key, 'key-1');
    assert.equal(calls.expiredUpdates.length, 1);
    assert.equal(calls.expiredUpdates[0].data.fileKey, null);
  } finally {
    restore();
  }
});

test('skips the expiry sweep (does not throw) when S3_BUCKET is unset', async () => {
  const { materialSpecExportCleanupTick, calls, restore } = loadRunner({
    expired: [{ id: 'export-old', fileKey: 'key-1' }],
    clearS3Bucket: true,
  });
  try {
    await materialSpecExportCleanupTick();
    assert.equal(calls.deletes.length, 0);
    assert.equal(calls.expiredUpdates.length, 0);
  } finally {
    restore();
  }
});
