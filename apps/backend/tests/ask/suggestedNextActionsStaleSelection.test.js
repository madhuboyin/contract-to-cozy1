const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { inventoryService, inventoryItemContextVersion, INVENTORY_ADD_MESSAGE } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { maintenanceTaskUpdateResult, maintenanceTaskVersion } = require('../../src/services/ask/handlers/maintenance.handler.ts');
const { roomContextVersion } = require('../../src/services/ask/suggestedActions/domainVersions.ts');
const { resolveTypedActionTarget } = require('../../src/services/ask/suggestedActions/typedTarget.ts');
const { PropertyMaintenanceTaskService } = require('../../src/services/PropertyMaintenanceTask.service.ts');

// Plan §4.1 / §12: a selected Suggested Next Action's record is authoritative. A deleted or changed record is stale, and the handler
// must never fall back to matching the message text, which could land on a different record with a similar name.

const UPDATED = new Date('2026-10-04T11:00:00.000Z');
const STALE = 'ASK_SUGGESTED_ACTION_STALE';

// ---- the shared resolver ---------------------------------------------------------------------------------------------------

test('resolveTypedActionTarget: not typed without a registered outcome or the right entity type; stale when gone or changed', () => {
  const rows = [{ id: 'a', v: 1 }];
  const spec = (over = {}) => ({ entityType: 'THING', outcomeRegistered: true, versionOf: (row) => `v${row.v}`, ...over });
  const launch = (over = {}) => ({ entityType: 'THING', entityId: 'a', outcomeKey: 'DO_IT', contextVersion: 'v1', ...over });
  assert.equal(resolveTypedActionTarget(rows, launch(), spec()).kind, 'TARGET');
  assert.equal(resolveTypedActionTarget(rows, launch({ contextVersion: null }), spec()).kind, 'TARGET', 'no stamped version: existence only');
  assert.equal(resolveTypedActionTarget(rows, launch({ contextVersion: 'v0' }), spec()).kind, 'STALE');
  assert.equal(resolveTypedActionTarget(rows, launch({ entityId: 'gone' }), spec()).kind, 'STALE');
  assert.equal(resolveTypedActionTarget(rows, launch(), spec({ outcomeRegistered: false })).kind, 'NOT_TYPED', 'an unknown outcome is ignored');
  assert.equal(resolveTypedActionTarget(rows, launch({ entityType: 'OTHER' }), spec()).kind, 'NOT_TYPED');
  assert.equal(resolveTypedActionTarget(rows, launch({ entityId: null }), spec()).kind, 'NOT_TYPED');
  assert.equal(resolveTypedActionTarget(rows, undefined, spec()).kind, 'NOT_TYPED');
});

// ---- inventory correction --------------------------------------------------------------------------------------------------

const item = (id, name, over = {}) => ({ id, name, category: 'APPLIANCE', condition: 'GOOD', roomId: null, room: null, brand: null, manufacturer: null, model: null, modelNumber: null, serialNo: null, serialNumber: null, purchasedOn: null, installedOn: null, updatedAt: UPDATED, ...over });
const withInventory = async (items, fn) => {
  const o = [prisma.householdMember.findUnique, inventoryService.listItems];
  prisma.householdMember.findUnique = async () => ({ role: 'OWNER', isPrimaryOwner: true });
  inventoryService.listItems = async () => items;
  try { return await fn(); } finally { prisma.householdMember.findUnique = o[0]; inventoryService.listItems = o[1]; }
};
const correct = (launchContext, message = 'Correct the brand of inventory item "Samsung microwave".') =>
  capabilityInvoke('INVENTORY_ITEM_CORRECT', { userId: 'u1', propertyId: 'prop-1', message, launchContext });
const invLaunch = (over = {}) => ({ surface: 'ASK_SUGGESTED_ACTION', operationId: 'INVENTORY_ITEM_CORRECT', entityType: 'INVENTORY_ITEM', entityId: 'item-1', contextVersion: inventoryItemContextVersion(item('item-1', 'Samsung microwave')), outcomeKey: 'ADD_BRAND', ...over });

