const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": purchase Loan Estimates, add, revise, edit, per-figure confirmation and selection (FRD v1.352). No database, browser or native module.

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
const { BuyerPurchaseLoanEstimateService: LE } = require('../../src/services/buyerPurchaseLoanEstimate.service.ts');
const command = require('../../src/services/ask/support/buyerLoanEstimateCommand.ts');
const { leCommandResult } = require('../../src/services/ask/handlers/buyerLoanEstimateCommands.handler.ts');
const { buyerLoanEstimatesFromView } = require('../../src/services/ask/handlers/buyerLoanEstimates.handler.ts');

const OP = 'BUYER_LOAN_ESTIMATE_COMMAND';
const M = command.LE_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const rev = (over = {}) => ({
  id: 'r1', status: 'CONFIRMED', revisionNumber: 1, updatedAt: T, issuedDate: '2026-08-20', loanAmountCents: 30000000, loanTermMonths: 360, loanType: 'FIXED', noteRateBps: 675, aprBps: 701,
  monthlyPrincipalAndInterestCents: 190000, monthlyMortgageInsuranceCents: null, estimatedTotalMonthlyPaymentCents: 250000, loanCostsCents: 500000, lenderCreditsCents: 0,
  discountPointsBps: null, discountPointsCents: null, prepaidAndEscrowCents: null, cashToCloseCents: 4500000, cashToCloseDirection: 'FROM_BORROWER', rateLockStatus: 'UNKNOWN', rateLockExpirationDate: null, ...over,
});
const offer = (revisions, over = {}) => ({ id: 'o1', lenderName: 'First Bank', updatedAt: T, revisions, ...over });
const snapshot = (offers, over = {}) => ({ purchasePath: 'FINANCED', selection: null, offers, comparison: null, ...over });
const version = (s) => sha(`buyer-le:${s.purchasePath}|${s.selection?.revisionId ?? ''}|${s.offers.map((o) => `${o.id}:${o.revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join(',')}`).join('|')}`);

