const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Home Operations Slice 6: confirmCompletion's gaps closed — unresolved
// exceptions become real ProjectIssue rows, future-care tasks get real work
// items, and Slice 5's deferred PROJECT-policy finding path gets a working
// handoff. Tested at the extracted-function level (mapUnresolvedException
// ToProjectIssue, syncFindingWorkItemForProjectHandoff,
// syncFutureCareTaskWorkItem), same granularity as Slices 4/5, since
// confirmCompletion/createProject are large functions with many unrelated
// dependencies.

const workItems = new Map();
const workExecutions = new Map();

function reset() {
  workItems.clear();
  workExecutions.clear();
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
  operationalWorkSource: {
    upsert: async ({ create }) => ({ id: crypto.randomUUID(), ...create }),
  },
  operationalWorkExecution: {
    upsert: async ({ where, create, update }) => {
      const key = where.workItemId_executionType_executionEntityId;
      const id = `${key.workItemId}:${key.executionType}:${key.executionEntityId}`;
      const row = { id, ...(workExecutions.get(id) ?? create), ...update };
      workExecutions.set(id, row);
      return row;
    },
  },
  operationalWorkEvent: {
    create: async ({ data }) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...data }),
    findUnique: async () => null,
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {} },
};

const {
  mapUnresolvedExceptionToProjectIssue,
  syncFindingWorkItemForProjectHandoff,
  syncFutureCareTaskWorkItem,
} = require('../../src/services/projectTracker.service.ts');
const { resolveInspectionFindingWorkKey } = require('../../src/modules/homeOperations/adapters/inspectionFinding.adapter.ts');

// ---- mapUnresolvedExceptionToProjectIssue (pure) ----

test('a blocking exception maps to BLOCKING severity and blocksPayment true', () => {
  const issue = mapUnresolvedExceptionToProjectIssue('project-1', { type: 'SCOPE', summary: 'Trim not installed', blocksClosure: true });
  assert.equal(issue.severity, 'BLOCKING');
  assert.equal(issue.blocksPayment, true);
  assert.equal(issue.status, 'OPEN');
  assert.equal(issue.category, 'SCOPE_DISPUTE');
  assert.equal(issue.projectId, 'project-1');
});

test('a non-blocking exception maps to MINOR severity and blocksPayment false', () => {
  const issue = mapUnresolvedExceptionToProjectIssue('project-1', { type: 'QUALITY', summary: 'Minor paint touch-up needed', blocksClosure: false });
  assert.equal(issue.severity, 'MINOR');
  assert.equal(issue.blocksPayment, false);
});

test('exception type maps to the closest ProjectIssueCategory for all 6 types', () => {
  const cases = [
    ['QUALITY', 'QUALITY_CONCERN'],
    ['SAFETY', 'SAFETY'],
    ['SCOPE', 'SCOPE_DISPUTE'],
    ['PERMIT', 'OTHER'],
    ['FUNCTIONAL', 'OTHER'],
    ['OTHER', 'OTHER'],
  ];
  for (const [type, category] of cases) {
    const issue = mapUnresolvedExceptionToProjectIssue('project-1', { type, summary: 'x', blocksClosure: false });
    assert.equal(issue.category, category, `expected ${type} -> ${category}`);
  }
});

test('a long summary is truncated for the title but kept in full in the description', () => {
  const longSummary = 'x'.repeat(200);
  const issue = mapUnresolvedExceptionToProjectIssue('project-1', { type: 'OTHER', summary: longSummary, blocksClosure: false });
  assert.ok(issue.title.length <= 120);
  assert.equal(issue.description, longSummary);
});

// ---- syncFindingWorkItemForProjectHandoff ----

test('a project sourced from an INSPECTION_FINDING transitions the finding work item to IN_PROJECT and links the execution', async () => {
  reset();
  const workKey = resolveInspectionFindingWorkKey('finding-1', 'property-1');
  const item = { id: crypto.randomUUID(), propertyId: 'property-1', workKey, state: 'ACCEPTED', acceptanceState: 'ACCEPTED', disposition: null };
  workItems.set(item.id, item);

  await syncFindingWorkItemForProjectHandoff('property-1', 'INSPECTION_FINDING', 'finding-1', 'project-1');

  assert.equal(workItems.get(item.id).state, 'IN_PROJECT');
  const link = [...workExecutions.values()].find((e) => e.workItemId === item.id);
  assert.ok(link);
  assert.equal(link.executionType, 'PROJECT');
  assert.equal(link.executionEntityId, 'project-1');
});

test('a project with no INSPECTION_FINDING source is a no-op', async () => {
  reset();
  await assert.doesNotReject(syncFindingWorkItemForProjectHandoff('property-1', 'MANUAL', null, 'project-1'));
  assert.equal(workExecutions.size, 0);
});

test('a project referencing a finding with no existing work item is a silent no-op', async () => {
  reset();
  await assert.doesNotReject(syncFindingWorkItemForProjectHandoff('property-1', 'INSPECTION_FINDING', 'finding-does-not-exist', 'project-1'));
  assert.equal(workExecutions.size, 0);
});

test('a work-item sync failure does not block project creation', async () => {
  reset();
  const originalFindUnique = prismaMock.operationalWorkItem.findUnique;
  prismaMock.operationalWorkItem.findUnique = async () => { throw new Error('db unavailable'); };
  try {
    await assert.doesNotReject(syncFindingWorkItemForProjectHandoff('property-1', 'INSPECTION_FINDING', 'finding-1', 'project-1'));
  } finally {
    prismaMock.operationalWorkItem.findUnique = originalFindUnique;
  }
});

// ---- syncFutureCareTaskWorkItem ----

function futureCareTaskFixture(overrides = {}) {
  return {
    id: 'task-future-1',
    propertyId: 'property-1',
    title: 'Inspect roof',
    description: 'Created from verified completion of Roof replacement.',
    status: 'PENDING',
    actionKey: 'project:project-1:inspection',
    priority: 'HIGH',
    riskLevel: null,
    inventoryItemId: null,
    nextDueDate: new Date('2027-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('a future-care task gets its own ACCEPTED work item', async () => {
  reset();
  await syncFutureCareTaskWorkItem('property-1', futureCareTaskFixture());
  const item = [...workItems.values()].find((w) => w.propertyId === 'property-1');
  assert.ok(item, 'expected a work item to be created for the future-care task');
  assert.equal(item.state, 'ACCEPTED');
});

test('two future-care tasks (e.g. maintenance + inspection) get distinct work items', async () => {
  reset();
  await syncFutureCareTaskWorkItem('property-1', futureCareTaskFixture({ id: 'task-a', actionKey: 'project:project-1:maintenance' }));
  await syncFutureCareTaskWorkItem('property-1', futureCareTaskFixture({ id: 'task-b', actionKey: 'project:project-1:inspection' }));
  assert.equal(workItems.size, 2);
});

test('a cancelled future-care task proposes nothing (no work item)', async () => {
  reset();
  await syncFutureCareTaskWorkItem('property-1', futureCareTaskFixture({ status: 'CANCELLED' }));
  assert.equal(workItems.size, 0);
});

test('a work-item sync failure does not block future-care task creation', async () => {
  reset();
  const originalCreate = prismaMock.operationalWorkItem.create;
  prismaMock.operationalWorkItem.create = async () => { throw new Error('db unavailable'); };
  try {
    await assert.doesNotReject(syncFutureCareTaskWorkItem('property-1', futureCareTaskFixture()));
  } finally {
    prismaMock.operationalWorkItem.create = originalCreate;
  }
});
