const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

// Findings Implementation Plan, Phase 6, F6-3 (owner decision OD-6.3: a bridge read for inventory items first). A Home Record linked to an inventory item
// from the Home Records page is a PropertyRecordLink, which the inventory screens did not read. These tests run the real bridge against an in-memory
// fake that evaluates the property, lifecycle and visibility filters. They do not prove Prisma's SQL.

const links = [];
const itemFindManyCalls = [];

const record = (id, over = {}) => ({ id, propertyId: 'p1', visibility: 'HOUSEHOLD', title: `Record ${id}`, recordType: 'MANUAL', lifecycleStatus: 'ACTIVE', ...over });
const matches = (rec, filter) => {
  if (filter.propertyId && rec.propertyId !== filter.propertyId) return false;
  if (filter.visibility && rec.visibility !== filter.visibility) return false;
  if (filter.lifecycleStatus?.not && rec.lifecycleStatus === filter.lifecycleStatus.not) return false;
  return true;
};

const fakePrisma = {
  propertyRecordLink: {
    findMany: async ({ where, distinct }) => {
      const ids = where.entityId?.in;
      let rows = links.filter((l) => l.entityType === where.entityType && (!ids || ids.includes(l.entityId)) && matches(l.record, where.record));
      if (distinct) rows = rows.filter((l, i, all) => all.findIndex((x) => x.entityId === l.entityId) === i);
      return rows.map((l) => ({ ...l, record: { id: l.record.id, title: l.record.title, recordType: l.record.recordType, lifecycleStatus: l.record.lifecycleStatus } }));
    },
  },
  inventoryItem: { findMany: async (args) => { itemFindManyCalls.push(args); return []; } },
  propertyResponsibility: { findMany: async () => [] },
};
const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: fakePrisma } };

const { linkedRecordsByEntity, entityIdsWithLinkedRecords } = require('../../src/services/entityLinkedRecords.service.ts');
const { InventoryService } = require('../../src/services/inventory.service.ts');

function reset() {
  links.length = 0;
  itemFindManyCalls.length = 0;
  links.push(
    { id: 'l1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', purpose: 'MANUAL', createdAt: new Date(3), record: record('manual') },
    { id: 'l2', entityType: 'INVENTORY_ITEM', entityId: 'item-1', purpose: 'EVIDENCE', createdAt: new Date(2), record: record('appraisal', { visibility: 'OWNER_ONLY' }) },
    { id: 'l3', entityType: 'INVENTORY_ITEM', entityId: 'item-2', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('trashed', { lifecycleStatus: 'TRASHED' }) },
    { id: 'l4', entityType: 'INVENTORY_ITEM', entityId: 'item-3', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('archived', { lifecycleStatus: 'ARCHIVED' }) },
    { id: 'l5', entityType: 'INVENTORY_ITEM', entityId: 'item-4', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('other-home', { propertyId: 'p2' }) },
    { id: 'l6', entityType: 'WARRANTY', entityId: 'item-1', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('warranty-doc') },
  );
}
test.beforeEach(reset);

const titles = (list) => (list ?? []).map((ref) => ref.title).sort();
const read = (role) => linkedRecordsByEntity({ propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityIds: ['item-1', 'item-2', 'item-3', 'item-4'], role });

test('an item shows the Home Records linked to it, with the fields the screen needs', async () => {
  const map = await read('OWNER');
  assert.deepEqual(titles(map.get('item-1')), ['Record appraisal', 'Record manual']);
  const manual = map.get('item-1').find((ref) => ref.recordId === 'manual');
  assert.deepEqual(manual, { linkId: 'l1', recordId: 'manual', title: 'Record manual', recordType: 'MANUAL', lifecycleStatus: 'ACTIVE', purpose: 'MANUAL' });
});

test('an owner-only record is shown to an owner and to no one else; an omitted role is the least privileged', async () => {
  assert.deepEqual(titles((await read('OWNER')).get('item-1')), ['Record appraisal', 'Record manual']);
  for (const role of ['CONTRIBUTOR', 'VIEWER', undefined]) {
    assert.deepEqual(titles((await read(role)).get('item-1')), ['Record manual'], String(role));
  }
});

