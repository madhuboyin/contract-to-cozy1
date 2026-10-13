const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Claims": the checklist view, tick and reopen an item, and add a note (FRD v1.337). No database, browser or native module.

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
const { ClaimsService } = require('../../src/services/claims/claims.service.ts');
const command = require('../../src/services/ask/support/claimActivityCommand.ts');
const { claimChecklistFromRows } = require('../../src/services/ask/handlers/claimActivity.handler.ts');
const { claimItemActions } = require('../../src/services/ask/handlers/claims.handler.ts');

const OP = 'CLAIM_ACTIVITY_COMMAND';
const M = command.CLAIM_ACTIVITY_MESSAGES;
const CLAIM = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('which step an item allows from its status', () => {
  assert.deepEqual(command.claimChecklistKinds('OPEN'), ['DONE', 'NOT_APPLICABLE']);
  assert.deepEqual(command.claimChecklistKinds('DONE'), ['REOPEN']);
  assert.deepEqual(command.claimChecklistKinds('NOT_APPLICABLE'), ['REOPEN']);
  assert.equal(command.parseClaimNoteAnswer({ note: 'ab' }).success, false);
  assert.equal(command.parseClaimNoteAnswer({ note: 'Adjuster visits Tuesday' }).success, true);
  assert.equal(command.parseClaimNoteAnswer({ note: 'ok fine', claimId: 'x' }).success, false);
});

function install(role, item = { id: ITEM, claimId: CLAIM, title: 'Photos of the damage', status: 'OPEN', completedAt: null, claim: { title: 'Storm damage' } }) {
  const saved = { a: propertyAccess.resolvePropertyAccess, c: prisma.claim, i: prisma.claimChecklistItem, n: ClaimsService.addTimelineEvent, u: ClaimsService.updateChecklistItem, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  prisma.claim = { findFirst: async (a) => (a.where.id === CLAIM ? { id: CLAIM, title: 'Storm damage', status: 'DRAFT', lastActivityAt: T } : null) };
  prisma.claimChecklistItem = {
    findFirst: async (a) => (item && a.where.id === item.id ? item : null),
    findMany: async () => [{ id: ITEM, title: 'Photos of the damage', description: 'Wide and close', required: true, status: 'OPEN' }, { id: 'i2', title: 'Repair estimate', description: null, required: false, status: 'DONE' }],
  };
  ClaimsService.addTimelineEvent = async (...a) => { calls.push(['note', ...a]); return {}; };
  ClaimsService.updateChecklistItem = async (...a) => { calls.push(['item', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; prisma.claim = saved.c; prisma.claimChecklistItem = saved.i; ClaimsService.addTimelineEvent = saved.n; ClaimsService.updateChecklistItem = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.claimActivityEntityType(kind), ...over });
const invoke = (message, launchContext, op = OP) => capabilityInvoke(op, { userId: 'u1', propertyId: 'prop-1', message, launchContext });

test('the checklist is read for any member; steps are offered to contributors; the read needs a claim to open', async () => {
  for (const message of [...Object.values(M), command.CLAIM_CHECKLIST_MESSAGE]) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  let w = install('VIEWER');
  try {
    const viewer = await invoke(command.CLAIM_CHECKLIST_MESSAGE, { operationId: 'CLAIM_CHECKLIST_VIEW', surface: 'ASK_PAGE', entityType: 'CLAIM', entityId: CLAIM }, 'CLAIM_CHECKLIST_VIEW');
    assert.equal(viewer.status, 'ANSWERED');
    assert.equal(viewer.blocks[0].title, '1 of 2 checklist items done');
    assert.deepEqual(viewer.blocks[1].sections[0].items.flatMap((i) => i.actions), []);
    const bare = await invoke(command.CLAIM_CHECKLIST_MESSAGE, undefined, 'CLAIM_CHECKLIST_VIEW');
    assert.equal(bare.reasonCode, 'CLAIM_CHECKLIST_TARGET_REQUIRED');
  } finally { w.restore(); }
  const pure = claimChecklistFromRows({ id: CLAIM, title: 'Storm damage' }, [{ id: ITEM, title: 'Photos', description: null, required: true, status: 'OPEN' }, { id: 'i2', title: 'Estimate', description: null, required: false, status: 'DONE' }], true);
  assert.deepEqual(pure.blocks[1].sections[0].items.map((i) => i.actions.map((a) => a.id)), [['claim-checklist-done', 'claim-checklist-not-applicable'], ['claim-checklist-reopen']]);
  assert.deepEqual(pure.blocks[0].actions.map((a) => a.id), ['claim-note']);
});

test('declared-action only, a contributor command; viewers refused; an item already in that state is said', async () => {
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke(M.DONE, launch('DONE', ITEM))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke(M.DONE, launch('DONE', ITEM, { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_CLAIM_ACTIVITY_NOT_DIRECTLY_ROUTABLE');
    const review = await invoke(M.DONE, launch('DONE', ITEM));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(review.confirmation.fields.map((f) => f.value), ['Storm damage', 'Photos of the damage', 'To do → Done']);
    assert.equal((await invoke(M.REOPEN, launch('REOPEN', ITEM))).reasonCode, 'CLAIM_CHECKLIST_STEP_NOT_AVAILABLE');
    const form = await invoke(M.NOTE, launch('NOTE', CLAIM));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('confirming calls the routes\' own service functions; stale and invalid write nothing', async () => {
  const w = install('CONTRIBUTOR');
  try {
    await confirmCapabilityInvoke(OP, ctx({ claimActivityCommand: { kind: 'DONE', entityId: ITEM }, claimActivityContextVersion: sha(`claim-item:DONE:${ITEM}:OPEN:`) }));
    assert.deepEqual(w.calls[0], ['item', 'prop-1', CLAIM, ITEM, 'u1', { status: 'DONE' }]);
    await confirmCapabilityInvoke(OP, ctx({ claimActivityCommand: { kind: 'NOTE', entityId: CLAIM }, claimActivityContextVersion: sha(`claim-note:${CLAIM}:${T.toISOString()}`), claimNote: { note: 'Adjuster visits Tuesday' } }));
    assert.equal(w.calls[1][0], 'note');
    assert.deepEqual([w.calls[1][1], w.calls[1][2], w.calls[1][3]], ['prop-1', CLAIM, 'u1']);
    assert.equal(w.calls[1][4].type, 'NOTE');
    assert.equal(w.calls[1][4].description, 'Adjuster visits Tuesday');
    const before = w.calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ claimActivityCommand: { kind: 'DONE', entityId: ITEM }, claimActivityContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ claimActivityCommand: { kind: 'NOTE', entityId: CLAIM }, claimActivityContextVersion: sha(`claim-note:${CLAIM}:${T.toISOString()}`), claimNote: { note: 'x' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, before);
  } finally { w.restore(); }
});

test('the claim rows offer the checklist to every member, the steps to contributors; ids allowlisted', () => {
  assert.deepEqual(claimItemActions('VIEWER').map((a) => a.id), ['claim-checklist']);
  assert.equal(claimItemActions('CONTRIBUTOR').at(-1).id, 'claim-checklist');
  assert.equal(claimItemActions('CONTRIBUTOR').at(-1).operationId, 'CLAIM_CHECKLIST_VIEW');
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('claim-checklist', 'INCIDENT_CLAIM_STATUS'), true);
  for (const id of Object.values(command.CLAIM_ACTIVITY_ACTION_IDS)) assert.equal(applicable(id, 'CLAIM_CHECKLIST_VIEW'), true, id);
  assert.equal(applicable('claims-back', OP), true);
});
