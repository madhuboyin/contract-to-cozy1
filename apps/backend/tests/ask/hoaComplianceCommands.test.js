const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "HOA Compliance": association, approval requests (as reported) and violation notices (FRD v1.328). No database, browser or native module.

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
const { hoaComplianceService } = require('../../src/services/hoaCompliance.service.ts');
const operations = require('../../src/services/hoaComplianceOperations.ts');
const command = require('../../src/services/ask/support/hoaComplianceCommand.ts');
const handler = require('../../src/services/ask/handlers/hoaComplianceCommands.handler.ts');
const { hoaComplianceFromView } = require('../../src/services/ask/handlers/hoaCompliance.handler.ts');

const OP = 'HOA_COMPLIANCE_COMMAND';
const M = command.HOA_COMMAND_MESSAGES;
const REC = '11111111-1111-4111-8111-111111111111';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('forms mirror the routes; a blank is not a value; a decision is not a form field', () => {
  const p = command.parseHoaFormAnswer;
  assert.equal(p('ASSOCIATION', { name: 'Maple HOA', contactEmail: 'not-an-email' }).success, false);
  assert.deepEqual(p('ASSOCIATION', { name: 'Maple HOA', duesAmount: 250, duesFrequency: 'QUARTERLY', nextDueDate: '2026-12-01' }).data, { name: 'Maple HOA', duesAmount: 250, duesFrequency: 'QUARTERLY', nextDueDate: '2026-12-01' });
  assert.equal(p('APPROVAL_ADD', { workType: 'FENCE' }).success, true);
  assert.equal(p('APPROVAL_ADD', { workType: 'FENCE', decisionStatus: 'APPROVED' }).success, false);
  assert.equal(p('APPROVAL_ADD', { workType: 'FENCE', approvalConditions: 'Stain only' }).success, false, 'conditions need a recorded decision');
  assert.equal(p('APPROVAL_ADD', { workType: 'FENCE', reportedStatus: 'APPROVED' }).success, false, 'an approved status is the association\'s to record');
  assert.deepEqual(p('APPROVAL_EDIT', {}), { success: false, reason: 'NOTHING' });
  assert.equal(p('VIOLATION', { summary: '' }).success, false);
  assert.deepEqual(command.hoaServiceBody('ASSOCIATION', { name: 'Maple HOA', duesAmount: 250.5, duesFrequency: 'MONTHLY', nextDueDate: '2026-12-01' }),
    { name: 'Maple HOA', duesFrequency: 'MONTHLY', duesAmountCents: 25050, nextDueDate: '2026-12-01T12:00:00.000Z' });
  assert.deepEqual(command.hoaServiceBody('APPROVAL_ADD', { workType: 'FENCE' }), { workType: 'FENCE', reportedStatus: 'NOT_SUBMITTED', documentIds: [] });
  assert.deepEqual(command.hoaServiceBody('VIOLATION', { summary: 'Lawn', fine: 75, cureDeadline: '2026-11-01' }), { summary: 'Lawn', cureDeadline: '2026-11-01T12:00:00.000Z', fineAmountCents: 7500 });
});

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
const approval = (over = {}) => ({ id: REC, workType: 'FENCE', description: 'Cedar fence', reportedStatus: 'SUBMITTED', submittedDate: new Date('2026-08-01'), expirationDate: null, notes: null, decisionStatus: null, updatedAt: UPDATED, ...over });
function withData({ association = { id: 'assoc-1', name: 'Maple HOA', updatedAt: UPDATED }, record = approval() } = {}) {
  const saved = { a: hoaComplianceService.getAssociation, r: prisma.hoaApprovalRecord };
  hoaComplianceService.getAssociation = async () => association;
  prisma.hoaApprovalRecord = { findFirst: async (args) => (record && args.where.id === record.id ? record : null) };
  return () => { hoaComplianceService.getAssociation = saved.a; prisma.hoaApprovalRecord = saved.r; };
}
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.hoaCommandEntityType(kind), ...over });
const as = async (role, message, ctx) => { const r = withRole(role); try { return await invoke(message, ctx); } finally { r(); } };

