const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
const {
  executeCrossDomainSnapshot,
  INVENTORY_ABSENCE_FIELD_POINT_IDS,
  buildOperationResultFromCrossDomainExecution,
} = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { ABSENCE_REQUIREMENT_REGISTRY } = require('../../src/services/ask/dataPoint/queryShapeRegistries.ts');
const { DATA_POINT_BY_ID } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { planShape789 } = require('../../src/services/ask/dataPoint/dataPointShapes789.ts');

const JOB = 'query.inventory_item.field_absence';
const parse = (prompt) => parseCrossDomainSemanticRequest(prompt).plan;
const facetOf = (prompt) => { const plan = parse(prompt); assert.equal(plan.outcome, 'MATCH', prompt); return plan.facets[0]; };

const rec = (id, name, values, propertyId = 'prop-waves-1') => ({ id, propertyId, name, values });
const FIELD_RECORDS = [
  rec('i-blank', 'Blank Serial', { serialNumber: '   ', modelNumber: 'M1', purchasedOn: null, purchaseCostCents: 0, replacementCostCents: null, lastServicedOn: null, installedOn: null }),
  rec('i-null', 'Null Serial', { serialNumber: null, modelNumber: 'M2', purchasedOn: '2020-01-01', purchaseCostCents: 5000, replacementCostCents: 9000, lastServicedOn: '2025-01-01', installedOn: '2020-02-01' }),
  rec('i-ok', 'Recorded', { serialNumber: 'SN-1', modelNumber: null, purchasedOn: '2021-01-01', purchaseCostCents: null, replacementCostCents: 100, lastServicedOn: null, installedOn: '2021-02-01' }),
  rec('i-other-home', 'Other Home Item', { serialNumber: null }, 'prop-other'),
];
const snapshot = (overrides = {}) => ({ ...buildSeededCrossDomainSnapshot(), inventoryFieldRecords: FIELD_RECORDS, ...overrides });
const run = (prompt, role = 'OWNER', snap = snapshot()) => executeCrossDomainSnapshot({ rawText: prompt, snapshot: snap, role, propertyAuthorized: true });

test('absence phrasings parse to one registered job, one field, negative polarity and the requested projection', () => {
  const cases = [
    ['Which appliances have no serial number recorded?', 'field.inventory_item.serial_number', 'LIST'],
    ['how many appliances have no replacement cost recorded', 'field.inventory_item.replacement_cost', 'COUNT'],
    ['list items without a serial number', 'field.inventory_item.serial_number', 'LIST'],
    ['which appliances lack a purchase date', 'field.inventory_item.purchased_on', 'LIST'],
    ['provide details of appliances without a purchase date', 'field.inventory_item.purchased_on', 'DETAIL'],
    ['which household items have no model number on file', 'field.inventory_item.model_number', 'LIST'],
    ['give me the hvac systems missing an installation date', 'field.inventory_item.installed_on', 'LIST'],
    ['which items have no last service date', 'field.inventory_item.last_serviced_on', 'LIST'],
  ];
  for (const [prompt, fieldId, projection] of cases) {
    const facet = facetOf(prompt);
    assert.equal(facet.evidence.jobMatch, JOB, prompt);
    assert.equal(facet.polarity, 'NEGATIVE', prompt);
    assert.deepEqual(facet.fields.map((f) => f.fieldId), [fieldId], prompt);
    assert.equal(facet.projection, projection, prompt);
    assert.equal(facet.confidenceSignals.grammarComplete, true, prompt);
  }
});

test('the specific field wins over a generic one it contains, and two distinct fields are never answered as one', () => {
  assert.deepEqual(facetOf('which appliances have no replacement cost recorded').fields.map((f) => f.fieldId), ['field.inventory_item.replacement_cost']);
  const both = parse('which appliances have no serial number or model number');
  const absenceFacet = both.facets.find((f) => f.evidence.jobMatch === JOB);
  assert.equal(absenceFacet, undefined, 'an ambiguous two-field absence must not be answered for one field');
});

test('absence is not confused with the warranty relation, time windows or positive reads', () => {
  assert.equal(facetOf('which appliances have no warranty').evidence.jobMatch, 'query.inventory_item.warranty_relation');
  assert.notEqual(parse('what is the serial number of my furnace').facets[0]?.evidence.jobMatch, JOB);
  assert.notEqual(parse('which appliances have a serial number').facets[0]?.evidence.jobMatch, JOB);
});

test('execution lists exactly the property items whose column holds nothing, treating blank text as not recorded and zero money as recorded', async () => {
  const list = await run('Which appliances have no serial number recorded?');
  assert.equal(list.status, 'ANSWERED');
  const facet = list.facetResults[0];
  assert.deepEqual([...facet.recordIds].sort(), ['i-blank', 'i-null']);
  assert.match(facet.summary, /Blank Serial; Null Serial have no serial number recorded/);
  assert.match(facet.summary, /not that it does not exist/);
  assert.equal(facet.entailment.outcome, 'PASS');
  assert.deepEqual(facet.receipt.predicateIds, ['predicate.inventory_item.field_not_recorded']);
  assert.equal(facet.receipt.population.confirmedCount, 2);
  // another home's record is never counted, and $0 is a recorded value
  assert.ok(!facet.recordIds.includes('i-other-home'));
  const cost = await run('which appliances are missing a purchase cost');
  assert.deepEqual([...cost.facetResults[0].recordIds], ['i-ok']);
});

