// BICC-EVAL-019 / BICC-GATE-004A1 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md): the reusable, parameterised deterministic suite for
// home-record reads. Each case runs the REAL reader (`readDataPoint`) and value formatter against an in-memory property database and asserts the exact
// outcome. The suite is a fixed partition matrix, not a sample: it reports partition coverage and makes no population confidence claim. A failure adds a
// permanent regression case; the suite is never "burned" (EVAL-019). Expected values are written independently of the code under test.
require('ts-node/register');
const { prisma } = require('../../../src/lib/prisma.ts');
const { DATA_POINT_DEFINITIONS, READABLE_FIELDS, roleMayRead } = require('../../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { readDataPoint, DATA_POINT_ITEM_ROW_CAP } = require('../../../src/services/ask/dataPoint/dataPointReader.ts');
const { formatDataPointValue } = require('../../../src/services/ask/handlers/dataPointRead.handler.ts');

const P1 = 'property-1'; const P2 = 'property-2';
const RANK = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };
const ROLES = ['VIEWER', 'CONTRIBUTOR', 'OWNER'];
const BANNED_COLUMNS = ['notes', 'description', 'email', 'phone', 'userId', 'ownerId', 'passwordHash', 'ssn'];

// entity -> how the fixture builds a row and how the question names it
const ENTITIES = {
  InventoryItem: { delegate: 'inventoryItem', mode: 'NAMED', label: 'Furnace', other: 'Dishwasher', build: (id, field, value, property, label) => ({ id, propertyId: property, name: label, room: { name: 'Basement' }, [field]: value }) },
  Warranty: { delegate: 'warranty', mode: 'NAMED', label: 'Dishwasher', other: 'Furnace', build: (id, field, value, property, label) => ({ id, propertyId: property, providerName: 'Acme Care', category: 'APPLIANCE', inventoryItem: { name: label }, [field]: value }) },
  InsurancePolicy: { delegate: 'insurancePolicy', mode: 'NAMED', label: 'Harbor Mutual', other: 'Summit Home', build: (id, field, value, property, label) => ({ id, propertyId: property, carrierName: label, coverageType: 'HOMEOWNERS', [field]: value }) },
  PropertyMaintenanceTask: { delegate: 'propertyMaintenanceTask', mode: 'NAMED', label: 'Clean gutters', other: 'Service furnace', build: (id, field, value, property, label) => ({ id, propertyId: property, title: label, [field]: value }) },
  Property: { delegate: 'property', mode: 'SINGLETON', build: (id, field, value, property) => ({ id: property, [field]: value }) },
  HomeReserveFund: { delegate: 'homeReserveFund', mode: 'SINGLETON', build: (id, field, value, property) => ({ id, propertyId: property, lastRecalculatedAt: new Date('2026-01-01T00:00:00Z'), [field]: value }) },
  PropertySalePrepProfile: { delegate: 'propertySalePrepProfile', mode: 'SINGLETON', build: (id, field, value, property) => ({ id, propertyId: property, [field]: value }) },
  PropertySaleCase: { delegate: 'propertySaleCase', mode: 'SINGLETON', build: (id, field, value, property) => ({ id, propertyId: property, [field]: value }) },
  HomeBuyerChecklist: { delegate: 'homeBuyerChecklist', mode: 'SINGLETON', build: (id, field, value, property) => ({ id, propertyId: property, status: 'ACTIVE', [field]: value }) },
  PropertyTaxBillRecord: { delegate: 'propertyTaxBillRecord', mode: 'LATEST_TAX_YEAR', build: (id, field, value, property, label, year = 2025) => ({ id, propertyId: property, taxYear: year, status: 'ACTIVE', supersededById: null, observedAt: new Date(`${year}-06-01T00:00:00Z`), confidence: 'HIGH', sourceType: 'OFFICIAL_SOURCE', [field]: value }) },
  PropertyTaxAssessmentRecord: { delegate: 'propertyTaxAssessmentRecord', mode: 'LATEST_TAX_YEAR', build: (id, field, value, property, label, year = 2025) => ({ id, propertyId: property, taxYear: year, status: 'ACTIVE', supersededById: null, observedAt: new Date(`${year}-06-01T00:00:00Z`), confidence: 'HIGH', sourceType: 'OFFICIAL_SOURCE', [field]: value }) },
};

