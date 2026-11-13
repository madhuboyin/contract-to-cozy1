// Owner audience policy 2026-11-13: seller-prep item detail, cost ranges and waiver text, and inspector descriptions on the buyer finding command, are OWNER-only
// on EVERY surface (record detail, collection incl. search, decision command target list / ambiguity / confirmation / stored parameters / completion), not only the checklist read.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');
const { ASK_RECORD_DETAIL_READERS } = require('../../src/services/ask/askRecordDetail.service.ts');
const { readSellerRecordsPage } = require('../../src/services/ask/askRecordCollections.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/sellHoldRent.handler.ts');
require('../../src/services/ask/handlers/buyerPlan.handler.ts');

const SECRET = ['SECRET-DETAIL-1', 'SECRET-WAIVER-2', '$7,777', '7777', 'SECRET-INSPECTOR-3', '12345'];
const dump = (r) => JSON.stringify(r);
const clean = (r) => { const text = dump(r); for (const s of SECRET) assert.ok(!text.includes(s), `leaked ${s}`); };
const stub = (target, name, value) => { const saved = target[name]; target[name] = value; return () => { target[name] = saved; }; };
const fullItem = (id, title, extra = {}) => ({ id, saleCaseId: 'sc1', title, detail: 'SECRET-DETAIL-1', category: 'SAFETY_STRUCTURAL', requirementClass: 'MATERIAL_BLOCKER', status: 'OPEN', dueAt: null, resolvedAt: null, waivedAt: null, pursuedAt: null, waivedReason: 'SECRET-WAIVER-2', estimatedCostMinCents: 777700, estimatedCostMaxCents: 888800, estimatedValueAddMinCents: 777700, estimatedValueAddMaxCents: 888800, createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-20'), sourceEntityType: 'INSPECTION_FINDING', ...extra });
// select-aware: only returns the fields the reader asked for, so a field that was not selected is genuinely absent
const project = (row, select) => Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));

test('seller item record detail: non-owners never get detail, cost or waiver text (not even selected); owners do', async () => {
  const rows = [fullItem('si1', 'Fix railing', { waivedAt: new Date('2026-09-10') })];
  const selects = [];
  const restore = [stub(prisma, 'propertySaleCase', { findUnique: async () => ({ id: 'sc1' }) }), stub(prisma, 'saleReadinessItem', { findFirst: async (a) => { selects.push(a.select); return project(rows[0], a.select); } })];
  try {
    for (const role of ['VIEWER', 'CONTRIBUTOR']) {
      const detail = await ASK_RECORD_DETAIL_READERS['seller-records']({ propertyId: 'p1', userId: 'u1', role, now: new Date() }, 'si1');
      clean(detail);
      const last = selects[selects.length - 1];
      assert.ok(!('detail' in last) && !('waivedReason' in last) && !('estimatedCostMinCents' in last));
      assert.equal(detail.corrections[0].operationId, 'SELLER_PREP_ITEM_DECISION');
    }
    const owner = await ASK_RECORD_DETAIL_READERS['seller-records']({ propertyId: 'p1', userId: 'u1', role: 'OWNER', now: new Date() }, 'si1');
    assert.match(dump(owner), /SECRET-DETAIL-1/); assert.match(dump(owner), /SECRET-WAIVER-2/);
  } finally { restore.forEach((r) => r()); }
});

test('seller records collection: non-owners get no detail, cost, or search-by-hidden-text; the role defaults to the lowest', async () => {
  const rows = [fullItem('sri-aa1', 'Fix railing'), fullItem('sri-bb2', 'Paint porch', { detail: 'plain' })];
  const restore = [stub(prisma, 'propertySaleCase', { findUnique: async () => ({ id: 'sc1' }) }), stub(prisma, 'saleReadinessItem', { findMany: async (a) => rows.map((r) => project(r, a.select)) })];
  try {
    for (const role of ['VIEWER', 'CONTRIBUTOR', undefined]) {
      clean(await readSellerRecordsPage('p1', {}, role));
      const byHidden = await readSellerRecordsPage('p1', { search: 'SECRET-DETAIL-1' }, role);
      assert.equal(byHidden.total, 0, 'hidden text must not be searchable');
    }
    const owner = await readSellerRecordsPage('p1', { search: 'SECRET-DETAIL-1' }, 'OWNER');
    assert.equal(owner.total, 1); assert.match(dump(owner), /\$7,777/);
  } finally { restore.forEach((r) => r()); }
});

