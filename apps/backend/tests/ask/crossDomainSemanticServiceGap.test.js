const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
const { executeCrossDomainSnapshot, buildOperationResultFromCrossDomainExecution } = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { planShape789 } = require('../../src/services/ask/dataPoint/dataPointShapes789.ts');
const { groundedReadVerdict } = require('../../src/services/ask/support/provisionalRead.ts');
const { SemanticRequestPlanSchema, ASK_SEMANTIC_PLAN_VERSION } = require('../../src/services/ask/semantic/semanticRequestPlan.ts');

const JOB = 'query.inventory_item.service_gap';
const parse = (prompt) => parseCrossDomainSemanticRequest(prompt).plan;
const facetOf = (prompt) => { const plan = parse(prompt); assert.equal(plan.outcome, 'MATCH', prompt); return plan.facets[0]; };

// asOfDate of the seeded snapshot is 2026-11-15, so "over a year" means before 2025-11-15.
const rec = (id, name, lastServicedOn, propertyId = 'prop-waves-1') => ({ id, propertyId, name, values: { lastServicedOn } });
const RECORDS = [
  rec('old', 'Old Furnace', '2020-06-01'),
  rec('edge', 'Edge Boiler', '2025-11-15'),
  rec('recent', 'Recent Washer', '2026-09-01'),
  rec('date-obj', 'Date Object Dryer', new Date('2019-01-01T00:00:00.000Z')),
  rec('never', 'Never Serviced Fridge', null),
  rec('other-home', 'Other Home Item', '2001-01-01', 'prop-other'),
];
const snap = (overrides = {}) => ({ ...buildSeededCrossDomainSnapshot(), inventoryFieldRecords: RECORDS, ...overrides });
const run = (prompt, role = 'OWNER', s = snap()) => executeCrossDomainSnapshot({ rawText: prompt, snapshot: s, role, propertyAuthorized: true });

test('service-gap phrasings parse to one registered job with an explicit elapsed window (or none for "never")', () => {
  const cases = [
    ['Which appliances have I not serviced in over a year?', { kind: 'ELAPSED_WINDOW', unit: 'YEAR', count: 1 }, 'LIST'],
    ['how many items havent been serviced in over 2 years', { kind: 'ELAPSED_WINDOW', unit: 'YEAR', count: 2 }, 'COUNT'],
    ['which appliances have not been serviced in the last 18 months', { kind: 'ELAPSED_WINDOW', unit: 'MONTH', count: 18 }, 'LIST'],
    ["which items haven't been serviced for more than five years", { kind: 'ELAPSED_WINDOW', unit: 'YEAR', count: 5 }, 'LIST'],
    ['which appliances have never been serviced', null, 'LIST'],
    ['list household items that are unserviced', null, 'LIST'],
    ['which appliances have never been serviced in over 3 years', { kind: 'ELAPSED_WINDOW', unit: 'YEAR', count: 3 }, 'LIST'],
  ];
  for (const [prompt, time, projection] of cases) {
    const facet = facetOf(prompt);
    assert.equal(facet.evidence.jobMatch, JOB, prompt);
    assert.equal(facet.polarity, 'NEGATIVE', prompt);
    assert.deepEqual(facet.time, time, prompt);
    assert.equal(facet.projection, projection, prompt);
    assert.deepEqual(facet.fields.map((f) => f.fieldId), ['field.inventory_item.last_serviced_on'], prompt);
    // the plan is valid under the versioned contract, including the new window kind
    assert.equal(SemanticRequestPlanSchema.safeParse(parse(prompt)).success, true, prompt);
  }
  assert.equal(ASK_SEMANTIC_PLAN_VERSION, '1.4.0');
});

test('a window needs an explicit quantity and a believable size; otherwise the meaning stays unresolved, never guessed', () => {
  for (const prompt of ['which appliances have I not serviced in the last year', 'which appliances have I not serviced in over 60 years', 'which appliances have I not serviced in over 700 months', 'which appliances have never been serviced in the last six months']) {
    assert.notEqual(parse(prompt).facets[0]?.evidence.jobMatch, JOB, prompt);
  }
});

test('service gap is not confused with field absence, warranty, or positive questions', () => {
  assert.equal(facetOf('which items have no last service date').evidence.jobMatch, 'query.inventory_item.field_absence');
  assert.equal(facetOf('which appliances have no warranty').evidence.jobMatch, 'query.inventory_item.warranty_relation');
  assert.notEqual(parse('when was my furnace last serviced').facets[0]?.evidence.jobMatch, JOB);
});

