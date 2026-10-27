const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Quote Comparison parity (FRD v1.455): Desktop's "Prepare negotiation" on the selected proposal. No database, browser or native module.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const projectCompliance = require('../../src/services/projectCompliance/context.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const start = require('../../src/services/ask/support/negotiationShieldStart.ts');

const OP = 'NEGOTIATION_SHIELD_CASE_START';
const workspace = (over = {}) => ({
  id: 'ws1', outcome: 'OPEN', selectedQuoteId: 'q1', negotiationCase: null,
  selectedQuote: { vendorName: 'Flow Pros', quoteAmount: { toString: () => '1450' }, serviceCategory: 'WINDOWS_DOORS' }, ...over,
});
function install(role, ws) {
  const saved = { a: propertyAccess.resolvePropertyAccess, p: prismaModule.prisma, create: NegotiationShieldService.prototype.createCase, gate: projectCompliance.assertProjectComplianceApplicable, rec: executeOperation.reconcileAskExecutionSideEffects };
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  const finds = []; const created = [];
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'quoteComparisonWorkspace') return { findFirst: async (q) => { finds.push(q); return q.where.propertyId === 'p1' && q.where.id === 'ws1' ? (typeof ws === 'function' ? ws() : ws) : null; } };
    throw new Error(`Unexpected prisma.${String(model)}`);
  } });
  NegotiationShieldService.prototype.createCase = async function (...args) { created.push(args); return { case: { id: 'case-new' } }; };
  projectCompliance.assertProjectComplianceApplicable = async () => ({ contextVersion: 'ctx' });
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { finds, created, restore() { propertyAccess.resolvePropertyAccess = saved.a; prismaModule.prisma = saved.p; NegotiationShieldService.prototype.createCase = saved.create; projectCompliance.assertProjectComplianceApplicable = saved.gate; executeOperation.reconcileAskExecutionSideEffects = saved.rec; } };
}
const launch = (entityId = 'ws1', over = {}) => ({ operationId: OP, surface: 'ASK_PAGE', entityType: 'QUOTE_COMPARISON_WORKSPACE', entityId, ...over });
const prepare = (launchContext, message = start.NEGOTIATION_QUOTE_WORKSPACE_MESSAGE) => capabilityInvoke(OP, { userId: 'u1', propertyId: 'p1', message, launchContext });
const confirmCtx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-9', propertyId: 'p1', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