function installDecision(role, items) {
  const saved = [propertyAccess.resolvePropertyAccess, PropertySaleCaseService.getCase];
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  PropertySaleCaseService.getCase = async () => ({ propertyId: 'p1', saleCase: { id: 'sc1' }, readinessItems: items, transitions: [] });
  return () => { [propertyAccess.resolvePropertyAccess, PropertySaleCaseService.getCase] = saved; };
}
const decide = (message, launchContext) => capabilityInvoke('SELLER_PREP_ITEM_DECISION', { userId: 'u1', propertyId: 'p1', message, launchContext }, { propertyAccess: { role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' } });

test('SELLER_PREP_ITEM_DECISION: contributor target list, ambiguity and confirmation carry no restricted fields; the owner still sees them', async () => {
  const items = [fullItem('sri-aa1', 'Fix railing'), fullItem('sri-bb2', 'Paint porch')];
  const restore = installDecision('CONTRIBUTOR', items);
  try {
    const list = await decide('Waive an item');
    assert.equal(list.status, 'NEEDS_ENTITY'); clean(list);
    assert.match(dump(list), /property owner needs to choose/);
    const confirm = await decide('Pursue "Fix railing"');
    assert.equal(confirm.status, 'NEEDS_CONFIRMATION'); clean(confirm);
    assert.equal(confirm.confirmation.description, 'Fix railing');
    clean(confirm.parameters);
    // duplicate titles: still no hidden text is used to disambiguate
    const dup = installDecision('CONTRIBUTOR', [fullItem('sri-aa1', 'Fix railing'), fullItem('sri-bb2', 'Fix railing', { detail: 'SECRET-DETAIL-1 other' })]);
    try { const ambiguous = await decide('Pursue "Fix railing"'); clean(ambiguous); } finally { dup(); }
  } finally { restore(); }
  const ownerRestore = installDecision('OWNER', items);
  try { assert.match(dump(await decide('Pursue "Fix railing"')), /SECRET-DETAIL-1/); } finally { ownerRestore(); }
});

test('BUYER_FINDING_DISPOSITION: the inspector description is not selected and not shown for contributors; owners keep it', async () => {
  const saved = [propertyAccess.resolvePropertyAccess, prisma.inspectionFinding];
  const selects = [];
  const rows = [{ id: 'f1', homeSystem: 'ROOF', subsystem: null, severity: 'MAJOR', buyerDisposition: 'UNDECIDED', buyerDispositionAt: null, inspectorDescription: 'SECRET-INSPECTOR-3' }, { id: 'f2', homeSystem: 'ELECTRICAL', subsystem: null, severity: 'MINOR', buyerDisposition: 'UNDECIDED', buyerDispositionAt: null, inspectorDescription: 'SECRET-INSPECTOR-3 b' }];
  prisma.inspectionFinding = { findMany: async (a) => { selects.push(a.select); return rows.map((r) => project(r, a.select)); } };
  const run = async (role, message) => { propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' }); return capabilityInvoke('BUYER_FINDING_DISPOSITION', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } }); };
  try {
    const list = await run('CONTRIBUTOR', 'Classify a finding');
    assert.equal(list.status, 'NEEDS_ENTITY'); clean(list); assert.ok(!('inspectorDescription' in selects[selects.length - 1]));
    const confirm = await run('CONTRIBUTOR', 'Classify the roof finding as a negotiation item');
    assert.equal(confirm.status, 'NEEDS_CONFIRMATION'); clean(confirm);
    const owner = await run('OWNER', 'Classify a finding'); assert.match(dump(owner), /SECRET-INSPECTOR-3/);
  } finally { propertyAccess.resolvePropertyAccess = saved[0]; prisma.inspectionFinding = saved[1]; }
});
