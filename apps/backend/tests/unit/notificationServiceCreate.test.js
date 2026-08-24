// apps/backend/tests/unit/notificationServiceCreate.test.js
//
// W4 item 3 ("notification" suite): NotificationService.create() is the
// single source of truth this entire audit routes homeowner-facing
// notifications through (WKR-001/WKR-002 fixed two jobs that bypassed it
// entirely) — yet it had no dedicated test of its own logic before this
// file, only indirect coverage via job-specific test files that mock it
// away. Covers: IN_APP always created, transportEnabled gating, ROUTINE
// vs. important urgency gating immediate enqueue, requiredChannels
// force-add, property-context applicability suppression, lifecycle-status
// suppression, and enqueue-failure isolation.
//
// Queue mocking uses the W4 lazy-queue __setForTesting() seam
// (apps/backend/src/lib/queuePort.ts) instead of stubbing JobQueue.service.ts
// via require.cache — the real module is safe to require directly now.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function policyFixture(overrides = {}) {
  return {
    category: 'MAINTENANCE',
    urgency: 'MATERIAL',
    channels: [
      { channel: 'IN_APP', enabled: true, cadence: 'IMMEDIATE', deliverImmediately: true, quietHoursApplied: false },
      { channel: 'EMAIL', enabled: true, cadence: 'IMMEDIATE', deliverImmediately: true, quietHoursApplied: false },
    ],
    ...overrides,
  };
}

