const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// Runtime (not source-shape) tests for the Phase 3 correction confirm handlers.
// prisma and the canonical writers are replaced with recording fakes BEFORE any
// handler runs, so the real registered handlers execute end to end without
// touching a database. The fake prisma throws on any model/method a test did not
// declare, so an unexpected read or write fails loudly instead of passing silently.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');
const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');
const homeManagement = require('../../src/services/home-management.service.ts');
const coverageAnalysis = require('../../src/services/coverageAnalysis.service.ts');
const riskPremium = require('../../src/services/riskPremiumOptimizer.service.ts');
const doNothing = require('../../src/services/doNothingSimulator.service.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  updateRoom: InventoryService.prototype.updateRoom,
  updateItem: InventoryService.prototype.updateItem,
  updateHomeEvent: HomeEventsService.prototype.updateHomeEvent,
  updateWarranty: homeManagement.updateWarranty,
  markCoverage: coverageAnalysis.markCoverageAnalysisStale,
  markRisk: riskPremium.markRiskPremiumOptimizerStale,
  markDoNothing: doNothing.markDoNothingRunsStale,
};

let calls;
let models;

function install() {
  calls = { updateRoom: [], updateItem: [], updateHomeEvent: [], updateWarranty: [], markers: [] };
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
  HomeEventsService.prototype.updateHomeEvent = async function (...args) { calls.updateHomeEvent.push(args); return { id: 'event-2', title: args[2].title ?? 'Roof replacement' }; };
  homeManagement.updateWarranty = async (...args) => { calls.updateWarranty.push(args); return {}; };
  coverageAnalysis.markCoverageAnalysisStale = async () => { calls.markers.push('coverage'); };
  riskPremium.markRiskPremiumOptimizerStale = async () => { calls.markers.push('risk'); };
  doNothing.markDoNothingRunsStale = async () => { calls.markers.push('doNothing'); };
  // Reconciliation: no sibling/source executions to refresh.
  models.askExecution = { findMany: async () => [] };
}

function restore() {
  prismaModule.prisma = realPrisma;
  InventoryService.prototype.updateRoom = originals.updateRoom;
  InventoryService.prototype.updateItem = originals.updateItem;
  HomeEventsService.prototype.updateHomeEvent = originals.updateHomeEvent;
  homeManagement.updateWarranty = originals.updateWarranty;
  coverageAnalysis.markCoverageAnalysisStale = originals.markCoverage;
  riskPremium.markRiskPremiumOptimizerStale = originals.markRisk;
  doNothing.markDoNothingRunsStale = originals.markDoNothing;
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const execution = (operationId) => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId });
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
function roomModel({ name = 'Kitchen', clash = false, missing = false } = {}) {
  models.inventoryRoom = {
    findFirst: async ({ where }) => {
      if (where.id && where.id.not) return clash ? { id: 'room-other' } : null; // name-uniqueness probe
      return missing ? null : { id: 'room-1', propertyId: 'p1', name, updatedAt: roomUpdatedAt };
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

// ───────────────────────────── WARRANTY_CORRECT ─────────────────────────────
const warrantyUpdatedAt = new Date('2026-09-02T00:00:00.000Z');
const warrantyVersion = sha(`w1:${warrantyUpdatedAt.toISOString()}`);
function warrantyModel({ ownerUserId = 'u1', providerName = 'Acme Home Warranty', expiryDate = new Date('2027-12-01T00:00:00.000Z') } = {}) {
  const row = { id: 'w1', propertyId: 'p1', providerName, startDate: new Date('2026-01-01T00:00:00.000Z'), expiryDate, updatedAt: warrantyUpdatedAt, homeownerProfile: { id: 'hp1', userId: ownerUserId } };
  models.warranty = { findFirst: async () => row, findUniqueOrThrow: async () => row };
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
function itemModel({ installedOn = new Date('2022-01-15T00:00:00.000Z'), missing = false } = {}) {
  const row = { id: 'item-1', propertyId: 'p1', name: 'Water heater', installedOn, purchasedOn: null, lastServicedOn: null, updatedAt: itemUpdatedAt };
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
function eventModel({ current = { id: 'event-1', title: 'Roof replacement', revision: 3, visibility: 'HOUSEHOLD', createdById: 'u9', datePrecision: 'EXACT_DATE' }, winner = null } = {}) {
  models.homeEvent = { findFirst: async ({ where }) => (where.idempotencyKey ? winner : where.id === 'event-1' ? current : null) };
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