// A typical stored value for each family, and the exact string the homeowner must see (derived by hand, not by calling the formatter).
const SAMPLE = {
  date: { value: new Date('2026-03-05T00:00:00Z'), text: 'Mar 5, 2026' },
  money: { value: 123456, text: '$1,235' },
  dollars: { value: 1250.5, text: '$1,251' },
  percent: { value: 0.0125, text: '1.250%' },
  enum: { value: 'IN_PROGRESS', text: 'in progress' },
  flag: { value: true, text: 'yes' },
  text: { value: 'Alpha Co', text: 'Alpha Co' },
  tags: { value: ['a', 'b'], text: 'a, b' },
  number: { value: 7, text: '7' },
};
const NUMBER_SAMPLE = { 'home.livingArea': { value: 2150, text: '2,150 sq ft' }, 'home.bedrooms': { value: 3, text: '3 bedrooms' }, 'home.bathrooms': { value: 2, text: '2 bathrooms' }, 'home.yearBuilt': { value: 1987, text: '1987' } };
const sampleFor = (point) => (point.family === 'number' && NUMBER_SAMPLE[point.id]) || SAMPLE[point.family] || { value: 'x', text: 'x' };

const points = DATA_POINT_DEFINITIONS.filter((point) => ENTITIES[point.entity]);

// ---------------- the in-memory property database ----------------
function installDatabase(tables) {
  const seen = []; const originals = {};
  const matches = (row, where = {}) => Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
      return true; // nested relation filters are not modelled; the reader's own scoping columns are
    }
    return row[key] === condition;
  });
  for (const entity of Object.values(ENTITIES)) {
    const delegate = prisma[entity.delegate];
    originals[entity.delegate] = delegate.findMany;
    delegate.findMany = async (args) => {
      seen.push({ delegate: entity.delegate, args });
      let rows = (tables[entity.delegate] ?? []).filter((row) => matches(row, args.where));
      if (args.orderBy) for (const order of [].concat(args.orderBy).reverse()) { const [key, direction] = Object.entries(order)[0]; rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === 'desc' ? -1 : 1)); }
      return rows.slice(0, args.take ?? rows.length).map((row) => ({ ...row }));
    };
  }
  return { seen, restore: () => { for (const entity of Object.values(ENTITIES)) prisma[entity.delegate].findMany = originals[entity.delegate]; } };
}

// ---------------- case builders ----------------
const cases = [];
const add = (id, partition, description, run) => cases.push({ id, partition, description, run });
const nameQuestion = (entity, label) => (ENTITIES[entity].mode === 'NAMED' ? `Tell me about the ${label.toLowerCase()}` : 'Tell me about my home');
const rowFor = (point, value, property = P1, label, id = 'r1', year) => ENTITIES[point.entity].build(id, point.field, value, property, label ?? ENTITIES[point.entity].label, year);
const run = async (tables, point, message, role = 'OWNER', property = P1) => { const db = installDatabase(tables); try { const result = await readDataPoint(property, role, point, message); return { result, seen: db.seen }; } finally { db.restore(); } };
const tableOf = (point, rows) => ({ [ENTITIES[point.entity].delegate]: rows });

