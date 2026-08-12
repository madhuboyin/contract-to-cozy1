const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Regression coverage for §17.2 ("respect ... cooldown, deduplication, and
// materiality rules"): evaluateRefinanceRateMonitors previously deduplicated
// only against the exact previous snapshot id, so a monitor re-fired every
// weekly snapshot indefinitely as long as the rate stayed under threshold --
// no minimum spacing between notifications and no requirement that the rate
// actually moved. These tests exercise the decision logic directly against a
// mocked prisma/notification/continuation layer (no live database needed).

let monitors = [];
let updates = [];
let notifications = [];

const prismaMock = {
  refinanceRateMonitor: {
    findMany: async () => monitors,
    update: async ({ where, data }) => {
      updates.push({ where, data });
      const monitor = monitors.find((candidate) => candidate.id === where.id);
      Object.assign(monitor, data);
      return monitor;
    },
  },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const notificationServicePath = require.resolve('../../src/services/notification.service.ts');
require.cache[notificationServicePath] = {
  id: notificationServicePath, filename: notificationServicePath, loaded: true,
  exports: { NotificationService: { create: async (input) => { notifications.push(input); } } },
};

const continuationPath = require.resolve('../../src/services/ask/askNotificationContinuation.service.ts');
require.cache[continuationPath] = {
  id: continuationPath, filename: continuationPath, loaded: true,
  exports: { createAskNotificationContinuation: async () => null },
};

const { evaluateRefinanceRateMonitors } = require('../../src/refinanceRadar/refinanceRateMonitor.service.ts');

function baseMonitor(overrides) {
  return {
    id: 'monitor-1', userId: 'user-1', propertyId: 'property-1',
    product: 'FIXED_30_YEAR', thresholdBps: 600, channel: 'EMAIL', cadence: 'IMMEDIATE',
    quietStart: null, quietEnd: null, timezone: 'UTC', status: 'ACTIVE',
    consentedAt: new Date(), confirmationVersion: 1,
    lastEvaluatedSnapshotId: null, lastTriggeredSnapshotId: null, lastTriggeredAt: null, lastTriggeredRateBps: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function snapshot(overrides) {
  return { id: 'snapshot-1', date: '2026-08-11', rate30yr: 5.9, rate15yr: 5.5, source: 'test-source', sourceRef: null, ...overrides };
}

test.beforeEach(() => {
  monitors = [];
  updates = [];
  notifications = [];
});

test('a never-triggered monitor fires immediately once under threshold', async () => {
  monitors = [baseMonitor()];
  const result = await evaluateRefinanceRateMonitors(snapshot());
  assert.equal(result.triggered, 1);
  assert.equal(notifications.length, 1);
  assert.equal(updates[0].data.lastTriggeredRateBps, 590);
});

test('re-evaluating the same snapshot never re-fires (existing dedup)', async () => {
  monitors = [baseMonitor({ lastTriggeredSnapshotId: 'snapshot-1', lastTriggeredAt: new Date(), lastTriggeredRateBps: 590 })];
  const result = await evaluateRefinanceRateMonitors(snapshot({ id: 'snapshot-1' }));
  assert.equal(result.triggered, 0);
});

test('a new snapshot within the cooldown window does not re-fire even if the rate dropped materially', async () => {
  monitors = [baseMonitor({
    lastTriggeredSnapshotId: 'snapshot-1',
    lastTriggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    lastTriggeredRateBps: 590,
  })];
  const result = await evaluateRefinanceRateMonitors(snapshot({ id: 'snapshot-2', rate30yr: 5.7 })); // 20bps lower, well past materiality
  assert.equal(result.triggered, 0, 'cooldown must be a hard floor regardless of materiality');
  assert.equal(notifications.length, 0);
});

test('a new snapshot past cooldown but with no material rate movement does not re-fire', async () => {
  monitors = [baseMonitor({
    lastTriggeredSnapshotId: 'snapshot-1',
    lastTriggeredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago, past the 7-day cooldown
    lastTriggeredRateBps: 590,
  })];
  const result = await evaluateRefinanceRateMonitors(snapshot({ id: 'snapshot-2', rate30yr: 5.89 })); // only 1bps lower
  assert.equal(result.triggered, 0, 'still under threshold every week is not itself materiality');
});

test('a new snapshot past cooldown with a materially lower rate re-fires', async () => {
  monitors = [baseMonitor({
    lastTriggeredSnapshotId: 'snapshot-1',
    lastTriggeredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    lastTriggeredRateBps: 590,
  })];
  const result = await evaluateRefinanceRateMonitors(snapshot({ id: 'snapshot-2', rate30yr: 5.75 })); // 15bps lower
  assert.equal(result.triggered, 1);
  assert.equal(updates[0].data.lastTriggeredSnapshotId, 'snapshot-2');
  assert.equal(updates[0].data.lastTriggeredRateBps, 575);
});

test('a rate at or above threshold never fires regardless of cooldown/materiality state', async () => {
  monitors = [baseMonitor({ thresholdBps: 550 })];
  const result = await evaluateRefinanceRateMonitors(snapshot({ rate30yr: 5.9 }));
  assert.equal(result.triggered, 0);
});
