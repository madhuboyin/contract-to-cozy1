const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-020, FRD v1.80): seller-prep's sale readiness as a progress ring. The
// figure is the sale case's own (saleReadinessFigure, a homeowner decision): must-address items resolved or disclosed.
// The real SELLER_PREP_CHECKLIST handler runs against a stubbed sale case and household lookup.

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { PropertySaleCaseService, saleReadinessFigure } = require('../../src/services/propertySaleCase.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, getCase: PropertySaleCaseService.getCase, access: propertyAccess.resolvePropertyAccess };
const item = (id, requirementClass, status, overrides = {}) => ({
  id, saleCaseId: 'case-1', title: `Item ${id}`, detail: null, category: 'SAFETY_STRUCTURAL', requirementClass, status,
  estimatedCostMinCents: null, estimatedCostMaxCents: null, waivedReason: null, updatedAt: new Date('2026-09-20T00:00:00Z'), ...overrides,
});
let items;
let role;

function install(nextItems, nextRole = 'CONTRIBUTOR') {
  items = nextItems;
  role = nextRole;
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1' }, readinessItems: items, transitions: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  PropertySaleCaseService.getCase = originals.getCase;
  propertyAccess.resolvePropertyAccess = originals.access;
});
const invoke = () => capabilityInvoke('SELLER_PREP_CHECKLIST', { userId: 'u1', propertyId: 'p1', message: 'Check my sale readiness' }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const progress = (result) => result.blocks.find((block) => block.id === 'seller-prep-progress');

const sixMustAddress = () => [
  item('blocker-open', 'MATERIAL_BLOCKER', 'OPEN', { title: 'Repair the cracked foundation wall', estimatedCostMinCents: 500000, estimatedCostMaxCents: 900000 }),
  item('verify-open', 'VERIFICATION_NEEDED', 'OPEN', { title: 'Confirm the deck permit', category: 'PERMITS_DISCLOSURE' }),
  item('pro-pursuing', 'PROFESSIONAL_DECISION', 'PURSUING', { category: 'FINANCIAL_DECISION' }),
  item('blocker-resolved', 'MATERIAL_BLOCKER', 'RESOLVED'),
  item('verify-resolved', 'VERIFICATION_NEEDED', 'RESOLVED', { category: 'DOCUMENTATION_RECORDS' }),
  item('pro-waived', 'PROFESSIONAL_DECISION', 'WAIVED', { category: 'FINANCIAL_DECISION' }),
  // Not counted: an optional improvement, and presentation work even when its class would count.
  item('optional-open', 'OPTIONAL_IMPROVEMENT', 'OPEN', { category: 'SYSTEMS_MAINTENANCE' }),
  item('presentation', 'MATERIAL_BLOCKER', 'OPEN', { category: 'PRESENTATION' }),
];

test('the sale readiness figure counts only must-address items, settled when resolved or waived; pursuing is not done; none means no figure', () => {
  assert.deepEqual(saleReadinessFigure(sixMustAddress()), { percent: 50, settled: 3, total: 6, open: 2, pursuing: 1, waived: 1, resolved: 2 });
  assert.equal(saleReadinessFigure([item('a', 'MATERIAL_BLOCKER', 'RESOLVED'), item('b', 'VERIFICATION_NEEDED', 'OPEN'), item('c', 'VERIFICATION_NEEDED', 'OPEN')]).percent, 33);
  assert.equal(saleReadinessFigure([item('a', 'MATERIAL_BLOCKER', 'PURSUING')]).percent, 0);
  assert.equal(saleReadinessFigure([item('a', 'OPTIONAL_IMPROVEMENT', 'OPEN'), item('b', 'PRESENTATION', 'OPEN', { category: 'PRESENTATION' })]).percent, null);
  assert.equal(saleReadinessFigure([]).percent, null);
});

test('the checklist answer leads with the ring: its basis, the must-address counts, and the next open must-address items, blockers first', async () => {
  install([item('verify-first', 'VERIFICATION_NEEDED', 'OPEN', { title: 'Verify the roof age' }), ...sixMustAddress()]);
  const result = await invoke();
  assert.deepEqual(result.blocks.map((block) => block.id), ['seller-prep-summary', 'seller-prep-progress', 'seller-prep-open-items']);
  const ring = progress(result);
  assert.equal(ring.percent, 43);
  assert.equal(ring.basis, '3 of 7 must-address items resolved or disclosed');
  assert.deepEqual(ring.metrics, [{ label: 'Open', value: '3', tone: 'CAUTION' }, { label: 'Pursuing', value: '1', tone: 'DEFAULT' }, { label: 'Waived', value: '1', tone: 'DEFAULT' }]);
  assert.deepEqual(ring.nextSteps.map((step) => [step.id, step.description, step.amountLabel]), [
    ['blocker-open', 'Safety & structural · Blocks a sale', '$5,000–$9,000 estimated'],
    ['verify-first', 'Safety & structural · Needs verifying', null],
    ['verify-open', 'Permits & disclosure · Needs verifying', null],
  ]);
  for (const step of ring.nextSteps) {
    assert.equal(step.entityType, 'SALE_READINESS_ITEM');
    assert.equal(step.href, `/dashboard/properties/p1/tools/sale-case?focusItemId=${step.id}`);
    assert.deepEqual(step.actions.map((action) => [action.id, action.operationId]), [['sale-item-pursue', 'SELLER_PREP_ITEM_DECISION'], ['sale-item-waive', 'SELLER_PREP_ITEM_DECISION']]);
  }
  AskPresentationBlockSchema.parse(ring);
});

test('a viewer gets the ring without decisions; with no must-address item there is no ring, and a settled case reads 100%', async () => {
  install(sixMustAddress(), 'VIEWER');
  assert.ok(progress(await invoke()).nextSteps.every((step) => step.actions.length === 0));
  install([item('optional', 'OPTIONAL_IMPROVEMENT', 'OPEN', { category: 'SYSTEMS_MAINTENANCE' })]);
  assert.equal(progress(await invoke()), undefined);
  install([item('a', 'MATERIAL_BLOCKER', 'RESOLVED'), item('b', 'PROFESSIONAL_DECISION', 'WAIVED', { category: 'FINANCIAL_DECISION' })]);
  const done = progress(await invoke());
  assert.equal(done.percent, 100);
  assert.deepEqual(done.nextSteps, []);
  assert.equal(done.metrics[0].tone, 'DEFAULT');
});

test('the answer checker, with answer relevance on, keeps the ring and its decisions', async () => {
  install(sixMustAddress());
  const result = await invoke();
  const checked = validateAskAnswerTrustPipeline({
    question: 'Check my sale readiness', operationId: 'SELLER_PREP_CHECKLIST', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('SELLER_PREP_CHECKLIST')]),
  });
  assert.equal(checked.result.status, result.status, `${JSON.stringify(checked.semantic)} ${JSON.stringify(checked.trust.reasonCodes)}`);
  const ring = progress(checked.result);
  assert.equal(ring.percent, 50);
  assert.deepEqual(ring.nextSteps[0].actions.map((action) => action.id), ['sale-item-pursue', 'sale-item-waive']);
});

test('relevance: the checklist envelope passes as a typed answer (it used to come back as a clarification, ring or not), and only that envelope', async () => {
  const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
  install(sixMustAddress());
  const result = await invoke();
  const relevance = (candidate) => validateAskSemanticAnswerRelevance({ question: 'What do I need to fix before selling?', operationId: 'SELLER_PREP_CHECKLIST', result: candidate });
  assert.deepEqual(relevance(result).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  assert.deepEqual(relevance({ ...result, blocks: result.blocks.filter((block) => block.type !== 'PROGRESS') }).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  const foreign = { ...result, blocks: [...result.blocks, { type: 'SUMMARY', id: 'inspection-findings-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] }] };
  assert.notDeepEqual(relevance(foreign).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
  const headless = { ...result, blocks: result.blocks.filter((block) => block.id !== 'seller-prep-summary') };
  assert.notDeepEqual(relevance(headless).reasonCodes, ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH']);
});
