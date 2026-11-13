// Phase 1b (reliability FRD D12, FR-DATA-3/4/15): reviewed catalogue, allowlisted point-read template, DATA_POINT_READ handler.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { DATA_POINT_DEFINITIONS, READABLE_ITEM_FIELDS, resolveDataPoint, APPROVED_DATA_POINT_IDS, DATA_POINT_CATALOGUE_VERSION, DATA_POINT_APPROVAL, audienceFloorCopy } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { matchItemsByName, readDataPoint } = require('../../src/services/ask/dataPoint/dataPointReader.ts');
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
    const rel = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts').RELATION_ENTITIES[p.entity];
    if (rel) { // a declared relation child: no plain propertyId, but its parent path must be allowlisted and the parent property-scoped
      assert.ok(model.fields.some((f) => f.name === rel.key && f.kind === 'scalar'), `${p.entity}.${rel.key}`);
      const parent = Prisma.dmmf.datamodel.models.find((m) => m.name === rel.parent);
      assert.ok(parent.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar'), `${rel.parent} has no propertyId`);
    } else assert.ok(model.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar'), `${p.entity} has no propertyId`);
    assert.equal(/password|token|secret|apiKey|credential/i.test(p.field), false);
  }
});
test('data points resolve from homeowner wording; ambiguity resolves to null, never a guess', () => {
  const cases = { 'what is the serial number of my fridge': 'item.serial', 'when was my furnace installed': 'item.installedOn', 'how much did I pay for my dryer': 'item.purchaseCost', 'when was my water heater last serviced': 'item.lastServicedOn', 'what condition is my dishwasher in': 'item.condition' };
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
  assert.equal(resolveAskOperation('what condition is my freezer in').operationId, 'DATA_POINT_READ');
  assert.equal(resolveAskOperation('how much does a new roof cost').operationId, 'ITEM_REPLACEMENT_COST');
  assert.equal(getAskOperationDefinition('DATA_POINT_READ').safetyClass, 'STANDARD');
});

function stub(items, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem = { findMany: async (args) => { calls.push(args); return items; } };
}
test('the reader is property-scoped, capped, and selects only catalogued columns', async () => {
  const calls = []; stub([{ id: 'i1', name: 'Refrigerator', serialNumber: 'SN1', room: { name: 'Kitchen' } }], calls);
  const r = await readDataPoint('p1', 'OWNER', resolveDataPoint('serial number of my fridge'), 'serial number of my fridge');
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
  await assert.rejects(readDataPoint('p1', 'OWNER', { id: 'x', entity: 'InventoryItem', field: 'sourceHash', audience: 'VIEWER' }, 'x'), /reviewed catalogue/);
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
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
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

const roleStub = (role, items) => {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.inventoryItem = { findMany: async () => items };
  prisma.warranty = { findMany: async () => [{ id: 'w1', providerName: 'A', category: 'APPLIANCE', inventoryItem: { name: 'Dishwasher' }, cost: 120, expiryDate: new Date('2027-03-01T12:00:00Z') }, { id: 'w2', providerName: 'B', category: 'APPLIANCE', inventoryItem: { name: 'Furnace' }, cost: 80, expiryDate: new Date('2028-03-01T12:00:00Z') }] };
};
test('every data point has an explicit audience floor, free-form item notes are not catalogued, and domains no longer claim claims', () => {
  for (const p of DATA_POINT_DEFINITIONS) assert.ok(['VIEWER', 'CONTRIBUTOR', 'OWNER'].includes(p.audience), p.id);
  assert.equal(DATA_POINT_DEFINITIONS.some((p) => p.field === 'notes'), false);
  assert.deepEqual([...new Set(DATA_POINT_DEFINITIONS.map((p) => p.domain))].sort(), ['appliances-inventory', 'buyer', 'documents-records', 'insurance', 'maintenance', 'reserve-ownership-costs', 'seller-prep', 'warranties']);
  for (const p of DATA_POINT_DEFINITIONS.filter((x) => x.sensitivity === 'FINANCIAL')) assert.notEqual(p.audience, 'VIEWER', `${p.id}: money is not shown to viewers`);
});
test('a viewer is refused a restricted field by the handler AND by the reader; a contributor is not', async () => {
  roleStub('VIEWER', [{ id: 'i1', name: 'Furnace', serialNumber: 'SN9', purchaseCostCents: 100000, installedOn: new Date('2018-04-02T12:00:00Z'), room: null }]);
  const denied = await dataPointReadResult('u1', 'p1', 'what is the serial number of my furnace');
  assert.equal(denied.reasonCode, 'DATA_POINT_RESTRICTED'); assert.ok(!JSON.stringify(denied).includes('SN9'));
  await assert.rejects(readDataPoint('p1', 'VIEWER', resolveDataPoint('serial number of my furnace'), 'serial number of my furnace'), /may not read/);
  assert.equal((await dataPointReadResult('u1', 'p1', 'when was my furnace installed')).status, 'ANSWERED', 'a viewer still reads plain facts');
  roleStub('CONTRIBUTOR', [{ id: 'i1', name: 'Furnace', serialNumber: 'SN9', room: null }]);
  assert.match((await dataPointReadResult('u1', 'p1', 'what is the serial number of my furnace')).blocks[0].body, /SN9/);
});
test('provenance: each answer carries the actual record id of its own entity, with the audience floor of restricted fields', async () => {
  roleStub('OWNER', []);
  prisma.insurancePolicy = { findMany: async () => [{ id: 'ip1', carrierName: 'State Farm', deductibleCents: 100000 }] };
  prisma.propertyMaintenanceTask = { findMany: async () => [{ id: 't1', title: 'Clean gutters', nextDueDate: new Date('2026-12-01T12:00:00Z') }] };
  const pol = await dataPointReadResult('u1', 'p1', 'what is my insurance deductible');
  assert.deepEqual(pol.parameters.sources, [{ sourceType: 'InsurancePolicy', sourceId: 'ip1', minRole: 'CONTRIBUTOR' }]);
  const task = await dataPointReadResult('u1', 'p1', 'when is the gutter cleaning task due');
  assert.deepEqual(task.parameters.sources, [{ sourceType: 'PropertyMaintenanceTask', sourceId: 't1' }]);
});
test('several warranties and none named: one clarification listing them, never all values unasked', async () => {
  roleStub('OWNER', []);
  const r = await dataPointReadResult('u1', 'p1', 'when does my warranty expire');
  assert.equal(r.reasonCode, 'DATA_POINT_AMBIGUOUS'); assert.match(r.blocks[0].body, /Dishwasher warranty, Furnace warranty/);
  assert.equal((await dataPointReadResult('u1', 'p1', 'when does my furnace warranty expire')).status, 'ANSWERED');
});
test('source authorization: a restricted source is redacted once the role drops, and the new entity types are checked against live rows for this property', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = [];
  const ctx = (role, present) => ({ userId: 'u1', propertyId: 'p1', role, exists: async (model, where) => { seen.push([model, where]); return present; } });
  const restricted = [{ ...sourceRef('InsurancePolicy', 'ip1'), minRole: 'CONTRIBUTOR' }];
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx('VIEWER', true), restricted), 'REDACT_SECTION');
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx('CONTRIBUTOR', true), restricted), 'AUTHORIZED');
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources({ ...ctx('OWNER', true), role: undefined }, restricted), 'REDACT_SECTION', 'no known role fails closed');
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx('OWNER', false), [sourceRef('PropertyMaintenanceTask', 't1')]), 'REDACT_SECTION');
  assert.deepEqual(seen.at(-1), ['PropertyMaintenanceTask', { id: 't1', propertyId: 'p1' }]);
});

