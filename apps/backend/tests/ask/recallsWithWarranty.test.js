const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { parseRecallWarrantyAsk, classifyRecallsWithWarranty, recallsWithWarrantyResult } = require('../../src/services/ask/handlers/recallsWithWarranty.ts');

// FR-PLAN-5 (live prompt #61): open recalls combined with warranty coverage on the same inventory items.
const BOUNDARY = { type: 'BOUNDARY', id: 'warranty-boundary', title: 't', body: 'b', severity: 'INFO', suggestions: [] };
const item = (id, name, category = 'APPLIANCE') => ({ id, name, category });
const ITEMS = [item('fridge', 'Refrigerator'), item('washer', 'Washer'), item('dryer', 'Dryer'), item('oven', 'Oven'), item('furnace', 'Furnace', 'HVAC'), item('dish', 'Dishwasher')];
const base = (overrides = {}) => ({
  ask: { polarity: 'WITHOUT_ACTIVE_WARRANTY', appliancesOnly: true },
  items: ITEMS,
  openRecallItemIds: new Set(['fridge', 'washer', 'dryer', 'furnace']),
  unconfirmedRecallItemIds: new Set(['oven']),
  warrantyStatusesByItem: new Map([['fridge', ['ACTIVE']], ['washer', ['EXPIRED']], ['dryer', ['NEEDS_REVIEW']], ['furnace', []]]),
  ...overrides,
});

test('the prompt parses to both conditions with the right polarity; unrelated and one-sided prompts do not', () => {
  assert.deepEqual(parseRecallWarrantyAsk('show appliances that have open recalls and no active warranty'), { polarity: 'WITHOUT_ACTIVE_WARRANTY', appliancesOnly: true });
  assert.deepEqual(parseRecallWarrantyAsk('which items with an open recall are without a warranty'), { polarity: 'WITHOUT_ACTIVE_WARRANTY', appliancesOnly: false });
  assert.equal(parseRecallWarrantyAsk('show appliances with open recalls and an active warranty').polarity, 'WITH_ACTIVE_WARRANTY');
  assert.equal(parseRecallWarrantyAsk('show appliances that have open recalls'), null);
  assert.equal(parseRecallWarrantyAsk('show appliances with no active warranty'), null);
});

test('no active warranty: an expired or absent warranty matches, an active one does not, and unclear dates are listed apart', () => {
  const found = classifyRecallsWithWarranty(base());
  assert.deepEqual(found.matches.map((m) => m.id), ['washer'], 'furnace is excluded as a non-appliance; fridge is covered; dryer needs review');
  assert.deepEqual(found.needsReview.map((m) => m.id), ['dryer']);
  assert.equal(found.openRecallCount, 3);
  assert.deepEqual(found.unconfirmedOnly.map((m) => m.id), ['oven'], 'a recall awaiting confirmation is never counted as open');
});

test('without the appliance word every category is in scope, and an item with no warranty at all matches', () => {
  const found = classifyRecallsWithWarranty(base({ ask: { polarity: 'WITHOUT_ACTIVE_WARRANTY', appliancesOnly: false } }));
  assert.deepEqual(found.matches.map((m) => m.id).sort(), ['furnace', 'washer']);
});

test('with an active warranty keeps only covered open-recall items', () => {
  const found = classifyRecallsWithWarranty(base({ ask: { polarity: 'WITH_ACTIVE_WARRANTY', appliancesOnly: true } }));
  assert.deepEqual(found.matches.map((m) => m.id), ['fridge']);
});

test('an expiring or not-yet-started warranty: expiring is active, starts-later is not', () => {
  const found = classifyRecallsWithWarranty(base({ warrantyStatusesByItem: new Map([['fridge', ['EXPIRING']], ['washer', ['STARTS_LATER']]]) }));
  assert.deepEqual(found.matches.map((m) => m.id), ['washer', 'dryer']);
});

test('the answer states the result, the open-recall count and the separate groups, and does not claim coverage', () => {
  const result = recallsWithWarrantyResult(base(), BOUNDARY);
  assert.equal(result.reasonCode, 'RECALL_WARRANTY_COMBINED');
  const summary = result.blocks.find((b) => b.id === 'warranty-summary');
  assert.equal(summary.headline, '1 appliance has an open recall and no active warranty.');
  assert.match(summary.supportLine, /3 appliances have an open recall/);
  assert.match(summary.supportLine, /dates need review/);
  assert.match(summary.supportLine, /needs your confirmation/);
  const list = result.blocks.find((b) => b.id === 'warranty-results');
  assert.deepEqual(list.sections.map((s) => [s.id, s.count]), [['recall-warranty-matches', 1], ['recall-warranty-needs-review', 1]]);
  assert.match(summary.body, /does not say whether a recall repair/);
});

test('nothing matching is said plainly, not as an empty list', () => {
  const result = recallsWithWarrantyResult(base({ openRecallItemIds: new Set(), warrantyStatusesByItem: new Map() }), BOUNDARY);
  const summary = result.blocks.find((b) => b.id === 'warranty-summary');
  assert.equal(summary.headline, 'No appliances have an open recall and no active warranty.');
  assert.match(summary.supportLine, /None of your appliances has an open recall recorded/);
});

// ---- end to end through the registered WARRANTY_LOOKUP handler, against a fake prisma (the loader and the wiring, not only the pure rules)
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
const day = (offset) => new Date(Date.now() + offset * 86_400_000);
const warrantyRow = (id, inventoryItemId, startOffset, expiryOffset) => ({ id, propertyId: 'p1', providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: null, startDate: day(startOffset), expiryDate: day(expiryOffset), updatedAt: day(-1), inventoryItemId });

function install() {
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'inventoryItem') return { findMany: async () => ITEMS };
    if (model === 'recallMatch') return { findMany: async () => [
      { inventoryItemId: 'fridge', status: 'OPEN' }, { inventoryItemId: 'washer', status: 'OPEN' }, { inventoryItemId: 'dryer', status: 'OPEN' }, { inventoryItemId: 'oven', status: 'NEEDS_CONFIRMATION' },
    ] };
    if (model === 'warrantyApplicability') return { findMany: async () => [{ warrantyId: 'plan', inventoryItemId: 'dryer' }] };
    if (model === 'warranty') return { findMany: async () => [warrantyRow('w-fridge', 'fridge', -300, 300), warrantyRow('w-washer', 'washer', -900, -30), warrantyRow('plan', null, -100, 200)] };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

test('the live prompt #61 answers the combined question from recorded data: an expired warranty matches, an active direct or whole-home plan warranty does not', async () => {
  install();
  const result = await capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'show appliances that have open recalls and no active warranty' });
  assert.equal(result.reasonCode, 'RECALL_WARRANTY_COMBINED');
  const summary = result.blocks.find((b) => b.id === 'warranty-summary');
  assert.equal(summary.headline, '1 appliance has an open recall and no active warranty.');
  const list = result.blocks.find((b) => b.id === 'warranty-results');
  assert.deepEqual(list.sections[0].items.map((i) => i.id), ['washer']);
  assert.match(summary.supportLine, /3 appliances have an open recall/);
});

test('an ordinary warranty question through the same handler is not turned into the combined question', async () => {
  install();
  const result = await capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message: 'Show my warranties' });
  assert.notEqual(result.reasonCode, 'RECALL_WARRANTY_COMBINED');
});
