const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Reviewing a quote comparison that is not the most recent one (FRD v1.464). The review defaulted to the latest workspace with no way to reach an
// earlier decision. The real registered `quote-comparison.review` handler runs against a stubbed workspace table and the canonical service reads.
// No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { refreshLaunchContext } = require('../../src/services/ask/execution/executeOperation.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const quoteService = require('../../src/services/quoteComparison.service.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const command = require('../../src/services/ask/support/quoteComparisonCommand.ts');
const handler = require('../../src/services/ask/handlers/quoteComparisonCommands.handler.ts');

const WS = { type: command.QUOTE_WORKSPACE_ENTITY_TYPE };
const day = (d) => new Date(`2026-${d}T00:00:00Z`);
// Newest first, as the handler asks for it.
const WORKSPACES = [
  { id: 'ws-new', outcome: 'OPEN', journeyStage: 'SCOPE_REVIEW', serviceCategory: 'ROOFING', scopeSummary: 'Roof', updatedAt: day('10-20'), selectedQuoteId: null, _count: { quotes: 3 } },
  { id: 'ws-mid', outcome: 'DECLINED', journeyStage: 'CLOSED', serviceCategory: 'PLUMBING', scopeSummary: null, updatedAt: day('09-10'), selectedQuoteId: null, _count: { quotes: 1 } },
  { id: 'ws-old', outcome: 'OPEN', journeyStage: 'QUOTE_INTAKE', serviceCategory: 'HVAC', scopeSummary: 'Furnace', updatedAt: day('06-01'), selectedQuoteId: null, _count: { quotes: 2 } },
];
const original = { ws: prisma.quoteComparisonWorkspace, get: quoteService.getQuoteComparisonWorkspace, cmp: quoteService.getWorkspaceComparability, access: propertyAccess.resolvePropertyAccess };
let reads; let role;
function install(rows = WORKSPACES, foreign = new Set()) {
  reads = [];
  role = 'CONTRIBUTOR';
  prisma.quoteComparisonWorkspace = {
    findFirst: async ({ where }) => {
      if (where.propertyId !== 'prop-1') return null;
      const row = where.id ? rows.find((r) => r.id === where.id && !foreign.has(r.id)) : rows[0];
      return row ? { ...row, outcomeMeasurementConsentedAt: null, outcomeMeasurementConsentRevokedAt: null } : null;
    },
    findMany: async ({ where, take }) => rows.filter((r) => r.id !== where.id.not).slice(0, take),
  };
  quoteService.getQuoteComparisonWorkspace = async (_property, id) => { reads.push(id); return { updatedAt: new Date('2026-10-01T00:00:00Z'), quotes: [{ id: `q-${id}`, vendorName: `Vendor ${id}`, quoteAmount: 100, currency: 'USD', decision: 'UNDECIDED', isSelected: false, readinessStage: 'COMPARISON_READY', terms: [] }] }; };
  quoteService.getWorkspaceComparability = async () => ({ status: 'COMPARABLE', eligibleQuoteIds: [], reasons: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'user-1', propertyId: 'prop-1' });
}
test.beforeEach(() => install());
test.afterEach(() => { prisma.quoteComparisonWorkspace = original.ws; quoteService.getQuoteComparisonWorkspace = original.get; quoteService.getWorkspaceComparability = original.cmp; propertyAccess.resolvePropertyAccess = original.access; });

const review = (launchContext = null, accessRole = 'CONTRIBUTOR') => capabilityInvoke('QUOTE_COMPARISON_REVIEW', { userId: 'user-1', propertyId: 'prop-1', message: 'Compare my service quotes', launchContext }, { propertyAccess: { role: accessRole } });
const focus = (entityId, over = {}) => ({ operationId: 'QUOTE_COMPARISON_REVIEW', surface: 'ASK_WORKSPACE', entityType: WS.type, entityId, ...over });
const block = (result, id) => result.blocks.find((b) => b.id === id);
const summaryActions = (result) => block(result, 'quote-review-summary').actions.filter((a) => a.operationId === 'QUOTE_COMPARISON_COMMAND').map((a) => a.entityId);

test('by default the latest comparison is shown, with the others listed and openable', async () => {
  const result = await review();
  assert.deepEqual(reads, ['ws-new']);
  assert.doesNotMatch(block(result, 'quote-review-summary').body, /earlier comparison/);
  const list = block(result, 'quote-review-other-comparisons');
  assert.equal(list.title, 'Earlier comparisons');
  const rows = list.sections[0].items;
  assert.deepEqual(rows.map((r) => r.id), ['ws-mid', 'ws-old']);
  assert.deepEqual(rows[0].meta, ['Closed', 'Declined', '1 proposal', rows[0].meta[3]]);
  assert.match(rows[0].meta[3], /^Updated /);
  assert.equal(rows[0].title, 'Plumbing comparison');
  assert.deepEqual([rows[1].title, rows[1].description, rows[1].entityType], ['Hvac comparison', 'Furnace', command.QUOTE_WORKSPACE_ENTITY_TYPE]);
  assert.deepEqual(rows[0].actions.map((a) => [a.id, a.label, a.message, a.operationId, a.interactionType]), [['quote-comparison-open-workspace', 'Open', 'Compare my service quotes', 'QUOTE_COMPARISON_REVIEW', 'CONVERSATION_CONTINUE']]);
});