test('inventory: a current offered item opens its correction; a changed or deleted one is stale and never title-matched to another item', async () => {
  const items = [item('item-1', 'Samsung microwave'), item('item-2', 'Microwave')];
  await withInventory(items, async () => {
    const ok = await correct(invLaunch());
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.equal(ok.parameters.inventoryCorrection.itemId, 'item-1');
    assert.equal(ok.parameters.inventoryCorrection.field, 'brand');
  });
  const edited = [item('item-1', 'Samsung microwave', { updatedAt: new Date(UPDATED.getTime() + 1000) }), item('item-2', 'Microwave')];
  await withInventory(edited, async () => assert.equal((await correct(invLaunch())).reasonCode, STALE, 'changed since offered'));
  // item-1 was deleted; item-2's name is contained in the message, so the old title match would have picked it.
  await withInventory([item('item-2', 'Microwave')], async () => {
    const result = await correct(invLaunch(), 'Correct the brand of inventory item "Samsung microwave" (a microwave).');
    assert.equal(result.reasonCode, STALE);
    assert.equal(result.confirmation, undefined);
  });
});

test('inventory: free text and an unregistered outcome keep the existing title-based selection', async () => {
  await withInventory([item('item-2', 'Microwave')], async () => {
    const free = await correct({ surface: 'ASK_WORKSPACE' }, 'Correct the brand of inventory item "Microwave".');
    assert.equal(free.parameters.inventoryCorrection.itemId, 'item-2');
    const forged = await correct(invLaunch({ entityId: 'item-gone', outcomeKey: 'NOT_AN_OUTCOME' }), 'Correct the brand of inventory item "Microwave".');
    assert.equal(forged.parameters.inventoryCorrection.itemId, 'item-2', 'an unknown outcome is ignored, not trusted');
  });
});

// ---- maintenance update ----------------------------------------------------------------------------------------------------

const task = (id, title, over = {}) => ({ id, propertyId: 'prop-1', title, status: 'CANCELLED', priority: 'MEDIUM', source: 'USER', nextDueDate: null, isRecurring: false, frequency: null, updatedAt: UPDATED, snoozedUntil: null, assignedTo: null, ...over });
const withTasks = async (tasks, fn) => {
  const o = [prisma.householdMember.findUnique, prisma.householdMember.findMany, PropertyMaintenanceTaskService.getTasksForProperty];
  prisma.householdMember.findUnique = async () => ({ role: 'OWNER', isPrimaryOwner: true });
  prisma.householdMember.findMany = async () => [];
  PropertyMaintenanceTaskService.getTasksForProperty = async () => tasks;
  try { return await fn(); } finally { [prisma.householdMember.findUnique, prisma.householdMember.findMany, PropertyMaintenanceTaskService.getTasksForProperty] = o; prisma.householdMember.findUnique = o[0]; prisma.householdMember.findMany = o[1]; PropertyMaintenanceTaskService.getTasksForProperty = o[2]; }
};
const reopen = (tasks, over = {}) => maintenanceTaskUpdateResult('u1', 'prop-1', 'Reopen the maintenance task "Clean gutters".', over.taskId ?? 'task-1', null, over.outcomeKey ?? 'REOPEN_TASK', over.version === undefined ? maintenanceTaskVersion(task('task-1', 'Clean gutters')) : over.version);

