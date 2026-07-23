// apps/workers/tests/unit/permitInspectionReminderJob.test.js
//
// W3 (permits):
//   1. Category/urgency fix — the reminder previously left category/urgency
//      unset, which meant notificationPreference.service.ts inferred
//      'MAINTENANCE' from the type string (same bucket as routine seasonal
//      nudges) and ROUTINE urgency, so this real 3-day inspection deadline
//      defaulted to weekly-digest cadence and could be silently muted
//      alongside generic maintenance chatter. Now explicit MATERIAL_DEADLINE
//      / MATERIAL.
//   2. Error isolation — checkPermitWorkerContext() was outside the
//      milestone loop's try/catch, so one milestone throwing aborted every
//      remaining milestone across every other property for the whole run.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { permitInspectionReminderJob } = require('../../src/jobs/permitInspectionReminder.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ milestones, contextAllowed = true, contextThrowsFor = null }) {
  const createCalls = [];
  const updateCalls = [];

  const deps = {
    prisma: {
      permitInspectionMilestone: {
        findMany: async () => milestones,
        update: async (args) => {
          updateCalls.push(args);
          return {};
        },
      },
    },
    notificationService: {
      create: async (input) => {
        createCalls.push(input);
        return { id: `notification-${createCalls.length}` };
      },
    },
    checkPermitWorkerContext: async (propertyId) => {
      if (contextThrowsFor && contextThrowsFor === propertyId) {
        throw new Error('context lookup exploded');
      }
      return { allowed: contextAllowed, contextVersion: 'v1', userId: 'user-1', reasonCodes: [] };
    },
    logger: noopLogger,
  };

  return { deps, getCreateCalls: () => createCalls, getUpdateCalls: () => updateCalls };
}

function milestone(overrides = {}) {
  return {
    id: 'milestone-1',
    propertyId: 'property-1',
    stageName: 'Rough-In',
    scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    property: {
      address: '1 Main St',
      city: 'Plainsboro',
      homeownerProfile: { userId: 'user-1' },
    },
    permitRecord: { category: 'ELECTRICAL', permitNumber: 'P-123', workTypes: ['ELECTRICAL_WIRING'] },
    ...overrides,
  };
}

test('sends the reminder with MATERIAL_DEADLINE category and MATERIAL urgency', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({ milestones: [milestone()] });

  await permitInspectionReminderJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'MATERIAL_DEADLINE');
  assert.equal(calls[0].urgency, 'MATERIAL');
  assert.equal(getUpdateCalls().length, 1);
  assert.equal(getUpdateCalls()[0].data.notificationSentAt instanceof Date, true);
});

test('a context-check exception for one milestone does not abort the rest of the run (regression guard)', async () => {
  const milestones = [
    milestone({ id: 'milestone-broken', propertyId: 'property-broken' }),
    milestone({ id: 'milestone-ok', propertyId: 'property-ok' }),
  ];
  const { deps, getCreateCalls } = fakeDeps({ milestones, contextThrowsFor: 'property-broken' });

  await permitInspectionReminderJob(undefined, deps);

  const calls = getCreateCalls();
  assert.equal(calls.length, 1, 'the healthy milestone after the broken one must still be notified');
  assert.equal(calls[0].entityId, 'milestone-ok');
});

test('skips when property context is not applicable', async () => {
  const { deps, getCreateCalls } = fakeDeps({ milestones: [milestone()], contextAllowed: false });

  await permitInspectionReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
});

test('skips a milestone with no homeowner', async () => {
  const { deps, getCreateCalls } = fakeDeps({
    milestones: [milestone({ property: { address: '1 Main St', city: 'X', homeownerProfile: null } })],
  });

  await permitInspectionReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 0);
});
