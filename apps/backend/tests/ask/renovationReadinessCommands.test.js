const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P1 "Renovation Risk Advisor": readiness refresh, acknowledge, withdraw and reopen (FRD v1.324). No database, browser or native module.

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
const readinessService = require('../../src/services/renovationReadiness.service.ts');
const command = require('../../src/services/ask/support/renovationReadinessCommand.ts');
const handler = require('../../src/services/ask/handlers/renovationReadinessCommands.handler.ts');

const OP = 'RENOVATION_READINESS_COMMAND';
const M = command.READINESS_COMMAND_MESSAGES;
const CASE = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('the forms mirror the route schemas: an acknowledgement needs 20 characters and an explicit yes', () => {
  const p = command.parseReadinessFormAnswer;
  assert.equal(p('ACKNOWLEDGE', { reason: 'too short', riskAcknowledged: 'YES' }).success, false);
  assert.equal(p('ACKNOWLEDGE', { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'NO' }).success, false);
  assert.equal(p('ACKNOWLEDGE', { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' }).success, true);
  assert.equal(p('REVOKE', { reason: 'short' }).success, false);
  assert.equal(p('REVOKE', { reason: 'Plans changed again' }).success, true);
  assert.equal(p('REOPEN', { notes: 'The permit was withdrawn' }).success, true);
  assert.equal(p('REOPEN', { notes: '' }).success, false);
  assert.deepEqual(command.readinessServiceInput('ACKNOWLEDGE', { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' }),
    { action: 'ACKNOWLEDGE', reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: true });
  assert.deepEqual(command.readinessServiceInput('REOPEN', { notes: 'x' }), { status: 'OPEN', satisfactionNotes: 'x' });
});

test('which step an item allows now is one function', () => {
  const kinds = (o) => handler.readinessItemKinds({ status: 'OPEN', overrideAllowed: false, overrideAcknowledgedAt: null, manualSatisfactionAllowed: false, manuallySatisfiedAt: null, ...o });
  assert.deepEqual(kinds({ overrideAllowed: true }), ['ACKNOWLEDGE']);
  assert.deepEqual(kinds({ overrideAllowed: true, overrideAcknowledgedAt: new Date() }), ['REVOKE']);
  assert.deepEqual(kinds({ overrideAllowed: false }), [], 'an authority or safety blocker cannot be overridden');
  assert.deepEqual(kinds({ status: 'SATISFIED', manualSatisfactionAllowed: true, manuallySatisfiedAt: new Date() }), ['REOPEN']);
  assert.deepEqual(kinds({ status: 'SATISFIED', manualSatisfactionAllowed: true, manuallySatisfiedAt: null }), [], 'a source-satisfied item is not reopened by hand');
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const baseItem = (over = {}) => ({
  id: ITEM, renovationCaseId: CASE, title: 'Building permit', status: 'OPEN', isBlocking: true, overrideAllowed: true, manualSatisfactionAllowed: false,
  overrideAcknowledgedAt: null, manuallySatisfiedAt: null, updatedAt: UPDATED, reason: 'No permit is recorded.', ...over,
});
function withData({ item = baseItem(), renovationCase = { id: CASE, name: 'Kitchen remodel', updatedAt: UPDATED, readinessSummary: { fulfillmentMode: 'DIY' } } } = {}) {
  const saved = { i: prisma.renovationStartReadinessItem, c: prisma.renovationCase };
  prisma.renovationStartReadinessItem = { findFirst: async (args) => (item && args.where.id === item.id ? item : null) };
  prisma.renovationCase = { findFirst: async (args) => (renovationCase && args.where.id === renovationCase.id ? renovationCase : null) };
  return () => { prisma.renovationStartReadinessItem = saved.i; prisma.renovationCase = saved.c; };
}
const invoke = (message, launchContext, role = 'OWNER') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.readinessCommandEntityType(kind), ...over });

test('declared-action only; viewers are refused and acknowledging a risk is an owner\'s decision', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  const restore = withData();
  const as = async (role, message, launchContext) => {
    const restoreRole = withRole(role);
    try { return await invoke(message, launchContext, role); } finally { restoreRole(); }
  };
  try {
    assert.equal((await as('OWNER', M.REFRESH, launch('REFRESH', CASE, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('OWNER', M.REFRESH, launch('REFRESH', CASE, { entityType: command.RENOVATION_READINESS_ITEM_ENTITY_TYPE }))).reasonCode, 'ASK_RENOVATION_READINESS_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('VIEWER', M.REFRESH, launch('REFRESH', CASE))).reasonCode, 'ASK_PERMISSION_REQUIRED');
    assert.equal((await as('CONTRIBUTOR', M.ACKNOWLEDGE, launch('ACKNOWLEDGE', ITEM))).reasonCode, 'ASK_OWNER_REQUIRED');
    assert.equal((await as('CONTRIBUTOR', M.REVOKE, launch('REVOKE', ITEM))).reasonCode, 'ASK_OWNER_REQUIRED');
    assert.equal((await as('CONTRIBUTOR', M.REFRESH, launch('REFRESH', CASE))).status, 'NEEDS_CONFIRMATION', 'a contributor may refresh');
  } finally { restore(); }
});

test('refresh confirms with the work mode and the boundary; an owner is offered the acknowledgement form; an overridable-not item is refused', async () => {
  const restoreRole = withRole('OWNER'); let restore = withData();
  try {
    const refresh = await invoke(M.REFRESH, launch('REFRESH', CASE));
    assert.equal(refresh.parameters.readinessMode, 'DIY');
    assert.match(refresh.confirmation.description, /does not establish that the work is compliant or permitted/);
    const form = await invoke(M.ACKNOWLEDGE, launch('ACKNOWLEDGE', ITEM));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.READINESS_FORM_CAPTURE_KEYS.ACKNOWLEDGE);
    restore(); restore = withData({ item: baseItem({ overrideAllowed: false }) });
    assert.equal((await invoke(M.ACKNOWLEDGE, launch('ACKNOWLEDGE', ITEM))).reasonCode, 'RENOVATION_READINESS_STEP_NOT_AVAILABLE');
    restore(); restore = withData({ item: null });
    assert.equal((await invoke(M.ACKNOWLEDGE, launch('ACKNOWLEDGE', ITEM))).reasonCode, 'RENOVATION_READINESS_ITEM_NOT_FOUND');
  } finally { restore(); restoreRole(); }
});

test('a submitted acknowledgement is reviewed with its reason and writes nothing yet', async () => {
  const restoreRole = withRole('OWNER'); const restore = withData();
  const saved = readinessService.governOverride; let writes = 0;
  readinessService.governOverride = async () => { writes += 1; };
  try {
    const parsed = command.parseReadinessFormAnswer('ACKNOWLEDGE', { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' });
    const result = await handler.readinessCommandResult('user-1', 'prop-1', { kind: 'ACKNOWLEDGE', entityId: ITEM, sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.match(result.confirmation.description, /does not satisfy the item/);
    assert.deepEqual(Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value])), { Item: 'Building permit', 'Your reason': 'The inspector confirmed the work is exempt.' });
    assert.equal(writes, 0);
  } finally { readinessService.governOverride = saved; restore(); restoreRole(); }
});

const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
function installService() {
  const names = ['evaluateReadiness', 'governOverride', 'updateReadinessItem'];
  const saved = Object.fromEntries(names.map((n) => [n, readinessService[n]]));
  const calls = [];
  for (const n of names) readinessService[n] = async (...args) => { calls.push([n, ...args]); return {}; };
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, svc: readinessService, restore() { for (const n of names) readinessService[n] = saved[n]; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}

test('confirming calls the canonical service with the route\'s input; stale, invalid and refused steps write nothing', async () => {
  const restoreRole = withRole('OWNER'); const restore = withData();
  const w = installService();
  try {
    const itemVersion = (kind) => sha(`readiness:${kind}:${ITEM}:OPEN::${UPDATED.toISOString()}`);
    const caseVersion = sha(`readiness:REFRESH:${CASE}:${UPDATED.toISOString()}`);
    await confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'REFRESH', entityId: CASE }, readinessContextVersion: caseVersion, readinessMode: 'DIY' }, 'CONTRIBUTOR'));
    assert.deepEqual(w.calls[0], ['evaluateReadiness', 'prop-1', CASE, 'user-1', 'DIY']);
    await confirmCapabilityInvoke(OP, ctx({
      readinessCommand: { kind: 'ACKNOWLEDGE', entityId: ITEM }, readinessContextVersion: itemVersion('ACKNOWLEDGE'),
      readinessForm: { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' },
    }));
    assert.deepEqual(w.calls[1], ['governOverride', 'prop-1', CASE, ITEM, 'user-1', { action: 'ACKNOWLEDGE', reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: true }]);
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ readinessCommand: { kind: 'REFRESH', entityId: CASE }, readinessContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      readinessCommand: { kind: 'ACKNOWLEDGE', entityId: ITEM }, readinessContextVersion: itemVersion('ACKNOWLEDGE'), readinessForm: { reason: 'short', riskAcknowledged: 'YES' },
    })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      readinessCommand: { kind: 'ACKNOWLEDGE', entityId: ITEM }, readinessContextVersion: itemVersion('ACKNOWLEDGE'),
      readinessForm: { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' },
    }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    assert.equal(w.calls.length, before);
  } finally { w.restore(); restore(); restoreRole(); }
});

test('a service refusal reaches the person in its own words', async () => {
  const restoreRole = withRole('OWNER'); const restore = withData();
  const w = installService();
  w.svc.governOverride = async () => { const e = new Error('This authority, safety, or source-controlled blocker cannot be overridden.'); e.statusCode = 409; e.code = 'RENOVATION_READINESS_OVERRIDE_PROHIBITED'; throw e; };
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      readinessCommand: { kind: 'ACKNOWLEDGE', entityId: ITEM }, readinessContextVersion: sha(`readiness:ACKNOWLEDGE:${ITEM}:OPEN::${UPDATED.toISOString()}`),
      readinessForm: { reason: 'The inspector confirmed the work is exempt.', riskAcknowledged: 'YES' },
    })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /cannot be overridden/.test(e.message));
  } finally { w.restore(); restore(); restoreRole(); }
});

test('the ids are allowlisted for the answer that emits them', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.READINESS_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'RENOVATION_PERMIT_READINESS'), true, id);
  assert.equal(applicable('renovation-readiness-back', OP), true);
});
