// apps/workers/tests/unit/highPriorityEmailEnqueueTick.test.js
//
// W4 item 4: the high-priority-email-enqueue-poller runner had no
// dedicated test, despite gating whether HIGH-priority emails ever
// actually get sent and carrying two previously-fixed live bugs (BullMQ
// rejecting ":" in custom job IDs; an all-or-nothing Promise.all that
// could permanently orphan a delivery whose queue.add() failed after
// enqueuedAt was already persisted). Extracted highPriorityEmailEnqueueTick
// out of the poller's while(true) loop (same technique as
// claimFollowUpDueTick) so it can run against an injected fake queue
// instead of a real BullMQ Queue/Redis connection.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadPoller({ pendingDeliveries, addShouldFailFor = new Set() }) {
  const calls = { added: [], updateManyArgs: [] };

  const prismaMock = {
    notificationDelivery: {
      findMany: async () => pendingDeliveries,
      updateMany: async (args) => {
        calls.updateManyArgs.push(args);
        return { count: args.where.id?.in?.length ?? 1 };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const fakeQueue = {
    add: async (name, data, opts) => {
      calls.added.push({ name, data, opts });
      if (addShouldFailFor.has(data.notificationDeliveryId)) {
        throw new Error(`add failed for ${data.notificationDeliveryId}`);
      }
      return { id: opts?.jobId };
    },
  };

  const pollerPath = require.resolve('../../src/runners/highPriorityEmailEnqueue.poller.ts');
  delete require.cache[pollerPath];
  return { ...require(pollerPath), calls, fakeQueue };
}

test('enqueues every HIGH-priority PENDING delivery and stamps enqueuedAt first', async () => {
  const { highPriorityEmailEnqueueTick, calls, fakeQueue } = loadPoller({
    pendingDeliveries: [{ id: 'delivery-1' }, { id: 'delivery-2' }],
  });

  const result = await highPriorityEmailEnqueueTick(fakeQueue, 50);

  assert.deepEqual(result, { succeeded: 2, failed: 0 });
  assert.equal(calls.added.length, 2);
  // enqueuedAt stamp must happen before queue.add is attempted (optimistic
  // dedup — see the source comment on why order matters here).
  assert.deepEqual(calls.updateManyArgs[0].data, { enqueuedAt: calls.updateManyArgs[0].data.enqueuedAt });
  assert.ok(calls.updateManyArgs[0].data.enqueuedAt instanceof Date);
});

test('job IDs never contain a colon (BullMQ rejects it) — regression lock', async () => {
  const { highPriorityEmailEnqueueTick, calls, fakeQueue } = loadPoller({
    pendingDeliveries: [{ id: 'delivery-1' }],
  });

  await highPriorityEmailEnqueueTick(fakeQueue, 50);

  assert.doesNotMatch(calls.added[0].opts.jobId, /:/);
});

test('a failed queue.add rolls back enqueuedAt so the delivery is retried next tick, and does not block other deliveries', async () => {
  const { highPriorityEmailEnqueueTick, calls, fakeQueue } = loadPoller({
    pendingDeliveries: [{ id: 'delivery-1' }, { id: 'delivery-2' }],
    addShouldFailFor: new Set(['delivery-2']),
  });

  const result = await highPriorityEmailEnqueueTick(fakeQueue, 50);

  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 1);
  assert.equal(calls.added.length, 2, 'both must still be attempted, not an all-or-nothing batch');
  const rollbackCall = calls.updateManyArgs.find((a) => a.where.id === 'delivery-2' && a.data.enqueuedAt === null);
  assert.ok(rollbackCall, 'the failed delivery must have its enqueuedAt rolled back to null');
});

test('returns zero counts and touches nothing when there are no pending HIGH-priority deliveries', async () => {
  const { highPriorityEmailEnqueueTick, calls, fakeQueue } = loadPoller({ pendingDeliveries: [] });

  const result = await highPriorityEmailEnqueueTick(fakeQueue, 50);

  assert.deepEqual(result, { succeeded: 0, failed: 0 });
  assert.equal(calls.added.length, 0);
  assert.equal(calls.updateManyArgs.length, 0, 'must not touch enqueuedAt when nothing was fetched');
});
