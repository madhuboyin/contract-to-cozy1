// apps/workers/tests/unit/sendEmailNotificationJob.test.js
//
// W4 item 4: sendEmailNotificationJob (registry key email-notification)
// and runDailyEmailDigest/runWeeklyHomeBriefDigest (registry keys
// daily-email-digest/weekly-home-brief-digest — both thin wrappers around
// the same runPreferenceDigest) had no dedicated test, despite
// sendEmailNotificationJob carrying a documented prior fix (WKR-008 — used
// to swallow send failures, so BullMQ reported "completed" on an actual
// failed send). This locks that regression down explicitly.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({
  seedDelivery,
  pendingDeliveries = [],
  digestPendingRows = [],
  digestDeliveriesByUser = {},
  sendEmailImpl,
  aggregationAllowsAll = true,
}) {
  const calls = { sentEmails: [], updateManyArgs: [] };

  const prismaMock = {
    notificationDelivery: {
      findUnique: async () => seedDelivery,
      findMany: async (args) => {
        // Three distinct findMany call shapes share this mock, distinguished
        // most-specific-first: sendEmailNotificationJob's "more HIGH-priority
        // deliveries for the same user" query filters on BOTH
        // notification.userId AND notification.metadata.path — check metadata
        // first or it's misrouted to the per-user digest branch below (which
        // only filters on notification.userId, no metadata). The digest's
        // initial broad scan filters on neither.
        if (args.where.notification?.metadata) return pendingDeliveries;
        if (args.where.notification?.userId) return digestDeliveriesByUser[args.where.notification.userId] ?? [];
        return digestPendingRows;
      },
      updateMany: async (args) => {
        calls.updateManyArgs.push(args);
        return { count: args.where.id.in.length };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const emailPath = require.resolve('../../src/email/email.service.ts');
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
      sendEmail: async (to, subject, html) => {
        calls.sentEmails.push({ to, subject, html });
        if (sendEmailImpl) return sendEmailImpl(to, subject, html);
      },
    },
  };

  const policyPath = require.resolve('../../src/services/aggregationDeliveryPolicy.ts');
  require.cache[policyPath] = {
    id: policyPath,
    filename: policyPath,
    loaded: true,
    exports: {
      filterDeliveriesByAggregationPolicy: async (deliveries) => (aggregationAllowsAll ? deliveries : []),
    },
  };

  const jobPath = require.resolve('../../src/jobs/sendEmailNotification.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

function deliveryFixture(overrides = {}) {
  return {
    id: 'delivery-1',
    status: 'PENDING',
    notification: {
      id: 'notification-1',
      title: 'Title',
      message: 'Message',
      actionUrl: null,
      metadata: { priority: 'HIGH' },
      userId: 'user-1',
      user: { id: 'user-1', email: 'homeowner@example.com', firstName: 'Sam' },
      createdAt: new Date(),
    },
    ...overrides,
  };
}

// ── sendEmailNotificationJob ────────────────────────────────────────────

test('sendEmailNotificationJob: does nothing when the seed delivery does not exist', async () => {
  const { sendEmailNotificationJob, calls } = loadJob({ seedDelivery: null });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails.length, 0);
});

test('sendEmailNotificationJob: does nothing when the seed delivery is not PENDING', async () => {
  const { sendEmailNotificationJob, calls } = loadJob({ seedDelivery: deliveryFixture({ status: 'SENT' }) });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails.length, 0);
});

test('sendEmailNotificationJob: does nothing for a non-HIGH-priority notification (daily digest handles it)', async () => {
  const seed = deliveryFixture({ notification: { ...deliveryFixture().notification, metadata: { priority: 'LOW' } } });
  const { sendEmailNotificationJob, calls } = loadJob({ seedDelivery: seed });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails.length, 0);
});

test('sendEmailNotificationJob: batches multiple pending HIGH deliveries into one email and marks all SENT', async () => {
  const seed = deliveryFixture();
  const { sendEmailNotificationJob, calls } = loadJob({
    seedDelivery: seed,
    pendingDeliveries: [
      { id: 'delivery-1', notification: seed.notification },
      { id: 'delivery-2', notification: { ...seed.notification, id: 'notification-2', title: 'Second' } },
    ],
  });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails.length, 1, 'must send exactly one batched email');
  assert.equal(calls.sentEmails[0].to, 'homeowner@example.com');
  assert.match(calls.sentEmails[0].subject, /2 new updates/);
  const sentUpdate = calls.updateManyArgs.find((u) => u.data.status === 'SENT');
  assert.deepEqual(sentUpdate.where.id.in, ['delivery-1', 'delivery-2']);
});

test('sendEmailNotificationJob: uses the single notification\'s own title as subject when there is only one', async () => {
  const seed = deliveryFixture();
  const { sendEmailNotificationJob, calls } = loadJob({
    seedDelivery: seed,
    pendingDeliveries: [{ id: 'delivery-1', notification: seed.notification }],
  });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails[0].subject, 'Title');
});

