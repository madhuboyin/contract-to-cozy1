const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Quote Comparison": add, select, reject/return and remove a proposal from Ask (FRD v1.309). No database, browser or native module.

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
const quoteService = require('../../src/services/quoteComparison.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/serviceQuoteDecisionAnalytics.service.ts');
const command = require('../../src/services/ask/support/quoteComparisonCommand.ts');
const handler = require('../../src/services/ask/handlers/quoteComparisonCommands.handler.ts');

const nodeCrypto = require('node:crypto');
const sha = (text) => nodeCrypto.createHash('sha256').update(text).digest('hex');
const OP = 'QUOTE_COMPARISON_COMMAND';
const M = command.QUOTE_COMMAND_MESSAGES;
const WORKSPACE = { id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', serviceCategory: 'ROOFING', scopeSummary: 'Roof', updatedAt: new Date('2026-10-01T00:00:00Z'), selectedQuoteId: null };
const QUOTE = { id: 'q-1', vendorName: 'Acme Roofing', quoteAmount: 12000, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', updatedAt: new Date('2026-10-02T00:00:00Z'), workspaceId: 'ws-1',
  scopeSummary: 'Tear off', quoteDate: new Date('2026-09-01T12:00:00Z'), expirationDate: null, notes: null, homeownerConfirmedAt: null,
  terms: [{ type: 'WARRANTY', label: 'Warranty', value: '5 years', included: null }, { type: 'INCLUSION', label: null, value: 'Disposal', included: true }], clarifications: [] };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ workspace = WORKSPACE, quote = QUOTE } = {}) {
  const saved = { ws: prisma.quoteComparisonWorkspace, q: prisma.quoteComparisonQuote };
  prisma.quoteComparisonWorkspace = { findFirst: async (args) => (args.where.id === workspace?.id && args.where.propertyId === 'prop-1' ? workspace : null) };
  prisma.quoteComparisonQuote = { findFirst: async (args) => (quote && args.where.id === quote.id ? { ...quote, workspace } : null) };
  return () => { prisma.quoteComparisonWorkspace = saved.ws; prisma.quoteComparisonQuote = saved.q; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launchFor = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: command.quoteCommandTargetsWorkspace(kind) ? command.QUOTE_WORKSPACE_ENTITY_TYPE : command.QUOTE_ENTITY_TYPE, entityId, ...over });

// ───────────────────────────── the form's input ─────────────────────────────

test('the form becomes the canonical proposal input: a manual USD proposal with a warranty term and noon-UTC dates', () => {
  const parsed = command.parseQuoteAddAnswer({ vendorName: ' Acme Roofing ', quoteAmount: '12000.5', scopeSummary: 'Tear off and replace', quoteDate: { precision: 'EXACT_DATE', value: '2026-09-01' }, expirationDate: '2026-12-01', warranty: '10 years', notes: '' });
  assert.equal(parsed.success, true);
  assert.deepEqual(command.quoteAddProposalInput(parsed.data), {
    vendorName: 'Acme Roofing', quoteAmount: 12000.5, currency: 'USD', sourceType: 'MANUAL', scopeSummary: 'Tear off and replace',
    quoteDate: '2026-09-01T12:00:00.000Z', expirationDate: '2026-12-01T12:00:00.000Z', terms: [{ type: 'WARRANTY', label: 'Warranty', value: '10 years' }],
  });
});

test('a provider and an amount are enough; bad input and an expiry before the quote date are refused', () => {
  assert.equal(command.parseQuoteAddAnswer({ vendorName: 'A', quoteAmount: 0 }).success, true);
  for (const bad of [{ quoteAmount: 5 }, { vendorName: 'A' }, { vendorName: 'A', quoteAmount: -1 }, { vendorName: 'A', quoteAmount: 'lots' }, { vendorName: 'A', quoteAmount: 1, sourceType: 'UPLOADED_QUOTE' }, { vendorName: 'A', quoteAmount: 1, quoteDate: 'soon' }]) {
    assert.equal(command.parseQuoteAddAnswer(bad).success, false, JSON.stringify(bad));
  }
  assert.deepEqual(command.parseQuoteAddAnswer({ vendorName: 'A', quoteAmount: 1, quoteDate: '2026-10-01', expirationDate: '2026-09-01' }), { success: false, reason: 'DATES' });
});

// ───────────────────────────── routing and the command ─────────────────────────────

test('the command is declared-action only: no typed message reaches it, and it is a registered contributor command', () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  const registered = getAskDomainCommandByOperation(OP);
  assert.equal(registered.roleFloor, 'CONTRIBUTOR');
  assert.equal(registered.adapterKey, 'quote-comparison.command');
});