test('owner approval (2026-11-12) covers exactly the 71 catalogued ids at catalogue version 6 (33 at v1 + 14 reserve-ownership-costs + 12 seller-prep/buyer + 4 record + 4 buyerTask + 4 buyerMilestone); any unapproved id or version drift fails', () => {
  assert.equal(DATA_POINT_CATALOGUE_VERSION, DATA_POINT_APPROVAL.catalogueVersion, 'a new catalogue version needs a new approval record');
  const ids = DATA_POINT_DEFINITIONS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.deepEqual(ids.filter((id) => !APPROVED_DATA_POINT_IDS.includes(id)), [], 'every catalogued id must be owner-approved');
  assert.deepEqual(APPROVED_DATA_POINT_IDS.filter((id) => !ids.includes(id)), [], 'an approved id that is no longer catalogued must be removed from the approval');
  assert.equal(ids.length, 71); assert.equal(DATA_POINT_CATALOGUE_VERSION, 6);
  const by = (d) => DATA_POINT_DEFINITIONS.filter((p) => p.domain === d).length;
  assert.deepEqual([by('appliances-inventory'), by('warranties'), by('insurance'), by('maintenance'), by('reserve-ownership-costs'), by('seller-prep'), by('buyer'), by('documents-records')], [14, 5, 7, 7, 14, 9, 11, 4]);
});
test('the restriction copy is generated from the field floor, so it never names a different audience than the check enforces', async () => {
  assert.match(audienceFloorCopy('CONTRIBUTOR').title, /contributors and owners/);
  assert.match(audienceFloorCopy('OWNER').title, /owner/); assert.doesNotMatch(audienceFloorCopy('OWNER').title, /contributors/);
  // a viewer reading a CONTRIBUTOR-floor field gets the contributor copy; an OWNER-floor point (none catalogued today) would get the owner copy
  roleStub('VIEWER', [{ id: 'i1', name: 'Furnace', serialNumber: 'SN9', room: null }]);
  const denied = await dataPointReadResult('u1', 'p1', 'what is the serial number of my furnace');
  assert.equal(denied.blocks[0].title, audienceFloorCopy('CONTRIBUTOR').title);
});

