// Phase 1b (reliability FRD D12, FR-DATA-3/4/15): reviewed catalogue, allowlisted point-read template, DATA_POINT_READ handler.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { DATA_POINT_DEFINITIONS, READABLE_ITEM_FIELDS, resolveDataPoint } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { matchItemsByName, readItemDataPoint } = require('../../src/services/ask/dataPoint/dataPointReader.ts');
const { resolveAskOperation, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');
const { dataPointReadResult, formatDataPointValue } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');

test('catalogue is fail closed: every readable field is a reviewed data point, none is sensitive-by-pattern', () => {
  assert.equal(READABLE_ITEM_FIELDS.length, DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'InventoryItem').length);
  const { EXCLUDED_FIELD_PATTERN } = require('../../scripts/lib/askDataCatalogue.js');
  // serial and model numbers are owner-visible home facts; no credential-like column may be in the catalogue
  for (const f of READABLE_ITEM_FIELDS) assert.equal(/password|token|secret|apiKey|credential|storageKey|s3Key|checksum/i.test(f), false, f);
  void EXCLUDED_FIELD_PATTERN;
});
test('every catalogued field exists on its Prisma model, and every entity is property-scoped by a plain propertyId column', () => {
  const { Prisma } = require('@prisma/client');
  for (const p of DATA_POINT_DEFINITIONS) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === p.entity);
    assert.ok(model.fields.some((f) => f.name === p.field), `${p.entity}.${p.field}`);
    assert.ok(model.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar'), `${p.entity} has no propertyId`);
    assert.equal(/password|token|secret|apiKey|credential/i.test(p.field), false);
  }
});
test('data points resolve from homeowner wording; ambiguity resolves to null, never a guess', () => {
  const cases = { 'what is the serial number of my fridge': 'item.serial', 'when was my furnace installed': 'item.installedOn', 'how much did I pay for my dryer': 'item.purchaseCost', 'when was my water heater last serviced': 'item.lastServicedOn', 'what condition is my dishwasher in': 'item.condition', 'what are the notes on my freezer': 'item.notes' };
  for (const [m, id] of Object.entries(cases)) assert.equal(resolveDataPoint(m)?.id, id, m);
  assert.equal(resolveDataPoint('how is the weather'), null);
});
test('item matching: names, synonyms, plurals; a different item does not match', () => {
  const items = [{ id: '1', name: 'Refrigerator' }, { id: '2', name: 'Water Heater' }, { id: '3', name: 'Dishwasher' }];
  assert.deepEqual(matchItemsByName('serial number of my fridge', items).map((i) => i.id), ['1']);
  assert.deepEqual(matchItemsByName('when was my water heater installed', items).map((i) => i.id), ['2']);
  assert.deepEqual(matchItemsByName('what is the model of my furnace', items), []);
});
test('routing: unrouted detail questions go to DATA_POINT_READ; existing routes still win', () => {
  assert.equal(resolveAskOperation('what are the notes on my freezer').operationId, 'DATA_POINT_READ');
  assert.equal(resolveAskOperation('how much does a new roof cost').operationId, 'ITEM_REPLACEMENT_COST');
  assert.equal(getAskOperationDefinition('DATA_POINT_READ').safetyClass, 'STANDARD');
});

function stub(items, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'VIEWER', isOwner: false });
  prisma.inventoryItem = { findMany: async (args) => { calls.push(args); return items; } };
}
test('the reader is property-scoped, capped, and selects only catalogued columns', async () => {
  const calls = []; stub([{ id: 'i1', name: 'Refrigerator', serialNumber: 'SN1', room: { name: 'Kitchen' } }], calls);
  const r = await readItemDataPoint('p1', resolveDataPoint('serial number of my fridge'), 'serial number of my fridge');
  assert.equal(r.status, 'FOUND');
  assert.deepEqual(calls[0].where, { propertyId: 'p1' }); assert.equal(calls[0].take, 200);
  assert.deepEqual(Object.keys(calls[0].select).sort(), ['id', 'name', 'room', 'serialNumber']);
});
test('handler: value present, not recorded, item not in inventory, nothing identified', async () => {
  stub([{ id: 'i1', name: 'Refrigerator', serialNumber: 'SN1', purchaseCostCents: null, room: null }]);
  const ok = await dataPointReadResult('u1', 'p1', 'what is the serial number of my fridge');
  assert.equal(ok.status, 'ANSWERED'); assert.match(ok.blocks[0].body, /SN1/); assert.equal(ok.blocks[0].id, 'data-point-summary');
  const none = await dataPointReadResult('u1', 'p1', 'how much did I pay for my fridge');
  assert.equal(none.reasonCode, 'DATA_POINT_NOT_RECORDED');
  const other = await dataPointReadResult('u1', 'p1', 'what is the serial number of my furnace');
  assert.equal(other.reasonCode, 'DATA_POINT_ITEM_NOT_FOUND');
  const unidentified = await dataPointReadResult('u1', 'p1', 'what is going on with my fridge');
  assert.equal(unidentified.reasonCode, 'DATA_POINT_NOT_IDENTIFIED');
  stub([]);
  assert.equal((await dataPointReadResult('u1', 'p1', 'what is the serial number of my fridge')).reasonCode, 'DATA_POINT_NO_INVENTORY');
});
test('formatting by family', () => {
  const by = (id) => DATA_POINT_DEFINITIONS.find((p) => p.id === id);
  assert.match(formatDataPointValue(by('item.purchaseCost'), 120000), /1,200/);
  assert.equal(formatDataPointValue(by('item.condition'), 'GOOD'), 'good');
  assert.equal(formatDataPointValue(by('item.tags'), ['a', 'b']), 'a, b');
});
test('a data point outside the catalogue is refused by the reader', async () => {
  await assert.rejects(readItemDataPoint('p1', { id: 'x', field: 'sourceHash' }, 'x'), /reviewed catalogue/);
});

