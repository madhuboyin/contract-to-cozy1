const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.44: seller-prep capability-card slice. Same fake-prisma harness as the other
// capability-card slice tests; the fake prisma throws on any model it was not given.

const prismaModule = require('../../src/lib/prisma.ts');
const { SELLER_PREP_ITEM_ACTIONS, sellerPrepItemActions, saleCaseHref } = require('../../src/services/ask/askOrchestrator.service.ts');
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
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1' }, readinessItems: items, transitions: [] });
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

test('confirming writes the decision through the same service the sale-case route calls, and links to the item on the sale-case page', async () => {
  const item = items.find((candidate) => candidate.id === 'item-pursuing');
  const { result } = await confirm({ saleReadinessItemId: item.id, saleReadinessItemAction: 'UNPURSUE', saleReadinessItemReason: null, saleReadinessItemContextVersion: version(item) });
  assert.equal(calls.decisions.length, 1);
  assert.deepEqual(calls.decisions[0].slice(0, 4), ['u1', 'p1', 'item-pursuing', 'UNPURSUE']);
  assert.equal(result.blocks[0].actions[0].href, '/dashboard/properties/p1/tools/sale-case?focusItemId=item-pursuing');
});

test('the checklist lists open, pursuing and waived items (not resolved ones) with identity, a sale-case link and every decision for contributors; viewers get read-only rows', async () => {
  const contributor = await list();
  const rows = contributor.sections.flatMap((section) => section.items);
  assert.deepEqual(rows.map((row) => row.id), ['item-open', 'item-pursuing', 'item-waived']);
  assert.deepEqual(contributor.sections.map((section) => section.id), ['seller-prep-presentation', 'seller-prep-pursuing', 'seller-prep-waived']);
  for (const row of rows) {
    assert.equal(row.entityType, 'SALE_READINESS_ITEM');
    assert.equal(row.href, `/dashboard/properties/p1/tools/sale-case?focusItemId=${row.id}`);
    assert.deepEqual(row.actions.map((action) => action.id), ['sale-item-pursue', 'sale-item-unpursue', 'sale-item-waive', 'sale-item-reopen']);
  }
  assert.ok(!JSON.stringify(contributor).includes('/seller-prep"'), 'checklist rows no longer link to the /seller-prep entry page');
  accessRole = 'VIEWER';
  assert.ok((await list()).sections.flatMap((section) => section.items).every((row) => row.actions.length === 0));
  assert.equal(saleCaseHref('p1'), '/dashboard/properties/p1/tools/sale-case');
});

test('a checklist with only pursued or waived items still lists them, so Stop pursuing and Reopen stay reachable', async () => {
  items = items.filter((item) => item.status !== 'OPEN');
  const block = await list();
  assert.equal(block.title, 'Checklist items');
  assert.deepEqual(block.sections.map((section) => section.id), ['seller-prep-pursuing', 'seller-prep-waived']);
});

test('the decision actions and the checklist link survive the answer-trust whitelist (neither seller-prep operation had an entry)', () => {
  const link = { id: 'open-seller-prep', label: 'Open sale readiness checklist', href: '/dashboard/properties/p1/tools/sale-case', style: 'SECONDARY' };
  for (const action of [...sellerPrepItemActions('OWNER'), link]) {
    assert.equal(isAskActionApplicable({ action, operationId: 'SELLER_PREP_CHECKLIST', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true, action.id);
  }
  assert.equal(isAskActionApplicable({ action: link, operationId: 'SELLER_PREP_ITEM_DECISION', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
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
