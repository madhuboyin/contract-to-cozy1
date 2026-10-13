const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Register P0 "Price Finalization": record, change and finalize an accepted price from Ask (FRD v1.311). No database, browser or native module.

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
const finalizationService = require('../../src/services/priceFinalization.service.ts').priceFinalizationService;
const operations = require('../../src/services/priceFinalizationOperations.ts');
const command = require('../../src/services/ask/support/priceFinalizationCommand.ts');
const handler = require('../../src/services/ask/handlers/priceFinalizationCommands.handler.ts');
const { priceFinalizationsFromView } = require('../../src/services/ask/handlers/priceFinalization.handler.ts');
const { negotiationShieldReviewFromView } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');

const OP = 'PRICE_FINALIZATION_COMMAND';
const M = command.PRICE_COMMAND_MESSAGES;
const NS_TYPE = 'NEGOTIATION_SHIELD_CASE';
const QC_TYPE = 'QUOTE_COMPARISON_WORKSPACE';
const DRAFT = {
  id: 'pf-1', status: 'DRAFT', sourceType: 'MANUAL', vendorName: 'Acme Roofing', quotePrice: 12000, acceptedPrice: null, scopeSummary: 'Tear off', paymentTerms: null,
  warrantyTerms: '5 years', timelineTerms: null, notes: null, updatedAt: '2026-10-02T00:00:00.000Z', quoteComparisonWorkspaceId: null, terms: [], serviceCategory: 'ROOFING',
};

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withData({ primary = true, record = DRAFT, openDraft = null, nsCase = { id: 'ns-1', title: 'Roof quote' }, workspace = null } = {}) {
  const saved = { property: prisma.property, ns: prisma.negotiationShieldCase, pf: prisma.priceFinalization, qc: prisma.quoteComparisonWorkspace, detail: finalizationService.getDetail };
  prisma.property = { findFirst: async () => (primary ? { id: 'prop-1' } : null) };
  prisma.negotiationShieldCase = { findFirst: async (args) => (nsCase && args.where.id === nsCase.id ? nsCase : null) };
  prisma.priceFinalization = { findFirst: async () => openDraft };
  prisma.quoteComparisonWorkspace = { findFirst: async (args) => (workspace && args.where.id === workspace.id ? workspace : null) };
  finalizationService.getDetail = async (_p, _u, id) => {
    if (!record || id !== record.id) { const { APIError } = require('../../src/middleware/error.middleware.ts'); throw new APIError('not found', 404, 'NOT_FOUND'); }
    return record;
  };
  return () => { prisma.property = saved.property; prisma.negotiationShieldCase = saved.ns; prisma.priceFinalization = saved.pf; prisma.quoteComparisonWorkspace = saved.qc; finalizationService.getDetail = saved.detail; };
}
const invoke = (message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message, launchContext }, { propertyAccess: { role } });
const launchFor = (kind, entityId, over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityId, entityType: command.priceCommandEntityType(kind, NS_TYPE, QC_TYPE), ...over });

// ───────────────────────────── input ─────────────────────────────

test('a start needs a vendor; a finalize needs a positive accepted price; amounts are rounded to cents; unknown fields are refused', () => {
  assert.deepEqual(command.parsePriceFormAnswer('START', { quotePrice: 10 }), { success: false, reason: 'VENDOR_REQUIRED' });
  const ok = command.parsePriceFormAnswer('START', { vendorName: ' Acme ', quotePrice: '1200.555', acceptedPrice: '', scopeSummary: 'Roof' });
  assert.equal(ok.success, true);
  assert.deepEqual([ok.data.vendorName, ok.data.quotePrice, ok.data.acceptedPrice, ok.data.scopeSummary], ['Acme', 1200.56, null, 'Roof']);
  assert.equal(command.parsePriceFormAnswer('START', { vendorName: 'A', sourceType: 'MANUAL' }).success, false);
  assert.equal(command.parsePriceFormAnswer('FINALIZE', { acceptedPrice: 0 }).success, false);
  assert.equal(command.parsePriceFormAnswer('FINALIZE', { acceptedPrice: -5 }).success, false);
  assert.deepEqual(command.parsePriceFormAnswer('FINALIZE', { acceptedPrice: '11500' }), { success: true, data: { acceptedPrice: 11500 } });
  assert.equal(command.parsePriceFormAnswer('EDIT', { acceptedPrice: 0 }).success, false, 'zero is not an accepted price');
});