function loadService({
  policy = policyFixture(),
  aggregationDecisionStatus = 'APPLICABLE',
  lifecycle = [],
  homeownerProfile = { notificationPreferences: null },
  existingDeduplicatedNotification = null,
} = {}) {
  const calls = { creates: [], upserts: [], deliveryUpdates: [], resolvePolicyArgs: null };

  const materializeNotification = (data) => ({
    id: 'notification-1',
    ...data,
    deliveries: data.deliveries.create.map((d, i) => ({ id: `delivery-${i}`, ...d })),
  });

  const prismaMock = {
    homeownerProfile: { findFirst: async () => homeownerProfile },
    notification: {
      create: async (args) => {
        calls.creates.push(args);
        return materializeNotification(args.data);
      },
      upsert: async (args) => {
        calls.upserts.push(args);
        return existingDeduplicatedNotification ?? materializeNotification(args.create);
      },
    },
    notificationDelivery: {
      update: async (args) => {
        calls.deliveryUpdates.push(args);
        return { id: args.where.id, ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const contextPath = require.resolve('../../src/services/aggregationContext/context.ts');
  require.cache[contextPath] = {
    id: contextPath,
    filename: contextPath,
    loaded: true,
    exports: {
      getAggregationContextEnvelope: async () => ({
        decision: { status: aggregationDecisionStatus },
        lifecycle,
        contextVersion: 'v1',
      }),
    },
  };

  const preferencePath = require.resolve('../../src/services/notificationPreference.service.ts');
  require.cache[preferencePath] = {
    id: preferencePath,
    filename: preferencePath,
    loaded: true,
    exports: {
      resolveNotificationPolicy: async (args) => {
        calls.resolvePolicyArgs = args;
        return policy;
      },
    },
  };

  const servicePath = require.resolve('../../src/services/notification.service.ts');
  delete require.cache[servicePath];
  const mod = require(servicePath);

  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  const jobQueueMod = require(jobQueuePath);
  const enqueued = { email: [], push: [], sms: [] };
  jobQueueMod.getEmailNotificationQueue.__setForTesting({
    add: async (name, data, opts) => {
      enqueued.email.push({ name, data, opts });
      return { id: opts?.jobId ?? 'job' };
    },
    getJob: async () => undefined,
  });
  jobQueueMod.getPushNotificationQueue.__setForTesting({
    add: async (name, data) => {
      enqueued.push.push({ name, data });
      return { id: 'job' };
    },
    getJob: async () => undefined,
  });
  jobQueueMod.getSmsNotificationQueue.__setForTesting({
    add: async (name, data) => {
      enqueued.sms.push({ name, data });
      return { id: 'job' };
    },
    getJob: async () => undefined,
  });

  return { NotificationService: mod.NotificationService, calls, enqueued };
}

function baseInput(overrides = {}) {
  return {
    userId: 'user-1',
    type: 'TEST_TYPE',
    title: 'Test',
    message: 'Test message',
    ...overrides,
  };
}

test('always creates an IN_APP delivery, SENT immediately', async () => {
  const { NotificationService, calls } = loadService({ policy: policyFixture({ channels: [
    { channel: 'IN_APP', enabled: true, cadence: 'IMMEDIATE', deliverImmediately: true, quietHoursApplied: false },
  ] }) });

  await NotificationService.create(baseInput());

  const created = calls.creates[0].data.deliveries.create;
  assert.equal(created.length, 1);
  assert.equal(created[0].channel, 'IN_APP');
  assert.equal(created[0].status, 'SENT');
});

test('creates a PENDING delivery row and enqueues EMAIL for an important notification', async () => {
  const { NotificationService, calls, enqueued } = loadService();

  await NotificationService.create(baseInput());

  const emailDelivery = calls.creates[0].data.deliveries.create.find((d) => d.channel === 'EMAIL');
  assert.equal(emailDelivery.status, 'PENDING');
  assert.equal(enqueued.email.length, 1);
  assert.equal(calls.deliveryUpdates.length, 1, 'enqueuedAt must be stamped on the delivery row');
});

test('deduplicationKey upserts durably and does not re-enqueue an existing claimed delivery', async () => {
  const { NotificationService, calls, enqueued } = loadService({
    existingDeduplicatedNotification: {
      id: 'notification-existing',
      deduplicationKey: 'permit-requirement:1:2026-07-29',
      deliveries: [
        { id: 'delivery-in-app', channel: 'IN_APP', status: 'SENT', enqueuedAt: null },
        { id: 'delivery-email', channel: 'EMAIL', status: 'PENDING', enqueuedAt: new Date() },
      ],
    },
  });

  const result = await NotificationService.create(baseInput({
    deduplicationKey: 'permit-requirement:1:2026-07-29',
  }));

  assert.equal(result.id, 'notification-existing');
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.upserts[0].where.deduplicationKey, 'permit-requirement:1:2026-07-29');
  assert.equal(calls.creates.length, 0);
  assert.equal(enqueued.email.length, 0, 'an already-claimed durable delivery must not be sent twice');
});

test('transportEnabled=false still creates the PENDING delivery row but never enqueues it', async () => {
  const { NotificationService, calls, enqueued } = loadService();

  await NotificationService.create(baseInput({ transportEnabled: false }));

  const emailDelivery = calls.creates[0].data.deliveries.create.find((d) => d.channel === 'EMAIL');
  assert.equal(emailDelivery.status, 'PENDING', 'row must still exist for dry-run inspection');
  assert.equal(enqueued.email.length, 0, 'transport must be suppressed');
});

test('ROUTINE urgency creates delivery rows but never enqueues immediate transport (digest workers pick it up later)', async () => {
  const { NotificationService, calls, enqueued } = loadService({ policy: policyFixture({ urgency: 'ROUTINE' }) });

  await NotificationService.create(baseInput());

  const emailDelivery = calls.creates[0].data.deliveries.create.find((d) => d.channel === 'EMAIL');
  assert.equal(emailDelivery.status, 'PENDING');
  assert.equal(enqueued.email.length, 0);
});

test('does not independently rescore attention priority from days-until-due metadata', async () => {
  const { NotificationService, calls } = loadService({
    policy: policyFixture({ urgency: 'ROUTINE' }),
  });

  await NotificationService.create(baseInput({
    metadata: { daysUntilDue: 21 },
  }));

  assert.equal(calls.creates[0].data.metadata.attentionPriority, 'PLAN');
});

test('preserves an explicit canonical attention priority', async () => {
  const { NotificationService, calls } = loadService({
    policy: policyFixture({ urgency: 'ROUTINE', category: 'GENERAL' }),
  });

  await NotificationService.create(baseInput({
    metadata: { attentionPriority: 'CONSIDER' },
  }));

  assert.equal(calls.creates[0].data.metadata.attentionPriority, 'CONSIDER');
});

test('requiredChannels force-adds a channel not already enabled by policy', async () => {
  const { NotificationService, calls, enqueued } = loadService({
    policy: policyFixture({ channels: [{ channel: 'IN_APP', enabled: true, cadence: 'IMMEDIATE', deliverImmediately: true, quietHoursApplied: false }] }),
  });

  await NotificationService.create(baseInput({ requiredChannels: ['SMS'] }));

  const smsDelivery = calls.creates[0].data.deliveries.create.find((d) => d.channel === 'SMS');
  assert.ok(smsDelivery, 'SMS must be force-added even though the resolved policy did not enable it');
  assert.equal(enqueued.sms.length, 1);
});

test('returns null and creates nothing when property-context applicability is not APPLICABLE', async () => {
  const { NotificationService, calls } = loadService({ aggregationDecisionStatus: 'NOT_APPLICABLE' });

  const result = await NotificationService.create(baseInput({ metadata: { propertyId: 'property-1' } }));

  assert.equal(result, null);
  assert.equal(calls.creates.length, 0);
});

test('returns null when a matching lifecycle entry is not ACTIVE', async () => {
  const { NotificationService, calls } = loadService({
    lifecycle: [{ identity: 'lifecycle-1', sourceId: undefined, actionKey: undefined, status: 'RESOLVED' }],
  });

  const result = await NotificationService.create(
    baseInput({ metadata: { propertyId: 'property-1', aggregationIdentity: 'lifecycle-1' } }),
  );

  assert.equal(result, null);
  assert.equal(calls.creates.length, 0);
});

test('proceeds normally when a matching lifecycle entry IS ACTIVE', async () => {
  const { NotificationService, calls } = loadService({
    lifecycle: [{ identity: 'lifecycle-1', sourceId: undefined, actionKey: undefined, status: 'ACTIVE' }],
  });

  const result = await NotificationService.create(
    baseInput({ metadata: { propertyId: 'property-1', aggregationIdentity: 'lifecycle-1' } }),
  );

  assert.ok(result);
  assert.equal(calls.creates.length, 1);
});

test('a failed enqueue for one channel is caught and logged, not thrown — the notification create still succeeds', async () => {
  const { NotificationService, calls } = loadService();
  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  const jobQueueMod = require(jobQueuePath);
  jobQueueMod.getEmailNotificationQueue.__setForTesting({
    add: async () => {
      throw new Error('queue unavailable');
    },
    getJob: async () => undefined,
  });

  const result = await NotificationService.create(baseInput());

  assert.ok(result, 'create() must not throw just because the immediate enqueue failed');
  assert.equal(calls.creates.length, 1);
});