// ---- Catalogue v2: reserve and ownership costs (singleton + latest-tax-year reader modes) ----
const taxRow = (o) => ({ id: 'tb1', taxYear: 2025, sourceType: 'DOCUMENT', confidence: 'HIGH', billAmount: { toNumber: () => 6200 }, effectiveTaxRate: { toNumber: () => 0.0125 }, issueDate: new Date('2025-09-01T12:00:00Z'), ...o });
function taxStub(role, { bills = [], assess = [], funds = [] } = {}, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.propertyTaxBillRecord = { findMany: async (a) => { calls.push(['bill', a]); return bills; } };
  prisma.propertyTaxAssessmentRecord = { findMany: async (a) => { calls.push(['assess', a]); return assess; } };
  prisma.homeReserveFund = { findMany: async (a) => { calls.push(['fund', a]); return funds; } };
}
test('v2 cues: reserve, tax bill and assessment resolve by cue; bare detail or mixed cues never pick', () => {
  const cases = { 'what is my reserve fund balance': 'reserve.balance', 'what is my recommended monthly contribution to the reserve fund': 'reserve.monthlyContribution', 'what is my reserve shortfall': 'reserve.shortfall', 'what is the amount of my property tax bill': 'taxBill.amount', 'what is my effective tax rate on my property tax bill': 'taxBill.effectiveRate', 'what is the taxable value on my assessment': 'taxAssessment.taxableValue', 'what is my assessed value': 'taxAssessment.totalAssessedValue', 'when was my home assessed': 'taxAssessment.assessmentDate', 'what is the land value on my assessment': 'taxAssessment.landValue' };
  for (const [m, id] of Object.entries(cases)) assert.equal(resolveDataPoint(m)?.id, id, m);
  assert.equal(resolveDataPoint('what is the balance'), null, 'a bare balance never picks the reserve');
});
test('singleton read: one row, property-scoped, catalogued columns only; never recalculated is flagged', async () => {
  const calls = []; taxStub('OWNER', { funds: [{ id: 'f1', currentBalanceCents: 0, lastRecalculatedAt: null }] }, calls);
  const r = await dataPointReadResult('u1', 'p1', 'what is my reserve fund balance');
  assert.equal(r.reasonCode, 'DATA_POINT_LIMITED_PROVENANCE');
  assert.match(r.blocks[0].body, /never been recalculated/); assert.match(r.blocks[0].body, /\$0/);
  assert.deepEqual(calls[0][1].where, { propertyId: 'p1' }); assert.equal(calls[0][1].take, 1);
  assert.deepEqual(Object.keys(calls[0][1].select).sort(), ['currentBalanceCents', 'id', 'lastRecalculatedAt']);
  assert.deepEqual(r.parameters.sources, [{ sourceType: 'HomeReserveFund', sourceId: 'f1', minRole: 'CONTRIBUTOR' }]);
  taxStub('OWNER', { funds: [{ id: 'f1', currentBalanceCents: 250000, lastRecalculatedAt: new Date('2026-10-01T12:00:00Z') }] });
  const ok = await dataPointReadResult('u1', 'p1', 'what is my reserve fund balance');
  assert.equal(ok.status, 'ANSWERED'); assert.match(ok.blocks[0].body, /\$2,500/);
  taxStub('OWNER', {}); assert.equal((await dataPointReadResult('u1', 'p1', 'what is my reserve fund balance')).reasonCode, 'DATA_POINT_NO_INVENTORY');
});
test('tax read: only ACTIVE non-superseded rows, newest year first, year named in the message wins, the year used is stated', async () => {
  const calls = []; taxStub('OWNER', { bills: [taxRow({ id: 'tb2', taxYear: 2025 }), taxRow({ id: 'tb1', taxYear: 2024, billAmount: { toNumber: () => 5900 } })] }, calls);
  const latest = await dataPointReadResult('u1', 'p1', 'how much is my property tax bill');
  assert.equal(latest.status, 'ANSWERED'); assert.match(latest.blocks[0].body, /2025 property tax bill shows a bill of \$6,200/);
  assert.deepEqual(calls[0][1].where, { propertyId: 'p1', status: 'ACTIVE', supersededById: null });
  assert.deepEqual(calls[0][1].orderBy, [{ taxYear: 'desc' }, { observedAt: 'desc' }]);
  assert.match((await dataPointReadResult('u1', 'p1', 'what was my 2024 property tax bill amount')).blocks[0].body, /2024 property tax bill.*\$5,900/);
  const missing = await dataPointReadResult('u1', 'p1', 'what was my 2019 property tax bill amount');
  assert.equal(missing.reasonCode, 'DATA_POINT_ITEM_NOT_FOUND'); assert.doesNotMatch(JSON.stringify(missing), /6,200|5,900/, 'no silent fallback to another year');
  const rate = await dataPointReadResult('u1', 'p1', 'what is my effective tax rate on my property tax bill');
  assert.match(rate.blocks[0].body, /1\.250%/);
});
test('tax provenance: low confidence or self-entered records carry a limitation instead of a plain statement', async () => {
  taxStub('OWNER', { bills: [taxRow({ confidence: 'LOW' })] });
  const low = await dataPointReadResult('u1', 'p1', 'how much is my property tax bill');
  assert.equal(low.status, 'READY_WITH_LIMITATIONS'); assert.match(low.blocks[0].body, /low confidence/);
  taxStub('OWNER', { bills: [taxRow({ sourceType: 'HOMEOWNER_REPORTED', confidence: 'MEDIUM' })] });
  assert.match((await dataPointReadResult('u1', 'p1', 'how much is my property tax bill')).blocks[0].body, /entered by you/);
  taxStub('OWNER', { bills: [taxRow({ sourceType: 'OFFICIAL_SOURCE', confidence: 'VERIFIED' })] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'how much is my property tax bill')).status, 'ANSWERED');
});
test('v2 floors: a viewer is refused tax amounts and reserve money but reads dates, rate and posture', async () => {
  taxStub('VIEWER', { bills: [taxRow({})], assess: [{ id: 'ta1', taxYear: 2025, sourceType: 'DOCUMENT', confidence: 'HIGH', totalAssessedValue: 400000 }], funds: [{ id: 'f1', posture: 'MODERATE', lastRecalculatedAt: new Date('2026-10-01T12:00:00Z') }] });
  for (const q of ['how much is my property tax bill', 'what is my assessed value', 'what is my reserve fund balance']) assert.equal((await dataPointReadResult('u1', 'p1', q)).reasonCode, 'DATA_POINT_RESTRICTED', q);
  assert.equal((await dataPointReadResult('u1', 'p1', 'what is my effective tax rate on my property tax bill')).status, 'ANSWERED');
  assert.match((await dataPointReadResult('u1', 'p1', 'what is my reserve fund posture')).blocks[0].body, /moderate/);
});
test('v2 sources are authorised against live ACTIVE non-superseded tax rows', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = [];
  const ctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER', exists: async (m, w) => { seen.push([m, w]); return false; } };
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx, [sourceRef('PropertyTaxBillRecord', 'tb1')]), 'REDACT_SECTION');
  assert.deepEqual(seen.at(-1), ['PropertyTaxBillRecord', { id: 'tb1', propertyId: 'p1', status: 'ACTIVE', supersededById: null }]);
});