test('the canonical start input is a USD record with only what was entered, bound to the review when there is one', () => {
  const parsed = command.parsePriceFormAnswer('START', { vendorName: 'Acme', acceptedPrice: 11500, paymentTerms: '50% upfront' });
  assert.deepEqual(command.priceStartInput('START_NS', parsed.data, 'ns-1'), {
    sourceType: 'NEGOTIATION_SHIELD', negotiationShieldCaseId: 'ns-1', currency: 'USD', vendorName: 'Acme', acceptedPrice: 11500, paymentTerms: '50% upfront',
  });
  assert.equal('negotiationShieldCaseId' in command.priceStartInput('START_MANUAL', parsed.data), false);
});

test('term changes list exactly the fields that differ', () => {
  const before = { vendorName: 'A', quotePrice: 100, acceptedPrice: null, scopeSummary: null, paymentTerms: null, warrantyTerms: 'x', timelineTerms: null, notes: null };
  const changes = command.priceTermChanges(before, { ...before, acceptedPrice: 90, warrantyTerms: null });
  assert.deepEqual(changes.map((c) => [c.field, c.before, c.after]), [['acceptedPrice', null, '90'], ['warrantyTerms', 'x', null]]);
});

// ───────────────────────────── routing and the command ─────────────────────────────

test('declared-action only: no typed message reaches the command, and it is a registered contributor command', () => {
  for (const message of Object.values(M)) assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  assert.equal(getAskDomainCommandByOperation(OP).roleFloor, 'CONTRIBUTOR');
  assert.equal(getAskDomainCommandByOperation(OP).adapterKey, 'price-finalization.command');
});

