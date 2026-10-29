const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Material Specs state controls in Ask (FRD v1.465): stop using, use again, delete a proposed material, and export the materials. The writes are
// MaterialSpecService's own methods, stubbed here; the handlers, capture path and list are the real ones. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { impactedReadOperationIds } = require('../../src/services/ask/governance/askMutationImpactRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { MaterialSpecService } = require('../../src/services/materialSpec.service.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');
const { materialSpecsFromView } = require('../../src/services/ask/handlers/materialSpecs.handler.ts');
const { materialSpecStateResult } = require('../../src/services/ask/handlers/materialSpecStateCommands.handler.ts');
const state = require('../../src/services/ask/support/materialSpecStateCommand.ts');

const OP = 'MATERIAL_SPEC_UPDATE';
const M = state.MATERIAL_SPEC_STATE_MESSAGES;
const spec = (over = {}) => ({ id: 's1', label: 'Kitchen paint', isActive: true, lifecycleStatus: 'PROPOSED', updatedAt: new Date('2026-10-01T00:00:00Z'), ...over });
const listRow = (over = {}) => ({ ...spec(), category: 'PAINT', manufacturer: null, productName: null, room: null, scopeLevel: 'PROPERTY', colorCode: null, finish: null, supplier: null, supplierDiscontinued: false, ...over });

const originals = { prisma: { spec: prisma.materialSpec, exp: prisma.materialSpecExport }, access: propertyAccess.resolvePropertyAccess, reconcile: executeOperation.reconcileAskExecutionSideEffects, proto: { u: MaterialSpecService.prototype.updateSpec, d: MaterialSpecService.prototype.deleteSpec, r: MaterialSpecService.prototype.requestExport } };
let db; let role; let calls;
function install(over = {}) {
  db = { specs: over.specs ?? [spec()], inFlight: over.inFlight ?? false, photos: over.photos ?? [{ id: 'ph1', caption: 'Front wall', sortOrder: 0 }, { id: 'ph2', caption: null, sortOrder: 1 }] };
  calls = [];
  role = over.role ?? 'CONTRIBUTOR';
  prisma.materialSpec = {
    findFirst: async ({ where, orderBy }) => (where.id ? db.specs.find((s) => s.id === where.id) ?? null : orderBy ? db.specs.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null : null),
    count: async () => db.specs.length,
  };
  prisma.materialSpecExport = { findFirst: async () => (db.inFlight ? { id: 'e-busy' } : null) };
  prisma.materialSpecPhoto = { findMany: async () => db.photos };
  MaterialSpecService.prototype.deletePhoto = async (...a) => { calls.push(['deletePhoto', ...a]); };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  MaterialSpecService.prototype.updateSpec = async (...a) => { calls.push(['update', ...a]); return {}; };
  MaterialSpecService.prototype.deleteSpec = async (...a) => { calls.push(['delete', ...a]); };
  MaterialSpecService.prototype.requestExport = async (...a) => { calls.push(['export', ...a]); return { id: 'exp-1', title: a[2].title }; };
}
test.beforeEach(() => install());
test.afterEach(() => { prisma.materialSpec = originals.prisma.spec; prisma.materialSpecExport = originals.prisma.exp; propertyAccess.resolvePropertyAccess = originals.access; executeOperation.reconcileAskExecutionSideEffects = originals.reconcile; Object.assign(MaterialSpecService.prototype, { updateSpec: originals.proto.u, deleteSpec: originals.proto.d, requestExport: originals.proto.r }); });