for (const point of points) {
  const entity = ENTITIES[point.entity]; const sample = sampleFor(point); const label = entity.label;
  const message = nameQuestion(point.entity, label);
  // VALUE: the recorded value comes back exactly, and the homeowner sees the exact text.
  add(`value:${point.id}`, 'VALUE', `${point.id}: a recorded value is returned exactly and formatted exactly`, async () => {
    const { result } = await run(tableOf(point, [rowFor(point, sample.value)]), point, message);
    assert(result.status === 'FOUND', `status ${result.status}`);
    assert(result.rows.length === 1, `rows ${result.rows.length}`);
    assertDeepEqual(result.rows[0].value, sample.value);
    assert(formatDataPointValue(point, result.rows[0].value) === sample.text, `formatted ${formatDataPointValue(point, result.rows[0].value)} !== ${sample.text}`);
  });
  // MISSING_DATA: a record that exists with no value is "not recorded", never a guess and never another record's value.
  add(`missing:${point.id}`, 'MISSING_DATA', `${point.id}: an existing record with no value is NOT_RECORDED`, async () => {
    const { result } = await run(tableOf(point, [rowFor(point, null)]), point, message);
    assert(result.status === 'NOT_RECORDED', `status ${result.status}`);
  });
  // AUTHORIZATION: the audience floor holds for every role, on the reader itself.
  add(`role:${point.id}`, 'AUTHORIZATION', `${point.id}: floor ${point.audience} is enforced for every role`, async () => {
    for (const role of ROLES) {
      const allowed = RANK[role] >= RANK[point.audience];
      assert(roleMayRead(role, point) === allowed, `roleMayRead ${role}`);
      let threw = false; let result = null;
      try { ({ result } = await run(tableOf(point, [rowFor(point, sample.value)]), point, message, role)); } catch { threw = true; }
      assert(threw === !allowed, `${role}: expected ${allowed ? 'a read' : 'a refusal'}`);
      if (allowed) assert(result.status === 'FOUND', `${role}: ${result.status}`);
    }
  });
  // ENTITY (named records): the question picks its own record; another record's value is never returned; an unknown name is "not found".
  if (entity.mode === 'NAMED') {
    add(`entity-named:${point.id}`, 'ENTITY', `${point.id}: a named record returns only that record`, async () => {
      // When the field is itself a column that names the record (a carrier, a title), the value is the label, so the name still selects the record.
      const naming = ['carrierName', 'title', 'name', 'providerName', 'category', 'coverageType'].includes(point.field);
      const mine = rowFor(point, naming ? entity.label : sample.value, P1, entity.label, 'mine'); const other = rowFor(point, naming ? entity.other : 'OTHER-VALUE', P1, entity.other, 'other');
      const { result } = await run(tableOf(point, [mine, other]), point, nameQuestion(point.entity, entity.label));
      assert(result.status === 'FOUND' && result.rows.length === 1 && result.rows[0].id === 'mine', `${result.status} ${result.rows.map((r) => r.id)}`);
    });
    add(`entity-unknown:${point.id}`, 'ENTITY', `${point.id}: a name that matches no record returns NO_ITEM_NAMED, never the only record`, async () => {
      const { result } = await run(tableOf(point, [rowFor(point, sample.value, P1, entity.label, 'a'), rowFor(point, sample.value, P1, entity.other, 'b')]), point, 'Tell me about the unicorn paddock');
      assert(result.status === 'NO_ITEM_NAMED' || result.status === 'AMBIGUOUS', result.status);
      assert(result.rows.every((r) => r.value === null || r.value === undefined || result.status === 'AMBIGUOUS'), 'no value is returned for an unnamed record');
    });
    add(`entity-none:${point.id}`, 'ENTITY', `${point.id}: no records at all returns ITEM_NOT_FOUND`, async () => {
      const { result } = await run(tableOf(point, []), point, nameQuestion(point.entity, entity.label));
      assert(['ITEM_NOT_FOUND', 'NO_ITEM_NAMED'].includes(result.status) && result.rows.length === 0, result.status);
    });
  }
}