test('a review start opens the form; a viewer, a non-owner member, a refresh, a wrong entity and a missing review are refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); let restoreData = withData();
  try {
    const form = await invoke(M.START_NS, launchFor('START_NS', 'ns-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.equal(form.captureRequests[0].captureKey, command.PRICE_FORM_CAPTURE_KEYS.START);
    assert.deepEqual(form.captureRequests[0].inputSchema.fields.map((f) => f.key), ['vendorName', 'quotePrice', 'acceptedPrice', 'scopeSummary', 'paymentTerms', 'warrantyTerms', 'timelineTerms', 'notes']);
    assert.deepEqual(form.parameters.priceCommandLaunch, { kind: 'START_NS', entityId: 'ns-1', sourceExecutionId: null });

    assert.equal((await invoke(M.START_NS, launchFor('START_NS', 'ns-1', { surface: 'ASK_REFRESH' }))).reasonCode, 'ASK_PRICE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START_NS, launchFor('START_NS', 'ns-1', { entityType: command.PRICE_FINALIZATION_ENTITY_TYPE }))).reasonCode, 'ASK_PRICE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke('record a price', launchFor('START_NS', 'ns-1'))).reasonCode, 'ASK_PRICE_COMMAND_NOT_DIRECTLY_ROUTABLE');
    assert.equal((await invoke(M.START_NS, launchFor('START_NS', 'other'))).reasonCode, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    assert.equal((await invoke(M.START_NS, launchFor('START_NS', 'ns-1'), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
    restoreData();
    restoreData = withData({ primary: false });
    assert.equal((await invoke(M.START_NS, launchFor('START_NS', 'ns-1'))).reasonCode, 'PRICE_FINALIZATION_PRIMARY_OWNER_ONLY');
  } finally { restoreData(); restoreRole(); }
});

test('an open draft for the same review is offered for change instead of a form the create would discard', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData({ openDraft: { id: 'pf-9', vendorName: 'Acme' } });
  try {
    const result = await invoke(M.START_NS, launchFor('START_NS', 'ns-1'));
    assert.equal(result.reasonCode, 'PRICE_FINALIZATION_DRAFT_EXISTS');
    const [change] = result.blocks[0].actions;
    assert.deepEqual([change.id, change.entityType, change.entityId, change.operationId], ['price-finalization-edit', 'PRICE_FINALIZATION', 'pf-9', OP]);
  } finally { restoreData(); restoreRole(); }
});

test('a start from a comparison needs a selected proposal, then is prefilled and confirmed with no form', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    let restoreData = withData({ workspace: { id: 'ws-1', outcome: 'OPEN', selectedQuote: null } });
    assert.equal((await invoke(M.START_QUOTE, launchFor('START_QUOTE', 'ws-1'))).reasonCode, 'PRICE_FINALIZATION_QUOTE_SELECTION_REQUIRED');
    restoreData();
    restoreData = withData({ workspace: { id: 'ws-1', outcome: 'OPEN', selectedQuote: { id: 'q-1', vendorName: 'Acme Roofing', quoteAmount: 12000 } } });
    const result = await invoke(M.START_QUOTE, launchFor('START_QUOTE', 'ws-1'));
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.match(result.confirmation.description, /does not accept the quote, book work or contact anyone/);
    assert.deepEqual(result.confirmation.fields.map((f) => f.label), ['Vendor', 'Quoted price']);
    restoreData();
  } finally { restoreRole(); }
});

test('a submitted start is reviewed in full and nothing is written yet', async () => {
  const restoreRole = withRole('CONTRIBUTOR'); const restoreData = withData();
  const saved = operations.createPriceFinalizationDraftWithEffects; let created = 0;
  operations.createPriceFinalizationDraftWithEffects = async () => { created += 1; return {}; };
  try {
    const parsed = command.parsePriceFormAnswer('START', { vendorName: 'Acme Roofing', acceptedPrice: 11500, warrantyTerms: '10 years' });
    const result = await handler.priceCommandResult('user-1', 'prop-1', { kind: 'START_NS', entityId: 'ns-1', sourceExecutionId: null }, parsed.data);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.deepEqual([fields.Vendor, fields['Accepted price'], fields.Warranty, fields.From], ['Acme Roofing', '$11,500', '10 years', 'Negotiation review: Roof quote']);
    assert.match(result.confirmation.description, /does not book work, pay anyone or contact the vendor/);
    assert.equal(created, 0);
  } finally { operations.createPriceFinalizationDraftWithEffects = saved; restoreData(); restoreRole(); }
});

test('Change lists each field before -> after; Finalize shows the price and says what it does and does not do; a finalized record is refused', async () => {
  const restoreRole = withRole('CONTRIBUTOR');
  try {
    let restoreData = withData();
    const open = await invoke(M.EDIT, launchFor('EDIT', 'pf-1'));
    assert.equal(open.status, 'NEEDS_CONTEXT');
    assert.equal(open.captureRequests[0].currentAnswer.vendorName, 'Acme Roofing');
    const parsed = command.parsePriceFormAnswer('EDIT', { vendorName: 'Acme Roofing', quotePrice: 12000, acceptedPrice: 11500, scopeSummary: 'Tear off', warrantyTerms: '5 years' });
    const review = await handler.priceCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'pf-1', sourceExecutionId: null }, parsed.data);
    assert.deepEqual(review.confirmation.fields.map((f) => [f.label, f.value]), [['Accepted price', 'None → $11,500']]);
    const none = await handler.priceCommandResult('user-1', 'prop-1', { kind: 'EDIT', entityId: 'pf-1', sourceExecutionId: null },
      command.parsePriceFormAnswer('EDIT', { vendorName: 'Acme Roofing', quotePrice: 12000, scopeSummary: 'Tear off', warrantyTerms: '5 years' }).data);
    assert.equal(none.reasonCode, 'PRICE_EDIT_NO_CHANGE');

    const form = await invoke(M.FINALIZE, launchFor('FINALIZE', 'pf-1'));
    assert.equal(form.status, 'NEEDS_CONTEXT');
    assert.deepEqual(form.captureRequests[0].currentAnswer, { acceptedPrice: 12000 }, 'prefilled from the quoted price');
    const finalize = await handler.priceCommandResult('user-1', 'prop-1', { kind: 'FINALIZE', entityId: 'pf-1', sourceExecutionId: null }, { acceptedPrice: 11500 });
    assert.match(finalize.confirmation.title, /Finalize \$11,500 with Acme Roofing/);
    assert.match(finalize.confirmation.description, /does not book work, pay anyone or contact the vendor/);
    assert.doesNotMatch(finalize.confirmation.description, /marked accepted/, 'a manual record has no comparison to update');
    restoreData();

    restoreData = withData({ record: { ...DRAFT, sourceType: 'QUOTE_COMPARISON', quoteComparisonWorkspaceId: 'ws-1' } });
    const crossTool = await handler.priceCommandResult('user-1', 'prop-1', { kind: 'FINALIZE', entityId: 'pf-1', sourceExecutionId: null }, { acceptedPrice: 11500 });
    assert.match(crossTool.confirmation.description, /marked accepted and the others are marked rejected/);
    restoreData();

    restoreData = withData({ record: { ...DRAFT, status: 'FINALIZED' } });
    assert.equal((await invoke(M.FINALIZE, launchFor('FINALIZE', 'pf-1'))).reasonCode, 'PRICE_FINALIZATION_ALREADY_FINALIZED');
    restoreData();
  } finally { restoreRole(); }
});