test('Add a proposal opens the form for an open workspace; a viewer, a refresh, a wrong entity and a closed decision do not', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData();
  try {
    const result = await invoke(M.ADD, launchFor('ADD', 'ws-1'));
    assert.equal(result.status, 'NEEDS_CONTEXT');
    assert.equal(result.reasonCode, 'QUOTE_ADD_INPUT_REQUIRED');
    assert.deepEqual(result.captureRequests[0].inputSchema.fields.map((f) => f.key), ['vendorName', 'quoteAmount', 'scopeSummary', 'quoteDate', 'expirationDate', 'warranty', 'notes']);
    assert.equal(result.captureRequests[0].captureKey, command.QUOTE_ADD_CAPTURE_KEY);
    assert.deepEqual(result.parameters.quoteCommandLaunch, { kind: 'ADD', entityId: 'ws-1', sourceExecutionId: null });

    assert.equal((await invoke(M.ADD, launchFor('ADD', 'ws-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_QUOTE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'ws-1', { entityType: command.QUOTE_ENTITY_TYPE }))).reasonCode, 'ASK_QUOTE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('add a quote', launchFor('ADD', 'ws-1'))).reasonCode, 'ASK_QUOTE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'other-workspace'))).reasonCode, 'QUOTE_WORKSPACE_NOT_FOUND');
    assert.equal((await invoke(M.ADD, launchFor('ADD', 'ws-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { restoreData(); restoreRole(); }

  const restoreRole2 = withRole('CONTRIBUTOR'); const restoreClosed = withData({ workspace: { ...WORKSPACE, outcome: 'DECLINED' } });
  try { assert.equal((await invoke(M.ADD, launchFor('ADD', 'ws-1'))).reasonCode, 'QUOTE_WORKSPACE_CLOSED'); } finally { restoreClosed(); restoreRole2(); }
});

test('a submitted proposal is reviewed in full and nothing is written yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData();
  const original = quoteService.createQuoteProposal; let created = 0;
  quoteService.createQuoteProposal = async () => { created += 1; return {}; };
  try {
    const parsed = command.parseQuoteAddAnswer({ vendorName: 'Acme Roofing', quoteAmount: 12000, scopeSummary: 'Tear off', warranty: '10 years' });
    const result = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'ADD', entityId: 'ws-1', sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual([fields.Provider, fields['Total quoted'], fields.Covers, fields.Warranty], ['Acme Roofing', '$12,000', 'Tear off', '10 years']);
    assert.match(result.confirmation.description, /does not select a provider/);
    assert.equal(result.captureRequests[0].currentAnswer.vendorName, 'Acme Roofing', 'the form keeps what was entered');
    assert.equal(created, 0);
  } finally { quoteService.createQuoteProposal = original; restoreData(); restoreRole(); }
});

test('Select is offered only for a comparison-ready proposal in a comparable set; every other reason is explained and writes nothing', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  const savedCompare = quoteService.getWorkspaceComparability;
  try {
    let restoreData = withData(); quoteService.getWorkspaceComparability = async () => ({ status: 'COMPARABLE', eligibleQuoteIds: ['q-1', 'q-2'], reasons: [] });
    const ok = await invoke(M.SELECT, launchFor('SELECT', 'q-1'));
    assert.equal(ok.status, 'NEEDS_CONFIRMATION');
    assert.match(ok.confirmation.description, /does not accept the quote, book anyone/);
    restoreData();

    restoreData = withData({ quote: { ...QUOTE, readinessStage: 'NEEDS_SCOPE_REVIEW' } });
    assert.equal((await invoke(M.SELECT, launchFor('SELECT', 'q-1'))).reasonCode, 'QUOTE_NOT_COMPARISON_READY');
    restoreData();

    restoreData = withData(); quoteService.getWorkspaceComparability = async () => ({ status: 'NOT_COMPARABLE', eligibleQuoteIds: [], reasons: ['Scopes differ.'] });
    const notComparable = await invoke(M.SELECT, launchFor('SELECT', 'q-1'));
    assert.equal(notComparable.reasonCode, 'QUOTE_NOT_COMPARABLE');
    assert.match(notComparable.blocks[0].body, /Scopes differ/);
    restoreData();
  } finally { quoteService.getWorkspaceComparability = savedCompare; restoreRole(); }
});

test('reject, return and remove each review one proposal; they are locked once final-term review begins', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    let restoreData = withData();
    for (const [kind, label] of [['REJECT', 'Reject proposal'], ['RESTORE', 'Return to consideration'], ['REMOVE', 'Remove proposal']]) {
      const result = await invoke(M[kind], launchFor(kind, 'q-1'));
      assert.equal(result.status, 'NEEDS_CONFIRMATION', kind);
      assert.equal(result.confirmation.confirmLabel, label);
      assert.deepEqual(result.parameters.quoteCommand, { kind, entityId: 'q-1' });
    }
    restoreData();
    restoreData = withData({ workspace: { ...WORKSPACE, journeyStage: 'FINALIZATION' } });
    assert.equal((await invoke(M.REMOVE, launchFor('REMOVE', 'q-1'))).reasonCode, 'QUOTE_PROPOSALS_LOCKED');
    restoreData();
  } finally { restoreRole(); }
});

// ───────────────────────────── the confirmed writes ─────────────────────────────

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const names = ['createQuoteProposal', 'selectQuoteForDecision', 'setQuoteProposalDisposition', 'deleteQuoteProposal'];
  const saved = Object.fromEntries(names.map((n) => [n, quoteService[n]]));
  const savedCompliance = compliance.assertProjectComplianceDecisionsApplicable;
  const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  const savedAnalytics = analytics.emitServiceQuoteDecisionAnalytics;
  analytics.emitServiceQuoteDecisionAnalytics = () => undefined;
  const calls = [];
  quoteService.createQuoteProposal = async (...a) => { calls.push(['create', ...a]); return { id: 'q-new', readinessStage: 'NEEDS_SCOPE_REVIEW', readinessScore: 40, missingFactsJson: [{}, {}] }; };
  quoteService.selectQuoteForDecision = async (...a) => { calls.push(['select', ...a]); return {}; };
  quoteService.setQuoteProposalDisposition = async (...a) => { calls.push(['disposition', ...a]); return {}; };
  quoteService.deleteQuoteProposal = async (...a) => { calls.push(['delete', ...a]); };
  compliance.assertProjectComplianceDecisionsApplicable = async (...a) => { calls.push(['compliance', ...a.slice(2)]); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { analytics.emitServiceQuoteDecisionAnalytics = savedAnalytics; Object.assign(quoteService, saved); compliance.assertProjectComplianceDecisionsApplicable = savedCompliance; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}
const versionFor = (workspace, quote) => handler.quoteCommandContextVersion(workspace, quote);

test('confirming Add creates the proposal through the canonical create after the applicability check, and reports readiness honestly', async () => {
  const restoreData = withData(); const w = installWrites();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({
      quoteAdd: { vendorName: 'Acme Roofing', quoteAmount: 12000, scopeSummary: null, quoteDate: null, expirationDate: null, warranty: '10 years', notes: null },
      quoteCommand: { kind: 'ADD', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, null),
    }));
    assert.deepEqual(w.calls.map((c) => c[0]), ['compliance', 'create']);
    const [, propertyId, workspaceId, input] = w.calls[1];
    assert.deepEqual([propertyId, workspaceId, input.vendorName, input.sourceType, input.terms[0].type], ['prop-1', 'ws-1', 'Acme Roofing', 'MANUAL', 'WARRANTY']);
    assert.equal(out.artifactId, 'q-new');
    assert.match(out.result.blocks[0].description, /not compared until its scope facts are confirmed/);
  } finally { w.restore(); restoreData(); }
});

test('confirming Select, Reject, Return and Remove calls the matching canonical function with the proposal', async () => {
  const restoreData = withData(); const w = installWrites();
  try {
    const params = (kind) => ({ quoteCommand: { kind, entityId: 'q-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, QUOTE) });
    await confirmCapabilityInvoke(OP, ctx(params('SELECT')));
    await confirmCapabilityInvoke(OP, ctx(params('REJECT')));
    await confirmCapabilityInvoke(OP, ctx(params('RESTORE')));
    await confirmCapabilityInvoke(OP, ctx(params('REMOVE')));
    const writes = w.calls.filter((c) => c[0] !== 'compliance');
    assert.deepEqual(writes, [
      ['select', 'prop-1', 'ws-1', 'q-1', 'user-1'],
      ['disposition', 'prop-1', 'ws-1', 'q-1', 'user-1', 'REJECTED'],
      ['disposition', 'prop-1', 'ws-1', 'q-1', 'user-1', 'UNDECIDED'],
      ['delete', 'prop-1', 'ws-1', 'q-1', 'user-1'],
    ]);
  } finally { w.restore(); restoreData(); }
});

test('a confirmation is refused, with nothing written, when the records changed, vanished or were tampered with', async () => {
  const w = installWrites();
  try {
    let restoreData = withData();
    const stale = { quoteCommand: { kind: 'REMOVE', entityId: 'q-1' }, quoteCommandContextVersion: 'old-version' };
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(stale)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({})), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteCommand: { kind: 'DELETE_EVERYTHING', entityId: 'q-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteAdd: { vendorName: '', quoteAmount: 1 }, quoteCommand: { kind: 'ADD', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, null) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restoreData();
    restoreData = withData({ quote: null });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteCommand: { kind: 'REMOVE', entityId: 'q-1' }, quoteCommandContextVersion: 'x' })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restoreData();
    assert.equal(w.calls.filter((c) => c[0] !== 'compliance').length, 0);
  } finally { w.restore(); }
});

test("the canonical service's refusal reaches the homeowner as a readable message", async () => {
  const restoreData = withData(); const w = installWrites();
  const { APIError } = require('../../src/middleware/error.middleware.ts');
  quoteService.selectQuoteForDecision = async () => { throw new APIError('This proposal is not part of a comparable proposal set.', 409, 'QUOTE_NOT_COMPARABLE'); };
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteCommand: { kind: 'SELECT', entityId: 'q-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, QUOTE) })),
      (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE' && /comparable proposal set/.test(e.message));
  } finally { w.restore(); restoreData(); }
});

// ───────────────────────────── the review's actions ─────────────────────────────

test('every action id the review and the receipt emit is allowlisted for the operation that emits it', () => {
  const applicable = (id, operationId, role = 'CONTRIBUTOR') => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: role, authoritativeSourceAvailable: true,
  });
  // Outcome sharing is the owner's own consent (FRD v1.460); every other action is a contributor's.
  for (const id of Object.values(command.QUOTE_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'QUOTE_COMPARISON_REVIEW', id === command.QUOTE_COMMAND_ACTION_IDS.CONSENT ? 'OWNER' : 'CONTRIBUTOR'), true, id);
  assert.equal(applicable('quote-comparison-back', OP), true);
});

async function review(role, outcome = 'OPEN') {
  const savedWs = prisma.quoteComparisonWorkspace;
  const savedGet = quoteService.getQuoteComparisonWorkspace; const savedCompare = quoteService.getWorkspaceComparability;
  prisma.quoteComparisonWorkspace = { findFirst: async () => ({ id: 'ws-1', outcome, journeyStage: 'SCOPE_REVIEW' }) };
  quoteService.getQuoteComparisonWorkspace = async () => ({ updatedAt: new Date('2026-10-01T00:00:00Z'), quotes: [
    { id: 'q-1', vendorName: 'Acme', quoteAmount: 100, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', terms: [] },
    { id: 'q-2', vendorName: 'Beta', quoteAmount: 120, currency: 'USD', decision: 'REJECTED', isSelected: false, readinessStage: 'NEEDS_SCOPE_REVIEW', terms: [] },
    { id: 'q-3', vendorName: 'Gamma', quoteAmount: 130, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', homeownerConfirmedAt: new Date(), terms: [], clarifications: [{ status: 'OPEN' }] },
  ] });
  quoteService.getWorkspaceComparability = async () => ({ status: 'COMPARABLE', eligibleQuoteIds: ['q-1', 'q-3'], reasons: [] });
  try {
    return await capabilityInvoke('QUOTE_COMPARISON_REVIEW', { userId: 'user-1', propertyId: 'prop-1', message: 'Compare my service quotes', launchContext: null }, { propertyAccess: { role } });
  } finally { prisma.quoteComparisonWorkspace = savedWs; quoteService.getQuoteComparisonWorkspace = savedGet; quoteService.getWorkspaceComparability = savedCompare; }
}

test('the review offers Add a proposal and per-proposal controls to a contributor, and nothing to change to a viewer or on a closed decision', async () => {
  const restore = withRole('CONTRIBUTOR');
  try {
    const result = await review('CONTRIBUTOR');
    const summary = result.blocks.find((b) => b.id === 'quote-review-summary');
    assert.deepEqual(summary.actions.map((a) => [a.id, a.operationId, a.message, a.entityType, a.entityId]),
      [['quote-comparison-add-quote', OP, M.ADD, command.QUOTE_WORKSPACE_ENTITY_TYPE, 'ws-1'], ['quote-comparison-import-quote', OP, M.IMPORT, command.QUOTE_WORKSPACE_ENTITY_TYPE, 'ws-1'], ['quote-comparison-close-decision', OP, M.CLOSE, command.QUOTE_WORKSPACE_ENTITY_TYPE, 'ws-1']]);
    const manage = result.blocks.find((b) => b.id === 'quote-review-manage');
    const byId = Object.fromEntries(manage.sections[0].items.map((i) => [i.id, i]));
    assert.equal(byId['q-1'].entityType, command.QUOTE_ENTITY_TYPE);
    assert.deepEqual(byId['q-1'].actions.map((a) => a.id), ['quote-comparison-select-quote', 'quote-comparison-confirm-quote', 'quote-comparison-edit-quote',
      'quote-comparison-clarify-quote', 'quote-comparison-reject-quote', 'quote-comparison-remove-quote']);
    assert.deepEqual(byId['q-2'].actions.map((a) => a.id), ['quote-comparison-edit-quote', 'quote-comparison-clarify-quote', 'quote-comparison-restore-quote', 'quote-comparison-remove-quote'],
      'a rejected, not-ready proposal can be changed, questioned, returned or removed, not selected or confirmed');
    assert.ok(byId['q-3'].meta.includes('1 open question'));
    assert.ok(byId['q-3'].actions.some((a) => a.id === 'quote-comparison-resolve-clarification'));
    assert.equal(byId['q-3'].actions.some((a) => a.id === 'quote-comparison-confirm-quote'), false, 'already confirmed');
    assert.ok(byId['q-1'].actions.every((a) => a.operationId === OP));

    for (const [role, outcome] of [['VIEWER', 'OPEN'], ['CONTRIBUTOR', 'DECLINED']]) {
      const other = await review(role, outcome);
      assert.deepEqual(other.blocks.find((b) => b.id === 'quote-review-summary').actions, [], `${role}/${outcome}`);
      assert.equal(other.blocks.some((b) => b.id === 'quote-review-manage'), false, `${role}/${outcome}`);
    }
  } finally { restore(); }
});

// ───────────────────────────── change, confirm, question, answer, close ─────────────────────────────

test('Change opens the form with what is recorded; the review lists exactly what changes and says what a save clears; no change is refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData();
  try {
    const open = await invoke(M.EDIT, launchFor('EDIT', 'q-1'));
    assert.equal(open.status, 'NEEDS_CONTEXT');
    assert.equal(open.captureRequests[0].captureKey, command.QUOTE_FORM_CAPTURE_KEYS.EDIT);
    assert.deepEqual(open.captureRequests[0].currentAnswer, { vendorName: 'Acme Roofing', quoteAmount: 12000, scopeSummary: 'Tear off', quoteDate: '2026-09-01', warranty: '5 years' });

    const parsed = command.parseQuoteAddAnswer({ vendorName: 'Acme Roofing', quoteAmount: 11500, scopeSummary: 'Tear off', quoteDate: '2026-09-01', warranty: '10 years' });
    const review = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'q-1', sourceExecutionId: null }, parsed.data);
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(review.confirmation.fields.map((f) => [f.label, f.value]));
    assert.equal(fields['Total quoted'], '$12,000 \u2192 $11,500');
    assert.equal(fields.Warranty, '5 years \u2192 10 years');
    assert.equal('Provider' in fields && fields.Provider.includes('\u2192'), false, 'an unchanged field is not listed as a change');
    assert.match(review.confirmation.description, /clears the confirmed facts of this proposal and the selection and rejections/);

    const same = command.parseQuoteAddAnswer({ vendorName: 'Acme Roofing', quoteAmount: 12000, scopeSummary: 'Tear off', quoteDate: '2026-09-01', warranty: '5 years' });
    const none = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'q-1', sourceExecutionId: null }, same.data);
    assert.equal(none.reasonCode, 'QUOTE_EDIT_NO_CHANGE');
  } finally { restoreData(); restoreRole(); }
});

