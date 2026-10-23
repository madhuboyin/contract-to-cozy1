const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Editing the financing profile inside Ask (owner ruling 2026-10-13, FRD v1.333). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const financing = require('../../src/services/financing.service.ts');
const writer = require('../../src/services/financingProfile/financingProfileWriter.ts');
const command = require('../../src/services/ask/support/financingProfileCommand.ts');
const handler = require('../../src/services/ask/handlers/financingProfileCommands.handler.ts');
const { financingFromView } = require('../../src/services/ask/handlers/financing.handler.ts');

const OP = 'FINANCING_PROFILE_COMMAND';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const profile = (over = {}) => ({
  id: 'fp1', propertyId: 'prop-1', mortgageStatus: 'MORTGAGED', mortgageType: 'FIXED_30', purchasePriceCents: 40000000, purchaseDate: new Date('2019-06-01T12:00:00Z'),
  originalMortgageBalanceCents: 32000000, currentMortgageBalanceCents: 28000000, mortgageBalanceAsOfDate: null, interestRateBps: 650, remainingTermMonths: 300,
  monthlyPaymentCents: 200000, hasSecondMortgage: false, secondMortgageBalanceCents: null, hasPMI: false, updatedAt: T, ...over,
});

test('form units become profile units; a blank is not a value; a user id is not a field', () => {
  const p = command.parseFinancingProfileAnswer;
  assert.equal(p({}).reason, 'NOTHING');
  const r = p({ ratePct: '6.125', remainingYears: 25, currentBalance: 279500.5, purchaseDate: '2019-06-01', hasPMI: 'YES', mortgageStatus: '' });
  assert.equal(r.success, true);
  assert.equal(r.changes.interestRateBps, 613);
  assert.equal(r.changes.remainingTermMonths, 300);
  assert.equal(r.changes.currentMortgageBalanceCents, 27950050);
  assert.equal(r.changes.hasPMI, true);
  assert.equal(r.changes.mortgageStatus, undefined);
  assert.equal(r.changes.purchaseDate.toISOString(), '2019-06-01T12:00:00.000Z');
  assert.equal(p({ ratePct: 90 }).success, false);
  assert.equal(p({ userId: 'someone' }).success, false);
  assert.equal(p({ mortgageStatus: 'MARRIED' }).success, false);
});

function withAccess(role, current = profile()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: financing.getProfile };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  financing.getProfile = async () => current;
  return () => { propertyAccess.resolvePropertyAccess = saved.a; financing.getProfile = saved.g; };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: 'prop-1', entityType: command.FINANCING_PROFILE_ENTITY_TYPE, ...over });
const invoke = (message, launchContext) => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext });

