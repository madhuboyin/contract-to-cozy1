const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Permits", slice PM-B: add, change and remove a permit record from Ask (FRD v1.315). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const operations = require('../../src/services/permitTrackerOperations.ts');
const command = require('../../src/services/ask/support/permitTrackerCommand.ts');
const handler = require('../../src/services/ask/handlers/permitTrackerCommands.handler.ts');
const { permitTrackerFromView } = require('../../src/services/ask/handlers/permitTracker.handler.ts');

const OP = 'PERMIT_TRACKER_COMMAND';
const M = command.PERMIT_COMMAND_MESSAGES;
const PERMIT = {
  id: 'p-1', permitNumber: 'B-100', category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'], description: 'Re-roof', reportedStatus: 'SUBMITTED', source: 'MANUAL_ENTRY',
  contractorName: 'Acme', applicationDate: new Date('2024-03-01T12:00:00Z'), issueDate: null, expirationDate: null, estimatedCostCents: 1200000, notes: null,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withPermit(permit) {
  const saved = prisma.propertyPermitRecord;
  prisma.propertyPermitRecord = { findFirst: async (args) => (permit && args.where.id === permit.id && args.where.propertyId === 'prop-1' && args.where.isActive ? permit : null) };
  return () => { prisma.propertyPermitRecord = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launchFor = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.permitCommandTargetsProperty(kind) ? command.PERMIT_PROPERTY_ENTITY_TYPE : command.PERMIT_ENTITY_TYPE, ...over });

// ───────────────────────────── input ─────────────────────────────

test('a permit needs a kind and the work; the reported status defaults to draft; cost is cents; dates must be in order; unknown fields are refused', () => {
  assert.equal(command.parsePermitFormAnswer({ category: 'ROOFING' }).success, false);
  const ok = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: ' B-100 ', estimatedCost: '12000.50', issueDate: { precision: 'EXACT_DATE', value: '2024-05-02' }, notes: '' });
  assert.equal(ok.success, true);
  assert.deepEqual([ok.data.permitNumber, ok.data.estimatedCostCents, ok.data.issueDate, ok.data.reportedStatus, ok.data.notes], ['B-100', 1200050, '2024-05-02', 'DRAFT', null]);
  assert.deepEqual(command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'FENCE', applicationDate: '2024-06-01', issueDate: '2024-05-01' }), { success: false, reason: 'DATES' });
  assert.equal(command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'FENCE', status: 'ISSUED' }).success, false, 'the official status is not a field of this form');
  assert.equal(command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'NOT_A_WORK_TYPE' }).success, false);
});

test('the canonical create body is the reported record with one work type, noon-UTC dates and no official status', () => {
  const parsed = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', issueDate: '2024-05-02', reportedStatus: 'ISSUED_REPORTED' });
  assert.deepEqual(command.permitCreateBody(parsed.data), {
    category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'], reportedStatus: 'ISSUED_REPORTED', permitNumber: 'B-100', issueDate: '2024-05-02T12:00:00.000Z', documentIds: [],
  });
});

test('changes list only set values that differ, an open-data permit offers only reported status and notes, and the update body carries only those', () => {
  const current = { category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', description: 'Re-roof', reportedStatus: 'SUBMITTED', contractorName: 'Acme',
    applicationDate: '2024-03-01', issueDate: null, expirationDate: null, estimatedCostCents: 1200000, notes: null };
  const next = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', description: 'Re-roof', reportedStatus: 'ISSUED_REPORTED', issueDate: '2024-05-02', estimatedCost: 12000 }).data;
  const changes = command.permitEditChanges(current, next, false);
  assert.deepEqual(changes.map((c) => c.field), ['reportedStatus', 'issueDate']);
  assert.deepEqual(command.permitUpdateBody(changes, next), { reportedStatus: 'ISSUED_REPORTED', issueDate: '2024-05-02T12:00:00.000Z' });
  const apiChanges = command.permitEditChanges(current, command.parsePermitFormAnswer({ category: 'BUILDING', workType: 'FENCE', reportedStatus: 'COMPLETED_REPORTED', notes: 'Final signed' }).data, true);
  assert.deepEqual(apiChanges.map((c) => c.field), ['reportedStatus', 'notes']);
});

// ───────────────────────────── the command ─────────────────────────────

test('declared-action only and a registered contributor command', () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation(OP).adapterKey, 'permits.command');
});