test('the contractor-quote form opens with the selected proposal, read in this home, carries the decision, and saves nothing', async () => {
  const w = install('CONTRIBUTOR', workspace());
  try {
    const out = await prepare(launch());
    assert.equal(out.status, 'NEEDS_CONTEXT');
    assert.deepEqual(out.captureRequests[0].currentAnswer, { title: 'Review Flow Pros proposal', contractorName: 'Flow Pros', quoteAmount: 1450, serviceCategory: 'Windows & Doors' });
    assert.deepEqual(out.parameters.negotiationStartLaunch.quoteWorkspace, { id: 'ws1', selectedQuoteId: 'q1', vendorName: 'Flow Pros' });
    assert.equal(w.finds[0].where.propertyId, 'p1', 'scoped to this home');
    assert.equal(w.created.length, 0);
    const review = await require('../../src/services/ask/handlers/negotiationShieldStart.handler.ts').negotiationShieldStartResult('u1', 'p1',
      { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', sourceExecutionId: null, quoteWorkspace: { id: 'ws1', selectedQuoteId: 'q1', vendorName: 'Flow Pros' } },
      { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', inputType: 'CONTRACTOR_QUOTE', title: 'Review Flow Pros proposal', structuredData: { contractorName: 'Flow Pros', quoteAmount: 1450 } });
    assert.match(review.confirmation.description, /moves to the negotiation stage/);
    assert.ok(review.confirmation.fields.some((f) => f.label === 'Quote decision'));
    assert.deepEqual(review.parameters.negotiationQuoteWorkspace, { id: 'ws1', selectedQuoteId: 'q1', vendorName: 'Flow Pros' });
  } finally { w.restore(); }
});

test('it is declared-only and refused for a viewer, a missing decision, no selection and a closed decision; an existing case is offered for review instead', async () => {
  let w = install('VIEWER', workspace());
  try { assert.equal((await prepare(launch())).reasonCode, 'ASK_PERMISSION_REQUIRED'); } finally { w.restore(); }
  w = install('CONTRIBUTOR', workspace());
  try {
    assert.notEqual((await prepare(launch(), 'Start a contractor quote review.')).reasonCode, 'NEGOTIATION_SHIELD_QUOTE_WORKSPACE_UNAVAILABLE');
    assert.equal((await prepare(launch('missing'))).reasonCode, 'NEGOTIATION_SHIELD_QUOTE_WORKSPACE_UNAVAILABLE');
  } finally { w.restore(); }
  for (const ws of [workspace({ selectedQuoteId: null, selectedQuote: null }), workspace({ outcome: 'DECLINED' })]) {
    const x = install('CONTRIBUTOR', ws);
    try { assert.equal((await prepare(launch())).reasonCode, 'NEGOTIATION_SHIELD_QUOTE_WORKSPACE_UNAVAILABLE'); } finally { x.restore(); }
  }
  const linked = install('CONTRIBUTOR', workspace({ negotiationCase: { id: 'c9', title: 'Review Flow Pros proposal' } }));
  try {
    const out = await prepare(launch());
    assert.equal(out.reasonCode, 'NEGOTIATION_SHIELD_QUOTE_WORKSPACE_ALREADY_LINKED');
    assert.equal(out.blocks[0].actions[0].entityId, 'c9');
  } finally { linked.restore(); }
});

test('confirming creates the case linked to the decision once, and refuses when the selection changed or the decision closed', async () => {
  const parameters = {
    negotiationShieldStart: { scenarioType: 'CONTRACTOR_QUOTE_REVIEW', title: 'Review Flow Pros proposal', structuredData: { contractorName: 'Flow Pros', quoteAmount: 1450 } },
    negotiationQuoteWorkspace: { id: 'ws1', selectedQuoteId: 'q1' },
  };
  let w = install('CONTRIBUTOR', workspace());
  try {
    const done = await confirmCapabilityInvoke(OP, confirmCtx(parameters));
    assert.equal(w.created.length, 1);
    assert.equal(w.created[0][2].quoteDecisionWorkspaceId, 'ws1');
    assert.ok(done.result.blocks[0].details.some((d) => d.label === 'Quote decision'));
  } finally { w.restore(); }
  for (const ws of [workspace({ selectedQuoteId: 'q2' }), workspace({ outcome: 'CLOSED' }), null]) {
    const x = install('CONTRIBUTOR', ws);
    try {
      await assert.rejects(() => confirmCapabilityInvoke(OP, confirmCtx(parameters)), (e) => e.code === 'ASK_CONTEXT_VERSION_CONFLICT');
      assert.equal(x.created.length, 0);
    } finally { x.restore(); }
  }
  const plain = install('CONTRIBUTOR', workspace());
  try {
    await confirmCapabilityInvoke(OP, confirmCtx({ negotiationShieldStart: parameters.negotiationShieldStart }));
    assert.equal('quoteDecisionWorkspaceId' in plain.created[0][2], false, 'a review not started from a decision is not linked');
  } finally { plain.restore(); }
});

test('the quote review offers Prepare negotiation once a proposal is selected (Review once prepared), to contributors only, and the actions survive the trust policy', async () => {
  const quoteService = require('../../src/services/quoteComparison.service.ts');
  const saved = { a: propertyAccess.resolvePropertyAccess, p: prismaModule.prisma, g: quoteService.getQuoteComparisonWorkspace, c: quoteService.getWorkspaceComparability };
  const build = async (role, ws) => {
    propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
    prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (model === 'quoteComparisonWorkspace') return { findFirst: async () => ({ id: 'ws1', outcome: ws.outcome, journeyStage: 'REVIEW', selectedQuoteId: ws.selectedQuoteId }) }; throw new Error(`Unexpected prisma.${String(model)}`); } });
    quoteService.getQuoteComparisonWorkspace = async () => ({ ...ws, quotes: [] });
    quoteService.getWorkspaceComparability = async () => ({ status: 'NOT_COMPARABLE', reasons: ['x'], eligibleQuoteIds: [] });
    return capabilityInvoke('QUOTE_COMPARISON_REVIEW', { userId: 'u1', propertyId: 'p1', message: 'Compare my roofing quotes' });
  };
  try {
    const picked = await build('CONTRIBUTOR', { outcome: 'OPEN', selectedQuoteId: 'q1', selectedQuote: { vendorName: 'Flow Pros' }, negotiationCase: null });
    const block = picked.blocks.find((b) => b.id === 'quote-review-continue');
    assert.equal(block.title, 'Continue with Flow Pros');
    assert.deepEqual([block.actions[0].id, block.actions[0].operationId, block.actions[0].entityType, block.actions[0].entityId, block.actions[0].message], ['quote-comparison-prepare-negotiation', OP, 'QUOTE_COMPARISON_WORKSPACE', 'ws1', start.NEGOTIATION_QUOTE_WORKSPACE_MESSAGE]);
    const withEvidence = { ...picked, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [completedAskAuthoritativeSourceEvidence('QUOTE_COMPARISON_REVIEW')] } } };
    const trusted = validateAskAnswerTrust({ question: 'Compare my roofing quotes', operationId: 'QUOTE_COMPARISON_REVIEW', result: withEvidence, propertyId: 'p1' }).result;
    assert.deepEqual(trusted.blocks.find((b) => b.id === 'quote-review-continue').actions.map((a) => a.id), ['quote-comparison-prepare-negotiation'], 'the action is allowlisted');
    const linked = await build('CONTRIBUTOR', { outcome: 'OPEN', selectedQuoteId: 'q1', selectedQuote: { vendorName: 'Flow Pros' }, negotiationCase: { id: 'c9', title: 'Review Flow Pros proposal', status: 'DRAFT' } });
    assert.deepEqual(linked.blocks.find((b) => b.id === 'quote-review-continue').actions.map((a) => [a.id, a.entityId]), [['negotiation-shield-review', 'c9']]);
    for (const [role, ws] of [['VIEWER', { outcome: 'OPEN', selectedQuoteId: 'q1', selectedQuote: { vendorName: 'x' } }], ['CONTRIBUTOR', { outcome: 'OPEN', selectedQuoteId: null, selectedQuote: null }], ['CONTRIBUTOR', { outcome: 'DECLINED', selectedQuoteId: 'q1', selectedQuote: { vendorName: 'x' } }]]) {
      assert.equal((await build(role, ws)).blocks.some((b) => b.id === 'quote-review-continue'), false, `${role} ${ws.outcome}`);
    }
  } finally { propertyAccess.resolvePropertyAccess = saved.a; prismaModule.prisma = saved.p; quoteService.getQuoteComparisonWorkspace = saved.g; quoteService.getWorkspaceComparability = saved.c; }
});
