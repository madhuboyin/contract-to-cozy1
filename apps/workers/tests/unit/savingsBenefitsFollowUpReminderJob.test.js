const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  savingsBenefitsFollowUpReminderJob,
} = require('../../src/jobs/savingsBenefitsFollowUpReminder.job.ts');

function dependencies({ enabled = true, existingFollowUpAt = null } = {}) {
  const writes = [];
  const notifications = [];
  return {
    writes,
    notifications,
    deps: {
      prisma: {
        savingsBenefitAction: {
          findMany: async () => [{
            id: 'action-1',
            propertyId: 'property-1',
            state: 'STARTED',
            followUpAt: new Date('2026-01-01T00:00:00Z'),
          }],
          updateMany: async (args) => {
            writes.push(args);
            return { count: 1 };
          },
        },
        property: {
          findUnique: async () => ({ homeownerProfile: { userId: 'user-1' } }),
        },
        notificationPreference: {
          findMany: async () => [{
            scopeKey: 'PROPERTY:property-1',
            enabled,
            cadence: enabled ? 'IMMEDIATE' : 'MUTED',
          }],
        },
        notification: {
          findFirst: async ({ where }) =>
            existingFollowUpAt === where.metadata.equals ? { id: 'notification-1' } : null,
        },
      },
      notificationService: {
        create: async (input) => {
          notifications.push(input);
          return { id: 'notification-1' };
        },
      },
      logger: { error: () => undefined },
    },
  };
}

test('claims, creates, and durably marks one due follow-up notification', async () => {
  const fixture = dependencies();
  const result = await savingsBenefitsFollowUpReminderJob(undefined, fixture.deps);
  assert.deepEqual(result, { examined: 1, notified: 1, skipped: 0, failed: 0 });
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].type, 'SAVINGS_BENEFIT_ACTION_FOLLOW_UP');
  assert.equal(fixture.notifications[0].metadata.followUpAt, '2026-01-01T00:00:00.000Z');
  assert.equal(fixture.writes.length, 2);
  assert.ok(fixture.writes[1].data.followUpNotificationSentAt instanceof Date);
});

test('honors explicit homeowner notification preference and does not claim', async () => {
  const fixture = dependencies({ enabled: false });
  const result = await savingsBenefitsFollowUpReminderJob(undefined, fixture.deps);
  assert.deepEqual(result, { examined: 1, notified: 0, skipped: 1, failed: 0 });
  assert.equal(fixture.notifications.length, 0);
  assert.equal(fixture.writes.length, 0);
});

test('reconciles an existing durable notification without sending a duplicate', async () => {
  const fixture = dependencies({ existingFollowUpAt: '2026-01-01T00:00:00.000Z' });
  const result = await savingsBenefitsFollowUpReminderJob(undefined, fixture.deps);
  assert.equal(result.notified, 1);
  assert.equal(fixture.notifications.length, 0);
  assert.equal(fixture.writes.length, 2);
});

test('a rescheduled occurrence creates a new notification for the new follow-up time', async () => {
  const fixture = dependencies({ existingFollowUpAt: '2025-12-01T00:00:00.000Z' });
  const result = await savingsBenefitsFollowUpReminderJob(undefined, fixture.deps);
  assert.equal(result.notified, 1);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].metadata.followUpAt, '2026-01-01T00:00:00.000Z');
});
