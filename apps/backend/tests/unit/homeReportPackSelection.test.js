const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const planningContext = require('../../src/services/planningContext/context.ts');
const aggregationContext = require('../../src/services/aggregationContext/context.ts');
const { buildAuthoritativeReportSnapshot } = require('../../src/services/planningContext/reportSnapshot.ts');
const { buildRedactedReportSnapshot } = require('../../src/services/planningContext/redaction.ts');
const { buildHomeReportPackHtml } = require('../../src/services/pdf/templates/homeReportPackHtml.ts');
const { REPORT_PACK_SECTION_IDS, resolveStoredPackSections, defaultPackSectionsForType } = require('../../src/services/planningContext/reportPackSections.ts');
const { matches } = require('../ask/helpers/prismaWhereEval');

const ALL = [...REPORT_PACK_SECTION_IDS];
const ROOM = { id: 'room-1', name: 'Kitchen' };
const ITEMS = [
  { id: 'i1', name: 'Refrigerator', category: 'APPLIANCE', condition: 'GOOD', brand: 'Acme', modelNumber: 'M-1', serialNumber: 'SERIAL-SECRET', purchasedOn: null, purchaseCostCents: 90000, replacementCostCents: 120000, assetType: null, tags: [], room: ROOM, documents: [] },
  { id: 'i2', name: 'Basement flood exposure', category: 'OTHER', condition: 'UNKNOWN', brand: null, modelNumber: null, serialNumber: null, purchasedOn: null, purchaseCostCents: null, replacementCostCents: null, assetType: 'BASEMENT_FLOOD_RISK', tags: [], room: null, documents: [] },
  { id: 'i3', name: 'Chimney (not present)', category: 'STRUCTURAL', condition: 'UNKNOWN', brand: null, modelNumber: null, serialNumber: null, purchasedOn: null, purchaseCostCents: null, replacementCostCents: null, assetType: null, tags: ['INFERRED_NOT_PRESENT'], room: null, documents: [] },
];
const PROPERTY = {
  id: 'p1', address: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701', yearBuilt: 1990, propertySize: 2000,
  inventoryRooms: [ROOM], inventoryItems: ITEMS,
  insurancePolicies: [{ id: 'pol1', carrierName: 'Acme Mutual', policyNumber: 'POL-SECRET', startDate: new Date('2026-01-01'), expiryDate: new Date('2027-01-01'), premiumAmount: 1800, personalPropertyLimitCents: 5_000_000, documents: [] }],
  warranties: [{ id: 'w1', providerName: 'FixCo', policyNumber: 'WAR-SECRET', startDate: new Date('2026-01-01'), expiryDate: new Date('2028-01-01'), coverageDetails: 'Parts', documents: [] }],
  maintenanceTasks: [{ id: 't2', title: 'Open task', status: 'PENDING', priority: 'LOW', riskLevel: null, frequency: null, nextDueDate: null, lastCompletedDate: null, estimatedCost: null, actualCost: null, assetType: null, source: 'USER_CREATED' }, { id: 't1', title: 'Replace filter', status: 'COMPLETED', priority: 'HIGH', riskLevel: 'HIGH', frequency: null, nextDueDate: null, lastCompletedDate: null, estimatedCost: null, actualCost: null, assetType: null, source: 'USER_CREATED' }],
};

function install() {
  const calls = { findUnique: [] };
  const savedPlanning = planningContext.getPlanningContextDecisions;
  const savedAggregation = aggregationContext.getAggregationContextEnvelope;
  planningContext.getPlanningContextDecisions = async () => ({ contextVersion: 'v1', context: { facts: {} }, decisions: { reportGeneration: { status: 'APPLICABLE', reasonCodes: [], missingFactKeys: [] } } });
  aggregationContext.getAggregationContextEnvelope = async () => ({ decision: { status: 'APPLICABLE' } });
  prisma.property = {
    findUnique: async (args) => {
      calls.findUnique.push(args);
      const row = { ...PROPERTY };
      // Only what the query asks for is returned, and a relation filter is applied as the database would.
      for (const key of ['inventoryRooms', 'inventoryItems', 'insurancePolicies', 'warranties', 'maintenanceTasks']) {
        const asked = args.include?.[key];
        if (!asked) delete row[key];
        else if (asked.where) row[key] = row[key].filter((entry) => matches(entry, asked.where));
      }
      return row;
    },
  };
  return { calls, restore: () => { planningContext.getPlanningContextDecisions = savedPlanning; aggregationContext.getAggregationContextEnvelope = savedAggregation; } };
}
const build = (extra = {}) => buildAuthoritativeReportSnapshot({ userId: 'u1', propertyId: 'p1', ...extra });
const selection = (included) => ({ version: 1, requested: included, included, unavailable: [] });

