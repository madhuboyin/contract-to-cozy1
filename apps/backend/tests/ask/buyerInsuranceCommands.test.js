const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');

// Register P2 "Buyer Closing": closing insurance requirements, quotes, binding and proof (FRD v1.348). No database, browser or native module.

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
const { BuyerInsuranceService: Ins } = require('../../src/services/buyerInsurance.service.ts');
const command = require('../../src/services/ask/support/buyerInsuranceCommand.ts');
const { insuranceCommandResult } = require('../../src/services/ask/handlers/buyerInsuranceCommands.handler.ts');
const { buyerInsuranceFromView } = require('../../src/services/ask/handlers/buyerInsurance.handler.ts');

const OP = 'BUYER_INSURANCE_COMMAND';
const M = command.INSURANCE_MESSAGES;
const T = '2026-09-01T00:00:00.000Z';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const quote = (over = {}) => ({ id: 'q1', carrierName: 'Acme', status: 'REVIEWED', annualPremiumCents: 180000, deductibleCents: 100000, validUntil: null, updatedAt: T, ...over });
const requirement = (over = {}) => ({ id: 'r1', title: 'Roof letter', status: 'OPEN', blocking: true, dueAt: null, updatedAt: T, ...over });
const ws = (over = {}) => ({ updatedAt: T, selectedQuoteId: null, boundPolicyId: null, lenderProofStatus: 'PENDING', closingProofStatus: 'PENDING', requiredEffectiveAt: null, quotes: [quote()], requirements: [requirement()], ...over });
const version = (w) => sha(`buyer-insurance:${w?.updatedAt ?? 'none'}:${w?.selectedQuoteId ?? ''}:${w?.boundPolicyId ?? ''}:${w?.lenderProofStatus ?? ''}:${w?.closingProofStatus ?? ''}:`
  + `${(w?.quotes ?? []).map((q) => `${q.id}:${q.status}:${q.updatedAt}`).join('|')}:${(w?.requirements ?? []).map((r) => `${r.id}:${r.status}:${r.updatedAt}`).join('|')}`);

function install(role, workspace = ws()) {
  const saved = { a: propertyAccess.resolvePropertyAccess, g: Ins.get, r: Ins.createRequirement, ur: Ins.updateRequirement, q: Ins.createQuote, s: Ins.selectQuote, b: Ins.bind, u: Ins.update, e: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'prop-1' });
  Ins.get = async () => ({ workspace, contact: null, policy: null, documents: [] });
  Ins.createRequirement = async (...a) => { calls.push(['createRequirement', ...a]); return {}; };
  Ins.updateRequirement = async (...a) => { calls.push(['updateRequirement', ...a]); return {}; };
  Ins.createQuote = async (...a) => { calls.push(['createQuote', ...a]); return {}; };
  Ins.selectQuote = async (...a) => { calls.push(['selectQuote', ...a]); return {}; };
  Ins.bind = async (...a) => { calls.push(['bind', ...a]); return {}; };
  Ins.update = async (...a) => { calls.push(['update', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; Ins.get = saved.g; Ins.createRequirement = saved.r; Ins.updateRequirement = saved.ur; Ins.createQuote = saved.q; Ins.selectQuote = saved.s; Ins.bind = saved.b; Ins.update = saved.u; executeOperation.reconcileAskExecutionSideEffects = saved.e; } };
}
const launch = (over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', ...over });
const invoke = (kind, launchContext) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'prop-1', message: M[kind], launchContext });
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const run = (kind, entityId, answer) => insuranceCommandResult('u1', 'prop-1', { kind, entityId, sourceExecutionId: null }, answer);