// property isolation, select-list allowlist and read-mode branches, once per entity
for (const [entityName, entity] of Object.entries(ENTITIES)) {
  const point = points.find((p) => p.entity === entityName); const sample = sampleFor(point);
  add(`isolation:${entityName}`, 'AUTHORIZATION', `${entityName}: another property's record is never returned`, async () => {
    const mine = rowFor(point, sample.value, P1, entity.label, 'mine'); const theirs = rowFor(point, 'FOREIGN', P2, entity.label, 'theirs');
    const { result, seen } = await run(tableOf(point, [theirs, mine]), point, nameQuestion(entityName, entity.label));
    assert(result.rows.every((r) => r.id !== 'theirs' && r.value !== 'FOREIGN'), 'a foreign record leaked');
    const scoped = entityName === 'Property' ? seen.every((q) => q.args.where.id === P1) : seen.every((q) => q.args.where.propertyId === P1);
    assert(scoped, 'every query is scoped to the authorised property');
  });
  add(`select:${entityName}`, 'AUTHORIZATION', `${entityName}: the query selects only reviewed columns`, async () => {
    const { seen } = await run(tableOf(point, [rowFor(point, sample.value)]), point, nameQuestion(entityName, entity.label));
    assert(seen.length >= 1, 'a query ran');
    for (const query of seen) {
      const columns = Object.keys(query.args.select ?? {});
      for (const banned of BANNED_COLUMNS) assert(!columns.includes(banned), `selected ${banned}`);
      assert(columns.includes(point.field), `the requested field ${point.field} is selected`);
      assert(READABLE_FIELDS[entityName].includes(point.field), 'the field is in the reviewed list');
    }
    assert(seen.every((q) => Number.isInteger(q.args.take) || entity.mode !== 'NAMED'), 'a named read has a hard row cap');
  });
  add(`branch:${entityName}`, 'FORMULA_BRANCH', `${entityName}: the ${entity.mode} read branch returns the one record the property has`, async () => {
    const { result } = await run(tableOf(point, [rowFor(point, sample.value)]), point, nameQuestion(entityName, entity.label));
    assert(result.status === 'FOUND' && result.rows.length === 1, `${result.status}`);
  });
  if (entity.mode !== 'NAMED') add(`no-record:${entityName}`, 'MISSING_DATA', `${entityName}: a property with no record says ITEM_NOT_FOUND`, async () => {
    const { result } = await run(tableOf(point, []), point, nameQuestion(entityName, entity.label));
    assert(result.status === 'ITEM_NOT_FOUND' && result.rows.length === 0, result.status);
  });
}

// DATE and UNIT: exact formatting, with calendar boundaries and unit edge cases
const fmt = (family, value, id = 'x') => formatDataPointValue({ family, id }, value);
const DATE_CASES = [
  ['2026-03-05T00:00:00Z', 'Mar 5, 2026'], ['2026-12-31T23:59:59Z', 'Dec 31, 2026'], ['2028-02-29T12:00:00Z', 'Feb 29, 2028'], ['2026-01-01T00:00:00Z', 'Jan 1, 2026'],
  ['2025-02-28T12:00:00Z', 'Feb 28, 2025'], ['2026-07-04T12:00:00Z', 'Jul 4, 2026'], ['2030-10-15T12:00:00Z', 'Oct 15, 2030'], ['1999-12-31T12:00:00Z', 'Dec 31, 1999'],
  ['2026-09-30T12:00:00Z', 'Sep 30, 2026'], ['2026-05-01T12:00:00Z', 'May 1, 2026'], ['2024-02-29T12:00:00Z', 'Feb 29, 2024'], ['2026-11-22T12:00:00Z', 'Nov 22, 2026'],
];
for (const [iso, text] of DATE_CASES) add(`date:${iso}`, 'DATE', `a date ${iso} reads ${text}`, async () => assert(fmt('date', new Date(iso)) === text, fmt('date', new Date(iso))));
add('date:string-input', 'DATE', 'a date given as a date-only string reads the same calendar day', async () => assert(fmt('date', '2026-01-01') === 'Jan 1, 2026', fmt('date', '2026-01-01')));
add('date:invalid-never-throws', 'DATE', 'an invalid stored date is shown as nothing, never a crash', async () => assert(fmt('date', new Date('not-a-date')) === '', 'invalid date'));
const MONEY_CASES = [[123456, '$1,235'], [0, '$0'], [-5000, '-$50'], [100, '$1'], [100000000, '$1,000,000'], [250, '$3'], [49, '$0'], [999999, '$10,000']];
for (const [cents, text] of MONEY_CASES) add(`money:${cents}`, 'UNIT', `${cents} cents reads ${text}`, async () => assert(fmt('money', cents) === text, fmt('money', cents)));
const DOLLAR_CASES = [[1250.5, '$1,251'], [999.49, '$999'], [0, '$0'], [1000000, '$1,000,000'], [{ toNumber: () => 4321.2 }, '$4,321'], [75, '$75']];
DOLLAR_CASES.forEach(([value, text], index) => add(`dollars:${index}`, 'UNIT', `dollars case ${index} reads ${text}`, async () => assert(fmt('dollars', value) === text, fmt('dollars', value))));
const PERCENT_CASES = [[0.0125, '1.250%'], [0, '0.000%'], [0.05, '5.000%'], [0.1, '10.000%'], [0.0007, '0.070%'], [1, '100.000%']];
PERCENT_CASES.forEach(([value, text]) => add(`percent:${value}`, 'UNIT', `rate ${value} reads ${text}`, async () => assert(fmt('percent', value) === text, fmt('percent', value))));
const NUMBER_CASES = [['home.livingArea', 2150, '2,150 sq ft'], ['home.livingArea', 850, '850 sq ft'], ['home.livingArea', 10000, '10,000 sq ft'], ['home.bedrooms', 1, '1 bedroom'], ['home.bedrooms', 3, '3 bedrooms'], ['home.bedrooms', 0, '0 bedrooms'],
  ['home.bathrooms', 1, '1 bathroom'], ['home.bathrooms', 2, '2 bathrooms'], ['home.bathrooms', 1.5, '1.5 bathrooms'], ['home.yearBuilt', 1987, '1987']];