const launch = (kind, over = {}) => ({ operationId: OP, surface: 'ASK_WORKSPACE', ...(kind === 'EXPORT' ? {} : { entityType: 'MATERIAL_SPEC', entityId: 's1' }), sourceExecutionId: 'exec-view', ...over });
const invoke = (kind, launchContext = launch(kind), accessRole = role) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M[kind], launchContext }, { propertyAccess: { role: accessRole } });
const ctx = (parameters, accessRole = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-w', propertyId: 'prop-1', createdAt: new Date() }, access: { role: accessRole }, parameters, command: getAskDomainCommandByOperation(OP) });
const writes = () => calls.filter((c) => c[0] !== 'noop');

test('the declared messages name their kind exactly; only a proposed material can be deleted', () => {
  for (const [kind, message] of Object.entries(M)) assert.equal(state.materialSpecStateKindFromMessage(message), kind);
  assert.equal(state.materialSpecStateKindFromMessage('delete my paint'), null);
  assert.equal(state.materialSpecDeletable('PROPOSED'), true);
  for (const status of ['APPROVED', 'SUBSTITUTED', 'INSTALLED', 'AS_BUILT']) assert.equal(state.materialSpecDeletable(status), false, status);
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.ok(impactedReadOperationIds(OP).includes('MATERIAL_SPECS_LIST'), 'the list refreshes after a change');
});

// ───────────────────────────── the list ─────────────────────────────

const rowActionIds = (result, id) => result.blocks.find((b) => b.id === 'material-specs-items').sections.flatMap((s) => s.items).find((i) => i.id === id).actions?.map((a) => a.id);
const view = (specs) => ({ specs, hasMore: false, nextCursor: null });

test('each row offers Stop using or Use again, and Delete only for a proposed material; a viewer is offered nothing', () => {
  const rows = [listRow({ id: 'proposed' }), listRow({ id: 'installed', lifecycleStatus: 'INSTALLED' }), listRow({ id: 'archived', isActive: false, lifecycleStatus: 'INSTALLED' })];
  const result = materialSpecsFromView(view(rows), 'prop-1', true);
  assert.deepEqual(rowActionIds(result, 'proposed'), ['edit-material', 'material-spec-archive', 'material-spec-delete']);
  assert.deepEqual(rowActionIds(result, 'installed'), ['edit-material', 'material-spec-archive']);
  assert.deepEqual(rowActionIds(result, 'archived'), ['edit-material', 'material-spec-restore']);
  const row = result.blocks.find((b) => b.id === 'material-specs-items').sections[0].items[0].actions.find((a) => a.id === 'material-spec-archive');
  assert.deepEqual([row.message, row.operationId, row.interactionType], [M.ARCHIVE, OP, 'MUTATE_RECORD']);
  assert.equal(rowActionIds(materialSpecsFromView(view(rows), 'prop-1', false), 'proposed'), undefined);
});

test('the list carries Export my materials for a contributor, and shows recent exports with where each stands', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const day = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const exports = [
    { id: 'e1', status: 'PENDING', title: 'Now', totalSpecs: null, expiresAt: null, createdAt: day(0) },
    { id: 'e2', status: 'COMPLETED', title: 'Done', totalSpecs: 4, expiresAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), createdAt: day(1) },
    { id: 'e3', status: 'COMPLETED', title: 'Lapsed', totalSpecs: 4, expiresAt: day(1), createdAt: day(3) },
    { id: 'e4', status: 'FAILED', title: 'Broke', totalSpecs: null, expiresAt: null, createdAt: day(2) },
    { id: 'e5', status: 'COMPLETED', title: 'Old', totalSpecs: 4, expiresAt: day(-5), createdAt: day(9) },
  ];
  const result = materialSpecsFromView(view([listRow()]), 'prop-1', true, exports, now);
  const list = result.blocks.find((b) => b.id === 'material-specs-items');
  assert.deepEqual(list.actions.map((a) => [a.id, a.message, a.operationId]), [['add-material-spec', list.actions[0].message, 'MATERIAL_SPEC_ADD'], ['material-spec-export', M.EXPORT, OP]]);
  const block = result.blocks.find((b) => b.id === 'material-specs-exports');
  assert.deepEqual(block.sections[0].items.map((i) => [i.id, i.status, i.entityType]), [['e1', 'Preparing', 'MATERIAL_SPEC_EXPORT'], ['e2', 'Ready', 'MATERIAL_SPEC_EXPORT'], ['e4', 'Failed', 'MATERIAL_SPEC_EXPORT']], 'expired and week-old files are left out');
  assert.ok(block.sections[0].items[1].meta.some((m) => /^Download until /.test(m)));
  assert.equal(result.blocks[0].type, 'SUMMARY', 'the answer still leads with its summary');
  assert.equal(materialSpecsFromView(view([listRow()]), 'prop-1', false, exports, now).blocks.find((b) => b.id === 'material-specs-items').actions.some((a) => a.id === 'material-spec-export'), false);
  assert.equal(materialSpecsFromView(view([listRow()]), 'prop-1', true).blocks.some((b) => b.id === 'material-specs-exports'), false, 'no exports, no block');
});

// ───────────────────────────── archive, restore, delete ─────────────────────────────

test('Stop using and Use again review one change, refuse a state that is already so, and write nothing yet', async () => {
  const archive = await invoke('ARCHIVE');
  assert.equal(archive.status, 'NEEDS_CONFIRMATION');
  assert.equal(archive.confirmation.confirmLabel, 'Stop using it');
  assert.match(archive.confirmation.description, /Nothing is deleted/);
  assert.deepEqual(writes(), []);
  assert.equal((await invoke('RESTORE')).reasonCode, 'MATERIAL_SPEC_ALREADY_ACTIVE');
  install({ specs: [spec({ isActive: false })] });
  assert.equal((await invoke('ARCHIVE')).reasonCode, 'MATERIAL_SPEC_ALREADY_ARCHIVED');
  const restore = await invoke('RESTORE');
  assert.equal(restore.confirmation.confirmLabel, 'Use it again');
  assert.equal((await invoke('ARCHIVE', launch('ARCHIVE', { entityId: 'nope' }))).reasonCode, 'MATERIAL_SPEC_NOT_FOUND');
});

