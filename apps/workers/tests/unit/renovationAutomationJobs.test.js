const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  renovationAdvisorSessionExpiryJob,
} = require('../../src/jobs/renovationAdvisorSessionExpiry.job.ts');
const {
  renovationPermitRequirementReminderJob,
} = require('../../src/jobs/renovationPermitRequirementReminder.job.ts');

const fixedNow = new Date('2026-07-29T12:00:00.000Z');
const noopLogger = {
  info() {}, warn() {}, error() {}, debug() {}, fatal() {},
  child() { return this; },
};

test('session expiry archives every due advisor session and supports dry-run', async () => {
  const calls = [];
  const deps = {
    now: () => fixedNow,
    prisma: {
      homeRenovationAdvisorSession: {
        count: async () => 3,
        updateMany: async (args) => {
          calls.push(args);
          return { count: 3 };
        },
      },
    },
  };

  const dryRun = await renovationAdvisorSessionExpiryJob({ dryRun: true }, deps);
  assert.deepEqual(dryRun, { examined: 3, updated: 0, skipped: 3, failed: 0 });
  assert.equal(calls.length, 0);

  const result = await renovationAdvisorSessionExpiryJob(undefined, deps);
  assert.equal(result.updated, 3);
  assert.equal(calls[0].data.status, 'ARCHIVED');
  assert.equal(calls[0].data.archivedAt, fixedNow);
  assert.equal(calls[0].where.sessionExpiresAt.lte, fixedNow);
});

function requirement(overrides = {}) {
  return {
    id: 'requirement-1',
    propertyId: 'property-1',
    question: 'Does this scope require a permit?',
    dueAt: new Date('2026-07-31T12:00:00.000Z'),
    ownerUserId: 'owner-1',
    renovationCase: {
      id: 'case-1',
      name: 'Kitchen remodel',
      createdByUserId: 'creator-1',
    },
    property: {
      homeownerProfile: { userId: 'homeowner-1' },
    },
    ...overrides,
  };
}

test('permit requirement reminder creates a stable durable notification identity', async () => {
  const notifications = [];
  const deps = {
    now: () => fixedNow,
    logger: noopLogger,
    prisma: {
      renovationRequirement: {
        findMany: async () => [requirement()],
      },
    },
    notificationService: {
      create: async (input) => {
        notifications.push(input);
        return { id: 'notification-1' };
      },
    },
  };

  const result = await renovationPermitRequirementReminderJob(undefined, deps);

  assert.equal(result.notified, 1);
  assert.equal(notifications[0].deduplicationKey, 'renovation-permit-requirement:requirement-1:2026-07-31');
  assert.equal(notifications[0].category, 'MATERIAL_DEADLINE');
  assert.equal(notifications[0].metadata.renovationAutomation, true);
  assert.match(notifications[0].actionUrl, /renovations\/case-1\/requirements$/);
});

test('permit requirement reminder isolates missing recipients and notification failures', async () => {
  const deps = {
    now: () => fixedNow,
    logger: noopLogger,
    prisma: {
      renovationRequirement: {
        findMany: async () => [
          requirement({
            id: 'no-recipient',
            ownerUserId: null,
            renovationCase: { id: 'case-1', name: 'One', createdByUserId: null },
            property: { homeownerProfile: null },
          }),
          requirement({ id: 'delivery-fails' }),
        ],
      },
    },
    notificationService: {
      create: async () => { throw new Error('database unavailable'); },
    },
  };

  const result = await renovationPermitRequirementReminderJob(undefined, deps);
  assert.equal(result.examined, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 1);
});