test('the maintenance section exports completed history only, as the Record lists it', async () => {
  const { calls, restore } = install();
  try {
    const snapshot = await build({ sections: selection(['maintenance-history']) });
    assert.deepEqual(calls.findUnique[0].include.maintenanceTasks, { where: { status: 'COMPLETED' } });
    assert.deepEqual(snapshot.maintenance.tasks.map((task) => task.id), ['t1']);
  } finally { restore(); }
});

test('files attached to an exported item, policy, or warranty never include a deleted document', async () => {
  const { calls, restore } = install();
  try {
    await build();
    const include = calls.findUnique[0].include;
    const where = { deletedAt: null };
    assert.deepEqual(include.inventoryItems.include.documents, { where });
    assert.deepEqual(include.insurancePolicies.include.documents, { where });
    assert.deepEqual(include.warranties.include.documents, { where });
  } finally { restore(); }
});

test('inventory the Record and Ask hide never reaches the pack, whichever way the export was requested', async () => {
  const { calls, restore } = install();
  try {
    for (const extra of [{}, { type: 'HOME_REPORT_PACK' }, { sections: selection(['inventory']) }, { type: 'INVENTORY' }]) {
      const snapshot = await build(extra);
      assert.deepEqual(snapshot.inventory.items.map((item) => item.name), ['Refrigerator'], JSON.stringify(extra));
    }
    assert.equal(calls.findUnique.every((args) => args.include.inventoryItems.where.AND), true, 'the shared visibility filter is on every query');
  } finally { restore(); }
});

test('only the selected sections are read: an unselected section’s data never enters the snapshot', async () => {
  const { calls, restore } = install();
  try {
    const snapshot = await build({ sections: selection(['coverage']) });
    assert.deepEqual(Object.keys(calls.findUnique[0].include), ['insurancePolicies']);
    assert.deepEqual(snapshot.meta.pack, { included: ['coverage'] });
    assert.deepEqual([snapshot.inventory.items.length, snapshot.inventory.rooms.length, snapshot.maintenance.tasks.length, snapshot.coverage.warranties.length, snapshot.coverage.insurancePolicies.length], [0, 0, 0, 0, 1]);
    assert.deepEqual([snapshot.property.dwellingType, snapshot.property.yearBuilt, snapshot.property.livingAreaSqft, snapshot.property.nickname], [null, null, null, null]);
    assert.deepEqual([snapshot.property.addressLine1, snapshot.property.city, snapshot.property.zipCode], ['1 Main St', 'Austin', '78701'], 'identity is always on the cover');
    const facts = await build({ sections: selection(['property-facts']) });
    assert.equal(facts.property.yearBuilt, 1990);
    assert.deepEqual(Object.keys(calls.findUnique.at(-1).include), []);
  } finally { restore(); }
});

test('with no selection the export type decides, and an export stored before selections existed is unchanged', async () => {
  assert.deepEqual(defaultPackSectionsForType('INVENTORY'), ['rooms', 'inventory']);
  assert.deepEqual(defaultPackSectionsForType('COVERAGE_SNAPSHOT'), ['coverage', 'warranties']);
  assert.deepEqual(defaultPackSectionsForType('HOME_REPORT_PACK'), ALL);
  assert.deepEqual(defaultPackSectionsForType(undefined), ALL);
  assert.deepEqual(resolveStoredPackSections(null), ALL);
  assert.deepEqual(resolveStoredPackSections({ legacy: true }, 'MAINTENANCE_HISTORY'), ['maintenance-history']);
  assert.deepEqual(resolveStoredPackSections({ version: 1, included: ['inventory', 'bogus', 'coverage'] }), ['inventory', 'coverage']);
  const { restore } = install();
  try {
    assert.deepEqual((await build()).meta.pack.included, ALL);
    assert.deepEqual((await build({ type: 'INVENTORY' })).meta.pack.included, ['rooms', 'inventory']);
  } finally { restore(); }
});

