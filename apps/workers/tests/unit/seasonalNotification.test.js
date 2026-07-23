// apps/workers/tests/unit/seasonalNotification.test.js
//
// WKR-002: seasonalNotification.job.ts previously read a legacy
// PropertyClimateSetting flag and called the SMTP transport (sendEmail)
// directly, bypassing every preference/cadence/quiet-hours/dedup control.
// It also included a non-existent `property.user` Prisma relation, so it
// would have thrown on its very first query. This verifies the fix: no
// direct channel-transport call anywhere in the file, and a real
// NotificationService.create call with transportEnabled threaded from
// WORKER_OUTBOUND_NOTIFICATIONS_ENABLED.
//
// W4 item 1 (DI refactor): dependencies are injected directly (see
// SeasonalNotificationDeps in the job file) instead of via require.cache.
// areWorkerOutboundNotificationsEnabled is still the real implementation
// (it's a pure env-var read, and one test below exercises that real
// env-reading behavior directly), not a fake.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const JOB_FILE = path.resolve(__dirname, '../../src/jobs/seasonalNotification.job.ts');
const { sendSeasonalNotifications } = require(JOB_FILE);
const { areWorkerOutboundNotificationsEnabled } = require('../../../backend/src/config/workerExecutionPolicy.ts');

test('never calls a channel transport directly (governance bypass regression guard)', () => {
  const source = fs.readFileSync(JOB_FILE, 'utf8');
  assert.doesNotMatch(source, /\bsendEmail\s*\(/, 'seasonalNotification.job.ts must not call sendEmail directly — route through NotificationService.create');
  assert.match(source, /notificationService\.create\(/);
  assert.match(source, /transportEnabled/);
  assert.match(source, /areWorkerOutboundNotificationsEnabled/);
});

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({
  checklists,
  climateSetting = { notificationEnabled: true },
  createImpl,
  dismissedActionKeys = [],
  activeSnoozeActionKeys = [],
}) {
  const calls = {
    orchestrationActionEventFindFirst: [],
    orchestrationActionSnoozeFindFirst: [],
    notifications: [],
  };

  const prisma = {
    seasonalChecklist: {
      findMany: async () => checklists,
      update: async () => ({}),
    },
    propertyClimateSetting: {
      findUnique: async () => climateSetting,
    },
    // Backs isSeasonalChecklistActionSuppressed()'s check against the same
    // dismiss/snooze records the canonical seasonal Home Action itself uses
    // (homeActionSourcePromotion.service.ts) — defaults to "not suppressed".
    orchestrationActionEvent: {
      findFirst: async ({ where }) => {
        calls.orchestrationActionEventFindFirst.push(where);
        return dismissedActionKeys.includes(where.actionKey) ? { id: 'event-1' } : null;
      },
    },
    orchestrationActionSnooze: {
      findFirst: async ({ where }) => {
        calls.orchestrationActionSnoozeFindFirst.push(where);
        return activeSnoozeActionKeys.includes(where.actionKey) ? { id: 'snooze-1' } : null;
      },
    },
  };

  const notificationService = {
    create: async (input) => {
      calls.notifications.push(input);
      if (createImpl) return createImpl(input);
      return { id: 'notification-1' };
    },
  };

  const deps = {
    prisma,
    logger: noopLogger,
    notificationService,
    areWorkerOutboundNotificationsEnabled,
    evaluateSeasonalTemplateApplicability: () => ({ status: 'APPLICABLE' }),
    buildSeasonalPropertyContext: () => ({}),
  };
  return { deps, calls };
}

function checklist(overrides = {}) {
  return {
    id: 'checklist-1',
    propertyId: 'property-1',
    season: 'WINTER',
    year: 2026,
    seasonStartDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    property: {
      homeownerProfile: { userId: 'user-1' },
      exteriorProfile: null,
      responsibilities: [],
      inventoryItems: [],
      maintenanceTasks: [],
    },
    items: [
      { taskKey: 'winterize-hose-bibs', priority: 'CRITICAL', seasonalTaskTemplate: {} },
      { taskKey: 'gutter-check', priority: 'RECOMMENDED', seasonalTaskTemplate: {} },
    ],
    ...overrides,
  };
}

test('creates one governed notification per checklist with property-scoped actionUrl', async () => {
  delete process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED;
  const { deps, calls } = fakeDeps({ checklists: [checklist()] });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].userId, 'user-1');
  assert.equal(calls.notifications[0].category, 'MAINTENANCE');
  assert.equal(calls.notifications[0].urgency, 'MATERIAL'); // one CRITICAL item present
  assert.equal(calls.notifications[0].actionUrl, '/dashboard/seasonal?propertyId=property-1');
  assert.equal(calls.notifications[0].transportEnabled, false); // default
});

test('respects an explicit PropertyClimateSetting opt-out', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist()],
    climateSetting: { notificationEnabled: false },
  });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 0);
});

test('skips a checklist whose property has no homeowner', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist({ property: { ...checklist().property, homeownerProfile: null } })],
  });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 0);
});

test('threads WORKER_OUTBOUND_NOTIFICATIONS_ENABLED into transportEnabled', async () => {
  process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED = 'true';
  const { deps, calls } = fakeDeps({ checklists: [checklist()] });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications[0].transportEnabled, true);
  delete process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED;
});

test('WKR-008: returns a WorkerRunResult-shaped outcome the scheduler can classify', async () => {
  const { deps } = fakeDeps({ checklists: [checklist()] });

  const result = await sendSeasonalNotifications(deps);

  assert.equal(result.examined, 1);
  assert.equal(result.notified, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
});

test('WKR-008: isolates a per-checklist failure and reports it in `failed`', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist({ id: 'checklist-1', propertyId: 'property-1' }), checklist({ id: 'checklist-2', propertyId: 'property-2' })],
    createImpl: async (input) => {
      if (input.entityId === 'checklist-1') throw new Error('boom');
      return { id: 'notification-2' };
    },
  });

  const result = await sendSeasonalNotifications(deps);

  assert.equal(result.examined, 2);
  assert.equal(result.notified, 1);
  assert.equal(result.failed, 1);
  assert.equal(calls.notifications.length, 2);
});

test('does not notify when the canonical seasonal Home Action was dismissed', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist()],
    dismissedActionKeys: ['seasonal-checklist:checklist-1'],
  });

  const result = await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(calls.orchestrationActionEventFindFirst[0].actionKey, 'seasonal-checklist:checklist-1');
  assert.equal(calls.orchestrationActionEventFindFirst[0].propertyId, 'property-1');
});

test('does not notify when the canonical seasonal Home Action is actively snoozed', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist()],
    activeSnoozeActionKeys: ['seasonal-checklist:checklist-1'],
  });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 0);
});

test('notifies normally when there is no dismiss/snooze record for this checklist', async () => {
  const { deps, calls } = fakeDeps({
    checklists: [checklist()],
    dismissedActionKeys: ['seasonal-checklist:some-other-checklist'],
    activeSnoozeActionKeys: ['seasonal-checklist:some-other-checklist'],
  });

  await sendSeasonalNotifications(deps);

  assert.equal(calls.notifications.length, 1);
});
