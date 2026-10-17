const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.44: seller-prep capability-card slice. Same fake-prisma harness as the other
// capability-card slice tests; the fake prisma throws on any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const { SELLER_PREP_ITEM_ACTIONS, sellerPrepItemActions } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { CAPABILITY_SKILL_GUIDANCE_BRIDGE, ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { getCase: PropertySaleCaseService.getCase, setItemDecision: PropertySaleCaseService.setItemDecision, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
let accessRole;
let items;
let calls;

const makeItem = (id, overrides) => ({
  id, saleCaseId: 'case-1', title: `Item ${id}`, detail: null, category: 'PRESENTATION', requirementClass: 'OPTIONAL_IMPROVEMENT',
  status: 'OPEN', estimatedCostMinCents: null, estimatedCostMaxCents: null, waivedReason: null, updatedAt: UPDATED_AT, ...overrides,
});

function install() {
  accessRole = 'CONTRIBUTOR';
  items = [
    makeItem('item-open', { title: 'Paint the front door', estimatedCostMinCents: 20000, estimatedCostMaxCents: 40000 }),
    makeItem('item-pursuing', { title: 'Stage the living room', status: 'PURSUING' }),
    makeItem('item-waived', { title: 'Replace the water heater', category: 'FINANCIAL_DECISION', requirementClass: 'PROFESSIONAL_DECISION', status: 'WAIVED', waivedReason: 'Disclosed to buyers' }),
    makeItem('item-resolved', { title: 'Clean the gutters', category: 'SYSTEMS_MAINTENANCE', status: 'RESOLVED' }),
  ];
  calls = { decisions: [] };
  const models = {
    askExecution: { findMany: async () => [] },
    saleReadinessItem: { findFirst: async ({ where }) => items.find((item) => item.id === where.id) ?? null },
  };
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`);
      return models[model];
    },
  });
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1', updatedAt: UPDATED_AT }, readinessItems: items, transitions: [] });
  PropertySaleCaseService.setItemDecision = async (...args) => { calls.decisions.push(args); return {}; };
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = realPrisma;
  Object.assign(PropertySaleCaseService, { getCase: originals.getCase, setItemDecision: originals.setItemDecision });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const version = (item) => createHash('sha256').update(`${item.id}:${item.status}:${UPDATED_AT.toISOString()}`).digest('hex');
const propose = (message, entityId) => capabilityInvoke('SELLER_PREP_ITEM_DECISION', {
  userId: 'u1', propertyId: 'p1', message,
  launchContext: { surface: 'ASK_WORKSPACE', entityType: 'SALE_READINESS_ITEM', entityId, operationId: 'SELLER_PREP_ITEM_DECISION', sourceExecutionId: 'exec-list' },
});
const execution = () => ({ id: 'exec-1', propertyId: 'p1', sessionId: 's1', userId: 'u1', operationId: 'SELLER_PREP_ITEM_DECISION', createdAt: new Date('2026-09-22T00:00:00.000Z') });
const confirm = (parameters) => confirmCapabilityInvoke('SELLER_PREP_ITEM_DECISION', { userId: 'u1', execution: execution(), parameters, access: { role: 'CONTRIBUTOR' }, command: getAskDomainCommandByOperation('SELLER_PREP_ITEM_DECISION') });
const list = async () => (await capabilityInvoke('SELLER_PREP_CHECKLIST', { userId: 'u1', propertyId: 'p1', message: 'Check my sale readiness' })).blocks.find((block) => block.id === 'seller-prep-open-items');

test('every declared decision\'s canned message proposes exactly its own decision for the launched item', async () => {
  for (const action of SELLER_PREP_ITEM_ACTIONS) {
    const result = await propose(action.message, 'item-open');
    assert.equal(result.status, 'NEEDS_CONFIRMATION', action.id);
    assert.equal(result.parameters.saleReadinessItemId, 'item-open');
    assert.equal(result.parameters.saleReadinessItemAction, action.action, action.id);
    assert.equal(result.parameters.saleReadinessItemReason, null, action.id);
  }
});

test('confirming writes the decision through the same service the sale-case route calls, and follows up inside Ask instead of linking to the sale-case page', async () => {
  const item = items.find((candidate) => candidate.id === 'item-pursuing');
  const { result } = await confirm({ saleReadinessItemId: item.id, saleReadinessItemAction: 'UNPURSUE', saleReadinessItemReason: null, saleReadinessItemContextVersion: version(item) });
  assert.equal(calls.decisions.length, 1);
  assert.deepEqual(calls.decisions[0].slice(0, 4), ['u1', 'p1', 'item-pursuing', 'UNPURSUE']);
  assert.deepEqual(result.blocks[0].actions.map((action) => [action.id, action.href, action.operationId]), [['receipt-show-seller-prep', undefined, 'SELLER_PREP_CHECKLIST']]);
});

test('the checklist lists open, pursuing and waived items (not resolved ones) with identity and every decision for contributors, linking to no desktop page; viewers get read-only rows', async () => {
  const contributor = await list();
  const rows = contributor.sections.flatMap((section) => section.items);
  assert.deepEqual(rows.map((row) => row.id), ['item-open', 'item-pursuing', 'item-waived']);
  assert.deepEqual(contributor.sections.map((section) => section.id), ['seller-prep-presentation', 'seller-prep-pursuing', 'seller-prep-waived']);
  assert.deepEqual(contributor.collection, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false });
  for (const row of rows) {
    assert.equal(row.entityType, 'SALE_READINESS_ITEM');
    assert.equal(row.href, null, 'a checklist row opens its inline item record, not the desktop sale-case page');
    assert.deepEqual(row.actions.map((action) => action.id), ['sale-item-pursue', 'sale-item-unpursue', 'sale-item-waive', 'sale-item-reopen']);
  }
  assert.ok(!JSON.stringify(contributor).includes('/dashboard/'), 'no checklist row links to a desktop page');
  accessRole = 'VIEWER';
  assert.ok((await list()).sections.flatMap((section) => section.items).every((row) => row.actions.length === 0));
});

test('a checklist with only pursued or waived items still lists them, so Stop pursuing and Reopen stay reachable', async () => {
  items = items.filter((item) => item.status !== 'OPEN');
  const block = await list();
  assert.equal(block.title, 'Checklist items');
  assert.deepEqual(block.sections.map((section) => section.id), ['seller-prep-pursuing', 'seller-prep-waived']);
});

test('the typed decision actions are whitelisted and the desktop checklist link is not', () => {
  const link = { id: 'open-seller-prep', label: 'Open sale readiness checklist', href: '/dashboard/properties/p1/tools/sale-case', style: 'SECONDARY' };
  for (const action of [...sellerPrepItemActions('OWNER'), link]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'SELLER_PREP_CHECKLIST', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), !action.href, action.id);
  }
  assert.equal(isAskActionApplicable({ action: link, operationId: 'SELLER_PREP_ITEM_DECISION', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), false);
});

test('the seller-prep capability card launches inline, and the bridge registry now maps it to both operations', () => {
  assert.equal(capabilityCardLaunch('seller-prep').inlineLaunch.operationId, 'SELLER_PREP_CHECKLIST');
  const entry = CAPABILITY_SKILL_GUIDANCE_BRIDGE.filter((candidate) => candidate.capabilityId === 'seller-prep');
  assert.equal(entry.length, 1);
  assert.deepEqual(entry[0].operationIds, ['SELLER_PREP_CHECKLIST', 'SELLER_PREP_ITEM_DECISION']);
  assert.equal(ASK_OPERATION_CAPABILITY.SELLER_PREP_ITEM_DECISION, 'seller-prep');
  // Not moved: its operation belongs to home-renovation-risk-advisor, and listing it twice would reassign it.
  assert.equal(ASK_OPERATION_CAPABILITY.RENOVATION_PERMIT_READINESS, 'home-renovation-risk-advisor');
});

// Sell / Hold / Rent batch of the handler sweep (docs/product/ASK_COZY_ALL_TOOLS_PARITY_IMPLEMENTATION.md): Ask links to no Seller Prep
// or sale-case page (owner decision, 2026-10-10).
test('the no-sale-case answers and the decision proposal link to no desktop page', async () => {
  const noCase = async (operationId, message) => {
    PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: null, canCreate: true, readinessItems: [], transitions: [] });
    return capabilityInvoke(operationId, { userId: 'u1', propertyId: 'p1', message });
  };
  for (const [operationId, message] of [['SELLER_PREP_CHECKLIST', 'Check my sale readiness'], ['SELLER_PREP_ITEM_DECISION', 'Waive the paint item']]) {
    const result = await noCase(operationId, message);
    assert.equal(result.reasonCode, 'SELLER_PREP_NO_ACTIVE_CASE', operationId);
    // FRD v1.338: the checklist answer offers to start the case in Ask; the item-decision answer only points back to the checklist.
    assert.deepEqual(result.blocks[0].actions.map((action) => action.id), operationId === 'SELLER_PREP_CHECKLIST' ? ['seller-prep-case-start'] : [], operationId);
    assert.doesNotMatch(result.blocks[0].body, /not currently available in Ask/, operationId);
    assert.equal(JSON.stringify(result).includes('/dashboard/'), false, operationId);
  }
  install();
  const proposal = await propose(SELLER_PREP_ITEM_ACTIONS[0].message, 'item-open');
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.deepEqual(proposal.blocks[0].actions, []);
  const target = await capabilityInvoke('SELLER_PREP_ITEM_DECISION', { userId: 'u1', propertyId: 'p1', message: 'Decide on an item' });
  assert.equal(target.reasonCode, 'SELLER_PREP_ITEM_TARGET_REQUIRED');
  assert.deepEqual(target.blocks[0].actions, []);
  assert.deepEqual(target.blocks[0].collection, { sourceTotal: 3, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: false });
  const rows = target.blocks[0].sections.flatMap((section) => section.items);
  assert.ok(rows.length > 0 && rows.every((row) => row.href === null && row.entityType === 'SALE_READINESS_ITEM'));
  assert.equal(JSON.stringify(target).includes('/dashboard/'), false);
});

test('seller collections declare their full source while preserving bounded delivery and no unsupported continuation', async () => {
  items = Array.from({ length: 55 }, (_, index) => makeItem(`item-${index}`, { title: `Prepare item ${index}` }));
  const checklist = await list();
  assert.deepEqual(checklist.collection, { sourceTotal: 55, fetchedCount: 55, deliveredCount: 20, nextPageAvailable: false, deliveryTruncated: true });

  const target = await capabilityInvoke('SELLER_PREP_ITEM_DECISION', { userId: 'u1', propertyId: 'p1', message: 'Decide on an item' });
  assert.deepEqual(target.blocks[0].collection, { sourceTotal: 55, fetchedCount: 55, deliveredCount: 50, nextPageAvailable: false, deliveryTruncated: true });
});
