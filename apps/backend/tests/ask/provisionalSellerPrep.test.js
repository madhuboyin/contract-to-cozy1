// Provisional read: SELLER_PREP_CHECKLIST (FR-FAST-10 amended 2026-11-18: a reader-equivalent read may start provisionally).
// Covers the amendment's boundary, routing, the grounded check on REAL handler output, and delivery through the production trust + relevance gate.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const prismaModule = require('../../src/lib/prisma.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { isProvisionalReadOperation, PROVISIONAL_READ_OPERATIONS } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { groundedSellerPrepVerdict, groundedVerdictFor, provisionalRouteAllowed, verifyProvisionalReadFamilyDispositions } = require('../../src/services/ask/support/provisionalRead.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/sellHoldRent.handler.ts');
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const route = (message) => resolveAskRoutingCascade(message, { localMinimumConfidence: 0.42, ambiguityMargin: 0.1 });

test('the amendment admits a reader-equivalent read and nothing broader', () => {
  assert.ok(isProvisionalReadOperation('SELLER_PREP_CHECKLIST'));
  assert.ok(PROVISIONAL_READ_OPERATIONS.has('SELLER_PREP_CHECKLIST'));
  // Still excluded: a decision (labelled READ, persists a thread), a write, and reader-equivalent reads that have no grounded check.
  for (const op of ['HVAC_DECISION_START', 'HVAC_DECISION_SCENARIO', 'INVENTORY_ITEM_CORRECT', 'MAINTENANCE_TASK_CREATE', 'SELLER_PREP_ITEM_DECISION', 'HOME_ACTIONS', 'HOME_CHANGE_SUMMARY', 'REPLACEMENT_GUIDANCE']) assert.equal(isProvisionalReadOperation(op), false, op);
  assert.deepEqual(verifyProvisionalReadFamilyDispositions(), []);
});

test('read-style seller-readiness prompts start provisionally; a decision, a value question or another job keeps the strict path', () => {
  for (const message of ['show seller readiness items that involve appliances', 'show my seller readiness', 'Check my sale readiness', 'show seller readiness items that cost under $500']) {
    const decision = route(message);
    assert.equal(decision.stage, 'PROVISIONAL', message);
    assert.equal(decision.operation.operationId, 'SELLER_PREP_CHECKLIST', message);
  }
  for (const message of ['waive the seller readiness item for the roof', 'what is my seller readiness worth', 'add a seller readiness item', 'seller readiness and my warranties']) {
    assert.notEqual(route(message).stage, 'PROVISIONAL', message);
    assert.equal(provisionalRouteAllowed('SELLER_PREP_CHECKLIST', message), false, message);
  }
});

