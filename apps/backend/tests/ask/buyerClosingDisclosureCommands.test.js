const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": Closing Disclosure draft, edit, per-figure confirmation and funds readiness (FRD v1.351). Wire-fraud sensitive. No database, browser or native module.

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
const { BuyerClosingDisclosureService: CD } = require('../../src/services/buyerClosingDisclosure.service.ts');
const command = require('../../src/services/ask/support/buyerClosingDisclosureCommand.ts');
const { cdCommandResult } = require('../../src/services/ask/handlers/buyerClosingDisclosureCommands.handler.ts');

const OP = 'BUYER_CLOSING_DISCLOSURE_COMMAND';
const M = command.CD_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const rev = (over = {}) => ({
  id: 'rev1', status: 'CONFIRMED', revisionNumber: 1, updatedAt: T, issuedDate: '2026-10-01', loanAmountCents: 30000000, noteRateBps: 688, aprBps: 701,
  estimatedTotalMonthlyPaymentCents: 250000, loanCostsCents: 500000, lenderCreditsCents: 0, prepaidAndEscrowCents: 400000, sellerCreditsCents: 100000, cashToCloseCents: 4500000,
  cashToCloseDirection: 'FROM_BORROWER', changeExplanation: null, ...over,
});
const funds = (over = {}) => ({ id: 'w1', updatedAt: T, fundsMethod: 'UNKNOWN', fundsExpectedAt: null, fundsReady: false, instructionsVerified: false, verificationChannel: 'UNKNOWN', questions: [], questionsResolved: false, ...over });
const snapshot = (revisions, over = {}) => ({ workspace: revisions === null ? null : { ...funds(over), revisions }, selected: { cashToCloseCents: 4100000, loanAmountCents: 30000000 } });
const version = (s) => {
  const w = s.workspace;
  return sha(`buyer-cd:${w ? `${w.updatedAt}|${w.fundsMethod}|${w.fundsExpectedAt ?? ''}|${w.fundsReady}|${w.instructionsVerified}|${w.verificationChannel}|${w.questionsResolved}|${w.questions.length}|${w.revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join(',')}` : 'none'}`);
};