test('the real answer survives the answer-trust pipeline (a rejected answer would become a clarification card)', async () => {
  const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
  const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
  stub([{ id: 'i1', name: 'Furnace', installedOn: new Date('2018-04-02T12:00:00Z'), purchaseCostCents: 450000, room: null }]);
  for (const question of ['when was my furnace installed', 'how much did I pay for my furnace']) {
    const answer = await dataPointReadResult('u1', 'p1', question);
    const checked = validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', propertyId: 'p1', semanticEnabled: true, result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]) });
    assert.equal(checked.result.status, 'ANSWERED', `${question}: ${JSON.stringify(checked.semantic)}`);
  }
  // notices (limitations) also pass as limitations rather than being replaced
  const none = await dataPointReadResult('u1', 'p1', 'what is the serial number of my furnace');
  const checkedNone = validateAskAnswerTrustPipeline({ question: 'what is the serial number of my furnace', operationId: 'DATA_POINT_READ', propertyId: 'p1', semanticEnabled: true, result: attachAskAuthoritativeSourceEvidence(none, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]) });
  assert.notEqual(checkedNone.result.status, 'NEEDS_CLARIFICATION', JSON.stringify(checkedNone.semantic));
});

test('other domains resolve by their cue word; a bare detail never picks an entity', () => {
  const cases = { 'when does my dishwasher warranty expire': 'warranty.expiryDate', 'who is my warranty with': 'warranty.provider', 'when does my insurance policy renew': 'policy.expiryDate', 'what is my insurance deductible': 'policy.deductible', 'when is my gutter cleaning task due': 'task.nextDueDate', 'when did I last complete the filter task': 'task.lastCompletedDate' };
  for (const [m, id] of Object.entries(cases)) assert.equal(resolveDataPoint(m)?.id, id, m);
  assert.equal(resolveDataPoint('when does it expire'), null);
  assert.equal(resolveDataPoint('when does my warranty or policy expire'), null);
});
test('warranty, policy and task reads are property-scoped, select catalogued columns only, and list a few unnamed records', async () => {
  const calls = [];
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'VIEWER', isOwner: false });
  prisma.warranty = { findMany: async (a) => { calls.push(['warranty', a]); return [{ id: 'w1', providerName: 'Frigidaire Protect', category: 'APPLIANCE', inventoryItem: { name: 'Dishwasher' }, expiryDate: new Date('2027-03-01T12:00:00Z') }]; } };
  prisma.insurancePolicy = { findMany: async (a) => { calls.push(['policy', a]); return [{ id: 'ip1', carrierName: 'State Farm', coverageType: 'HO3', deductibleCents: 100000 }]; } };
  prisma.propertyMaintenanceTask = { findMany: async (a) => { calls.push(['task', a]); return [{ id: 't1', title: 'Clean gutters', nextDueDate: new Date('2026-12-01T12:00:00Z') }, { id: 't2', title: 'Change furnace filter', nextDueDate: null }]; } };
  const w = await dataPointReadResult('u1', 'p1', 'when does my dishwasher warranty expire');
  assert.equal(w.status, 'ANSWERED'); assert.match(w.blocks[0].body, /Dishwasher warranty expires/);
  const unnamed = await dataPointReadResult('u1', 'p1', 'when does my warranty expire');
  assert.equal(unnamed.status, 'ANSWERED');
  const pol = await dataPointReadResult('u1', 'p1', 'what is my insurance deductible');
  assert.match(pol.blocks[0].body, /State Farm policy has a deductible of \$1,000/);
  const task = await dataPointReadResult('u1', 'p1', 'when is the gutter cleaning task due');
  assert.equal(task.status, 'ANSWERED'); assert.match(task.blocks[0].body, /Clean gutters/);
  const unnamedTask = await dataPointReadResult('u1', 'p1', 'when is my task due');
  assert.equal(unnamedTask.reasonCode, 'DATA_POINT_ITEM_NOT_FOUND');
  for (const [, a] of calls) { assert.deepEqual(a.where, { propertyId: 'p1' }); assert.ok(a.take <= 200); }
  assert.ok(!('sourceHash' in calls[0][1].select));
});
