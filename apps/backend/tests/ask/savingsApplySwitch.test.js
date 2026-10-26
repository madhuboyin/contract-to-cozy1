const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register/transpile-only');

// "I applied" and "I switched" on a recurring-cost saving, from Ask (the desktop's Applied and Switched). No database, browser or native module.

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
const canonical = require('../../src/services/savingsBenefitsCanonical.service.ts');
const command = require('../../src/services/ask/support/savingsBenefitCommand.ts');

const OP = 'SAVINGS_BENEFIT_COMMAND';
const M = command.SAVINGS_COMMAND_MESSAGES;
const OPP = '11111111-1111-4111-8111-111111111111';
const UPDATED = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const version = (kind, status = 'NEW') => sha(`savings:${kind}:${OPP}:${status}:${UPDATED.toISOString()}`);
const recurring = (status = 'NEW') => ({ family: 'RECURRING_COST', opportunity: { id: OPP, status, updatedAt: UPDATED, headline: 'Switch your internet plan' } });

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, detail = recurring() } = {}) {
  const saved = { p: prisma.property, d: canonical.getCanonicalOpportunityDetail, c: canonical.createCanonicalAction, x: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  canonical.getCanonicalOpportunityDetail = async () => detail;
  canonical.createCanonicalAction = async (...args) => { calls.push(args); return { id: 'action-1' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { prisma.property = saved.p; canonical.getCanonicalOpportunityDetail = saved.d; canonical.createCanonicalAction = saved.c; executeOperation.reconcileAskExecutionSideEffects = saved.x; } };
}
const invoke = (kind, entityId = `recurring-${OPP}`, role = 'OWNER', over = {}) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M[kind], launchContext: { operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.savingsCommandEntityType(kind), ...over } }, { propertyAccess: { role } });
const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'OWNER' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the kinds are declared-action opportunity steps, map to the desktop\'s action types, and are open only while the saving is undecided or saved', () => {
  assert.equal(command.savingsCommandKindFromMessage(M.APPLIED), 'APPLIED');
  assert.equal(command.savingsCommandKindFromMessage(M.SWITCHED), 'SWITCHED');
  for (const kind of ['APPLIED', 'SWITCHED']) assert.equal(command.savingsCommandEntityType(kind), command.SAVINGS_AVAILABLE_ENTITY_TYPE, kind);
  for (const message of [M.APPLIED, M.SWITCHED]) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(command.applyActionType('APPLIED'), 'EXTERNALLY_SUBMITTED');
  assert.equal(command.applyActionType('SWITCHED'), 'SWITCHED');
  for (const status of ['NEW', 'VIEWED', 'SAVED']) assert.equal(command.recurringStatusAllowsApply(status), true, status);
  for (const status of ['APPLIED', 'SWITCHED', 'DISMISSED', 'EXPIRED']) assert.equal(command.recurringStatusAllowsApply(status), false, status);
});