// ───────────────────────────── the confirmed writes ─────────────────────────────

const ctx = (parameters) => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
function installWrites() {
  const saved = { c: operations.createPriceFinalizationDraftWithEffects, u: operations.updatePriceFinalizationDraftWithEffects, f: operations.finalizePriceFinalizationWithEffects, r: executeOperation.reconcileAskExecutionSideEffects };
  const calls = [];
  const detail = { id: 'pf-new', vendorName: 'Acme Roofing', acceptedPrice: 11500 };
  operations.createPriceFinalizationDraftWithEffects = async (...a) => { calls.push(['create', ...a]); return { detail, contextVersion: 'v' }; };
  operations.updatePriceFinalizationDraftWithEffects = async (...a) => { calls.push(['update', ...a]); return { detail, contextVersion: 'v' }; };
  operations.finalizePriceFinalizationWithEffects = async (...a) => { calls.push(['finalize', ...a]); return { detail, contextVersion: 'v' }; };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { operations.createPriceFinalizationDraftWithEffects = saved.c; operations.updatePriceFinalizationDraftWithEffects = saved.u; operations.finalizePriceFinalizationWithEffects = saved.f; executeOperation.reconcileAskExecutionSideEffects = saved.r; } };
}
const version = (record) => handler.priceCommandContextVersion([record.id, record.updatedAt, record.status, record.acceptedPrice, record.vendorName]);

test('confirming a start creates the draft through the shared create, bound to the review, and offers Finalize and Change', async () => {
  const restoreData = withData(); const w = installWrites();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({ priceStart: { vendorName: 'Acme Roofing', quotePrice: null, acceptedPrice: 11500, scopeSummary: null, paymentTerms: null, warrantyTerms: null, timelineTerms: null, notes: null },
      priceCommand: { kind: 'START_NS', entityId: 'ns-1' } }));
    const [, propertyId, userId, payload] = w.calls[0];
    assert.deepEqual([w.calls[0][0], propertyId, userId], ['create', 'prop-1', 'user-1']);
    assert.deepEqual(payload, { sourceType: 'NEGOTIATION_SHIELD', negotiationShieldCaseId: 'ns-1', currency: 'USD', vendorName: 'Acme Roofing', acceptedPrice: 11500 });
    assert.equal(out.artifactId, 'pf-new');
    assert.deepEqual(out.result.blocks[0].actions.map((a) => a.id), ['price-finalization-finalize', 'price-finalization-edit']);
    assert.match(out.result.blocks[0].description, /Nothing is finalized, booked or sent/);
  } finally { w.restore(); restoreData(); }
});

