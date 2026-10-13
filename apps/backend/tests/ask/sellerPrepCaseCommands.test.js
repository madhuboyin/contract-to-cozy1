const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Seller Prep": the sale case itself (FRD v1.338). No database, browser or native module.

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
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const command = require('../../src/services/ask/support/sellerPrepCaseCommand.ts');
const { sellerPrepCaseActions } = require('../../src/services/ask/handlers/sellHoldRent.handler.ts');

const OP = 'SELLER_PREP_CASE_COMMAND';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const caseRow = (over = {}) => ({ id: 'case-1', status: 'PREPARING', targetListDate: null, targetCloseDate: null, budgetRange: null, updatedAt: T, ...over });
const version = (c, propertyId = 'prop-1') =>
  sha(`sale-case:${c?.id ?? propertyId}:${c?.status ?? 'none'}:${c?.targetListDate?.toISOString().slice(0, 10) ?? ''}:${c?.targetCloseDate?.toISOString().slice(0, 10) ?? ''}:${c?.budgetRange ?? ''}:${c?.updatedAt?.toISOString() ?? ''}`);

function install(role, saleCase, canCreate = true) {
  const S = PropertySaleCaseService;
  const saved = { a: propertyAccess.resolvePropertyAccess, g: S.getCase, c: S.createCase, d: S.updateTargetDates, b: S.updateBudgetRange, t: S.transitionStatus, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  S.getCase = async () => ({ propertyId: 'prop-1', saleCase, canCreate, readinessItems: [], transitions: [] });
  S.createCase = async (...a) => { calls.push(['create', ...a]); return {}; };
  S.updateTargetDates = async (...a) => { calls.push(['dates', ...a]); return {}; };
  S.updateBudgetRange = async (...a) => { calls.push(['budget', ...a]); return {}; };
  S.transitionStatus = async (...a) => { calls.push(['status', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; S.getCase = saved.g; S.createCase = saved.c; S.updateTargetDates = saved.d; S.updateBudgetRange = saved.b; S.transitionStatus = saved.t; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (kind, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: 'prop-1', entityType: command.SALE_CASE_ENTITY_TYPE, ...over, _kind: kind });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: command.SALE_CASE_MESSAGES[kind], launchContext: launchContext ?? launch(kind) });
const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });

test('forms mirror the routes: dates are exact and ordered, budget is a known range, the next stage is the service\'s own order', () => {
  const p = command.parseSaleCaseAnswer;
  assert.equal(p('DATES', { targetListDate: '2026-11-01' }).success, true);
  assert.equal(p('DATES', {}).reason, 'NOTHING');
  assert.equal(p('DATES', { targetListDate: '2026-11-10', targetCloseDate: '2026-11-01' }).reason, 'ORDER');
  assert.equal(p('DATES', { targetListDate: 'tomorrow' }).success, false);
  assert.equal(p('BUDGET', { budgetRange: 'OVER_30K' }).success, true);
  assert.equal(p('BUDGET', { budgetRange: 'LOTS' }).success, false);
  assert.deepEqual(command.legalNextStatuses('PREPARING'), ['LISTED', 'CANCELLED']);
  assert.deepEqual(command.legalNextStatuses('UNDER_CONTRACT'), ['CLOSED', 'CANCELLED']);
  assert.deepEqual(command.legalNextStatuses('CLOSED'), []);
  assert.deepEqual(command.legalNextStatuses('CANCELLED'), []);
});

