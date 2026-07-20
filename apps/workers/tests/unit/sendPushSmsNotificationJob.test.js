// apps/workers/tests/unit/sendPushSmsNotificationJob.test.js
//
// W4 item 4: sendPushNotificationJob/sendSmsNotificationJob had no
// dedicated test. Both are intentional "no provider wired up yet" stubs —
// they mark the delivery SKIPPED and deliberately throw instead of
// silently completing, so a dead channel shows up as needing attention
// instead of a false-green worker-jobs dashboard card. This is a
// regression-lock: "fixing" the throw away would silently reintroduce the
// exact masked-failure bug the surrounding comments describe.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJobs({ delivery, aggregationAllows = true }) {
  const calls = { updates: [] };

  const prismaMock = {
    notificationDelivery: {
      findUnique: async () => delivery,
      update: async (args) => {
        calls.updates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const policyPath = require.resolve('../../src/services/aggregationDeliveryPolicy.ts');
  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      filterDeliveriesByAggregationPolicy: async (deliveries) => (aggregationAllows ? deliveries : []),
    },
  };

  const pushPath = require.resolve('../../src/jobs/sendPushNotification.job.ts');
  delete require.cache[pushPath];
  const smsPath = require.resolve('../../src/jobs/sendSmsNotification.job.ts');
  delete require.cache[smsPath];

  return { ...require(pushPath), ...require(smsPath), calls };
}

function pendingDelivery(overrides = {}) {
  return { id: 'delivery-1', status: 'PENDING', notification: { id: 'notification-1' }, ...overrides };
}

for (const [label, jobExport, tag] of [
  ['push', 'sendPushNotificationJob', 'PUSH_NOT_IMPLEMENTED'],
  ['sms', 'sendSmsNotificationJob', 'SMS_NOT_IMPLEMENTED'],
]) {
  test(`${label}: marks a PENDING delivery SKIPPED and throws instead of silently completing`, async () => {
    const { [jobExport]: job, calls } = loadJobs({ delivery: pendingDelivery() });

    await assert.rejects(() => job('delivery-1'), new RegExp(tag));

    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0].data.status, 'SKIPPED');
    assert.ok(calls.updates[0].data.failureReason);
  });

  test(`${label}: does nothing and does not throw when the delivery is not PENDING`, async () => {
    const { [jobExport]: job, calls } = loadJobs({ delivery: pendingDelivery({ status: 'SENT' }) });

    await assert.doesNotReject(() => job('delivery-1'));
    assert.equal(calls.updates.length, 0);
  });

  test(`${label}: does nothing and does not throw when the delivery no longer exists`, async () => {
    const { [jobExport]: job, calls } = loadJobs({ delivery: null });

    await assert.doesNotReject(() => job('delivery-1'));
    assert.equal(calls.updates.length, 0);
  });

  test(`${label}: does nothing when the aggregation delivery policy filters it out`, async () => {
    const { [jobExport]: job, calls } = loadJobs({ delivery: pendingDelivery(), aggregationAllows: false });

    await assert.doesNotReject(() => job('delivery-1'));
    assert.equal(calls.updates.length, 0);
  });
}