// ---- Review fixes: tax-year selection beyond 20xx ----
test('named tax year: any year 1900-2199 is honoured; unrelated four-digit numbers are not years', async () => {
  const { namedTaxYears } = require('../../src/services/ask/dataPoint/dataPointReader.ts');
  assert.deepEqual(namedTaxYears('my 1999 property tax assessment'), ['1999']);
  assert.deepEqual(namedTaxYears('the 2025 bill'), ['2025']);
  for (const m of ['bill of $4500', 'I paid 12,345 on 1234 oak street', 'order 4500 property tax bill', 'about 20255 dollars']) assert.deepEqual(namedTaxYears(m), [], m);
  const rows = [taxRow({ id: 'new', taxYear: 2025 }), taxRow({ id: 'old', taxYear: 1999, billAmount: { toNumber: () => 1800 } })];
  taxStub('OWNER', { bills: rows });
  assert.match((await dataPointReadResult('u1', 'p1', 'what was my 1999 property tax bill amount')).blocks[0].body, /1999 property tax bill.*\$1,800/, 'existing 1999 record');
  assert.match((await dataPointReadResult('u1', 'p1', 'what was my 2025 property tax bill amount')).blocks[0].body, /2025 property tax bill.*\$6,200/, 'current 20xx record');
  taxStub('OWNER', { bills: [taxRow({ id: 'new', taxYear: 2025 })] });
  const missing = await dataPointReadResult('u1', 'p1', 'what was my 1999 property tax bill amount');
  assert.equal(missing.reasonCode, 'DATA_POINT_ITEM_NOT_FOUND'); assert.doesNotMatch(JSON.stringify(missing), /6,200/, 'missing 1999 does not fall back to the newest record');
  const unrelated = await dataPointReadResult('u1', 'p1', 'what is my property tax bill amount for order 4500');
  assert.match(unrelated.blocks[0].body, /2025 property tax bill/, 'an unrelated number does not select a year, the latest is used and named');
});

// ---- Catalogue v3: seller prep, sale case, buyer journey (singleton reads, CONTRIBUTOR floor) ----
function sbStub(role, { prep = [], sale = [], buyer = [] } = {}, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.propertySalePrepProfile = { findMany: async (a) => { calls.push(['prep', a]); return prep; } };
  prisma.propertySaleCase = { findMany: async (a) => { calls.push(['sale', a]); return sale; } };
  prisma.homeBuyerChecklist = { findMany: async (a) => { calls.push(['buyer', a]); return buyer; } };
}
test('v4: every seller-prep/buyer point is VIEWER (shared journey facts, owner policy 2026-11-12) and resolves by its cue; bare words pick nothing', () => {
  for (const p of DATA_POINT_DEFINITIONS.filter((x) => x.domain === 'seller-prep' || x.domain === 'buyer')) assert.equal(p.audience, 'VIEWER', p.id);
  const cases = { 'what is the paint condition for my sale prep': 'salePrep.paint', 'what is my curb appeal condition': 'salePrep.curbAppeal', 'what is my staging readiness': 'salePrep.staging', 'what is my target list date for selling': 'saleCase.targetListDate', 'what is my target close date for selling my home': 'saleCase.targetCloseDate', 'what stage is my buyer journey at': 'buyer.stage', 'when is my buyer move in date': 'buyer.moveInDate', 'what is my buyer closing date': 'buyer.targetCloseDate' };
  for (const [m, id] of Object.entries(cases)) assert.equal(resolveDataPoint(m)?.id, id, m);
  assert.equal(resolveDataPoint('what is my closing date'), null, 'no sale or buyer cue');
});
test('v4 reads: singleton, property-scoped, catalogued columns only; inactive buyer journey is flagged; viewers read shared journey facts', async () => {
  const calls = []; sbStub('CONTRIBUTOR', { prep: [{ id: 'sp1', paintCondition: 'FAIR' }], sale: [{ id: 'sc1', targetListDate: new Date('2027-03-01T12:00:00Z') }], buyer: [{ id: 'b1', stage: 'UNDER_CONTRACT', status: 'PAUSED' }] }, calls);
  assert.match((await dataPointReadResult('u1', 'p1', 'what is the paint condition for my sale prep')).blocks[0].body, /fair/);
  assert.match((await dataPointReadResult('u1', 'p1', 'what is my target list date for selling')).blocks[0].body, /March 1, 2027|Mar(ch)? 1/);
  const b = await dataPointReadResult('u1', 'p1', 'what stage is my buyer journey at');
  assert.equal(b.status, 'READY_WITH_LIMITATIONS'); assert.match(b.blocks[0].body, /under contract/); assert.match(b.blocks[0].body, /paused, so what is recorded may be out of date/);
  for (const [, a] of calls) { assert.deepEqual(a.where, { propertyId: 'p1' }); assert.equal(a.take, 1); }
  assert.deepEqual(Object.keys(calls[2][1].select).sort(), ['id', 'stage', 'status']);
  assert.deepEqual(b.parameters.sources, [{ sourceType: 'HomeBuyerChecklist', sourceId: 'b1' }]);
  sbStub('VIEWER', { prep: [{ id: 'sp1', paintCondition: 'FAIR' }], sale: [], buyer: [{ id: 'b1', stage: 'EXPLORING', status: 'ACTIVE' }] });
  for (const q of ['what is the paint condition for my sale prep', 'what stage is my buyer journey at']) assert.equal((await dataPointReadResult('u1', 'p1', q)).status, 'ANSWERED', q);
  sbStub('OWNER', {}); assert.equal((await dataPointReadResult('u1', 'p1', 'what is my target list date for selling')).reasonCode, 'DATA_POINT_NO_INVENTORY');
});
test('v3 sources are authorised against the live row for this property', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = []; const ctx = { userId: 'u1', propertyId: 'p1', role: 'OWNER', exists: async (m, w) => { seen.push([m, w]); return true; } };
  for (const t of ['PropertySalePrepProfile', 'PropertySaleCase', 'HomeBuyerChecklist']) { assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx, [sourceRef(t, 'x1')]), 'AUTHORIZED'); assert.deepEqual(seen.at(-1), [t, { id: 'x1', propertyId: 'p1' }]); }
});

