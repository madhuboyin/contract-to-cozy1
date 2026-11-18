const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { executeSemanticSlice } = require('../../src/services/ask/semantic/slice/sliceExecutor.ts');
const { SLICE_SEEDED_PROPERTY_SNAPSHOT, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice/index.ts');

// "which appliances have no warranty or are older than 10 years?" used to ask an abstract "neither/either" question whose buttons did nothing, and the age
// condition was never understood. An age comparison is now a typed predicate: "older than N years" on the recorded install date.
const AGE = 'predicate.inventory_item.older_than_years';
const atoms = (where) => (where.kind === 'PREDICATE' ? [where] : where.kind === 'NOT' ? atoms(where.operand) : where.operands.flatMap(atoms));

test('the live prompt parses to an either-or of "no warranty record" and "older than 10 years", with nothing left unresolved', () => {
  const plan = parseDeterministicSemanticRequest('which appliances have no warranty or are older than 10 years?');
  assert.equal(plan.outcome, 'MATCH');
  assert.deepEqual(plan.unresolvedSpans, []);
  const where = plan.facets[0].where;
  assert.equal(where.kind, 'OR');
  assert.deepEqual(where.operands.map((o) => o.predicateId), ['predicate.inventory_item.has_no_warranty_record', AGE]);
  assert.equal(where.operands[1].thresholdYears, 10);
});

test('the other shapes: age alone, "and", "neither … nor", "not older than"; the real ambiguity and unrelated "how old" are unchanged', () => {
  const where = (m) => parseDeterministicSemanticRequest(m).facets[0]?.where;
  assert.equal(where('which appliances are older than 10 years').predicateId, AGE);
  assert.equal(where('which appliances have no warranty and are older than 10 years').kind, 'AND');
  const neither = where('which appliances have neither a warranty nor are older than 10 years');
  // "neither" is built from explicit negations: "has no warranty record" (never NOT of "has a warranty", which would count unknown and conflicted states) and NOT older than N.
  assert.deepEqual(neither.operands.map((o) => o.kind), ['PREDICATE', 'NOT']);
  assert.equal(neither.operands[0].predicateId, 'predicate.inventory_item.has_no_warranty_record');
  assert.equal(where('which appliances are not older than 10 years').kind, 'NOT');
  assert.equal(parseDeterministicSemanticRequest('which appliances have no warranty or due maintenance').outcome, 'BOUNDARY', 'a bare "no A or B" is still asked');
  assert.equal(parseDeterministicSemanticRequest('how old is my roof').facets[0].evidence.jobMatch, 'query.property.fact_detail');
});

test('an age that is not a plain whole number of years is not understood, never guessed', () => {
  for (const m of ['which appliances are older than 0 years', 'which appliances are older than 250 years', 'which appliances are older than ten years']) {
    const plan = parseDeterministicSemanticRequest(m);
    assert.notEqual(plan.outcome, 'MATCH', m);
  }
});

// ---- executor
const asOf = '2026-11-15';
const item = (id, name, installedOn, itemWarrantyIds = []) => ({
  id, propertyId: SLICE_SEEDED_PROPERTY_SNAPSHOT.propertyId, name, category: 'APPLIANCE', installedOn, roomId: null,
  propertyPlanWarrantyId: null, itemWarrantyIds, coverageEvidenceStatus: itemWarrantyIds.length ? 'VERIFIED' : 'NONE', condition: 'GOOD_CONDITION',
});
const run = (rawText, items) => executeSemanticSlice({ rawText, snapshot: { ...SLICE_SEEDED_PROPERTY_SNAPSHOT, asOfDate: asOf, items, maintenanceTasks: [] }, auth: SLICE_OWNER_AUTH });
const summary = (r) => r.operationResult.blocks.find((b) => b.type === 'SUMMARY');

test('"older than N years" is strictly older: exactly N years is not older, one day earlier is', () => {
  const items = [item('exact', 'Exact', '2016-11-15'), item('older', 'Older', '2016-11-14'), item('newer', 'Newer', '2016-11-16')];
  const r = run('which appliances are older than 10 years', items);
  assert.deepEqual(r.activeEntityIds, ['older']);
  assert.equal(r.entailment.outcome, 'PASS');
});

test('the live prompt answers from data: no warranty OR old; a warranted young item is out; the condition is said in words', () => {
  const items = [item('a', 'Young unwarranted', '2024-01-01'), item('b', 'Old warranted', '2010-01-01', ['w1']), item('c', 'Young warranted', '2024-01-01', ['w2']), item('d', 'Old unwarranted', '2010-01-01')];
  const r = run('which appliances have no warranty or are older than 10 years?', items);
  assert.deepEqual([...r.activeEntityIds].sort(), ['a', 'b', 'd']);
  const body = summary(r).body;
  assert.match(body, /^Matching: no warranty linked in your home record, or older than 10 years \(by recorded install date\)\./);
  assert.ok(!/Looking for/.test(body));
  const list = r.operationResult.blocks.find((block) => block.type === 'GROUPED_LIST');
  assert.equal(list.id, 'inventory-results');
  assert.equal(list.title, '3 matching appliances');
  assert.match(list.description, /Open any item for its full home-record details/);
  assert.deepEqual(list.sections[0].items[0].meta, ['Appliance', 'Not recorded']);
  assert.match(list.sections[0].items[0].description, /^Installed: /);
});

test('an item with no install date is never counted as old OR as not old: it is unknown when the date decides the answer', () => {
  const items = [item('undated-warranted', 'Undated warranted', null, ['w1']), item('undated-bare', 'Undated bare', null), item('young', 'Young bare', '2024-01-01')];
  // "not older than 3 years": the undated items cannot be said to match.
  const notOlder = run('which appliances are not older than 3 years', items);
  assert.deepEqual(notOlder.activeEntityIds, ['young']);
  assert.equal(notOlder.receipt.population.unknownCount, 2);
  assert.match(summary(notOlder).body, /2 items have no install date recorded, so I couldn’t tell whether they match and they are not counted either way\./);
  // either-or: an undated item with no warranty matches on the warranty half; an undated warranted item is unknown.
  const either = run('which appliances have no warranty or are older than 3 years', items);
  assert.deepEqual([...either.activeEntityIds].sort(), ['undated-bare', 'young']);
  assert.equal(either.receipt.population.unknownCount, 1);
  assert.match(summary(either).body, /1 item has no install date recorded/);
});

test('"and": an old unwarranted item matches; a count and the "how many" projection work', () => {
  // Item names are real words: a one-letter name can be resolved as a named item inside the question.
  const items = [item('alpha', 'Alpha', '2010-01-01'), item('bravo', 'Bravo', '2010-01-01', ['w']), item('charlie', 'Charlie', '2024-01-01')];
  assert.deepEqual(run('which appliances have no warranty and are older than 10 years', items).activeEntityIds, ['alpha']);
  const count = run('how many appliances are older than 10 years', items);
  assert.equal(summary(count).title, '2 items match');
});

// ---- end to end through the registered DATA_POINT_READ handler, against a fake database (the real routing, loader and answer-trust path)
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

test('the live prompt through the real handler answers from the home record, not with a clarification question', async () => {
  const row = (id, name, installedOn) => ({ id, propertyId: 'p1', name, category: 'APPLIANCE', brand: null, modelNumber: null, serialNumber: null, purchaseCostCents: null, replacementCostCents: null, installedOn: installedOn ? new Date(installedOn) : null, condition: 'GOOD_CONDITION', roomId: null, coverageEvidenceStatus: 'NONE', warrantyApplicabilities: [] });
  const rows = [row('fridge', 'Refrigerator', '2024-02-01'), row('furnace', 'Furnace', '2010-06-01')];
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => {
    if (model === 'then') return undefined;
    if (model === 'inventoryItem') return { ...empty, findMany: async () => rows };
    if (model === 'property') return { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) };
    return empty;
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  const result = await capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'which appliances have no warranty or are older than 10 years?' });
  assert.notEqual(result.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.clarification ?? null, null);
  const text = JSON.stringify(result.blocks);
  assert.match(text, /older than 10 years \(by recorded install date\)/);
  assert.ok(!/neither/i.test(text));
});

// ---- "over N years old" (live composite prompt: "which kitchen appliances have no warranty and are over 5 years old?")
test('"over N years old" is an age; a bare "over N years" is a duration and is not', () => {
  const whereOf = (m) => parseDeterministicSemanticRequest(m).facets[0]?.where;
  const years = (w) => atoms(w).find((a) => a.predicateId === AGE)?.thresholdYears;
  assert.equal(years(whereOf('which appliances are over 5 years old')), 5);
  assert.equal(years(whereOf('which appliances have no warranty and are over 5 years old')), 5);
  assert.notEqual(parseDeterministicSemanticRequest('which appliances are over 5 years').outcome, 'MATCH', 'without "old" it is not an age');
  const items = [item('older', 'Older', '2020-01-01'), item('newer', 'Newer', '2024-01-01')];
  assert.deepEqual(run('which appliances are over 5 years old', items).activeEntityIds, ['older']);
});