// ---- the real handler, fake prisma (same harness as sellerReadinessAppliances)
const realPrisma = prismaModule.prisma;
const originals = { getCase: PropertySaleCaseService.getCase, upgrades: PropertySaleCaseService.getNotableUpgradeCandidates, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
const item = (id, sourceEntityType, sourceEntityId, overrides = {}) => ({ id, saleCaseId: 'case-1', sourceEntityType, sourceEntityId, title: `Item ${id}`, detail: null, category: 'SYSTEMS_MAINTENANCE', requirementClass: 'OPTIONAL_IMPROVEMENT', status: 'OPEN', estimatedCostMinCents: 10000, estimatedCostMaxCents: 20000, waivedReason: null, updatedAt: UPDATED_AT, ...overrides });
const items = [item('dishwasher', 'INVENTORY_ITEM', 'inv-dishwasher'), item('roof', 'INVENTORY_ITEM', 'inv-roof'), item('paint', 'SALE_PREP_SELF_REPORT', 'PRESENTATION', { requirementClass: 'MATERIAL_BLOCKER' })];
const inventory = [{ id: 'inv-dishwasher', category: 'APPLIANCE' }, { id: 'inv-roof', category: 'ROOF_EXTERIOR' }];
let role = 'OWNER';
test.beforeEach(() => {
  role = 'OWNER';
  const select = (rows) => async ({ where }) => rows.filter((row) => where.id.in.includes(row.id) && (where.category === undefined || row.category === where.category));
  const models = { askExecution: { findMany: async () => [] }, inventoryItem: { findMany: select(inventory) }, warranty: { findMany: async () => [] } };
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`); return models[model]; } });
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1', status: 'PREPARING', updatedAt: UPDATED_AT }, readinessItems: items, transitions: [], canCreate: true });
  PropertySaleCaseService.getNotableUpgradeCandidates = async () => ({ candidates: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  Object.assign(PropertySaleCaseService, { getCase: originals.getCase, getNotableUpgradeCandidates: originals.upgrades });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
});
const run = (message) => capabilityInvoke('SELLER_PREP_CHECKLIST', { userId: 'u1', propertyId: 'p1', message });
const deliver = async (message) => {
  const result = attachAskAuthoritativeSourceEvidence(await run(message), [completedAskAuthoritativeSourceEvidence('SELLER_PREP_CHECKLIST')]);
  return validateAskAnswerTrustPipeline({ question: message, operationId: 'SELLER_PREP_CHECKLIST', result, propertyId: 'p1', semanticEnabled: true, routedDeterministically: false, provisionalRead: true });
};

test('the live prompt is delivered: the appliance-narrowed checklist passes the grounded check and the full gate', async () => {
  const message = 'show seller readiness items that involve appliances';
  assert.equal(groundedSellerPrepVerdict(message, await run(message)).outcome, 'PASS');
  const gate = await deliver(message);
  // The handler's own 'seller-prep-boundary' is an allowed boundary for this operation, so the gate keeps it and nothing is repaired.
  assert.equal(gate.trust.outcome, 'PASS', JSON.stringify(gate.trust.reasonCodes));
  assert.ok(!gate.trust.reasonCodes.includes('INAPPLICABLE_BOUNDARY_REMOVED'), JSON.stringify(gate.trust.reasonCodes));
  assert.ok(gate.result.blocks.some((block) => block.id === 'seller-prep-boundary'), 'the preparation-guidance boundary is delivered');
  assert.equal(gate.result.status, 'ANSWERED');
  assert.ok(!gate.result.blocks.some((block) => block.id === 'answer-unverified'));
  assert.deepEqual(gate.result.blocks.find((block) => block.id === 'seller-prep-open-items').sections.flatMap((s) => s.items.map((i) => i.id)), ['dishwasher']);
});

test('an unfiltered checklist is delivered for an unfiltered question and withheld for a narrowed one', async () => {
  const whole = await run('show my seller readiness');
  assert.equal(groundedVerdictFor('SELLER_PREP_CHECKLIST', 'show my seller readiness', whole).outcome, 'PASS');
  const narrowed = groundedSellerPrepVerdict('show seller readiness items that involve appliances', whole);
  assert.equal(narrowed.outcome, 'FAIL'); assert.ok(narrowed.reasonCodes.includes('NARROWING_WAS_NOT_APPLIED'));
  const filtered = await run('show seller readiness items that involve appliances');
  const wrong = groundedSellerPrepVerdict('show my seller readiness', filtered);
  assert.equal(wrong.outcome, 'FAIL'); assert.ok(wrong.reasonCodes.includes('FILTERED_VIEW_FOR_AN_UNFILTERED_QUESTION'));
});

test('a cost ceiling the handler cannot apply (cost detail is owner-only) is withheld, not answered with the whole list', async () => {
  role = 'VIEWER';
  const message = 'show seller readiness items that cost under $500';
  const verdict = groundedSellerPrepVerdict(message, await run(message));
  assert.equal(verdict.outcome, 'FAIL'); assert.ok(verdict.reasonCodes.includes('NARROWING_WAS_NOT_APPLIED'));
  role = 'OWNER';
  assert.equal(groundedSellerPrepVerdict(message, await run(message)).outcome, 'PASS');
});

test('a result that is not the checklist is never grounded, whatever the question says', () => {
  const other = { status: 'ANSWERED', reasonCode: 'WARRANTY_SUMMARY', blocks: [{ type: 'SUMMARY', id: 'warranty-summary', title: 'Warranties', body: 'x', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  const verdict = groundedSellerPrepVerdict('show my seller readiness', other);
  assert.equal(verdict.outcome, 'FAIL'); assert.ok(verdict.reasonCodes.includes('ANSWER_IS_NOT_A_VERIFIED_VARIANT'));
});

// Review screenshot (2026-11-19): "show seller prep items that cost less than $500 and are high priority" ended in "which request did you want this answer to address" with repair-or-replace as the alternative.
{
  const { groundedSellerPrepVerdict } = require('../../src/services/ask/support/provisionalRead.ts');
  const { matchesSellerPrepChecklistAnswerContract } = require('../../src/services/ask/askSellerPrepIntent.ts');
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  const summary = (title, body) => ({ type: 'SUMMARY', id: 'seller-prep-summary', title, body, tone: 'DEFAULT', actions: [] });
  const answer = (title, body, extra = []) => ({ status: 'ANSWERED', reasonCode: 'SELLER_PREP_ITEMS_OPEN', blocks: [summary(title, body), ...extra] });
  const question = 'show seller prep items that cost less than $500 and are high priority';
  test('a cost-ceiling plus high-priority seller-prep read is a provisional read, and its answer must state the ceiling', () => {
    assert.equal(resolveAskRoutingCascade(question, { propertyId: 'p1' }).stage, 'PROVISIONAL');
    assert.equal(groundedSellerPrepVerdict(question, answer('Seller-prep items that match', '2 open items. Matching means it is classified as a material blocker and its recorded maximum estimate is below $500 (items with no estimate are not counted).')).outcome, 'PASS');
    assert.equal(groundedSellerPrepVerdict(question, answer('Seller-prep items that match', '2 open items. Cost-based filtering is available to the property owner, so the $500 limit was not applied.')).outcome, 'PASS');
    assert.equal(groundedSellerPrepVerdict(question, answer('Seller-prep items that match', '2 open items.')).outcome, 'FAIL');
    assert.equal(groundedSellerPrepVerdict(question, answer('Your seller-prep checklist', '9 open items.')).outcome, 'FAIL');
  });
  test('the checklist answer contract accepts the optional upgrades and transition blocks the handler can add', () => {
    const extra = ['seller-prep-upgrades', 'seller-prep-transition'].map((id) => ({ type: 'SUMMARY', id, title: 't', body: 'b', tone: 'DEFAULT', actions: [] }));
    assert.equal(matchesSellerPrepChecklistAnswerContract(answer('Your seller-prep checklist', 'x', extra)), true);
    assert.equal(matchesSellerPrepChecklistAnswerContract(answer('Your seller-prep checklist', 'x', [{ type: 'SUMMARY', id: 'something-else', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }])), false);
  });
}