test('only the declared action starts a state change, and a viewer is refused', async () => {
  for (const bad of [launch('ARCHIVE', { surface: 'ASK_REFRESH' }), launch('ARCHIVE', { operationId: 'MATERIAL_SPECS_LIST' }), launch('ARCHIVE', { entityType: 'OTHER' }), launch('ARCHIVE', { entityId: '' }), null]) {
    assert.equal((await invoke('ARCHIVE', bad)).reasonCode, 'ASK_MATERIAL_SPEC_NOT_ROUTABLE_OR_TARGET_REQUIRED'.replace('ASK_MATERIAL_SPEC_NOT_ROUTABLE_OR_TARGET_REQUIRED', 'MATERIAL_SPEC_TARGET_REQUIRED'));
  }
  role = 'VIEWER';
  assert.equal((await invoke('ARCHIVE', launch('ARCHIVE'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  assert.deepEqual(writes(), []);
});

test('confirming writes the canonical update with only isActive; stale, viewer and a changed material are refused', async () => {
  const proposal = await invoke('ARCHIVE');
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
  const out = await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.deepEqual(writes(), [['update', 'prop-1', 's1', { isActive: false }]]);
  assert.equal(out.result.blocks[0].title, 'Material marked no longer in use');
  assert.equal(out.artifactType, 'MATERIAL_SPEC');
  db.specs[0] = spec({ updatedAt: new Date('2026-10-02T00:00:00Z') });
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  db.specs = [];
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(proposal.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  install({ specs: [spec({ isActive: false })] });
  const back = await invoke('RESTORE');
  await confirmCapabilityInvoke(OP, ctx(back.parameters));
  assert.deepEqual(writes(), [['update', 'prop-1', 's1', { isActive: true }]]);
});

test('Delete is cautioned and confirmed for a proposed material; any other is refused before a confirmation, with the archive that is allowed', async () => {
  const proposal = await invoke('DELETE');
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.equal(proposal.blocks[0].tone, 'CAUTION');
  assert.match(proposal.confirmation.description, /cannot be undone/);
  assert.deepEqual(writes(), []);
  await confirmCapabilityInvoke(OP, ctx(proposal.parameters));
  assert.deepEqual(writes(), [['delete', 'prop-1', 's1']]);

  install({ specs: [spec({ lifecycleStatus: 'INSTALLED' })] });
  const refused = await invoke('DELETE');
  assert.equal(refused.reasonCode, 'MATERIAL_HISTORY_IMMUTABLE');
  assert.equal(refused.confirmation, undefined);
  assert.deepEqual(refused.blocks[0].actions.map((a) => [a.id, a.message, a.entityId]), [['material-spec-archive', M.ARCHIVE, 's1'], ['material-spec-state-back', 'Show my material specs', undefined]]);
  assert.deepEqual(writes(), []);

  install();
  const again = await invoke('DELETE');
  MaterialSpecService.prototype.deleteSpec = async () => { throw new APIError('Approved, substituted, installed, and as-built material history cannot be deleted; archive it instead.', 409, 'MATERIAL_HISTORY_IMMUTABLE'); };
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(again.parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /archive it instead/.test(e.message));
});

// ───────────────────────────── export ─────────────────────────────

test('the export asks for a title, reviews exactly what it covers, and creates nothing until confirmed', async () => {
  const form = await invoke('EXPORT');
  assert.equal(form.status, 'NEEDS_CONTEXT');
  assert.equal(form.captureRequests[0].captureKey, state.MATERIAL_SPEC_EXPORT_CAPTURE_KEY);
  assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => [f.key, f.required]), [['title', true]]);
  const review = await materialSpecStateResult('user-1', 'prop-1', 'EXPORT', { sourceExecutionId: 'exec-view' }, { title: ' Spring paint list ' });
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Title', 'Spring paint list'], ['Includes', 'All 1 recorded material'], ['Kept for', '7 days']]);
  assert.deepEqual(writes(), []);
  assert.equal((await materialSpecStateResult('user-1', 'prop-1', 'EXPORT', {}, { title: '' })).reasonCode, 'MATERIAL_EXPORT_INPUT_INVALID');
  assert.equal((await materialSpecStateResult('user-1', 'prop-1', 'EXPORT', {}, { title: 'x', extra: 1 })).reasonCode, 'MATERIAL_EXPORT_INPUT_INVALID');
});

test('confirming requests the canonical export for all materials; nothing to export, one already running, and a changed set are handled', async () => {
  const review = await materialSpecStateResult('user-1', 'prop-1', 'EXPORT', {}, { title: 'Paint list' });
  const out = await confirmCapabilityInvoke(OP, ctx(review.parameters));
  assert.deepEqual(writes(), [['export', 'prop-1', 'user-1', { scopeType: 'ALL', title: 'Paint list' }]]);
  assert.equal(out.result.blocks[0].title, 'Export requested');
  assert.equal(out.artifactType, 'MATERIAL_SPEC_EXPORT');
  assert.equal(out.artifactId, 'exp-1');
  db.specs.push(spec({ id: 's2', updatedAt: new Date('2026-10-05T00:00:00Z') }));
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters, 'VIEWER')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');

  install({ specs: [] });
  assert.equal((await invoke('EXPORT')).reasonCode, 'MATERIAL_EXPORT_NOTHING_TO_EXPORT');
  install({ inFlight: true });
  assert.equal((await invoke('EXPORT')).reasonCode, 'MATERIAL_EXPORT_IN_PROGRESS');
  install();
  const raced = await materialSpecStateResult('user-1', 'prop-1', 'EXPORT', {}, { title: 'Paint list' });
  MaterialSpecService.prototype.requestExport = async () => { throw new APIError('An export is already in progress', 409, 'EXPORT_IN_PROGRESS'); };
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(raced.parameters)), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /already in progress/.test(e.message));
});

