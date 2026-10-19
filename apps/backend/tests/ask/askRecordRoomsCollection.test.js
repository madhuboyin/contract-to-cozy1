const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const { visibleInventoryItemWhere } = require('../../src/services/riskAssetApplicability.ts');
const {
  ASK_RECORD_COLLECTION_READERS,
  ASK_RECORD_COLLECTION_MAX_LIMIT,
  readRoomsPage,
  getAskRecordCollectionPage,
} = require('../../src/services/ask/askRecordCollections.service.ts');
const { ASK_RECORD_SECTION_REGISTRY } = require('../../src/services/ask/governance/askRecordSectionRegistry.ts');

// A small in-memory evaluator for exactly the where/orderBy shapes the rooms reader emits, so the keyset cursor is exercised for real.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function matches(row, where) {
  if (where.AND) return where.AND.every((clause) => matches(row, clause));
  if (where.OR) return where.OR.some((clause) => matches(row, clause));
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('gt' in condition) return cmp(row[key], condition.gt) > 0;
      if ('contains' in condition) return String(row[key]).toLowerCase().includes(condition.contains.toLowerCase());
      if ('not' in condition) return row[key] !== condition.not;
    }
    return row[key] === condition;
  });
}
const ordered = (rows) => [...rows].sort((a, b) => cmp(a.sortOrder, b.sortOrder) || cmp(a.name, b.name) || cmp(a.id, b.id));

function installRooms(initial) {
  const state = { rows: initial, findManyArgs: [] };
  prisma.inventoryRoom = {
    findMany: async (args) => {
      state.findManyArgs.push(args);
      return ordered(state.rows.filter((row) => matches(row, args.where))).slice(0, args.take).map((row) => ({ ...row, _count: { items: row.items ?? 0, maintenanceTasks: row.tasks ?? 0 } }));
    },
    count: async ({ where }) => state.rows.filter((row) => matches(row, where)).length,
    groupBy: async ({ where }) => [...new Set(state.rows.filter((row) => matches(row, { propertyId: where.propertyId, floorLevel: { not: null } })).map((row) => row.floorLevel))].sort((a, b) => a - b).map((floorLevel) => ({ floorLevel })),
  };
  return state;
}

const room = (n, overrides = {}) => ({
  id: `room-${String(n).padStart(3, '0')}`, propertyId: 'p1', name: `Room ${String(n).padStart(3, '0')}`, type: 'BEDROOM', floorLevel: null, sortOrder: 0, updatedAt: new Date('2026-10-01T12:00:00Z'), ...overrides,
});

async function drain(query) {
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await readRoomsPage('p1', { ...query, cursor });
    seen.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
    pages += 1;
    assert.ok(pages < 50, 'cursor must terminate');
  } while (cursor);
  return seen;
}

test('paging delivers every room once, in order, with an authoritative total and an explicit continuation', async () => {
  installRooms(Array.from({ length: 120 }, (_, index) => room(index + 1, { sortOrder: index % 3 })));
  const first = await readRoomsPage('p1', { limit: 50 });
  assert.equal(first.total, 120);
  assert.equal(first.delivered, 50);
  assert.equal(first.truncated, true);
  assert.ok(first.nextCursor);
  const all = await drain({ limit: 50 });
  assert.equal(all.length, 120);
  assert.equal(new Set(all).size, 120);
  const expected = ordered(Array.from({ length: 120 }, (_, index) => room(index + 1, { sortOrder: index % 3 }))).map((row) => row.id);
  assert.deepEqual(all, expected);
  const second = await readRoomsPage('p1', { limit: 50, cursor: first.nextCursor });
  assert.equal(second.delivered, 50);
  const last = await readRoomsPage('p1', { limit: 50, cursor: second.nextCursor });
  assert.equal(last.delivered, 20);
  assert.equal(last.nextCursor, null);
  assert.equal(last.truncated, false);
});

test('a final page that exactly fills the limit is not reported as truncated', async () => {
  installRooms(Array.from({ length: 50 }, (_, index) => room(index + 1)));
  const page = await readRoomsPage('p1', { limit: 50 });
  assert.equal(page.delivered, 50);
  assert.equal(page.nextCursor, null);
  assert.equal(page.truncated, false);
});

