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

// Property-level signals: counts and a latest-of-kind lookup that never return a listing and never depend on the caller's role.
const { countPropertyDocuments, latestPropertyDocumentOfKind } = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');

function installSignals({ recordCount = 0, legacyCount = 0, recordLatest = null, legacyLatest = null } = {}) {
  const calls = { recordCount: [], documentCount: [], recordFind: [], documentFind: [] };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'propertyRecord') return { count: async (args) => { calls.recordCount.push(args); return recordCount; }, findFirst: async (args) => { calls.recordFind.push(args); return recordLatest; } };
    if (model === 'document') return { count: async (args) => { calls.documentCount.push(args); return legacyCount; }, findFirst: async (args) => { calls.documentFind.push(args); return legacyLatest; } };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  return calls;
}

test('countPropertyDocuments adds active Home Records to the legacy vault only when asked, and excludes soft-deleted legacy rows', async () => {
  let calls = installSignals({ recordCount: 3, legacyCount: 2 });
  assert.deepEqual(await countPropertyDocuments({ propertyId: 'p1' }), { total: 3, homeRecords: 3, legacy: 0 });
  assert.equal(calls.documentCount.length, 0, 'the legacy table is not read unless named');
  assert.deepEqual(calls.recordCount[0].where, { propertyId: 'p1', lifecycleStatus: 'ACTIVE' });
  calls = installSignals({ recordCount: 3, legacyCount: 2 });
  assert.deepEqual(await countPropertyDocuments({ propertyId: 'p1', includeLegacy: true }), { total: 5, homeRecords: 3, legacy: 2 });
  assert.deepEqual(calls.documentCount[0].where, { propertyId: 'p1', deletedAt: null });
});

test('the linked count uses a Home Records entity link and the legacy link columns', async () => {
  const calls = installSignals({ recordCount: 1, legacyCount: 4 });
  const counts = await countPropertyDocuments({ propertyId: 'p1', includeLegacy: true, linkedToOtherRecords: true });
  assert.equal(counts.total, 5);
  assert.deepEqual(calls.recordCount[0].where.links, { some: { entityType: { in: ['INVENTORY_ITEM', 'WARRANTY', 'INSURANCE_POLICY'] } } });
  assert.deepEqual(calls.documentCount[0].where.OR, [{ inventoryItemId: { not: null } }, { warrantyId: { not: null } }, { policyId: { not: null } }]);
});

test('the latest document of a kind is the most recently updated across both stores, and only Home Records when the legacy branch is not named', async () => {
  const newer = { id: 'l1', updatedAt: new Date('2026-09-05') };
  const older = { id: 'r1', updatedAt: new Date('2026-09-01') };
  let calls = installSignals({ recordLatest: older, legacyLatest: newer });
  assert.deepEqual(await latestPropertyDocumentOfKind({ propertyId: 'p1', kind: 'INSPECTION_REPORT', includeLegacy: true }), { id: 'l1', source: 'LEGACY_DOCUMENT', kind: 'INSPECTION_REPORT', updatedAt: newer.updatedAt });
  assert.equal(calls.recordFind[0].where.recordType, 'INSPECTION_REPORT');
  assert.equal(calls.documentFind[0].where.type, 'INSPECTION_REPORT');
  calls = installSignals({ recordLatest: older, legacyLatest: newer });
  assert.equal((await latestPropertyDocumentOfKind({ propertyId: 'p1', kind: 'INSPECTION_REPORT' })).source, 'HOME_RECORD');
  assert.equal(calls.documentFind.length, 0);
  installSignals({});
  assert.equal(await latestPropertyDocumentOfKind({ propertyId: 'p1', kind: 'INSPECTION_REPORT', includeLegacy: true }), null);
});

// Documents a workflow refers to by id (S5b): Home Records with the caller's role, never trashed, and only when every id resolves.
const { resolvePropertyDocuments, assertPropertyDocumentsExist } = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');

function installResolver({ records = [], legacy = [] } = {}) {
  const calls = { recordWhere: [], legacyWhere: [] };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'propertyRecord') return { findMany: async ({ where }) => { calls.recordWhere.push(where); return records.filter((row) => where.id.in.includes(row.id)); } };
    if (model === 'document') return { findMany: async ({ where }) => { calls.legacyWhere.push(where); return legacy.filter((row) => where.id.in.includes(row.id)); } };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  return calls;
}
const recordRow = (id, recordType = 'SURVEY') => ({ id, title: `Record ${id}`, recordType, createdAt: new Date('2026-09-01') });

test('resolvePropertyDocuments reads Home Records with the caller\'s role, skips trashed records, and de-duplicates ids', async () => {
  const calls = installResolver({ records: [recordRow('r1'), recordRow('r2', 'CLOSING_DOCUMENT')] });
  const refs = await resolvePropertyDocuments({ propertyId: 'p1', role: 'CONTRIBUTOR', ids: ['r1', 'r1', null, undefined, 'r2', 'missing'] });
  assert.deepEqual(refs.map((ref) => [ref.id, ref.source, ref.kindLabel]), [['r1', 'HOME_RECORD', 'Surveys'], ['r2', 'HOME_RECORD', 'Closing documents']]);
  assert.deepEqual(calls.recordWhere[0], { id: { in: ['r1', 'r2', 'missing'] }, propertyId: 'p1', lifecycleStatus: { not: 'TRASHED' }, visibility: 'HOUSEHOLD' });
  assert.equal(calls.legacyWhere.length, 0, 'a workflow that moved to Home Records never queries the legacy table');
  assert.deepEqual(await resolvePropertyDocuments({ propertyId: 'p1', role: 'OWNER', ids: [null, undefined] }), []);
});

test('an owner sees every record; the legacy branch is only read for the ids Home Records did not resolve, and only when named', async () => {
  const calls = installResolver({ records: [recordRow('r1')], legacy: [{ id: 'l1', name: 'Old scan', type: 'CONTRACT', createdAt: new Date('2026-08-01') }] });
  const refs = await resolvePropertyDocuments({ propertyId: 'p1', role: 'OWNER', ids: ['r1', 'l1'], includeLegacy: true });
  assert.deepEqual(refs.map((ref) => [ref.id, ref.source]), [['r1', 'HOME_RECORD'], ['l1', 'LEGACY_DOCUMENT']]);
  assert.deepEqual(calls.recordWhere[0].visibility, undefined, 'an owner is not filtered by visibility');
  assert.deepEqual(calls.legacyWhere[0].id, { in: ['l1'] });
});

test('assertPropertyDocumentsExist passes only when every id resolves, and throws the caller\'s own error otherwise', async () => {
  installResolver({ records: [recordRow('r1')] });
  await assertPropertyDocumentsExist({ propertyId: 'p1', role: 'OWNER', ids: ['r1', null] }, () => new Error('nope'));
  await assert.rejects(() => assertPropertyDocumentsExist({ propertyId: 'p1', role: 'OWNER', ids: ['r1', 'r2'] }, () => new Error('nope')), /nope/);
  await assertPropertyDocumentsExist({ propertyId: 'p1', role: 'OWNER', ids: [] }, () => new Error('never'));
});
