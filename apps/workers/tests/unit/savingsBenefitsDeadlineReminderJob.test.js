const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { savingsBenefitsDeadlineReminderJob } = require('../../src/jobs/savingsBenefitsDeadlineReminder.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({
  matches,
  throwsForEntityId = null,
  suppressesEntityId = null,
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
      notificationPreference: {
        findMany: async () => preferences,
      },
      propertyHiddenAssetMatch: {
        findMany: async () => matches,
        update: async (args) => {
          updateCalls.push(args);
          return {};
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
  return {
    id: 'match-1',
    propertyId: 'property-1',
    property: {
      address: '1 Main St',
      city: 'Trenton',
      homeownerProfile: { userId: 'user-1' },
    },
    program: {
      name: 'Senior Freeze',
      applicationWindowClosesAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    estimatedValueMin: 250,
    estimatedValueMax: 500,
    ...overrides,
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
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(getUpdateCalls()[0].data.notificationSentAt instanceof Date, true);
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
  assert.equal(getUpdateCalls().length, 0);
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
