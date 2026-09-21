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
const replaceRepair = require('../../src/services/replaceRepairAnalysis.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const captureWarrantyModule = require('../../src/modules/propertyContext/application/captureWarranty.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { editCaptureWarrantyCandidate } = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

const realPrisma = prismaModule.prisma;
const originals = {
  updateRoom: InventoryService.prototype.updateRoom,
  updateItem: InventoryService.prototype.updateItem,
  updateHomeEvent: HomeEventsService.prototype.updateHomeEvent,
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
  calls = { updateRoom: [], updateItem: [], updateHomeEvent: [], updateWarranty: [], markers: [], captureWarranty: [] };
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
  HomeEventsService.prototype.updateHomeEvent = async function (...args) { calls.updateHomeEvent.push(args); return { id: 'event-2', title: args[2].title ?? 'Roof replacement' }; };
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
  InventoryService.prototype.updateItem = originals.updateItem;
  HomeEventsService.prototype.updateHomeEvent = originals.updateHomeEvent;
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
function itemModel({ installedOn = new Date('2022-01-15T00:00:00.000Z'), missing = false, ...overrides } = {}) {
  const row = {
    id: 'item-1', propertyId: 'p1', name: 'Water heater', installedOn, purchasedOn: null, lastServicedOn: null, updatedAt: itemUpdatedAt,
    condition: 'GOOD', brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', purchaseCostCents: 85000, replacementCostCents: null, notes: 'Basement utility closet.',
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

// ── Inventory propose: each field kind builds the right editable field on the confirmation card ──
const proposeItem = { id: 'item-1', name: 'Water heater', category: 'PLUMBING', condition: 'GOOD', room: null, installedOn: new Date('2022-01-15T00:00:00.000Z'), purchasedOn: null, lastServicedOn: null, brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', purchaseCostCents: 85000, replacementCostCents: null, notes: 'Basement utility closet.', updatedAt: itemUpdatedAt };
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
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');
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
