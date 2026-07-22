// apps/backend/tests/unit/adminWorkerJobsSmokeCleanup.test.js
//
// W6 item 3: previewSmokeCleanup/deleteSmokeRecords must resolve exact
// record IDs by correlation ID and delete only those IDs — never a
// date/status sweep (see cleanupInventoryDrafts.job.ts for the pattern
// this is designed to avoid repeating).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ notifications = [], mortgageRateSnapshots = [] } = {}) {
  const calls = { notificationFindMany: [], snapshotFindMany: [], notificationDeleteMany: [], snapshotDeleteMany: [] };

  const prismaMock = {
    notification: {
      findMany: async (args) => {
        calls.notificationFindMany.push(args);
        return notifications;
      },
      deleteMany: async (args) => {
        calls.notificationDeleteMany.push(args);
        return { count: args.where.id.in.length };
      },
    },
    mortgageRateSnapshot: {
      findMany: async (args) => {
        calls.snapshotFindMany.push(args);
        return mortgageRateSnapshots;
      },
      deleteMany: async (args) => {
        calls.snapshotDeleteMany.push(args);
        return { count: args.where.id.in.length };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const bullmqPath = require.resolve('bullmq');
  require.cache[bullmqPath] = {
    id: bullmqPath, filename: bullmqPath, loaded: true,
    exports: { Queue: class {}, Worker: class { on() {} } },
  };
  const ioredisPath = require.resolve('ioredis');
  require.cache[ioredisPath] = { id: ioredisPath, filename: ioredisPath, loaded: true, exports: class { on() {} } };

  const servicePath = require.resolve('../../src/services/adminWorkerJobs.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), calls };
}

test('previewSmokeCleanup resolves exact IDs across both models and performs no writes', async () => {
  const { previewSmokeCleanup, calls } = loadService({
    notifications: [{ id: 'notif-1' }, { id: 'notif-2' }],
    mortgageRateSnapshots: [{ id: 'snap-1' }],
  });

  const preview = await previewSmokeCleanup('smoke:permit-inspection-reminders:1732200000000:ab12cd34');

  assert.deepEqual(preview.notificationIds, ['notif-1', 'notif-2']);
  assert.deepEqual(preview.mortgageRateSnapshotIds, ['snap-1']);
  assert.equal(calls.notificationDeleteMany.length, 0);
  assert.equal(calls.snapshotDeleteMany.length, 0);
  assert.equal(calls.notificationFindMany[0].where.metadata.path[0], 'smokeCorrelationId');
  assert.equal(calls.notificationFindMany[0].where.metadata.equals, 'smoke:permit-inspection-reminders:1732200000000:ab12cd34');
});

test('previewSmokeCleanup rejects a value that is not a smoke correlation ID', async () => {
  const { previewSmokeCleanup } = loadService();

  await assert.rejects(() => previewSmokeCleanup('not-a-smoke-id'), /Not a smoke correlation ID/);
});

test('deleteSmokeRecords deletes exactly the previewed IDs — never a broader range', async () => {
  const { deleteSmokeRecords, calls } = loadService({
    notifications: [{ id: 'notif-1' }],
    mortgageRateSnapshots: [{ id: 'snap-1' }, { id: 'snap-2' }],
  });

  const deleted = await deleteSmokeRecords('smoke:mortgage-rate-ingest:1732200000000:ab12cd34');

  assert.deepEqual(deleted.notificationIds, ['notif-1']);
  assert.deepEqual(deleted.mortgageRateSnapshotIds, ['snap-1', 'snap-2']);
  assert.equal(calls.notificationDeleteMany.length, 1);
  assert.deepEqual(calls.notificationDeleteMany[0].where.id.in, ['notif-1']);
  assert.equal(calls.snapshotDeleteMany.length, 1);
  assert.deepEqual(calls.snapshotDeleteMany[0].where.id.in, ['snap-1', 'snap-2']);
});

test('deleteSmokeRecords skips the deleteMany call entirely for a model with zero matching records', async () => {
  const { deleteSmokeRecords, calls } = loadService({ notifications: [], mortgageRateSnapshots: [{ id: 'snap-1' }] });

  await deleteSmokeRecords('smoke:mortgage-rate-ingest:1732200000000:ab12cd34');

  assert.equal(calls.notificationDeleteMany.length, 0, 'must not call deleteMany with an empty id list');
  assert.equal(calls.snapshotDeleteMany.length, 1);
});
