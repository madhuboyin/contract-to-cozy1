const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { readWarrantiesPage, ASK_RECORD_COLLECTION_READERS } = require('../../src/services/ask/askRecordCollections.service.ts');
const { warrantyFocus, warrantyStatus } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

const NOW = new Date('2026-10-19T12:00:00Z');
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000);
const warranty = (n, overrides = {}) => ({
  id: `war-${String(n).padStart(3, '0')}`, propertyId: 'p1', providerName: `Provider ${n}`, category: 'APPLIANCE', coverageDetails: null,
  startDate: day(-365), expiryDate: day(300), updatedAt: new Date('2026-10-01T00:00:00Z'), inventoryItem: null, documents: [], ...overrides,
});

function install(rows) {
  const state = { args: [] };
  prisma.warranty = { findMany: async (args) => { state.args.push(args); return rows.filter((row) => row.propertyId === args.where.propertyId); } };
  return state;
}
const read = (query = {}) => readWarrantiesPage('p1', query, NOW);

async function drain(query = {}) {
  const ids = [];
  let cursor = null;
  let guard = 0;
  do {
    const page = await read({ ...query, cursor });
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    assert.ok(++guard < 50);
  } while (cursor);
  return ids;
}

const MIXED = () => [
  warranty(1, { expiryDate: day(300) }),                                  // active
  warranty(2, { expiryDate: day(20) }),                                   // expiring
  warranty(3, { expiryDate: day(-10), startDate: day(-400) }),            // expired recently
  warranty(4, { expiryDate: day(-200), startDate: day(-600) }),           // expired long ago
  warranty(5, { startDate: day(30), expiryDate: day(400) }),              // starts later
  warranty(6, { startDate: day(10), expiryDate: day(5) }),                // invalid dates -> needs review
  warranty(7, { expiryDate: day(45) }),                                   // expiring (later)
  warranty(8, { propertyId: 'other' }),
];

test('warranties list in Ask order with the governed status, and never include another property', async () => {
  install(MIXED());
  const page = await read();
  assert.equal(page.total, 7);
  assert.deepEqual(page.rows.map((row) => [row.id, row.status]), [
    ['war-002', 'EXPIRING'], ['war-007', 'EXPIRING'], ['war-006', 'NEEDS_REVIEW'], ['war-001', 'ACTIVE'], ['war-005', 'STARTS_LATER'], ['war-003', 'EXPIRED'], ['war-004', 'EXPIRED'],
  ]);
  for (const row of page.rows) {
    const record = MIXED().find((candidate) => candidate.id === row.id);
    assert.equal(row.status, warrantyStatus(record, 'p1', NOW).key, row.id);
  }
  assert.equal(page.rows[0].daysRemaining, 20);
  assert.equal(page.rows[0].statusLabel, 'Expires within 60 days');
});

test('paging delivers every warranty once across page boundaries, including ties on expiry', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => warranty(index + 1, { expiryDate: day(300 + (index % 4)) }));
  install(rows);
  const first = await read({ limit: 25 });
  assert.equal(first.total, 60);
  assert.equal(first.truncated, true);
  const ids = await drain({ limit: 25 });
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60);
  install(MIXED());
  assert.deepEqual(await drain({ limit: 2 }), (await read()).rows.map((row) => row.id));
});

test('status, category, and search filters compose; search spans provider, linked item, and coverage text', async () => {
  install([
    warranty(1, { category: 'HVAC', providerName: 'CoolAir', inventoryItem: { name: 'Furnace' }, expiryDate: day(20) }),
    warranty(2, { category: 'PLUMBING', providerName: 'PipeCo', coverageDetails: 'Covers water heater leaks', expiryDate: day(20) }),
    warranty(3, { category: 'HVAC', providerName: 'Other', expiryDate: day(300) }),
  ]);
  assert.deepEqual((await read({ filters: { category: 'HVAC' } })).rows.map((row) => row.id), ['war-001', 'war-003']);
  assert.deepEqual((await read({ filters: { category: 'HVAC', status: 'EXPIRING' } })).rows.map((row) => row.id), ['war-001']);
  assert.deepEqual((await read({ search: 'FURNACE' })).rows.map((row) => row.id), ['war-001']);
  assert.deepEqual((await read({ search: 'water heater' })).rows.map((row) => row.id), ['war-002']);
  assert.deepEqual((await read({ search: 'pipeco' })).rows.map((row) => row.id), ['war-002']);
  const page = await read({ filters: { category: 'HVAC' } });
  assert.deepEqual(page.query, { search: null, filters: { category: 'HVAC' } });
  const options = Object.fromEntries(page.filterOptions.map((option) => [option.key, option.options.map((entry) => entry.value)]));
  assert.deepEqual(options.status, ['EXPIRING', 'ACTIVE']);
  assert.deepEqual(options.category, ['HVAC', 'PLUMBING']);
});

test('rows show recorded fields only: shortened coverage text, item, documents, and no policy number or cost', async () => {
  const state = install([warranty(1, { coverageDetails: 'x'.repeat(300), inventoryItem: { name: 'Water heater' }, documents: [{ id: 'd1' }], category: 'HOME_WARRANTY_PLAN', policyNumber: 'SECRET-1', cost: 99 })]);
  const { rows } = await read();
  assert.equal(rows[0].coverageSummary.length, 140);
  assert.ok(rows[0].coverageSummary.endsWith('…'));
  assert.equal(rows[0].itemName, 'Water heater');
  assert.equal(rows[0].hasDocuments, true);
  assert.equal(JSON.stringify(rows[0]).includes('SECRET-1'), false);
  assert.equal('policyNumber' in state.args[0].select || 'cost' in state.args[0].select, false);
});

test('each row question lands on its own category in Ask warranty focus', async () => {
  const categories = ['APPLIANCE', 'HVAC', 'ROOFING', 'PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'HOME_WARRANTY_PLAN', 'OTHER'];
  install(categories.map((category, index) => warranty(index + 1, { category })));
  const { rows } = await read();
  for (const row of rows) assert.equal(warrantyFocus(row.askQuestion).category, row.category, `${row.category}: ${row.askQuestion}`);
});

test('invalid queries are rejected and the paged flag matches the connected readers', async () => {
  install([warranty(1)]);
  for (const bad of [{ filters: { status: 'STARTS_NEVER' } }, { filters: { category: 'NOPE' } }, { cursor: 'x' }, { limit: 0 }]) {
    await assert.rejects(() => read(bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
  const paged = ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.pagedCollection).map((entry) => entry.id).sort();
  assert.deepEqual(paged, Object.keys(ASK_RECORD_COLLECTION_READERS).sort());
  assert.ok(paged.includes('warranties'));
});