test('routing: the read is typed; the command is declared-action only; contributor floor; viewers refused', async () => {
  assert.equal(resolveAskRoutingCascade('Show my insurance quotes for closing', { localRoutingEnabled: true }).operation?.operationId, 'BUYER_INSURANCE_READINESS');
  for (const kind of Object.keys(M)) assert.notEqual(resolveAskRoutingCascade(M[kind], { localRoutingEnabled: true }).operation?.operationId, OP, kind);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  let w = install('VIEWER');
  try { assert.equal((await invoke('QUOTE_ADD', launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR');
  try {
    assert.equal((await invoke('QUOTE_ADD', launch({ surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_INSURANCE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('QUOTE_SELECT', launch())).reasonCode, 'ASK_BUYER_INSURANCE_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('QUOTE_ADD', launch())).status, 'NEEDS_CONTEXT');
  } finally { w.restore(); }
});

test('the answer offers controls to contributors only, bind only when the service would accept, and says Ask buys and binds nothing', () => {
  const chosen = ws({ selectedQuoteId: 'q1', quotes: [quote({ status: 'SELECTED' })] });
  const out = (w, canChange) => buyerInsuranceFromView({ workspace: w, policy: null }, canChange, new Date('2026-09-15T00:00:00Z'));
  assert.deepEqual(out(chosen, true).blocks[0].actions.map((a) => a.id), ['buyer-insurance-requirement-add', 'buyer-insurance-quote-add', 'buyer-insurance-proof', 'buyer-insurance-bind']);
  assert.deepEqual(out(ws(), true).blocks[0].actions.map((a) => a.id), ['buyer-insurance-requirement-add', 'buyer-insurance-quote-add', 'buyer-insurance-proof']);
  assert.deepEqual(out(chosen, false).blocks[0].actions, []);
  assert.deepEqual(out(ws(), true).blocks.find((b) => b.id === 'buyer-insurance-quotes').sections[0].items[0].actions.map((a) => a.id), ['buyer-insurance-quote-select']);
  assert.deepEqual(out(chosen, true).blocks.find((b) => b.id === 'buyer-insurance-quotes').sections[0].items[0].actions, []);
  assert.deepEqual(out(ws(), true).blocks.find((b) => b.id === 'buyer-insurance-requirements').sections[0].items[0].actions.map((a) => a.id), ['buyer-insurance-requirement-update']);
  const noPremium = ws({ selectedQuoteId: 'q1', quotes: [quote({ status: 'SELECTED', annualPremiumCents: null })] });
  assert.ok(!out(noPremium, true).blocks[0].actions.some((a) => a.id === 'buyer-insurance-bind'));
  assert.match(out(ws(), true).blocks.at(-1).body, /does not buy, bind or cancel coverage/);
  assert.equal(out(null, true).reasonCode, 'BUYER_INSURANCE_NOT_RECORDED');
});

test('binding is checked like the service: chosen quote, premium, not expired, dates in order; the review says Ask bound nothing', async () => {
  const chosen = ws({ selectedQuoteId: 'q1', quotes: [quote({ status: 'SELECTED' })] });
  let w = install('CONTRIBUTOR', ws());
  try { assert.equal((await run('BIND', null)).reasonCode, 'BUYER_INSURANCE_BIND_NOT_READY'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', chosen);
  try {
    assert.equal((await run('BIND', null)).status, 'NEEDS_CONTEXT');
    assert.equal((await run('BIND', null, { policyNumber: 'P-1', effectiveDate: '2026-11-01', expiresDate: '2026-10-01' })).reasonCode, 'BUYER_INSURANCE_INPUT_INVALID');
    const review = await run('BIND', null, { policyNumber: 'P-1', effectiveDate: '2026-11-01', expiresDate: '2027-11-01' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /Ask did not buy or bind it, and cannot cancel it/);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
  assert.match(command.bindBlocker({ selectedQuoteId: 'q1', boundPolicyId: null }, { id: 'q1', status: 'SELECTED', annualPremiumCents: 1, validUntil: '2026-01-01T00:00:00.000Z' }, new Date('2026-09-01')), /expired/);
  assert.match(command.bindBlocker({ selectedQuoteId: 'q1', boundPolicyId: 'pol' }, null, new Date()), /already recorded/);
});

test('confirming calls the service methods the routes call, with cents converted; stale, settled or unbindable writes nothing', async () => {
  const chosen = ws({ selectedQuoteId: 'q1', quotes: [quote({ status: 'SELECTED' })] });
  const w = install('CONTRIBUTOR', chosen);
  try {
    const v = version(chosen);
    const p = (kind, entityId, form, cv = v) => ({ insuranceCommand: { kind, entityId }, insuranceForm: form, insuranceContextVersion: cv });
    await confirmCapabilityInvoke(OP, ctx(p('QUOTE_ADD', null, { carrierName: 'Zed', annualPremium: 1800.5, deductible: 1000, validUntilDate: '2026-12-01' })));
    assert.deepEqual(w.calls[0], ['createQuote', 'u1', 'prop-1', { carrierName: 'Zed', annualPremiumCents: 180050, deductibleCents: 100000, validUntil: '2026-12-01T12:00:00.000Z' }]);
    await confirmCapabilityInvoke(OP, ctx(p('REQUIREMENT_ADD', null, { category: 'ROOF', title: 'Roof letter', blocking: 'YES' })));
    assert.deepEqual(w.calls[1][3], { category: 'ROOF', title: 'Roof letter', blocking: true });
    await confirmCapabilityInvoke(OP, ctx(p('REQUIREMENT_UPDATE', 'r1', { status: 'SUBMITTED' })));
    assert.deepEqual(w.calls[2], ['updateRequirement', 'u1', 'prop-1', 'r1', { status: 'SUBMITTED' }]);
    await confirmCapabilityInvoke(OP, ctx(p('BIND', null, { policyNumber: 'P-1', effectiveDate: '2026-11-01', expiresDate: '2027-11-01' })));
    assert.deepEqual(w.calls[3], ['bind', 'u1', 'prop-1', { quoteId: 'q1', policyNumber: 'P-1', effectiveAt: '2026-11-01T12:00:00.000Z', expiresAt: '2027-11-01T12:00:00.000Z' }]);
    await confirmCapabilityInvoke(OP, ctx(p('PROOF', null, { lenderProofStatus: 'DELIVERED' })));
    assert.deepEqual(w.calls[4], ['update', 'u1', 'prop-1', { lenderProofStatus: 'DELIVERED' }]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('PROOF', null, { lenderProofStatus: 'DELIVERED' }, 'old'))), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(p('PROOF', null, {}))), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.calls.length, 5);
  } finally { w.restore(); }
  const open = ws();
  const w2 = install('CONTRIBUTOR', open);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ insuranceCommand: { kind: 'BIND', entityId: null }, insuranceForm: { policyNumber: 'P', effectiveDate: '2026-11-01', expiresDate: '2027-11-01' }, insuranceContextVersion: version(open) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await confirmCapabilityInvoke(OP, ctx({ insuranceCommand: { kind: 'QUOTE_SELECT', entityId: 'q1' }, insuranceContextVersion: version(open) }));
    assert.deepEqual(w2.calls, [['selectQuote', 'u1', 'prop-1', 'q1']]);
  } finally { w2.restore(); }
});

test('the action ids are allowlisted on the insurance answer and the back action on the command', () => {
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'QUIET' }, operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of Object.values(command.INSURANCE_ACTION_IDS)) assert.equal(applicable(id, 'BUYER_INSURANCE_READINESS'), true, id);
  assert.equal(applicable('buyer-insurance-back', OP), true);
});
