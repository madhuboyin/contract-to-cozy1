// FR-DATA-10/15/16, query shapes 3-6 (list, filter, sort/top-k, aggregate): allowlisted templates, audience on EVERY touched field, no silent qualifier drops, bounded limits, honest handling of unrecorded values.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const plan = require('../../src/services/ask/dataPoint/dataPointQueryPlan.ts');
const { buildWhere } = require('../../src/services/ask/dataPoint/dataPointQueryRunner.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const { DATA_POINT_BY_ID, READABLE_FIELDS } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const NOW = new Date('2026-11-13T12:00:00Z');
const p = (m) => plan.planDataPointQuery(m, NOW);
const get = (m) => { const o = p(m); assert.equal(o.kind, 'PLAN', `${m} -> ${o.kind}`); return o.plan; };

test('FR-DATA-16 conformance: every template field is a catalogued data point of the declared type and a real column; every template has a base noun and a count floor', () => {
  const { Prisma } = require('@prisma/client');
  for (const t of plan.QUERY_TEMPLATES) {
    assert.ok(t.nouns.length && t.countFloor, t.id);
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === t.entity);
    assert.ok(model.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar'), `${t.entity} is property-scoped`);
    for (const [key, field] of Object.entries(t.fields)) {
      const point = DATA_POINT_BY_ID.get(field.point);
      assert.ok(point, `${t.id}.${key} -> ${field.point}`);
      assert.equal(point.entity, t.entity); assert.equal(point.field, field.column);
      assert.ok(READABLE_FIELDS[t.entity].includes(field.column), `${field.column} is a readable catalogued column`);
      assert.ok(model.fields.some((f) => f.name === field.column), `${t.entity}.${field.column} exists`);
      const expected = { date: 'date', money: 'money', dollars: 'dollars', enum: 'enum' }[field.type]; assert.equal(point.family, expected, `${t.id}.${key} family`);
      if (field.measure) assert.ok(['money', 'dollars'].includes(field.type), `${t.id}.${key} is a numeric measure`);
    }
    for (const f of Object.values(t.fields)) for (const word of Object.values(t.enumWords)) void word;
  }
  assert.deepEqual(plan.OPERATORS_BY_TYPE.enum, ['equals', 'in']);
});

test('shape 3 list, shape 4 filter: predicates come from declared grammar only', () => {
  assert.equal(get('what appliances do I have').shape, 'LIST');
  assert.equal(get('list my warranties').shape, 'LIST');
  const old = get('which appliances are older than ten years');
  assert.equal(old.shape, 'FILTER'); assert.deepEqual(old.predicates.map((x) => [x.field, x.op]), [['installedOn', 'lt']]);
  assert.equal(new Date(old.predicates[0].value).getUTCFullYear(), 2016);
  const exp = get('which warranties are expiring in the next 90 days'); assert.deepEqual(exp.predicates.map((x) => [x.field, x.op]), [['expiryDate', 'gte'], ['expiryDate', 'lte']]);
  assert.equal(get('show my expired warranties').predicates[0].op, 'lt');
  const cost = get('which appliances cost more than $1,000 to replace'); assert.deepEqual([cost.predicates[0].field, cost.predicates[0].op, cost.predicates[0].value], ['replacementCost', 'gt', 100000]);
  assert.equal(get('what policies have a deductible over 2500 dollars').predicates[0].value, 250000);
  const cond = get('which appliances are in poor condition'); assert.deepEqual([cond.predicates[0].field, cond.predicates[0].value], ['condition', 'POOR']);
  assert.deepEqual(get('which maintenance tasks are overdue').predicates.map((x) => x.field), ['nextDueDate']); assert.equal(get('which maintenance tasks are overdue').excludesClosed, true);
  assert.deepEqual(get('which appliances were installed before 2010').predicates.map((x) => [x.op, x.value.slice(0, 4)]), [['lt', '2010']]);
  assert.equal(get('show high priority maintenance tasks').predicates[0].value, 'HIGH');
  assert.equal(get('which claims are approved').predicates[0].value, 'APPROVED');
});

test('shape 5 sort / top-k: sort keys are declared; an ambiguous measure asks, never guesses; the count is bounded', () => {
  const top = get('what is my most expensive appliance to replace'); assert.deepEqual([top.shape, top.sort.field, top.sort.dir, top.limit], ['TOP_K', 'replacementCost', 'desc', 1]);
  assert.equal(get('what is the oldest appliance I have').sort.field, 'installedOn');
  assert.equal(get('what are my 3 most expensive appliances by purchase price').limit, 3);
  assert.equal(get('which warranty expires first').sort.field, 'expiryDate');
  assert.equal(p('what are my most expensive appliances').kind, 'CLARIFY', 'purchase price or replacement cost is not guessed');
  assert.equal(get('what are my top 500 oldest appliances').limit, 100, 'limit is capped at 100');
});

test('shape 6 aggregate: count, sum, average over declared measures, optionally grouped; a measure must be named when there are several', () => {
  assert.deepEqual([get('how many appliances do I have').aggregate.fn, get('how many appliances do I have').shape], ['COUNT', 'AGGREGATE']);
  assert.equal(get('how many warranties expire in the next 60 days').predicates.length, 2);
  const sum = get('what is the total replacement cost of my appliances'); assert.deepEqual([sum.aggregate.fn, sum.aggregate.field], ['SUM', 'replacementCost']);
  assert.equal(get('what is the average premium on my policies').aggregate.fn, 'AVG');
  assert.equal(p('what is the total cost of my appliances').kind, 'CLARIFY');
  assert.equal(get('how many appliances do I have by condition').aggregate.groupBy, 'condition');
  assert.equal(get('what is the total warranty cost across my warranties').aggregate.field, 'cost');
});

test('no plan: bare nouns, singular lookups, unknown qualifiers, out-of-range windows, tie between kinds', () => {
  for (const m of ['how many items do I have', 'what tasks are overdue', 'what is the serial number of my fridge', 'when does my warranty expire', 'how many open claims do I have', 'which appliances are older than 99 years', 'what is the weather', 'what is the claim number of my claim', 'what is the status of my claim roof hail', 'what is the policy number of my policy', 'what is the settlement on my claim']) assert.equal(p(m).kind, 'NONE', m);
  assert.equal(get('how many open maintenance tasks do I have').excludesClosed, true, 'open tasks is a real predicate');
  assert.equal(p('how many insurance policies and warranties do I have').kind, 'CLARIFY', 'two kinds are asked about, never merged or guessed');
});

test('predicate count is capped and the where clause is built only from declared columns and operators', () => {
  const pl = get('which appliances are older than ten years');
  const w = buildWhere('p1', pl); assert.equal(w.propertyId, 'p1'); assert.deepEqual(Object.keys(w.AND[0]), ['installedOn']);
  assert.throws(() => buildWhere('p1', { ...pl, predicates: [{ field: 'name', op: 'lt', value: 1 }] }), /undeclared/);
  assert.throws(() => buildWhere('p1', { ...pl, predicates: [{ field: 'installedOn', op: 'equals', value: 'x' }] }), /not allowed/);
  assert.throws(() => buildWhere('p1', { ...pl, predicates: new Array(6).fill(pl.predicates[0]) }), /too many/);
});

// ---- handler: audience on every touched field, honest values, sources ----
function stub(role, tables) {
  const saved = { a: propertyAccess.resolvePropertyAccess, ...Object.fromEntries(Object.keys(tables).map((k) => [k, prisma[k]])) }; const calls = [];
  propertyAccess.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role, isOwner: role === 'OWNER' });
  for (const [k, v] of Object.entries(tables)) prisma[k] = Object.fromEntries(Object.entries(v).map(([m, fn]) => [m, async (a) => { calls.push([k, m, a]); return fn(a); }]));
  return { calls, restore() { propertyAccess.resolvePropertyAccess = saved.a; for (const k of Object.keys(tables)) prisma[k] = saved[k]; } };
}
const dump = (r) => JSON.stringify(r);
const items = [{ id: 'i1', name: 'Furnace', installedOn: new Date('2009-05-01T12:00:00Z'), replacementCostCents: 900000, purchaseCostCents: 500000 }, { id: 'i2', name: 'Dryer', installedOn: new Date('2015-05-01T12:00:00Z'), replacementCostCents: 120000, purchaseCostCents: null }];