NUMBER_CASES.forEach(([id, value, text]) => add(`number:${id}:${value}`, 'UNIT', `${id} ${value} reads ${text}`, async () => assert(fmt('number', value, id) === text, fmt('number', value, id))));
[['IN_PROGRESS', 'in progress'], ['HIGH', 'high'], ['GOOD', 'good'], ['NOT_STARTED', 'not started'], ['HVAC', 'HVAC']].forEach(([value, text]) => add(`enum:${value}`, 'UNIT', `${value} reads ${text}`, async () => assert(fmt('enum', value) === text, fmt('enum', value))));
add('flag:true', 'UNIT', 'true reads yes', async () => assert(fmt('flag', true) === 'yes', ''));
add('flag:false', 'UNIT', 'false reads no (a recorded false is a value, not missing)', async () => assert(fmt('flag', false) === 'no', ''));
add('tags:list', 'UNIT', 'tags read as a comma list', async () => assert(fmt('tags', ['a', 'b']) === 'a, b', ''));

// BOUNDARY: edge values and caps
add('boundary:zero-is-a-value', 'BOUNDARY', 'a recorded zero is FOUND, not missing', async () => {
  const point = points.find((p) => p.id === 'reserve.balance');
  const { result } = await run(tableOf(point, [rowFor(point, 0)]), point, 'Tell me about my home');
  assert(result.status === 'FOUND' && result.rows[0].value === 0, result.status);
});
add('boundary:false-is-a-value', 'BOUNDARY', 'a recorded false is FOUND, not missing', async () => {
  const point = DATA_POINT_DEFINITIONS.find((p) => p.family === 'flag' && ENTITIES[p.entity]);
  if (!point) return;
  const { result } = await run(tableOf(point, [rowFor(point, false)]), point, nameQuestion(point.entity, ENTITIES[point.entity].label));
  assert(result.status === 'FOUND', result.status);
});
add('boundary:empty-string-is-missing', 'BOUNDARY', 'an empty string is NOT_RECORDED', async () => {
  const point = points.find((p) => p.id === 'item.brand');
  const { result } = await run(tableOf(point, [rowFor(point, '')]), point, nameQuestion('InventoryItem', 'Furnace'));
  assert(result.status === 'NOT_RECORDED', result.status);
});
add('boundary:empty-tags-is-missing', 'BOUNDARY', 'an empty tag list is NOT_RECORDED', async () => {
  const point = points.find((p) => p.id === 'item.tags');
  const { result } = await run(tableOf(point, [rowFor(point, [])]), point, nameQuestion('InventoryItem', 'Furnace'));
  assert(result.status === 'NOT_RECORDED', result.status);
});
add('boundary:row-cap', 'BOUNDARY', 'a named read never asks for more than the hard row cap', async () => {
  const point = points.find((p) => p.id === 'item.brand');
  const rows = Array.from({ length: DATA_POINT_ITEM_ROW_CAP + 25 }, (_, i) => rowFor(point, `Brand ${i}`, P1, `Item ${i}`, `r${i}`));
  const { seen } = await run(tableOf(point, rows), point, 'Tell me about the unicorn');
  assert(seen.every((q) => q.args.take <= DATA_POINT_ITEM_ROW_CAP), `take ${seen.map((q) => q.args.take)}`);
});
add('boundary:tax-year-named', 'BOUNDARY', 'a named tax year returns that year; a year with no record says so and never falls back', async () => {
  const point = points.find((p) => p.id === 'taxBill.amount');
  const rows = [rowFor(point, 1000, P1, null, 'y25', 2025), rowFor(point, 900, P1, null, 'y24', 2024)];
  const named = await run(tableOf(point, rows), point, 'What was my property tax bill amount for 2024?');
  assert(named.result.status === 'FOUND' && named.result.rows[0].id === 'y24' && named.result.rows[0].value === 900, `${named.result.status}`);
  const missing = await run(tableOf(point, rows), point, 'What was my property tax bill amount for 2019?');
  assert(missing.result.status === 'NO_ITEM_NAMED' && missing.result.rows.length === 0, missing.result.status);
});
add('boundary:tax-latest-year', 'BOUNDARY', 'with no year named, the latest tax year is read', async () => {
  const point = points.find((p) => p.id === 'taxBill.amount');
  const { result } = await run(tableOf(point, [rowFor(point, 900, P1, null, 'y24', 2024), rowFor(point, 1000, P1, null, 'y25', 2025)]), point, 'What is my property tax bill amount?');
  assert(result.rows[0].id === 'y25' && result.rows[0].value === 1000, `${result.rows.map((r) => r.id)}`);
});
add('boundary:superseded-tax-record', 'BOUNDARY', 'a superseded tax record is never read', async () => {
  const point = points.find((p) => p.id === 'taxBill.amount');
  const live = rowFor(point, 1000, P1, null, 'live', 2025); const old = { ...rowFor(point, 5000, P1, null, 'old', 2025), supersededById: 'live' };
  const { result } = await run(tableOf(point, [old, live]), point, 'What is my property tax bill amount?');
  assert(result.rows[0].id === 'live', `${result.rows.map((r) => r.id)}`);
});
add('boundary:reserve-never-recalculated', 'BOUNDARY', 'a reserve fund that was never recalculated carries a limitation', async () => {
  const point = points.find((p) => p.id === 'reserve.balance');
  const row = { ...rowFor(point, 0), lastRecalculatedAt: null };
  const { result } = await run(tableOf(point, [row]), point, 'Tell me about my home');
  assert(/never been recalculated/i.test(String(result.rows[0].limitation)), String(result.rows[0].limitation));
});
add('boundary:tax-low-confidence', 'BOUNDARY', 'a low-confidence tax record is not stated plainly', async () => {
  const point = points.find((p) => p.id === 'taxBill.amount');
  const row = { ...rowFor(point, 1000, P1, null, 'y25', 2025), confidence: 'LOW' };
  const { result } = await run(tableOf(point, [row]), point, 'What is my property tax bill amount?');
  assert(/confidence/i.test(String(result.rows[0].limitation)), String(result.rows[0].limitation));
});

function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertDeepEqual(actual, expected) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

/** Cases recorded after a defect was found, so the suite only ever grows (EVAL-019). Each carries the defect it guards. */
const PERMANENT_REGRESSIONS = new Set(['date:invalid-never-throws', 'enum:HIGH', 'enum:GOOD']);

module.exports = { cases, PERMANENT_REGRESSIONS, manifest: () => ({ version: '1', suite: 'HOME_RECORD_READ', cases: cases.map((c) => ({ id: c.id, partition: c.partition, description: c.description, ...(PERMANENT_REGRESSIONS.has(c.id) ? { permanentRegression: true } : {}) })), claimsPopulationBound: false }) };