// ---- Catalogue v4: Home Records metadata reuses the canonical visibility rule ----
function recStub(role, rows, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.propertyRecord = { findMany: async (a) => { calls.push(a); return rows.filter((r) => Object.entries(a.where).every(([k, v]) => k === 'propertyId' || (v && typeof v === 'object') || r[k] === v)); } };
}
const rec = (o) => ({ id: 'r1', title: 'Roof permit', recordType: 'PERMIT', verificationStatus: 'VERIFIED', effectiveTo: new Date('2030-05-01T12:00:00Z'), retainUntil: new Date('2033-01-01T12:00:00Z'), visibility: 'HOUSEHOLD', lifecycleStatus: 'ACTIVE', trashedAt: null, ...o });
test('v4 record points: floors, specific aliases, no collision with warranty/policy expiry', () => {
  const f = (id) => DATA_POINT_DEFINITIONS.find((p) => p.id === id).audience;
  assert.deepEqual(['record.type', 'record.verification', 'record.effectiveTo', 'record.retainUntil'].map(f), ['VIEWER', 'VIEWER', 'VIEWER', 'OWNER']);
  assert.equal(resolveDataPoint('what type of document is my roof permit')?.id, 'record.type');
  assert.equal(resolveDataPoint('is my roof permit record verified')?.id, 'record.verification');
  assert.equal(resolveDataPoint('what is my permit document valid until')?.id, 'record.effectiveTo');
  assert.equal(resolveDataPoint('when does my warranty document expire')?.id, 'warranty.expiryDate', 'a record cue does not steal warranty expiry');
});
test('v4 record read: the canonical visibility rule is in the query; an owner-only record is indistinguishable from a missing one for non-owners', async () => {
  const calls = []; const rows = [rec({}), rec({ id: 'r2', title: 'Will and trust', visibility: 'OWNER_ONLY', recordType: 'LEGAL' }), rec({ id: 'r3', title: 'Old trashed deed', lifecycleStatus: 'TRASHED' })];
  recStub('CONTRIBUTOR', rows, calls);
  const ok = await dataPointReadResult('u1', 'p1', 'what type of document is my roof permit');
  assert.equal(ok.status, 'ANSWERED'); assert.match(ok.blocks[0].body, /permit/);
  assert.deepEqual(calls[0].where, { propertyId: 'p1', lifecycleStatus: 'ACTIVE', trashedAt: null, visibility: 'HOUSEHOLD' });
  const hidden = await dataPointReadResult('u1', 'p1', 'what type of document is my will and trust');
  const missing = await dataPointReadResult('u1', 'p1', 'what type of document is my gazebo plan');
  assert.equal(hidden.reasonCode, missing.reasonCode); assert.equal(hidden.blocks[0].title, missing.blocks[0].title); assert.ok(!JSON.stringify(hidden).includes('LEGAL'));
  const trashed = await dataPointReadResult('u1', 'p1', 'what type of document is my old trashed deed');
  assert.equal(trashed.reasonCode, missing.reasonCode, 'a trashed record is not answered');
  recStub('OWNER', rows, calls);
  assert.deepEqual(calls.at(-1) && (await dataPointReadResult('u1', 'p1', 'what type of document is my will and trust'), calls.at(-1).where), { propertyId: 'p1', lifecycleStatus: 'ACTIVE', trashedAt: null });
  assert.equal((await dataPointReadResult('u1', 'p1', 'what type of document is my will and trust')).status, 'ANSWERED', 'owners see owner-only records');
});
test('v4 record retention is OWNER-only: refused for contributors and viewers, answered for owners', async () => {
  for (const role of ['VIEWER', 'CONTRIBUTOR']) { recStub(role, [rec({})]); const r = await dataPointReadResult('u1', 'p1', 'what is the retention date of my roof permit record'); assert.equal(r.reasonCode, 'DATA_POINT_RESTRICTED', role); assert.ok(!JSON.stringify(r).includes('2033')); }
  recStub('OWNER', [rec({})]); assert.match((await dataPointReadResult('u1', 'p1', 'what is the retention date of my roof permit record')).blocks[0].body, /2033/);
  recStub('VIEWER', [rec({})]); assert.equal((await dataPointReadResult('u1', 'p1', 'is my roof permit record verified')).status, 'ANSWERED');
});
test('v4 record sources replay with the current role: an owner-only record redacts for a non-owner', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = []; const ctx = (role) => ({ userId: 'u1', propertyId: 'p1', role, exists: async (m, w) => { seen.push([m, w]); return true; } });
  await AUTH.DATA_POINT_READ.authorizeSources(ctx('CONTRIBUTOR'), [sourceRef('PropertyRecord', 'r1')]);
  assert.deepEqual(seen.at(-1), ['PropertyRecord', { id: 'r1', propertyId: 'p1', lifecycleStatus: 'ACTIVE', trashedAt: null, visibility: 'HOUSEHOLD' }]);
  await AUTH.DATA_POINT_READ.authorizeSources(ctx('OWNER'), [sourceRef('PropertyRecord', 'r1')]);
  assert.deepEqual(seen.at(-1)[1], { id: 'r1', propertyId: 'p1', lifecycleStatus: 'ACTIVE', trashedAt: null });
});

