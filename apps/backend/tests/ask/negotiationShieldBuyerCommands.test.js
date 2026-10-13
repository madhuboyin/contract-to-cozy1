const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Negotiation Shield", buyer mode: start negotiating an inspection finding and record the seller's response and outcome (FRD v1.312).
// No database, browser or native module: `sharp` is stubbed and collaborators are fakes.

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
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const buyer = require('../../src/services/ask/support/negotiationShieldBuyer.ts');
const handler = require('../../src/services/ask/handlers/negotiationShieldBuyerCommands.handler.ts');

const OP = 'NEGOTIATION_SHIELD_BUYER_COMMAND';
const M = buyer.BUYER_NEGOTIATION_MESSAGES;
const FINDING = {
  id: 'f-1', homeSystem: 'ROOF', inspectorDescription: 'Missing shingles on the north slope', severity: 'MAJOR', status: 'OPEN', buyerDisposition: 'PRE_CLOSE_NEGOTIATION',
  buyerTaskId: 'task-1', updatedAt: new Date('2026-10-01T00:00:00Z'), report: { status: 'CONFIRMED' }, negotiationCaseLinks: [],
};
const LINK = { id: 'l-1', caseId: 'case-1', requestType: 'REPAIR_OR_CREDIT', requestedCreditCents: 150000, sellerResponse: 'PENDING', sellerResponseNotes: null, outcome: 'PENDING', agreedCreditCents: null, outcomeNotes: null, updatedAt: new Date('2026-10-02T00:00:00Z') };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withFinding(finding) {
  const saved = prisma.inspectionFinding;
  prisma.inspectionFinding = { findFirst: async (args) => (finding && args.where.id === finding.id && args.where.propertyId === 'prop-1' ? finding : null) };
  return () => { prisma.inspectionFinding = saved; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launch = (entityId = 'f-1', over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: buyer.BUYER_FINDING_ENTITY_TYPE, entityId, ...over });

// ───────────────────────────── input ─────────────────────────────

test('a request needs a type; credit is dollars converted to cents; an accepted credit needs the agreed amount', () => {
  assert.equal(buyer.parseBuyerNegotiationAnswer('START', {}).success, false);
  assert.deepEqual(buyer.parseBuyerNegotiationAnswer('START', { requestType: 'CREDIT', requestedCredit: '1500.50', notes: '' }).data,
    { requestType: 'CREDIT', requestedCreditCents: 150050, notes: null });
  assert.equal(buyer.parseBuyerNegotiationAnswer('START', { requestType: 'CREDIT', extra: 1 }).success, false);
  assert.deepEqual(buyer.parseBuyerNegotiationAnswer('OUTCOME', { sellerResponse: 'ACCEPTED', outcome: 'ACCEPTED_CREDIT' }), { success: false, reason: 'CREDIT_REQUIRED' });
  const ok = buyer.parseBuyerNegotiationAnswer('OUTCOME', { sellerResponse: 'ACCEPTED', outcome: 'ACCEPTED_CREDIT', agreedCredit: 1200 });
  assert.deepEqual([ok.data.outcome, ok.data.agreedCreditCents], ['ACCEPTED_CREDIT', 120000]);
  assert.equal(buyer.parseBuyerNegotiationAnswer('OUTCOME', { sellerResponse: 'MAYBE', outcome: 'PENDING' }).success, false);
});

test('the review states what an outcome does beyond saving it', () => {
  assert.match(buyer.buyerOutcomeConsequence('ACCEPTED_CREDIT', true), /resolved as credited at closing and its Buyer Plan task is marked complete/);
  assert.match(buyer.buyerOutcomeConsequence('SELLER_REPAIRED', false), /resolved as repaired by the seller\./);
  assert.match(buyer.buyerOutcomeConsequence('TRANSFERRED_TO_BUYER', true), /your post-closing work and is reopened/);
  assert.equal(buyer.buyerOutcomeConsequence('REJECTED', true), null);
});

// ───────────────────────────── the command ─────────────────────────────

test('declared-action only and a registered contributor command', () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation(OP).adapterKey, 'negotiation-shield.buyer');
});