test('execution: a recorded date older than the window is a confirmed gap, a missing date is a separate unknown population, other homes never count', async () => {
  const out = await run('Which appliances have I not serviced in over a year?');
  assert.equal(out.status, 'ANSWERED');
  const facet = out.facetResults[0];
  assert.deepEqual([...facet.recordIds].sort(), ['date-obj', 'old']);
  assert.ok(!facet.recordIds.includes('edge'), 'a service exactly one year ago is not older than a year');
  assert.ok(!facet.recordIds.includes('recent') && !facet.recordIds.includes('other-home'));
  assert.match(facet.summary, /Date Object Dryer; Old Furnace were last serviced more than 1 year ago/);
  assert.match(facet.summary, /1 more has no service date at all, so it may have been serviced without being recorded/);
  assert.equal(facet.receipt.population.confirmedCount, 2);
  assert.equal(facet.receipt.population.unknownCount, 1);
  assert.equal(facet.entailment.outcome, 'PASS');
  assert.deepEqual(facet.receipt.predicateIds, ['predicate.inventory_item.service_gap']);
});

test('month windows, COUNT, and the empty result keep their meaning', async () => {
  const months = (await run('which appliances have not been serviced in over 14 months')).facetResults[0];
  assert.deepEqual([...months.recordIds].sort(), ['date-obj', 'old']);
  const count = (await run('how many appliances have not been serviced in over 5 years')).facetResults[0];
  assert.equal(count.receipt.projection, 'COUNT');
  assert.match(count.summary, /2 of your items were last serviced more than 5 years ago/);
  const tight = (await run('which appliances have not been serviced in over 3 months')).facetResults[0];
  assert.deepEqual([...tight.recordIds].sort(), ['date-obj', 'edge', 'old'], 'a service on 2026-09-01 is inside 3 months of 2026-11-15; 2025-11-15 is outside');
  const none = (await run('which appliances have not been serviced in over a year', 'OWNER', snap({ inventoryFieldRecords: [rec('a', 'A', '2026-10-01'), rec('b', 'B', '2026-11-01')] }))).facetResults[0];
  assert.match(none.summary, /Every item with a service date was serviced within 1 year/);
  assert.deepEqual([...none.recordIds], []);
  assert.equal(none.entailment.outcome, 'PASS');
});

test('"never serviced" lists items with no recorded service and says "not recorded" is not "never happened"', async () => {
  const out = (await run('which appliances have never been serviced')).facetResults[0];
  assert.deepEqual([...out.recordIds], ['never']);
  assert.match(out.summary, /Never Serviced Fridge has no service recorded/);
  assert.match(out.summary, /not that it was never serviced/);
  assert.equal(out.receipt.population.unknownCount, 0);
  const all = (await run('which appliances have never been serviced', 'OWNER', snap({ inventoryFieldRecords: [rec('a', 'A', '2026-10-01')] }))).facetResults[0];
  assert.match(all.summary, /Every item has a service date recorded/);
});

test('audience floor and unloaded data: a restricted role learns nothing, and missing columns never read as "all serviced"', async () => {
  const viewer = (await run('which appliances have I not serviced in over a year', 'VIEWER')).facetResults[0];
  // item.lastServicedOn is a plain date with a viewer floor in the catalogue; assert whatever the catalogue says, both ways.
  const { DATA_POINT_BY_ID } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
  const audience = DATA_POINT_BY_ID.get('item.lastServicedOn').audience;
  if (audience === 'VIEWER') assert.equal(viewer.status, 'EXECUTED');
  else { assert.equal(viewer.status, 'BLOCKED'); assert.deepEqual(viewer.recordIds, []); assert.ok(!/Old Furnace/.test(viewer.summary)); }
  const unloaded = (await run('which appliances have I not serviced in over a year', 'OWNER', { ...buildSeededCrossDomainSnapshot() })).facetResults[0];
  assert.equal(unloaded.status, 'BLOCKED');
  assert.equal(unloaded.receipt, null);
  assert.ok(!/Every item/.test(unloaded.summary));
});

test('a service-gap answer is grounded by an independently parsed plan and a receipt cannot be reused for another question or forged', async () => {
  const question = 'Which appliances have I not serviced in over a year?';
  const result = buildOperationResultFromCrossDomainExecution(await run(question));
  assert.equal(groundedReadVerdict(question, result).outcome, 'PASS');
  assert.equal(groundedReadVerdict('how many appliances have I not serviced in over a year', result).outcome, 'FAIL');
  const forged = structuredClone(result);
  forged.parameters.semanticExecutionReceipt.population.confirmedCount = 99;
  assert.equal(groundedReadVerdict(question, forged).outcome, 'FAIL');
});

test('the legacy stale-service recognizer is gone (FR-ONT-8)', () => {
  for (const prompt of ['Which appliances have I not serviced in over a year?', 'Which appliances have never been serviced?', 'how many items havent been serviced in over 2 years']) {
    assert.equal(planShape789(prompt), null, prompt);
  }
});