test('Add opens the form; a viewer, a refresh, a wrong entity and a typed message are refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    const form = await invoke(M.ADD, launchFor('ADD', 'prop-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.PERMIT_FORM_CAPTURE_KEYS.ADD);
    assert.equal(form.captureRequests[0].inputSchema.fields.some((f) => f.key === 'status' || f.key === 'officialStatus'), false, 'no official status field');
    assert.deepEqual(form.parameters.permitCommandLaunch, { kind: 'ADD', entityId: 'prop-1', sourceExecutionId: null });
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_PERMIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'prop-1', { entityType: command.PERMIT_ENTITY_TYPE }))).reasonCode, 'ASK_PERMIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('add a permit please', launchFor('ADD', 'prop-1'))).reasonCode, 'ASK_PERMIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'prop-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restoreRole(); }
});

test('a submitted permit is reviewed in full, says the official status is not set, and nothing is written yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  const saved = operations.createManualPermitWithEffects; let created = 0;
  operations.createManualPermitWithEffects = async () => { created += 1; return {}; };
  try {
    const parsed = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', reportedStatus: 'ISSUED_REPORTED', estimatedCost: 12000, issueDate: '2024-05-02' });
    const result = await handler.permitCommandResult('user-1', 'prop-1', { kind: 'ADD', entityId: 'prop-1', sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual([fields.Kind, fields.Work, fields['Reported status'], fields['Estimated cost'], fields.Issued], ['Roofing', 'Roof replacement', 'Issued', '$12,000', 'May 2, 2024']);
    assert.match(result.confirmation.description, /official status stays unconfirmed/);
    assert.equal(command.parsePermitFormAnswer(result.parameters.permitAdd).success, true, 'the stored review re-validates through the form schema');
    assert.equal(created, 0);
  } finally { operations.createManualPermitWithEffects = saved; restoreRole(); }
});

test('Change shows before -> after, refuses a no-change, and an open-data permit shows only its two changeable fields', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withPermit(PERMIT);
  try {
    const form = await invoke(M.EDIT, launchFor('EDIT', 'p-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].currentAnswer.estimatedCost, 12000);
    assert.equal(form.captureRequests[0].currentAnswer.reportedStatus, 'SUBMITTED');
    const parsed = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', description: 'Re-roof', reportedStatus: 'ISSUED_REPORTED', contractorName: 'Acme', applicationDate: '2024-03-01', estimatedCost: 12000 });
    const review = await handler.permitCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'p-1', sourceExecutionId: null }, parsed.data);
    assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Reported status', 'Submitted → Issued']]);
    const same = command.parsePermitFormAnswer({ category: 'ROOFING', workType: 'ROOF_REPLACEMENT', reportedStatus: 'SUBMITTED' });
    assert.equal((await handler.permitCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'p-1', sourceExecutionId: null }, same.data)).reasonCode, 'PERMIT_EDIT_NO_CHANGE');
    restore();
    restore = withPermit({ ...PERMIT, source: 'OPEN_DATA_API' });
    const api = await invoke(M.EDIT, launchFor('EDIT', 'p-1'));
    assert.deepEqual(api.captureRequests[0].inputSchema.fields.map((f) => f.key), ['reportedStatus', 'notes']);
    restore();
    restore = withPermit(null);
    assert.equal((await invoke(M.EDIT, launchFor('EDIT', 'p-1'))).reasonCode, 'PERMIT_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

test('Remove is a review card that says it leaves the tracker and cancels nothing with the authority', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withPermit(PERMIT);
  try {
    const review = await invoke(M.REMOVE, launchFor('REMOVE', 'p-1'));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /does not cancel anything with the authority/);
    assert.equal(review.confirmation.confirmLabel, 'Remove permit');
  } finally { restore(); restoreRole(); }
});

