const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const {
  radarNotificationDeliveryTick,
} = require('../../src/runners/radarNotificationDelivery.poller.ts');

function queue() {
  const jobs = [];
  return {
    jobs,
    add: async (...args) => {
      jobs.push(args);
    },
  };
}

function database(decisions, options = {}) {
  const updates = [];
  return {
    updates,
    db: {
      propertyRadarNotificationDecision: {
        findMany: async () => decisions,
      },
      notificationDelivery: {
        updateMany: async ({ where, data }) => {
          updates.push({ where, data });
          if (options.failRelease && data.enqueuedAt === null) return { count: 1 };
          return { count: 1 };
        },
      },
    },
  };
}

test('dispatches claimed Radar email and enabled push deliveries with stable job ids', async () => {
  const emailQueue = queue();
  const pushQueue = queue();
  const state = database([{
    id: 'decision-1',
    notification: {
      deliveries: [
        { id: 'email-1', channel: 'EMAIL' },
        { id: 'push-1', channel: 'PUSH' },
      ],
    },
  }]);
  const result = await radarNotificationDeliveryTick({
    db: state.db,
    emailQueue,
    pushQueue,
    batchSize: 25,
    now: new Date('2026-07-26T16:00:00.000Z'),
    pushTransportEnabled: true,
  });

  assert.deepEqual(result, { examined: 2, enqueued: 2, skipped: 0, failed: 0 });
  assert.equal(emailQueue.jobs[0][0], 'SEND_EMAIL_NOTIFICATION');
  assert.equal(emailQueue.jobs[0][2].jobId, 'radar-email-email-1');
  assert.equal(pushQueue.jobs[0][0], 'SEND_PUSH_NOTIFICATION');
  assert.equal(pushQueue.jobs[0][2].jobId, 'radar-push-push-1');
  assert.equal(state.updates.length, 2);
});

test('leaves push pending when transport is not configured', async () => {
  const emailQueue = queue();
  const pushQueue = queue();
  const state = database([{
    id: 'decision-1',
    notification: {
      deliveries: [{ id: 'push-1', channel: 'PUSH' }],
    },
  }]);
  const result = await radarNotificationDeliveryTick({
    db: state.db,
    emailQueue,
    pushQueue,
    batchSize: 25,
    pushTransportEnabled: false,
  });
  assert.deepEqual(result, { examined: 1, enqueued: 0, skipped: 1, failed: 0 });
  assert.equal(state.updates.length, 0);
  assert.equal(pushQueue.jobs.length, 0);
});

test('releases the durable claim when queueing fails', async () => {
  const emailQueue = {
    add: async () => {
      throw new Error('redis unavailable');
    },
  };
  const state = database([{
    id: 'decision-1',
    notification: {
      deliveries: [{ id: 'email-1', channel: 'EMAIL' }],
    },
  }], { failRelease: true });
  const result = await radarNotificationDeliveryTick({
    db: state.db,
    emailQueue,
    pushQueue: queue(),
    batchSize: 25,
  });
  assert.deepEqual(result, { examined: 1, enqueued: 0, skipped: 0, failed: 1 });
  assert.equal(state.updates.length, 2);
  assert.equal(state.updates[1].data.enqueuedAt, null);
});
