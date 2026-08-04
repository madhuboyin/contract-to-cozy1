// apps/workers/tests/unit/propertyRecordPurgeCleanup.test.js
//
// trash() in homeRecords.service.ts queues a PENDING PropertyRecordPurgeJob
// with an eligibleAt roughly 30 days out (or the record's retention date if
// later); nothing previously advanced that queue, so a trashed record's
// stored objects and row were never actually purged. This tick promotes
// elapsed PENDING jobs to ELIGIBLE and purges them — object deletion must
// happen before the database row is removed.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRunner({ eligible = [], env = { S3_BUCKET: 'bucket-1' } } = {}) {
  const calls = { promotedToEligible: [], deletes: [], recordDeletes: [], purgeJobUpdates: [] };
  const originalBucket = process.env.S3_BUCKET;
  if (env.S3_BUCKET === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = env.S3_BUCKET;

  const prismaMock = {
    propertyRecordPurgeJob: {
      updateMany: async (args) => {
        calls.promotedToEligible.push(args);
        return { count: 0 };
      },
      findMany: async () => eligible,
      update: async (args) => {
        calls.purgeJobUpdates.push(args);
        return {};
      },
    },
    propertyRecord: {
      delete: async (args) => {
        calls.recordDeletes.push(args);
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

  const runnerPath = require.resolve('../../src/runners/propertyRecordPurge.cleanup.ts');
  delete require.cache[runnerPath];
  const runner = require(runnerPath);
  return {
    ...runner,
    calls,
    restore: () => {
      if (originalBucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = originalBucket;
    },
  };
}

test('deletes every version object before deleting the record row', async () => {
  const { propertyRecordPurgeTick, calls, restore } = loadRunner({
    eligible: [
      {
        id: 'purge-1',
        recordId: 'record-1',
        record: {
          lifecycleStatus: 'TRASHED',
          legalHoldReason: null,
          versions: [{ storageKey: 'k1' }, { storageKey: 'k2' }],
        },
      },
    ],
  });

  try {
    await propertyRecordPurgeTick();

    assert.equal(calls.deletes.length, 2);
    assert.deepEqual(calls.deletes.map((d) => d.key), ['k1', 'k2']);
    assert.equal(calls.recordDeletes.length, 1);
    assert.equal(calls.recordDeletes[0].where.id, 'record-1');

    // Object deletion happened before the record delete for both versions.
    const deleteIndex = calls.purgeJobUpdates.findIndex((u) => u.data.state === 'PROCESSING');
    assert.ok(deleteIndex !== -1);
  } finally {
    restore();
  }
});

test('blocks purge instead of deleting when a legal hold is present', async () => {
  const { propertyRecordPurgeTick, calls, restore } = loadRunner({
    eligible: [
      {
        id: 'purge-2',
        recordId: 'record-2',
        record: { lifecycleStatus: 'TRASHED', legalHoldReason: 'Active claim', versions: [{ storageKey: 'k3' }] },
      },
    ],
  });

  try {
    await propertyRecordPurgeTick();

    assert.equal(calls.deletes.length, 0);
    assert.equal(calls.recordDeletes.length, 0);
    assert.equal(calls.purgeJobUpdates.length, 1);
    assert.equal(calls.purgeJobUpdates[0].data.state, 'BLOCKED');
    assert.match(calls.purgeJobUpdates[0].data.blockedReason, /Active claim/);
  } finally {
    restore();
  }
});

test('skips a job whose record was restored before processing', async () => {
  const { propertyRecordPurgeTick, calls, restore } = loadRunner({
    eligible: [
      {
        id: 'purge-3',
        recordId: 'record-3',
        record: { lifecycleStatus: 'ACTIVE', legalHoldReason: null, versions: [{ storageKey: 'k4' }] },
      },
    ],
  });

  try {
    await propertyRecordPurgeTick();

    assert.equal(calls.deletes.length, 0);
    assert.equal(calls.recordDeletes.length, 0);
    assert.equal(calls.purgeJobUpdates.length, 0);
  } finally {
    restore();
  }
});

test('does nothing when S3_BUCKET is not configured', async () => {
  const { propertyRecordPurgeTick, calls, restore } = loadRunner({
    eligible: [{ id: 'purge-4', recordId: 'record-4', record: { lifecycleStatus: 'TRASHED', legalHoldReason: null, versions: [] } }],
    env: { S3_BUCKET: undefined },
  });

  try {
    await propertyRecordPurgeTick();
    assert.equal(calls.promotedToEligible.length, 0);
  } finally {
    restore();
  }
});
