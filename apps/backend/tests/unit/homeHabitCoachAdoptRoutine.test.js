const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 3: adoptHabit creates/links a recurring
// PropertyMaintenanceTask so a habit becomes real, tracked work only on
// adoption — idempotent on PropertyHabit.linkedMaintenanceTaskId.

const propertyAuthPath = require.resolve('../../src/services/propertyAccess.service.ts');
require.cache[propertyAuthPath] = {
  id: propertyAuthPath,
  filename: propertyAuthPath,
  loaded: true,
  exports: {
    resolvePropertyAccess: async () => ({ propertyId: 'property-1', role: 'CONTRIBUTOR' }),
    ROLE_RANK: { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 },
  },
};

const analyticsPath = require.resolve('../../src/services/analytics');
require.cache[analyticsPath] = {
  id: analyticsPath,
  filename: analyticsPath,
  loaded: true,
  exports: {
    analyticsEmitter: { track: () => {} },
    AnalyticsEvent: { MAINTENANCE_ITEM_CREATED: 'MAINTENANCE_ITEM_CREATED', MAINTENANCE_ITEM_COMPLETED: 'MAINTENANCE_ITEM_COMPLETED', ACTION_COMPLETED: 'ACTION_COMPLETED' },
    AnalyticsModule: { MAINTENANCE: 'MAINTENANCE', PROJECT_MGMT: 'PROJECT_MGMT' },
    AnalyticsFeature: { MAINTENANCE_TASK: 'MAINTENANCE_TASK', PROJECT_TRACKER: 'PROJECT_TRACKER' },
  },
};

const signalServicePath = require.resolve('../../src/services/signal.service.ts');
require.cache[signalServicePath] = {
  id: signalServicePath,
  filename: signalServicePath,
  loaded: true,
  exports: { signalService: { publishMaintenanceAdherenceSignal: async () => {} } },
};

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {} },
};

const radarPath = require.resolve('../../src/modules/homeEventRadar/services/radarPropertyReconciliation.service.ts');
require.cache[radarPath] = {
  id: radarPath,
  filename: radarPath,
  loaded: true,
  exports: { requestRadarPropertyReconciliation: async () => {} },
};

const seasonalStatusPath = require.resolve('../../src/services/seasonalChecklistStatus.service.ts');
require.cache[seasonalStatusPath] = {
  id: seasonalStatusPath,
  filename: seasonalStatusPath,
  loaded: true,
  exports: { syncSeasonalChecklistStatus: async () => {} },
};

const habits = new Map();
const tasks = new Map();
const workItems = new Map();
let taskIdCounter = 0;

function reset() {
  habits.clear();
  tasks.clear();
  workItems.clear();
}

function habitFixture(overrides = {}) {
  return {
    id: 'habit-1',
    propertyId: 'property-1',
    linkedMaintenanceTaskId: null,
    titleOverride: null,
    descriptionOverride: null,
    dueAt: null,
    habitTemplate: { title: 'Test smoke detectors', description: 'Press the test button on each unit.', cadence: 'MONTHLY' },
    ...overrides,
  };
}

