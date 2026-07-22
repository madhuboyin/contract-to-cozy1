// apps/workers/tests/unit/permitInspectionReminderDryRun.test.js
//
// W6 item 5: permit-inspection-reminders is one of the 4 lowest-risk
// representative jobs (one per customerJob domain) wired for controlled
// smoke validation. Covers: dry-run skips all writes but still counts what
// would happen; a scoped propertyId is both applied as a query filter and
// independently re-checked against the operator allowlist; and a real
// scoped run tags its Notification with a smokeCorrelationId so it can be
// found and cleaned up by exact ID afterward.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

function loadJob({ milestones, contextAllowed = true }) {
  const findManyCalls = [];
  const createCalls = [];
  const updateCalls = [];

  const prismaMock = {
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
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          return { id: `notification-${createCalls.length}` };
        },
      },
    },
  };

  const contextServicePath = require.resolve('../../../backend/src/services/projectCompliance/permitWorkerContext.service.ts');
  require.cache[contextServicePath] = {
    id: contextServicePath,
    filename: contextServicePath,
    loaded: true,
    exports: {
      checkPermitWorkerContext: async () => ({ allowed: contextAllowed, contextVersion: 'v1', userId: 'user-1', reasonCodes: [] }),
    },
  };

  const jobPath = require.resolve('../../src/jobs/permitInspectionReminder.job.ts');
  delete require.cache[jobPath];
  return {
    job: require(jobPath),
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
  const { job, getCreateCalls, getUpdateCalls } = loadJob({ milestones: [milestone()] });

  const result = await job.permitInspectionReminderJob({ dryRun: true });

  assert.equal(getCreateCalls().length, 0);
  assert.equal(getUpdateCalls().length, 0);
  assert.deepEqual(result, { examined: 1, notified: 1, skipped: 0, failed: 0, smokeCorrelationId: undefined });
});

test('no opts (the daily cron tick): behaves exactly like a real run', async () => {
  const { job, getCreateCalls } = loadJob({ milestones: [milestone()] });

  const result = await job.permitInspectionReminderJob();

  assert.equal(getCreateCalls().length, 1);
  assert.equal(result.notified, 1);
});

test('a scoped propertyId is applied as a query filter', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { job, getFindManyCalls } = loadJob({ milestones: [milestone()] });

    await job.permitInspectionReminderJob({ dryRun: true, propertyId: 'property-allowed' });

    assert.equal(getFindManyCalls()[0].where.propertyId, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { job, getFindManyCalls } = loadJob({ milestones: [milestone()] });

    await assert.rejects(
      () => job.permitInspectionReminderJob({ dryRun: true, propertyId: 'property-not-allowed' }),
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
    const { job, getCreateCalls } = loadJob({ milestones: [milestone()] });

    const result = await job.permitInspectionReminderJob({ dryRun: false, propertyId: 'property-allowed' });

    assert.equal(getCreateCalls().length, 1);
    assert.match(getCreateCalls()[0].metadata.smokeCorrelationId, /^smoke:permit-inspection-reminders:/);
    assert.equal(result.smokeCorrelationId, getCreateCalls()[0].metadata.smokeCorrelationId);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing — only a scoped smoke run gets a correlation ID', async () => {
  const { job, getCreateCalls } = loadJob({ milestones: [milestone()] });

  const result = await job.permitInspectionReminderJob();

  assert.equal(getCreateCalls()[0].metadata.smokeCorrelationId, undefined);
  assert.equal(result.smokeCorrelationId, undefined);
});
