const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ============================================================================
// Mocks
//
// PropertyMaintenanceTask.service.ts now delegates the "who can access this
// property" question to resolvePropertyAccess (propertyAccess.service.ts),
// so it's mocked directly here rather than re-mocking prisma's
// householdMember/property queries — that logic has its own dedicated test
// file (propertyAuthMiddlewareMetrics.test.js). ROLE_RANK is re-declared here
// (not the real module) since resolvePropertyAccess is mocked from the same
// file; it's a plain value copy of the real ranking, not separate logic.
// ============================================================================

let resolvePropertyAccessImpl = async () => null;

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
    AnalyticsEvent: { MAINTENANCE_ITEM_CREATED: 'MAINTENANCE_ITEM_CREATED', MAINTENANCE_ITEM_COMPLETED: 'MAINTENANCE_ITEM_COMPLETED' },
    AnalyticsModule: { MAINTENANCE: 'MAINTENANCE' },
    AnalyticsFeature: { MAINTENANCE_TASK: 'MAINTENANCE_TASK' },
  },
};

const signalServicePath = require.resolve('../../src/services/signal.service.ts');
require.cache[signalServicePath] = {
  id: signalServicePath,
  filename: signalServicePath,
  loaded: true,
  exports: {
    signalService: { publishMaintenanceAdherenceSignal: async () => {} },
  },
};

const loggerPath = require.resolve('../../src/lib/logger.ts');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    auditLog: () => {},
  },
};

const prismaMock = {
  property: { findUnique: async () => null },
  propertyMaintenanceTask: {
    findMany: async () => [],
    findUnique: async () => null,
    create: async (args) => ({ id: 'task-new', ...args.data }),
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

const EXISTING_OWNER_PROPERTY = {
  id: 'property-1',
  homeownerProfile: { userId: 'owner-1', segment: 'EXISTING_OWNER' },
};

test('VIEWER can read tasks for a property they are a household member of', async () => {
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'viewer-1' && propertyId === 'property-1') return { propertyId, role: 'VIEWER' };
    return null;
  };
  prismaMock.property.findUnique = async () => EXISTING_OWNER_PROPERTY;
  prismaMock.propertyMaintenanceTask.findMany = async () => [{ id: 'task-1', status: 'PENDING' }];

  const tasks = await PropertyMaintenanceTaskService.getTasksForProperty('viewer-1', 'property-1');
  assert.equal(tasks.length, 1);
});

test('VIEWER is denied creating a task (mutation requires CONTRIBUTOR+)', async () => {
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'viewer-1' && propertyId === 'property-1') return { propertyId, role: 'VIEWER' };
    return null;
  };

  await assert.rejects(
    () => PropertyMaintenanceTaskService.createUserTask('viewer-1', 'property-1', { title: 'Fix gutter' }),
    /does not have access/
  );
});

test('CONTRIBUTOR can create a task', async () => {
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'contributor-1' && propertyId === 'property-1') return { propertyId, role: 'CONTRIBUTOR' };
    return null;
  };
  prismaMock.property.findUnique = async () => EXISTING_OWNER_PROPERTY;
  trackedEvents.length = 0;

  const task = await PropertyMaintenanceTaskService.createUserTask('contributor-1', 'property-1', { title: 'Fix gutter' });
  assert.equal(task.title, 'Fix gutter');
  assert.equal(trackedEvents.length, 1);
  assert.equal(trackedEvents[0].userId, 'contributor-1');
});

test('OWNER can create a task', async () => {
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'owner-1' && propertyId === 'property-1') return { propertyId, role: 'OWNER' };
    return null;
  };
  prismaMock.property.findUnique = async () => EXISTING_OWNER_PROPERTY;

  const task = await PropertyMaintenanceTaskService.createUserTask('owner-1', 'property-1', { title: 'Replace filter' });
  assert.equal(task.title, 'Replace filter');
});

test('a non-member is denied any access to the property', async () => {
  resolvePropertyAccessImpl = async () => null;

  await assert.rejects(
    () => PropertyMaintenanceTaskService.getTasksForProperty('stranger-1', 'property-1'),
    /does not have access to this property/
  );
  await assert.rejects(
    () => PropertyMaintenanceTaskService.createUserTask('stranger-1', 'property-1', { title: 'Fix gutter' }),
    /does not have access to this property/
  );
});

test('getTask: VIEWER can read a task but is denied deleting it', async () => {
  const task = {
    id: 'task-1',
    propertyId: 'property-1',
    source: 'USER_CREATED',
    property: EXISTING_OWNER_PROPERTY,
  };
  prismaMock.propertyMaintenanceTask.findUnique = async () => task;
  resolvePropertyAccessImpl = async (userId, propertyId) => {
    if (userId === 'viewer-1' && propertyId === 'property-1') return { propertyId, role: 'VIEWER' };
    return null;
  };

  const fetched = await PropertyMaintenanceTaskService.getTask('viewer-1', 'task-1');
  assert.equal(fetched.id, 'task-1');

  await assert.rejects(
    () => PropertyMaintenanceTaskService.deleteTask('viewer-1', 'task-1'),
    /does not have access/
  );
});