const prismaMock = {
  property: { findUnique: async () => ({ id: 'property-1' }) },
  propertyHabit: {
    findFirst: async ({ where }) => habits.get(where.id) ?? null,
    findUnique: async ({ where }) => habits.get(where.id) ?? null,
    update: async ({ where, data }) => {
      const row = { ...habits.get(where.id), ...data };
      habits.set(where.id, row);
      return row;
    },
  },
  propertyMaintenanceTask: {
    findUnique: async ({ where }) => tasks.get(where.id) ?? null,
    create: async ({ data }) => {
      taskIdCounter += 1;
      const row = { id: `task-${taskIdCounter}`, status: 'PENDING', actionKey: null, inventoryItemId: null, riskLevel: null, seasonalChecklistItemId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      tasks.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...tasks.get(where.id), ...data, updatedAt: new Date() };
      tasks.set(where.id, row);
      return row;
    },
  },
  seasonalChecklistItem: { findUnique: async () => null },
  seasonalChecklist: { update: async () => ({}), findUnique: async () => null },
  projectRecord: { findFirst: async () => null },
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      if (where.propertyId_workKey) {
        const { propertyId, workKey } = where.propertyId_workKey;
        return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
      }
      return workItems.get(where.id) ?? null;
    },
    create: async ({ data }) => {
      const row = { id: crypto.randomUUID(), state: 'CANDIDATE', acceptanceState: 'PROPOSED', disposition: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      workItems.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkSource: { upsert: async ({ create }) => ({ id: crypto.randomUUID(), ...create }) },
  operationalWorkEvent: {
    create: async ({ data }) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...data }),
    findUnique: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { HomeHabitCoachService } = require('../../src/services/homeHabitCoach/homeHabitCoachService.ts');
const service = new HomeHabitCoachService();

test('adopting a MONTHLY-cadence habit creates a recurring task with the mapped frequency', async () => {
  reset();
  habits.set('habit-1', habitFixture());

  const { habit } = await service.adoptHabit('property-1', 'habit-1', 'owner-1');

  assert.ok(habit.linkedMaintenanceTaskId);
  const task = tasks.get(habit.linkedMaintenanceTaskId);
  assert.equal(task.title, 'Test smoke detectors');
  assert.equal(task.isRecurring, true);
  assert.equal(task.frequency, 'MONTHLY');
});

test('DAILY and WEEKLY cadences map losslessly', async () => {
  reset();
  habits.set('habit-daily', habitFixture({ id: 'habit-daily', habitTemplate: { title: 'Check thermostat', description: null, cadence: 'DAILY' } }));
  habits.set('habit-weekly', habitFixture({ id: 'habit-weekly', habitTemplate: { title: 'Test GFCI outlets', description: null, cadence: 'WEEKLY' } }));

  const daily = await service.adoptHabit('property-1', 'habit-daily', 'owner-1');
  const weekly = await service.adoptHabit('property-1', 'habit-weekly', 'owner-1');

  assert.equal(tasks.get(daily.habit.linkedMaintenanceTaskId).frequency, 'DAILY');
  assert.equal(tasks.get(weekly.habit.linkedMaintenanceTaskId).frequency, 'WEEKLY');
});

test('AD_HOC cadence creates a non-recurring task', async () => {
  reset();
  habits.set('habit-1', habitFixture({ habitTemplate: { title: 'One-time inspection', description: null, cadence: 'AD_HOC' } }));

  const { habit } = await service.adoptHabit('property-1', 'habit-1', 'owner-1');

  const task = tasks.get(habit.linkedMaintenanceTaskId);
  assert.equal(task.isRecurring, false);
  assert.equal(task.frequency, undefined ?? null, 'AD_HOC must not set a RecurrenceFrequency');
});

test('adopting twice is idempotent — the second call returns the existing link, not a new task', async () => {
  reset();
  habits.set('habit-1', habitFixture());

  const first = await service.adoptHabit('property-1', 'habit-1', 'owner-1');
  const taskCountAfterFirst = tasks.size;
  const second = await service.adoptHabit('property-1', 'habit-1', 'owner-1');

  assert.equal(second.habit.linkedMaintenanceTaskId, first.habit.linkedMaintenanceTaskId);
  assert.equal(tasks.size, taskCountAfterFirst, 'no second task should be created');
});

test('the adopted task also gets a durable work item, same as any other created task', async () => {
  reset();
  habits.set('habit-1', habitFixture());

  const { habit } = await service.adoptHabit('property-1', 'habit-1', 'owner-1');

  const item = [...workItems.values()].find((w) => w.propertyId === 'property-1');
  assert.ok(item, 'adopting a habit should produce a work item via the normal task-creation path');
  assert.equal(item.state, 'ACCEPTED');
});
