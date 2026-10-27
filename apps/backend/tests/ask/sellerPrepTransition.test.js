const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Seller Prep": the ownership transition and buyer-package hand-off on a closed sale (FRD v1.444). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const briefService = require('../../src/propertyBrief/propertyBrief.service.ts');
const command = require('../../src/services/ask/support/sellerPrepCaseCommand.ts');
const { saleCaseCommandResult } = require('../../src/services/ask/handlers/sellerPrepCaseCommands.handler.ts');

const OP = 'SELLER_PREP_CASE_COMMAND';
const T = new Date('2026-09-01T00:00:00Z');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const closedCase = (over = {}) => ({ id: 'case-1', status: 'CLOSED', updatedAt: T, ...over });
const transition = (over = {}) => ({ id: 't1', sellerRetentionDecision: null, sellerRetentionNotes: null, buyerPackageId: null, acceptedAt: null, completedAt: null, updatedAt: T, ...over });
const share = (id, purpose, over = {}) => ({ id, status: 'ACTIVE', recipientName: null, acceptedAt: null, ...over, purpose });
const brief = (title, shares) => ({ id: `b-${title}`, title, purpose: shares[0]?.purpose ?? 'PROSPECTIVE_BUYER', shares: shares.map(({ purpose, ...s }) => s) });
const versionOf = (kind, saleCase, t, buyer, revocable) => sha(['sale-transition', kind, saleCase?.id ?? 'prop-1', saleCase?.status ?? 'none',
  t ? `${t.id}:${t.updatedAt.toISOString()}:${t.completedAt?.toISOString() ?? ''}` : 'no-transition',
  buyer.map(([id, acc]) => `${id}=${acc ? 1 : 0}`).sort().join(','), revocable.slice().sort().join(',')].join(':'));

function install(role, { saleCase = closedCase(), t = null, briefs = [] } = {}) {
  const S = PropertySaleCaseService;
  const saved = { a: propertyAccess.resolvePropertyAccess, g: S.getCase, r: S.recordTransition, u: S.updateTransition, c: S.completeTransition, l: briefService.listPropertyBriefs, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  let completeResult = { transition: {}, revokeResults: [] };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  S.getCase = async () => ({ propertyId: 'prop-1', saleCase, canCreate: false, readinessItems: [], transitions: t ? [t] : [] });
  S.recordTransition = async (...a) => { calls.push(['start', ...a]); return {}; };
  S.updateTransition = async (...a) => { calls.push(['update', ...a]); return {}; };
  S.completeTransition = async (...a) => { calls.push(['complete', ...a]); return completeResult; };
  briefService.listPropertyBriefs = async () => briefs;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return {
    calls, setCompleteResult(r) { completeResult = r; },
    restore() { propertyAccess.resolvePropertyAccess = saved.a; S.getCase = saved.g; S.recordTransition = saved.r; S.updateTransition = saved.u; S.completeTransition = saved.c; briefService.listPropertyBriefs = saved.l; executeOperation.reconcileAskExecutionSideEffects = saved.e; },
  };
}
const launch = (kind) => ({ operationId: OP, surface: 'ASK_PAGE', entityId: 'prop-1', entityType: command.SALE_CASE_ENTITY_TYPE, _kind: kind });
const invoke = (kind) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: command.SALE_CASE_MESSAGES[kind], launchContext: launch(kind) });
const review = (kind, answer) => saleCaseCommandResult('u1', 'prop-1', { kind, sourceExecutionId: null }, answer);
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const buyerBriefs = [brief('Buyer pack', [share('s-buy', 'PROSPECTIVE_BUYER', { recipientName: 'Pat', acceptedAt: new Date('2026-10-01T00:00:00Z') }), share('s-wait', 'PROSPECTIVE_BUYER')])];
const otherBriefs = [brief('Agent view', [share('s-agent', 'REAL_ESTATE_AGENT')])];

