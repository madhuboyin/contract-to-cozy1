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
  assert.equal(planShape789('Which items have no replacement cost recorded?').pointId, 'item.replacementCost');
  assert.equal(planShape789('How many appliances are missing a replacement value?').count, true);
  assert.equal(shape('How much does a new roof cost?'), null); assert.equal(shape('What is the replacement cost of my furnace?'), null);
  assert.equal(shape('Which appliances have I not serviced in over a year?'), 'STALE_SERVICE');
  assert.equal(planShape789('Which appliances have never been serviced?').cutoff, null);
  // FR-ONT-8: the warranty relation ("which appliances have / have no warranty") has no legacy recognizer any more; the typed
  // grammar and cross-domain executor are its sole producer, so the shape planner must never claim these questions.
  for (const m of ['Which appliances have no warranty?', 'Which appliances have a warranty?', 'Which appliances are out of warranty?', 'Provide details of appliances without warranty', 'Do any appliances have a warranty?', 'How many appliances are not having warranty?']) {
    assert.equal(planShape789(m), null, m);
  }
  assert.equal(shape('How has my property tax changed over the years?'), 'TIME_SERIES');
  assert.equal(planShape789('How has my assessed value changed?').pointId, 'taxAssessment.totalAssessedValue');
  assert.equal(shape('Compare my property tax to last year'), 'TIME_SERIES');
  for (const m of ['what is the serial number of my fridge', 'What is my property tax?', 'Which appliances are older than 10 years?', 'How often should I service my HVAC?', 'Which appliances have no flux capacitor?', 'Which items are missing warranty coverage?', 'What coverage gaps does my home have?']) assert.equal(shape(m), null, m);
  assert.equal(planShape789('which appliances have I not serviced in over 60 years'), null);
});
test('routing: these questions reach DATA_POINT_READ', () => {
  for (const m of ['Which appliances have no serial number recorded?', 'How has my property tax changed over the years?', 'Which appliances have I not serviced in over a year?']) assert.equal(resolveAskOperation(m).operationId, 'DATA_POINT_READ', m);
});
test('routing: the warranty relation reaches DATA_POINT_READ through the semantic entry, not a legacy rule (FR-ONT-8 parity)', () => {
  const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
  const { resolveAskSemanticEntryDecision } = require('../../src/services/ask/semantic/semanticEntryDispatcher.ts');
  for (const m of ['Which appliances have no warranty?', 'which items are having warranty', 'how many appliances are not having warranty', 'provide details of all items without warranty']) {
    const decision = resolveAskRoutingCascade(m, { propertyId: 'p1' });
    const entry = resolveAskSemanticEntryDecision({ rawMessage: m, routingStage: decision.stage, routingOperationId: decision.operation.operationId, requiresClarification: decision.requiresClarification, hasSemanticProvider: true });
    assert.equal(entry.shouldDispatchToSemanticEntry, true, m);
    assert.equal(entry.reasonCode, 'CROSS_DOMAIN_PLAN_MATCH', m);
  }
});
test('where clauses are property-scoped and built only from declarations', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no purchase date', now), now), { propertyId: 'p1', purchasedOn: null });
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no replacement cost recorded', now), now), { propertyId: 'p1', replacementCostCents: null });
  assert.deepEqual(shapeWhere('p1', planShape789('which appliances have no serial number', now), now), { propertyId: 'p1', OR: [{ serialNumber: null }, { serialNumber: '' }] });
  const stale = shapeWhere('p1', planShape789('which appliances have I not serviced in over 2 years', now), now);
  assert.equal(stale.propertyId, 'p1'); assert.equal(stale.OR[1].lastServicedOn.lt.toISOString().slice(0, 10), '2024-11-13');
  // No second, handler-local definition of the item-to-warranty relation remains (FR-ONT-7).
  assert.equal(planShape789('which appliances have no warranty', now), null);
  assert.throws(() => shapeWhere('p1', { shape: 'NO_WARRANTY' }, now));
});

function stub(role = 'OWNER') { propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' }); }
test('handler: absence and service gap answers name the items and what "not recorded" means (the warranty relation is answered by the typed-grammar executor, see crossDomainSemantic*.test.js)', async () => {
  stub();
  const calls = [];
  prisma.inventoryItem = { findMany: async (a) => {
    calls.push(a);
    return [{ id: 'i1', name: 'Dishwasher', lastServicedOn: null }, { id: 'i2', name: 'Furnace', lastServicedOn: new Date('2023-01-01') }];
  }, count: async (a) => (a.where.lastServicedOn === null ? 1 : 2) };
  const absent = await dataPointReadResult('u1', 'p1', 'Which appliances have no serial number recorded?');
  assert.match(absent.blocks[0].body, /Dishwasher; Furnace/); assert.match(absent.blocks[0].body, /does not exist/); assert.equal(calls[0].where.propertyId, 'p1');
  assert.equal(absent.parameters.dataPointQuery.snapshot, true);
  const stale = await dataPointReadResult('u1', 'p1', 'Which appliances have I not serviced in over a year?');
  assert.equal(stale.status, 'READY_WITH_LIMITATIONS'); assert.match(stale.blocks[0].body, /no service date at all/);
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