test('declared-action only, a contributor command; an approval needs an association first', async () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let restore = withData();
  try {
    assert.equal((await as('CONTRIBUTOR', M.VIOLATION, launch('VIOLATION', 'prop-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_HOA_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await as('VIEWER', M.VIOLATION, launch('VIOLATION', 'prop-1'))).reasonCode, 'ASK_PERMISSION_REQUIRED');
    assert.equal((await as('CONTRIBUTOR', M.ASSOCIATION, launch('ASSOCIATION', 'prop-1'))).captureRequests[0].currentAnswer.name, 'Maple HOA');
    assert.equal((await as('CONTRIBUTOR', M.APPROVAL_ADD, launch('APPROVAL_ADD', 'prop-1'))).status, 'NEEDS_CONTEXT');
    restore(); restore = withData({ association: null });
    assert.equal((await as('CONTRIBUTOR', M.APPROVAL_ADD, launch('APPROVAL_ADD', 'prop-1'))).reasonCode, 'HOA_ASSOCIATION_REQUIRED');
  } finally { restore(); }
});

test('a change shows before and after, an unchanged form is refused, a removal confirms, and nothing is written at review', async () => {
  const restore = withData();
  const saved = hoaComplianceService.updateApprovalRecord; let writes = 0;
  hoaComplianceService.updateApprovalRecord = async () => { writes += 1; };
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    const form = await invoke(M.APPROVAL_EDIT, launch('APPROVAL_EDIT', REC));
    assert.equal(form.captureRequests[0].currentAnswer.reportedStatus, 'SUBMITTED');
    const changed = await handler.hoaCommandResult('user-1', 'prop-1', { kind: 'APPROVAL_EDIT', entityId: REC, sourceExecutionId: null }, { reportedStatus: 'UNDER_REVIEW' });
    assert.equal(changed.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(changed.confirmation.fields, [{ label: 'Where it stands', value: 'Submitted → Under review' }]);
    const same = await handler.hoaCommandResult('user-1', 'prop-1', { kind: 'APPROVAL_EDIT', entityId: REC, sourceExecutionId: null }, { reportedStatus: 'SUBMITTED' });
    assert.equal(same.reasonCode, 'HOA_APPROVAL_NO_CHANGE');
    assert.equal((await invoke(M.APPROVAL_REMOVE, launch('APPROVAL_REMOVE', REC))).status, 'NEEDS_CONFIRMATION');
    assert.equal(writes, 0);
  } finally { hoaComplianceService.updateApprovalRecord = saved; restoreRole(); restore(); }
});

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming goes through the shared effects module and the service; stale or invalid writes nothing', async () => {
  const restore = withData();
  const saved = {
    u: operations.upsertHoaAssociationWithEffects, c: operations.createHoaApprovalRecordWithEffects, v: operations.reportHoaViolationWithEffects,
    upd: hoaComplianceService.updateApprovalRecord, del: hoaComplianceService.deleteApprovalRecord, e: executeOperation.reconcileAskExecutionSideEffects,
  };
  const calls = [];
  operations.upsertHoaAssociationWithEffects = async (a) => { calls.push(['upsert', a]); return { association: { id: 'assoc-1' } }; };
  operations.createHoaApprovalRecordWithEffects = async (a) => { calls.push(['create', a]); return { record: { id: REC } }; };
  operations.reportHoaViolationWithEffects = async (a) => { calls.push(['violation', a]); return { id: 'inc-1' }; };
  hoaComplianceService.updateApprovalRecord = async (...a) => { calls.push(['update', ...a]); };
  hoaComplianceService.deleteApprovalRecord = async (...a) => { calls.push(['delete', ...a]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const assocVersion = sha(`hoa:ASSOCIATION:prop-1:${UPDATED.toISOString()}`);
    await confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'ASSOCIATION', entityId: 'prop-1' }, hoaContextVersion: assocVersion, hoaForm: { name: 'Maple HOA', duesAmount: 250 } }));
    assert.deepEqual(calls[0], ['upsert', { propertyId: 'prop-1', userId: 'user-1', body: { name: 'Maple HOA', duesAmountCents: 25000 } }]);
    await confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'APPROVAL_ADD', entityId: 'prop-1' }, hoaContextVersion: sha('hoa:APPROVAL_ADD:prop-1:assoc-1'), hoaForm: { workType: 'FENCE' } }));
    assert.deepEqual(calls[1], ['create', { propertyId: 'prop-1', userId: 'user-1', role: 'CONTRIBUTOR', body: { workType: 'FENCE', reportedStatus: 'NOT_SUBMITTED', documentIds: [] } }]);
    await confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'VIOLATION', entityId: 'prop-1' }, hoaContextVersion: sha('hoa:VIOLATION:prop-1'), hoaForm: { summary: 'Lawn too long' } }));
    assert.deepEqual(calls[2], ['violation', { propertyId: 'prop-1', userId: 'user-1', body: { summary: 'Lawn too long' } }]);
    const editVersion = sha(`hoa:APPROVAL_EDIT:${REC}:${UPDATED.toISOString()}`);
    await confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'APPROVAL_EDIT', entityId: REC }, hoaContextVersion: editVersion, hoaForm: { reportedStatus: 'UNDER_REVIEW' } }));
    assert.deepEqual(calls[3], ['update', REC, 'prop-1', 'user-1', { reportedStatus: 'UNDER_REVIEW' }, 'CONTRIBUTOR']);
    await confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'APPROVAL_REMOVE', entityId: REC }, hoaContextVersion: sha(`hoa:APPROVAL_REMOVE:${REC}:${UPDATED.toISOString()}`) }));
    assert.deepEqual(calls[4], ['delete', REC, 'prop-1']);
    const before = calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'APPROVAL_EDIT', entityId: REC }, hoaContextVersion: 'old', hoaForm: { reportedStatus: 'UNDER_REVIEW' } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ hoaCommand: { kind: 'APPROVAL_EDIT', entityId: REC }, hoaContextVersion: editVersion, hoaForm: { reportedStatus: 'APPROVED' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, before);
  } finally {
    operations.upsertHoaAssociationWithEffects = saved.u; operations.createHoaApprovalRecordWithEffects = saved.c; operations.reportHoaViolationWithEffects = saved.v;
    hoaComplianceService.updateApprovalRecord = saved.upd; hoaComplianceService.deleteApprovalRecord = saved.del; executeOperation.reconcileAskExecutionSideEffects = saved.e; restore();
  }
});