test('a trashed record is not shown, an archived one is (with its lifecycle), and another property\'s record never appears', async () => {
  const map = await read('OWNER');
  assert.equal(map.has('item-2'), false, 'trashed');
  assert.deepEqual((map.get('item-3') ?? []).map((ref) => ref.lifecycleStatus), ['ARCHIVED']);
  assert.equal(map.has('item-4'), false, 'a record from another property');
});

test('only links to the requested entity type are read, and an empty request reads nothing', async () => {
  const map = await linkedRecordsByEntity({ propertyId: 'p1', entityType: 'WARRANTY', entityIds: ['item-1'], role: 'OWNER' });
  assert.deepEqual(titles(map.get('item-1')), ['Record warranty-doc']);
  assert.equal((await linkedRecordsByEntity({ propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityIds: [], role: 'OWNER' })).size, 0);
});

test('the set of items with a visible linked record follows the same rules', async () => {
  assert.deepEqual([...await entityIdsWithLinkedRecords({ propertyId: 'p1', entityType: 'INVENTORY_ITEM', role: 'OWNER' })].sort(), ['item-1', 'item-3']);
  links.push({ id: 'l7', entityType: 'INVENTORY_ITEM', entityId: 'item-9', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('private-only', { visibility: 'OWNER_ONLY' }) });
  assert.deepEqual([...await entityIdsWithLinkedRecords({ propertyId: 'p1', entityType: 'INVENTORY_ITEM', role: 'OWNER' })].sort(), ['item-1', 'item-3', 'item-9']);
  assert.deepEqual([...await entityIdsWithLinkedRecords({ propertyId: 'p1', entityType: 'INVENTORY_ITEM', role: 'VIEWER' })].sort(), ['item-1', 'item-3'], 'the item whose only record is owner-only does not count as having documents for a viewer');
});

const service = new InventoryService();

test('hasDocuments=true matches an item with a legacy document OR a visible linked record, and keeps the existing visibility filter', async () => {
  await service.listItems('p1', { hasDocuments: true, role: 'OWNER' });
  const where = itemFindManyCalls[0].where;
  assert.equal(where.propertyId, 'p1');
  assert.ok(where.AND.length >= 3, 'the original visible-item filters are still there, plus the new clause');
  const clause = where.AND[where.AND.length - 1];
  assert.deepEqual(clause.OR[0], { documents: { some: {} } });
  assert.deepEqual(clause.OR[1].id.in.sort(), ['item-1', 'item-3']);
});

test('hasDocuments=false excludes items that have a linked record, so an item with only a linked record is not reported as missing documents', async () => {
  await service.listItems('p1', { hasDocuments: false, role: 'OWNER' });
  const clause = itemFindManyCalls[0].where.AND.at(-1);
  assert.deepEqual(clause.AND[0], { documents: { none: {} } });
  assert.deepEqual(clause.AND[1].id.notIn.sort(), ['item-1', 'item-3']);
});

test('hasDocuments for a viewer does not count an owner-only linked record', async () => {
  links.length = 0;
  links.push({ id: 'l1', entityType: 'INVENTORY_ITEM', entityId: 'item-1', purpose: 'EVIDENCE', createdAt: new Date(1), record: record('appraisal', { visibility: 'OWNER_ONLY' }) });
  await service.listItems('p1', { hasDocuments: true, role: 'VIEWER' });
  assert.deepEqual(itemFindManyCalls[0].where.AND.at(-1).OR[1].id.in, []);
});

test('no hasDocuments filter adds no clause (the common listing is unchanged)', async () => {
  await service.listItems('p1', {});
  assert.equal(itemFindManyCalls[0].where.AND.length, 2, 'only the original visibility filters');
});

test('the controller passes the caller\'s role to the list filter and to the bridge, on the list and on the detail', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/inventory.controller.ts'), 'utf8');
  assert.match(source, /const role = req\.householdRole;/);
  assert.match(source, /service\.listItems\(propertyId, \{ q, roomId, category, hasDocuments, role \}\)/);
  assert.match(source, /linkedRecordsByEntity\(\{ propertyId, entityType: 'INVENTORY_ITEM', entityIds: items\.map\(\(item\) => item\.id\), role \}\)/);
  assert.match(source, /entityIds: \[item\.id\], role: req\.householdRole/);
  assert.match(source, /homeRecordLinks: linked\.get\(item\.id\) \?\? \[\]/);
});