test('declared-action only, contributor command; viewers refused; refresh not routable; start is guarded by canCreate and an existing case', async () => {
  assert.notEqual(resolveAskRoutingCascade(command.SALE_CASE_MESSAGES.START, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER', null);
  try { assert.equal((await invoke('START')).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', null);
  try {
    assert.equal((await invoke('START', launch('START', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_SELLER_PREP_CASE_NOT_DIRECTLY_ROUTABLE');
    const review = await invoke('START');
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /does not list the home or contact anyone/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', null, false);
  try { assert.equal((await invoke('START')).reasonCode, 'SELLER_PREP_CASE_NOT_AVAILABLE'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', caseRow());
  try { assert.equal((await invoke('START')).reasonCode, 'SELLER_PREP_CASE_EXISTS'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', null);
  try { assert.equal((await invoke('DATES')).reasonCode, 'SELLER_PREP_NO_ACTIVE_CASE'); } finally { w.restore(); }
});

test('dates and budget open a seeded form, then review exact before and after; stage offers only legal steps and says it lists nothing', async () => {
  const { saleCaseCommandResult } = require('../../src/services/ask/handlers/sellerPrepCaseCommands.handler.ts');
  const w = install('CONTRIBUTOR', caseRow({ targetListDate: new Date('2026-10-01T12:00:00Z'), budgetRange: 'UNDER_5K' }));
  try {
    const form = await invoke('DATES');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].currentAnswer, { targetListDate: '2026-10-01' });
    const dates = await saleCaseCommandResult('u1', 'prop-1', { kind: 'DATES', sourceExecutionId: null }, { targetCloseDate: '2026-12-01' });
    assert.equal(dates.status, 'NEEDS_CONFIRMATION');
    assert.equal(dates.confirmation.fields.length, 1);
    assert.match(dates.confirmation.fields[0].value, /Not set/);
    const budget = await saleCaseCommandResult('u1', 'prop-1', { kind: 'BUDGET', sourceExecutionId: null }, { budgetRange: 'FIVE_TO_15K' });
    assert.equal(budget.confirmation.fields[0].value, 'Under $5,000 → $5,000 to $15,000');
    const stageForm = await invoke('STATUS');
    assert.deepEqual(stageForm.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['LISTED', 'CANCELLED']);
    const skip = await saleCaseCommandResult('u1', 'prop-1', { kind: 'STATUS', sourceExecutionId: null }, { status: 'CLOSED' });
    assert.equal(skip.reasonCode, 'SELLER_PREP_STATUS_NOT_ALLOWED');
    const stage = await saleCaseCommandResult('u1', 'prop-1', { kind: 'STATUS', sourceExecutionId: null }, { status: 'LISTED' });
    assert.match(stage.confirmation.description, /lists, contracts or closes nothing with anyone/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service\'s own write; stale, invalid and out-of-order write nothing', async () => {
  const row = caseRow({ budgetRange: 'UNDER_5K' });
  const w = install('CONTRIBUTOR', row);
  const v = version(row);
  const p = (kind, form, contextVersion = v) => ({ saleCaseCommand: { kind, entityId: 'prop-1' }, saleCaseForm: form, saleCaseContextVersion: contextVersion });
  try {
    await confirmCapabilityInvoke(OP, ctx(p('BUDGET', { budgetRange: 'NONE' })));
    assert.deepEqual(w.calls[0], ['budget', 'u1', 'prop-1', null]);
    await confirmCapabilityInvoke(OP, ctx(p('DATES', { targetListDate: '2026-11-01' })));
    assert.equal(w.calls[1][0], 'dates');
    assert.equal(w.calls[1][3].targetListDate.toISOString().slice(0, 10), '2026-11-01');
    assert.equal('targetCloseDate' in w.calls[1][3], false);
    await confirmCapabilityInvoke(OP, ctx(p('STATUS', { status: 'LISTED' })));
    assert.deepEqual(w.calls[2], ['status', 'u1', 'prop-1', 'LISTED']);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('STATUS', { status: 'CLOSED' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('BUDGET', { budgetRange: 'FIVE_TO_15K' }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('BUDGET', { budgetRange: 'LOTS' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
  const none = install('CONTRIBUTOR', null);
  try {
    await confirmCapabilityInvoke(OP, ctx({ saleCaseCommand: { kind: 'START', entityId: 'prop-1' }, saleCaseContextVersion: version(null) }));
    assert.deepEqual(none.calls[0], ['create', 'u1', 'prop-1']);
  } finally { none.restore(); }
  const existing = install('CONTRIBUTOR', row);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ saleCaseCommand: { kind: 'START', entityId: 'prop-1' }, saleCaseContextVersion: v })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(existing.calls.length, 0);
  } finally { existing.restore(); }
});

test('the checklist answer offers the case actions to contributors only, stage only while one exists, and the ids are allowlisted', () => {
  const { HouseholdRole } = require('@prisma/client');
  assert.deepEqual(sellerPrepCaseActions(HouseholdRole.VIEWER, 'PREPARING', true), []);
  assert.deepEqual(sellerPrepCaseActions(HouseholdRole.CONTRIBUTOR, null, true).map((a) => a.id), ['seller-prep-case-start']);
  assert.deepEqual(sellerPrepCaseActions(HouseholdRole.CONTRIBUTOR, null, false), []);
  assert.deepEqual(sellerPrepCaseActions(HouseholdRole.OWNER, 'LISTED', false).map((a) => a.id), ['seller-prep-case-dates', 'seller-prep-case-budget', 'seller-prep-case-status']);
  assert.deepEqual(sellerPrepCaseActions(HouseholdRole.OWNER, 'CLOSED', false).map((a) => a.id), ['seller-prep-case-dates', 'seller-prep-case-budget']);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.SALE_CASE_ACTION_IDS)) assert.equal(applicable(id, 'SELLER_PREP_CHECKLIST'), true, id);
  assert.equal(applicable('seller-prep-back', OP), true);
});