test('Start opens the form for a ready finding; a viewer, a refresh, a wrong entity, a missing or not-ready finding and an already started one are handled', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withFinding(FINDING);
  try {
    const form = await invoke(M.START, launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, buyer.BUYER_NEGOTIATION_CAPTURE_KEYS.START);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => f.key), ['requestType', 'requestedCredit', 'notes']);
    assert.equal(form.captureRequests[0].currentAnswer.requestType, 'REPAIR_OR_CREDIT');
    assert.equal((await invoke(M.START, launch('f-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_BUYER_NEGOTIATION_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START, launch('f-1', { entityType: 'INSPECTION_FINDING' }))).reasonCode, 'ASK_BUYER_NEGOTIATION_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('negotiate this', launch())).reasonCode, 'ASK_BUYER_NEGOTIATION_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START, launch('other'))).reasonCode, 'BUYER_FINDING_NOT_FOUND');
    assert.equal((await invoke(M.START, launch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restore();

    restore = withFinding({ ...FINDING, report: { status: 'DRAFT' } });
    assert.equal((await invoke(M.START, launch())).reasonCode, 'BUYER_NEGOTIATION_FINDING_NOT_READY');
    restore();
    restore = withFinding({ ...FINDING, buyerDisposition: 'POST_CLOSE_ACTION' });
    assert.equal((await invoke(M.START, launch())).reasonCode, 'BUYER_NEGOTIATION_FINDING_NOT_READY');
    restore();

    restore = withFinding({ ...FINDING, negotiationCaseLinks: [LINK] });
    const started = await invoke(M.START, launch());
    assert.equal(started.reasonCode, 'BUYER_NEGOTIATION_ALREADY_STARTED');
    assert.equal(started.blocks[0].actions[0].id, 'buyer-negotiation-outcome');
    restore();
  } finally { restore(); restoreRole(); }
});

test('a submitted request is reviewed in full and nothing is written yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restore = withFinding(FINDING);
  const original = NegotiationShieldService.prototype.startBuyerNegotiation; let called = 0;
  NegotiationShieldService.prototype.startBuyerNegotiation = async () => { called += 1; return {}; };
  try {
    const parsed = buyer.parseBuyerNegotiationAnswer('START', { requestType: 'CREDIT', requestedCredit: 1500, notes: 'Quote attached' });
    const result = await handler.buyerNegotiationResult('user-1', 'prop-1', { kind: 'START', entityId: 'f-1', sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual([fields.Finding, fields['Asking for'], fields['Credit requested']], ['roof (major)', 'Ask for a credit at closing', '$1,500']);
    assert.match(result.confirmation.description, /does not send anything to the seller/);
    assert.equal(buyer.parseBuyerNegotiationAnswer('START', result.parameters.buyerNegotiationStart).success, true, 'what is stored re-validates through the form schema');
    assert.equal(called, 0);
  } finally { NegotiationShieldService.prototype.startBuyerNegotiation = original; restore(); restoreRole(); }
});

test('Record opens the form with what is recorded and the review says what the outcome will change; a finding not yet in negotiation is sent to Start', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restore = withFinding({ ...FINDING, negotiationCaseLinks: [LINK] });
  try {
    const form = await invoke(M.OUTCOME, launch());
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].currentAnswer, { sellerResponse: 'PENDING', outcome: 'PENDING' });
    const parsed = buyer.parseBuyerNegotiationAnswer('OUTCOME', { sellerResponse: 'ACCEPTED', outcome: 'ACCEPTED_CREDIT', agreedCredit: 1200, outcomeNotes: 'In writing' });
    const review = await handler.buyerNegotiationResult('user-1', 'prop-1', { kind: 'OUTCOME', entityId: 'f-1', sourceExecutionId: null }, parsed.data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /marked resolved as credited at closing and its Buyer Plan task is marked complete/);
    assert.equal(review.blocks[0].tone, 'CAUTION');
    restore();
    restore = withFinding(FINDING);
    const notStarted = await invoke(M.OUTCOME, launch());
    assert.equal(notStarted.reasonCode, 'BUYER_NEGOTIATION_NOT_STARTED');
    assert.equal(notStarted.blocks[0].actions[0].id, 'buyer-negotiation-start');
    restore();
  } finally { restore(); restoreRole(); }
});

// ───────────────────────────── the confirmed writes ─────────────────────────────

const ctx = (parameters, role = 'CONTRIBUTOR') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const saved = { s: NegotiationShieldService.prototype.startBuyerNegotiation, o: NegotiationShieldService.prototype.recordBuyerNegotiationOutcome, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  NegotiationShieldService.prototype.startBuyerNegotiation = async (...a) => { calls.push(['start', ...a]); return { id: 'case-new' }; };
  NegotiationShieldService.prototype.recordBuyerNegotiationOutcome = async (...a) => { calls.push(['outcome', ...a]); return {}; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { NegotiationShieldService.prototype.startBuyerNegotiation = saved.s; NegotiationShieldService.prototype.recordBuyerNegotiationOutcome = saved.o; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const version = (finding) => handler.buyerNegotiationContextVersion(finding);

test('confirming a start calls the canonical start with the finding, request and credit in cents, and offers the seller response', async () => {
  const restore = withFinding(FINDING); const w = installWrites();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({
      buyerNegotiationStart: { requestType: 'CREDIT', requestedCredit: 1500, notes: 'Quote attached' },
      buyerNegotiationCommand: { kind: 'START', entityId: 'f-1' }, buyerNegotiationContextVersion: version(FINDING),
    }));
    assert.deepEqual(w.calls[0], ['start', 'prop-1', 'user-1', { findingId: 'f-1', requestType: 'CREDIT', requestedCreditCents: 150000, notes: 'Quote attached' }]);
    assert.equal(out.result.blocks[0].actions[0].id, 'buyer-negotiation-outcome');
    assert.match(out.result.blocks[0].description, /Nothing was sent to the seller/);
  } finally { w.restore(); restore(); }
});

test('confirming an outcome calls the canonical record with the caller role and the case the finding is linked to', async () => {
  const finding = { ...FINDING, negotiationCaseLinks: [LINK] }; const restore = withFinding(finding); const w = installWrites();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({
      buyerNegotiationOutcome: { sellerResponse: 'ACCEPTED', sellerResponseNotes: null, outcome: 'ACCEPTED_CREDIT', agreedCredit: 1200, outcomeNotes: null },
      buyerNegotiationCommand: { kind: 'OUTCOME', entityId: 'f-1' }, buyerNegotiationContextVersion: version(finding),
    }, 'OWNER'));
    assert.deepEqual(w.calls[0], ['outcome', 'prop-1', 'case-1', 'user-1', { findingId: 'f-1', sellerResponse: 'ACCEPTED', sellerResponseNotes: null, outcome: 'ACCEPTED_CREDIT', agreedCreditCents: 120000, outcomeNotes: null }, 'OWNER']);
    assert.match(out.result.blocks[0].description, /resolved as credited at closing/);
  } finally { w.restore(); restore(); }
});

