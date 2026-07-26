// apps/workers/tests/unit/sendPushSmsNotificationJob.test.js
//
// W4 item 4: sendPushNotificationJob/sendSmsNotificationJob had no
// dedicated test. Both are intentional "no provider wired up yet" stubs —
// they mark the delivery SKIPPED and deliberately throw instead of
// silently completing, so a dead channel shows up as needing attention
// instead of a false-green worker-jobs dashboard card. This is a
// regression-lock: "fixing" the throw away would silently reintroduce the
// exact masked-failure bug the surrounding comments describe.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { sendPushNotificationJob } = require('../../src/jobs/sendPushNotification.job.ts');
const { sendSmsNotificationJob } = require('../../src/jobs/sendSmsNotification.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({
  delivery,
  aggregationAllows = true,
  deliveryEnabled = false,
  subscriptions = [],
  send = async () => ({ statusCode: 201, headers: {}, body: '' }),
}) {
  const calls = { updates: [], subscriptionUpdates: [], sends: [] };
  const deps = {
    prisma: {
      notificationDelivery: {
        findUnique: async () => delivery,
        update: async (args) => {
          calls.updates.push(args);
          return { id: args.where.id, ...args.data };
        },
      },
      pushSubscription: {
        findMany: async () => subscriptions,
        update: async (args) => {
          calls.subscriptionUpdates.push(args);
          return null;
        },
      },
    },
    logger: noopLogger,
    filterDeliveriesByAggregationPolicy: async (deliveries) => (aggregationAllows ? deliveries : []),
    deliveryEnabled: () => deliveryEnabled,
    send: async (...args) => {
      calls.sends.push(args);
      return send(...args);
    },
  };
  return { deps, calls };
}

test('push: sends a minimal payload and marks the delivery SENT', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: {
        id: 'notification-1',
        userId: 'user-1',
        title: 'Review your refinance window',
        message: 'A qualified opportunity is ready to review.',
        actionUrl: '/dashboard/properties/property-1/tools/mortgage-refinance-radar',
      },
    }),
    deliveryEnabled: true,
    subscriptions: [{
      id: 'subscription-1',
      endpoint: 'https://push.example.test/device',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }],
  });

  await sendPushNotificationJob('delivery-1', deps);

  assert.equal(calls.sends.length, 1);
  const payload = JSON.parse(calls.sends[0][1]);
  assert.deepEqual(Object.keys(payload).sort(), ['body', 'title', 'url']);
  assert.equal(calls.updates.at(-1).data.status, 'SENT');
});

test('push: revokes an expired subscription after a provider 410', async () => {
  const providerError = Object.assign(new Error('Gone'), { statusCode: 410 });
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: {
        id: 'notification-1',
        userId: 'user-1',
        title: 'Refinance update',
        message: 'Review the latest assumptions.',
        actionUrl: '/',
      },
    }),
    deliveryEnabled: true,
    subscriptions: [{
      id: 'subscription-1',
      endpoint: 'https://push.example.test/expired',
      p256dh: 'public-key',
      auth: 'auth-secret',
    }],
    send: async () => { throw providerError; },
  });

  await assert.rejects(
    () => sendPushNotificationJob('delivery-1', deps),
    /PUSH_DELIVERY_FAILED/,
  );
  assert.equal(calls.subscriptionUpdates.length, 1);
  assert.equal(calls.updates.at(-1).data.status, 'FAILED');
});

function pendingDelivery(overrides = {}) {
  return { id: 'delivery-1', status: 'PENDING', notification: { id: 'notification-1' }, ...overrides };
}

for (const [label, job, tag] of [
  ['push', sendPushNotificationJob, 'PUSH_NOT_CONFIGURED'],
  ['sms', sendSmsNotificationJob, 'SMS_NOT_IMPLEMENTED'],
]) {
  test(`${label}: marks a PENDING delivery SKIPPED and throws instead of silently completing`, async () => {
    const { deps, calls } = fakeDeps({ delivery: pendingDelivery() });

    await assert.rejects(() => job('delivery-1', deps), new RegExp(tag));

    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0].data.status, 'SKIPPED');
    assert.ok(calls.updates[0].data.failureReason);
  });

  test(`${label}: does nothing and does not throw when the delivery is not PENDING`, async () => {
    const { deps, calls } = fakeDeps({ delivery: pendingDelivery({ status: 'SENT' }) });

    await assert.doesNotReject(() => job('delivery-1', deps));
    assert.equal(calls.updates.length, 0);
  });

  test(`${label}: does nothing and does not throw when the delivery no longer exists`, async () => {
    const { deps, calls } = fakeDeps({ delivery: null });

    await assert.doesNotReject(() => job('delivery-1', deps));
    assert.equal(calls.updates.length, 0);
  });

  test(`${label}: does nothing when the aggregation delivery policy filters it out`, async () => {
    const { deps, calls } = fakeDeps({ delivery: pendingDelivery(), aggregationAllows: false });

    await assert.doesNotReject(() => job('delivery-1', deps));
    assert.equal(calls.updates.length, 0);
  });
}