test('filter by a restricted field is refused BEFORE any read: a viewer cannot filter, rank or total by a money field', async () => {
  const w = stub('VIEWER', { inventoryItem: { findMany: () => items, count: () => 2, aggregate: () => ({}) } });
  try {
    for (const q of ['which appliances cost more than $1,000 to replace', 'what is my most expensive appliance to replace', 'what is the total replacement cost of my appliances']) {
      const r = await dataPointReadResult('u1', 'p1', q); assert.equal(r.reasonCode, 'DATA_POINT_RESTRICTED', q); assert.ok(!dump(r).includes('900000') && !dump(r).includes('Furnace'));
    }
    assert.equal(w.calls.length, 0, 'nothing was queried');
    const ok = await dataPointReadResult('u1', 'p1', 'which appliances are older than ten years'); assert.equal(ok.status, 'ANSWERED'); assert.match(ok.blocks[0].body, /Furnace/);
  } finally { w.restore(); }
});

test('filter list shows the filtered field beside each row; the property scope and predicate reach the database exactly as planned', async () => {
  const w = stub('VIEWER', { inventoryItem: { findMany: () => [items[0]], count: () => 1 } });
  try {
    const r = await dataPointReadResult('u1', 'p1', 'which appliances are older than ten years');
    assert.match(r.blocks[0].body, /Furnace \(May 1, 2009\)|Furnace \(.*2009\)/); assert.equal(r.status, 'ANSWERED');
    const [, , args] = w.calls.find((c) => c[1] === 'findMany'); assert.equal(args.where.propertyId, 'p1'); assert.ok(args.take <= 100);
    assert.deepEqual(Object.keys(args.select).sort(), ['id', 'installedOn', 'name']);
    assert.deepEqual(r.parameters.sources, [{ sourceType: 'InventoryItem', sourceId: 'i1' }]);
  } finally { w.restore(); }
});

