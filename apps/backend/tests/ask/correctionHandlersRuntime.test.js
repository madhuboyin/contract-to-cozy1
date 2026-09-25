const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Runtime (not source-shape) tests for the Phase 3 correction confirm handlers.
// prisma and the canonical writers are replaced with recording fakes BEFORE any
// handler runs, so the real registered handlers execute end to end without
// touching a database. The fake prisma throws on any model/method a test did not
// declare, so an unexpected read or write fails loudly instead of passing silently.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { roomCreateResult, inventoryItemCreateResult, roomRenameItemActions, HOME_EVENT_VISIBILITY_MESSAGE, EVIDENCE_ATTACH_MESSAGE } = require('../../src/services/ask/askOrchestrator.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');
const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');
const homeManagement = require('../../src/services/home-management.service.ts');
const coverageAnalysis = require('../../src/services/coverageAnalysis.service.ts');
const riskPremium = require('../../src/services/riskPremiumOptimizer.service.ts');
const doNothing = require('../../src/services/doNothingSimulator.service.ts');
const replaceRepair = require('../../src/services/replaceRepairAnalysis.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const captureWarrantyModule = require('../../src/modules/propertyContext/application/captureWarranty.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { editCaptureWarrantyCandidate, buildUserAddedEventConfirmation, editCaptureEventCandidate } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  updateRoom: InventoryService.prototype.updateRoom,
  createRoom: InventoryService.prototype.createRoom,
  createItem: InventoryService.prototype.createItem,
  updateItem: InventoryService.prototype.updateItem,
  updateHomeEvent: HomeEventsService.prototype.updateHomeEvent,
  createHomeEvent: HomeEventsService.prototype.createHomeEvent,
  setVisibility: HomeEventsService.prototype.setVisibility,
  attachDocument: HomeEventsService.prototype.attachDocument,
  updateWarranty: homeManagement.updateWarranty,
  markCoverage: coverageAnalysis.markCoverageAnalysisStale,
  markRisk: riskPremium.markRiskPremiumOptimizerStale,
  markDoNothing: doNothing.markDoNothingRunsStale,
  markItemCoverage: coverageAnalysis.markItemCoverageAnalysesStale,
  markReplaceRepair: replaceRepair.markReplaceRepairStale,
  resolveAccess: propertyAccess.resolvePropertyAccess,
  captureWarranty: captureWarrantyModule.captureWarranty,
};

let calls;
let models;
let accessRole = 'CONTRIBUTOR';