test('confirming a Change sends only the changed fields, and keeps the other terms when the warranty changes', async () => {
  const restoreData = withData(); const w = installWrites();
  const original = quoteService.updateQuoteProposal; const calls = [];
  quoteService.updateQuoteProposal = async (...a) => { calls.push(a); return { readinessStage: 'NEEDS_SCOPE_REVIEW' }; };
  try {
    await confirmCapabilityInvoke(OP, ctx({
      quoteEdit: { vendorName: 'Acme Roofing', quoteAmount: 11500, scopeSummary: 'Tear off', quoteDate: '2026-09-01', expirationDate: null, warranty: '10 years', notes: null },
      quoteCommand: { kind: 'EDIT', entityId: 'q-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, QUOTE),
    }));
    assert.equal(calls.length, 1);
    const [propertyId, workspaceId, quoteId, userId, input] = calls[0];
    assert.deepEqual([propertyId, workspaceId, quoteId, userId], ['prop-1', 'ws-1', 'q-1', 'user-1']);
    assert.deepEqual(Object.keys(input).sort(), ['quoteAmount', 'terms']);
    assert.equal(input.quoteAmount, 11500);
    assert.deepEqual(input.terms.map((t) => [t.type, t.value]), [['INCLUSION', 'Disposal'], ['WARRANTY', '10 years']]);
  } finally { quoteService.updateQuoteProposal = original; w.restore(); restoreData(); }
});

const REVIEW = {
  fingerprint: 'f'.repeat(64),
  headline: [{ key: 'vendorName', label: 'Provider', value: 'Acme HVAC' }, { key: 'quoteAmount', label: 'Total', value: 8200 }, { key: 'scopeSummary', label: 'Scope', value: 'Replace furnace' }],
  facts: [{ fieldKey: 'vendorName', state: 'EXTRACTED_UNCONFIRMED', extractedValue: 'Acme HVAC', confirmedValue: null }, { fieldKey: 'quoteAmount', state: 'HOMEOWNER_CORRECTED', extractedValue: 8000, confirmedValue: 8200 }],
  lineItems: [{ id: 'li-1', kind: 'EQUIPMENT', description: 'Furnace unit', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000, state: 'EXTRACTED_UNCONFIRMED', sourceText: null, sourcePage: null },
    { id: 'li-2', kind: 'LABOR', description: 'Installation', quantity: null, unit: null, unitPrice: null, total: 2200, state: 'HOMEOWNER_CONFIRMED', sourceText: null, sourcePage: null }],
  terms: [{ id: 't-1', type: 'WARRANTY', label: null, value: '10 years parts', included: true, state: 'EXTRACTED_UNCONFIRMED', sourceText: null, sourcePage: null }],
  counts: { facts: 2, lineItems: 2, terms: 1, unconfirmed: 3, corrected: 1, confirmed: 1 },
};

test('Confirm the facts shows every value it would confirm, is refused when already confirmed, and confirms exactly that set through the canonical function', async () => {
  const savedReview = quoteService.getQuoteReview;
  quoteService.getQuoteReview = async () => ({ quoteId: 'q-1', homeownerConfirmedAt: null, review: REVIEW });
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    let restoreData = withData();
    const review = await invoke(M.CONFIRM, launchFor('CONFIRM', 'q-1'));
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /every value listed below/);
    assert.match(review.confirmation.description, /cannot change or remove a line item or term/);
    const list = review.blocks.find((block) => block.id === 'quote-review-values');
    const titles = list.sections.flatMap((section) => section.items.map((item) => item.title));
    assert.ok(titles.includes('1. Furnace unit') && titles.includes('2. Installation') && titles.some((title) => /warranty/i.test(title)), 'every line item and term is listed');
    assert.equal(list.sections.find((section) => section.id === 'line-items').items.find((item) => item.id === 'li-2').status, 'Confirmed');
    assert.equal(list.sections[0].items.find((item) => item.id === 'headline-quoteAmount').status, 'Corrected by you');
    assert.deepEqual(review.parameters.quoteReviewRequest, {
      reviewFingerprint: REVIEW.fingerprint, lineItemIds: ['li-1', 'li-2'], termIds: ['t-1'], factKeys: ['vendorName', 'quoteAmount'], rejectedLineItemIds: [], rejectedTermIds: [],
    });
    restoreData();
    restoreData = withData({ quote: { ...QUOTE, homeownerConfirmedAt: new Date() } });
    assert.equal((await invoke(M.CONFIRM, launchFor('CONFIRM', 'q-1'))).reasonCode, 'QUOTE_ALREADY_CONFIRMED');
    restoreData();
    const big = { ...REVIEW, lineItems: Array.from({ length: 101 }, (_, i) => ({ ...REVIEW.lineItems[0], id: `li-${i}` })) };
    quoteService.getQuoteReview = async () => ({ quoteId: 'q-1', homeownerConfirmedAt: null, review: big });
    restoreData = withData();
    assert.equal((await invoke(M.CONFIRM, launchFor('CONFIRM', 'q-1'))).reasonCode, 'QUOTE_TOO_LARGE_TO_REVIEW');
    restoreData();
  } finally { quoteService.getQuoteReview = savedReview; restoreRole(); }
  const restoreData2 = withData(); const w = installWrites();
  const original = quoteService.confirmQuoteProposal; const calls = [];
  quoteService.confirmQuoteProposal = async (...a) => { calls.push(a); return { readinessStage: 'COMPARISON_READY', readinessScore: 90 }; };
  const request = { reviewFingerprint: 'a'.repeat(64), lineItemIds: ['li-1'], termIds: [], factKeys: [], rejectedLineItemIds: [], rejectedTermIds: [] };
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({ quoteCommand: { kind: 'CONFIRM', entityId: 'q-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, QUOTE), quoteReviewRequest: request }));
    assert.deepEqual(calls, [['prop-1', 'ws-1', 'q-1', 'user-1', request]]);
    assert.equal(out.result.blocks[0].title, 'Facts confirmed');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteCommand: { kind: 'CONFIRM', entityId: 'q-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, QUOTE) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1, 'no request, nothing confirmed');
  } finally { quoteService.confirmQuoteProposal = original; w.restore(); restoreData2(); }
});

test('a question is recorded (not sent) and an answer resolves the oldest open question', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  const withOpen = { ...QUOTE, clarifications: [{ id: 'c-1', question: 'Is disposal included?', status: 'OPEN', createdAt: new Date() }] };
  try {
    let restoreData = withData();
    const form = await invoke(M.CLARIFY, launchFor('CLARIFY', 'q-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.QUOTE_FORM_CAPTURE_KEYS.CLARIFY);
    const review = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'CLARIFY', entityId: 'q-1', sourceExecutionId: null }, { question: 'Is disposal included?' });
    assert.match(review.confirmation.description, /Nothing is sent/);
    assert.equal(review.parameters.quoteClarify.question, 'Is disposal included?');
    assert.equal((await invoke(M.RESOLVE, launchFor('RESOLVE', 'q-1'))).reasonCode, 'QUOTE_NO_OPEN_QUESTION');
    restoreData();

    restoreData = withData({ quote: withOpen });
    const answerForm = await invoke(M.RESOLVE, launchFor('RESOLVE', 'q-1'));
    assert.equal(answerForm.status, 'NEEDS_CONTEXT');
    assert.match(answerForm.blocks[0].body, /Is disposal included\?/);
    const answerReview = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'RESOLVE', entityId: 'q-1', sourceExecutionId: null }, { response: 'Yes, hauled away.' });
    assert.deepEqual(answerReview.parameters.quoteResolve, { response: 'Yes, hauled away.', clarificationId: 'c-1' });
    restoreData();
  } finally { restoreRole(); }

  const restoreData2 = withData({ quote: withOpen }); const w = installWrites();
  const saved = { c: quoteService.createQuoteClarification, r: quoteService.resolveQuoteClarification }; const calls = [];
  quoteService.createQuoteClarification = async (...a) => { calls.push(['clarify', ...a]); return { id: 'c-new' }; };
  quoteService.resolveQuoteClarification = async (...a) => { calls.push(['resolve', ...a]); return {}; };
  try {
    const version = versionFor(WORKSPACE, withOpen);
    await confirmCapabilityInvoke(OP, ctx({ quoteClarify: { question: 'Is disposal included?' }, quoteCommand: { kind: 'CLARIFY', entityId: 'q-1' }, quoteCommandContextVersion: version }));
    await confirmCapabilityInvoke(OP, ctx({ quoteResolve: { response: 'Yes.', clarificationId: 'c-1' }, quoteCommand: { kind: 'RESOLVE', entityId: 'q-1' }, quoteCommandContextVersion: version }));
    assert.deepEqual(calls, [
      ['clarify', 'prop-1', 'ws-1', 'q-1', 'user-1', 'Is disposal included?'],
      ['resolve', 'prop-1', 'ws-1', 'q-1', 'c-1', 'user-1', 'Yes.'],
    ]);
  } finally { Object.assign(quoteService, { createQuoteClarification: saved.c, resolveQuoteClarification: saved.r }); w.restore(); restoreData2(); }
});

