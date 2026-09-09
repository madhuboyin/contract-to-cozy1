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
  apnsEnabled = false,
  subscriptions = [],
  devices = [],
  send = async () => ({ statusCode: 201, headers: {}, body: '' }),
  sendApns = async () => ({ ok: true }),
  refinanceRolloutAllowed = true,
}) {
  const calls = { updates: [], subscriptionUpdates: [], deviceUpdates: [], sends: [], apnsSends: [] };
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
      pushDevice: {
        findMany: async () => devices,
        update: async (args) => {
          calls.deviceUpdates.push(args);
          return null;
        },
      },
    },
    logger: noopLogger,
    filterDeliveriesByAggregationPolicy: async (deliveries) => (aggregationAllows ? deliveries : []),
    deliveryEnabled: () => deliveryEnabled,
    apnsEnabled: () => apnsEnabled,
    send: async (...args) => {
      calls.sends.push(args);
      return send(...args);
    },
    sendApns: async (...args) => {
      calls.apnsSends.push(args);
      return sendApns(...args);
    },
    decideRefinanceAlertRollout: () => ({
      allowed: refinanceRolloutAllowed,
      mode: refinanceRolloutAllowed ? 'GENERAL' : 'ALLOWLIST',
      reason: refinanceRolloutAllowed ? null : 'RECIPIENT_NOT_IN_COHORT',
    }),
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

test('push: skips a refinance notification outside the rollout cohort', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: {
        id: 'notification-1',
        type: 'REFINANCE_OPPORTUNITY_OPENED',
        userId: 'user-1',
        user: { email: 'owner@example.com' },
        title: 'Refinance update',
        message: 'Review the latest assumptions.',
        actionUrl: '/',
      },
    }),
    deliveryEnabled: true,
    refinanceRolloutAllowed: false,
  });

  await sendPushNotificationJob('delivery-1', deps);

  assert.equal(calls.sends.length, 0);
  assert.equal(calls.updates.at(-1).data.status, 'SKIPPED');
  assert.equal(
    calls.updates.at(-1).data.failureReason,
    'REFINANCE_ALERT_RECIPIENT_NOT_IN_COHORT',
  );
});

// --- B4: APNs (native iOS) delivery branch ---------------------------------

test('push: delivers to a registered iOS device via APNs when Web Push has no subscription', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: {
        id: 'notification-1',
        userId: 'user-1',
        title: 'Roof leak detected',
        message: 'Water sensor tripped in the attic.',
        actionUrl: '/dashboard/resolution-center',
      },
    }),
    deliveryEnabled: false,
    apnsEnabled: true,
    subscriptions: [],
    devices: [{ id: 'device-1', token: 'apns-token-1' }],
  });

  await sendPushNotificationJob('delivery-1', deps);

  assert.equal(calls.sends.length, 0);
  assert.equal(calls.apnsSends.length, 1);
  assert.equal(calls.apnsSends[0][0], 'apns-token-1');
  assert.deepEqual(calls.apnsSends[0][1], {
    title: 'Roof leak detected',
    body: 'Water sensor tripped in the attic.',
    url: '/dashboard/resolution-center',
  });
  assert.equal(calls.updates.at(-1).data.status, 'SENT');
});

test('push: disables an iOS device token APNs reports as unregistered', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: { id: 'notification-1', userId: 'user-1', title: 'x', message: 'y', actionUrl: '/' },
    }),
    apnsEnabled: true,
    devices: [{ id: 'device-1', token: 'stale-token' }],
    sendApns: async () => ({ ok: false, status: 410, reason: 'Unregistered', unregister: true }),
  });

  await assert.rejects(() => sendPushNotificationJob('delivery-1', deps), /PUSH_DELIVERY_FAILED/);

  assert.equal(calls.deviceUpdates.length, 1);
  assert.equal(calls.deviceUpdates[0].where.id, 'device-1');
  assert.ok(calls.deviceUpdates[0].data.disabledAt instanceof Date);
  assert.equal(calls.updates.at(-1).data.status, 'FAILED');
});

test('push: counts a delivery SENT when Web Push succeeds even if the APNs device fails', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: { id: 'notification-1', userId: 'user-1', title: 'x', message: 'y', actionUrl: '/' },
    }),
    deliveryEnabled: true,
    apnsEnabled: true,
    subscriptions: [{ id: 'sub-1', endpoint: 'https://push.example.test/d', p256dh: 'k', auth: 'a' }],
    devices: [{ id: 'device-1', token: 't' }],
    sendApns: async () => ({ ok: false, status: 429, reason: 'TooManyRequests', unregister: false }),
  });

  await sendPushNotificationJob('delivery-1', deps);

  assert.equal(calls.deviceUpdates.length, 0); // not a terminal reason -> keep the token
  assert.equal(calls.updates.at(-1).data.status, 'SENT');
});

test('push: skips when APNs is enabled but the user has no registered device and no subscription', async () => {
  const { deps, calls } = fakeDeps({
    delivery: pendingDelivery({
      notification: { id: 'notification-1', userId: 'user-1', title: 'x', message: 'y', actionUrl: '/' },
    }),
    apnsEnabled: true,
    devices: [],
  });

  await sendPushNotificationJob('delivery-1', deps);

  assert.equal(calls.apnsSends.length, 0);
  assert.equal(calls.updates.at(-1).data.status, 'SKIPPED');
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