test('a confirmation is refused, with nothing written, when the finding changed, vanished, was tampered with or is no longer ready', async () => {
  const w = installWrites();
  try {
    let restore = withFinding(FINDING);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationStart: { requestType: 'CREDIT', requestedCredit: 1, notes: null }, buyerNegotiationCommand: { kind: 'START', entityId: 'f-1' }, buyerNegotiationContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationStart: { requestType: 'DELETE' }, buyerNegotiationCommand: { kind: 'START', entityId: 'f-1' }, buyerNegotiationContextVersion: version(FINDING) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationCommand: { kind: 'WIPE', entityId: 'f-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationOutcome: { sellerResponse: 'ACCEPTED', outcome: 'ACCEPTED_CREDIT' }, buyerNegotiationCommand: { kind: 'OUTCOME', entityId: 'f-1' }, buyerNegotiationContextVersion: version(FINDING) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE', 'an outcome on a finding that is not in negotiation');
    restore();
    const dismissed = { ...FINDING, status: 'DISMISSED' }; restore = withFinding(dismissed);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationStart: { requestType: 'CREDIT', requestedCredit: 1, notes: null }, buyerNegotiationCommand: { kind: 'START', entityId: 'f-1' }, buyerNegotiationContextVersion: version(dismissed) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restore();
    restore = withFinding(null);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ buyerNegotiationCommand: { kind: 'START', entityId: 'f-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restore();
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

// ───────────────────────────── the readiness answer's rows ─────────────────────────────

test('the negotiation list rows carry Start or Record for a contributor (and nothing for a viewer), and the ids are allowlisted', () => {
  // The readiness read loads the Buyer Plan context through the database first, so the row construction is checked in the source it is built in.
  const source = require('node:fs').readFileSync(require.resolve('../../src/services/ask/handlers/buyerPlan.handler.ts'), 'utf8');
  assert.match(source, /actions: canChange \? \[finding\.negotiationCaseLinks\.length/);
  assert.match(source, /BUYER_NEGOTIATION_ACTION_IDS\.OUTCOME/);
  assert.match(source, /BUYER_NEGOTIATION_ACTION_IDS\.START/);
  assert.match(source, /access\.role !== 'VIEWER'/);
  const applicable = (id, operationId) => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: 'CONTRIBUTOR', authoritativeSourceAvailable: true,
  });
  for (const id of ['buyer-negotiation-start', 'buyer-negotiation-outcome']) assert.equal(applicable(id, 'BUYER_NEGOTIATION_READINESS'), true, id);
  for (const id of ['buyer-negotiation-outcome', 'buyer-negotiation-back']) assert.equal(applicable(id, OP), true, id);
});
