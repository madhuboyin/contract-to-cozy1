// apps/workers/tests/unit/permitInspectionReminderDryRun.test.js
//
// W6 item 5: permit-inspection-reminders is one of the 4 lowest-risk
// representative jobs (one per customerJob domain) wired for controlled
// smoke validation. Covers: dry-run skips all writes but still counts what
// would happen; a scoped propertyId is both applied as a query filter and
// independently re-checked against the operator allowlist; and a real
// scoped run tags its Notification with a smokeCorrelationId so it can be
// found and cleaned up by exact ID afterward.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { permitInspectionReminderJob } = require('../../src/jobs/permitInspectionReminder.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ milestones, contextAllowed = true }) {
  const findManyCalls = [];
  const createCalls = [];
  const updateCalls = [];

  const deps = {
    prisma: {
      permitInspectionMilestone: {
        findMany: async (args) => {
          findManyCalls.push(args);
          return milestones;
        },
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
    checkPermitWorkerContext: async () => ({ allowed: contextAllowed, contextVersion: 'v1', userId: 'user-1', reasonCodes: [] }),
    logger: noopLogger,
  };

  return {
    deps,
    getFindManyCalls: () => findManyCalls,
    getCreateCalls: () => createCalls,
    getUpdateCalls: () => updateCalls,
  };
}

function milestone(overrides = {}) {
  return {
    id: 'milestone-1',
    propertyId: 'property-allowed',
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

test('dry run: examines and counts milestones but sends no notification and updates nothing', async () => {
  const { deps, getCreateCalls, getUpdateCalls } = fakeDeps({ milestones: [milestone()] });

  const result = await permitInspectionReminderJob({ dryRun: true }, deps);

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
  assert.deepEqual(result, { examined: 1, notified: 1, skipped: 0, failed: 0, smokeCorrelationId: undefined });
});

test('no opts (the daily cron tick): behaves exactly like a real run', async () => {
  const { deps, getCreateCalls } = fakeDeps({ milestones: [milestone()] });

  const result = await permitInspectionReminderJob(undefined, deps);

  assert.equal(getCreateCalls().length, 1);
  assert.equal(result.notified, 1);
});

test('a scoped propertyId is applied as a query filter', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, getFindManyCalls } = fakeDeps({ milestones: [milestone()] });

    await permitInspectionReminderJob({ dryRun: true, propertyId: 'property-allowed' }, deps);

    assert.equal(getFindManyCalls()[0].where.propertyId, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps, getFindManyCalls } = fakeDeps({ milestones: [milestone()] });

    await assert.rejects(
      () => permitInspectionReminderJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
    assert.equal(getFindManyCalls().length, 0, 'must reject before querying, not after');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a real scoped run tags the created Notification with a smokeCorrelationId', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, getCreateCalls } = fakeDeps({ milestones: [milestone()] });

    const result = await permitInspectionReminderJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.equal(getCreateCalls().length, 1);
    assert.match(getCreateCalls()[0].metadata.smokeCorrelationId, /^smoke:permit-inspection-reminders:/);
    assert.equal(result.smokeCorrelationId, getCreateCalls()[0].metadata.smokeCorrelationId);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing — only a scoped smoke run gets a correlation ID', async () => {
  const { deps, getCreateCalls } = fakeDeps({ milestones: [milestone()] });

  const result = await permitInspectionReminderJob(undefined, deps);

  assert.equal(getCreateCalls()[0].metadata.smokeCorrelationId, undefined);
  assert.equal(result.smokeCorrelationId, undefined);
});