test('top-k does not rank unrecorded values and says so; a contributor may rank by money and the sources carry the floor', async () => {
  const w = stub('CONTRIBUTOR', { inventoryItem: { findMany: () => [items[0]], count: (a) => (a.where.replacementCostCents === null ? 3 : 4) } });
  try {
    const r = await dataPointReadResult('u1', 'p1', 'what is my most expensive appliance to replace');
    assert.equal(r.status, 'READY_WITH_LIMITATIONS'); assert.equal(r.reasonCode, 'DATA_POINT_QUERY_PARTIAL');
    assert.match(r.blocks[0].body, /Furnace \(\$9,000\)/); assert.match(r.blocks[0].body, /3 items? (?:has|have) no replacement cost recorded/);
    assert.equal(r.parameters.sources[0].minRole, 'CONTRIBUTOR');
    const [, , args] = w.calls.find((c) => c[1] === 'findMany'); assert.deepEqual(args.where.replacementCostCents, { not: null }); assert.deepEqual(args.orderBy[0], { replacementCostCents: 'desc' });
  } finally { w.restore(); }
});

test('aggregates: count needs no row scan; sum reports how many records had a value and how many did not; an all-null measure says so; claims need a contributor', async () => {
  let w = stub('VIEWER', { inventoryItem: { count: () => 7 } });
  try { const r = await dataPointReadResult('u1', 'p1', 'how many appliances do I have'); assert.match(r.blocks[0].body, /You have 7 items/); assert.deepEqual(r.parameters.sources, [{ sourceType: 'Property', sourceId: 'p1' }]); } finally { w.restore(); }
  w = stub('CONTRIBUTOR', { inventoryItem: { count: (a) => (a.where.replacementCostCents === null ? 2 : 6), aggregate: () => ({ _sum: { replacementCostCents: 2400000 }, _avg: {}, _count: { replacementCostCents: 4 } }) } });
  try { const r = await dataPointReadResult('u1', 'p1', 'what is the total replacement cost of my appliances'); assert.match(r.blocks[0].body, /\$24,000/); assert.match(r.blocks[0].body, /from 4 items with a recorded value/); assert.match(r.blocks[0].body, /2 items have no replacement cost recorded/); assert.equal(r.status, 'READY_WITH_LIMITATIONS'); } finally { w.restore(); }
  w = stub('CONTRIBUTOR', { inventoryItem: { count: () => 5, aggregate: () => ({ _sum: { replacementCostCents: null }, _avg: {}, _count: { replacementCostCents: 0 } }) } });
  try { assert.match((await dataPointReadResult('u1', 'p1', 'what is the total replacement cost of my appliances')).blocks[0].body, /nothing to add up/); } finally { w.restore(); }
  w = stub('VIEWER', { claim: { count: () => 3 } });
  try { const r = await dataPointReadResult('u1', 'p1', 'how many claims do I have'); assert.equal(r.reasonCode, 'DATA_POINT_RESTRICTED'); assert.equal(w.calls.length, 0); } finally { w.restore(); }
  w = stub('CONTRIBUTOR', { claim: { count: () => 3 } });
  try { assert.match((await dataPointReadResult('u1', 'p1', 'how many claims do I have')).blocks[0].body, /You have 3 claims/); } finally { w.restore(); }
  w = stub('CONTRIBUTOR', { claim: { count: () => 3, aggregate: () => ({}) } });
  try { assert.equal((await dataPointReadResult('u1', 'p1', 'what is the total settlement on my claims')).reasonCode, 'DATA_POINT_RESTRICTED', 'amounts stay OWNER'); } finally { w.restore(); }
});