test('opening an earlier comparison shows that one, says so, and its controls follow its own state', async () => {
  const old = await review(focus('ws-old'));
  assert.deepEqual(reads, ['ws-old']);
  assert.match(block(old, 'quote-review-summary').body, /^This is an earlier comparison, not your most recent one\./);
  assert.deepEqual(summaryActions(old), ['ws-old', 'ws-old', 'ws-old'], 'its Add, Import and Close act on it, not on the latest');
  const list = block(old, 'quote-review-other-comparisons');
  assert.equal(list.title, 'Your other comparisons');
  assert.deepEqual(list.sections[0].items.map((r) => r.id), ['ws-new', 'ws-mid']);
  assert.ok(list.sections[0].items[0].meta.includes('Most recent'));

  const closed = await review(focus('ws-mid'));
  assert.deepEqual(summaryActions(closed), [], 'a closed decision offers no change controls, as the latest would not');
  assert.ok(block(closed, 'quote-review-summary'));
});

test('an unknown comparison, or one from another home, is reported and never replaced by the latest', async () => {
  for (const id of ['nope', 'ws-old']) {
    install(WORKSPACES, id === 'ws-old' ? new Set(['ws-old']) : new Set());
    const result = await review(focus(id));
    assert.equal(result.reasonCode, 'QUOTE_WORKSPACE_NOT_FOUND', id);
    assert.deepEqual(reads, [], 'no other comparison is read in its place');
    assert.deepEqual(result.blocks[0].actions.map((a) => [a.id, a.message]), [['quote-comparison-open-workspace', 'Compare my service quotes']]);
  }
});

test('a refresh keeps the comparison that was in focus', async () => {
  const preserved = refreshLaunchContext({ id: 'exec-1', launchContextJson: focus('ws-old') });
  assert.deepEqual([preserved.entityType, preserved.entityId, preserved.surface], [WS.type, 'ws-old', 'ASK_REFRESH']);
  await review(preserved);
  assert.deepEqual(reads, ['ws-old']);
});

test('with no other comparison there is no list, and a viewer can open one but is offered no change', async () => {
  install([WORKSPACES[0]]);
  assert.equal(block(await review(), 'quote-review-other-comparisons'), undefined);
  install();
  role = 'VIEWER';
  const viewer = await review(focus('ws-old'), 'VIEWER');
  assert.deepEqual(reads, ['ws-old']);
  assert.deepEqual(summaryActions(viewer), []);
  assert.ok(block(viewer, 'quote-review-other-comparisons'));
});

test('the Open action is allowlisted for the review', () => {
  const action = { id: 'quote-comparison-open-workspace', label: 'Open', interactionType: 'CONVERSATION_CONTINUE', message: 'Compare my service quotes', operationId: 'QUOTE_COMPARISON_REVIEW', style: 'SECONDARY' };
  for (const householdRole of ['VIEWER', 'CONTRIBUTOR', 'OWNER']) {
    assert.equal(isAskActionApplicable({ action, operationId: 'QUOTE_COMPARISON_REVIEW', propertyId: 'prop-1', householdRole, authoritativeSourceAvailable: true }), true, householdRole);
  }
});

test('the receipt of a change returns to the comparison that was changed', async () => {
  const savedSet = quoteService.setServiceQuoteOutcomeMeasurementConsent; const savedCompliance = compliance.assertProjectComplianceDecisionsApplicable; const savedReconcile = executeOperation.reconcileAskExecutionSideEffects;
  quoteService.setServiceQuoteOutcomeMeasurementConsent = async () => ({});
  compliance.assertProjectComplianceDecisionsApplicable = async () => undefined;
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  try {
    const older = WORKSPACES[2];
    prisma.quoteComparisonWorkspace = { findFirst: async ({ where }) => (where.id === older.id ? { ...older, outcomeMeasurementConsentedAt: null, outcomeMeasurementConsentRevokedAt: null } : null) };
    const out = await confirmCapabilityInvoke('QUOTE_COMPARISON_COMMAND', {
      userId: 'user-1', execution: { id: 'exec-1', propertyId: 'prop-1', createdAt: new Date() }, access: { role: 'OWNER' }, command: getAskDomainCommandByOperation('QUOTE_COMPARISON_COMMAND'),
      parameters: { quoteConsent: { consented: true }, quoteCommand: { kind: 'CONSENT', entityId: older.id }, quoteCommandContextVersion: handler.quoteCommandContextVersion(older, null) },
    });
    const back = out.result.blocks[0].actions[0];
    assert.deepEqual([back.entityType, back.entityId, back.operationId, back.message], [WS.type, 'ws-old', 'QUOTE_COMPARISON_REVIEW', 'Compare my service quotes']);
  } finally { quoteService.setServiceQuoteOutcomeMeasurementConsent = savedSet; compliance.assertProjectComplianceDecisionsApplicable = savedCompliance; executeOperation.reconcileAskExecutionSideEffects = savedReconcile; }
});
