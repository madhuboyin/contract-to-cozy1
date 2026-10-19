const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { matches, cmp } = require('./helpers/prismaWhereEval');
const { readInventoryPage, inventoryStatusWhere, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { inventoryMissingFacts, inventoryLifecycleHorizon } = require('../../src/services/ask/handlers/inventory.handler.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

const NOW = new Date('2026-10-19T12:00:00Z');
const item = (n, overrides = {}) => ({
  id: `item-${String(n).padStart(3, '0')}`, propertyId: 'p1', name: `Item ${n}`, assetType: null, tags: [], category: 'APPLIANCE', condition: 'GOOD', isVerified: true,
  updatedAt: new Date(NOW.getTime() - n * 60_000), expectedExpiryDate: null, brand: 'Acme', manufacturer: null, model: 'M1', modelNumber: null, serialNo: 'S1', serialNumber: null,
  purchasedOn: new Date('2024-01-01T00:00:00Z'), warrantyId: 'w1', insurancePolicyId: null, coverageEvidenceStatus: 'UNKNOWN', documents: [{ id: 'd1' }], roomId: null, room: null, upc: null, sku: null, ...overrides,
});

function install(rows) {
  const state = { rows, args: [] };
  prisma.inventoryItem = {
    findMany: async (args) => {
      state.args.push(args);
      const sorted = rows.filter((row) => matches(row, args.where)).sort((a, b) => cmp(b.updatedAt, a.updatedAt) || cmp(b.id, a.id));
      return sorted.slice(0, args.take).map((row) => ({ ...row, documents: row.documents.slice(0, 1) }));
    },
    count: async ({ where }) => state.rows.filter((row) => matches(row, where)).length,
    groupBy: async ({ where }) => [...new Set(state.rows.filter((row) => matches(row, where)).map((row) => row.category))].sort().map((category) => ({ category })),
  };
  prisma.inventoryRoom = { findMany: async () => [{ id: 'room-1', name: 'Kitchen' }, { id: 'room-2', name: 'Garage' }] };
  return state;
}

test('paging lists each visible item once, newest first, and never lists hidden risk-only or inferred-absent items', async () => {
  install([
    ...Array.from({ length: 60 }, (_, index) => item(index + 1)),
    item(100, { assetType: 'BASEMENT_FLOOD_RISK' }),
    item(101, { tags: ['INFERRED_NOT_PRESENT'] }),
    item(102, { propertyId: 'other' }),
  ]);
  const first = await readInventoryPage('p1', { limit: 25 });
  assert.equal(first.total, 60);
  assert.equal(first.delivered, 25);
  assert.equal(first.truncated, true);
  const seen = [...first.rows.map((row) => row.id)];
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await readInventoryPage('p1', { limit: 25, cursor });
    seen.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
  }
  assert.equal(seen.length, 60);
  assert.deepEqual(seen, Array.from({ length: 60 }, (_, index) => `item-${String(index + 1).padStart(3, '0')}`));
});

test('items sharing one updatedAt are neither duplicated nor skipped across a page boundary', async () => {
  const same = new Date('2026-10-01T00:00:00Z');
  install(Array.from({ length: 7 }, (_, index) => item(index + 1, { updatedAt: same })));
  const a = await readInventoryPage('p1', { limit: 3 });
  const b = await readInventoryPage('p1', { limit: 3, cursor: a.nextCursor });
  const c = await readInventoryPage('p1', { limit: 3, cursor: b.nextCursor });
  const ids = [...a.rows, ...b.rows, ...c.rows].map((row) => row.id);
  assert.equal(new Set(ids).size, 7);
  assert.equal(c.nextCursor, null);
});

test('the incomplete filter selects exactly the items Ask judges to have missing details', async () => {
  const items = [
    item(1), // complete
    item(2, { brand: null }), item(3, { brand: '', manufacturer: '' }), item(4, { brand: null, manufacturer: 'Maker' }), // manufacturer satisfies brand
    item(5, { model: null }), item(6, { model: null, modelNumber: 'MN' }),
    item(7, { serialNo: null }), item(8, { serialNo: null, serialNumber: 'SN' }),
    item(9, { purchasedOn: null }), item(10, { documents: [] }),
    item(11, { warrantyId: null }), item(12, { warrantyId: null, coverageEvidenceStatus: 'NOT_COVERED' }), item(13, { warrantyId: null, insurancePolicyId: 'pol' }),
  ];
  for (const candidate of items) {
    const expected = inventoryMissingFacts(candidate).length > 0;
    assert.equal(matches(candidate, inventoryStatusWhere('incomplete')), expected, `${candidate.name}: ${JSON.stringify(inventoryMissingFacts(candidate))}`);
  }
  install(items);
  const page = await readInventoryPage('p1', { filters: { status: 'incomplete' } });
  assert.deepEqual(page.rows.map((row) => row.name).sort(), items.filter((candidate) => inventoryMissingFacts(candidate).length).map((candidate) => candidate.name).sort());
  assert.deepEqual(page.rows.find((row) => row.name === 'Item 2').missingDetails, ['Brand or manufacturer']);
});

test('lifecycle and unverified filters follow the three-year horizon and verification flag', async () => {
  const horizon = inventoryLifecycleHorizon();
  const inside = new Date(horizon.getTime() - 86_400_000);
  const outside = new Date(horizon.getTime() + 86_400_000 * 30);
  install([item(1, { expectedExpiryDate: inside }), item(2, { expectedExpiryDate: outside }), item(3), item(4, { isVerified: false })]);
  const lifecycle = await readInventoryPage('p1', { filters: { status: 'lifecycle' } });
  assert.deepEqual(lifecycle.rows.map((row) => row.name), ['Item 1']);
  assert.equal(lifecycle.rows[0].endOfLifeBy, inside.toISOString());
  const unverified = await readInventoryPage('p1', { filters: { status: 'unverified' } });
  assert.deepEqual(unverified.rows.map((row) => row.name), ['Item 4']);
  assert.equal(unverified.rows[0].verified, false);
});

test('category, room, and search compose; search spans identity fields; options and echo are reported', async () => {
  install([
    item(1, { name: 'Water heater', category: 'PLUMBING', roomId: 'room-2', room: { name: 'Garage' }, serialNo: 'ZX-99' }),
    item(2, { name: 'Refrigerator', category: 'APPLIANCE', roomId: 'room-1', room: { name: 'Kitchen' }, brand: 'Frost' }),
    item(3, { name: 'Dishwasher', category: 'APPLIANCE', roomId: 'room-1', room: { name: 'Kitchen' } }),
  ]);
  const kitchenAppliances = await readInventoryPage('p1', { filters: { category: 'APPLIANCE', room: 'room-1' } });
  assert.equal(kitchenAppliances.total, 2);
  assert.deepEqual(kitchenAppliances.query.filters, { category: 'APPLIANCE', room: 'room-1' });
  assert.deepEqual((await readInventoryPage('p1', { search: 'zx-99' })).rows.map((row) => row.name), ['Water heater']);
  assert.deepEqual((await readInventoryPage('p1', { search: 'FROST' })).rows.map((row) => row.name), ['Refrigerator']);
  const keys = kitchenAppliances.filterOptions.map((option) => option.key);
  assert.deepEqual(keys, ['status', 'category', 'room']);
  assert.deepEqual(kitchenAppliances.filterOptions[1].options, [{ value: 'APPLIANCE', label: 'Appliance' }, { value: 'PLUMBING', label: 'Plumbing' }]);
});

test('rows are shaped for display with the declared Ask question', async () => {
  install([item(1, { name: 'Water heater', category: 'ROOF_EXTERIOR', condition: 'UNKNOWN', room: { name: 'Garage' }, brand: null, manufacturer: 'Rheem', model: null, modelNumber: 'XR40' })]);
  const { rows } = await readInventoryPage('p1', {});
  assert.deepEqual(rows[0], {
    id: 'item-001', name: 'Water heater', category: 'Roof Exterior', condition: null, roomName: 'Garage', brandModel: 'Rheem XR40', verified: true, missingDetails: [], endOfLifeBy: null,
    updatedAt: item(1).updatedAt.toISOString(), askQuestion: 'Show inventory item "Water heater"',
  });
});

test('invalid filters are rejected and the paged flag matches the connected readers', async () => {
  install([item(1)]);
  for (const bad of [{ filters: { status: 'broken' } }, { filters: { category: 'NOPE' } }, { filters: { room: 'a b' } }, { cursor: 'x' }]) {
    await assert.rejects(() => readInventoryPage('p1', bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
  const paged = ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.pagedCollection).map((entry) => entry.id).sort();
  assert.deepEqual(paged, Object.keys(ASK_RECORD_COLLECTION_READERS).sort());
  assert.deepEqual(paged, ['inventory', 'rooms']);
});
