// apps/backend/tests/unit/notificationRetryDeliveryGate.test.js
//
// W4 cross-cutting fix: retryDelivery's on-demand email-notification
// enqueue previously bypassed evaluateWorkerExecution entirely — unlike
// NotificationService.create's transportEnabled threading, a manual retry
// could force a real outbound send even while
// WORKER_OUTBOUND_NOTIFICATIONS_ENABLED=false. Also verifies the gate runs
// before the delivery is flipped to PENDING, so a blocked retry doesn't
// leave the delivery stuck in PENDING with nothing left to process it.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadController({ delivery }) {
  const calls = { updates: [], enqueued: [] };

  const prismaMock = {
    notificationDelivery: {
      findUnique: async () => delivery,
      update: async (args) => {
        calls.updates.push(args);
        return { id: delivery.id, ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  require.cache[jobQueuePath] = {
    id: jobQueuePath,
    filename: jobQueuePath,
    loaded: true,
    exports: {
      getEmailNotificationQueue: () => ({
        add: async (name, data) => {
          calls.enqueued.push({ name, data });
          return { id: 'job-1' };
        },
      }),
    },
  };

  // NotificationService pulls in a real BullMQ/notification pipeline —
  // stubbed out since retryDelivery doesn't use it directly.
  const notificationServicePath = require.resolve('../../src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: { NotificationService: {} },
  };

  const controllerPath = require.resolve('../../src/controllers/notification.controller.ts');
  delete require.cache[controllerPath];
  return { ...require(controllerPath), calls };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
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

const baseDelivery = {
  id: 'delivery-1',
  status: 'FAILED',
  channel: 'EMAIL',
  notification: { userId: 'user-1' },
};

test('retryDelivery enqueues and flips to PENDING when the worker execution policy allows it', async () => {
  await withEnv({ WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true' }, async () => {
    const { NotificationController, calls } = loadController({ delivery: baseDelivery });
    const req = { user: { userId: 'user-1' }, params: { deliveryId: 'delivery-1' } };
    const res = fakeRes();

    await NotificationController.retryDelivery(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.enqueued.length, 1);
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0].data.status, 'PENDING');
  });
});

test('retryDelivery returns 403 and never flips to PENDING when outbound notifications are policy-disabled', async () => {
  await withEnv({ WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: undefined }, async () => {
    const { NotificationController, calls } = loadController({ delivery: baseDelivery });
    const req = { user: { userId: 'user-1' }, params: { deliveryId: 'delivery-1' } };
    const res = fakeRes();

    await NotificationController.retryDelivery(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(calls.enqueued.length, 0);
    assert.equal(calls.updates.length, 0, 'must not flip to PENDING when blocked — it would get stuck with nothing to process it');
  });
});