test('confirming a quote start sends only the comparison, so the canonical create prefills from the selected proposal', async () => {
  const restoreData = withData(); const w = installWrites();
  try {
    await confirmCapabilityInvoke(OP, ctx({ priceCommand: { kind: 'START_QUOTE', entityId: 'ws-1' } }));
    assert.deepEqual(w.calls[0].slice(3), [{ sourceType: 'QUOTE_COMPARISON', quoteComparisonWorkspaceId: 'ws-1' }]);
  } finally { w.restore(); restoreData(); }
});

test('confirming Change sends only the changed fields; confirming Finalize sends the accepted price', async () => {
  const restoreData = withData(); const w = installWrites();
  try {
    await confirmCapabilityInvoke(OP, ctx({
      priceEdit: { vendorName: 'Acme Roofing', quotePrice: 12000, acceptedPrice: 11500, scopeSummary: 'Tear off', paymentTerms: null, warrantyTerms: '5 years', timelineTerms: null, notes: null },
      priceCommand: { kind: 'EDIT', entityId: 'pf-1' }, priceCommandContextVersion: version(DRAFT),
    }));
    assert.deepEqual(w.calls[0], ['update', 'prop-1', 'user-1', 'pf-1', { acceptedPrice: 11500 }]);
    await confirmCapabilityInvoke(OP, ctx({ priceFinalize: { acceptedPrice: 11500 }, priceCommand: { kind: 'FINALIZE', entityId: 'pf-1' }, priceCommandContextVersion: version(DRAFT) }));
    assert.deepEqual(w.calls[1], ['finalize', 'prop-1', 'user-1', 'pf-1', { acceptedPrice: 11500 }]);
  } finally { w.restore(); restoreData(); }
});

test('a confirmation is refused, with nothing written, when the record changed, left draft, was tampered with, or an open draft appeared', async () => {
  const w = installWrites();
  try {
    let restoreData = withData();
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceFinalize: { acceptedPrice: 11500 }, priceCommand: { kind: 'FINALIZE', entityId: 'pf-1' }, priceCommandContextVersion: 'old' })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceFinalize: { acceptedPrice: 0 }, priceCommand: { kind: 'FINALIZE', entityId: 'pf-1' }, priceCommandContextVersion: version(DRAFT) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceCommand: { kind: 'DELETE', entityId: 'pf-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceStart: { vendorName: '' }, priceCommand: { kind: 'START_MANUAL', entityId: 'prop-1' } })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restoreData();
    restoreData = withData({ openDraft: { id: 'pf-9' } });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceCommand: { kind: 'START_QUOTE', entityId: 'ws-1' } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    restoreData();
    restoreData = withData({ record: { ...DRAFT, status: 'FINALIZED' } });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceFinalize: { acceptedPrice: 1 }, priceCommand: { kind: 'FINALIZE', entityId: 'pf-1' }, priceCommandContextVersion: version({ ...DRAFT, status: 'FINALIZED' }) })), (e) => e.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    restoreData();
    restoreData = withData({ primary: false });
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ priceCommand: { kind: 'START_QUOTE', entityId: 'ws-1' } })), (e) => e.code === 'ASK_PERMISSION_REQUIRED');
    restoreData();
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

// ───────────────────────────── the answers' actions ─────────────────────────────

const RECORD_VIEW = { id: 'pf-1', status: 'DRAFT', vendorName: 'Acme', serviceCategory: 'ROOFING', acceptedPrice: null, quotePrice: 12000, sourceType: 'MANUAL', scopeSummary: null, paymentTerms: null, warrantyTerms: null, timelineTerms: null, finalizedAt: null, bookingId: null };