test('the actions are allowlisted for the list and a viewer is refused them', () => {
  for (const id of ['material-spec-export']) {
    const action = { id, label: 'Export my materials', interactionType: 'START_WORKFLOW', message: M.EXPORT, operationId: OP, style: 'SECONDARY' };
    assert.equal(isAskActionApplicable({ action, operationId: 'MATERIAL_SPECS_LIST', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
  }
  for (const id of ['material-spec-archive', 'material-spec-restore', 'material-spec-delete', 'material-spec-export']) {
    const action = { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId: OP, style: 'QUIET' };
    assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), true, id);
    assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false, id);
  }
});

// ───────────────────────────── Remove a photo (FRD v1.480) ─────────────────────────────

test('Remove a photo: offered only on a material that has a photo; a choice lists the photos in order; the review writes nothing; confirm removes that one through the service', async () => {
  const withPhoto = materialSpecsFromView({ specs: [listRow({ id: 's1', photos: [{ photoUrl: 'u', fileKey: 'k' }] }), listRow({ id: 's2', photos: [] })], hasMore: false, nextCursor: null }, 'prop-1', true, []);
  assert.ok(rowActionIds(withPhoto, 's1').includes('material-spec-photo-delete'));
  assert.ok(!rowActionIds(withPhoto, 's2').includes('material-spec-photo-delete'));
  assert.ok(rowActionIds(withPhoto, 's1').length <= 4);
  const choice = await invoke('PHOTO_DELETE');
  assert.equal(choice.status, 'NEEDS_CONTEXT');
  assert.deepEqual(choice.captureRequests[0].inputSchema.fields[0].inputSchema.options, [{ label: 'Photo 1: Front wall', value: 'ph1' }, { label: 'Photo 2', value: 'ph2' }]);
  assert.equal(writes().length, 0);
  const review = await materialSpecStateResult('user-1', 'prop-1', 'PHOTO_DELETE', { entityId: 's1' }, { photoId: 'ph2' });
  assert.equal(review.status, 'NEEDS_CONFIRMATION');
  assert.equal(review.blocks[0].tone, 'CAUTION');
  assert.equal(writes().length, 0, 'the review writes nothing');
  const done = await confirmCapabilityInvoke(OP, ctx(review.parameters));
  assert.equal(done.result.reasonCode, 'MATERIAL_SPEC_PHOTO_DELETE_COMPLETED');
  assert.deepEqual(writes(), [['deletePhoto', 'prop-1', 's1', 'ph2']]);
});

test('Remove a photo: no photos, an unknown photo and a viewer change nothing; photos that changed during the confirmation are a conflict', async () => {
  install({ photos: [] });
  assert.equal((await invoke('PHOTO_DELETE')).reasonCode, 'MATERIAL_SPEC_NO_PHOTOS');
  install();
  const unknown = await materialSpecStateResult('user-1', 'prop-1', 'PHOTO_DELETE', { entityId: 's1' }, { photoId: 'nope' });
  assert.equal(unknown.reasonCode, 'MATERIAL_SPEC_PHOTO_NOT_FOUND');
  assert.equal((await invoke('PHOTO_DELETE', launch('PHOTO_DELETE'), 'VIEWER')).status, 'BLOCKED');
  const review = await materialSpecStateResult('user-1', 'prop-1', 'PHOTO_DELETE', { entityId: 's1' }, { photoId: 'ph1' });
  db.photos = [{ id: 'ph1', caption: 'Front wall', sortOrder: 0 }];
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  db.photos = [];
  await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(review.parameters)), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  assert.equal(writes().length, 0);
});