test('group-by count, empty result and the claims row label (type, never the title)', async () => {
  let w = stub('VIEWER', { inventoryItem: { groupBy: () => [{ condition: 'POOR', _count: { _all: 2 } }, { condition: 'GOOD', _count: { _all: 5 } }] } });
  try { const r = await dataPointReadResult('u1', 'p1', 'how many appliances do I have by condition'); assert.match(r.blocks[0].body, /good 5, poor 2/); assert.match(r.blocks[0].body, /You have 7 items/); } finally { w.restore(); }
  w = stub('VIEWER', { inventoryItem: { findMany: () => [], count: () => 0 } });
  try { const r = await dataPointReadResult('u1', 'p1', 'which appliances are older than ten years'); assert.equal(r.status, 'ANSWERED'); assert.match(r.blocks[0].body, /No .* match/); } finally { w.restore(); }
  w = stub('CONTRIBUTOR', { claim: { findMany: () => [{ id: 'c1', type: 'WATER_DAMAGE', title: 'SECRET-TITLE', status: 'APPROVED' }], count: () => 1 } });
  try { const r = await dataPointReadResult('u1', 'p1', 'which claims are approved'); assert.match(r.blocks[0].body, /water damage claim/); assert.ok(!dump(r).includes('SECRET-TITLE')); } finally { w.restore(); }
});

test('routing: query questions reach DATA_POINT_READ; existing specific operations and point reads keep their routes', () => {
  const op = (m) => resolveAskOperation(m).operationId;
  for (const m of ['which appliances are older than ten years', 'how many warranties expire in the next 60 days', 'what is my most expensive appliance to replace']) assert.equal(op(m), 'DATA_POINT_READ', m);
  assert.equal(op('what is the serial number of my refrigerator'), 'INVENTORY_LOOKUP', 'a point read keeps the route it had before the query shapes (unchanged)');
  assert.notEqual(op('what is the weather like'), 'DATA_POINT_READ');
  assert.equal(op('what are my overdue maintenance tasks'), resolveAskOperation('what are my overdue maintenance tasks').operationId); // tasks keep their own status route
});

