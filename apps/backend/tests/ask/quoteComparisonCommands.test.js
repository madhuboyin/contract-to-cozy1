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

const OP = 'QUOTE_COMPARISON_COMMAND';
const M = command.QUOTE_COMMAND_MESSAGES;
const WORKSPACE = { id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', serviceCategory: 'ROOFING', scopeSummary: 'Roof', updatedAt: new Date('2026-10-01T00:00:00Z'), selectedQuoteId: null };
const QUOTE = { id: 'q-1', vendorName: 'Acme Roofing', quoteAmount: 12000, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', updatedAt: new Date('2026-10-02T00:00:00Z'), workspaceId: 'ws-1' };

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
const launchFor = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: kind === 'ADD' ? command.QUOTE_WORKSPACE_ENTITY_TYPE : command.QUOTE_ENTITY_TYPE, entityId, ...over });

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
  for (const id of Object.values(command.QUOTE_COMMAND_ACTION_IDS)) assert.equal(applicable(id, 'QUOTE_COMPARISON_REVIEW'), true, id);
  assert.equal(applicable('quote-comparison-back', OP), true);
});

async function review(role, outcome = 'OPEN') {
  const savedWs = prisma.quoteComparisonWorkspace;
  const savedGet = quoteService.getQuoteComparisonWorkspace; const savedCompare = quoteService.getWorkspaceComparability;
  prisma.quoteComparisonWorkspace = { findFirst: async () => ({ id: 'ws-1', outcome, journeyStage: 'SCOPE_REVIEW' }) };
  quoteService.getQuoteComparisonWorkspace = async () => ({ updatedAt: new Date('2026-10-01T00:00:00Z'), quotes: [
    { id: 'q-1', vendorName: 'Acme', quoteAmount: 100, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', terms: [] },
    { id: 'q-2', vendorName: 'Beta', quoteAmount: 120, currency: 'USD', decision: 'REJECTED', isSelected: false, readinessStage: 'NEEDS_SCOPE_REVIEW', terms: [] },
  ] });
  quoteService.getWorkspaceComparability = async () => ({ status: 'COMPARABLE', eligibleQuoteIds: ['q-1'], reasons: [] });
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
      [['quote-comparison-add-quote', OP, M.ADD, command.QUOTE_WORKSPACE_ENTITY_TYPE, 'ws-1']]);
    const manage = result.blocks.find((b) => b.id === 'quote-review-manage');
    const byId = Object.fromEntries(manage.sections[0].items.map((i) => [i.id, i]));
    assert.equal(byId['q-1'].entityType, command.QUOTE_ENTITY_TYPE);
    assert.deepEqual(byId['q-1'].actions.map((a) => a.id), ['quote-comparison-select-quote', 'quote-comparison-reject-quote', 'quote-comparison-remove-quote']);
    assert.deepEqual(byId['q-2'].actions.map((a) => a.id), ['quote-comparison-restore-quote', 'quote-comparison-remove-quote'], 'a rejected, not-ready proposal can be returned or removed, not selected');
    assert.ok(byId['q-1'].actions.every((a) => a.operationId === OP));

    for (const [role, outcome] of [['VIEWER', 'OPEN'], ['CONTRIBUTOR', 'DECLINED']]) {
      const other = await review(role, outcome);
      assert.deepEqual(other.blocks.find((b) => b.id === 'quote-review-summary').actions, [], `${role}/${outcome}`);
      assert.equal(other.blocks.some((b) => b.id === 'quote-review-manage'), false, `${role}/${outcome}`);
    }
  } finally { restore(); }
});