test('Close this decision takes a way out, is reviewed, and closes through the canonical transition', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    const restoreData = withData();
    const form = await invoke(M.CLOSE, launchFor('CLOSE', 'ws-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['DECLINED', 'DEFERRED']);
    const review = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'CLOSE', entityId: 'ws-1', sourceExecutionId: null }, { outcome: 'DEFERRED', reason: 'Waiting on a third quote' });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /does not cancel anything/);
    restoreData();
  } finally { restoreRole(); }
  const restoreData2 = withData(); const w = installWrites();
  const original = quoteService.transitionQuoteDecision; const calls = [];
  quoteService.transitionQuoteDecision = async (...a) => { calls.push(a); return {}; };
  try {
    await confirmCapabilityInvoke(OP, ctx({ quoteClose: { outcome: 'DECLINED', reason: null }, quoteCommand: { kind: 'CLOSE', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, null) }));
    assert.deepEqual(calls, [['prop-1', 'ws-1', 'user-1', { toStage: 'CLOSED', outcome: 'DECLINED', reason: null }]]);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ quoteClose: { outcome: 'CANCELLED' }, quoteCommand: { kind: 'CLOSE', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE, null) })),
      (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
  } finally { quoteService.transitionQuoteDecision = original; w.restore(); restoreData2(); }
});