test('rooms added or removed between pages never duplicate or skip a remaining room', async () => {
  const state = installRooms(Array.from({ length: 10 }, (_, index) => room(index + 1)));
  const first = await readRoomsPage('p1', { limit: 4 });
  state.rows = state.rows.filter((row) => row.id !== 'room-002').concat([room(0, { id: 'room-000', name: 'Room 000' }), room(11)]);
  const rest = [];
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await readRoomsPage('p1', { limit: 4, cursor });
    rest.push(...page.rows.map((row) => row.id));
    cursor = page.nextCursor;
  }
  assert.deepEqual(rest, ['room-005', 'room-006', 'room-007', 'room-008', 'room-009', 'room-010', 'room-011']);
});

test('search and floor filters narrow the total and the pages together and are echoed back', async () => {
  installRooms([
    room(1, { name: 'Kitchen', floorLevel: 1 }), room(2, { name: 'Master bedroom', floorLevel: 2 }), room(3, { name: 'Guest bedroom', floorLevel: 2 }), room(4, { name: 'Garage' }),
  ]);
  const bedrooms = await readRoomsPage('p1', { search: ' BEDROOM ', filters: { floor: '2' } });
  assert.deepEqual(bedrooms.rows.map((row) => row.name), ['Guest bedroom', 'Master bedroom']);
  assert.equal(bedrooms.total, 2);
  assert.deepEqual(bedrooms.query, { search: 'BEDROOM', filters: { floor: '2' } });
  const unrecorded = await readRoomsPage('p1', { filters: { floor: 'none' } });
  assert.deepEqual(unrecorded.rows.map((row) => row.name), ['Garage']);
  const none = await readRoomsPage('p1', { search: 'sauna' });
  assert.equal(none.total, 0);
  assert.deepEqual(none.rows, []);
  assert.deepEqual(none.filterOptions[0].options.map((option) => option.value), ['1', '2', 'none']);
});

test('rows carry counts, floor, an Ask question, and the property scope is always applied', async () => {
  const state = installRooms([room(1, { name: 'Kitchen', type: 'KITCHEN', floorLevel: 1, items: 7, tasks: 2 }), room(2, { propertyId: 'other', name: 'Not mine' })]);
  const page = await readRoomsPage('p1', {});
  assert.equal(page.total, 1);
  assert.deepEqual(page.rows[0], { id: 'room-001', name: 'Kitchen', type: 'Kitchen', floorLevel: 1, itemCount: 7, openTaskCount: 2, updatedAt: '2026-10-01T12:00:00.000Z', askQuestion: 'Show me the items in my Kitchen.' });
  assert.equal(state.findManyArgs[0].where.propertyId, 'p1');
  assert.deepEqual(state.findManyArgs[0].select._count.select.items, { where: visibleInventoryItemWhere() }, 'a room counts only the inventory the Record shows');
});

test('limits are clamped and malformed queries are rejected', async () => {
  const state = installRooms(Array.from({ length: 3 }, (_, index) => room(index + 1)));
  await readRoomsPage('p1', { limit: 9999 });
  assert.equal(state.findManyArgs[0].take, ASK_RECORD_COLLECTION_MAX_LIMIT + 1);
  for (const bad of [{ limit: 0 }, { limit: 1.5 }, { cursor: 'not-a-cursor' }, { search: 'x'.repeat(81) }, { filters: { floor: 'upstairs' } }]) {
    await assert.rejects(() => readRoomsPage('p1', bad), (error) => error.code === 'ASK_INVALID_REQUEST', JSON.stringify(bad));
  }
});

test('the registry paged flag agrees with the connected readers', async () => {
  const paged = ASK_RECORD_SECTION_REGISTRY.filter((entry) => entry.pagedCollection).map((entry) => entry.id).sort();
  assert.deepEqual(paged, Object.keys(ASK_RECORD_COLLECTION_READERS).sort());
});