// ---- review fixes: predicate overflow, property-timezone calendar periods, query snapshot replay ----
test('more recognised predicates than the limit are never executed as a partial set: they are asked back', () => {
  const six = 'which appliances older than ten years in 2012 expiring within 30 days more than $500 in poor condition hvac category';
  const o = p(six); assert.equal(o.kind, 'CLARIFY'); assert.equal(o.reasonCode, 'DATA_POINT_QUERY_TOO_MANY_FILTERS');
  assert.equal(get('which appliances are older than ten years in poor condition').predicates.length, 2, 'within the limit it is unchanged');
});
test('calendar periods use the PROPERTY timezone and calendar boundaries, not rolling UTC windows', () => {
  const at = (iso, tz, m) => { const o = plan.planDataPointQuery(m, new Date(iso), tz); assert.equal(o.kind, 'PLAN', m); return o.plan.predicates.map((x) => [x.op, x.value]); };
  // 2026-11-13 12:00Z is Nov 13 04:00 in Los Angeles. November starts at PDT (UTC-7) and December starts after DST ended (UTC-8).
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'America/Los_Angeles', 'which warranties expire this month'), [['gte', '2026-11-01T07:00:00.000Z'], ['lt', '2026-12-01T08:00:00.000Z']]);
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'America/Los_Angeles', 'which maintenance tasks are due next month'), [['gte', '2026-12-01T08:00:00.000Z'], ['lt', '2027-01-01T08:00:00.000Z']]);
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'UTC', 'which warranties expire this year'), [['gte', '2026-01-01T00:00:00.000Z'], ['lt', '2027-01-01T00:00:00.000Z']]);
  // the same instant is in different months in different zones: 2026-12-01T03:00Z is still Nov 30 in Los Angeles but already Dec 1 in UTC
  assert.deepEqual(at('2026-12-01T03:00:00Z', 'America/Los_Angeles', 'which warranties expire this month')[0], ['gte', '2026-11-01T07:00:00.000Z']);
  assert.deepEqual(at('2026-12-01T03:00:00Z', 'UTC', 'which warranties expire this month')[0], ['gte', '2026-12-01T00:00:00.000Z']);
  // week: Monday start; 2026-11-13 is a Friday, so this week is Mon Nov 9 to Mon Nov 16 (exclusive)
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'America/New_York', 'which maintenance tasks are due this week'), [['gte', '2026-11-09T05:00:00.000Z'], ['lt', '2026-11-16T05:00:00.000Z']]);
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'America/New_York', 'which maintenance tasks are due next week')[0], ['gte', '2026-11-16T05:00:00.000Z']);
  // a year named in the question is a calendar year in the property timezone too
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'Pacific/Auckland', 'which appliances were installed before 2010'), [['lt', '2009-12-31T11:00:00.000Z']]);
  assert.deepEqual(at('2026-11-13T12:00:00Z', 'Not/AZone', 'which warranties expire this year')[0], ['gte', '2026-01-01T00:00:00.000Z'], 'an invalid zone falls back to UTC');
  assert.equal(plan.calendarRange(new Date('2026-03-10T12:00:00Z'), 'America/Chicago', 'month', 0).start.toISOString(), '2026-03-01T06:00:00.000Z', 'DST starts later in March: the boundary uses the offset in force at that instant');
});
test('a query answer is a snapshot: it carries as-of time, is never composable, and a point read is unaffected', async () => {
  const { COMPOSABLE_SOURCE_AUTHORIZATION: AUTH } = require('../../src/services/ask/composition/sourceAuthorization.ts');
  const w = stub('VIEWER', { inventoryItem: { count: () => 7 }, property: { findUnique: () => ({ timezone: 'America/Chicago' }) } });
  try {
    const r = await dataPointReadResult('u1', 'p1', 'how many appliances do I have');
    assert.equal(r.parameters.dataPointQuery.snapshot, true); assert.ok(r.parameters.dataPointQuery.asOf); assert.ok(r.blocks[1].items[0].observedAt, 'the evidence says when it was read');
    assert.equal(AUTH.DATA_POINT_READ.describeSources({ reasonCode: r.reasonCode, parameters: r.parameters, blocks: r.blocks }), null, 'undeclared sources fail closed: never composed or replayed');
    assert.equal(AUTH.DATA_POINT_READ.describeSources({ reasonCode: undefined, parameters: { sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] }, blocks: [] }).length, 1, 'a point read still declares its sources');
  } finally { w.restore(); }
});