test('viewers, non-primary owners, misrouted launches, benefits and settled savings are refused before any confirmation', async () => {
  let w = withData(); let restoreRole = withRole('VIEWER');
  try {
    assert.equal((await invoke('APPLIED', undefined, 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreRole(); restoreRole = withRole('CONTRIBUTOR'); w.restore(); w = withData({ primary: false });
    assert.equal((await invoke('SWITCHED', undefined, 'CONTRIBUTOR')).reasonCode, 'SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY');
    restoreRole(); restoreRole = withRole('OWNER'); w.restore(); w = withData();
    assert.equal((await invoke('APPLIED', undefined, 'OWNER', { surface: 'ASK_REFRESH' })).reasonCode, 'ASK_SAVINGS_BENEFIT_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('APPLIED', `benefit-${OPP}`)).reasonCode, 'SAVINGS_OPPORTUNITY_NOT_FOUND', 'a benefit row is not a recurring one (the family differs)');
    w.restore(); w = withData({ detail: { family: 'BENEFIT', opportunity: { id: OPP, status: 'DETECTED', updatedAt: UPDATED, program: { name: 'Heat pump rebate' } } } });
    assert.equal((await invoke('APPLIED', `benefit-${OPP}`)).reasonCode, 'SAVINGS_APPLY_NOT_AVAILABLE');
    w.restore(); w = withData({ detail: recurring('APPLIED') });
    assert.equal((await invoke('SWITCHED')).reasonCode, 'SAVINGS_APPLY_NOT_AVAILABLE');
    assert.equal(w.calls.length, 0);
  } finally { restoreRole(); w.restore(); }
});

test('the review says the household did it themselves, that Cozy contacted no one, and that it is not a saving until received; nothing is saved yet', async () => {
  const restoreRole = withRole('OWNER'); const w = withData({ detail: recurring('SAVED') });
  try {
    for (const kind of ['APPLIED', 'SWITCHED']) {
      const review = await invoke(kind);
      assert.equal(review.status, 'NEEDS_CONFIRMATION', kind);
      assert.equal(review.contextVersion, version(kind, 'SAVED'));
      assert.match(review.confirmation.description, /yourself, with the provider.*Cozy has not contacted anyone and cannot confirm it.*In progress.*not counted as a saving until you record that you received it/);
    }
    assert.match((await invoke('SWITCHED')).confirmation.description, /switched to this option/);
    assert.match((await invoke('APPLIED')).confirmation.description, /applied for this option/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('confirming creates one canonical action with the desktop\'s action type and a per-execution key; stale and settled steps write nothing', async () => {
  const restoreRole = withRole('OWNER'); let w = withData();
  try {
    const parameters = (kind, over = {}) => ({ savingsCommand: { kind, entityId: `recurring-${OPP}` }, savingsContextVersion: version(kind), ...over });
    const applied = await confirmCapabilityInvoke(OP, ctx(parameters('APPLIED')));
    assert.deepEqual(w.calls[0].slice(0, 3), ['prop-1', OPP, 'user-1']);
    assert.deepEqual(w.calls[0][3], { idempotencyKey: 'ask:exec-1:applied', family: 'RECURRING_COST', actionType: 'EXTERNALLY_SUBMITTED', followUpAt: null });
    assert.equal(applied.result.reasonCode, 'SAVINGS_BENEFIT_APPLIED_COMPLETED');
    assert.equal(applied.result.blocks[0].title, 'Application recorded');
    await confirmCapabilityInvoke(OP, ctx(parameters('SWITCHED')));
    assert.deepEqual([w.calls[1][3].actionType, w.calls[1][3].idempotencyKey], ['SWITCHED', 'ask:exec-1:switched']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters('APPLIED', { savingsContextVersion: 'old' }))), (error) => error.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    w.restore(); w = withData({ detail: recurring('APPLIED') });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(parameters('APPLIED', { savingsContextVersion: version('APPLIED', 'APPLIED') }))), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); restoreRole(); }
});

test('the action ids are allowlisted for the savings answer', () => {
  for (const id of [command.SAVINGS_COMMAND_ACTION_IDS.APPLIED, command.SAVINGS_COMMAND_ACTION_IDS.SWITCHED]) {
    assert.equal(isAskActionApplicable({ action: { id, label: 'x', interactionType: 'MUTATE_RECORD', message: 'm', operationId: OP, style: 'SECONDARY' }, operationId: 'SAVINGS_OPPORTUNITIES', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, id);
  }
});

test('a recurring row offers the steps its status allows, in order, and a settled one offers none of Applied or Switched', () => {
  assert.deepEqual(command.recurringRowActionKinds('NEW'), ['SAVE', 'SWITCHED', 'APPLIED', 'DISMISS']);
  assert.deepEqual(command.recurringRowActionKinds('VIEWED'), ['SAVE', 'SWITCHED', 'APPLIED', 'DISMISS']);
  assert.deepEqual(command.recurringRowActionKinds('SAVED'), ['SWITCHED', 'APPLIED', 'DISMISS']);
  for (const status of ['APPLIED', 'SWITCHED', 'DISMISSED', 'EXPIRED']) assert.deepEqual(command.recurringRowActionKinds(status), [], status);
  assert.deepEqual(Object.values(command.RECURRING_ROW_ACTION_LABELS), ['Save for later', 'I switched', 'I applied', 'Dismiss']);
});