// ---- Catalogue v5: buyer tasks, the first relation read ----
function taskStub(role, { checklists = [{ id: 'cl1' }], tasks = [] } = {}, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.homeBuyerChecklist = { findMany: async (a) => { calls.push(['parent', a]); return checklists; } };
  prisma.homeBuyerTask = { findMany: async (a) => { calls.push(['child', a]); return tasks; } };
  prisma.propertyMaintenanceTask = { findMany: async () => [{ id: 'm1', title: 'Clean gutters', status: 'PENDING', nextDueDate: new Date('2026-12-01T12:00:00Z') }] };
}
const bTask = (o) => ({ id: 'bt1', checklistId: 'cl1', title: 'Order inspection', status: 'IN_PROGRESS', dueAt: new Date('2026-11-20T12:00:00Z'), completedAt: null, priority: 'NOW', ...o });
test('v5 routing: each compound cue selects buyerTask.*, bare "task" stays maintenance, mixed wording resolves deterministically to nothing', () => {
  for (const cue of ['buyer task', 'buying task', 'closing task']) {
    assert.equal(resolveDataPoint(`what is the status of my ${cue}`)?.id, 'buyerTask.status', cue);
    assert.equal(resolveDataPoint(`when is my ${cue} due`)?.id, 'buyerTask.dueDate', cue);
    assert.equal(resolveDataPoint(`when did I complete my ${cue}`)?.id, 'buyerTask.completedDate', cue);
    assert.equal(resolveDataPoint(`what is the priority of my ${cue}`)?.id, 'buyerTask.priority', cue);
  }
  assert.equal(resolveDataPoint('when is the gutter cleaning task due')?.id, 'task.nextDueDate', 'bare task keeps maintenance');
  assert.equal(resolveDataPoint('what is the status of my task')?.id, 'task.status');
  assert.equal(resolveDataPoint('what is the priority of my task')?.id, 'task.priority');
  for (const m of ['when is my buyer maintenance task due', 'what is the status of my closing maintenance task']) assert.equal(resolveDataPoint(m), null, m);
  assert.deepEqual(DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'HomeBuyerTask').map((p) => p.audience), ['VIEWER', 'VIEWER', 'VIEWER', 'VIEWER']);
  assert.equal(DATA_POINT_DEFINITIONS.some((p) => p.entity === 'HomeBuyerTask' && /title|description|notes|statusReason|estimatedCost|bookingId|completionEvidence/i.test(p.field)), false);
});
test('v5 read: parent first (property-scoped), child only through it, capped; the title selects a row and is never returned', async () => {
  const calls = []; taskStub('VIEWER', { tasks: [bTask({}), bTask({ id: 'bt2', title: 'Book movers', dueAt: null, status: 'PENDING' })] }, calls);
  const r = await dataPointReadResult('u1', 'p1', 'when is my buyer task order inspection due');
  assert.equal(r.status, 'ANSWERED'); assert.match(r.blocks[0].body, /Your buyer task is due /);
  assert.deepEqual(calls[0], ['parent', { where: { propertyId: 'p1' }, select: { id: true, status: true }, take: 5 }]);
  assert.deepEqual(calls[1][1].where, { checklistId: { in: ['cl1'] }, applicability: { not: 'NOT_APPLICABLE' } }); assert.equal(calls[1][1].take, 50);
  assert.deepEqual(Object.keys(calls[1][1].select).sort(), ['checklistId', 'dueAt', 'id', 'status', 'title'], 'the task status and parent key are always selected so lifecycle limitations can be applied');
  assert.ok(!JSON.stringify(r).includes('Order inspection') && !JSON.stringify(r).includes('Book movers'), 'the title is not a returned value');
  // asking for another field about a titled task does not echo the title either
  const pr = await dataPointReadResult('u1', 'p1', 'what is the priority of my buyer task book movers');
  assert.match(pr.blocks[0].body, /priority now|priority pending|has priority/); assert.ok(!JSON.stringify(pr).includes('Book movers'));
  assert.deepEqual(r.parameters.sources, [{ sourceType: 'HomeBuyerTask', sourceId: 'bt1' }]);
});
test('v5 ambiguity: several buyer tasks and none named asks which, without listing their titles; one task answers directly', async () => {
  taskStub('OWNER', { tasks: [bTask({}), bTask({ id: 'bt2', title: 'Book movers' })] });
  const amb = await dataPointReadResult('u1', 'p1', 'when is my buyer task due');
  assert.equal(amb.reasonCode, 'DATA_POINT_AMBIGUOUS'); assert.match(amb.blocks[0].body, /2 buyer tasks could match/); assert.ok(!JSON.stringify(amb).includes('Order inspection'));
  taskStub('OWNER', { tasks: [bTask({ title: 'Inspection' }), bTask({ id: 'bt2', title: 'Inspection follow up' })] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer task inspection follow up due')).status, 'ANSWERED');
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer task inspection due')).status, 'ANSWERED', 'only the shorter title is named');
  taskStub('OWNER', { tasks: [bTask({}), bTask({ id: 'bt2' })] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer task order inspection due')).reasonCode, 'DATA_POINT_AMBIGUOUS', 'two tasks with the same title stay ambiguous');
  taskStub('OWNER', { tasks: [bTask({})] }); assert.equal((await dataPointReadResult('u1', 'p1', 'what is the status of my buying task')).status, 'ANSWERED');
  taskStub('OWNER', { checklists: [] }); assert.equal((await dataPointReadResult('u1', 'p1', 'what is the status of my buying task')).reasonCode, 'DATA_POINT_NO_INVENTORY');
  taskStub('OWNER', { tasks: [bTask({})] }); assert.equal((await dataPointReadResult('u1', 'p1', 'when did I complete my closing task')).reasonCode, 'DATA_POINT_NOT_RECORDED');
});
test('v5 replay: the task is re-resolved through its CURRENT property-scoped checklist and a moved or not-applicable task is redacted', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = []; const ctx = (present) => ({ userId: 'u1', propertyId: 'p1', role: 'VIEWER', exists: async (m, w) => { seen.push([m, w]); return present; } });
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx(true), [sourceRef('HomeBuyerTask', 'bt1')]), 'AUTHORIZED');
  assert.deepEqual(seen.at(-1), ['HomeBuyerTask', { id: 'bt1', checklist: { propertyId: 'p1' }, applicability: { not: 'NOT_APPLICABLE' } }]);
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx(false), [sourceRef('HomeBuyerTask', 'bt1')]), 'REDACT_SECTION');
});