function install() {
  calls = { updateRoom: [], updateItem: [], updateHomeEvent: [], updateWarranty: [], markers: [], captureWarranty: [], createHomeEvent: [], createRoom: [], createItem: [], setVisibility: [], attachDocument: [] };
  accessRole = 'CONTRIBUTOR';
  models = {};
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return new Proxy({}, {
        get(_t, method) {
          if (!models[model][method]) throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`);
          return models[model][method];
        },
      });
    },
  });
  InventoryService.prototype.updateRoom = async function (...args) { calls.updateRoom.push(args); return {}; };
  InventoryService.prototype.updateItem = async function (...args) { calls.updateItem.push(args); return {}; };
  InventoryService.prototype.createItem = async function (...args) { calls.createItem.push(args); return { id: 'item-new', name: args[1].name }; };
  InventoryService.prototype.createRoom = async function (...args) { calls.createRoom.push(args); return { id: 'room-new', name: args[1].name }; };
  HomeEventsService.prototype.updateHomeEvent = async function (...args) { calls.updateHomeEvent.push(args); return { id: 'event-2', title: args[2].title ?? 'Roof replacement' }; };
  HomeEventsService.prototype.createHomeEvent = async function (...args) { calls.createHomeEvent.push(args); return { id: 'event-new', title: args[0].body.title }; };
  HomeEventsService.prototype.setVisibility = async function (...args) { calls.setVisibility.push(args); };
  HomeEventsService.prototype.attachDocument = async function (...args) {
    calls.attachDocument.push(args);
    return { id: 'link-1', documentId: args[0].documentId, eventId: args[0].eventId, document: { name: 'Invoice.pdf' }, event: { id: args[0].eventId, title: 'Roof replacement' } };
  };
  homeManagement.updateWarranty = async (...args) => { calls.updateWarranty.push(args); return {}; };
  coverageAnalysis.markCoverageAnalysisStale = async () => { calls.markers.push('coverage'); };
  riskPremium.markRiskPremiumOptimizerStale = async () => { calls.markers.push('risk'); };
  doNothing.markDoNothingRunsStale = async () => { calls.markers.push('doNothing'); };
  coverageAnalysis.markItemCoverageAnalysesStale = async () => { calls.markers.push('itemCoverage'); };
  replaceRepair.markReplaceRepairStale = async () => { calls.markers.push('replaceRepair'); };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  captureWarrantyModule.captureWarranty = async (...args) => { calls.captureWarranty.push(args); return { id: 'warranty-new' }; };
  // Reconciliation: no sibling/source executions to refresh.
  models.askExecution = { findMany: async () => [] };
}

function restore() {
  prismaModule.prisma = realPrisma;
  InventoryService.prototype.updateRoom = originals.updateRoom;
  InventoryService.prototype.createRoom = originals.createRoom;
  InventoryService.prototype.createItem = originals.createItem;
  InventoryService.prototype.updateItem = originals.updateItem;
  HomeEventsService.prototype.updateHomeEvent = originals.updateHomeEvent;
  HomeEventsService.prototype.createHomeEvent = originals.createHomeEvent;
  HomeEventsService.prototype.setVisibility = originals.setVisibility;
  HomeEventsService.prototype.attachDocument = originals.attachDocument;
  homeManagement.updateWarranty = originals.updateWarranty;
  coverageAnalysis.markCoverageAnalysisStale = originals.markCoverage;
  riskPremium.markRiskPremiumOptimizerStale = originals.markRisk;
  doNothing.markDoNothingRunsStale = originals.markDoNothing;
  coverageAnalysis.markItemCoverageAnalysesStale = originals.markItemCoverage;
  replaceRepair.markReplaceRepairStale = originals.markReplaceRepair;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
  captureWarrantyModule.captureWarranty = originals.captureWarranty;
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const EXECUTION_CREATED_AT = new Date('2026-09-20T00:00:00.000Z');
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId, createdAt: EXECUTION_CREATED_AT });
const invoke = (operationId, parameters, userId = 'u1') => confirmCapabilityInvoke(operationId, {
  userId, execution: execution(operationId), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation(operationId),
});
const codeOf = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test.beforeEach(install);
test.afterEach(restore);

// ───────────────────────────── ROOM_RENAME ─────────────────────────────
const roomUpdatedAt = new Date('2026-09-01T00:00:00.000Z');
const roomVersion = sha(`room-1:${roomUpdatedAt.toISOString()}`);
const roomParams = (value = 'Chef kitchen', version = roomVersion) => ({ roomRename: { roomId: 'room-1', value }, roomRenameContextVersion: version, confirmationVersion: 2 });
function roomModel({ name = 'Kitchen', clash = false, missing = false, type = 'KITCHEN', floorLevel = null } = {}) {
  models.inventoryRoom = {
    findFirst: async ({ where }) => {
      if (where.id && where.id.not) return clash ? { id: 'room-other' } : null; // name-uniqueness probe
      return missing ? null : { id: 'room-1', propertyId: 'p1', name, type, floorLevel, updatedAt: roomUpdatedAt };
    },
  };
}

test('ROOM_RENAME confirm renames through updateRoom with a narrowed { name } patch and repeats the controller stale-analysis markers', async () => {
  roomModel();
  const { result, artifactType, artifactId } = await invoke('ROOM_RENAME', roomParams());
  assert.deepEqual(calls.updateRoom, [['p1', 'room-1', { name: 'Chef kitchen' }]]);
  assert.deepEqual([...calls.markers].sort(), ['coverage', 'doNothing', 'risk']);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.reasonCode, 'ROOM_RENAMED');
  assert.equal(artifactType, 'INVENTORY_ROOM');
  assert.equal(artifactId, 'room-1');
});

test('ROOM_RENAME confirm trims the name and rejects a blank one without writing', async () => {
  roomModel();
  await invoke('ROOM_RENAME', roomParams('  Pantry  '));
  assert.deepEqual(calls.updateRoom[0][2], { name: 'Pantry' });
  install(); roomModel();
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomParams('   '))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.updateRoom.length, 0);
});

test('ROOM_RENAME confirm blocks a stale context version, a name already used by another room, and a deleted room -- without writing', async () => {
  roomModel();
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomParams('Chef kitchen', 'stale-version'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  install(); roomModel({ clash: true });
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomParams())), 'ASK_INVALID_CONFIRMATION_EDIT');
  install(); roomModel({ missing: true });
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomParams())), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.updateRoom.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('ROOM_RENAME confirm treats an already-applied name as done: no second write even though the version has moved on', async () => {
  roomModel({ name: 'Chef kitchen' });
  const { result } = await invoke('ROOM_RENAME', roomParams('Chef kitchen', 'version-from-before-the-first-write'));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.updateRoom.length, 0);
  assert.equal(calls.markers.length, 0);
});

// ── ROOM_RENAME extended: room type and floor level ──
const roomFieldParams = (field, value, version = roomVersion) => ({ roomRename: { roomId: 'room-1', field, value }, roomRenameContextVersion: version, confirmationVersion: 2 });

test('room type correction writes a { type } patch only, repeats the stale markers, and shows the previous and new type', async () => {
  roomModel({ type: 'KITCHEN' });
  const { result, artifactId } = await invoke('ROOM_RENAME', roomFieldParams('type', 'OFFICE'));
  assert.deepEqual(calls.updateRoom, [['p1', 'room-1', { type: 'OFFICE' }]]);
  assert.deepEqual([...calls.markers].sort(), ['coverage', 'doNothing', 'risk']);
  assert.equal(result.reasonCode, 'ROOM_CORRECTED');
  assert.equal(result.blocks[0].title, 'Room updated');
  assert.deepEqual(result.blocks[0].details.map((detail) => [detail.label, detail.value]), [['Room', 'Kitchen'], ['Field', 'type'], ['Previous value', 'Kitchen'], ['New value', 'Office']]);
  assert.equal(artifactId, 'room-1');
});

test('floor level correction writes a numeric { floorLevel } patch in canonical form ("01" is 1, "-0" is 0)', async () => {
  roomModel({ floorLevel: null });
  await invoke('ROOM_RENAME', roomFieldParams('floorLevel', ' 01 '));
  assert.deepEqual(calls.updateRoom[0][2], { floorLevel: 1 });
  install(); roomModel({ floorLevel: 2 });
  const { result } = await invoke('ROOM_RENAME', roomFieldParams('floorLevel', '-1'));
  assert.deepEqual(calls.updateRoom[0][2], { floorLevel: -1 });
  assert.equal(result.blocks[0].details.find((detail) => detail.label === 'New value').value, '-1 (below ground)');
  assert.equal(result.blocks[0].details.find((detail) => detail.label === 'Previous value').value, '2');
  install(); roomModel({ floorLevel: 3 });
  await invoke('ROOM_RENAME', roomFieldParams('floorLevel', '-0'));
  assert.deepEqual(calls.updateRoom[0][2], { floorLevel: 0 });
});

test('type and floor level reject values outside the allowed set without writing', async () => {
  for (const [field, bad] of [['type', 'GARDEN'], ['type', ''], ['type', 'office'], ['floorLevel', '1.5'], ['floorLevel', 'two'], ['floorLevel', '51'], ['floorLevel', '-6'], ['floorLevel', ''], ['floorLevel', '1e2']]) {
    install(); roomModel();
    assert.equal(await codeOf(invoke('ROOM_RENAME', roomFieldParams(field, bad))), 'ASK_INVALID_CONFIRMATION_EDIT', `${field}=${JSON.stringify(bad)}`);
    assert.equal(calls.updateRoom.length, 0);
    assert.equal(calls.markers.length, 0);
  }
  install(); roomModel();
  for (const [field, ok] of [['floorLevel', '50'], ['floorLevel', '-5'], ['type', 'BASEMENT']]) {
    install(); roomModel();
    await invoke('ROOM_RENAME', roomFieldParams(field, ok));
    assert.equal(calls.updateRoom.length, 1, `${field}=${ok} is allowed`);
  }
});

test('type and floor level: a stale version or a deleted room blocks the write; an already-applied value is done without a second write', async () => {
  roomModel();
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomFieldParams('type', 'OFFICE', 'stale-version'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  install(); roomModel({ missing: true });
  assert.equal(await codeOf(invoke('ROOM_RENAME', roomFieldParams('floorLevel', '2'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.updateRoom.length, 0);
  install(); roomModel({ type: 'OFFICE', floorLevel: 2 });
  for (const [field, value] of [['type', 'OFFICE'], ['floorLevel', '2']]) {
    const { result } = await invoke('ROOM_RENAME', roomFieldParams(field, value, 'version-from-before-the-first-write'));
    assert.equal(result.blocks[0].details.find((detail) => detail.label === 'Previous value').value, 'Already corrected');
  }
  assert.equal(calls.updateRoom.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('a proposal stored before type and floor level existed (no field) still confirms as a rename', async () => {
  roomModel();
  const { result } = await invoke('ROOM_RENAME', { roomRename: { roomId: 'room-1', value: 'Chef kitchen' }, roomRenameContextVersion: roomVersion, confirmationVersion: 2 });
  assert.deepEqual(calls.updateRoom[0][2], { name: 'Chef kitchen' });
  assert.equal(result.reasonCode, 'ROOM_RENAMED');
});

const proposeRoom = async (message, entityId = 'room-1') => {
  models.inventoryRoom = { findMany: async () => [{ id: 'room-1', name: 'Kitchen', type: 'KITCHEN', floorLevel: 1, updatedAt: roomUpdatedAt }, { id: 'room-2', name: 'Floor 2 office', type: 'OFFICE', floorLevel: null, updatedAt: roomUpdatedAt }] };
  return capabilityInvoke('ROOM_RENAME', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ROOM', entityId, operationId: 'ROOM_RENAME' } });
};

test('room propose: each field builds the matching editable field starting from the recorded value, and writes nothing', async () => {
  const cases = [
    ['Rename this room.', 'TEXT', 'Kitchen', undefined, undefined],
    ['Change the type of this room.', 'SELECT', 'KITCHEN', ['KITCHEN', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'DINING', 'LAUNDRY', 'GARAGE', 'OFFICE', 'BASEMENT', 'OTHER'], 'Kitchen'],
    ['Change the floor level of this room.', 'TEXT', '1', undefined, '1'],
  ];
  for (const [message, type, value, optionValues, currentShown] of cases) {
    const result = await proposeRoom(message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', message);
    const [field] = result.confirmation.editableFields;
    assert.equal(field.type, type, message);
    assert.equal(field.value, value, message);
    assert.deepEqual(field.options?.map((option) => option.value), optionValues, message);
    if (currentShown !== undefined) assert.equal(result.confirmation.fields.find((entry) => entry.label === 'Current value').value, currentShown, message);
    assert.equal(calls.updateRoom.length, 0, 'proposing writes nothing');
  }
  const noFloor = await proposeRoom('Change the floor level of this room.', 'room-2');
  assert.equal(noFloor.confirmation.fields.find((entry) => entry.label === 'Current value').value, 'Not recorded');
  assert.equal(noFloor.confirmation.editableFields[0].value, '');
});

test('room propose: "rename" always means the name, even for a room called "Floor 2 office"', async () => {
  const result = await proposeRoom('Rename the Floor 2 office to Studio', 'room-2');
  assert.equal(result.confirmation.editableFields[0].label, 'New room name');
  assert.equal(result.parameters.roomRename.field, 'name');
  assert.equal(result.parameters.roomRename.value, 'Studio');
});

test('room actions: a contributor gets rename, type and floor level (all pinned to the operation, three stay inline); a viewer gets none', () => {
  const actions = roomRenameItemActions(true);
  assert.deepEqual(actions.map((action) => [action.id, action.message]), [
    ['rename-room', 'Rename this room.'], ['correct-room-type', 'Change the type of this room.'], ['correct-room-floorLevel', 'Change the floor level of this room.'],
  ]);
  assert.ok(actions.every((action) => action.operationId === 'ROOM_RENAME' && action.interactionType === 'MUTATE_RECORD'));
  assert.ok(actions.length <= 3, 'more than three would fold behind the disclosure');
  assert.equal(roomRenameItemActions(false), undefined);
});

// ───────────────────────────── HOME_EVENT_VISIBILITY ─────────────────────────────
const visibilityParams = (value, version = eventVersion, eventId = 'event-1') => ({ homeEventVisibility: { eventId, value }, homeEventVisibilityContextVersion: version, confirmationVersion: 2 });

test('HOME_EVENT_VISIBILITY confirm writes through setVisibility in place (no supersede) and repeats nothing else', async () => {
  eventModel();
  const { result, artifactType, artifactId } = await invoke('HOME_EVENT_VISIBILITY', visibilityParams('RESALE_PACK'));
  assert.deepEqual(calls.setVisibility, [[{ propertyId: 'p1', eventId: 'event-1', visibility: 'RESALE_PACK' }]]);
  assert.equal(calls.updateHomeEvent.length, 0, 'visibility never supersedes the event');
  assert.equal(result.reasonCode, 'HOME_EVENT_VISIBILITY_CHANGED');
  assert.equal(result.blocks[0].title, 'Visibility changed');
  assert.deepEqual([artifactType, artifactId], ['HOME_EVENT', 'event-1'], 'the id is unchanged, unlike a superseding correction');
});

test('HOME_EVENT_VISIBILITY confirm treats the same value as already applied, with no write', async () => {
  eventModel();
  const { result } = await invoke('HOME_EVENT_VISIBILITY', visibilityParams('HOUSEHOLD'));
  assert.equal(calls.setVisibility.length, 0);
  assert.equal(result.blocks[0].title, 'Visibility already set');
});

test('HOME_EVENT_VISIBILITY confirm: any contributor may move between HOUSEHOLD and RESALE_PACK, but only the creator may change to or from PRIVATE', async () => {
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE' } });
  await invoke('HOME_EVENT_VISIBILITY', visibilityParams('RESALE_PACK'));
  assert.equal(calls.setVisibility.length, 1, 'a non-creator may move between non-private levels');
  install(); eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE' } });
  assert.equal(await codeOf(invoke('HOME_EVENT_VISIBILITY', visibilityParams('PRIVATE'))), 'ASK_PERMISSION_REQUIRED', 'a non-creator cannot make it private');
  assert.equal(calls.setVisibility.length, 0);
  install(); eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'PRIVATE', createdById: 'u1', datePrecision: 'EXACT_DATE' } });
  await invoke('HOME_EVENT_VISIBILITY', visibilityParams('HOUSEHOLD'));
  assert.equal(calls.setVisibility.length, 1, 'the creator may move their own private event out of private');
});

test('HOME_EVENT_VISIBILITY confirm blocks a stale revision, someone else\'s private event, and an invalid value; nothing is written', async () => {
  eventModel();
  assert.equal(await codeOf(invoke('HOME_EVENT_VISIBILITY', visibilityParams('RESALE_PACK', sha('event-1:2')))), 'ASK_CONTEXT_VERSION_CONFLICT');
  install(); eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'PRIVATE', createdById: 'u9', datePrecision: 'EXACT_DATE' } });
  assert.equal(await codeOf(invoke('HOME_EVENT_VISIBILITY', visibilityParams('HOUSEHOLD'))), 'ASK_CONTEXT_VERSION_CONFLICT', 'a non-creator cannot even target someone else\'s private event');
  install(); eventModel();
  for (const bad of [{ homeEventVisibility: { eventId: 'event-1', value: null }, homeEventVisibilityContextVersion: eventVersion, confirmationVersion: 2 }, { homeEventVisibility: { eventId: 'event-1', value: 'SHARE_LINK' }, homeEventVisibilityContextVersion: eventVersion, confirmationVersion: 2 }, { homeEventVisibility: { eventId: 'event-1' }, homeEventVisibilityContextVersion: eventVersion, confirmationVersion: 2 }]) {
    assert.equal(await codeOf(confirmCapabilityInvoke('HOME_EVENT_VISIBILITY', { userId: 'u1', execution: execution('HOME_EVENT_VISIBILITY'), parameters: bad, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('HOME_EVENT_VISIBILITY') })), 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(bad));
  }
  assert.equal(calls.setVisibility.length, 0);
});

const proposeVisibility = async (message = HOME_EVENT_VISIBILITY_MESSAGE, entityId = 'event-1') => {
  eventModel();
  return capabilityInvoke('HOME_EVENT_VISIBILITY', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId, operationId: 'HOME_EVENT_VISIBILITY' } });
};

test('HOME_EVENT_VISIBILITY propose starts from the event\'s current visibility, offers all three levels, and writes nothing', async () => {
  const result = await proposeVisibility();
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.confirmation.editableFields[0].value, 'HOUSEHOLD');
  assert.deepEqual(result.confirmation.editableFields[0].options.map((option) => option.value), ['PRIVATE', 'HOUSEHOLD', 'RESALE_PACK']);
  assert.equal(result.confirmation.fields.find((field) => field.label === 'Current visibility').value, 'Household (everyone with access to this home)');
  assert.equal(calls.setVisibility.length, 0);
});

test('HOME_EVENT_VISIBILITY: the resale-pack consent line names buyers and listing agents; other values use the plain consent line', async () => {
  const householdPrompt = await proposeVisibility();
  assert.match(householdPrompt.confirmation.consentText, /I authorize this visibility change to the shared home timeline/);
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'RESALE_PACK', createdById: 'u9', datePrecision: 'EXACT_DATE' } });
  const resalePrompt = await capabilityInvoke('HOME_EVENT_VISIBILITY', { userId: 'u1', propertyId: 'p1', message: HOME_EVENT_VISIBILITY_MESSAGE, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'event-1', operationId: 'HOME_EVENT_VISIBILITY' } });
  assert.match(resalePrompt.confirmation.consentText, /buyers and listing agents/);
});

test('HOME_EVENT_VISIBILITY: a read question about who can see an event does not route here, and PRIVATE events are excluded from the disambiguation list for a non-creator', async () => {
  models.homeEvent = { findMany: async () => [{ id: 'event-1', title: 'Roof replacement', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', occurredAt: new Date('2026-09-01T00:00:00.000Z') }] };
  const noEntity = await capabilityInvoke('HOME_EVENT_VISIBILITY', { userId: 'u1', propertyId: 'p1', message: HOME_EVENT_VISIBILITY_MESSAGE, launchContext: { surface: 'ASK_WORKSPACE' } });
  assert.equal(noEntity.reasonCode, 'HOME_EVENT_TARGET_REQUIRED');
  // The query itself is the exclusion; a PRIVATE row belonging to someone else must not appear in the disambiguation list.
  assert.equal(noEntity.blocks[0].sections[0].items.length, 1);
});

// ───────────────────────────── WARRANTY_CORRECT ─────────────────────────────
const warrantyUpdatedAt = new Date('2026-09-02T00:00:00.000Z');
const warrantyVersion = sha(`w1:${warrantyUpdatedAt.toISOString()}`);
function warrantyModel({ ownerUserId = 'u1', providerName = 'Acme Home Warranty', expiryDate = new Date('2027-12-01T00:00:00.000Z') } = {}) {
  const row = {
    id: 'w1', propertyId: 'p1', providerName, startDate: new Date('2026-01-01T00:00:00.000Z'), expiryDate, updatedAt: warrantyUpdatedAt,
    category: 'HOME_WARRANTY_PLAN', policyNumber: 'POL-123', cost: '450', coverageDetails: 'HVAC and appliances.', homeownerProfile: { id: 'hp1', userId: ownerUserId },
  };
  models.warranty = { findFirst: async () => row, findUniqueOrThrow: async () => row, findMany: async () => [row] };
}
const warrantyParams = (field, value, version = warrantyVersion) => ({ warrantyCorrection: { warrantyId: 'w1', field, value }, warrantyCorrectionContextVersion: version, confirmationVersion: 2 });

test('WARRANTY_CORRECT confirm by the owner writes only the confirmed field, scoped to the owning profile', async () => {
  warrantyModel();
  const { result, artifactType } = await invoke('WARRANTY_CORRECT', warrantyParams('expiryDate', '2028-06-30'));
  assert.equal(calls.updateWarranty.length, 1);
  const [warrantyId, profileId, patch] = calls.updateWarranty[0];
  assert.equal(warrantyId, 'w1');
  assert.equal(profileId, 'hp1');
  assert.deepEqual(Object.keys(patch), ['expiryDate']);
  assert.equal(patch.expiryDate.toISOString(), '2028-06-30T00:00:00.000Z');
  assert.equal(result.reasonCode, 'WARRANTY_CORRECTED');
  assert.equal(artifactType, 'WARRANTY');

  install(); warrantyModel();
  await invoke('WARRANTY_CORRECT', warrantyParams('providerName', '  Better Home Warranty '));
  assert.deepEqual(calls.updateWarranty[0][2], { providerName: 'Better Home Warranty' });
});

test('WARRANTY_CORRECT confirm refuses a member who did not add the warranty, even with a valid version and CONTRIBUTOR access', async () => {
  warrantyModel({ ownerUserId: 'someone-else' });
  assert.equal(await codeOf(invoke('WARRANTY_CORRECT', warrantyParams('expiryDate', '2028-06-30'))), 'ASK_PERMISSION_REQUIRED');
  assert.equal(calls.updateWarranty.length, 0);
});

test('WARRANTY_CORRECT confirm rejects an expiry before the start date, a too-short provider, and a stale version', async () => {
  warrantyModel();
  assert.equal(await codeOf(invoke('WARRANTY_CORRECT', warrantyParams('expiryDate', '2025-12-31'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await codeOf(invoke('WARRANTY_CORRECT', warrantyParams('providerName', 'A'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await codeOf(invoke('WARRANTY_CORRECT', warrantyParams('expiryDate', '2028-06-30', 'stale'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.updateWarranty.length, 0);
});

test('WARRANTY_CORRECT confirm treats an already-applied value as done without a second write', async () => {
  warrantyModel({ expiryDate: new Date('2028-06-30T00:00:00.000Z') });
  const { result } = await invoke('WARRANTY_CORRECT', warrantyParams('expiryDate', '2028-06-30', 'version-from-before'));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.updateWarranty.length, 0);
});

// ───────────────────────────── INVENTORY_ITEM_CORRECT ─────────────────────────────
const itemUpdatedAt = new Date('2026-09-03T00:00:00.000Z');
const itemVersion = sha(`item-1:${itemUpdatedAt.toISOString()}`);
function itemModel({ installedOn = new Date('2022-01-15T00:00:00.000Z'), missing = false, ...overrides } = {}) {
  const row = {
    id: 'item-1', propertyId: 'p1', name: 'Water heater', installedOn, purchasedOn: null, lastServicedOn: null, updatedAt: itemUpdatedAt,
    condition: 'GOOD', brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', purchaseCostCents: 85000, replacementCostCents: null, notes: 'Basement utility closet.',
    category: 'PLUMBING', roomId: null,
    ...overrides,
  };
  models.inventoryItem = { findFirst: async () => (missing ? null : row), findUniqueOrThrow: async () => row };
}
const itemParams = (value, version = itemVersion, field = 'installedOn') => ({ inventoryCorrection: { itemId: 'item-1', field, value }, inventoryCorrectionContextVersion: version, confirmationVersion: 2 });

test('INVENTORY_ITEM_CORRECT confirm writes only the confirmed date field through updateItem and reconciles', async () => {
  itemModel();
  const { result, artifactId } = await invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15'));
  assert.deepEqual(calls.updateItem, [['p1', 'item-1', { installedOn: '2021-03-15' }]]);
  assert.equal(result.reasonCode, 'INVENTORY_ITEM_CORRECTED');
  assert.equal(artifactId, 'item-1');
});

test('INVENTORY_ITEM_CORRECT confirm rejects a missing date, a stale version and a deleted item; an already-applied date is not rewritten', async () => {
  itemModel();
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams(null))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15', 'stale'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  install(); itemModel({ missing: true });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(calls.updateItem.length, 0);
  install(); itemModel({ installedOn: new Date('2021-03-15T00:00:00.000Z') });
  const { result } = await invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15', 'version-from-before'));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.updateItem.length, 0);
});

// ───────────────────────────── HOME_EVENT_CORRECT ─────────────────────────────
const eventVersion = sha('event-1:3');
function eventModel({ current = { id: 'event-1', title: 'Roof replacement', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', occurredAt: new Date('2026-09-01T00:00:00.000Z'), summary: 'Full tear-off.', amount: '18500', type: 'IMPROVEMENT', importance: 'NORMAL', roomId: null, inventoryItemId: null }, winner = null } = {}) {
  models.homeEvent = { findFirst: async ({ where }) => (where.idempotencyKey ? winner : where.id === 'event-1' ? current : null), findMany: async () => [current] };
}
const eventParams = (field, value, version = eventVersion) => ({ homeEventCorrection: { eventId: 'event-1', field, value }, homeEventCorrectionContextVersion: version, confirmationVersion: 2 });

test('HOME_EVENT_CORRECT confirm supersedes through updateHomeEvent with the ask-correction idempotency key and the replacement id', async () => {
  eventModel();
  const { result, artifactType, artifactId } = await invoke('HOME_EVENT_CORRECT', eventParams('title', ' Roof replacement (full tear-off) '));
  assert.equal(calls.updateHomeEvent.length, 1);
  const [propertyId, eventId, patch, userId, options] = calls.updateHomeEvent[0];
  assert.deepEqual([propertyId, eventId, userId], ['p1', 'event-1', 'u1']);
  assert.equal(patch.title, 'Roof replacement (full tear-off)');
  assert.ok(patch.correctionReason);
  assert.deepEqual(options, { idempotencyKey: 'ask-correction:exec-1' });
  assert.equal(result.reasonCode, 'EVENT_CORRECTED');
  assert.equal(artifactType, 'HOME_EVENT');
  assert.equal(artifactId, 'event-2', 'the receipt must carry the replacement id, not the superseded one');
});

test('HOME_EVENT_CORRECT confirm records EXACT_DATE precision and an ISO datetime for a date correction', async () => {
  eventModel({ current: { id: 'event-1', title: 'Roof replacement', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'YEAR' } });
  await invoke('HOME_EVENT_CORRECT', eventParams('occurredAt', '2026-08-15'));
  assert.deepEqual([calls.updateHomeEvent[0][2].occurredAt, calls.updateHomeEvent[0][2].datePrecision], ['2026-08-15T00:00:00.000Z', 'EXACT_DATE']);
});

test('HOME_EVENT_CORRECT confirm replays a retried execution to its own earlier replacement instead of superseding again', async () => {
  eventModel({ winner: { id: 'event-2', title: 'Roof replacement (full tear-off)' } });
  const { result, artifactId } = await invoke('HOME_EVENT_CORRECT', eventParams('title', 'Roof replacement (full tear-off)'));
  assert.equal(calls.updateHomeEvent.length, 0);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(artifactId, 'event-2');
});

test('HOME_EVENT_CORRECT confirm blocks a stale revision, someone else\'s private event, a range-precision date correction, and an invalid title', async () => {
  eventModel();
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams('title', 'New title', sha('event-1:2')))), 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams('title', 'ab'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  install(); eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'PRIVATE', createdById: 'u9', datePrecision: 'EXACT_DATE' } });
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams('title', 'New title'))), 'ASK_CONTEXT_VERSION_CONFLICT');
  install(); eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'RANGE' } });
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams('occurredAt', '2026-08-15'))), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.updateHomeEvent.length, 0);
});

test('HOME_EVENT_CORRECT confirm lets the creator correct their own PRIVATE event', async () => {
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'PRIVATE', createdById: 'u1', datePrecision: 'EXACT_DATE' } });
  await invoke('HOME_EVENT_CORRECT', eventParams('title', 'New title'));
  assert.equal(calls.updateHomeEvent.length, 1);
});

// ── HOME_EVENT_CORRECT extended: room and inventory item links ──
const KITCHEN = { id: 'room-1', name: 'Kitchen' };
const WATER_HEATER = { id: 'item-1', name: 'Water heater' };
function linkModels({ rooms = [KITCHEN], items = [WATER_HEATER], roomExists = true, itemExists = true } = {}) {
  models.inventoryRoom = { findMany: async () => rooms, findFirst: async () => (roomExists ? { id: KITCHEN.id } : null) };
  models.inventoryItem = { findMany: async () => items, findFirst: async () => (itemExists ? { id: WATER_HEATER.id } : null) };
}
const linkParams = (field, value, version = eventVersion) => ({ homeEventCorrection: { eventId: 'event-1', field, value }, homeEventCorrectionContextVersion: version, confirmationVersion: 2 });

test('HOME_EVENT_CORRECT confirm links a room/item through updateHomeEvent, and maps the "No room"/"No item" sentinel to null', async () => {
  linkModels();
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', roomId: null, inventoryItemId: null } });
  await invoke('HOME_EVENT_CORRECT', linkParams('roomId', 'room-1'));
  assert.deepEqual(calls.updateHomeEvent[0][2].roomId, 'room-1');
  install(); linkModels();
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', roomId: 'room-1', inventoryItemId: null } });
  await invoke('HOME_EVENT_CORRECT', linkParams('roomId', 'NONE'));
  assert.deepEqual(calls.updateHomeEvent[0][2].roomId, null, '"No room" unlinks rather than writing the sentinel string');
  install(); linkModels();
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', roomId: null, inventoryItemId: null } });
  await invoke('HOME_EVENT_CORRECT', linkParams('inventoryItemId', 'item-1'));
  assert.deepEqual(calls.updateHomeEvent[0][2].inventoryItemId, 'item-1');
});

test('HOME_EVENT_CORRECT confirm rejects a room/item id that is not in this property (a stale, deleted, or cross-property id), without writing', async () => {
  linkModels({ roomExists: false });
  eventModel();
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', linkParams('roomId', 'someone-elses-room'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  install(); linkModels({ itemExists: false });
  eventModel();
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', linkParams('inventoryItemId', 'someone-elses-item'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.updateHomeEvent.length, 0);
});

test('HOME_EVENT_CORRECT propose offers "No room"/"No item" plus the property\'s own rooms/items, pre-selecting the event\'s current link', async () => {
  linkModels();
  eventModel({ current: { id: 'event-1', title: 'Roof', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', roomId: 'room-1', inventoryItemId: null } });
  const roomPrompt = await capabilityInvoke('HOME_EVENT_CORRECT', { userId: 'u1', propertyId: 'p1', message: 'Correct the room of this timeline event.', launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'event-1', operationId: 'HOME_EVENT_CORRECT' } });
  assert.deepEqual(roomPrompt.confirmation.editableFields[0].options.map((option) => option.value), ['NONE', 'room-1']);
  assert.equal(roomPrompt.confirmation.editableFields[0].value, 'room-1', 'pre-selects the currently linked room');
  assert.equal(roomPrompt.confirmation.fields.find((field) => field.label === 'Current value').value, 'Kitchen');
  const itemPrompt = await capabilityInvoke('HOME_EVENT_CORRECT', { userId: 'u1', propertyId: 'p1', message: 'Correct the inventory item of this timeline event.', launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'event-1', operationId: 'HOME_EVENT_CORRECT' } });
  assert.equal(itemPrompt.confirmation.editableFields[0].value, 'NONE', 'no item linked yet, so "No item" is pre-selected');
  assert.equal(itemPrompt.confirmation.fields.find((field) => field.label === 'Current value').value, 'Not recorded');
  assert.equal(calls.updateHomeEvent.length, 0, 'proposing writes nothing');
});

test('HOME_EVENT_CORRECT edit re-validates a link value against live data and rebuilds a fresh option list (source-shape, like every other edit handler in this file)', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readAskOrchestratorSources();
  const body = (startMarker, endMarker) => source.slice(source.indexOf(startMarker), source.indexOf(endMarker, source.indexOf(startMarker)));
  const edit = body('async function editHomeEventCorrectConfirmation(', 'const EDIT_CONFIRMATION_HANDLERS');
  assert.match(edit, /await homeEventCorrectionValueError\(execution\.propertyId!, existing\.data\.field, input\.edits\.value\)/, 'the edited value is re-validated against live data, not the stale proposal');
  assert.match(edit, /HOME_EVENT_LINK_FIELDS\.has\(existing\.data\.field\)/, 'a link field fetches a fresh option list on every edit');
  assert.match(edit, /homeEventLinkOptions\(execution\.propertyId!, existing\.data\.field as 'roomId' \| 'inventoryItemId'\)/);
});

test('the room/item existence check and the option list are both scoped to this property, not just any record with that id', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readAskOrchestratorSources();
  const body = (startMarker, endMarker) => source.slice(source.indexOf(startMarker), source.indexOf(endMarker, source.indexOf(startMarker)));
  const valueError = body('async function homeEventCorrectionValueError(', 'async function homeEventLinkOptions(');
  assert.match(valueError, /prisma\.inventoryRoom\.findFirst\(\{ where: \{ id: value, propertyId \}/, 'a room id from another property must be rejected, not just any existing room id');
  assert.match(valueError, /prisma\.inventoryItem\.findFirst\(\{ where: \{ id: value, propertyId, \.\.\.visibleInventoryItemWhere\(\) \}/, 'an item id from another property must be rejected, not just any existing item id');
  const options = body('async function homeEventLinkOptions(', '// Why this event cannot take this correction, or null.');
  assert.match(options, /prisma\.inventoryRoom\.findMany\(\{ where: \{ propertyId \}/, 'the room dropdown must only list this property\'s own rooms');
  assert.match(options, /prisma\.inventoryItem\.findMany\(\{ where: \{ propertyId, \.\.\.visibleInventoryItemWhere\(\) \}/, 'the item dropdown must only list this property\'s own visible items');
});

test('room actions: routing reaches HOME_EVENT_CORRECT for the two link fields and stays a read for a bare question', () => {
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  assert.equal(routeOf('Correct the room of this timeline event.'), 'HOME_EVENT_CORRECT');
  assert.equal(routeOf('Correct the inventory item of this timeline event.'), 'HOME_EVENT_CORRECT');
  assert.notEqual(routeOf('What room is the roof replacement linked to?'), 'HOME_EVENT_CORRECT');
});


// ───────────────────────────── ADD A WARRANTY (user-initiated capture) ─────────────────────────────
const addEnvelope = (launchContext) => ({ userId: 'u1', propertyId: 'p1', message: 'Add a warranty to my home record.', launchContext });
const declaredAdd = { surface: 'ASK_WORKSPACE', operationId: 'CAPTURE_WARRANTY_CONFIRM', sourceExecutionId: 'source-summary-1' };

test('Add a warranty: the declared action returns the empty capture form, reusing the edit-before-confirm key and carrying the source list', async () => {
  const result = await capabilityInvoke('CAPTURE_WARRANTY_CONFIRM', addEnvelope(declaredAdd));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'WARRANTY_ADD_INPUT_REQUIRED');
  assert.equal(result.parameters.captureOrigin, 'USER_ADD');
  assert.equal(result.parameters.sourceExecutionId, 'source-summary-1');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'CAPTURE_WARRANTY_EDIT', 'submitting must go through the existing edit-before-confirm branch');
  assert.equal(request.requirementId, 'capture-warranty-edit');
  assert.equal(request.classification, 'WORKFLOW_INPUT', 'the submit button must say "Continue to review", not "Save"');
  assert.equal(request.expectedContextVersion, result.contextVersion, 'the submit branch compares the execution context version to the request');
  assert.deepEqual(request.inputSchema.fields.map((field) => field.key), ['providerName', 'category', 'policyNumber', 'coverageDetails', 'cost', 'startDate', 'expiryDate']);
  assert.ok(request.currentAnswer && Object.values(request.currentAnswer).every((value) => value === null), 'nothing is pre-filled');
  assert.equal(calls.captureWarranty.length, 0, 'proposing writes nothing');
});

test('Add a warranty: a refresh, a message that merely names the operation, or a missing declared action keeps the original not-routable boundary', async () => {
  for (const launchContext of [
    { surface: 'ASK_REFRESH', sourceExecutionId: 'exec-1' },
    { surface: 'ASK_WORKSPACE', operationId: 'PROPERTY_SUMMARY' },
    undefined,
  ]) {
    const result = await capabilityInvoke('CAPTURE_WARRANTY_CONFIRM', addEnvelope(launchContext));
    assert.equal(result.reasonCode, 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE', JSON.stringify(launchContext));
    assert.equal(result.captureRequests, undefined);
  }
  const typed = await capabilityInvoke('CAPTURE_WARRANTY_CONFIRM', { ...addEnvelope(declaredAdd), message: 'I bought a warranty from Acme' });
  assert.equal(typed.reasonCode, 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE');
});

test('Add a warranty: a viewer is blocked before any form is offered', async () => {
  accessRole = 'VIEWER';
  const result = await capabilityInvoke('CAPTURE_WARRANTY_CONFIRM', addEnvelope(declaredAdd));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED');
  assert.equal(result.captureRequests, undefined);
});

const addAnswer = { providerName: '  Acme Home Warranty ', category: 'HOME_WARRANTY_PLAN', policyNumber: 'POL-123', coverageDetails: null, cost: 450, startDate: '2026-01-01', expiryDate: '2027-12-01' };

test('Add a warranty: submitting the form builds a confirmation with user-entered copy and the ISO-dated parameters the confirm handler reads', () => {
  const stored = { captureOrigin: 'USER_ADD', sourceExecutionId: 'source-summary-1' };
  const edited = editCaptureWarrantyCandidate(stored, 'Add a warranty to my home record.', 'ctx-1', addAnswer, new Date('2026-09-21T00:00:00.000Z'));
  assert.equal(edited.status, 'NEEDS_CONFIRMATION');
  assert.equal(edited.parameters.providerName, 'Acme Home Warranty');
  assert.equal(edited.parameters.startDate, '2026-01-01T00:00:00.000Z');
  assert.equal(edited.parameters.expiryDate, '2027-12-01T00:00:00.000Z');
  assert.equal(edited.parameters.captureOrigin, 'USER_ADD');
  assert.equal(edited.parameters.sourceExecutionId, 'source-summary-1', 'the source list must survive to confirm so it can be reconciled');
  assert.equal(edited.parameters.confirmationVersion, 1);
  assert.match(edited.confirmation.description, /You entered these details/);
  assert.doesNotMatch(JSON.stringify(edited.blocks) + edited.confirmation.description, /noticed you mentioned/);
});

test('Add a warranty: the extraction path keeps its original "Cozy noticed" copy, and an expiry that is not after the start is rejected', () => {
  const extracted = editCaptureWarrantyCandidate({ providerName: 'Acme' }, 'My Acme warranty lasts a year', 'ctx-1', addAnswer, new Date('2026-09-21T00:00:00.000Z'));
  assert.match(extracted.confirmation.description, /Cozy noticed you mentioned: "My Acme warranty lasts a year"/);
  assert.equal(editCaptureWarrantyCandidate({ captureOrigin: 'USER_ADD' }, 'x', 'ctx-1', { ...addAnswer, expiryDate: '2026-01-01' }, new Date()), null);
  assert.equal(editCaptureWarrantyCandidate({ captureOrigin: 'USER_ADD' }, 'x', 'ctx-1', { ...addAnswer, providerName: '' }, new Date()), null);
});

test('Add a warranty: confirming the form-built parameters writes through captureWarranty keyed on this execution and reconciles the source list', async () => {
  const edited = editCaptureWarrantyCandidate({ captureOrigin: 'USER_ADD', sourceExecutionId: 'source-summary-1' }, 'Add a warranty to my home record.', 'ctx-1', addAnswer, new Date('2026-09-21T00:00:00.000Z'));
  const { result } = await invoke('CAPTURE_WARRANTY_CONFIRM', edited.parameters);
  assert.equal(calls.captureWarranty.length, 1);
  const [propertyId, userId, input] = calls.captureWarranty[0];
  assert.deepEqual([propertyId, userId], ['p1', 'u1']);
  assert.deepEqual(
    { providerName: input.providerName, category: input.category, startDate: input.startDate, expiryDate: input.expiryDate, policyNumber: input.policyNumber, cost: input.cost, sourceExecutionId: input.sourceExecutionId },
    { providerName: 'Acme Home Warranty', category: 'HOME_WARRANTY_PLAN', startDate: '2026-01-01T00:00:00.000Z', expiryDate: '2027-12-01T00:00:00.000Z', policyNumber: 'POL-123', cost: 450, sourceExecutionId: 'exec-1' },
  );
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.reasonCode, 'WARRANTY_CAPTURED');
});

// ── Inventory: every correctable field kind, and the controller-level side effects ──
const ALL_INVENTORY_MARKERS = ['coverage', 'doNothing', 'itemCoverage', 'replaceRepair', 'risk'];

test('INVENTORY_ITEM_CORRECT confirm repeats the traditional item PATCH controller\'s five stale-analysis markers after a write, and none when nothing is written', async () => {
  itemModel();
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15'));
  assert.deepEqual([...calls.markers].sort(), ALL_INVENTORY_MARKERS);
  install(); itemModel({ installedOn: new Date('2021-03-15T00:00:00.000Z') });
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('2021-03-15', 'version-from-before'));
  assert.equal(calls.markers.length, 0);
});

test('INVENTORY_ITEM_CORRECT writes each field kind as the right narrowed patch', async () => {
  const cases = [
    ['condition', 'FAIR', { condition: 'FAIR' }],
    ['brand', '  Bradford White ', { brand: 'Bradford White' }],
    ['model', 'RE2H50', { model: 'RE2H50' }],
    ['serialNo', 'SN-2024-77', { serialNo: 'SN-2024-77' }],
    ['purchaseCostCents', '900', { purchaseCostCents: 90000 }],
    ['purchaseCostCents', '850.5', { purchaseCostCents: 85050 }],
    ['replacementCostCents', '1200.75', { replacementCostCents: 120075 }],
    ['notes', 'Replaced anode rod in 2024.\nFlushed twice.', { notes: 'Replaced anode rod in 2024.\nFlushed twice.' }],
  ];
  for (const [field, value, patch] of cases) {
    install(); itemModel();
    await invoke('INVENTORY_ITEM_CORRECT', itemParams(value, itemVersion, field));
    assert.deepEqual(calls.updateItem, [['p1', 'item-1', patch]], `${field}=${value}`);
  }
});

test('INVENTORY_ITEM_CORRECT rejects invalid values for each field kind without writing', async () => {
  const invalid = [
    ['condition', 'EXCELLENT'], ['condition', ''], ['brand', '   '], ['brand', 'x'.repeat(81)], ['serialNo', 'y'.repeat(121)],
    ['purchaseCostCents', 'abc'], ['purchaseCostCents', '12.345'], ['purchaseCostCents', '-5'], ['purchaseCostCents', '10000000.01'], ['replacementCostCents', '$500'],
    ['notes', ''], ['installedOn', '2024-02-31x'],
  ];
  for (const [field, value] of invalid) {
    install(); itemModel();
    assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams(value, itemVersion, field))), 'ASK_INVALID_CONFIRMATION_EDIT', `${field}=${JSON.stringify(value).slice(0, 30)}`);
    assert.equal(calls.updateItem.length, 0);
  }
});

test('INVENTORY_ITEM_CORRECT: an over-long notes value is stopped by the parameter schema (the edit handler rejects it earlier in normal use) and never written', async () => {
  itemModel();
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('n'.repeat(2001), itemVersion, 'notes'))), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.updateItem.length, 0);
});

test('INVENTORY_ITEM_CORRECT treats an already-applied value of any kind as done, comparing in canonical form (850 equals 850.00)', async () => {
  for (const [field, value, row] of [['condition', 'GOOD', {}], ['purchaseCostCents', '850', {}], ['brand', 'Rheem', {}], ['notes', 'Basement utility closet.', {}]]) {
    install(); itemModel(row);
    const { result } = await invoke('INVENTORY_ITEM_CORRECT', itemParams(value, 'version-from-before', field));
    assert.equal(result.status, 'COMPLETED', field);
    assert.equal(calls.updateItem.length, 0, field);
    assert.equal(calls.markers.length, 0, field);
  }
});

test('INVENTORY_ITEM_CORRECT receipt shows money and condition in readable form', async () => {
  itemModel();
  const { result } = await invoke('INVENTORY_ITEM_CORRECT', itemParams('1200', itemVersion, 'replacementCostCents'));
  const details = Object.fromEntries(result.blocks[0].details.map((detail) => [detail.label, detail.value]));
  assert.equal(details['New value'], '$1,200.00');
  assert.equal(details['Previous value'], 'Not recorded');
  install(); itemModel();
  const condition = await invoke('INVENTORY_ITEM_CORRECT', itemParams('POOR', itemVersion, 'condition'));
  const cd = Object.fromEntries(condition.result.blocks[0].details.map((detail) => [detail.label, detail.value]));
  assert.deepEqual([cd['Previous value'], cd['New value']], ['Good', 'Poor']);
});

// ── INVENTORY_ITEM_CORRECT extended: room and category ──
const ITEM_KITCHEN = { id: 'room-9', name: 'Kitchen' };
function itemLinkModels({ rooms = [ITEM_KITCHEN], roomExists = true } = {}) {
  models.inventoryRoom = { findMany: async () => rooms, findFirst: async () => (roomExists ? { id: ITEM_KITCHEN.id } : null) };
}

test('INVENTORY_ITEM_CORRECT confirm links a room through updateItem, and maps the "No room" sentinel to null', async () => {
  itemLinkModels();
  itemModel({ category: 'FURNITURE', roomId: null });
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('room-9', itemVersion, 'roomId'));
  assert.deepEqual(calls.updateItem[0][2], { roomId: 'room-9' });
  install(); itemLinkModels();
  itemModel({ category: 'PLUMBING', roomId: 'room-9' });
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('NONE', itemVersion, 'roomId'));
  assert.deepEqual(calls.updateItem[0][2], { roomId: null }, '"No room" unlinks rather than writing the sentinel string (PLUMBING does not require a room)');
});

test('INVENTORY_ITEM_CORRECT confirm rejects a room id that is not in this property, without writing', async () => {
  itemLinkModels({ roomExists: false });
  itemModel({ category: 'FURNITURE', roomId: null });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('someone-elses-room', itemVersion, 'roomId'))), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.updateItem.length, 0);
});

test('INVENTORY_ITEM_CORRECT confirm rejects a category that requires a room when the item has none, and rejects APPLIANCE for a water heater name even when a room is already set, without writing (the writer\'s own combined rules)', async () => {
  itemLinkModels();
  itemModel({ name: 'Water heater', category: 'PLUMBING', roomId: null });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('FURNITURE', itemVersion, 'category'))), 'ASK_INVALID_CONFIRMATION_EDIT', 'FURNITURE requires a room, and this item has none');
  // A room is already set here so the ROOM_REQUIRED rule alone cannot explain a refusal -- only the water-heater-name rule can.
  install(); itemLinkModels();
  itemModel({ name: 'Water heater', category: 'PLUMBING', roomId: 'room-9' });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('APPLIANCE', itemVersion, 'category'))), 'ASK_INVALID_CONFIRMATION_EDIT', 'a water heater name cannot take the APPLIANCE category even with a room already set');
  install(); itemLinkModels({ roomExists: false });
  itemModel({ name: 'Sofa', category: 'FURNITURE', roomId: 'room-9' });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CORRECT', itemParams('NONE', itemVersion, 'roomId'))), 'ASK_INVALID_CONFIRMATION_EDIT', 'unlinking the room of a FURNITURE item that still requires one is refused');
  assert.equal(calls.updateItem.length, 0);
});

test('INVENTORY_ITEM_CORRECT confirm allows a category change that keeps the item\'s existing room, and a category that drops the room requirement', async () => {
  itemLinkModels();
  itemModel({ name: 'Cabinet', category: 'FURNITURE', roomId: 'room-9' });
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('ELECTRONICS', itemVersion, 'category'));
  assert.deepEqual(calls.updateItem[0][2], { category: 'ELECTRONICS' });
  install(); itemLinkModels();
  itemModel({ name: 'Furnace', category: 'HVAC', roomId: null });
  await invoke('INVENTORY_ITEM_CORRECT', itemParams('PLUMBING', itemVersion, 'category'));
  assert.deepEqual(calls.updateItem[0][2], { category: 'PLUMBING' }, 'PLUMBING does not require a room, unlike HVAC\'s neighbours');
});

test('INVENTORY_ITEM_CORRECT propose offers "No room" plus the property\'s own rooms for the room field, and every category for the category field', async () => {
  itemLinkModels();
  const withItem = async (message) => {
    const original = InventoryService.prototype.listItems;
    InventoryService.prototype.listItems = async () => [{ ...proposeItem, category: 'HVAC', roomId: 'room-9' }];
    try {
      return await capabilityInvoke('INVENTORY_ITEM_CORRECT', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ITEM', entityId: 'item-1', operationId: 'INVENTORY_ITEM_CORRECT' } });
    } finally { InventoryService.prototype.listItems = original; }
  };
  const roomPrompt = await withItem('Correct the room of this inventory item.');
  assert.deepEqual(roomPrompt.confirmation.editableFields[0].options.map((option) => option.value), ['NONE', 'room-9']);
  assert.equal(roomPrompt.confirmation.editableFields[0].value, 'room-9', 'pre-selects the currently linked room');
  const categoryPrompt = await withItem('Correct the category of this inventory item.');
  assert.equal(categoryPrompt.confirmation.editableFields[0].options.length, 14);
  assert.equal(categoryPrompt.confirmation.editableFields[0].value, 'HVAC');
  assert.equal(calls.updateItem.length, 0, 'proposing writes nothing');
});

test('INVENTORY_ITEM_CORRECT edit re-validates a room value against live data (source-shape, like every other edit handler in this file)', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readAskOrchestratorSources();
  const body = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start > 0, `${startMarker} not found`);
    const end = source.indexOf(endMarker, start);
    assert.ok(end > start, `${endMarker} not found after ${startMarker}`);
    return source.slice(start, end);
  };
  const edit = body('async function editInventoryItemCorrectConfirmation(', 'const EDIT_CONFIRMATION_HANDLERS');
  assert.match(edit, /await inventoryFieldValueError\(execution\.propertyId!, existing\.data\.field, input\.edits\.value\)/, 'the edited value is re-validated against live data, not the stale proposal');
  assert.match(edit, /inventoryCorrectionCombinedBlocker\(item, existing\.data\.field, valueEdit\)/, 'a category/room edit is re-checked against the writer\'s own combined rules');
});

test('the room existence check and the option list for INVENTORY_ITEM_CORRECT are both scoped to this property', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readAskOrchestratorSources();
  const body = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start > 0, `${startMarker} not found`);
    const end = source.indexOf(endMarker, start);
    assert.ok(end > start, `${endMarker} not found after ${startMarker}`);
    return source.slice(start, end);
  };
  const valueError = body('async function inventoryFieldValueError(', 'async function inventoryRoomLinkOptions(');
  assert.match(valueError, /prisma\.inventoryRoom\.findFirst\(\{ where: \{ id: value, propertyId \}/, 'a room id from another property must be rejected, not just any existing room id');
  const options = body('async function inventoryRoomLinkOptions(', '// Why this item cannot take this category/room correction');
  assert.match(options, /prisma\.inventoryRoom\.findMany\(\{ where: \{ propertyId \}/, 'the room dropdown must only list this property\'s own rooms');
});

test('inventory item actions: routing reaches INVENTORY_ITEM_CORRECT for room and category, and stays a read for a bare question', () => {
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;
  assert.equal(routeOf('Correct the room of this inventory item.'), 'INVENTORY_ITEM_CORRECT');
  assert.equal(routeOf('Correct the category of this inventory item.'), 'INVENTORY_ITEM_CORRECT');
  assert.notEqual(routeOf('What room is my dishwasher in?'), 'INVENTORY_ITEM_CORRECT');
});

// ── Inventory propose: each field kind builds the right editable field on the confirmation card ──
const proposeItem = { id: 'item-1', name: 'Water heater', category: 'PLUMBING', condition: 'GOOD', room: null, roomId: null, installedOn: new Date('2022-01-15T00:00:00.000Z'), purchasedOn: null, lastServicedOn: null, brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', purchaseCostCents: 85000, replacementCostCents: null, notes: 'Basement utility closet.', updatedAt: itemUpdatedAt };
const proposeInventory = async (message) => {
  const original = InventoryService.prototype.listItems;
  InventoryService.prototype.listItems = async () => [proposeItem];
  try {
    return await capabilityInvoke('INVENTORY_ITEM_CORRECT', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ITEM', entityId: 'item-1', operationId: 'INVENTORY_ITEM_CORRECT' } });
  } finally { InventoryService.prototype.listItems = original; }
};

test('inventory propose: each field kind builds the matching editable field, current value and proposal, and writes nothing', async () => {
  const cases = [
    ['Correct the install date of this inventory item.', 'DATE', '2022-01-15', undefined, '2022-01-15'],
    ['Correct the condition of this inventory item.', 'SELECT', 'GOOD', ['NEW', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN'], 'Good'],
    ['Correct the brand of this inventory item.', 'TEXT', 'Rheem', undefined, 'Rheem'],
    ['Correct the model of this inventory item.', 'TEXT', 'XE50', undefined, 'XE50'],
    ['Correct the serial number of this inventory item.', 'TEXT', 'SN-1', undefined, 'SN-1'],
    ['Correct the purchase cost of this inventory item.', 'MONEY', '850.00', undefined, '$850.00'],
    ['Correct the replacement cost of this inventory item.', 'MONEY', '', undefined, 'Not recorded'],
    ['Correct the notes of this inventory item.', 'TEXTAREA', 'Basement utility closet.', undefined, 'Basement utility closet.'],
  ];
  for (const [message, type, value, optionValues, currentShown] of cases) {
    const result = await proposeInventory(message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', message);
    const [field] = result.confirmation.editableFields;
    assert.equal(field.type, type, message);
    assert.equal(field.value, value, message);
    assert.deepEqual(field.options?.map((option) => option.value), optionValues, message);
    assert.equal(result.confirmation.fields.find((entry) => entry.label === 'Current value').value, currentShown, message);
    assert.equal(calls.updateItem.length, 0, 'proposing writes nothing');
  }
});

test('inventory propose: an unspecified field asks which detail to correct instead of guessing', async () => {
  const result = await proposeInventory('Correct this inventory item.');
  assert.equal(result.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.reasonCode, 'INVENTORY_CORRECTION_FIELD_REQUIRED');
  assert.equal(result.confirmation, undefined);
});

test('inventory item actions: contributors get one action per correctable field, all pinned to the operation; the row schema accepts them', () => {
  const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
  assert.ok(AskPresentationBlockSchema, 'the block schema export must exist for this test to mean anything');
  const source = readAskOrchestratorSources();
  assert.match(source, /function inventoryCorrectionItemActions\(canManage: boolean\) \{\s*if \(!canManage\) return undefined;\s*return \(Object\.keys\(INVENTORY_CORRECTION_FIELDS\)/);
  // ten actions on one row must validate (the row schema used to cap actions at three)
  const row = { id: 'item-1', title: 'Water heater', meta: [], actions: Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, label: `A${index}`, message: 'Correct the condition of this inventory item.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'INVENTORY_ITEM_CORRECT' })) };
  const block = { type: 'GROUPED_LIST', id: 'inventory-results', title: 'Inventory', filters: [], sections: [{ id: 's', title: 's', count: 1, items: [row] }], actions: [] };
  const parsed = AskPresentationBlockSchema.safeParse(block);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? []).slice(0, 200));
  // ...but the cap still holds: thirteen actions are refused
  const tooMany = { ...block, sections: [{ ...block.sections[0], items: [{ ...row, actions: Array.from({ length: 13 }, (_, index) => ({ ...row.actions[0], id: `b${index}` })) }] }] };
  assert.equal(AskPresentationBlockSchema.safeParse(tooMany).success, false);
});

// ── Timeline event: the richer fields ──
test('HOME_EVENT_CORRECT writes each new field kind as a narrowed patch (money as a number, selects as their value)', async () => {
  const cases = [
    ['summary', '  Replaced all shingles.\nNew underlayment. ', { summary: 'Replaced all shingles.\nNew underlayment.' }],
    ['amount', '19250.5', { amount: 19250.5 }],
    ['type', 'REPAIR', { type: 'REPAIR' }],
    ['importance', 'HIGH', { importance: 'HIGH' }],
  ];
  for (const [field, value, expected] of cases) {
    install(); eventModel();
    await invoke('HOME_EVENT_CORRECT', eventParams(field, value));
    const [, , patch] = calls.updateHomeEvent[0];
    assert.deepEqual({ ...patch, correctionReason: undefined }, { ...expected, correctionReason: undefined }, field);
    assert.ok(patch.correctionReason, 'a correction always carries a reason');
  }
});

test('HOME_EVENT_CORRECT rejects invalid values for each new field kind without writing', async () => {
  const invalid = [['summary', ''], ['summary', 'x'.repeat(501)], ['amount', 'abc'], ['amount', '-1'], ['amount', '12.345'], ['type', 'VERIFIED_RESOLUTION'], ['type', 'nonsense'], ['importance', 'URGENT']];
  for (const [field, value] of invalid) {
    install(); eventModel();
    assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams(field, value))), 'ASK_INVALID_CONFIRMATION_EDIT', `${field}=${value.slice(0, 20)}`);
    assert.equal(calls.updateHomeEvent.length, 0);
  }
});

test('HOME_EVENT_CORRECT will not change the type of a system-created VERIFIED_RESOLUTION event', async () => {
  eventModel({ current: { id: 'event-1', title: 'Guided plan completed', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', type: 'VERIFIED_RESOLUTION' } });
  assert.equal(await codeOf(invoke('HOME_EVENT_CORRECT', eventParams('type', 'REPAIR'))), 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.equal(calls.updateHomeEvent.length, 0);
  install(); eventModel({ current: { id: 'event-1', title: 'Guided plan completed', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE', type: 'VERIFIED_RESOLUTION', summary: 'Done.' } });
  await invoke('HOME_EVENT_CORRECT', eventParams('summary', 'Corrected wording of the summary'));
  assert.equal(calls.updateHomeEvent.length, 1, 'its other fields remain correctable');
});

const proposeEvent = async (message) => capabilityInvoke('HOME_EVENT_CORRECT', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'event-1', operationId: 'HOME_EVENT_CORRECT' } });

test('event propose: each field kind builds the matching editable field and current value, and offers no VERIFIED_RESOLUTION type', async () => {
  const cases = [
    ['Correct the title of this timeline event.', 'TEXT', 'Roof replacement', 'Roof replacement'],
    ['Correct the date of this timeline event.', 'DATE', '2026-09-01', '2026-09-01'],
    ['Correct the summary of this timeline event.', 'TEXTAREA', 'Full tear-off.', 'Full tear-off.'],
    ['Correct the amount of this timeline event.', 'MONEY', '18500.00', '$18,500.00'],
    ['Correct the type of this timeline event.', 'SELECT', 'IMPROVEMENT', 'Improvement'],
    ['Correct the importance of this timeline event.', 'SELECT', 'NORMAL', 'Normal'],
  ];
  for (const [message, type, value, shown] of cases) {
    install(); eventModel();
    const result = await proposeEvent(message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', message);
    const [field] = result.confirmation.editableFields;
    assert.deepEqual([field.type, field.value], [type, value], message);
    assert.equal(result.confirmation.fields.find((entry) => entry.label === 'Current value').value, shown, message);
    if (type === 'SELECT' && message.includes('type of')) assert.ok(!field.options.some((option) => option.value === 'VERIFIED_RESOLUTION'));
    assert.match(result.confirmation.description, /pending confirmation/, 'the evidence-verification downgrade is disclosed');
    assert.equal(calls.updateHomeEvent.length, 0, 'proposing writes nothing');
  }
});

test('event propose: a system-created type and a date range are declined with a clear reason', async () => {
  eventModel({ current: { id: 'event-1', title: 'Guided plan completed', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'RANGE', type: 'VERIFIED_RESOLUTION' } });
  const type = await proposeEvent('Correct the type of this timeline event.');
  assert.equal(type.reasonCode, 'HOME_EVENT_TYPE_LOCKED');
  const date = await proposeEvent('Correct the date of this timeline event.');
  assert.equal(date.reasonCode, 'HOME_EVENT_DATE_RANGE_UNSUPPORTED');
});

// ── Warranty: the richer fields ──
test('WARRANTY_CORRECT writes each new field kind as a narrowed patch scoped to the owning profile', async () => {
  const cases = [
    ['category', 'HVAC', { category: 'HVAC' }],
    ['policyNumber', '  POL-999 ', { policyNumber: 'POL-999' }],
    ['cost', '525.5', { cost: 525.5 }],
    ['coverageDetails', 'Covers compressor and coils.\nExcludes filters.', { coverageDetails: 'Covers compressor and coils.\nExcludes filters.' }],
  ];
  for (const [field, value, patch] of cases) {
    install(); warrantyModel();
    await invoke('WARRANTY_CORRECT', warrantyParams(field, value));
    assert.deepEqual([calls.updateWarranty[0][0], calls.updateWarranty[0][1], calls.updateWarranty[0][2]], ['w1', 'hp1', patch], field);
  }
  install(); warrantyModel();
  await invoke('WARRANTY_CORRECT', warrantyParams('startDate', '2026-03-01'));
  assert.deepEqual(Object.keys(calls.updateWarranty[0][2]), ['startDate']);
  assert.equal(calls.updateWarranty[0][2].startDate.toISOString(), '2026-03-01T00:00:00.000Z');
});

test('WARRANTY_CORRECT keeps the dates in order and rejects invalid values for each new field kind', async () => {
  const invalid = [
    ['startDate', '2027-12-01'], ['startDate', '2028-01-01'], ['expiryDate', '2025-12-31'],
    ['category', 'GADGET'], ['cost', 'abc'], ['cost', '-3'], ['policyNumber', ''], ['policyNumber', 'p'.repeat(161)], ['coverageDetails', ''], ['coverageDetails', 'c'.repeat(2001)],
  ];
  for (const [field, value] of invalid) {
    install(); warrantyModel();
    const code = await codeOf(invoke('WARRANTY_CORRECT', warrantyParams(field, value)));
    // an over-long coverage text is stopped by the parameter schema before the field check; everything else by the field check
    assert.ok(['ASK_INVALID_CONFIRMATION_EDIT', 'ASK_CONFIRMATION_NOT_ACTIVE'].includes(code), `${field}=${String(value).slice(0, 12)} -> ${code}`);
    assert.equal(calls.updateWarranty.length, 0, field);
  }
  install(); warrantyModel();
  assert.equal(await codeOf(invoke('WARRANTY_CORRECT', warrantyParams('startDate', '2027-12-01'))), 'ASK_INVALID_CONFIRMATION_EDIT', 'start on the expiry date is refused');
});

test('WARRANTY_CORRECT already-applied check compares in canonical form (450 equals 450.00)', async () => {
  warrantyModel();
  const { result } = await invoke('WARRANTY_CORRECT', warrantyParams('cost', '450.00', 'version-from-before'));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.updateWarranty.length, 0);
});

const proposeWarranty = async (message) => capabilityInvoke('WARRANTY_CORRECT', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'WARRANTY', entityId: 'w1', operationId: 'WARRANTY_CORRECT' } });

test('warranty propose: each field kind builds the matching editable field and current value', async () => {
  const cases = [
    ['Correct the provider of this warranty.', 'TEXT', 'Acme Home Warranty', 'Acme Home Warranty'],
    ['Correct the expiry date of this warranty.', 'DATE', '2027-12-01', '2027-12-01'],
    ['Correct the start date of this warranty.', 'DATE', '2026-01-01', '2026-01-01'],
    ['Correct the coverage type of this warranty.', 'SELECT', 'HOME_WARRANTY_PLAN', 'Home warranty plan'],
    ['Correct the policy number of this warranty.', 'TEXT', 'POL-123', 'POL-123'],
    ['Correct the cost of this warranty.', 'MONEY', '450.00', '$450.00'],
    ['Correct the coverage details of this warranty.', 'TEXTAREA', 'HVAC and appliances.', 'HVAC and appliances.'],
  ];
  for (const [message, type, value, shown] of cases) {
    install(); warrantyModel();
    const result = await proposeWarranty(message);
    assert.equal(result.status, 'NEEDS_CONFIRMATION', message);
    const [field] = result.confirmation.editableFields;
    assert.deepEqual([field.type, field.value], [type, value], message);
    assert.equal(result.confirmation.fields.find((entry) => entry.label === 'Current value').value, shown, message);
    assert.equal(calls.updateWarranty.length, 0, 'proposing writes nothing');
  }
  install(); warrantyModel({ ownerUserId: 'someone-else' });
  assert.equal((await proposeWarranty('Correct the cost of this warranty.')).reasonCode, 'WARRANTY_NOT_OWNED_BY_REQUESTER');
});

// ── Add a timeline event (user-initiated capture) ──
const eventAddEnvelope = (launchContext, message = 'Add an event to my home timeline.') => ({ userId: 'u1', propertyId: 'p1', message, launchContext });
const declaredEventAdd = { surface: 'ASK_WORKSPACE', operationId: 'CAPTURE_EVENT_CONFIRM', sourceExecutionId: 'source-summary-1' };
const NOW = new Date('2026-09-21T12:00:00.000Z');
const eventAnswer = { title: '  Water heater replaced ', type: 'REPAIR', occurredAt: '2026-08-15', summary: 'Old tank failed.', amount: 1450.5, providerName: 'Acme Plumbing' };

test('Add event: the declared action returns the empty form under its own capture key and carries the source list; nothing is written', async () => {
  const result = await capabilityInvoke('CAPTURE_EVENT_CONFIRM', eventAddEnvelope(declaredEventAdd));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'EVENT_ADD_INPUT_REQUIRED');
  assert.equal(result.parameters.captureOrigin, 'USER_ADD');
  assert.equal(result.parameters.sourceExecutionId, 'source-summary-1');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'CAPTURE_EVENT_ADD');
  assert.equal(request.requirementId, 'capture-event-add');
  assert.equal(request.classification, 'WORKFLOW_INPUT');
  assert.equal(request.expectedContextVersion, result.contextVersion);
  assert.deepEqual(request.inputSchema.fields.map((field) => field.key), ['title', 'type', 'occurredAt', 'summary', 'amount', 'providerName']);
  const typeField = request.inputSchema.fields.find((field) => field.key === 'type');
  assert.ok(!typeField.inputSchema.options.some((option) => option.value === 'VERIFIED_RESOLUTION'), 'the system-created type is not offered');
  assert.ok(Object.values(request.currentAnswer).every((value) => value === null), 'nothing is pre-filled');
  assert.equal(calls.createHomeEvent.length, 0);
});

test('Add event: a refresh, a bare message, or a missing declared action keeps the not-routable boundary; a viewer is blocked', async () => {
  for (const launchContext of [{ surface: 'ASK_REFRESH', sourceExecutionId: 'exec-1' }, { surface: 'ASK_WORKSPACE', operationId: 'PROPERTY_SUMMARY' }, undefined]) {
    const result = await capabilityInvoke('CAPTURE_EVENT_CONFIRM', eventAddEnvelope(launchContext));
    assert.equal(result.reasonCode, 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE', JSON.stringify(launchContext));
  }
  assert.equal((await capabilityInvoke('CAPTURE_EVENT_CONFIRM', eventAddEnvelope(declaredEventAdd, 'I replaced the roof last year'))).reasonCode, 'ASK_CAPTURE_NOT_DIRECTLY_ROUTABLE');
  accessRole = 'VIEWER';
  const blocked = await capabilityInvoke('CAPTURE_EVENT_CONFIRM', eventAddEnvelope(declaredEventAdd));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.captureRequests, undefined);
});

test('Add event: the submitted form becomes a review card with user-entered copy and the parameters extraction produces', () => {
  const built = buildUserAddedEventConfirmation({ captureOrigin: 'USER_ADD', sourceExecutionId: 'source-summary-1' }, 'ctx-1', eventAnswer, NOW);
  assert.ok(built.result, JSON.stringify(built));
  const { result } = built;
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  const p = result.parameters;
  assert.deepEqual(
    { type: p.type, title: p.title, occurredAt: p.occurredAt, datePrecision: p.datePrecision, dateRangeStart: p.dateRangeStart, amount: p.amount, currency: p.currency, providerName: p.providerName, summary: p.summary },
    { type: 'REPAIR', title: 'Water heater replaced', occurredAt: '2026-08-15T00:00:00.000Z', datePrecision: 'EXACT_DATE', dateRangeStart: null, amount: 1450.5, currency: 'USD', providerName: 'Acme Plumbing', summary: 'Old tank failed.' },
  );
  assert.deepEqual([p.attribution, p.captureChannel, p.captureOrigin, p.sourceExecutionId, p.confirmationVersion], ['FIRSTHAND', 'ASK_CONVERSATIONAL_CAPTURE', 'USER_ADD', 'source-summary-1', 1]);
  assert.match(result.confirmation.description, /You entered these details/);
  assert.doesNotMatch(JSON.stringify(result.blocks) + result.confirmation.description, /noticed you mentioned/);
  assert.equal(result.confirmation.confirmLabel, 'Add to timeline');
  assert.equal(result.captureRequests[0].captureKey, 'CAPTURE_EVENT_ADD', 'the form stays available so the entry can be changed');
  assert.equal(result.captureRequests[0].currentAnswer.title, 'Water heater replaced');
});

test('Add event: blank optional fields become null, and resubmitting raises the confirmation version', () => {
  const first = buildUserAddedEventConfirmation({ captureOrigin: 'USER_ADD' }, 'ctx-1', { title: 'Gutter cleaning', type: 'MAINTENANCE', occurredAt: '2026-09-01', summary: '', amount: null, providerName: '' }, NOW).result;
  assert.deepEqual([first.parameters.summary, first.parameters.amount, first.parameters.currency, first.parameters.providerName], [null, null, null, null]);
  const second = buildUserAddedEventConfirmation(first.parameters, 'ctx-1', { title: 'Gutter cleaning', type: 'MAINTENANCE', occurredAt: '2026-09-02' }, NOW).result;
  assert.equal(second.parameters.confirmationVersion, 2, 'a stale confirmation can never match the edited one');
});

test('Add event: an unusable answer is refused with a reason (short title, unlisted or system type, bad or future date, negative amount)', () => {
  const base = { title: 'Roof replaced', type: 'IMPROVEMENT', occurredAt: '2026-08-15' };
  const cases = [
    [{ ...base, title: 'ab' }, /./], [{ ...base, type: 'VERIFIED_RESOLUTION' }, /listed types/], [{ ...base, type: 'NOPE' }, /./],
    [{ ...base, occurredAt: '15/08/2026' }, /./], [{ ...base, occurredAt: '2026-13-45' }, /./], [{ ...base, occurredAt: '2026-10-01' }, /future/],
    [{ ...base, amount: -5 }, /./], [{ ...base, extra: 1 }, /./],
  ];
  for (const [answer, reason] of cases) {
    const built = buildUserAddedEventConfirmation({}, 'ctx-1', answer, NOW);
    assert.ok(built.error, JSON.stringify(answer));
    assert.match(built.error, reason, JSON.stringify(answer));
  }
  assert.ok(buildUserAddedEventConfirmation({}, 'ctx-1', { ...base, occurredAt: '2026-09-22' }, NOW).result, 'tomorrow is tolerated for timezone skew');
});

test('Add event: confirming the form-built parameters creates the event through createHomeEvent keyed on this execution, then reconciles', async () => {
  const { result: card } = buildUserAddedEventConfirmation({ captureOrigin: 'USER_ADD', sourceExecutionId: 'source-summary-1' }, 'ctx-1', eventAnswer, NOW);
  const { result, artifactType, artifactId } = await invoke('CAPTURE_EVENT_CONFIRM', card.parameters);
  assert.equal(calls.createHomeEvent.length, 1);
  const [{ propertyId, userId, body }] = calls.createHomeEvent[0];
  assert.deepEqual([propertyId, userId], ['p1', 'u1']);
  assert.deepEqual(
    { type: body.type, title: body.title, occurredAt: body.occurredAt, datePrecision: body.datePrecision, amount: body.amount, currency: body.currency, providerName: body.providerName, summary: body.summary, idempotencyKey: body.idempotencyKey },
    { type: 'REPAIR', title: 'Water heater replaced', occurredAt: '2026-08-15T00:00:00.000Z', datePrecision: 'EXACT_DATE', amount: 1450.5, currency: 'USD', providerName: 'Acme Plumbing', summary: 'Old tank failed.', idempotencyKey: 'exec-1' },
  );
  assert.equal(result.reasonCode, 'EVENT_CAPTURED');
  assert.equal(artifactType, 'HOME_EVENT');
  assert.equal(artifactId, 'event-new');
});

test('Add event: an extraction-created pending event still edits through its own key and keeps its "Cozy noticed" copy', () => {
  const edited = editCaptureEventCandidate({ type: 'REPAIR', title: 'Roof repair', summary: null, amount: null, providerName: null }, 'We fixed the roof', 'ctx-1', { type: 'REPAIR', title: 'Roof repair (flashing)', summary: null, amount: null, providerName: null }, NOW);
  assert.match(edited.confirmation.description, /Cozy noticed you mentioned: "We fixed the roof"/);
});

// ── Add a room (user-initiated) ──
const roomAddEnvelope = (launchContext, message = 'Add a room to my home record.') => ({ userId: 'u1', propertyId: 'p1', message, launchContext });
const declaredRoomAdd = { surface: 'ASK_WORKSPACE', operationId: 'ROOM_CREATE', sourceExecutionId: 'source-summary-1' };
const noRooms = () => { models.inventoryRoom = { findFirst: async () => null }; };

test('Add room: the declared action returns the empty form (type, required name, optional floor), carries the source list, and writes nothing', async () => {
  noRooms();
  const result = await capabilityInvoke('ROOM_CREATE', roomAddEnvelope(declaredRoomAdd));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'ROOM_CREATE_INPUT_REQUIRED');
  assert.equal(result.parameters.sourceExecutionId, 'source-summary-1');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'ROOM_CREATE_INPUTS');
  assert.equal(request.classification, 'WORKFLOW_INPUT');
  assert.equal(request.expectedContextVersion, result.contextVersion);
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  assert.deepEqual(Object.keys(byKey), ['type', 'name', 'floorLevel']);
  assert.equal(byKey.name.required, true, 'a name is required so a default can never silently collide');
  assert.equal(byKey.floorLevel.required, false);
  assert.deepEqual(byKey.type.inputSchema.options.map((option) => option.value), ['KITCHEN', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'DINING', 'LAUNDRY', 'GARAGE', 'OFFICE', 'BASEMENT', 'OTHER']);
  assert.equal(calls.createRoom.length, 0);
});

test('Add room: a refresh, a bare message or a missing declared action never starts or resets a form; a viewer is blocked', async () => {
  noRooms();
  for (const launchContext of [{ surface: 'ASK_REFRESH', sourceExecutionId: 'exec-1' }, { surface: 'ASK_WORKSPACE', operationId: 'PROPERTY_SUMMARY' }, undefined]) {
    const result = await capabilityInvoke('ROOM_CREATE', roomAddEnvelope(launchContext));
    assert.equal(result.reasonCode, 'ASK_ROOM_CREATE_NOT_DIRECTLY_ROUTABLE', JSON.stringify(launchContext));
    assert.equal(result.captureRequests, undefined);
  }
  assert.equal((await capabilityInvoke('ROOM_CREATE', roomAddEnvelope(declaredRoomAdd, 'add a room'))).reasonCode, 'ASK_ROOM_CREATE_NOT_DIRECTLY_ROUTABLE');
  accessRole = 'VIEWER';
  const blocked = await capabilityInvoke('ROOM_CREATE', roomAddEnvelope(declaredRoomAdd));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.captureRequests, undefined);
});

test('Add room: a valid submission builds the review card and keeps the form for changes; a used name asks for another without confirming', async () => {
  noRooms();
  const card = await roomCreateResult('u1', 'p1', { type: 'OFFICE', name: 'Home office', floorLevel: 1 }, 'source-summary-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(card.parameters.roomCreate, { type: 'OFFICE', name: 'Home office', floorLevel: 1 });
  assert.equal(card.parameters.sourceExecutionId, 'source-summary-1');
  assert.equal(card.parameters.confirmationVersion, 1);
  assert.deepEqual(card.confirmation.fields.map((field) => [field.label, field.value]), [['Room name', 'Home office'], ['Type', 'Office'], ['Floor level', '1']]);
  assert.equal(card.confirmation.confirmLabel, 'Add room');
  assert.equal(card.captureRequests[0].currentAnswer.name, 'Home office');
  const noFloor = await roomCreateResult('u1', 'p1', { type: 'BEDROOM', name: 'Guest room', floorLevel: null }, null);
  assert.ok(!noFloor.confirmation.fields.some((field) => field.label === 'Floor level'));

  models.inventoryRoom = { findFirst: async () => ({ id: 'room-existing' }) };
  const clash = await roomCreateResult('u1', 'p1', { type: 'OFFICE', name: 'Home office', floorLevel: null }, null);
  assert.equal(clash.status, 'NEEDS_CONTEXT');
  assert.equal(clash.reasonCode, 'ROOM_NAME_ALREADY_USED');
  assert.equal(clash.confirmation, undefined, 'a used name is never offered for confirmation');
  assert.equal(clash.captureRequests[0].currentAnswer.name, 'Home office', 'what was typed is kept');
  accessRole = 'VIEWER';
  assert.equal((await roomCreateResult('u1', 'p1', { type: 'OFFICE', name: 'X', floorLevel: null }, null)).status, 'BLOCKED');
});

const roomCreateParams = (roomCreate = { type: 'OFFICE', name: 'Home office', floorLevel: 1 }) => ({ roomCreate, sourceExecutionId: 'source-summary-1', confirmationVersion: 1 });

test('ROOM_CREATE confirm creates the room with a narrowed body and repeats the traditional POST controller\'s three stale-analysis markers', async () => {
  noRooms();
  const { result, artifactType, artifactId } = await invoke('ROOM_CREATE', roomCreateParams());
  assert.deepEqual(calls.createRoom, [['p1', { type: 'OFFICE', name: 'Home office', floorLevel: 1 }]]);
  assert.deepEqual([...calls.markers].sort(), ['coverage', 'doNothing', 'risk']);
  assert.equal(result.reasonCode, 'ROOM_CREATED');
  assert.equal(result.blocks[0].title, 'Room added');
  assert.deepEqual([artifactType, artifactId], ['INVENTORY_ROOM', 'room-new']);
});

test('ROOM_CREATE confirm refuses a name another room already has (created before this execution) and never writes', async () => {
  models.inventoryRoom = { findFirst: async () => ({ id: 'room-old', createdAt: new Date('2026-01-01T00:00:00.000Z') }) };
  assert.equal(await codeOf(invoke('ROOM_CREATE', roomCreateParams())), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.createRoom.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('ROOM_CREATE confirm recognises its own earlier write on a retry (same-named room created since the execution began) and does not write again', async () => {
  models.inventoryRoom = { findFirst: async () => ({ id: 'room-mine', createdAt: new Date('2026-09-20T00:00:05.000Z') }) };
  const { result, artifactId } = await invoke('ROOM_CREATE', roomCreateParams());
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.blocks[0].title, 'Room already added');
  assert.equal(artifactId, 'room-mine');
  assert.equal(calls.createRoom.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('ROOM_CREATE confirm maps a lost race on the unique name to a clear refusal, and rejects invalid stored input', async () => {
  noRooms();
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  InventoryService.prototype.createRoom = async () => { throw new APIError('Room name already exists for this property', 409, 'ROOM_ALREADY_EXISTS'); };
  assert.equal(await codeOf(invoke('ROOM_CREATE', roomCreateParams())), 'ASK_INVALID_CONFIRMATION_EDIT');
  assert.equal(calls.markers.length, 0);
  for (const bad of [{ type: 'GARDEN', name: 'x', floorLevel: null }, { type: 'OFFICE', name: '', floorLevel: null }, { type: 'OFFICE', name: 'x'.repeat(81), floorLevel: null }, { type: 'OFFICE', name: 'ok', floorLevel: 51 }, { type: 'OFFICE', name: 'ok', floorLevel: 1.5 }]) {
    assert.equal(await codeOf(invoke('ROOM_CREATE', roomCreateParams(bad))), 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(bad).slice(0, 40));
  }
});


// ── Add an inventory item (user-initiated) ──
const itemAddEnvelope = (launchContext, message = 'Add an item to my home inventory.') => ({ userId: 'u1', propertyId: 'p1', message, launchContext });
const declaredItemAdd = { surface: 'ASK_WORKSPACE', operationId: 'INVENTORY_ITEM_CREATE', sourceExecutionId: 'source-summary-1' };
const ROOM_KITCHEN = { id: '11111111-1111-4111-8111-111111111111', name: 'Kitchen' };
function itemModels({ rooms = [ROOM_KITCHEN], existingByHash = null, earlier = null } = {}) {
  models.inventoryRoom = { findMany: async () => rooms };
  models.inventoryItem = {
    findFirst: async ({ where }) => (where.sourceHash ? existingByHash : earlier),
  };
}
const itemInput = (over = {}) => ({ name: 'Bosch dishwasher', category: 'APPLIANCE', roomId: ROOM_KITCHEN.id, brand: 'Bosch', model: null, ...over });

test('Add item: the declared action returns the form (name, category, room with a no-room option, optional brand/model), carries the source list, and writes nothing', async () => {
  itemModels();
  const result = await capabilityInvoke('INVENTORY_ITEM_CREATE', itemAddEnvelope(declaredItemAdd));
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.reasonCode, 'INVENTORY_CREATE_INPUT_REQUIRED');
  assert.equal(result.parameters.sourceExecutionId, 'source-summary-1');
  const [request] = result.captureRequests;
  assert.equal(request.captureKey, 'INVENTORY_ITEM_CREATE_INPUTS');
  assert.equal(request.classification, 'WORKFLOW_INPUT');
  assert.equal(request.expectedContextVersion, result.contextVersion);
  const byKey = Object.fromEntries(request.inputSchema.fields.map((field) => [field.key, field]));
  assert.deepEqual(Object.keys(byKey), ['name', 'category', 'roomId', 'brand', 'model']);
  assert.deepEqual([byKey.name.required, byKey.category.required, byKey.roomId.required, byKey.brand.required, byKey.model.required], [true, true, true, false, false]);
  assert.deepEqual(byKey.roomId.inputSchema.options.map((option) => option.value), [ROOM_KITCHEN.id, 'NONE']);
  assert.equal(byKey.category.inputSchema.options.length, 14);
  assert.equal(calls.createItem.length, 0);
});

test('Add item: a refresh, a bare message or a missing declared action never starts or resets a form; a viewer is blocked', async () => {
  itemModels();
  for (const launchContext of [{ surface: 'ASK_REFRESH', sourceExecutionId: 'exec-1' }, { surface: 'ASK_WORKSPACE', operationId: 'PROPERTY_SUMMARY' }, undefined]) {
    const result = await capabilityInvoke('INVENTORY_ITEM_CREATE', itemAddEnvelope(launchContext));
    assert.equal(result.reasonCode, 'ASK_INVENTORY_CREATE_NOT_DIRECTLY_ROUTABLE', JSON.stringify(launchContext));
    assert.equal(result.captureRequests, undefined);
  }
  assert.equal((await capabilityInvoke('INVENTORY_ITEM_CREATE', itemAddEnvelope(declaredItemAdd, 'add a dishwasher'))).reasonCode, 'ASK_INVENTORY_CREATE_NOT_DIRECTLY_ROUTABLE');
  accessRole = 'VIEWER';
  const blocked = await capabilityInvoke('INVENTORY_ITEM_CREATE', itemAddEnvelope(declaredItemAdd));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.captureRequests, undefined);
});

test('Add item: a valid submission builds the review card and keeps the form; the writer\'s own rules are surfaced before confirmation', async () => {
  itemModels();
  const card = await inventoryItemCreateResult('u1', 'p1', itemInput(), 'source-summary-1');
  assert.equal(card.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(card.parameters.inventoryCreate, itemInput());
  assert.deepEqual(card.confirmation.fields.map((field) => [field.label, field.value]), [['Item name', 'Bosch dishwasher'], ['Category', 'Appliance'], ['Room', 'Kitchen'], ['Brand', 'Bosch']]);
  assert.equal(card.confirmation.confirmLabel, 'Add item');
  assert.equal(card.captureRequests[0].currentAnswer.name, 'Bosch dishwasher');
  const whole = await inventoryItemCreateResult('u1', 'p1', itemInput({ name: 'Furnace', category: 'HVAC', roomId: 'NONE', brand: null }), null);
  assert.equal(whole.status, 'NEEDS_CONFIRMATION');
  assert.equal(whole.confirmation.fields.find((field) => field.label === 'Room').value, 'No room (whole-home)');

  const blockers = [
    [itemInput({ roomId: 'NONE' }), 'INVENTORY_ROOM_REQUIRED'],
    [itemInput({ roomId: '22222222-2222-4222-8222-222222222222' }), 'INVENTORY_ROOM_UNKNOWN'],
    [itemInput({ name: 'Tankless water heater' }), 'INVENTORY_WATER_HEATER_CATEGORY'],
  ];
  for (const [input, code] of blockers) {
    const blocked = await inventoryItemCreateResult('u1', 'p1', input, null);
    assert.equal(blocked.status, 'NEEDS_CONTEXT', code);
    assert.equal(blocked.reasonCode, code);
    assert.equal(blocked.confirmation, undefined, 'a doomed item is never offered for confirmation');
    assert.equal(blocked.captureRequests[0].currentAnswer.name, input.name, 'what was typed is kept');
  }
  itemModels({ existingByHash: { id: 'item-old' } });
  const dup = await inventoryItemCreateResult('u1', 'p1', itemInput(), null);
  assert.equal(dup.reasonCode, 'INVENTORY_APPLIANCE_EXISTS');
  itemModels({ rooms: [] });
  assert.match((await inventoryItemCreateResult('u1', 'p1', itemInput({ roomId: 'NONE' }), null)).blocks[0].body, /Add a room first/);
  accessRole = 'VIEWER';
  assert.equal((await inventoryItemCreateResult('u1', 'p1', itemInput(), null)).status, 'BLOCKED');
});

const itemCreateParams = (inventoryCreate = itemInput()) => ({ inventoryCreate, sourceExecutionId: 'source-summary-1', confirmationVersion: 1 });

test('INVENTORY_ITEM_CREATE confirm creates the item through createItem with a narrowed body and repeats the traditional POST controller\'s three stale-analysis markers', async () => {
  itemModels();
  const { result, artifactType, artifactId } = await invoke('INVENTORY_ITEM_CREATE', itemCreateParams());
  assert.deepEqual(calls.createItem, [['p1', { name: 'Bosch dishwasher', category: 'APPLIANCE', roomId: ROOM_KITCHEN.id, brand: 'Bosch', model: null }, 'u1']]);
  assert.deepEqual([...calls.markers].sort(), ['coverage', 'doNothing', 'risk']);
  assert.equal(result.reasonCode, 'INVENTORY_ITEM_CREATED');
  assert.equal(result.blocks[0].title, 'Item added');
  assert.deepEqual([artifactType, artifactId], ['INVENTORY_ITEM', 'item-new']);
  calls.createItem.length = 0;
  await invoke('INVENTORY_ITEM_CREATE', itemCreateParams(itemInput({ name: 'Furnace', category: 'HVAC', roomId: 'NONE', brand: null })));
  assert.equal(calls.createItem[0][1].roomId, null, '"No room" is stored as no room');
});

test('INVENTORY_ITEM_CREATE confirm re-checks the writer\'s rules against live data and never writes when one fails', async () => {
  itemModels({ rooms: [] });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CREATE', itemCreateParams())), 'ASK_INVALID_CONFIRMATION_EDIT', 'the room was removed since the review');
  itemModels({ existingByHash: { id: 'item-old' } });
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CREATE', itemCreateParams())), 'ASK_INVALID_CONFIRMATION_EDIT', 'a dishwasher was added since the review');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('INVENTORY_ITEM_CREATE confirm recognises its own earlier write on a retry and does not write again, even for a one-per-home appliance', async () => {
  itemModels({ earlier: { id: 'item-mine' }, existingByHash: { id: 'item-mine' } });
  const { result, artifactId } = await invoke('INVENTORY_ITEM_CREATE', itemCreateParams());
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.blocks[0].title, 'Item already added');
  assert.equal(artifactId, 'item-mine');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.markers.length, 0);
});

test('INVENTORY_ITEM_CREATE confirm maps a writer refusal to a clear error, lets a server fault through, and rejects invalid stored input', async () => {
  itemModels();
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  InventoryService.prototype.createItem = async () => { throw new APIError('A dishwasher already exists for this property.', 409, 'APPLIANCE_ALREADY_EXISTS'); };
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CREATE', itemCreateParams())), 'ASK_INVALID_CONFIRMATION_EDIT');
  InventoryService.prototype.createItem = async () => { throw new Error('db down'); };
  assert.equal(await codeOf(invoke('INVENTORY_ITEM_CREATE', itemCreateParams())), 'NO_CODE:db down');
  assert.equal(calls.markers.length, 0);
  for (const bad of [itemInput({ category: 'GARDEN' }), itemInput({ name: '' }), itemInput({ name: 'x'.repeat(121) }), itemInput({ brand: 'x'.repeat(81) }), { ...itemInput(), extra: 1 }]) {
    assert.equal(await codeOf(invoke('INVENTORY_ITEM_CREATE', itemCreateParams(bad))), 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(bad).slice(0, 40));
  }
});

// ───────────────────────────── Evidence upload attach (Phase 3, evidence upload design, approved 2026-09-22) ─────
// Reuses the existing CAPTURE_EVIDENCE_CONFIRM operation/adapter -- these tests are the first runtime coverage
// for confirmCaptureEvidence's write path at all (previously covered only by registration/source-shape checks;
// see groundedAskProposalRetirement.test.js). Covers both the new USER_ADD branch and, as a regression guard, the
// pre-existing extraction-sibling branch it sits alongside.
const orchestratorSource = readAskOrchestratorSources();

function evidenceModels({
  event = { id: 'event-1', propertyId: 'p1', title: 'Roof replacement', isCurrent: true, deletedAt: null, visibility: 'HOUSEHOLD', createdById: 'u9' },
  document = { id: 'doc-1', propertyId: 'p1', name: 'Invoice.pdf' },
  receipt = null,
} = {}) {
  models.homeEvent = { findFirst: async () => event };
  models.document = { findFirst: async () => document };
  if (receipt !== undefined) models.askConfirmationReceipt = { findUnique: async () => receipt };
}

const proposeEvidenceAttach = async ({ message = EVIDENCE_ATTACH_MESSAGE, entityId = 'event-1', documentId = 'doc-1', surface = 'ASK_WORKSPACE' } = {}) =>
  capabilityInvoke('CAPTURE_EVIDENCE_CONFIRM', { userId: 'u1', propertyId: 'p1', message, launchContext: { surface, entityType: 'HOME_EVENT', entityId, documentId, operationId: 'CAPTURE_EVIDENCE_CONFIRM' } });

test('CAPTURE_EVIDENCE_CONFIRM propose: only the declared "Attach evidence" action (operationId + surface + exact message + entityType + entityId + documentId all present) builds a confirmation card; anything else stays not-directly-routable', async () => {
  evidenceModels();
  const declared = await proposeEvidenceAttach();
  assert.equal(declared.status, 'NEEDS_CONFIRMATION');
  assert.equal(declared.reasonCode, 'EVIDENCE_ATTACH_CONFIRMATION_REQUIRED');
  assert.deepEqual(declared.parameters, { documentId: 'doc-1', eventId: 'event-1', captureOrigin: 'USER_ADD', sourceExecutionId: null, confirmationVersion: 1, confirmationExpiresAt: declared.parameters.confirmationExpiresAt });
  assert.equal(declared.confirmation.title, 'Attach this document as evidence?');
  assert.deepEqual(declared.confirmation.fields, [{ label: 'Document', value: 'Invoice.pdf' }, { label: 'Attach to', value: 'Roof replacement' }]);

  const refresh = await proposeEvidenceAttach({ surface: 'ASK_REFRESH' });
  assert.equal(refresh.status, 'OUT_OF_SCOPE', 'an ASK_REFRESH re-run (no operationId in practice) must not rebuild the card');
  const wrongMessage = await proposeEvidenceAttach({ message: 'Attach this file.' });
  assert.equal(wrongMessage.status, 'OUT_OF_SCOPE');
  const noDocumentId = await capabilityInvoke('CAPTURE_EVIDENCE_CONFIRM', { userId: 'u1', propertyId: 'p1', message: EVIDENCE_ATTACH_MESSAGE, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'HOME_EVENT', entityId: 'event-1', operationId: 'CAPTURE_EVIDENCE_CONFIRM' } });
  assert.equal(noDocumentId.status, 'OUT_OF_SCOPE', 'documentId missing entirely (no file uploaded yet) must not build a card');
  const wrongEntityType = await capabilityInvoke('CAPTURE_EVIDENCE_CONFIRM', { userId: 'u1', propertyId: 'p1', message: EVIDENCE_ATTACH_MESSAGE, launchContext: { surface: 'ASK_WORKSPACE', entityType: 'INVENTORY_ITEM', entityId: 'event-1', documentId: 'doc-1', operationId: 'CAPTURE_EVIDENCE_CONFIRM' } });
  assert.equal(wrongEntityType.status, 'OUT_OF_SCOPE');
});

test('CAPTURE_EVIDENCE_CONFIRM propose blocks a VIEWER, and re-verifies the event and document against live data rather than trusting launchContext', async () => {
  evidenceModels();
  accessRole = 'VIEWER';
  assert.equal((await proposeEvidenceAttach()).status, 'BLOCKED');
  accessRole = 'CONTRIBUTOR';

  models.homeEvent = { findFirst: async () => null };
  const missingEvent = await proposeEvidenceAttach();
  assert.equal(missingEvent.status, 'NOT_APPLICABLE');
  assert.equal(missingEvent.reasonCode, 'HOME_EVENT_NOT_FOUND');

  evidenceModels();
  models.document = { findFirst: async () => null };
  const missingDocument = await proposeEvidenceAttach();
  assert.equal(missingDocument.status, 'NOT_APPLICABLE');
  assert.equal(missingDocument.reasonCode, 'DOCUMENT_NOT_FOUND');
});

// Mutation-testing gotcha (see feedback_ask_write_command_design_rules item 2 / this file's own convention): the
// fakes above ignore their `where` argument entirely, so a regression that dropped propertyId scoping or the
// PRIVATE-creator-only exclusion from the real query would pass every test above unnoticed. Source-shape assertion
// against the real function body closes that gap, the same pattern used elsewhere in this arc.
test('CAPTURE_EVIDENCE_CONFIRM propose: source shape -- the event query is property-scoped and excludes another creator\'s PRIVATE event; the document query is property-scoped', () => {
  const fn = orchestratorSource.slice(orchestratorSource.indexOf('async function evidenceAttachResult'), orchestratorSource.indexOf('async function warrantyCorrectResult'));
  assert.match(fn, /where:\s*\{\s*id:\s*eventId,\s*propertyId,\s*isCurrent:\s*true,\s*deletedAt:\s*null,\s*OR:\s*\[\{\s*visibility:\s*\{\s*not:\s*'PRIVATE'\s*\}\s*\},\s*\{\s*createdById:\s*userId\s*\}\]/);
  assert.match(fn, /prisma\.document\.findFirst\(\{\s*where:\s*\{\s*id:\s*documentId,\s*propertyId\s*\}/);
});

test('CAPTURE_EVIDENCE_CONFIRM confirm (USER_ADD origin): attaches the already-uploaded document to the event named in the execution\'s own parameters, no sibling execution involved', async () => {
  evidenceModels({ receipt: null });
  models.askConfirmationReceipt = { findUnique: async () => { throw new Error('must not be queried on the USER_ADD path'); } };
  const { result, artifactType, artifactId } = await invoke('CAPTURE_EVIDENCE_CONFIRM', { documentId: 'doc-1', eventId: 'event-1', captureOrigin: 'USER_ADD' });
  assert.deepEqual(calls.attachDocument, [[{ propertyId: 'p1', eventId: 'event-1', documentId: 'doc-1', userId: 'u1' }]]);
  assert.equal(result.reasonCode, 'EVIDENCE_ATTACHED');
  assert.equal(artifactId, 'link-1');
  assert.ok(artifactType);
});

test('CAPTURE_EVIDENCE_CONFIRM confirm (USER_ADD origin) rejects a missing/invalid eventId or documentId without writing', async () => {
  evidenceModels();
  for (const bad of [{ documentId: 'doc-1', captureOrigin: 'USER_ADD' }, { documentId: 'doc-1', eventId: '', captureOrigin: 'USER_ADD' }, { eventId: 'event-1', captureOrigin: 'USER_ADD' }]) {
    assert.equal(await codeOf(invoke('CAPTURE_EVIDENCE_CONFIRM', bad)), 'ASK_CONFIRMATION_NOT_ACTIVE', JSON.stringify(bad));
  }
  assert.equal(calls.attachDocument.length, 0);
});

test('CAPTURE_EVIDENCE_CONFIRM confirm: the pre-existing extraction-sibling branch is unchanged (regression guard) -- still requires linkedExecutionId and a COMPLETED HOME_EVENT sibling receipt when captureOrigin is not USER_ADD', async () => {
  evidenceModels({ receipt: { status: 'COMPLETED', artifactType: 'HOME_EVENT', artifactId: 'event-sibling' } });
  const executionWithSibling = { id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'CAPTURE_EVIDENCE_CONFIRM', createdAt: EXECUTION_CREATED_AT, linkedExecutionId: 'exec-0' };
  const { result } = await confirmCapabilityInvoke('CAPTURE_EVIDENCE_CONFIRM', {
    userId: 'u1', execution: executionWithSibling, parameters: { documentId: 'doc-1' }, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('CAPTURE_EVIDENCE_CONFIRM'),
  });
  assert.deepEqual(calls.attachDocument, [[{ propertyId: 'p1', eventId: 'event-sibling', documentId: 'doc-1', userId: 'u1' }]]);
  assert.equal(result.reasonCode, 'EVIDENCE_ATTACHED');

  // No captureOrigin, no linkedExecutionId: still refused exactly as before this slice.
  assert.equal(await codeOf(invoke('CAPTURE_EVIDENCE_CONFIRM', { documentId: 'doc-1' })), 'EVIDENCE_SIBLING_EVENT_MISSING');

  // No captureOrigin, linkedExecutionId set, but the sibling isn't a COMPLETED HOME_EVENT: still refused.
  evidenceModels({ receipt: { status: 'PENDING', artifactType: 'HOME_EVENT', artifactId: 'event-sibling' } });
  assert.equal(await codeOf(confirmCapabilityInvoke('CAPTURE_EVIDENCE_CONFIRM', {
    userId: 'u1', execution: executionWithSibling, parameters: { documentId: 'doc-1' }, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('CAPTURE_EVIDENCE_CONFIRM'),
  })), 'EVIDENCE_SIBLING_EVENT_NOT_CONFIRMED');
});