test('the price records answer offers a contributor Record an accepted price and Finalize / Change on a draft, and a viewer nothing', () => {
  const withActions = priceFinalizationsFromView([RECORD_VIEW, { ...RECORD_VIEW, id: 'pf-2', status: 'FINALIZED', acceptedPrice: 11000 }], 'prop-1', true);
  const summary = withActions.blocks.find((b) => b.id === 'price-finalization-summary');
  assert.deepEqual(summary.actions.map((a) => [a.id, a.entityType, a.entityId]), [['price-finalization-start-manual', command.PRICE_FINALIZATION_PROPERTY_ENTITY_TYPE, 'prop-1']]);
  const list = withActions.blocks.find((b) => b.id === 'price-finalization-items');
  const items = Object.fromEntries(list.sections.flatMap((s) => s.items).map((i) => [i.id, i]));
  assert.deepEqual(items['pf-1'].actions.map((a) => a.id), ['price-finalization-finalize', 'price-finalization-edit']);
  assert.equal(items['pf-1'].entityType, 'PRICE_FINALIZATION');
  assert.deepEqual(items['pf-2'].actions, [], 'a finalized record has no row action');

  const viewer = priceFinalizationsFromView([RECORD_VIEW], 'prop-1', false);
  assert.deepEqual(viewer.blocks.find((b) => b.id === 'price-finalization-summary').actions, []);
  assert.deepEqual(viewer.blocks.find((b) => b.id === 'price-finalization-items').sections[0].items[0].actions, []);
  const empty = priceFinalizationsFromView([], 'prop-1', true);
  assert.equal(empty.blocks[0].actions[0].id, 'price-finalization-start-manual');
  assert.doesNotMatch(empty.blocks[0].body, /not currently available in Ask/);
});

test('a vendor-price negotiation review offers Record the accepted price to a contributor, and no other scenario does', () => {
  const review = (scenarioType) => ({
    case: { id: 'ns-1', title: 'Roof quote', scenarioType, status: 'ANALYZED', perspective: 'HOMEOWNER', updatedAt: '2026-10-01T00:00:00.000Z', latestAnalysisAt: null },
    latestAnalysis: null, latestDraft: null, documents: [], hasInput: true, inputsUpdatedAt: null,
  });
  const find = (result) => result.blocks.find((b) => b.id === 'negotiation-shield-finalize');
  const offered = find(negotiationShieldReviewFromView(review('CONTRACTOR_QUOTE_REVIEW'), true));
  assert.deepEqual(offered.actions.map((a) => [a.id, a.operationId, a.message, a.entityType, a.entityId]), [['price-finalization-start-negotiation', OP, M.START_NS, NS_TYPE, 'ns-1']]);
  assert.equal(find(negotiationShieldReviewFromView(review('INSURANCE_PREMIUM_INCREASE'), true)), undefined);
  assert.equal(find(negotiationShieldReviewFromView(review('CONTRACTOR_QUOTE_REVIEW'), false)), undefined);
});

test('every id the answers and the receipt emit is allowlisted for the operation that emits it', () => {
  const applicable = (id, operationId, role = 'CONTRIBUTOR') => isAskActionApplicable({
    action: { id, label: 'x', interactionType: 'START_WORKFLOW', message: 'm', operationId, style: 'PRIMARY' },
    operationId, propertyId: 'prop-1', householdRole: role, authoritativeSourceAvailable: true,
  });
  // The records answer itself has an OWNER floor (the service admits only the primary owner), so its actions are asserted for an owner.
  for (const id of ['price-finalization-start-manual', 'price-finalization-finalize', 'price-finalization-edit']) assert.equal(applicable(id, 'PRICE_FINALIZATIONS_LIST', 'OWNER'), true, id);
  assert.equal(applicable('price-finalization-start-negotiation', 'NEGOTIATION_SHIELD_CASES'), true);
  assert.equal(applicable('price-finalization-start-negotiation', 'NEGOTIATION_SHIELD_CASE_ANALYZE'), true);
  assert.equal(applicable('price-finalization-start-quote', 'QUOTE_COMPARISON_REVIEW'), true);
  for (const id of ['price-finalization-finalize', 'price-finalization-edit', 'price-finalization-back']) assert.equal(applicable(id, OP), true, id);
});
