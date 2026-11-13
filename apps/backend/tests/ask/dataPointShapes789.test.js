// FR-DATA-10 shapes 7-9 for the owner path: planning is declaration-driven, queries are property-scoped, answers are honest about what is not recorded.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { planShape789, shapeWhere } = require('../../src/services/ask/dataPoint/dataPointShapes789.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');

test('planning: absence, service gap, no warranty, change over time; ordinary questions are left alone', () => {
  const shape = (m) => planShape789(m)?.shape ?? null;
  assert.equal(shape('Which appliances have no serial number recorded?'), 'ABSENCE');
  assert.equal(planShape789('How many appliances are missing a purchase date?').count, true);
  assert.equal(shape('Which items have no model number on file?'), 'ABSENCE');
  assert.equal(shape('Which appliances have I not serviced in over a year?'), 'STALE_SERVICE');
  assert.equal(planShape789('Which appliances have never been serviced?').cutoff, null);
  assert.equal(shape('Which appliances have no warranty?'), 'NO_WARRANTY');
  assert.equal(planShape789('Which appliances are out of warranty?').currentOnly, true);
  assert.equal(planShape789('Which appliances have no warranty?').currentOnly, false);
  assert.equal(shape('How has my property tax changed over the years?'), 'TIME_SERIES');
  assert.equal(planShape789('How has my assessed value changed?').pointId, 'taxAssessment.totalAssessedValue');
  assert.equal(shape('Compare my property tax to last year'), 'TIME_SERIES');
  for (const m of ['what is the serial number of my fridge', 'What is my property tax?', 'Which appliances are older than 10 years?', 'Which appliances have a warranty?', 'How often should I service my HVAC?', 'Which appliances have no flux capacitor?', 'Which items are missing warranty coverage?', 'What coverage gaps does my home have?']) assert.equal(shape(m), null, m);
  assert.equal(planShape789('which appliances have I not serviced in over 60 years'), null);
});
test('routing: these questions reach DATA_POINT_READ', () => {
  for (const m of ['Which appliances have no serial number recorded?', 'Which appliances have no warranty?', 'How has my property tax changed over the years?', 'Which appliances have I not serviced in over a year?']) assert.equal(resolveAskOperation(m).operationId, 'DATA_POINT_READ', m);
});
test('where clauses are property-scoped and built only from declarations', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no purchase date', now), now), { propertyId: 'p1', purchasedOn: null });
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no serial number', now), now), { propertyId: 'p1', OR: [{ serialNumber: null }, { serialNumber: '' }] });
  const stale = shapeWhere('p1', planShape789('which appliances have I not serviced in over 2 years', now), now);
  assert.equal(stale.propertyId, 'p1'); assert.equal(stale.OR[1].lastServicedOn.lt.toISOString().slice(0, 10), '2024-11-13');
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no warranty', now), now), { propertyId: 'p1', linkedWarranties: { none: {} } });
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances are out of warranty', now), now).linkedWarranties.none.expiryDate.gte, now);
});

function stub(role = 'OWNER') { propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' }); }
test('handler: absence, no warranty and service gap answers name the items and what "not recorded" means', async () => {
  stub();
  const calls = [];
  prisma.inventoryItem = { findMany: async (a) => { calls.push(a); return [{ id: 'i1', name: 'Dishwasher', lastServicedOn: null }, { id: 'i2', name: 'Furnace', lastServicedOn: new Date('2023-01-01') }]; }, count: async (a) => (a.where.lastServicedOn === null ? 1 : 2) };
  const absent = await dataPointReadResult('u1', 'p1', 'Which appliances have no serial number recorded?');
  assert.match(absent.blocks[0].body, /Dishwasher; Furnace/); assert.match(absent.blocks[0].body, /does not exist/); assert.equal(calls[0].where.propertyId, 'p1');
  assert.equal(absent.parameters.dataPointQuery.snapshot, true);
  const stale = await dataPointReadResult('u1', 'p1', 'Which appliances have I not serviced in over a year?');
  assert.equal(stale.status, 'READY_WITH_LIMITATIONS'); assert.match(stale.blocks[0].body, /no service date at all/);
  const noWarranty = await dataPointReadResult('u1', 'p1', 'How many appliances have no warranty?');
  assert.match(noWarranty.blocks[0].title, /2 items have no warranty record/); assert.match(noWarranty.blocks[0].body, /without being linked/);
  prisma.inventoryItem = { findMany: async () => [], count: async () => 0 };
  const none = await dataPointReadResult('u1', 'p1', 'Which appliances have no serial number recorded?');
  assert.match(none.blocks[0].title, /Every item has its serial number/);
});
test('handler: change over tax years uses active, non-superseded records, one per year, oldest first', async () => {
  stub();
  let args;
  prisma.propertyTaxBillRecord = { findMany: async (a) => { args = a; return [{ id: 'b3', taxYear: 2025, billAmount: { toNumber: () => 6000 } }, { id: 'b2', taxYear: 2024, billAmount: { toNumber: () => 5500 } }, { id: 'b1', taxYear: 2023, billAmount: { toNumber: () => 5000 } }]; } };
  const r = await dataPointReadResult('u1', 'p1', 'How has my property tax changed over the years?');
  assert.deepEqual(args.where, { propertyId: 'p1', status: 'ACTIVE', supersededById: null }); assert.equal(args.take, 10);
  assert.match(r.blocks[0].body, /2023: \$5,000; 2024: \$5,500 \(\+\$500\); 2025: \$6,000 \(\+\$500\)/); assert.match(r.blocks[0].body, /rose by \$1,000 \(20\.0%\)/); assert.match(r.blocks[0].title, /up since 2023/);
  prisma.propertyTaxBillRecord = { findMany: async () => [{ id: 'b1', taxYear: 2025, billAmount: { toNumber: () => 6000 } }] };
  assert.match((await dataPointReadResult('u1', 'p1', 'How has my property tax changed?')).blocks[0].title, /Only one/);
  prisma.propertyTaxBillRecord = { findMany: async () => [] };
  assert.match((await dataPointReadResult('u1', 'p1', 'How has my property tax changed?')).blocks[0].title, /No property tax bill history/);
});
test('a viewer cannot learn serial or tax-bill facts through these shapes', async () => {
  stub('VIEWER');
  prisma.inventoryItem = { findMany: async () => { throw new Error('must not query'); }, count: async () => { throw new Error('must not query'); } };
  assert.equal((await dataPointReadResult('u1', 'p1', 'Which appliances have no serial number recorded?')).reasonCode, 'DATA_POINT_RESTRICTED');
  assert.equal((await dataPointReadResult('u1', 'p1', 'How has my property tax changed?')).reasonCode, 'DATA_POINT_RESTRICTED');
});