test('maintenance: a current offered task proposes the reopen; a changed or deleted one is stale and never title-matched to a similar task', async () => {
  const current = [task('task-1', 'Clean gutters'), task('task-2', 'Clean gutters (back)')];
  await withTasks(current, async () => {
    const ok = await reopen(current);
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.equal(ok.parameters.maintenanceUpdate.taskId, 'task-1');
    assert.equal(ok.parameters.maintenanceUpdate.action, 'REOPEN');
  });
  await withTasks([task('task-1', 'Clean gutters', { status: 'PENDING', updatedAt: new Date(UPDATED.getTime() + 1000) })], async () => assert.equal((await reopen()).reasonCode, STALE, 'reopened elsewhere'));
  // task-1 deleted; another task named "Clean gutters (back)" would match the message subject.
  await withTasks([task('task-2', 'Clean gutters')], async () => {
    const result = await reopen();
    assert.equal(result.reasonCode, STALE);
    assert.equal(result.confirmation, undefined);
  });
});

test('maintenance: a row button (no registered outcome) keeps the existing resolution, including its title fallback', async () => {
  await withTasks([task('task-2', 'Clean gutters')], async () => {
    const row = await maintenanceTaskUpdateResult('u1', 'prop-1', 'Reschedule this maintenance task.', 'task-2', null, null, null);
    assert.equal(row.parameters.maintenanceUpdate.taskId, 'task-2');
    const forged = await maintenanceTaskUpdateResult('u1', 'prop-1', 'Reopen Clean gutters', 'task-gone', null, 'NOT_AN_OUTCOME', 'x');
    assert.notEqual(forged.reasonCode, STALE, 'an unknown outcome is not treated as a typed target');
  });
});

// ---- add an item to a room -------------------------------------------------------------------------------------------------

const addToRoom = (launchContext) => capabilityInvoke('INVENTORY_ITEM_CREATE', { userId: 'u1', propertyId: 'prop-1', message: INVENTORY_ADD_MESSAGE, launchContext });
const roomLaunch = (over = {}) => ({ surface: 'ASK_SUGGESTED_ACTION', operationId: 'INVENTORY_ITEM_CREATE', entityType: 'INVENTORY_ROOM', entityId: 'room-1', contextVersion: null, outcomeKey: 'ADD_ITEM_TO_ROOM', ...over });
const withRooms = async (rooms, fn) => {
  const o = [prisma.householdMember.findUnique, prisma.inventoryRoom.findMany];
  prisma.householdMember.findUnique = async () => ({ role: 'OWNER', isPrimaryOwner: true });
  prisma.inventoryRoom.findMany = async (args) => rooms.filter((room) => !args.where.id || room.id === args.where.id);
  try { return await fn(); } finally { prisma.householdMember.findUnique = o[0]; prisma.inventoryRoom.findMany = o[1]; }
};

test('room: a deleted or changed offered room is stale instead of opening the form with no room; a current one preselects it', async () => {
  await withRooms([], async () => assert.equal((await addToRoom(roomLaunch())).reasonCode, STALE, 'deleted'));
  await withRooms([{ id: 'room-1', name: 'Garage', updatedAt: new Date(UPDATED.getTime() + 1000) }], async () => {
    assert.equal((await addToRoom(roomLaunch({ contextVersion: roomContextVersion({ id: 'room-1', updatedAt: UPDATED }) }))).reasonCode, STALE, 'changed since offered');
  });
  await withRooms([{ id: 'room-1', name: 'Garage', updatedAt: UPDATED }], async () => {
    const ok = await addToRoom(roomLaunch({ contextVersion: roomContextVersion({ id: 'room-1', updatedAt: UPDATED }) }));
    assert.equal(ok.status, 'NEEDS_CONTEXT');
    assert.equal(ok.captureRequests[0].currentAnswer.roomId, 'room-1');
    const unstamped = await addToRoom(roomLaunch({ contextVersion: null }));
    assert.equal(unstamped.captureRequests[0].currentAnswer.roomId, 'room-1', 'a receipt with no stamped version checks existence only');
  });
});

test('room: the existing "Add an item" on a room card (no suggestion outcome) is unchanged', async () => {
  await withRooms([], async () => {
    const card = await addToRoom(roomLaunch({ outcomeKey: undefined }));
    assert.notEqual(card.reasonCode, STALE);
  });
});