test('a form can only be submitted as the command that opened it', () => {
  assert.equal(command.quoteFormKindFromCaptureKey(command.QUOTE_FORM_CAPTURE_KEYS.EDIT), 'EDIT');
  assert.equal(command.quoteFormKindFromCaptureKey('NOT_A_FORM'), null);
  assert.equal(command.parseQuoteFormAnswer('CLARIFY', { question: 'hi' }).success, false, 'a question needs three characters');
  assert.equal(command.parseQuoteFormAnswer('CLOSE', { outcome: 'CANCELLED' }).success, false);
  assert.equal(command.parseQuoteFormAnswer('RESOLVE', { response: '' }).success, false);
});

// ───────────────────────────── add a proposal from a document on file (import design slice 5, FRD v1.363) ─────────────────────────────

test('Add from a document lists only household-shared quote records, asks for a choice when an earlier version is here, and reviews before reading anything', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData();
  const saved = { rec: prisma.propertyRecord, src: prisma.quoteHomeRecordSource };
  const records = [
    { id: 'rec-1', title: 'Acme quote', recordType: 'QUOTE', updatedAt: new Date('2026-09-01'), currentVersionId: 'ver-2' },
    { id: 'rec-2', title: 'Other', recordType: 'OTHER', updatedAt: new Date('2026-08-01'), currentVersionId: 'ver-9' },
  ];
  let seenWhere = null; let earlier = [];
  prisma.propertyRecord = { findMany: async (args) => { seenWhere = args.where; return records; } };
  prisma.quoteHomeRecordSource = { findMany: async () => earlier };
  try {
    const form = await invoke(M.IMPORT, launchFor('IMPORT', 'ws-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(seenWhere.visibility, 'HOUSEHOLD');
    assert.equal(seenWhere.lifecycleStatus, 'ACTIVE');
    assert.deepEqual(seenWhere.recordType.in, ['QUOTE', 'CONTRACT', 'OTHER']);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields[0].inputSchema.options.map((o) => o.value), ['rec-1', 'rec-2']);
    assert.equal(form.captureRequests[0].captureKey, command.QUOTE_FORM_CAPTURE_KEYS.IMPORT);

    const review = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'IMPORT', entityId: 'ws-1', sourceExecutionId: null }, { recordId: 'rec-1', onNewerVersion: null });
    assert.equal(review.status, 'NEEDS_CONFIRMATION');
    assert.match(review.confirmation.description, /Nothing is confirmed: you review every value afterwards/);
    assert.deepEqual(review.parameters.quoteImport, { recordId: 'rec-1', onNewerVersion: null });

    const notOffered = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'IMPORT', entityId: 'ws-1', sourceExecutionId: null }, { recordId: 'rec-private', onNewerVersion: null });
    assert.equal(notOffered.reasonCode, 'QUOTE_IMPORT_DOCUMENT_NOT_OFFERED');

    earlier = [{ quoteId: 'q-old', propertyRecordVersionId: 'ver-1' }];
    const choice = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'IMPORT', entityId: 'ws-1', sourceExecutionId: null }, { recordId: 'rec-1', onNewerVersion: null });
    assert.equal(choice.reasonCode, 'QUOTE_IMPORT_VERSION_CHOICE_REQUIRED');
    assert.equal(choice.captureRequests[0].inputSchema.fields[1].required, true);
    const replace = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'IMPORT', entityId: 'ws-1', sourceExecutionId: null }, { recordId: 'rec-1', onNewerVersion: 'REPLACE' });
    assert.equal(replace.parameters.quoteImport.onNewerVersion, 'REPLACE');

    earlier = [{ quoteId: 'q-old', propertyRecordVersionId: 'ver-2' }];
    const same = await handler.quoteCommandResult('user-1', 'prop-1', { kind: 'IMPORT', entityId: 'ws-1', sourceExecutionId: null }, { recordId: 'rec-1', onNewerVersion: null });
    assert.equal(same.reasonCode, 'QUOTE_ALREADY_IMPORTED');

    records.length = 0;
    assert.equal((await invoke(M.IMPORT, launchFor('IMPORT', 'ws-1'))).reasonCode, 'QUOTE_NO_DOCUMENT_ON_FILE');
    assert.equal((await invoke(M.IMPORT, launchFor('IMPORT', 'ws-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
  } finally { prisma.propertyRecord = saved.rec; prisma.quoteHomeRecordSource = saved.src; restoreData(); restoreRole(); }
});

test('confirming the import calls the import service with the household role and the chosen record, once', async () => {
  const importPath = require.resolve('../../src/services/quoteHomeRecordImport.service.ts');
  const savedCache = require.cache[importPath];
  const calls = [];
  require.cache[importPath] = { id: importPath, filename: importPath, loaded: true, exports: {
    createQuoteProposalFromRecord: async (input) => { calls.push(input); return { quote: { id: 'q-new', vendorName: 'Acme HVAC', lineItems: [{}, {}], terms: [{}] }, alreadyImported: false, replacedQuoteId: null }; },
  } };
  const restoreData = withData(); const w = installWrites();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({
      quoteCommand: { kind: 'IMPORT', entityId: 'ws-1' }, quoteCommandContextVersion: sha(`quote-command:ws-1:${WORKSPACE.updatedAt.toISOString()}:`),
      quoteImport: { recordId: 'rec-1', onNewerVersion: 'REPLACE' },
    }));
    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0].propertyId, calls[0].workspaceId, calls[0].recordId, calls[0].onNewerVersion, calls[0].role], ['prop-1', 'ws-1', 'rec-1', 'REPLACE', 'CONTRIBUTOR']);
    assert.equal(out.result.blocks[0].title, 'Proposal added from the document');
    assert.match(out.result.blocks[0].description, /2 line items and 1 term were read\. Nothing is confirmed yet/);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({
      quoteCommand: { kind: 'IMPORT', entityId: 'ws-1' }, quoteCommandContextVersion: sha(`quote-command:ws-1:${WORKSPACE.updatedAt.toISOString()}:`), quoteImport: {},
    })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(calls.length, 1);
  } finally { if (savedCache) require.cache[importPath] = savedCache; else delete require.cache[importPath]; w.restore(); restoreData(); }
});