test('COUNT, DETAIL and the empty result keep the requested shape and say exactly what was checked', async () => {
  const count = await run('how many appliances have no serial number recorded');
  assert.equal(count.facetResults[0].receipt.projection, 'COUNT');
  assert.match(count.facetResults[0].summary, /2 of your items have no serial number recorded/);
  const detail = await run('provide details of appliances without a purchase date');
  assert.equal(detail.facetResults[0].receipt.projection, 'DETAIL');
  const none = await run('which appliances have no install date', 'OWNER', snapshot({ inventoryFieldRecords: [rec('a', 'A', { installedOn: '2020-01-01' }), rec('b', 'B', { installedOn: '2021-01-01' })] }));
  assert.equal(none.status, 'ANSWERED');
  assert.match(none.facetResults[0].summary, /None of your inventory items is missing a/);
  assert.deepEqual([...none.facetResults[0].recordIds], []);
  assert.equal(none.facetResults[0].entailment.outcome, 'PASS');
});

test('the audience floor of every absence field comes from the data-point catalogue and also gates which items are named', async () => {
  const promptFor = { 'field.inventory_item.serial_number': 'which appliances have no serial number', 'field.inventory_item.model_number': 'which appliances have no model number', 'field.inventory_item.installed_on': 'which appliances have no installation date', 'field.inventory_item.purchased_on': 'which appliances have no purchase date', 'field.inventory_item.purchase_cost': 'which appliances have no purchase cost', 'field.inventory_item.replacement_cost': 'which appliances have no replacement cost', 'field.inventory_item.last_serviced_on': 'which appliances have no last service date' };
  const rank = { VIEWER: 1, EDITOR: 2, OWNER: 3 };
  const required = (audience) => (audience === 'OWNER' ? 'OWNER' : audience === 'CONTRIBUTOR' ? 'EDITOR' : 'VIEWER');
  for (const [fieldId, pointId] of Object.entries(INVENTORY_ABSENCE_FIELD_POINT_IDS)) {
    const point = DATA_POINT_BY_ID.get(pointId);
    for (const role of ['VIEWER', 'EDITOR', 'OWNER']) {
      const out = (await run(promptFor[fieldId], role)).facetResults[0];
      if (rank[role] >= rank[required(point.audience)]) {
        assert.equal(out.status, 'EXECUTED', `${fieldId} for ${role}`);
      } else {
        assert.equal(out.status, 'BLOCKED', `${fieldId} for ${role}`);
        assert.deepEqual(out.recordIds, []);
        assert.ok(out.redactedFieldIds.includes(fieldId));
        assert.ok(!/Blank Serial|Null Serial|Recorded/.test(out.summary), 'a restricted gap must not name items');
      }
    }
  }
});

test('when the item columns were not loaded the answer is unavailable, never "everything is recorded"', async () => {
  const out = (await run('which appliances have no serial number', 'OWNER', { ...buildSeededCrossDomainSnapshot() })).facetResults[0];
  assert.equal(out.status, 'BLOCKED');
  assert.equal(out.receipt, null);
  assert.ok(!/None of your inventory items/.test(out.summary));
});

test('every natural phrasing built from the absence registry vocabulary resolves to its own field (lexicon stays in sync with the registry)', () => {
  const pointToField = Object.fromEntries(Object.entries(INVENTORY_ABSENCE_FIELD_POINT_IDS).map(([fieldId, pointId]) => [pointId, fieldId]));
  // Question wordings that only make sense as value reads, never as "no <value> recorded".
  const NOT_ABSENCE_WORDINGS = new Set(['did we install', 'did i install', 'cost when i bought']);
  let checked = 0;
  for (const entry of ABSENCE_REQUIREMENT_REGISTRY) {
    const point = DATA_POINT_BY_ID.get(entry.dataPointId);
    const expected = pointToField[entry.dataPointId];
    assert.ok(expected, `${entry.dataPointId} must map to a registered absence field`);
    for (const alias of [...point.aliases, ...(entry.words ?? [])].filter((a) => a.length > 3 && !NOT_ABSENCE_WORDINGS.has(a))) {
      const prompt = `which appliances have no ${alias} recorded`;
      const facet = parse(prompt).facets[0];
      assert.equal(facet?.evidence.jobMatch, JOB, prompt);
      assert.equal(facet.fields[0].fieldId, expected, prompt);
      checked += 1;
    }
  }
  assert.ok(checked >= 30);
});

test('the legacy absence recognizer is gone: the shape planner no longer claims these questions (FR-ONT-8)', () => {
  for (const prompt of ['Which appliances have no serial number recorded?', 'How many appliances are missing a purchase date?', 'Which items have no model number on file?', 'Which items have no replacement cost recorded?']) {
    assert.equal(planShape789(prompt), null, prompt);
  }
});

test('a field-absence answer is grounded by an independently parsed grammar plan, and a forged receipt is withheld (provisional-read gate)', async () => {
  const { groundedReadVerdict } = require('../../src/services/ask/support/provisionalRead.ts');
  const question = 'Which appliances have no serial number recorded?';
  const operationResult = buildOperationResultFromCrossDomainExecution(await run(question));
  assert.ok(operationResult.parameters.semanticExecutionReceipt, 'the executor must attach its typed receipt');
  assert.equal(groundedReadVerdict(question, operationResult).outcome, 'PASS');

  // The same receipt cannot ground a different question (projection and facet come from the question's own grammar plan).
  assert.equal(groundedReadVerdict('how many appliances have no serial number recorded', operationResult).outcome, 'FAIL');
  const forged = structuredClone(operationResult);
  forged.parameters.semanticExecutionReceipt.population.confirmedCount = 99;
  assert.equal(groundedReadVerdict(question, forged).outcome, 'FAIL');
});
