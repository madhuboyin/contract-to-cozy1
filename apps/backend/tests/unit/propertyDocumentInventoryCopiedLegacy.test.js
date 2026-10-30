const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// A legacy document whose exact file is already a Home Record (same SHA-256) is that record's older copy (made by scripts/copy-legacy-documents-to-home-records.ts), so
// the inventory neither lists nor counts it twice; a legacy row with no checksum is never hidden. No database, browser or native module.
const { prisma } = require('../../src/lib/prisma.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { listPropertyDocuments, countPropertyDocuments } = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');

let hashes; let docWhere; let countWhere; let saved;
test.beforeEach(() => {
  hashes = []; docWhere = null; countWhere = null;
  saved = { v: prisma.propertyRecordVersion, d: prisma.document, r: prisma.propertyRecord, list: homeRecordsService.list };
  prisma.propertyRecordVersion = { findMany: async () => hashes.map((sha256) => ({ sha256 })) };
  prisma.document = { findMany: async (args) => { docWhere = args.where; return []; }, count: async (args) => { countWhere = args.where; return 0; } };
  prisma.propertyRecord = { count: async () => 0 };
  homeRecordsService.list = async () => [];
});
test.afterEach(() => { prisma.propertyRecordVersion = saved.v; prisma.document = saved.d; prisma.propertyRecord = saved.r; homeRecordsService.list = saved.list; });

test('with copies in Home Records the legacy list and count leave out exactly those checksums, and keep rows with no checksum', async () => {
  hashes = ['aa', 'bb', 'aa'];
  await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true });
  assert.deepEqual(docWhere.AND, [{ OR: [{ sha256: null }, { sha256: { notIn: ['aa', 'bb'] } }] }]);
  await countPropertyDocuments({ propertyId: 'p1', includeLegacy: true });
  assert.deepEqual(countWhere.AND, [{ OR: [{ sha256: null }, { sha256: { notIn: ['aa', 'bb'] } }] }]);
  assert.equal(countWhere.deletedAt, null);
});

test('with no copies nothing is filtered, and without includeLegacy the legacy store is not read at all', async () => {
  await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true });
  assert.equal('AND' in docWhere, false);
  docWhere = null; countWhere = null; hashes = ['aa'];
  await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER' });
  await countPropertyDocuments({ propertyId: 'p1' });
  assert.equal(docWhere, null);
  assert.equal(countWhere, null);
});

test('the inventory-linked and linked-only filters still work beside the copy filter', async () => {
  hashes = ['aa'];
  await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true, includeInventoryLinkedLegacy: true });
  assert.ok(docWhere.OR && docWhere.AND, 'the property-or-inventory scope and the copy filter are both kept');
  await countPropertyDocuments({ propertyId: 'p1', includeLegacy: true, linkedToOtherRecords: true });
  assert.ok(countWhere.OR && countWhere.AND);
});