test('start: a closed sale with no transition; contributor only; reviewed first and writes only on confirm', async () => {
  let w = install('VIEWER');
  try { assert.equal((await invoke('TRANSITION_START')).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { saleCase: closedCase({ status: 'LISTED' }) });
  try { assert.equal((await invoke('TRANSITION_START')).reasonCode, 'SELLER_PREP_TRANSITION_CASE_NOT_CLOSED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { t: transition() });
  try { assert.equal((await invoke('TRANSITION_START')).reasonCode, 'SELLER_PREP_TRANSITION_EXISTS'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    const out = await invoke('TRANSITION_START');
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.match(out.confirmation.description, /sends nothing and contacts no one/);
    assert.equal(w.calls.length, 0);
    const v = versionOf('TRANSITION_START', closedCase(), null, [], []);
    assert.equal(out.contextVersion, v);
    await confirmCapabilityInvoke(OP, ctx({ saleCaseCommand: { kind: 'TRANSITION_START', entityId: 'prop-1' }, saleCaseContextVersion: v }));
    assert.deepEqual(w.calls[0], ['start', 'u1', 'prop-1', {}]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ saleCaseCommand: { kind: 'TRANSITION_START', entityId: 'prop-1' }, saleCaseContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 1);
  } finally { w.restore(); }
});

test('hand-off form: seeded, lists only active buyer packages with their acceptance, reviews the exact change and keeps the unchanged', async () => {
  const t = transition({ sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY', buyerPackageId: 's-wait' });
  const w = install('CONTRIBUTOR', { t, briefs: [...buyerBriefs, ...otherBriefs] });
  try {
    const form = await invoke('TRANSITION');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    const [pkg] = form.captureRequests[0].inputSchema.fields;
    assert.deepEqual(pkg.inputSchema.options.map((o) => o.value), ['NONE', 's-buy', 's-wait'], 'the agent share is not a buyer package');
    assert.match(pkg.inputSchema.options.find((o) => o.value === 's-buy').label, /accepted\)/);
    assert.match(pkg.inputSchema.options.find((o) => o.value === 's-wait').label, /not yet accepted/);
    assert.equal(form.captureRequests[0].currentAnswer.buyerPackageId, 's-wait');
    const v = versionOf('TRANSITION', closedCase(), t, [['s-buy', true], ['s-wait', false]], ['s-agent']);
    assert.equal(form.contextVersion, v);
    const out = await review('TRANSITION', { buyerPackageId: 's-buy', sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY' });
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.deepEqual(out.confirmation.fields.map((f) => f.label), ['Buyer package'], 'the unchanged decision is not listed');
    assert.match(out.confirmation.description, /does not send the package or contact the buyer/);
    assert.equal((await review('TRANSITION', { buyerPackageId: 's-wait' })).reasonCode, 'SELLER_PREP_TRANSITION_UNCHANGED');
    assert.equal((await review('TRANSITION', { buyerPackageId: 's-agent' })).reasonCode, 'SELLER_PREP_BUYER_PACKAGE_NOT_AVAILABLE');
    assert.equal(w.calls.length, 0);
    await confirmCapabilityInvoke(OP, ctx({ saleCaseCommand: { kind: 'TRANSITION', entityId: 'prop-1' }, saleCaseForm: { buyerPackageId: 'NONE', sellerRetentionDecision: 'SHARE_SELECTED_HISTORY', sellerRetentionNotes: 'Keep the receipts' }, saleCaseContextVersion: v }));
    assert.deepEqual(w.calls[0], ['update', 'u1', 'prop-1', 't1', { buyerPackageId: null, sellerRetentionDecision: 'SHARE_SELECTED_HISTORY', sellerRetentionNotes: 'Keep the receipts' }]);
  } finally { w.restore(); }
});

test('complete: needs a retention decision and, if a package is linked, its recipient to have opened it; a review names what stops; the write passes only listed shares', async () => {
  let w = install('CONTRIBUTOR', { t: transition() });
  try { assert.equal((await invoke('COMPLETE')).reasonCode, 'SELLER_PREP_TRANSITION_RETENTION_MISSING'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { t: transition({ sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY', buyerPackageId: 's-wait' }), briefs: buyerBriefs });
  try { assert.equal((await invoke('COMPLETE')).reasonCode, 'SELLER_PREP_TRANSITION_PACKAGE_NOT_ACCEPTED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', { t: transition({ sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY', buyerPackageId: 's-gone' }), briefs: buyerBriefs });
  try { assert.equal((await invoke('COMPLETE')).reasonCode, 'SELLER_PREP_TRANSITION_PACKAGE_UNAVAILABLE'); } finally { w.restore(); }
  const t = transition({ sellerRetentionDecision: 'SHARE_SELECTED_HISTORY', buyerPackageId: 's-buy' });
  w = install('CONTRIBUTOR', { t, briefs: [...buyerBriefs, ...otherBriefs] });
  try {
    const form = await invoke('COMPLETE');
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['s-agent']);
    const out = await review('COMPLETE', { revokeShareIds: ['s-agent'] });
    const by = Object.fromEntries(out.confirmation.fields.map((f) => [f.label, f.value]));
    assert.match(by['Buyer package'], /Buyer pack — Pat, accepted/);
    assert.match(by['Shares to stop'], /Agent view/);
    assert.match(out.confirmation.description, /cannot be edited/);
    assert.match(out.confirmation.description, /stops working at once/);
    assert.equal((await review('COMPLETE', { revokeShareIds: ['s-buy'] })).reasonCode, 'SELLER_PREP_SHARE_NOT_AVAILABLE', 'only the non-buyer shares can be stopped');
    assert.equal(w.calls.length, 0);
    const v = versionOf('COMPLETE', closedCase(), t, [['s-buy', true], ['s-wait', false]], ['s-agent']);
    const params = { saleCaseCommand: { kind: 'COMPLETE', entityId: 'prop-1' }, saleCaseForm: { revokeShareIds: ['s-agent'] }, saleCaseContextVersion: v };
    w.setCompleteResult({ transition: {}, revokeResults: [{ shareId: 's-agent', revoked: false, error: 'x' }] });
    const done = await confirmCapabilityInvoke(OP, ctx(params));
    assert.deepEqual(w.calls[0], ['complete', 'u1', 'prop-1', 't1', { revokeShareIds: ['s-agent'] }]);
    assert.match(done.result.blocks[0].title, /some shares were not stopped/);
    assert.ok(done.result.blocks.some((b) => b.id === 'seller-prep-transition-revoke-failed'), 'a failed stop is reported, not hidden');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...params, saleCaseForm: { revokeShareIds: ['s-nope'] } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { w.restore(); }
  // No other active shares: nothing to ask, straight to the review.
  w = install('CONTRIBUTOR', { t: transition({ sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY' }) });
  try {
    const out = await invoke('COMPLETE');
    assert.equal(out.status, 'NEEDS_CONFIRMATION');
    assert.equal(out.confirmation.fields.find((f) => f.label === 'Shares to stop').value, 'None');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', { t: transition({ completedAt: T }) });
  try { assert.equal((await invoke('COMPLETE')).reasonCode, 'SELLER_PREP_TRANSITION_COMPLETE'); } finally { w.restore(); }
});

test('the checklist answer shows the transition on a closed sale to everyone and its next step to contributors; the ids are allowlisted', async () => {
  const blockFor = async (role, t) => {
    const w = install(role, { t });
    PropertySaleCaseService.getNotableUpgradeCandidates = async () => ({ candidates: [] });
    try {
      const out = await capabilityInvoke('SELLER_PREP_CHECKLIST', { userId: 'u1', propertyId: 'prop-1', message: 'Show my seller prep checklist' });
      return out.blocks.find((b) => b.id === 'seller-prep-transition');
    } finally { w.restore(); }
  };
  assert.deepEqual((await blockFor('CONTRIBUTOR', null)).actions.map((a) => a.id), ['seller-prep-transition-start']);
  assert.deepEqual((await blockFor('CONTRIBUTOR', transition())).actions.map((a) => a.id), ['seller-prep-transition-details']);
  const ready = await blockFor('CONTRIBUTOR', transition({ sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY' }));
  assert.deepEqual(ready.actions.map((a) => a.id), ['seller-prep-transition-details', 'seller-prep-transition-complete']);
  assert.deepEqual((await blockFor('VIEWER', transition())).actions, []);
  assert.deepEqual((await blockFor('CONTRIBUTOR', transition({ completedAt: T }))).actions, []);
  for (const a of ready.actions) assert.equal(isAskActionApplicable({ action: a, operationId: 'SELLER_PREP_CHECKLIST', propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true }), true);
});
