const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { savingsBenefitsDeadlineReminderJob } = require('../../src/jobs/savingsBenefitsDeadlineReminder.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({
  matches,
  throwsForEntityId = null,
  suppressesEntityId = null,
  unclaimableEntityIds = [],
  existingNotificationEntityIds = [],
  preferences = [{
    scopeKey: 'GLOBAL',
    enabled: true,
    cadence: 'IMMEDIATE',
    minimumValue: 0,
    deadlineLeadDays: 14,
  }],
}) {
  const createCalls = [];
  const updateCalls = [];

  const deps = {
    prisma: {
      notification: {
        findFirst: async ({ where }) =>
          existingNotificationEntityIds.includes(where.entityId)
            ? { id: `existing-${where.entityId}` }
            : null,
      },
      notificationPreference: {
        findMany: async () => preferences,
      },
      propertyHiddenAssetMatch: {
        findMany: async () => matches,
        updateMany: async (args) => {
          updateCalls.push(args);
          if (
            args.data.notificationClaimedAt instanceof Date
            && unclaimableEntityIds.includes(args.where.id)
          ) {
            return { count: 0 };
          }
          return { count: 1 };
        },
      },
    },
    notificationService: {
      create: async (input) => {
        if (throwsForEntityId && input.entityId === throwsForEntityId) {
          throw new Error('notification service exploded');
        }
        if (suppressesEntityId && input.entityId === suppressesEntityId) {
          return null;
        }
        createCalls.push(input);
        return { id: `notification-${createCalls.length}` };
      },
    },
    logger: noopLogger,
  };

  return { deps, getCreateCalls: () => createCalls, getUpdateCalls: () => updateCalls };
}

function match(overrides = {}) {
  const program = {
    name: 'Senior Freeze',
    sourceUrl: 'https://agency.gov/senior-freeze',
    lastVerifiedAt: new Date(),
    isActive: true,
    reviewStatus: 'PUBLISHED',
    expiresAt: null,
    fundingStatus: 'OPEN',
    applicationWindowOpensAt: null,
    applicationWindowClosesAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    source: {
      status: 'ACTIVE',
      officialUrl: 'https://agency.gov',
      lastReviewedAt: new Date(),
      reviewSlaDays: 180,
      version: 1,
      reviewedVersion: 1,
    },
    ...(overrides.program ?? {}),
  };
  return {
    id: 'match-1',
    propertyId: 'property-1',
    property: {
      address: '1 Main St',
      city: 'Trenton',
      homeownerProfile: { userId: 'user-1' },
    },
    program,
    estimatedValueMin: 250,
    estimatedValueMax: 500,
    ...overrides,
    program,
  };
}

test('sends the reminder with category-specific consent and MATERIAL urgency, then marks notificationSentAt', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({ matches: [match()] });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'SAVINGS_BENEFITS');
  assert.equal(calls[0].urgency, 'MATERIAL');
  assert.equal(calls[0].entityType, 'PropertyHiddenAssetMatch');
  assert.equal(calls[0].entityId, 'match-1');
  assert.match(calls[0].actionUrl, /\/tools\/savings-benefits$/);
  assert.equal(getUpdateCalls().length, 2);
  assert.equal(getUpdateCalls()[0].data.notificationClaimedAt instanceof Date, true);
  assert.equal(getUpdateCalls()[1].data.notificationSentAt instanceof Date, true);
  assert.equal(getUpdateCalls()[1].data.notificationClaimedAt, null);
  assert.equal(result.notified, 1);
});

test('one match throwing does not abort the rest of the run', async () => {
  const matches = [
    match({ id: 'match-broken' }),
    match({ id: 'match-ok' }),
  ];
  const { deps, getCreateCalls } = fakeDeps({ matches, throwsForEntityId: 'match-broken' });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1, 'the healthy match after the broken one must still be notified');
  assert.equal(calls[0].entityId, 'match-ok');
  assert.equal(result.failed, 1);
  assert.equal(result.notified, 1);
});

test('skips a match with no homeowner', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({ property: { address: '1 Main St', city: 'X', homeownerProfile: null } })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('skips a match whose program has no applicationWindowClosesAt', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({ program: { name: 'Senior Freeze', applicationWindowClosesAt: null } })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('skips a match whose reviewed program is no longer actionable', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({ program: { fundingStatus: 'CLOSED' } })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('skips a match when its source review has become stale', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({
      program: {
        source: {
          status: 'ACTIVE',
          officialUrl: 'https://agency.gov',
          lastReviewedAt: new Date('2020-01-01T00:00:00.000Z'),
          reviewSlaDays: 180,
          version: 1,
          reviewedVersion: 1,
        },
      },
    })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('skips a match when the program verification has become stale', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({
      program: {
        lastVerifiedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('skips a match before its application window opens', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [match({
      program: {
        applicationWindowOpensAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('dry run reports what would be sent without creating a notification or updating the match', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({ matches: [match()] });

  const result = await savingsBenefitsDeadlineReminderJob({ dryRun: true }, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
  assert.equal(result.notified, 1);
});

test('a context-suppressed notification stays retryable and is not marked sent', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    matches: [match()],
    suppressesEntityId: 'match-1',
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 2, 'a suppressed notification releases its claim');
  assert.equal(getUpdateCalls()[1].data.notificationClaimedAt, null);
  assert.equal(result.notified, 0);
  assert.equal(result.skipped, 1);
});

test('does not send without an explicit Savings & Benefits reminder preference', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    matches: [match()],
    preferences: [],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
  assert.equal(result.skipped, 1);
});

test('a concurrent worker that cannot acquire the reminder claim does not send', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    matches: [match()],
    unclaimableEntityIds: ['match-1'],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(result.skipped, 1);
});

test('reconciles a notification created before a prior worker crashed instead of sending again', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({
    matches: [match()],
    existingNotificationEntityIds: ['match-1'],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 2);
  assert.equal(getUpdateCalls()[1].data.notificationSentAt instanceof Date, true);
  assert.equal(result.skipped, 1);
});

test('honors homeowner deadline lead-time and minimum-value controls', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    matches: [
      match({
        id: 'too-early',
        program: {
          name: 'Early window',
          applicationWindowClosesAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        },
      }),
      match({ id: 'too-small', estimatedValueMax: 100 }),
      match({ id: 'eligible', estimatedValueMax: 750 }),
    ],
    preferences: [{
      scopeKey: 'GLOBAL',
      enabled: true,
      cadence: 'IMMEDIATE',
      minimumValue: 500,
      deadlineLeadDays: 10,
    }],
  });

  const result = await savingsBenefitsDeadlineReminderJob(undefined, deps);

  assert.deepEqual(getCreateCalls().map((call) => call.entityId), ['eligible']);
  assert.equal(result.notified, 1);
  assert.equal(result.skipped, 2);
});