function install(role, snap) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: CD.get, c: CD.createRevision, u: CD.updateDraft, f: CD.confirm, w: CD.updateFundsReadiness, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  CD.get = async () => {
    if (snap === 'NO_LE') throw Object.assign(new Error('x'), { code: 'CLOSING_DISCLOSURE_REQUIRES_SELECTED_LOAN_ESTIMATE', statusCode: 409 });
    return { workspace: snap.workspace, selectedLoanEstimate: snap.selected };
  };
  CD.createRevision = async (...a) => { calls.push(['create', ...a]); return {}; };
  CD.updateDraft = async (...a) => { calls.push(['update', ...a]); return {}; };
  CD.confirm = async (...a) => { calls.push(['confirm', ...a]); return {}; };
  CD.updateFundsReadiness = async (...a) => { calls.push(['funds', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; CD.get = saved.g; CD.createRevision = saved.c; CD.updateDraft = saved.u; CD.confirm = saved.f; CD.updateFundsReadiness = saved.w; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, answer) => cdCommandResult('u1', 'prop-1', { kind, sourceExecutionId: null }, answer);
const draft = (over = {}) => rev({ id: 'd1', status: 'DRAFT', revisionNumber: 2, ...over });
const ALL = command.CD_FIELD_KEYS;

test('declared-action only; contributor floor; viewers refused; no selected Loan Estimate and no draft are explained', async () => {
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER', snapshot([rev()]));
  try { assert.equal((await invoke('DRAFT_START', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([rev()]));
  try {
    assert.equal((await invoke('DRAFT_START', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_CD_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('DRAFT_START', launch())).status, 'NEEDS_CONFIRMATION');
    assert.equal((await invoke('DRAFT_EDIT', launch())).reasonCode, 'BUYER_CD_NO_DRAFT');
    assert.equal((await invoke('CONFIRM', launch())).reasonCode, 'BUYER_CD_NO_DRAFT');
  } finally { w.restore(); }
  w = install('CONTRIBUTOR', 'NO_LE');
  try { assert.equal((await invoke('DRAFT_START', launch())).reasonCode, 'BUYER_CD_REQUIRES_LOAN_ESTIMATE'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([rev(), draft()]));
  try { assert.equal((await invoke('DRAFT_START', launch())).reasonCode, 'BUYER_CD_DRAFT_EXISTS'); } finally { w.restore(); }
});

test('funds readiness requires a draft first; instructions cannot be marked verified without a named trusted channel; bank details are refused', async () => {
  let w = install('CONTRIBUTOR', snapshot(null));
  try { assert.equal((await invoke('FUNDS_UPDATE', launch())).reasonCode, 'BUYER_CD_DRAFT_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', snapshot([draft()]));
  try {
    const form = await invoke('FUNDS_UPDATE', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.match(form.blocks[0].body, /never tells anyone to close and never asks you to trust emailed wire instructions/);
    assert.equal((await run('FUNDS_UPDATE', { instructionsVerified: 'YES' })).reasonCode, 'BUYER_CD_FUNDS_UNSAFE');
    assert.equal((await run('FUNDS_UPDATE', { newQuestion: 'Account 123456789012 at the bank' })).reasonCode, 'BUYER_CD_INPUT_INVALID');
    const review = await run('FUNDS_UPDATE', { instructionsVerified: 'YES', verificationChannel: 'KNOWN_PHONE' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /never tells anyone to close and never asks you to trust emailed wire instructions/);
    assert.match(review.confirmation.description, /Do not enter account or routing numbers/);
    assert.ok(review.blocks.some((b) => b.type === 'BOUNDARY'));
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('the edit review shows before and after; confirmation is per figure with no blanket confirm and compares the Loan Estimate', async () => {
  const p = command.parseCdAnswer;
  assert.equal(p('DRAFT_EDIT', {}).success, false);
  assert.equal(p('DRAFT_EDIT', { cashToClose: 4700 }).success, true);
  assert.equal(p('CONFIRM', { fields: ALL.slice(1) }).success, false);
  assert.equal(p('CONFIRM', { fields: [] }).success, false);
  assert.equal(p('CONFIRM', { fields: [...ALL, 'NOPE'] }).success, false);
  assert.equal(p('CONFIRM', { fields: ALL }).success, true);
  const w = install('CONTRIBUTOR', snapshot([rev(), draft()]));
  try {
    const edit = await run('DRAFT_EDIT', { cashToClose: 4700, noteRate: 6.5 });
    assert.equal(edit.status, 'NEEDS_CONFIRMATION');
    assert.match(edit.confirmation.fields.find((f) => f.label === 'Cash to close').value, /\$45,000 → \$4,700/);
    assert.match(edit.confirmation.description, /changes the draft only/);
    const form = await invoke('CONFIRM', launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.length, 10);
    assert.deepEqual(form.captureRequests[0].currentAnswer, { fields: [] });
    assert.equal((await run('CONFIRM', { fields: ALL.slice(1) })).reasonCode, 'BUYER_CD_INPUT_INVALID');
    const review = await run('CONFIRM', { fields: ALL });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.fields.find((f) => f.label === 'Cash to close').value, /\+\$4,000 vs your selected Loan Estimate/);
    assert.match(review.confirmation.description, /never asks you to trust emailed wire instructions/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  const incomplete = install('CONTRIBUTOR', snapshot([draft({ aprBps: null })]));
  try { assert.equal((await invoke('CONFIRM', launch())).reasonCode, 'BUYER_CD_INCOMPLETE'); } finally { incomplete.restore(); }
});

test('confirming calls the service the routes call; a changed workspace, unsafe funds or a missing draft writes nothing', async () => {
  const snap = snapshot([rev(), draft()]);
  const w = install('CONTRIBUTOR', snap);
  try {
    const v = version(snap);
    const p = (kind, form, cv = v) => ({ cdCommand: { kind }, cdForm: form, cdContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('DRAFT_EDIT', { cashToClose: 4700, noteRate: 6.5, issuedDate: '2026-10-05' })));
    assert.deepEqual(w.calls[0], ['update', 'u1', 'prop-1', 'd1', { issuedDate: '2026-10-05', noteRateBps: 650, cashToCloseCents: 470000 }]);
    await confirmCapabilityInvoke(OP, ctx(p('CONFIRM', { fields: ALL })));
    assert.deepEqual(w.calls[1], ['confirm', 'u1', 'prop-1', 'd1']);
    await confirmCapabilityInvoke(OP, ctx(p('FUNDS_UPDATE', { fundsMethod: 'WIRE', fundsReady: 'YES', verificationChannel: 'KNOWN_PHONE', instructionsVerified: 'YES', newQuestion: 'Who confirms the amount?' })));
    assert.deepEqual(w.calls[2], ['funds', 'u1', 'prop-1', { fundsMethod: 'WIRE', fundsReady: true, verificationChannel: 'KNOWN_PHONE', instructionsVerified: true, questions: ['Who confirms the amount?'] }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('CONFIRM', { fields: ALL.slice(1) }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('FUNDS_UPDATE', { instructionsVerified: 'YES' }))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('CONFIRM', { fields: ALL }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.equal(w.calls.length, 3);
  } finally { w.restore(); }
  const only = snapshot([rev()]);
  const w2 = install('CONTRIBUTOR', only);
  try {
    await confirmCapabilityInvoke(OP, ctx({ cdCommand: { kind: 'DRAFT_START' }, cdContextVersion: version(only) }));
    assert.equal(w2.calls[0][0], 'create');
    assert.equal(w2.calls[0][3].loanAmountCents, 30000000);
    assert.equal(w2.calls[0][3].issuedDate, undefined);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ cdCommand: { kind: 'DRAFT_EDIT' }, cdForm: { cashToClose: 1 }, cdContextVersion: version(only) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { w2.restore(); }
});

test('the action ids are allowlisted on the disclosure answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.CD_ACTION_IDS)) assert.equal(applicable(id, 'BUYER_DISCLOSURE_FUNDS_READINESS'), true, id);
  assert.equal(applicable('buyer-cd-back', OP), true);
});
