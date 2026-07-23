// apps/workers/tests/unit/reserveFundBalanceReminderJob.test.js
//
// W4 item 4: reserveFundBalanceReminderJob had no dedicated test. Covers
// the 45-day-stale-contribution gate, Property Context applicability
// suppression, per-fund error isolation (already present), and locks the
// category/urgency notification contract explicitly — hardcoded
// category/urgency literals are this project's recurring bug class
// (category-bleed muting unrelated notifications, implicit cadence
// fallthrough), so asserting them directly here guards against a future
// refactor silently dropping them.
//
// W4 item 1 (DI refactor): this job now accepts its dependencies as a
// plain argument (see ReserveFundBalanceReminderDeps in the job file), so
// tests inject fakes directly instead of swapping require.cache entries —
// no ts-node module-cache surgery, no risk of a transitively-cached stale
// mock (the exact bug class documented in this project's W6 session notes).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { reserveFundBalanceReminderJob } = require('../../src/jobs/reserveFundBalanceReminder.job.ts');

const STALE_BALANCE_DAYS = 45;
const NOW = new Date('2026-07-20T00:00:00Z');
const STALE_DATE = new Date(NOW.getTime() - (STALE_BALANCE_DAYS + 5) * 24 * 60 * 60 * 1000);
const RECENT_DATE = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);

function fundFixture(overrides = {}) {
  return {
    id: 'fund-1',
    propertyId: 'property-1',
    createdAt: STALE_DATE,
    homeownerProfile: { userId: 'user-1' },
    contributions: [],
    ...overrides,
  };
}

function fakeDeps({ funds, contextAllowed = true, notifyShouldThrow = false }) {
  const calls = { notifications: [] };
  const deps = {
    prisma: {
      homeReserveFund: { findMany: async () => funds },
    },
    notificationService: {
      create: async (input) => {
        calls.notifications.push(input);
        if (notifyShouldThrow) throw new Error('notify failed');
        return { id: 'notification-1' };
      },
    },
    logger: { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } },
    checkReserveFundWorkerContext: async () => ({
      allowed: contextAllowed,
      reasonCodes: contextAllowed ? [] : ['TEST_BLOCKED'],
    }),
  };
  return { deps, calls };
}

test('notifies a fund whose last contribution is older than the stale-balance cutoff', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ contributions: [{ occurredAt: STALE_DATE }] })],
  });

  await reserveFundBalanceReminderJob(deps);

  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].category, 'GENERAL');
  assert.equal(calls.notifications[0].urgency, 'ROUTINE');
  assert.equal(calls.notifications[0].type, 'RESERVE_FUND_BALANCE_REMINDER');
});

test('does not notify a fund with a recent contribution', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ contributions: [{ occurredAt: RECENT_DATE }] })],
  });

  await reserveFundBalanceReminderJob(deps);

  assert.equal(calls.notifications.length, 0);
});

test('falls back to createdAt when a fund has zero contributions, and uses the no-contributions message', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ createdAt: STALE_DATE, contributions: [] })],
  });

  await reserveFundBalanceReminderJob(deps);

  assert.equal(calls.notifications.length, 1);
  assert.match(calls.notifications[0].message, /haven't logged any contributions/);
});

test('a fund created recently with zero contributions is not notified yet', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ createdAt: RECENT_DATE, contributions: [] })],
  });

  await reserveFundBalanceReminderJob(deps);

  assert.equal(calls.notifications.length, 0);
});

test('skips a fund with no linked homeowner user id', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ homeownerProfile: null })],
  });

  await reserveFundBalanceReminderJob(deps);

  assert.equal(calls.notifications.length, 0);
});

test('skips (does not throw) when Property Context applicability is not allowed', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture()],
    contextAllowed: false,
  });

  await assert.doesNotReject(() => reserveFundBalanceReminderJob(deps));
  assert.equal(calls.notifications.length, 0);
});

test('one fund failing to notify does not abort the run for the rest of the batch', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ id: 'fund-1' }), fundFixture({ id: 'fund-2' })],
    notifyShouldThrow: true,
  });

  await assert.doesNotReject(() => reserveFundBalanceReminderJob(deps));
  assert.equal(calls.notifications.length, 2, 'both must still be attempted even though notify throws for each');
});
