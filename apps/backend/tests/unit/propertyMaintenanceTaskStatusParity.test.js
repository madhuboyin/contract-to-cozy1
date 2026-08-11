const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Slice 0: updateTask's generic field-patch used to bypass
// every completion side effect (seasonal sync, analytics, project
// follow-up, Radar reconciliation, adherence signal) that updateTaskStatus
// applied. Both paths now route through shared buildStatusUpdateData /
// applyTaskCompletionSideEffects helpers. This asserts parity on the two
// side effects that are cheapest to observe: seasonal checklist sync and
// MAINTENANCE_ITEM_COMPLETED analytics.

let resolvePropertyAccessImpl = async () => ({ propertyId: 'property-1', role: 'CONTRIBUTOR' });
const propertyAuthPath = require.resolve('../../src/services/propertyAccess.service.ts');
require.cache[propertyAuthPath] = {
  id: propertyAuthPath,
  filename: propertyAuthPath,
  loaded: true,
  exports: {
    resolvePropertyAccess: (...args) => resolvePropertyAccessImpl(...args),
    ROLE_RANK: { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 },
  },
};

const trackedEvents = [];
const analyticsPath = require.resolve('../../src/services/analytics');
require.cache[analyticsPath] = {
  id: analyticsPath,
  filename: analyticsPath,
  loaded: true,
  exports: {
    analyticsEmitter: { track: (event) => { trackedEvents.push(event); } },
    AnalyticsEvent: {
      MAINTENANCE_ITEM_CREATED: 'MAINTENANCE_ITEM_CREATED',
      MAINTENANCE_ITEM_COMPLETED: 'MAINTENANCE_ITEM_COMPLETED',
      ACTION_COMPLETED: 'ACTION_COMPLETED',
    },
    AnalyticsModule: { MAINTENANCE: 'MAINTENANCE', PROJECT_MGMT: 'PROJECT_MGMT' },
    AnalyticsFeature: { MAINTENANCE_TASK: 'MAINTENANCE_TASK', PROJECT_TRACKER: 'PROJECT_TRACKER' },
  },
};

const signalServicePath = require.resolve('../../src/services/signal.service.ts');
const publishedSignals = [];
require.cache[signalServicePath] = {
  id: signalServicePath,
  filename: signalServicePath,
  loaded: true,
  exports: {
    signalService: { publishMaintenanceAdherenceSignal: async (args) => { publishedSignals.push(args); } },
  },
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

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    propertyId: 'property-1',
    status: 'PENDING',
    source: 'ACTION_CENTER',
    actionKey: null,
    isRecurring: false,
    frequency: null,
    seasonalChecklistItemId: 'seasonal-item-1',
    inventoryItemId: null,
    priority: 'MEDIUM',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    property: { id: 'property-1', homeownerProfile: { userId: 'owner-1', segment: 'EXISTING_OWNER' } },
    ...overrides,
  };
}

const seasonalItemUpdates = [];
const checklistUpdates = [];
let syncCalls = 0;

const seasonalStatusPath = require.resolve('../../src/services/seasonalChecklistStatus.service.ts');
require.cache[seasonalStatusPath] = {
  id: seasonalStatusPath,
  filename: seasonalStatusPath,
  loaded: true,
  exports: { syncSeasonalChecklistStatus: async () => { syncCalls += 1; } },
};

let currentTask = makeTask();
const prismaMock = {
  propertyMaintenanceTask: {
    findUnique: async () => currentTask,
    findUniqueOrThrow: async () => currentTask,
    update: async (args) => {
      currentTask = { ...currentTask, ...args.data };
      return currentTask;
    },
    updateMany: async (args) => {
      if (currentTask.updatedAt.getTime() !== args.where.updatedAt.getTime()) return { count: 0 };
      currentTask = { ...currentTask, ...args.data, updatedAt: new Date(currentTask.updatedAt.getTime() + 1) };
      return { count: 1 };
    },
    upsert: async () => ({}),
  },
  seasonalChecklistItem: {
    findUnique: async () => ({ id: 'seasonal-item-1', seasonalChecklistId: 'checklist-1' }),
    update: async (args) => { seasonalItemUpdates.push(args); return args; },
  },
  seasonalChecklist: {
    update: async (args) => { checklistUpdates.push(args); return args; },
    findUnique: async () => ({ tasksCompleted: 1 }),
  },
  projectRecord: { findFirst: async () => null },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

test('updateTaskStatus completing a seasonal-linked task syncs the checklist and emits analytics', async () => {
  currentTask = makeTask();
  seasonalItemUpdates.length = 0;
  checklistUpdates.length = 0;
  trackedEvents.length = 0;
  syncCalls = 0;

  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', 'task-1', 'COMPLETED');

  assert.equal(seasonalItemUpdates.length, 1, 'seasonal item should have been synced');
  assert.equal(checklistUpdates.length, 1, 'seasonal checklist counter should have been synced');
  assert.equal(syncCalls, 1);
  assert.ok(trackedEvents.some((e) => e.eventType === 'MAINTENANCE_ITEM_COMPLETED'));
});

test('updateTask completing the same task via the generic field patch produces identical side effects', async () => {
  currentTask = makeTask();
  seasonalItemUpdates.length = 0;
  checklistUpdates.length = 0;
  trackedEvents.length = 0;
  syncCalls = 0;

  await PropertyMaintenanceTaskService.updateTask('owner-1', 'task-1', { status: 'COMPLETED' });

  assert.equal(seasonalItemUpdates.length, 1, 'updateTask must sync the seasonal item just like updateTaskStatus');
  assert.equal(checklistUpdates.length, 1, 'updateTask must sync the seasonal checklist counter just like updateTaskStatus');
  assert.equal(syncCalls, 1);
  assert.ok(
    trackedEvents.some((e) => e.eventType === 'MAINTENANCE_ITEM_COMPLETED'),
    'updateTask must emit MAINTENANCE_ITEM_COMPLETED analytics just like updateTaskStatus',
  );
});

test('updateTask with no status change does not run completion side effects', async () => {
  currentTask = makeTask({ status: 'PENDING' });
  seasonalItemUpdates.length = 0;
  trackedEvents.length = 0;

  await PropertyMaintenanceTaskService.updateTask('owner-1', 'task-1', { title: 'Renamed task' });

  assert.equal(seasonalItemUpdates.length, 0);
  assert.equal(trackedEvents.length, 0);
});