// ───────────────────────────── the confirmed writes ─────────────────────────────

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const saved = { c: operations.createManualPermitWithEffects, u: operations.updatePermitWithEffects, d: operations.deletePermitWithEffects, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  operations.createManualPermitWithEffects = async (...a) => { calls.push(['create', ...a]); return { id: 'p-new' }; };
  operations.updatePermitWithEffects = async (...a) => { calls.push(['update', ...a]); return {}; };
  operations.deletePermitWithEffects = async (...a) => { calls.push(['delete', ...a]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { Object.assign(operations, { createManualPermitWithEffects: saved.c, updatePermitWithEffects: saved.u, deletePermitWithEffects: saved.d }); executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const versionFor = (kind, permit) => handler.permitCommandContextVersion(kind, permit.id, permit);

test('confirming Add creates through the shared create with the reported record; Change sends only changed fields; Remove deletes', async () => {
  const restore = withPermit(PERMIT); const w = installWrites();
  try {
    const add = await confirmCapabilityInvoke(OP, ctx({
      permitAdd: { category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-200', description: null, reportedStatus: 'SUBMITTED', contractorName: null, applicationDate: null, issueDate: null, expirationDate: null, estimatedCost: null, notes: null },
      permitCommand: { kind: 'ADD', entityId: 'prop-1' },
    }));
    assert.deepEqual(w.calls[0], ['create', 'prop-1', 'user-1', { category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'], reportedStatus: 'SUBMITTED', permitNumber: 'B-200', documentIds: [] }]);
    assert.equal(add.artifactId, 'p-new');

    await confirmCapabilityInvoke(OP, ctx({
      permitEdit: { category: 'ROOFING', workType: 'ROOF_REPLACEMENT', permitNumber: 'B-100', description: 'Re-roof', reportedStatus: 'ISSUED_REPORTED', contractorName: 'Acme', applicationDate: '2024-03-01', issueDate: null, expirationDate: null, estimatedCost: 12000, notes: null },
      permitCommand: { kind: 'EDIT', entityId: 'p-1' }, permitCommandContextVersion: versionFor('EDIT', PERMIT),
    }));
    assert.deepEqual(w.calls[1], ['update', 'prop-1', 'user-1', 'p-1', { reportedStatus: 'ISSUED_REPORTED' }]);

    await confirmCapabilityInvoke(OP, ctx({ permitCommand: { kind: 'REMOVE', entityId: 'p-1' }, permitCommandContextVersion: versionFor('REMOVE', PERMIT) }));
    assert.deepEqual(w.calls[2], ['delete', 'prop-1', 'user-1', 'p-1']);
  } finally { w.restore(); restore(); }
});

test('a confirmation is refused, with nothing written, when the permit changed, vanished or was tampered with', async () => {
  const w = installWrites();
  try {
    let restore = withPermit(PERMIT);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ permitCommand: { kind: 'REMOVE', entityId: 'p-1' }, permitCommandContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ permitCommand: { kind: 'WIPE', entityId: 'p-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ permitAdd: { category: 'ROOFING' }, permitCommand: { kind: 'ADD', entityId: 'prop-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ permitAdd: { category: 'ROOFING', workType: 'FENCE', status: 'ISSUED' }, permitCommand: { kind: 'ADD', entityId: 'prop-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', 'an official status smuggled into the stored review');
    restore();
    restore = withPermit(null);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ permitCommand: { kind: 'REMOVE', entityId: 'p-1' }, permitCommandContextVersion: 'x' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restore();
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

// ───────────────────────────── the permit answer's actions ─────────────────────────────

test('the permit list offers a contributor Add and Change/Remove per row, and a viewer nothing; ids are allowlisted', () => {
  const permit = { id: 'p-1', permitNumber: 'B-100', category: 'ROOFING', workTypes: ['ROOF_REPLACEMENT'], description: null, status: 'UNKNOWN', reportedStatus: 'SUBMITTED', source: 'MANUAL_ENTRY', hasOpenInspections: false };
  const summary = { totalPermits: 1, activePermits: 1, finaledPermits: 0, openFlags: 0, statusCounts: {} };
  const owner = permitTrackerFromView([permit], summary, [], false, true, 'prop-1');
  // Add first, then the extra permit steps of FRD v1.488 (records lookup, scan, record work), all on the property.
  assert.deepEqual(owner.blocks[0].actions.map((a) => [a.id, a.entityType, a.entityId]), ['permit-tracker-add', 'permit-fetch-records', 'permit-flags-scan', 'permit-flag-add', 'permit-disclosure-export'].map((id) => [id, command.PERMIT_PROPERTY_ENTITY_TYPE, 'prop-1']));
  const row = owner.blocks.find((b) => b.id === 'permit-tracker-permits').sections[0].items[0];
  assert.deepEqual(row.actions.map((a) => a.id), ['permit-tracker-edit', 'permit-inspection-add', 'permit-official-status', 'permit-tracker-remove']);
  assert.equal(row.entityType, command.PERMIT_ENTITY_TYPE);
  const viewer = permitTrackerFromView([permit], summary, [], false, false, 'prop-1');
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.deepEqual(viewer.blocks.find((b) => b.id === 'permit-tracker-permits').sections[0].items[0].actions, []);
  const empty = permitTrackerFromView([], { totalPermits: 0, activePermits: 0, finaledPermits: 0, openFlags: 0, statusCounts: {} }, [], false, true, 'prop-1');
  assert.equal(empty.blocks[0].actions[0].id, 'permit-tracker-add');
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of ['permit-tracker-add', 'permit-tracker-edit', 'permit-tracker-remove']) assert.equal(applicable(id, 'PERMIT_TRACKER_STATUS'), true, id);
  assert.equal(applicable('permit-tracker-back', OP), true);
});
