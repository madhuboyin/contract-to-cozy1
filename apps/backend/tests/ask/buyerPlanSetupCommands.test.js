const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": payment path, inspection plan and title or escrow contact (FRD v1.353). No database, browser or native module.

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
const { BuyerAcquisitionService: Acq } = require('../../src/services/buyerAcquisition.service.ts');
const { BuyerPurchaseLoanEstimateService: LE } = require('../../src/services/buyerPurchaseLoanEstimate.service.ts');
const { BuyerTitleEscrowService: Title } = require('../../src/services/buyerTitleEscrow.service.ts');
const command = require('../../src/services/ask/support/buyerPlanSetupCommand.ts');
const { setupCommandResult } = require('../../src/services/ask/handlers/buyerPlanSetupCommands.handler.ts');

const OP = 'BUYER_PLAN_SETUP_COMMAND';
const M = command.SETUP_MESSAGES;
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

function install(role, state = {}) {
  const saved = { a: propertyAccess.resolvePropertyAccess, l: LE.list, p: Acq.getInspectionPlan, u: Acq.updateInspectionPlan, f: Acq.updatePurchaseFinancingPlan, t: Title.get, tu: Title.update, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  LE.list = async () => ({ purchasePath: state.path ?? 'FINANCED', selection: state.selection ?? null, offers: [] });
  Acq.getInspectionPlan = async () => ({ plan: state.plan === undefined ? null : state.plan });
  Acq.updateInspectionPlan = async (...a) => { calls.push(['plan', ...a]); return {}; };
  Acq.updatePurchaseFinancingPlan = async (...a) => { calls.push(['path', ...a]); return {}; };
  Title.get = async () => ({ workspace: null, contact: state.contact ?? null, documents: [] });
  Title.update = async (...a) => { calls.push(['title', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; LE.list = saved.l; Acq.getInspectionPlan = saved.p; Acq.updateInspectionPlan = saved.u; Acq.updatePurchaseFinancingPlan = saved.f; Title.get = saved.t; Title.update = saved.tu; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, answer) => setupCommandResult('u1', 'prop-1', { kind, sourceExecutionId: null }, answer);
const plan = (over = {}) => ({ scheduledAt: new Date('2026-09-10T12:00:00.000Z'), appointmentCompletedAt: null, reportDueAt: null, contingencyDueAt: null, accessNotes: null, scopeNotes: null,
  specialistScopes: ['RADON'], propertyQuestions: ['Is the roof original?'], reinspectionRequired: false, reinspectionScheduledAt: null, reinspectionCompletedAt: null, updatedAt: new Date('2026-09-01T00:00:00.000Z'), ...over });
const version = async (kind, state) => {
  const snap = kind === 'PATH_SET' ? { kind, purchasePath: state.path ?? 'FINANCED', selection: state.selection?.revisionId ?? null } : kind === 'TITLE_CONTACT' ? { kind, contact: state.contact ?? null } : null;
  return snap ? sha(`buyer-setup:${JSON.stringify(snap)}`) : null;
};

test('declared-action only; contributor floor; viewers refused; each form opens', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('PATH_SET', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { plan: plan() });
  try {
    assert.equal((await invoke('PATH_SET', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_SETUP_NOT_DIRECTLY_ROUTABLE');
    for (const kind of Object.keys(M)) assert.equal((await invoke(kind, launch())).status, 'NEEDS_CONTEXT', kind);
    const form = await invoke('INSPECTION_PLAN', launch());
    assert.deepEqual(form.captureRequests[0].currentAnswer, { specialistScopes: ['RADON'] });
  } finally { w.restore(); }
});

test('payment path review says switching to cash clears the selected offer; an unchanged path is refused', async () => {
  const w = install('CONTRIBUTOR', { path: 'FINANCED', selection: { revisionId: 'r1' } });
  try {
    const review = await run('PATH_SET', { purchasePath: 'CASH' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /clears your selected lender offer/);
    assert.equal((await run('PATH_SET', { purchasePath: 'FINANCED' })).reasonCode, 'BUYER_SETUP_UNCHANGED');
    assert.equal((await run('PATH_SET', { purchasePath: 'BARTER' })).reasonCode, 'BUYER_SETUP_INPUT_INVALID');
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('inspection plan review lists only real changes and says nobody is contacted; contact notes refuse bank details', async () => {
  const w = install('CONTRIBUTOR', { plan: plan(), contact: { role: 'TITLE_ESCROW', name: 'Pat', company: null, email: null, phone: null, notes: null } });
  try {
    assert.equal((await run('INSPECTION_PLAN', {})).reasonCode, 'BUYER_SETUP_INPUT_INVALID');
    assert.equal((await run('INSPECTION_PLAN', { scheduledDate: '2026-09-10', specialistScopes: ['RADON'] })).reasonCode, 'BUYER_SETUP_UNCHANGED');
    const review = await run('INSPECTION_PLAN', { scheduledDate: '2026-09-12', specialistScopes: ['RADON', 'MOLD'], newQuestion: 'Is the sump pump working?' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /does not schedule or contact an inspector/);
    assert.ok(review.confirmation.fields.some((f) => f.label === 'Specialist inspections' && /Mold/.test(f.value)));
    assert.equal(review.confirmation.fields.some((f) => f.label === 'Access notes'), false);
    assert.equal((await run('TITLE_CONTACT', { role: 'ATTORNEY', name: 'Lee', notes: 'wire to account 123456789012' })).reasonCode, 'BUYER_SETUP_INPUT_INVALID');
    const contact = await run('TITLE_CONTACT', { role: 'ATTORNEY', name: 'Lee', phone: '555-123-4567' });
    assert.equal(contact.status, 'NEEDS_CONFIRMATION');
    assert.match(contact.confirmation.description, /shared with everyone in your household/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('confirming calls the service the routes call; a changed record writes nothing', async () => {
  const state = { path: 'FINANCED', selection: null, plan: plan(), contact: null };
  const w = install('CONTRIBUTOR', state);
  try {
    const v = await version('PATH_SET', state);
    await confirmCapabilityInvoke(OP, ctx({ setupCommand: { kind: 'PATH_SET' }, setupForm: { purchasePath: 'CASH' }, setupContextVersion: v }));
    assert.deepEqual(w.calls[0], ['path', 'u1', 'prop-1', { purchasePath: 'CASH' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ setupCommand: { kind: 'PATH_SET' }, setupForm: { purchasePath: 'CASH' }, setupContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    const tv = await version('TITLE_CONTACT', state);
    await confirmCapabilityInvoke(OP, ctx({ setupCommand: { kind: 'TITLE_CONTACT' }, setupForm: { role: 'ATTORNEY', name: 'Lee', phone: '555-123-4567' }, setupContextVersion: tv }));
    assert.deepEqual(w.calls[1], ['title', 'u1', 'prop-1', { contact: { role: 'ATTORNEY', name: 'Lee', phone: '555-123-4567' } }]);
    // The inspection plan's version is derived inside the handler from the loaded plan; read it from a review.
    const review = await run('INSPECTION_PLAN', { scheduledDate: '2026-09-12', reinspectionRequired: 'YES' });
    await confirmCapabilityInvoke(OP, ctx({ setupCommand: { kind: 'INSPECTION_PLAN' }, setupForm: { scheduledDate: '2026-09-12', reinspectionRequired: 'YES' }, setupContextVersion: review.contextVersion }));
    assert.deepEqual(w.calls[2], ['plan', 'u1', 'prop-1', { scheduledAt: '2026-09-12T12:00:00.000Z', reinspectionRequired: true }]);
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
});

test('the controls are allowlisted on their answers and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  assert.equal(applicable('buyer-setup-path', 'BUYER_LOAN_ESTIMATES'), true);
  assert.equal(applicable('buyer-setup-inspection', 'BUYER_INSPECTION_REVIEW'), true);
  assert.equal(applicable('buyer-setup-title-contact', 'BUYER_TITLE_ESCROW_READINESS'), true);
  assert.equal(applicable('buyer-setup-back', OP), true);
});
