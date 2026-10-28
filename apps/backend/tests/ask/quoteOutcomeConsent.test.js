const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Owner-only outcome-sharing consent for a quote decision, from Ask (FRD v1.460; owner ruling D1, 2026-10-28). No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { isAskActionAllowedForHouseholdRole } = require('../../src/services/ask/askAudiencePresentation.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const quoteService = require('../../src/services/quoteComparison.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const command = require('../../src/services/ask/support/quoteComparisonCommand.ts');
const handler = require('../../src/services/ask/handlers/quoteComparisonCommands.handler.ts');
const copy = require('../../src/services/quoteOutcomeConsentCopy.ts');

const OP = 'QUOTE_COMPARISON_COMMAND';
const M = command.QUOTE_COMMAND_MESSAGES;
const ID = command.QUOTE_COMMAND_ACTION_IDS.CONSENT;
const WORKSPACE = { id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', serviceCategory: 'ROOFING', scopeSummary: 'Roof', updatedAt: new Date('2026-10-01T00:00:00Z'), selectedQuoteId: null };
const OFF = { outcomeMeasurementConsentedAt: null, outcomeMeasurementConsentRevokedAt: null };
const ON = { outcomeMeasurementConsentedAt: new Date('2026-10-02T00:00:00Z'), outcomeMeasurementConsentRevokedAt: null };
const REVOKED = { outcomeMeasurementConsentedAt: new Date('2026-10-02T00:00:00Z'), outcomeMeasurementConsentRevokedAt: new Date('2026-10-03T00:00:00Z') };

function withRole(role) {
  const saved = propertyAccess.resolvePropertyAccess;
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
  return () => { propertyAccess.resolvePropertyAccess = saved; };
}
function withWorkspace(workspace = WORKSPACE, consent = OFF) {
  const saved = prisma.quoteComparisonWorkspace;
  const state = { consent };
  prisma.quoteComparisonWorkspace = { findFirst: async (args) => (args.where.id === workspace.id && args.where.propertyId === 'prop-1' ? { ...workspace, ...state.consent } : null) };
  return { state, restore() { prisma.quoteComparisonWorkspace = saved; } };
}
const invoke = (role = 'OWNER') => capabilityInvoke(OP, { userId: 'user-1', propertyId: 'prop-1', message: M.CONSENT, launchContext: { operationId: OP, surface: 'ASK_PAGE', entityType: command.QUOTE_WORKSPACE_ENTITY_TYPE, entityId: 'ws-1' } }, { propertyAccess: { role } });
const ctx = (parameters, role = 'OWNER') => ({ userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role }, parameters, command: getAskDomainCommandByOperation(OP) });
const versionFor = (workspace) => handler.quoteCommandContextVersion(workspace, null);
function installWrite() {
  const savedSet = quoteService.setServiceQuoteOutcomeMeasurementConsent; const savedCompliance = compliance.assertProjectComplianceDecisionsApplicable; const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  const calls = [];
  quoteService.setServiceQuoteOutcomeMeasurementConsent = async (...a) => { calls.push(['set', ...a]); return {}; };
  compliance.assertProjectComplianceDecisionsApplicable = async () => { calls.push(['compliance']); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { calls, restore() { quoteService.setServiceQuoteOutcomeMeasurementConsent = savedSet; compliance.assertProjectComplianceDecisionsApplicable = savedCompliance; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; } };
}

test('the Desktop page shows the canonical consent wording, so the two surfaces cannot drift', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonWorkspaceClient.tsx'), 'utf8')
    .replace(/&apos;/g, '’').replace(/'/g, '’').replace(/\s+/g, ' ');
  const flat = (text) => text.replace(/'/g, '’').replace(/\s+/g, ' ');
  for (const key of ['title', 'scope', 'exclusions', 'revocation', 'ownerOnly']) assert.ok(page.includes(flat(copy.SERVICE_QUOTE_OUTCOME_CONSENT_COPY[key])), `Desktop copy drifted from the canonical ${key}`);
  assert.ok(page.includes(copy.SERVICE_QUOTE_OUTCOME_POLICY_VERSION), 'Desktop sends the canonical policy version');
});

test('the command is declared-action only and its action is allowlisted for the owner and refused to a contributor', () => {
  assert.notEqual(resolveAskRoutingCascade(M.CONSENT, { localRoutingEnabled: true }).operation?.operationId, OP);
  assert.equal(command.quoteCommandKindFromMessage(M.CONSENT), 'CONSENT');
  const action = { id: ID, label: 'Share outcomes', interactionType: 'START_WORKFLOW', message: M.CONSENT, operationId: OP, style: 'QUIET' };
  assert.equal(isAskActionApplicable({ action, operationId: 'QUOTE_COMPARISON_REVIEW', propertyId: 'prop-1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'OWNER'), true);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'CONTRIBUTOR'), false);
  assert.equal(isAskActionAllowedForHouseholdRole(action, 'VIEWER'), false);
});

async function review(role, consent) {
  const savedWs = prisma.quoteComparisonWorkspace; const savedGet = quoteService.getQuoteComparisonWorkspace; const savedCompare = quoteService.getWorkspaceComparability;
  prisma.quoteComparisonWorkspace = { findFirst: async () => ({ id: 'ws-1', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', selectedQuoteId: null, ...consent }), findMany: async () => [] };
  quoteService.getQuoteComparisonWorkspace = async () => ({ updatedAt: new Date('2026-10-01T00:00:00Z'), quotes: [{ id: 'q-1', vendorName: 'Acme', quoteAmount: 100, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', terms: [] }] });
  quoteService.getWorkspaceComparability = async () => ({ status: 'COMPARABLE', eligibleQuoteIds: ['q-1'], reasons: [] });
  try {
    return await capabilityInvoke('QUOTE_COMPARISON_REVIEW', { userId: 'user-1', propertyId: 'prop-1', message: 'Compare my service quotes', launchContext: null }, { propertyAccess: { role } });
  } finally { prisma.quoteComparisonWorkspace = savedWs; quoteService.getQuoteComparisonWorkspace = savedGet; quoteService.getWorkspaceComparability = savedCompare; }
}

test('the review offers the sharing choice to the owner only, off by default, and says which way it is set', async () => {
  const restore = withRole('OWNER');
  try {
    const off = (await review('OWNER', OFF)).blocks.find((b) => b.id === 'quote-review-outcome-sharing');
    assert.ok(off);
    assert.equal(off.title, copy.SERVICE_QUOTE_OUTCOME_CONSENT_COPY.title);
    assert.match(off.body, /never included/);
    assert.match(off.body, /Sharing is off\./);
    assert.deepEqual(off.actions.map((a) => [a.id, a.label, a.message, a.entityType, a.entityId, a.operationId]), [[ID, 'Share outcomes', M.CONSENT, command.QUOTE_WORKSPACE_ENTITY_TYPE, 'ws-1', OP]]);
    const on = (await review('OWNER', ON)).blocks.find((b) => b.id === 'quote-review-outcome-sharing');
    assert.match(on.body, /Sharing is on\./);
    assert.equal(on.actions[0].label, 'Stop sharing outcomes');
    assert.equal((await review('OWNER', REVOKED)).blocks.find((b) => b.id === 'quote-review-outcome-sharing').actions[0].label, 'Share outcomes', 'a revoked consent reads as off');
    for (const role of ['CONTRIBUTOR', 'VIEWER']) assert.equal((await review(role, OFF)).blocks.some((b) => b.id === 'quote-review-outcome-sharing'), false, role);
  } finally { restore(); }
});

test('the owner reviews turning sharing on, with exactly what is shared and never included; nothing is written yet', async () => {
  const restoreRole = withRole('OWNER'); const ws = withWorkspace(); const w = installWrite();
  try {
    const result = await invoke('OWNER');
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.reasonCode, 'QUOTE_CONSENT_CONFIRMATION_REQUIRED');
    assert.deepEqual(result.parameters.quoteConsent, { consented: true });
    assert.equal(result.confirmation.confirmLabel, 'Share outcome');
    assert.match(result.confirmation.description, /Estimates, contractor notes, and quote text are never included/);
    assert.match(result.confirmation.description, /does not affect recommendations or booking/);
    const fields = Object.fromEntries(result.confirmation.fields.map((f) => [f.label, f.value]));
    assert.match(fields['Shared if you agree'], /final price and material change-order totals/);
    assert.equal(fields.Policy, 'service-quote-outcomes-v1');
    assert.equal(result.captureRequests, undefined, 'no pre-filled or inferred answer');
    assert.deepEqual(w.calls, []);
  } finally { w.restore(); ws.restore(); restoreRole(); }
});

test('with sharing on, the same action reviews turning it off and says it only stops future capture', async () => {
  const restoreRole = withRole('OWNER'); const ws = withWorkspace(WORKSPACE, ON);
  try {
    const result = await invoke('OWNER');
    assert.deepEqual(result.parameters.quoteConsent, { consented: false });
    assert.equal(result.confirmation.confirmLabel, 'Stop sharing');
    assert.match(result.confirmation.description, /stops future capture/);
  } finally { ws.restore(); restoreRole(); }
});

test('a contributor and a viewer are refused and nothing is prepared; a closed decision still allows the owner to change it', async () => {
  let ws = withWorkspace();
  try {
    for (const role of ['CONTRIBUTOR', 'VIEWER']) {
      const restoreRole = withRole(role);
      try {
        const result = await invoke(role);
        assert.equal(result.reasonCode, 'ASK_PERMISSION_REQUIRED', role);
        assert.equal(result.confirmation, undefined, role);
      } finally { restoreRole(); }
    }
  } finally { ws.restore(); }
  const restoreOwner = withRole('OWNER');
  ws = withWorkspace({ ...WORKSPACE, outcome: 'DECLINED' });
  try { assert.equal((await invoke('OWNER')).status, 'NEEDS_CONFIRMATION', 'closed decision'); } finally { ws.restore(); restoreOwner(); }
});

test('confirming writes the canonical consent with only the fixed fields and the canonical policy version', async () => {
  const ws = withWorkspace(); const w = installWrite();
  try {
    const out = await confirmCapabilityInvoke(OP, ctx({ quoteConsent: { consented: true }, quoteCommand: { kind: 'CONSENT', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE) }));
    assert.deepEqual(w.calls, [['compliance'], ['set', 'prop-1', 'ws-1', 'user-1', { consented: true, finalPrice: true, changeOrders: true, policyVersion: 'service-quote-outcomes-v1' }]]);
    assert.equal(out.result.blocks[0].title, 'Outcome sharing is on');
    assert.equal(out.artifactType, 'QUOTE_COMPARISON_WORKSPACE');

    ws.state.consent = ON; w.calls.length = 0;
    const off = await confirmCapabilityInvoke(OP, ctx({ quoteConsent: { consented: false }, quoteCommand: { kind: 'CONSENT', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE) }));
    assert.equal(w.calls[1][4].consented, false);
    assert.equal(off.result.blocks[0].title, 'Outcome sharing is off');
    assert.match(off.result.blocks[0].description, /Recommendations and booking are unaffected/);
  } finally { w.restore(); ws.restore(); }
});

test('confirming is refused for a non-owner, an invalid choice, a choice already in effect, or a comparison that changed', async () => {
  const ws = withWorkspace(); const w = installWrite();
  const base = { quoteCommand: { kind: 'CONSENT', entityId: 'ws-1' }, quoteCommandContextVersion: versionFor(WORKSPACE) };
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, quoteConsent: { consented: true } }, 'CONTRIBUTOR')), /owner/);
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, quoteConsent: { consented: 'yes' } })), /invalid/);
    ws.state.consent = ON;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, quoteConsent: { consented: true } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    ws.state.consent = OFF;
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ ...base, quoteCommandContextVersion: 'stale', quoteConsent: { consented: true } })), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
    assert.deepEqual(w.calls.filter((c) => c[0] === 'set'), [], 'nothing was written');
  } finally { w.restore(); ws.restore(); }
});
