// Live prompt: "show seller readiness items that involve appliances".
// Covers the EXECUTION half only: once SELLER_PREP_CHECKLIST runs, "appliances" filters the checklist to items from an appliance record (or its warranty) and says so.
// The ROUTING half is open: the seller-prep rule is uncertified (demoted) and not a provisional read, so the live prompt never reaches it.
const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaModule = require('../../src/lib/prisma.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/sellHoldRent.handler.ts');
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const realPrisma = prismaModule.prisma;
const originals = { getCase: PropertySaleCaseService.getCase, upgrades: PropertySaleCaseService.getNotableUpgradeCandidates, resolveAccess: propertyAccess.resolvePropertyAccess };
const UPDATED_AT = new Date('2026-09-20T00:00:00.000Z');
const item = (id, sourceEntityType, sourceEntityId, overrides = {}) => ({
  id, saleCaseId: 'case-1', sourceEntityType, sourceEntityId, title: `Item ${id}`, detail: null, category: 'SYSTEMS_MAINTENANCE', requirementClass: 'OPTIONAL_IMPROVEMENT',
  status: 'OPEN', estimatedCostMinCents: null, estimatedCostMaxCents: null, waivedReason: null, updatedAt: UPDATED_AT, ...overrides,
});
const items = [
  item('dishwasher-open', 'INVENTORY_ITEM', 'inv-dishwasher'),
  item('roof-open', 'INVENTORY_ITEM', 'inv-roof'),
  item('fridge-warranty', 'WARRANTY', 'war-fridge'),
  item('roof-warranty', 'WARRANTY', 'war-roof'),
  item('paint-open', 'SALE_PREP_SELF_REPORT', 'PRESENTATION'),
];
const inventory = [{ id: 'inv-dishwasher', category: 'APPLIANCE' }, { id: 'inv-roof', category: 'ROOF_EXTERIOR' }, { id: 'inv-fridge', category: 'APPLIANCE' }];
const warranties = [{ id: 'war-fridge', inventoryItemId: 'inv-fridge' }, { id: 'war-roof', inventoryItemId: 'inv-roof' }];

test.beforeEach(() => {
  const select = (rows) => async ({ where }) => rows.filter((row) => where.id.in.includes(row.id) && (where.category === undefined || row.category === where.category));
  const models = { askExecution: { findMany: async () => [] }, inventoryItem: { findMany: select(inventory) }, warranty: { findMany: select(warranties) } };
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; if (!models[model]) throw new Error(`Unexpected prisma.${String(model)} access`); return models[model]; } });
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1', status: 'PREPARING', updatedAt: UPDATED_AT }, readinessItems: items, transitions: [], canCreate: true });
  PropertySaleCaseService.getNotableUpgradeCandidates = async () => ({ candidates: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  prismaModule.prisma = realPrisma;
  Object.assign(PropertySaleCaseService, { getCase: originals.getCase, getNotableUpgradeCandidates: originals.upgrades });
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
});

const ask = (message) => capabilityInvoke('SELLER_PREP_CHECKLIST', { userId: 'u1', propertyId: 'p1', message });
const rowIds = (result) => result.blocks.filter((b) => b.type === 'GROUPED_LIST').flatMap((b) => b.sections.flatMap((s) => s.items.map((i) => i.id))).sort();

test('the appliance filter keeps appliance-record items and appliance warranties, and drops the roof, the roof warranty and unlinked items', async () => {
  const result = await ask('show seller readiness items that involve appliances');
  assert.deepEqual(rowIds(result), ['dishwasher-open', 'fridge-warranty']);
  const summary = result.blocks.find((b) => b.id === 'seller-prep-summary');
  assert.equal(summary.title, '2 appliance-related seller-prep items');
  assert.match(summary.body, /appliance records and their warranties/);
  assert.deepEqual(summary.actions, []);
});

test('without the appliance word the checklist is unfiltered', async () => {
  const result = await ask('show my seller readiness');
  assert.equal(rowIds(result).length, 5);
  assert.equal(result.blocks.find((b) => b.id === 'seller-prep-summary').title, 'Your seller-prep checklist');
});

test('no matching appliance item is said plainly, with what the filter means', async () => {
  const roofOnly = items.filter((i) => ['roof-open', 'roof-warranty', 'paint-open'].includes(i.id));
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'case-1', status: 'PREPARING', updatedAt: UPDATED_AT }, readinessItems: roofOnly, transitions: [], canCreate: true });
  const result = await ask('show seller readiness items that involve appliances');
  assert.match(result.blocks.find((b) => b.id === 'seller-prep-summary').body, /No checklist items match all of those filters \(items count as involving an appliance/);
});
