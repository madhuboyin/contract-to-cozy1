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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const JOB_FILE = path.resolve(__dirname, '../../src/jobs/seasonalNotification.job.ts');

test('never calls a channel transport directly (governance bypass regression guard)', () => {
  const source = fs.readFileSync(JOB_FILE, 'utf8');
  assert.doesNotMatch(source, /\bsendEmail\s*\(/, 'seasonalNotification.job.ts must not call sendEmail directly — route through NotificationService.create');
  assert.match(source, /NotificationService\.create\(/);
  assert.match(source, /transportEnabled/);
  assert.match(source, /areWorkerOutboundNotificationsEnabled/);
});

function loadJob({ checklists, climateSetting = { notificationEnabled: true } }) {
  const prismaMock = {
    seasonalChecklist: {
      findMany: async () => checklists,
      update: async () => ({}),
    },
    propertyClimateSetting: {
      findUnique: async () => climateSetting,
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const createCalls = [];
  const notificationServicePath = require.resolve('../../../backend/src/services/notification.service.ts');
  require.cache[notificationServicePath] = {
    id: notificationServicePath,
    filename: notificationServicePath,
    loaded: true,
    exports: {
      NotificationService: {
        create: async (input) => {
          createCalls.push(input);
          return { id: 'notification-1' };
        },
      },
    },
  };

  const applicabilityPath = require.resolve('../../../backend/src/services/seasonal/applicabilityPolicy.ts');
  require.cache[applicabilityPath] = {
    id: applicabilityPath,
    filename: applicabilityPath,
    loaded: true,
    exports: { evaluateSeasonalTemplateApplicability: () => ({ status: 'APPLICABLE' }) },
  };

  const checklistGenPath = require.resolve('../../src/jobs/seasonalChecklistGeneration.job.ts');
  require.cache[checklistGenPath] = {
    id: checklistGenPath,
    filename: checklistGenPath,
    loaded: true,
    exports: { buildSeasonalPropertyContext: () => ({}) },
  };

  delete require.cache[JOB_FILE];
  return { job: require(JOB_FILE), getCreateCalls: () => createCalls };
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
  const { job, getCreateCalls } = loadJob({ checklists: [checklist()] });

  await job.sendSeasonalNotifications();

  const calls = getCreateCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].category, 'MAINTENANCE');
  assert.equal(calls[0].urgency, 'MATERIAL'); // one CRITICAL item present
  assert.equal(calls[0].actionUrl, '/dashboard/seasonal?propertyId=property-1');
  assert.equal(calls[0].transportEnabled, false); // default
});

test('respects an explicit PropertyClimateSetting opt-out', async () => {
  const { job, getCreateCalls } = loadJob({
    checklists: [checklist()],
    climateSetting: { notificationEnabled: false },
  });

  await job.sendSeasonalNotifications();

  assert.equal(getCreateCalls().length, 0);
});

test('skips a checklist whose property has no homeowner', async () => {
  const { job, getCreateCalls } = loadJob({
    checklists: [checklist({ property: { ...checklist().property, homeownerProfile: null } })],
  });

  await job.sendSeasonalNotifications();

  assert.equal(getCreateCalls().length, 0);
});

test('threads WORKER_OUTBOUND_NOTIFICATIONS_ENABLED into transportEnabled', async () => {
  process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED = 'true';
  const { job, getCreateCalls } = loadJob({ checklists: [checklist()] });

  await job.sendSeasonalNotifications();

  assert.equal(getCreateCalls()[0].transportEnabled, true);
  delete process.env.WORKER_OUTBOUND_NOTIFICATIONS_ENABLED;
});