test('the shared copy carries the selection and only what was selected, still redacted', async () => {
  const { restore } = install();
  try {
    const snapshot = await build({ sections: selection(['inventory', 'warranties']) });
    const redacted = buildRedactedReportSnapshot(snapshot);
    assert.deepEqual(redacted.meta.pack, { included: ['inventory', 'warranties'] });
    const json = JSON.stringify(redacted);
    assert.equal(/SERIAL-SECRET|WAR-SECRET|POL-SECRET|78701|1 Main St|Acme Mutual/.test(json), false);
    assert.deepEqual([redacted.coverage.insurancePolicies.length, redacted.maintenance.tasks.length, redacted.coverage.warranties.length, redacted.inventory.items.length], [0, 0, 1, 1]);
    assert.equal(buildRedactedReportSnapshot({ meta: {}, property: {} }).meta.pack, null, 'a snapshot stored before selections existed redacts as before');
  } finally { restore(); }
});

const html = (included, snapshotOverrides = {}) => {
  const base = { meta: { generatedAt: '2026-10-19T12:00:00.000Z', ...(included ? { pack: { included } } : {}) }, property: { addressLine1: '1 Main St', city: 'Austin', state: 'TX', yearBuilt: 1990, livingAreaSqft: 2000, dwellingType: 'SINGLE_FAMILY' },
    inventory: { rooms: [ROOM], items: [ITEMS[0]] }, maintenance: { tasks: PROPERTY.maintenanceTasks }, coverage: { insurancePolicies: [{ providerName: 'Acme Mutual', policyNumber: 'POL-SECRET', expiryDate: '2027-01-01' }], warranties: [{ providerName: 'FixCo', policyNumber: 'WAR-SECRET', expiryDate: '2028-01-01' }] } };
  return buildHomeReportPackHtml({ ...base, ...snapshotOverrides });
};
const pages = (markup) => ['inventory', 'maintenance', 'coverage'].filter((id) => markup.includes(`id="${id}"`));

test('the PDF renders only the selected sections and its table of contents lists only them', () => {
  assert.deepEqual(pages(html(null)), ['inventory', 'maintenance', 'coverage'], 'a snapshot with no selection renders everything');
  assert.deepEqual(pages(html(ALL)), ['inventory', 'maintenance', 'coverage']);
  assert.deepEqual(pages(html(['maintenance-history'])), ['maintenance']);
  assert.deepEqual(pages(html(['rooms'])), ['inventory']);
  assert.deepEqual(pages(html(['warranties'])), ['coverage']);
  const toc = (markup) => [...markup.matchAll(/href="#(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(toc(html(['coverage'])), ['summary', 'coverage', 'disclaimer']);
  assert.deepEqual(toc(html([])), ['summary', 'disclaimer']);
});

test('an unselected section’s values appear nowhere in the PDF markup', () => {
  const onlyMaintenance = html(['maintenance-history']);
  for (const hidden of ['Refrigerator', 'SERIAL', 'POL-SECRET', 'WAR-SECRET', 'Acme Mutual', 'Kitchen', 'Year built', 'Replacement total']) assert.equal(onlyMaintenance.includes(hidden), false, hidden);
  assert.equal(onlyMaintenance.includes('Replace filter'), true);
  const onlyCoverage = html(['coverage']);
  assert.equal(onlyCoverage.includes('Acme Mutual'), true);
  assert.equal(onlyCoverage.includes('FixCo'), false);
  assert.equal(onlyCoverage.includes('Refrigerator') || onlyCoverage.includes('Replace filter'), false);
  const rooms = html(['rooms']);
  assert.equal(rooms.includes('Rooms (1)') && rooms.includes('Kitchen'), true);
  assert.equal(rooms.includes('Refrigerator'), false);
  assert.equal(html(['property-facts']).includes('Year built: 1990'), true);
  assert.equal(html(['inventory']).includes('Year built'), false);
});
