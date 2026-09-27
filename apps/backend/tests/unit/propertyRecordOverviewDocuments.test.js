const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Property Summary's documents section on the canonical inventory: the counts each state a fact the row's OWN store records, Home Records
// is read with the caller's role, and the transitional legacy branch (including inventory-attached documents) is requested by name.
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const inventoryModule = require('../../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const skillRuntime = require('../../src/services/skills/skillConsumerRuntime.ts');
const { getPropertyRecordOverview } = require('../../src/services/propertyRecordOverview.service.ts');

const originals = { access: propertyAccess.resolvePropertyAccess, list: inventoryModule.listPropertyDocuments, invoke: skillRuntime.invokeReadSkillOperationForConsumer };
const doc = (id, source, extra = {}) => ({
  id, source, transitional: source === 'LEGACY_DOCUMENT', title: `Doc ${id}`, kind: 'INVOICE', kindLabel: 'Invoices', description: null,
  addedAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'), verification: null, needsReview: null, expiry: null, lifecycle: 'ACTIVE', sensitivity: null, visibility: null, ...extra,
});
let listCalls;
function install(items) {
  listCalls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
  inventoryModule.listPropertyDocuments = async (input) => { listCalls.push(input); return { items, totals: { total: items.length, homeRecords: items.filter((item) => item.source === 'HOME_RECORD').length, legacy: items.filter((item) => item.transitional).length } }; };
  skillRuntime.invokeReadSkillOperationForConsumer = async ({ execute }) => execute();
}
test.afterEach(() => { propertyAccess.resolvePropertyAccess = originals.access; inventoryModule.listPropertyDocuments = originals.list; skillRuntime.invokeReadSkillOperationForConsumer = originals.invoke; });

test('the documents section counts each store\'s own facts and asks the canonical inventory with the caller\'s role', async () => {
  install([
    doc('r1', 'HOME_RECORD', { needsReview: true }), doc('r2', 'HOME_RECORD', { needsReview: false }),
    doc('l1', 'LEGACY_DOCUMENT', { verification: 'VERIFIED' }), doc('l2', 'LEGACY_DOCUMENT', { verification: 'UNVERIFIED' }), doc('l3', 'LEGACY_DOCUMENT', { verification: 'REJECTED' }),
  ]);
  const overview = await getPropertyRecordOverview('p1', 'u1', 'ASK');
  assert.deepEqual(listCalls, [{ propertyId: 'p1', role: 'CONTRIBUTOR', includeLegacy: true, includeInventoryLinkedLegacy: true }]);
  const section = overview.sections.documents;
  assert.equal(section.status, 'AVAILABLE');
  assert.equal(section.data.totalCount, 5);
  assert.equal(section.data.homeRecordCount, 2);
  assert.equal(section.data.legacyCount, 3);
  assert.equal(section.data.verifiedCount, 1, 'verified is the legacy verification status only; a Home Record has needs-review instead');
  assert.equal(section.data.needsReviewCount, 3, 'one Home Record awaiting review plus two legacy documents that are not verified');
  assert.equal(section.data.linkedCount, 5);
  assert.deepEqual(section.data.byType, [{ type: 'INVOICE', count: 5 }]);
  assert.equal(section.data.latest.id, 'r1');
});

test('an empty inventory is an available, empty section, not an unavailable one', async () => {
  install([]);
  const section = (await getPropertyRecordOverview('p1', 'u1', 'ASK')).sections.documents;
  assert.equal(section.status, 'AVAILABLE');
  assert.equal(section.data.totalCount, 0);
  assert.equal(section.data.latest, null);
});

test('a failing inventory read makes the section unavailable instead of failing the whole overview', async () => {
  install([]);
  inventoryModule.listPropertyDocuments = async () => { throw new Error('down'); };
  const section = (await getPropertyRecordOverview('p1', 'u1', 'ASK')).sections.documents;
  assert.equal(section.status, 'UNAVAILABLE');
});
