const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Item #14 (Gap 2): syncMaintenanceTaskWorkItemForProjectHandoff
// mirrors syncFindingWorkItemForProjectHandoff — a Project created referencing
// a maintenance task (sourceEntityType === 'MAINTENANCE_TASK') must hand the
// task's own work item off to the project instead of letting a fresh,
// disconnected work item get minted for it.

const NOW = new Date('2026-07-29T12:00:00.000Z');

const workItems = new Map();
const workExecutions = new Map();
const tasks = new Map();

function resetWorkItemState() {
  workItems.clear();
  workExecutions.clear();
  tasks.clear();
}

const prismaMock = {
  operationalWorkItem: {
    findUnique: async ({ where }) => {
      if (where.propertyId_workKey) {
        const { propertyId, workKey } = where.propertyId_workKey;
        return [...workItems.values()].find((w) => w.propertyId === propertyId && w.workKey === workKey) ?? null;
      }
      return workItems.get(where.id) ?? null;
    },
    update: async ({ where, data }) => {
      const row = { ...workItems.get(where.id), ...data, updatedAt: new Date() };
      workItems.set(where.id, row);
      return row;
    },
  },
  operationalWorkExecution: {
    upsert: async ({ where, create }) => {
      const key = where.workItemId_executionType_executionEntityId;
      const id = `${key.workItemId}:${key.executionType}:${key.executionEntityId}`;
      const row = { id, ...create };
      workExecutions.set(id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...data }),
    findUnique: async () => null,
  },
  propertyMaintenanceTask: {
    findFirst: async ({ where }) =>
      [...tasks.values()].find((t) => t.id === where.id && t.propertyId === where.propertyId) ?? null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const {
  syncMaintenanceTaskWorkItemForProjectHandoff,
} = require('../../src/services/projectTracker.service.ts');
const {
  resolveMaintenanceTaskWorkKey,
} = require('../../src/modules/homeOperations/adapters/maintenanceTask.adapter.ts');

function seedTask(overrides = {}) {
  const task = { id: 'task-1', propertyId: 'property-1', inventoryItemId: null, actionKey: null, ...overrides };
  tasks.set(task.id, task);
  return task;
}

function seedWorkItem(task, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const row = {
    propertyId: 'property-1',
    workKey: resolveMaintenanceTaskWorkKey(task, 'property-1'),
    state: 'ACCEPTED',
    acceptanceState: 'ACCEPTED',
    disposition: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    id,
  };
  workItems.set(id, row);
  return row;
}

test('a matching task with an ACCEPTED work item transitions to IN_PROJECT and links the project execution', async () => {
  resetWorkItemState();
  const task = seedTask({ id: 'task-1' });
  const item = seedWorkItem(task);

  await syncMaintenanceTaskWorkItemForProjectHandoff('property-1', 'MAINTENANCE_TASK', 'task-1', 'project-1');

  assert.equal(workItems.get(item.id).state, 'IN_PROJECT');
  const execution = [...workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(execution, 'expected a PROJECT execution link');
  assert.equal(execution.executionType, 'PROJECT');
  assert.equal(execution.executionEntityId, 'project-1');
});

test('sourceEntityType INSPECTION_FINDING is unaffected — the guard no-ops', async () => {
  resetWorkItemState();
  const task = seedTask({ id: 'task-1' });
  seedWorkItem(task);

  await syncMaintenanceTaskWorkItemForProjectHandoff('property-1', 'INSPECTION_FINDING', 'task-1', 'project-1');

  assert.equal(workExecutions.size, 0, 'no execution link should be created for a non-MAINTENANCE_TASK source');
});

test('no matching task is a silent no-op, not an error', async () => {
  resetWorkItemState();
  await assert.doesNotReject(
    syncMaintenanceTaskWorkItemForProjectHandoff('property-1', 'MAINTENANCE_TASK', 'task-does-not-exist', 'project-1'),
  );
  assert.equal(workItems.size, 0);
});

test('a task with no existing work item is a silent no-op', async () => {
  resetWorkItemState();
  seedTask({ id: 'task-1' });

  await assert.doesNotReject(
    syncMaintenanceTaskWorkItemForProjectHandoff('property-1', 'MAINTENANCE_TASK', 'task-1', 'project-1'),
  );
  assert.equal(workExecutions.size, 0);
});

test('a sync failure is swallowed — project creation is never blocked', async () => {
  resetWorkItemState();
  const originalFindFirst = prismaMock.propertyMaintenanceTask.findFirst;
  prismaMock.propertyMaintenanceTask.findFirst = async () => { throw new Error('simulated outage'); };
  try {
    await assert.doesNotReject(
      syncMaintenanceTaskWorkItemForProjectHandoff('property-1', 'MAINTENANCE_TASK', 'task-1', 'project-1'),
    );
  } finally {
    prismaMock.propertyMaintenanceTask.findFirst = originalFindFirst;
  }
});