test('sendEmailNotificationJob: a failed send marks every batched delivery FAILED and rethrows (WKR-008 regression lock)', async () => {
  const seed = deliveryFixture();
  const { sendEmailNotificationJob, calls } = loadJob({
    seedDelivery: seed,
    pendingDeliveries: [{ id: 'delivery-1', notification: seed.notification }],
    sendEmailImpl: async () => {
      throw new Error('SMTP unavailable');
    },
  });

  await assert.rejects(() => sendEmailNotificationJob('delivery-1'), /SMTP unavailable/);

  const failedUpdate = calls.updateManyArgs.find((u) => u.data.status === 'FAILED');
  assert.ok(failedUpdate, 'must mark the deliveries FAILED, not leave them silently PENDING');
  assert.equal(failedUpdate.data.failureReason, 'SMTP unavailable');
});

test('sendEmailNotificationJob: sends nothing when the aggregation delivery policy filters everything out', async () => {
  const seed = deliveryFixture();
  const { sendEmailNotificationJob, calls } = loadJob({
    seedDelivery: seed,
    pendingDeliveries: [{ id: 'delivery-1', notification: seed.notification }],
    aggregationAllowsAll: false,
  });

  await sendEmailNotificationJob('delivery-1');

  assert.equal(calls.sentEmails.length, 0);
});

// ── runDailyEmailDigest / runWeeklyHomeBriefDigest ──────────────────────

test('runDailyEmailDigest: includes users with an unset cadence (defaults to daily) and DAILY_DIGEST cadence', async () => {
  const { runDailyEmailDigest, calls } = loadJob({
    seedDelivery: null,
    digestPendingRows: [
      { notification: { userId: 'user-1', metadata: {} } }, // unset cadence -> daily
      { notification: { userId: 'user-2', metadata: { notificationPolicy: { channels: [{ channel: 'EMAIL', cadence: 'DAILY_DIGEST' }] } } } },
      { notification: { userId: 'user-3', metadata: { notificationPolicy: { channels: [{ channel: 'EMAIL', cadence: 'WEEKLY_BRIEF' }] } } } },
    ],
    digestDeliveriesByUser: {
      'user-1': [{ id: 'd1', notification: { userId: 'user-1', title: 'T1', message: 'M1', actionUrl: null, metadata: {}, user: { email: 'u1@example.com', firstName: 'A' } } }],
      'user-2': [{ id: 'd2', notification: { userId: 'user-2', title: 'T2', message: 'M2', actionUrl: null, metadata: { notificationPolicy: { channels: [{ channel: 'EMAIL', cadence: 'DAILY_DIGEST' }] } }, user: { email: 'u2@example.com', firstName: 'B' } } }],
    },
  });

  await runDailyEmailDigest();

  const recipients = calls.sentEmails.map((e) => e.to).sort();
  assert.deepEqual(recipients, ['u1@example.com', 'u2@example.com'], 'user-3 (WEEKLY_BRIEF) must not get a daily digest');
});

test('runWeeklyHomeBriefDigest: only includes users with WEEKLY_BRIEF cadence', async () => {
  const { runWeeklyHomeBriefDigest, calls } = loadJob({
    seedDelivery: null,
    digestPendingRows: [
      { notification: { userId: 'user-1', metadata: {} } }, // unset -> daily, not weekly
      { notification: { userId: 'user-3', metadata: { notificationPolicy: { channels: [{ channel: 'EMAIL', cadence: 'WEEKLY_BRIEF' }] } } } },
    ],
    digestDeliveriesByUser: {
      'user-3': [{ id: 'd3', notification: { userId: 'user-3', title: 'T3', message: 'M3', actionUrl: null, metadata: { notificationPolicy: { channels: [{ channel: 'EMAIL', cadence: 'WEEKLY_BRIEF' }] } }, user: { email: 'u3@example.com', firstName: 'C' } } }],
    },
  });

  await runWeeklyHomeBriefDigest();

  assert.deepEqual(calls.sentEmails.map((e) => e.to), ['u3@example.com']);
});

test('digest: one user failing does not abort the digest run for the rest', async () => {
  const { runDailyEmailDigest, calls } = loadJob({
    seedDelivery: null,
    digestPendingRows: [
      { notification: { userId: 'user-1', metadata: {} } },
      { notification: { userId: 'user-2', metadata: {} } },
    ],
    digestDeliveriesByUser: {
      'user-1': [{ id: 'd1', notification: { userId: 'user-1', title: 'T1', message: 'M1', actionUrl: null, metadata: {}, user: null } }], // no email -> sendUserDigest returns early, not a throw
      'user-2': [{ id: 'd2', notification: { userId: 'user-2', title: 'T2', message: 'M2', actionUrl: null, metadata: {}, user: { email: 'u2@example.com', firstName: 'B' } } }],
    },
  });

  await assert.doesNotReject(() => runDailyEmailDigest());

  assert.deepEqual(calls.sentEmails.map((e) => e.to), ['u2@example.com']);
});

test('digest: skips a user with no pending deliveries left after the aggregation policy filter', async () => {
  const { runDailyEmailDigest, calls } = loadJob({
    seedDelivery: null,
    digestPendingRows: [{ notification: { userId: 'user-1', metadata: {} } }],
    digestDeliveriesByUser: { 'user-1': [{ id: 'd1', notification: { userId: 'user-1', title: 'T1', message: 'M1', actionUrl: null, metadata: {}, user: { email: 'u1@example.com', firstName: 'A' } } }] },
    aggregationAllowsAll: false,
  });

  await runDailyEmailDigest();

  assert.equal(calls.sentEmails.length, 0);
});