function install(role, snap) {
  const saved = { a: propertyAccess.resolvePropertyAccess, l: LE.list, c: LE.createOffer, r: LE.addRevision, u: LE.updateDraft, f: LE.confirm, s: LE.selectOffer, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  LE.list = async () => snap;
  LE.createOffer = async (...a) => { calls.push(['offer', ...a]); return {}; };
  LE.addRevision = async (...a) => { calls.push(['revision', ...a]); return {}; };
  LE.updateDraft = async (...a) => { calls.push(['update', ...a]); return {}; };
  LE.confirm = async (...a) => { calls.push(['confirm', ...a]); return {}; };
  LE.selectOffer = async (...a) => { calls.push(['select', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; LE.list = saved.l; LE.createOffer = saved.c; LE.addRevision = saved.r; LE.updateDraft = saved.u; LE.confirm = saved.f; LE.selectOffer = saved.s; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.LE_ENTITY_TYPE, entityId: 'r1', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, entityId, answer) => leCommandResult('u1', 'prop-1', { kind, entityId, sourceExecutionId: null }, answer);
const ALL = command.LE_FIELD_KEYS;

test('declared-action only; contributor floor; viewers refused; unfinanced purchases and missing records are explained', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(resolveAskRoutingCascade('Show my lender offers', { localRoutingEnabled: true }).operation?.operationId, 'BUYER_LOAN_ESTIMATES');
  assert.notEqual(resolveAskRoutingCascade('Compare my refinance loan estimates', { localRoutingEnabled: true }).operation?.operationId, 'BUYER_LOAN_ESTIMATES');
  let w = install('VIEWER', snapshot([offer([rev()])]));
  try { assert.equal((await invoke('OFFER_ADD', launch({ entityId: null, entityType: null }))).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([offer([rev()])]));
  try {
    assert.equal((await invoke('OFFER_ADD', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_LE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('SELECT', launch({ entityId: null }))).reasonCode, 'ASK_BUYER_LE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('OFFER_ADD', launch({ entityId: null, entityType: null }))).status, 'NEEDS_CONTEXT');
    assert.equal((await invoke('SELECT', launch({ entityId: 'nope' }))).reasonCode, 'BUYER_LE_NOT_FOUND');
    assert.equal((await invoke('DRAFT_EDIT', launch())).reasonCode, 'BUYER_LE_NOT_DRAFT');
    assert.equal((await invoke('CONFIRM', launch())).reasonCode, 'BUYER_LE_NOT_DRAFT');
    assert.equal((await invoke('REVISION_START', launch())).status, 'NEEDS_CONFIRMATION');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([], { purchasePath: 'CASH' }));
  try { assert.equal((await invoke('OFFER_ADD', launch({ entityId: null, entityType: null }))).reasonCode, 'BUYER_LE_NOT_FINANCED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([offer([rev({ id: 'd2', status: 'DRAFT', revisionNumber: 2 }), rev({ id: 'r1', status: 'CONFIRMED' })])]));
  try { assert.equal((await invoke('REVISION_START', launch())).reasonCode, 'BUYER_LE_DRAFT_EXISTS'); } finally { w.restore(); }
});

test('forms validate; confirmation is per figure with no blanket confirm; selection is planning only and says so', async () => {
  const p = command.parseLeAnswer;
  assert.equal(p('OFFER_ADD', { noteRate: 6.5 }).success, false);
  assert.equal(p('OFFER_ADD', { lenderName: 'First Bank', noteRate: 6.5 }).success, true);
  assert.equal(p('DRAFT_EDIT', {}).success, false);
  assert.equal(p('CONFIRM', { fields: ALL.slice(1) }).success, false);
  assert.equal(p('CONFIRM', { fields: ALL }).success, true);
  assert.equal(p('SELECT', { intentToProceed: 'MAYBE' }).success, false);
  const w = install('CONTRIBUTOR', snapshot([offer([rev({ id: 'd1', status: 'DRAFT', revisionNumber: 2 }), rev()])]));
  try {
    const add = await run('OFFER_ADD', null, { lenderName: 'Second Bank', loanAmount: 300000, noteRate: 6.5 });
    assert.equal(add.status, 'NEEDS_CONFIRMATION');
    const addForm = await invoke('OFFER_ADD', launch({ entityId: null, entityType: null }));
    const addGroups = addForm.captureRequests[0].inputSchema.groups;
    const listedKeys = new Set(addGroups.flatMap((g) => g.fieldKeys));
    assert.ok(addForm.captureRequests[0].inputSchema.fields.every((f) => listedKeys.has(f.key)), 'every field, including the lender, belongs to a step');
    assert.match(add.confirmation.description, /not part of your comparison until you confirm/);
    const form = await invoke('CONFIRM', launch({ entityId: 'd1' }));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.length, 9);
    assert.deepEqual(form.captureRequests[0].currentAnswer, { fields: [] });
    assert.equal((await run('CONFIRM', 'd1', { fields: ALL.slice(1) })).reasonCode, 'BUYER_LE_INPUT_INVALID');
    assert.equal((await run('CONFIRM', 'd1', { fields: ALL })).status, 'NEEDS_CONFIRMATION');
    const select = await run('SELECT', 'r1', { intentToProceed: 'NO' });
    assert.match(select.confirmation.description, /does not apply for a loan, lock a rate or contact the lender/);
    assert.equal(select.confirmation.fields.find((f) => f.label === 'Intent to proceed').value, 'Not noted (planning only)');
    assert.equal((await invoke('SELECT', launch({ entityId: 'd1' }))).reasonCode, 'BUYER_LE_NOT_CONFIRMED');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  const incomplete = install('CONTRIBUTOR', snapshot([offer([rev({ id: 'd1', status: 'DRAFT', aprBps: null })])]));
  try { assert.equal((await invoke('CONFIRM', launch({ entityId: 'd1' }))).reasonCode, 'BUYER_LE_INCOMPLETE'); } finally { incomplete.restore(); }
});

test('confirming calls the service the routes call; a changed list or a stale record writes nothing', async () => {
  const snap = snapshot([offer([rev({ id: 'd1', status: 'DRAFT', revisionNumber: 2 }), rev()])]);
  const w = install('CONTRIBUTOR', snap);
  try {
    const v = version(snap);
    const p = (kind, entityId, form, cv = v) => ({ leCommand: { kind, entityId }, leForm: form, leContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('OFFER_ADD', null, { lenderName: 'Second Bank', loanAmount: 300000, noteRate: 6.5, termYears: 30 })));
    assert.deepEqual(w.calls[0], ['offer', 'u1', 'prop-1', { lenderName: 'Second Bank', sourceType: 'MANUAL', loanAmountCents: 30000000, loanTermMonths: 360, noteRateBps: 650 }]);
    await confirmCapabilityInvoke(OP, ctx(p('DRAFT_EDIT', 'd1', { apr: 7.1, cashToClose: 45000 })));
    assert.deepEqual(w.calls[1], ['update', 'u1', 'prop-1', 'd1', { aprBps: 710, cashToCloseCents: 4500000 }]);
    await confirmCapabilityInvoke(OP, ctx(p('CONFIRM', 'd1', { fields: ALL })));
    assert.deepEqual(w.calls[2], ['confirm', 'u1', 'prop-1', 'd1']);
    await confirmCapabilityInvoke(OP, ctx(p('SELECT', 'r1', { intentToProceed: 'YES' })));
    assert.deepEqual(w.calls[3], ['select', 'u1', 'prop-1', { revisionId: 'r1', intentToProceed: true }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('SELECT', 'd1', { intentToProceed: 'NO' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('REVISION_START', 'r1', undefined))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('CONFIRM', 'd1', { fields: ALL }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 4);
  } finally { w.restore(); }
  const only = snapshot([offer([rev()])]);
  const w2 = install('CONTRIBUTOR', only);
  try {
    await confirmCapabilityInvoke(OP, ctx({ leCommand: { kind: 'REVISION_START', entityId: 'r1' }, leContextVersion: version(only) }));
    assert.equal(w2.calls[0][0], 'revision');
    assert.equal(w2.calls[0][3], 'o1');
    assert.equal(w2.calls[0][4].loanAmountCents, 30000000);
    assert.equal(w2.calls[0][4].issuedDate, undefined);
  } finally { w2.restore(); }
});

test('the offers answer offers the controls by state, to contributors only, and the ids are allowlisted', () => {
  const view = snapshot([offer([rev({ id: 'd2', status: 'DRAFT', revisionNumber: 2 }), rev({ id: 'r1' })]), offer([rev({ id: 'r3' })], { id: 'o2', lenderName: 'Second Bank' })], { selection: { offerId: 'o2', revisionId: 'r3', intentToProceedAt: null } });
  const ids = (result) => result.blocks.flatMap((b) => (b.type === 'GROUPED_LIST' ? b.sections.flatMap((s) => s.items.flatMap((i) => i.actions.map((a) => `${i.id}:${a.id}`))) : []));
  const actions = ids(buyerLoanEstimatesFromView(view, true));
  assert.ok(actions.includes('d2:buyer-le-draft-edit') && actions.includes('d2:buyer-le-confirm'));
  assert.ok(actions.includes('r1:buyer-le-select') && !actions.includes('r1:buyer-le-revision-start'));
  assert.ok(!actions.includes('r3:buyer-le-select') && actions.includes('r3:buyer-le-revision-start'));
  assert.deepEqual(ids(buyerLoanEstimatesFromView(view, false)), []);
  const empty = buyerLoanEstimatesFromView(snapshot([]), true);
  assert.equal(empty.blocks[0].actions[0].id, 'buyer-le-offer-add');
  assert.deepEqual(buyerLoanEstimatesFromView(snapshot([], { purchasePath: 'CASH' }), true).blocks[0].actions.map((a) => a.id), ['buyer-setup-path']);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.LE_ACTION_IDS)) assert.equal(applicable(id, 'BUYER_LOAN_ESTIMATES'), true, id);
  assert.equal(applicable('buyer-le-back', OP), true);
});