test('the answer offers the steps to a contributor and none to a viewer; ids are allowlisted; the five routes have the floor', () => {
  const view = { association: { name: 'Maple HOA', managementCompany: null, duesAmountCents: null }, approvals: [{ id: REC, workType: 'FENCE', reportedStatus: 'SUBMITTED', decisionStatus: null }], violations: [] };
  const rows = (r) => r.blocks.find((b) => b.id === 'hoa-compliance-items').sections[0].items;
  const contributor = hoaComplianceFromView(view, 'prop-1', new Date(), true);
  assert.deepEqual(contributor.blocks[0].actions.map((a) => a.id), ['hoa-association', 'hoa-approval-add', 'hoa-violation-report']);
  assert.deepEqual(rows(contributor)[0].actions.map((a) => a.id), ['hoa-approval-edit', 'hoa-approval-remove']);
  const viewer = hoaComplianceFromView(view, 'prop-1', new Date(), false);
  assert.deepEqual(viewer.blocks[0].actions, []);
  assert.deepEqual(rows(viewer)[0].actions, []);
  const empty = hoaComplianceFromView({ association: null, approvals: [], violations: [] }, 'prop-1', new Date(), true);
  assert.deepEqual(empty.blocks[0].actions.map((a) => a.id), ['hoa-association']);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.HOA_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'HOA_COMPLIANCE_STATUS'), true, id);
  assert.equal(applicable('hoa-back', OP), true);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/routes/hoaCompliance.routes.ts'), 'utf8');
  const writing = source.split(/\nrouter\./).slice(1).filter((s) => /^(post|put|patch|delete)\(/.test(s));
  assert.equal(writing.length, 5);
  assert.deepEqual(writing.filter((s) => !s.includes("requireHouseholdRole('CONTRIBUTOR')")), []);
});