// ---- Review P1: lifecycle limitations for relation reads (journey and child status) ----
test('lifecycle: a paused journey is stated; a cancelled journey needs an explicitly named task and carries a limitation', async () => {
  taskStub('VIEWER', { checklists: [{ id: 'cl1', status: 'PAUSED' }], tasks: [bTask({})] });
  const paused = await dataPointReadResult('u1', 'p1', 'when is my buyer task due');
  assert.equal(paused.status, 'READY_WITH_LIMITATIONS'); assert.match(paused.blocks[0].body, /buyer journey is paused/);
  for (const js of ['CANCELLED', 'HANDED_OFF', 'ARCHIVED']) {
    taskStub('VIEWER', { checklists: [{ id: 'cl1', status: js }], tasks: [bTask({})] });
    const unnamed = await dataPointReadResult('u1', 'p1', 'when is my buyer task due');
    assert.equal(unnamed.reasonCode, 'DATA_POINT_AMBIGUOUS', `${js}: a lone unnamed task is not defaulted for a non-active journey`); assert.ok(!JSON.stringify(unnamed).includes('2026'));
    const named = await dataPointReadResult('u1', 'p1', 'when is my buyer task order inspection due');
    assert.equal(named.status, 'READY_WITH_LIMITATIONS', js); assert.match(named.blocks[0].body, new RegExp(`journey is ${js.toLowerCase().replace('_', ' ')}, so this value may no longer represent an active obligation`));
  }
  taskStub('VIEWER', { checklists: [{ id: 'cl1', status: 'ACTIVE' }], tasks: [bTask({})] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer task due')).status, 'ANSWERED', 'an active journey reads normally');
});
test('lifecycle: a cancelled or not-needed task answers its status plainly but its date or priority only as a past value, never as an upcoming deadline', async () => {
  for (const st of ['CANCELLED', 'NOT_NEEDED']) {
    taskStub('VIEWER', { tasks: [bTask({ status: st })] });
    const word = st.toLowerCase().replace('_', ' ');
    const status = await dataPointReadResult('u1', 'p1', 'what is the status of my buyer task');
    assert.equal(status.status, 'ANSWERED'); assert.match(status.blocks[0].body, new RegExp(`has status ${word}`));
    for (const q of ['when is my buyer task due', 'what is the priority of my buyer task']) {
      const r = await dataPointReadResult('u1', 'p1', q); const body = r.blocks[0].body;
      assert.equal(r.status, 'READY_WITH_LIMITATIONS', `${st} ${q}`); assert.match(body, new RegExp(`is ${word}\\. Its recorded (date|value) was`)); assert.match(body, /recorded past value, not an active obligation/);
      assert.doesNotMatch(body, /is due|has priority/, 'not worded as a current deadline or priority'); assert.match(r.blocks[0].title, /./);
    }
    taskStub('VIEWER', { tasks: [bTask({ status: st, completedAt: new Date('2026-10-01T12:00:00Z') })] });
    assert.match((await dataPointReadResult('u1', 'p1', 'when did I complete my buyer task')).blocks[0].body, /recorded past value/);
  }
  taskStub('VIEWER', { tasks: [bTask({ status: 'COMPLETED' })] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer task due')).status, 'ANSWERED', 'a completed task is not an inactive one');
});

// ---- Catalogue v6: milestones, the second relation path ----
const ms = (o) => ({ id: 'm1', checklistId: 'cl1', type: 'INSPECTION', status: 'IN_PROGRESS', dueAt: new Date('2026-11-22T12:00:00Z'), completedAt: null, ...o });
function msStub(role, { checklists = [{ id: 'cl1', status: 'ACTIVE' }], rows = [] } = {}, calls = []) {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  prisma.homeBuyerChecklist = { findMany: async (a) => { calls.push(['parent', a]); return checklists; } };
  prisma.buyerJourneyMilestone = { findMany: async (a) => { calls.push(['child', a]); return rows; } };
}
test('v6 routing: milestone compound cues select buyerMilestone.*; bare milestone or task words do not', () => {
  for (const cue of ['buyer milestone', 'buying milestone', 'closing milestone', 'purchase milestone']) {
    assert.equal(resolveDataPoint(`what is the status of my ${cue}`)?.id, 'buyerMilestone.status', cue);
    assert.equal(resolveDataPoint(`when is my ${cue} due`)?.id, 'buyerMilestone.dueDate', cue);
    assert.equal(resolveDataPoint(`when did I complete my ${cue}`)?.id, 'buyerMilestone.completedDate', cue);
    assert.equal(resolveDataPoint(`what type is my ${cue}`)?.id, 'buyerMilestone.type', cue);
  }
  assert.equal(resolveDataPoint('when is my milestone due'), null, 'a bare milestone selects nothing');
  assert.equal(resolveDataPoint('when is my closing task due')?.id, 'buyerTask.dueDate', 'closing task still means a task');
  const fields = DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'BuyerJourneyMilestone').map((p) => p.field).sort();
  assert.deepEqual(fields, ['completedAt', 'dueAt', 'status', 'type']);
  assert.ok(DATA_POINT_DEFINITIONS.filter((p) => p.entity === 'BuyerJourneyMilestone').every((p) => p.audience === 'VIEWER'));
});
test('v6 read: parent first, only structured columns selected (never customLabel/notes/responsible/source ids); the type selects a row, most specific wins', async () => {
  const calls = []; msStub('VIEWER', { rows: [ms({}), ms({ id: 'm2', type: 'INSPECTION_CONTINGENCY', dueAt: new Date('2026-11-25T12:00:00Z') })] }, calls);
  const r = await dataPointReadResult('u1', 'p1', 'when is my buyer milestone inspection contingency due');
  assert.equal(r.status, 'ANSWERED'); assert.match(r.blocks[0].body, /Your inspection contingency milestone is due .*25/);
  assert.deepEqual(calls[0], ['parent', { where: { propertyId: 'p1' }, select: { id: true, status: true }, take: 5 }]);
  assert.deepEqual(calls[1][1].where, { checklistId: { in: ['cl1'] } }); assert.equal(calls[1][1].take, 50);
  assert.deepEqual(Object.keys(calls[1][1].select).sort(), ['checklistId', 'dueAt', 'id', 'status', 'type']);
  for (const banned of ['customLabel', 'notes', 'responsibleUserId', 'sourceEntityId', 'sourceDocumentId']) assert.ok(!(banned in calls[1][1].select), banned);
  assert.match((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone inspection due')).blocks[0].body, /Your inspection milestone is due .*22/);
  const t = await dataPointReadResult('u1', 'p1', 'what type is my buyer milestone inspection contingency');
  assert.match(t.blocks[0].body, /is of type inspection contingency/);
  assert.deepEqual(r.parameters.sources, [{ sourceType: 'BuyerJourneyMilestone', sourceId: 'm2' }]);
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).reasonCode, 'DATA_POINT_AMBIGUOUS');
  msStub('VIEWER', { rows: [ms({ type: 'CUSTOM' })] }); assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).status, 'ANSWERED', 'a lone milestone is the default; the custom label is never needed');
  msStub('VIEWER', { checklists: [] }); assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).reasonCode, 'DATA_POINT_NO_INVENTORY');
});
test('v6 lifecycle: the same journey and child caveats apply to milestones; a cancelled or waived milestone is never an upcoming deadline', async () => {
  msStub('VIEWER', { checklists: [{ id: 'cl1', status: 'CANCELLED' }], rows: [ms({})] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).reasonCode, 'DATA_POINT_AMBIGUOUS');
  assert.match((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone inspection due')).blocks[0].body, /journey is cancelled, so this value may no longer represent an active obligation/);
  msStub('VIEWER', { checklists: [{ id: 'cl1', status: 'PAUSED' }], rows: [ms({})] });
  assert.match((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).blocks[0].body, /journey is paused/);
  for (const st of ['CANCELLED', 'WAIVED']) {
    msStub('VIEWER', { rows: [ms({ status: st })] });
    assert.equal((await dataPointReadResult('u1', 'p1', 'what is the status of my buyer milestone')).status, 'ANSWERED', 'status stays plain');
    const due = (await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).blocks[0].body;
    assert.match(due, new RegExp(`is ${st.toLowerCase()}\\. Its recorded date was`)); assert.doesNotMatch(due, /is due/);
  }
  msStub('VIEWER', { rows: [ms({ status: 'MISSED' })] });
  assert.equal((await dataPointReadResult('u1', 'p1', 'when is my buyer milestone due')).status, 'ANSWERED', 'a missed milestone keeps its date; its status says missed');
});
test('v6 replay: the milestone is re-resolved through its CURRENT property-scoped checklist', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH, sourceRef } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const seen = []; const ctx = (present) => ({ userId: 'u1', propertyId: 'p1', role: 'VIEWER', exists: async (m, w) => { seen.push([m, w]); return present; } });
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx(true), [sourceRef('BuyerJourneyMilestone', 'm1')]), 'AUTHORIZED');
  assert.deepEqual(seen.at(-1), ['BuyerJourneyMilestone', { id: 'm1', checklist: { propertyId: 'p1' } }]);
  assert.equal(await AUTH.DATA_POINT_READ.authorizeSources(ctx(false), [sourceRef('BuyerJourneyMilestone', 'm1')]), 'REDACT_SECTION');
});
