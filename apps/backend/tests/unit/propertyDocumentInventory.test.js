const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The canonical document-read interface: Home Records authoritative, the legacy Document table projected only when a caller asks for it by
// name and always marked transitional. No dual-write, no reconciliation, and no invented mapping between the two stores' status vocabularies.
const prismaModule = require('../../src/lib/prisma.ts');
const { homeRecordsService } = require('../../src/services/homeRecords.service.ts');
const { listPropertyDocuments, propertyDocumentKindLabel } = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');

const realPrisma = prismaModule.prisma;
const realList = homeRecordsService.list;
const record = (id, recordType, createdAt, extra = {}) => ({
  id, title: `Record ${id}`, description: null, recordType, sensitivity: 'STANDARD', visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE',
  createdAt: new Date(createdAt), updatedAt: new Date(createdAt), needsReview: false, expiryStatus: null, ...extra,
});
const legacy = (id, type, verificationStatus, createdAt) => ({ id, name: `Legacy ${id}`, type, description: null, verificationStatus, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });

let listCalls; let documentQueries; let recordRows; let legacyRows;
function install(records = [], legacyDocs = []) {
  listCalls = []; documentQueries = []; recordRows = records; legacyRows = legacyDocs;
  homeRecordsService.list = async (propertyId, role, options) => { listCalls.push({ propertyId, role, options }); return recordRows; };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'document') return { findMany: async (args) => { documentQueries.push(args); return legacyRows; } };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; homeRecordsService.list = realList; });

test('by default only Home Records is read: the legacy table is never queried', async () => {
  install([record('r1', 'INVOICE', '2026-09-01')], [legacy('l1', 'INVOICE', 'VERIFIED', '2026-09-02')]);
  const inventory = await listPropertyDocuments({ propertyId: 'p1', role: 'CONTRIBUTOR' });
  assert.deepEqual(inventory.items.map((item) => item.id), ['r1']);
  assert.deepEqual(inventory.totals, { total: 1, homeRecords: 1, legacy: 0 });
  assert.equal(documentQueries.length, 0);
});

test('the caller\'s role reaches Home Records, which applies the record-level visibility rule; only active records are listed', async () => {
  install([]);
  await listPropertyDocuments({ propertyId: 'p1', role: 'VIEWER' });
  assert.deepEqual(listCalls, [{ propertyId: 'p1', role: 'VIEWER', options: { lifecycleStatus: 'ACTIVE' } }]);
});

test('the legacy branch is explicit, marked transitional, and merged newest first; Home Records rows are never transitional', async () => {
  install([record('r1', 'INVOICE', '2026-09-01'), record('r2', 'DEED', '2026-09-03')], [legacy('l1', 'CONTRACT', 'UNVERIFIED', '2026-09-02')]);
  const inventory = await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true });
  assert.deepEqual(inventory.items.map((item) => item.id), ['r2', 'l1', 'r1']);
  assert.deepEqual(inventory.items.map((item) => [item.source, item.transitional]), [['HOME_RECORD', false], ['LEGACY_DOCUMENT', true], ['HOME_RECORD', false]]);
  assert.deepEqual(inventory.totals, { total: 3, homeRecords: 2, legacy: 1 });
  assert.deepEqual(documentQueries[0].where, { deletedAt: null, propertyId: 'p1' });
});

test('each row carries only the facts its own store records, with no mapping between the vocabularies', async () => {
  install([record('r1', 'WARRANTY', '2026-09-01', { needsReview: true, expiryStatus: 'EXPIRING_SOON' })], [legacy('l1', 'INVOICE', 'REJECTED', '2026-09-02')]);
  const [legacyRow, recordRow] = (await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true })).items;
  assert.deepEqual([recordRow.verification, recordRow.needsReview, recordRow.expiry, recordRow.sensitivity, recordRow.visibility], [null, true, 'EXPIRING_SOON', 'STANDARD', 'HOUSEHOLD']);
  assert.deepEqual([legacyRow.verification, legacyRow.needsReview, legacyRow.expiry, legacyRow.sensitivity, legacyRow.visibility], ['REJECTED', null, null, null, null]);
});

test('a kind groups together whichever store holds it, and a legacy-only kind keeps its own label', async () => {
  assert.equal(propertyDocumentKindLabel('INVOICE'), 'Invoices');
  assert.equal(propertyDocumentKindLabel('DEED'), 'Deeds');
  assert.equal(propertyDocumentKindLabel('ESTIMATE'), 'Estimates');
  install([record('r1', 'INVOICE', '2026-09-01')], [legacy('l1', 'INVOICE', 'VERIFIED', '2026-09-02'), legacy('l2', 'ESTIMATE', 'PENDING', '2026-09-03')]);
  const inventory = await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true });
  assert.deepEqual(inventory.items.filter((item) => item.kind === 'INVOICE').map((item) => item.kindLabel), ['Invoices', 'Invoices']);
  assert.equal(inventory.items.find((item) => item.id === 'l2').kindLabel, 'Estimates');
});

test('inventory-linked legacy documents are included only when asked, for a caller that still counts them', async () => {
  install([], [legacy('l1', 'PHOTO', 'VERIFIED', '2026-09-02')]);
  await listPropertyDocuments({ propertyId: 'p1', role: 'OWNER', includeLegacy: true, includeInventoryLinkedLegacy: true });
  assert.deepEqual(documentQueries[0].where, { deletedAt: null, OR: [{ propertyId: 'p1' }, { inventoryItem: { propertyId: 'p1' } }] });
});
