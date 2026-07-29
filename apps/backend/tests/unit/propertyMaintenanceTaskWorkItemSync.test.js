const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 3: PropertyMaintenanceTaskService now keeps a
// durable OperationalWorkItem in step with every create/status transition
// via syncTaskWorkItem — best-effort, wired into the same shared
// applyTaskCompletionSideEffects path Slice 0 already unified.

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

const loggedWarnings = [];
const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { logger: { info: () => {}, warn: (...args) => loggedWarnings.push(args), error: () => {} }, auditLog: () => {} },
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

// ── In-memory Prisma fake, enforcing the same unique constraints as
// schema.prisma, same pattern as the Slice 1/2 homeOperations tests ──
const tasks = new Map();
const workItems = new Map();
const workSources = new Map();
const workEvents = new Map();

function reset() {
  tasks.clear();
  workItems.clear();
  workSources.clear();
  workEvents.clear();
  loggedWarnings.length = 0;
}

let taskIdCounter = 0;

const prismaMock = {
  property: { findUnique: async () => ({ id: 'property-1' }) },
  propertyMaintenanceTask: {
    findUnique: async ({ where }) => tasks.get(where.id) ?? null,
    create: async ({ data }) => {
      taskIdCounter += 1;
      const row = {
        id: `task-${taskIdCounter}`,
        status: 'PENDING',
        actionKey: null,
        inventoryItemId: null,
        riskLevel: null,
        isRecurring: false,
        frequency: null,
        seasonalChecklistItemId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      tasks.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = { ...tasks.get(where.id), ...data, updatedAt: new Date() };
      tasks.set(where.id, row);
      return row;
    },
    delete: async ({ where }) => {
      const row = tasks.get(where.id);
      tasks.delete(where.id);
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
      const existing = [...workItems.values()].find((w) => w.propertyId === data.propertyId && w.workKey === data.workKey);
      if (existing) { const err = new Error('dup workKey'); err.code = 'P2002'; throw err; }
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
  operationalWorkSource: {
    upsert: async ({ where, create, update }) => {
      const k = where.workItemId_sourceType_sourceEntityId_sourceRole;
      const key = `${k.workItemId}:${k.sourceType}:${k.sourceEntityId}:${k.sourceRole}`;
      const existing = workSources.get(key);
      const row = existing ? { ...existing, ...update } : { id: crypto.randomUUID(), ...create };
      workSources.set(key, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => {
      const key = `${data.workItemId}:${data.idempotencyKey}`;
      if (workEvents.has(key)) { const err = new Error('dup event'); err.code = 'P2002'; throw err; }
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      workEvents.set(key, row);
      return row;
    },
    findUnique: async ({ where }) => {
      const k = where.workItemId_idempotencyKey;
      return workEvents.get(`${k.workItemId}:${k.idempotencyKey}`) ?? null;
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

function workItemFor(taskId) {
  return [...workItems.values()].find((w) => [...workSources.values()].some((s) => s.sourceEntityId === taskId));
}

test('creating a task produces exactly one ACCEPTED work item', async () => {
  reset();
  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Clean gutters' });

  assert.equal(workItems.size, 1);
  const item = workItemFor(task.id);
  assert.ok(item);
  assert.equal(item.state, 'ACCEPTED');
  assert.equal(item.acceptanceState, 'ACCEPTED');
});

test('completing a non-recurring task transitions REPORTED_COMPLETE -> VERIFIED', async () => {
  reset();
  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Fix fence' });

  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', task.id, 'COMPLETED');

  const item = workItemFor(task.id);
  assert.equal(item.state, 'VERIFIED');
  assert.equal(workItems.size, 1, 'the same work item must be reused, not duplicated');
});

test('completing a recurring task cycles the same work item to FOLLOW_UP_DUE -> ACCEPTED for its next occurrence', async () => {
  reset();
  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', {
    title: 'Replace HVAC filter',
    isRecurring: true,
    frequency: 'MONTHLY',
  });

  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', task.id, 'COMPLETED');

  const item = workItemFor(task.id);
  assert.equal(item.state, 'ACCEPTED', 'a recurring completion cycles back to ACCEPTED for the next occurrence');
  assert.equal(workItems.size, 1, 'no second work item should be minted for the next occurrence');
});

test('uncompleting a verified task reopens it', async () => {
  reset();
  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Test smoke detectors' });
  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', task.id, 'COMPLETED');
  assert.equal(workItemFor(task.id).state, 'VERIFIED');

  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', task.id, 'PENDING');

  assert.equal(workItemFor(task.id).state, 'REOPENED');
});

test('cancelling a task with an existing work item closes it with disposition NOT_RELEVANT', async () => {
  reset();
  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Paint shed' });
  assert.equal(workItemFor(task.id).state, 'ACCEPTED');

  await PropertyMaintenanceTaskService.updateTaskStatus('owner-1', task.id, 'CANCELLED');

  const item = workItemFor(task.id);
  assert.equal(item.state, 'CLOSED');
  assert.equal(item.disposition, 'NOT_RELEVANT');
});

test('a work-item sync failure does not block the task mutation itself', async () => {
  reset();
  const originalCreate = prismaMock.operationalWorkItem.create;
  prismaMock.operationalWorkItem.create = async () => { throw new Error('simulated outage'); };
  try {
    const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Inspect roof' });
    assert.ok(task.id, 'task creation must succeed regardless of work-item sync failure');
    assert.equal(workItems.size, 0);
    assert.ok(loggedWarnings.length > 0, 'the failure should be logged, not swallowed silently');
  } finally {
    prismaMock.operationalWorkItem.create = originalCreate;
  }
});