test('owner floor, declared-action only; a contributor is refused and the form is seeded with what is recorded', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.FINANCING_PROFILE_COMMAND_MESSAGE, { localRoutingEnabled: true }).operation?.operationId, OP);
  const def = getAskDomainCommandByOperation(OP);
  assert.equal(def.roleFloor, 'OWNER');
  assert.equal(def.authorization, 'PROPERTY_ROLE');
  let restore = withAccess('CONTRIBUTOR');
  try {
    assert.equal((await invoke(command.FINANCING_PROFILE_COMMAND_MESSAGE, launch())).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restore(); }
  restore = withAccess('OWNER');
  try {
    assert.equal((await invoke(command.FINANCING_PROFILE_COMMAND_MESSAGE, launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_FINANCING_PROFILE_NOT_DIRECTLY_ROUTABLE');
    const form = await invoke(command.FINANCING_PROFILE_COMMAND_MESSAGE, launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const seed = form.captureRequests[0].currentAnswer;
    assert.equal(seed.ratePct, 6.5);
    assert.equal(seed.remainingYears, 25);
    assert.equal(seed.currentBalance, 280000);
    assert.deepEqual(form.captureRequests[0].inputSchema.groups.map((group) => group.title), ['Purchase and mortgage', 'Primary mortgage', 'Additional loans and costs']);
    assert.equal(form.captureRequests[0].inputSchema.fields.find((field) => field.key === 'mortgageType').when.value, 'MORTGAGED');
    assert.equal(form.captureRequests[0].inputSchema.fields.find((field) => field.key === 'secondBalance').when.fieldKey, 'hasSecondMortgage');
    assert.match(form.captureRequests[0].confirmationText, /recorded financial details/);
  } finally { restore(); }
});

test('the review shows the exact before and after, states the balance caution, and clears loan facts visibly for no mortgage; nothing is written', async () => {
  const restore = withAccess('OWNER');
  const saved = writer.updateFinancingProfile; let writes = 0;
  writer.updateFinancingProfile = async () => { writes += 1; };
  try {
    const rate = await handler.financingProfileCommandResult('user-1', 'prop-1', { entityId: 'prop-1', sourceExecutionId: null }, { ratePct: 6.0 });
    assert.equal(rate.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(rate.confirmation.fields, [{ label: 'Interest rate', value: '6.5% → 6%' }]);
    assert.equal(rate.parameters.financingProfileExpectedUpdatedAt, T.toISOString());
    assert.equal(rate.parameters.financingProfileBalanceAcknowledged, false);

    const caution = await handler.financingProfileCommandResult('user-1', 'prop-1', { entityId: 'prop-1', sourceExecutionId: null }, { currentBalance: 330000 });
    assert.match(caution.confirmation.description, /Caution: the current balance is higher than the original balance/);
    assert.match(caution.confirmation.consentText, /on purpose/);
    assert.equal(caution.parameters.financingProfileBalanceAcknowledged, true);

    const none = await handler.financingProfileCommandResult('user-1', 'prop-1', { entityId: 'prop-1', sourceExecutionId: null }, { mortgageStatus: 'NO_MORTGAGE' });
    assert.match(none.confirmation.description, /also clears every loan detail/);
    const labels = none.confirmation.fields.map((f) => f.label);
    for (const l of ['Mortgage', 'Interest rate', 'Current balance', 'Original balance', 'Monthly payment']) assert.ok(labels.includes(l), l);
    assert.ok(!labels.includes('Purchase price'));

    const conflict = await handler.financingProfileCommandResult('user-1', 'prop-1', { entityId: 'prop-1', sourceExecutionId: null }, { mortgageStatus: 'NO_MORTGAGE', ratePct: 5 });
    assert.equal(conflict.reasonCode, 'FINANCING_PROFILE_CONFLICT');
    assert.equal(conflict.confirmation, undefined);
    const same = await handler.financingProfileCommandResult('user-1', 'prop-1', { entityId: 'prop-1', sourceExecutionId: null }, { ratePct: 6.5 });
    assert.equal(same.reasonCode, 'FINANCING_PROFILE_NO_CHANGE');
    assert.equal(writes, 0);
  } finally { writer.updateFinancingProfile = saved; restore(); }
});

const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const version = sha(`financing-profile:prop-1:${T.toISOString()}`);

test('confirming calls the canonical writer bound to the version shown; the receipt names the fields and no value; stale and non-owner write nothing', async () => {
  const restore = withAccess('OWNER');
  const saved = { u: writer.updateFinancingProfile, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  writer.updateFinancingProfile = async (arg) => { calls.push(arg); return { profile: {}, changedFields: [{ field: 'interestRateBps' }, { field: 'currentMortgageBalanceCents' }] }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({
      financingProfileForm: { ratePct: 6, currentBalance: 330000 }, financingProfileCommand: { entityId: 'prop-1' }, financingProfileContextVersion: version,
      financingProfileExpectedUpdatedAt: T.toISOString(), financingProfileBalanceAcknowledged: true,
    }));
    assert.equal(calls[0].surface, 'ASK');
    assert.deepEqual(calls[0].actor, { kind: 'USER', userId: 'user-1', role: 'OWNER' });
    assert.equal(calls[0].expectedUpdatedAt, T.toISOString());
    assert.equal(calls[0].acknowledgeBalanceExceedsOriginal, true);
    assert.equal(calls[0].changes.interestRateBps, 600);
    const receipt = JSON.stringify(out.result.blocks[0]);
    assert.match(receipt, /Interest rate, Current balance/);
    assert.doesNotMatch(receipt, /600|330|6\.0|\$/);
    const before = calls.length;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ financingProfileForm: { ratePct: 6 }, financingProfileContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ financingProfileForm: { ratePct: 6 }, financingProfileContextVersion: version }, 'CONTRIBUTOR')), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ financingProfileForm: { ratePct: 600 }, financingProfileContextVersion: version })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, before);
    writer.updateFinancingProfile = async () => { const e = new Error('The financing profile changed since you opened it.'); e.code = 'FINANCING_PROFILE_STALE'; e.statusCode = 409; throw e; };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ financingProfileForm: { ratePct: 6 }, financingProfileContextVersion: version })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
  } finally { writer.updateFinancingProfile = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.e; restore(); }
});

test('the answer offers the update to an owner only, and the id is allowlisted', () => {
  const base = { profile: profile(), equity: null, scenarios: [], calc: null, amountDollars: null, propertyId: 'prop-1' };
  const owner = financingFromView({ ...base, isOwner: true });
  assert.deepEqual(owner.blocks[0].actions.map((a) => a.id), ['financing-profile-update']);
  assert.deepEqual(financingFromView({ ...base, isOwner: false }).blocks[0].actions, []);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'SECONDARY' }, operationId, propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('financing-profile-update', 'FINANCING_OVERVIEW'), true);
  assert.equal(applicable('financing-profile-back', OP), true);
});
