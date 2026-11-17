const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { parseCrossDomainSemanticRequest } = require('../../src/services/ask/semantic/crossDomain/crossDomainPlanBuilder.ts');
const {
  executeCrossDomainSnapshot,
  buildOperationResultFromCrossDomainExecution,
  loadCrossDomainPropertySnapshot,
  TAX_SERIES_FIELD_POINT_IDS,
} = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { groundedReadVerdict } = require('../../src/services/ask/support/provisionalRead.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { resolveAskSemanticEntryDecision } = require('../../src/services/ask/semantic/semanticEntryDispatcher.ts');
const { TIME_SERIES_REGISTRY } = require('../../src/services/ask/dataPoint/queryShapeRegistries.ts');
const { DATA_POINT_BY_ID } = require('../../src/services/ask/dataPoint/dataPointCatalogue.ts');
const { prisma } = require('../../src/lib/prisma.ts');

const JOB = 'query.property_tax.change_over_time';
const BILL = 'field.tax_bill.tax_amount';
const ASSESSED = 'field.tax_assessment.total_assessed_value';
const parse = (prompt) => parseCrossDomainSemanticRequest(prompt).plan;
const facetOf = (prompt) => { const plan = parse(prompt); assert.equal(plan.outcome, 'MATCH', prompt); return plan.facets[0]; };

const row = (id, taxYear, value, propertyId = 'prop-waves-1') => ({ id, propertyId, taxYear, value });
const SERIES = {
  'taxBill.amount': [row('b2', 2024, 5500), row('b1', 2023, 5000), row('b3', 2025, 6000), row('other', 2025, 999, 'prop-other')],
  'taxAssessment.totalAssessedValue': [row('a1', 2024, 400000), row('a2', 2025, null)],
};
const snap = (overrides = {}) => ({ ...buildSeededCrossDomainSnapshot(), taxSeries: SERIES, ...overrides });
const run = (prompt, role = 'OWNER', s = snap()) => executeCrossDomainSnapshot({ rawText: prompt, snapshot: s, role, propertyAuthorized: true });

test('change-over-time phrasings parse to one registered job and the right subject (assessment word wins unless "bill" is said)', () => {
  const cases = [
    ['How has my property tax changed over the years?', BILL],
    ['is my tax bill going up', BILL],
    ['what is the trend in my property taxes', BILL],
    ['show the history of my property tax bill', BILL],
    ['How has my assessed value changed?', ASSESSED],
    ['how has my tax assessment changed', ASSESSED],
    ['has my property assessment gone down', ASSESSED],
  ];
  for (const [prompt, fieldId] of cases) {
    const facet = facetOf(prompt);
    assert.equal(facet.evidence.jobMatch, JOB, prompt);
    assert.equal(facet.projection, 'TIMELINE', prompt);
    assert.deepEqual(facet.fields.map((f) => f.fieldId), [fieldId], prompt);
    assert.equal(facet.confidenceSignals.grammarComplete, true, prompt);
  }
});

test('it never steals the two-period compare, unpaid bills, ordinary value reads, or an ambiguous subject', () => {
  assert.equal(facetOf('compare my property tax to last year').evidence.jobMatch, 'query.property_tax_bill.compare_years');
  assert.equal(facetOf("compare this year's tax bill with last year's").evidence.jobMatch, 'query.property_tax_bill.compare_years');
  assert.equal(facetOf('which property tax bills are still unpaid').evidence.jobMatch, 'query.property_tax_bill.unpaid');
  for (const prompt of ['What is my property tax?', 'how much does a new roof cost', 'what is the replacement cost of my furnace', 'how has my property tax assessment bill changed']) {
    assert.notEqual(parse(prompt).facets[0]?.evidence.jobMatch, JOB, prompt);
  }
});

test('execution: active years oldest first, one per year, change since the first year, other homes never mixed in', async () => {
  const out = (await run('How has my property tax changed over the years?')).facetResults[0];
  assert.equal(out.status, 'EXECUTED');
  assert.match(out.summary, /2023: \$5,000; 2024: \$5,500 \(\+\$500\); 2025: \$6,000 \(\+\$500\)/);
  assert.match(out.summary, /From 2023 to 2025 it rose by \$1,000 \(20\.0%\)/);
  assert.match(out.summary, /Based on the active tax records on file, one per tax year/);
  assert.ok(!out.recordIds.includes('other'));
  assert.deepEqual([...out.recordIds], ['b1', 'b2', 'b3']);
  assert.equal(out.receipt.projection, 'TIMELINE');
  assert.equal(out.receipt.population.confirmedCount, 3);
  assert.equal(out.entailment.outcome, 'PASS');
  assert.deepEqual(out.receipt.predicateIds, ['predicate.property_tax.history']);
});

test('down, unchanged, one year, no amount and no records are each stated honestly; a year with no amount is an unknown, never folded in', async () => {
  const withSeries = (key, rows) => snap({ taxSeries: { ...SERIES, [key]: rows } });
  const down = (await run('has my property tax changed', 'OWNER', withSeries('taxBill.amount', [row('x1', 2024, 6000), row('x2', 2025, 5000)]))).facetResults[0];
  assert.match(down.summary, /fell by \$1,000 \(16\.7%\)/);
  const same = (await run('has my property tax changed', 'OWNER', withSeries('taxBill.amount', [row('x1', 2024, 5000), row('x2', 2025, 5000)]))).facetResults[0];
  assert.match(same.summary, /did not change/);
  const one = (await run('how has my property tax changed', 'OWNER', withSeries('taxBill.amount', [row('x1', 2025, 5000)]))).facetResults[0];
  assert.match(one.summary, /2025 was \$5,000\. I need at least two years with an amount to show a change/);
  const none = (await run('how has my property tax changed', 'OWNER', withSeries('taxBill.amount', []))).facetResults[0];
  assert.match(none.summary, /no change to show/);
  const gap = (await run('how has my property tax changed', 'OWNER', withSeries('taxBill.amount', [row('x1', 2023, 5000), row('x2', 2024, null), row('x3', 2025, 6000)]))).facetResults[0];
  assert.match(gap.summary, /1 year has no amount recorded and is left out/);
  assert.equal(gap.receipt.population.unknownCount, 1);
  assert.equal(gap.receipt.population.confirmedCount, 2);
  const assessed = (await run('how has my assessed value changed')).facetResults[0];
  assert.match(assessed.summary, /I have 2 tax years on record: 2024 was \$400,000\. I need at least two years with an amount to show a change/);
});

test('audience floor from the data-point catalogue; unavailable data is never read as "no change"', async () => {
  for (const [fieldId, pointId] of Object.entries(TAX_SERIES_FIELD_POINT_IDS)) {
    const audience = DATA_POINT_BY_ID.get(pointId).audience;
    const prompt = fieldId === BILL ? 'how has my property tax changed' : 'how has my assessed value changed';
    const viewer = (await run(prompt, 'VIEWER')).facetResults[0];
    if (audience === 'VIEWER') assert.equal(viewer.status, 'EXECUTED');
    else { assert.equal(viewer.status, 'BLOCKED'); assert.deepEqual(viewer.recordIds, []); assert.ok(!/\$5,000/.test(viewer.summary)); assert.ok(viewer.redactedFieldIds.includes(fieldId)); }
    assert.equal((await run(prompt, 'EDITOR')).facetResults[0].status, 'EXECUTED');
  }
  const unloaded = (await run('how has my property tax changed', 'OWNER', { ...buildSeededCrossDomainSnapshot() })).facetResults[0];
  assert.equal(unloaded.status, 'BLOCKED');
  assert.equal(unloaded.receipt, null);
  assert.ok(!/no change to show/.test(unloaded.summary));
});

test('the loader reads only active, non-superseded records for the declared columns, capped and ordered by the registry declaration', async () => {
  const calls = [];
  const saved = { bill: prisma.propertyTaxBillRecord, assess: prisma.propertyTaxAssessmentRecord, property: prisma.property };
  prisma.property = { findUnique: async () => ({ id: 'p1', state: 'NY', timezone: 'America/New_York', lastAppraisedValue: null }) };
  const rows = (column) => [{ id: 'r3', propertyId: 'p1', taxYear: 2025, [column]: { toNumber: () => 6000 } }, { id: 'r2', propertyId: 'p1', taxYear: 2024, [column]: 5500 }, { id: 'r1', propertyId: 'p1', taxYear: 2023, [column]: null }];
  prisma.propertyTaxBillRecord = { findMany: async (args) => { calls.push(['bill', args]); return rows('billAmount'); } };
  prisma.propertyTaxAssessmentRecord = { findMany: async (args) => { calls.push(['assess', args]); return rows('totalAssessedValue'); } };
  try {
    const snapshot = await loadCrossDomainPropertySnapshot('p1', 'u1', 'America/New_York', { domains: new Set(), jobs: new Set([JOB]) });
    for (const [, args] of calls) {
      assert.deepEqual(args.where, { propertyId: 'p1', status: 'ACTIVE', supersededById: null });
      assert.deepEqual(args.orderBy, [{ taxYear: 'desc' }, { id: 'asc' }]);
      assert.equal(args.take, TIME_SERIES_REGISTRY[0].maxPeriods);
    }
    assert.equal(calls.length, TIME_SERIES_REGISTRY.length);
    assert.deepEqual(snapshot.taxSeries['taxBill.amount'].map((r) => [r.taxYear, r.value]), [[2023, null], [2024, 5500], [2025, 6000]]);
  } finally {
    prisma.propertyTaxBillRecord = saved.bill;
    prisma.propertyTaxAssessmentRecord = saved.assess;
    prisma.property = saved.property;
  }
});

test('a tax-history answer is grounded by an independent grammar plan; a forged receipt or a different question is withheld', async () => {
  const question = 'How has my property tax changed over the years?';
  const result = buildOperationResultFromCrossDomainExecution(await run(question));
  assert.equal(groundedReadVerdict(question, result).outcome, 'PASS');
  assert.equal(groundedReadVerdict('how has my assessed value changed', result).outcome, 'FAIL', 'a tax-bill receipt must not ground an assessed-value question');
  const forged = structuredClone(result);
  forged.parameters.semanticExecutionReceipt.population.confirmedCount = 99;
  assert.equal(groundedReadVerdict(question, forged).outcome, 'FAIL');
});

test('the retired recognizers reach the typed stack through the semantic entry, not a legacy rule (all four families)', () => {
  const prompts = [
    'Which appliances have no warranty?', 'how many appliances are not having warranty',
    'Which appliances have no serial number recorded?', 'how many appliances are missing a purchase date',
    'Which appliances have I not serviced in over a year?', 'which appliances have never been serviced',
    'How has my property tax changed over the years?', 'is my tax bill going up', 'how has my assessed value changed',
  ];
  for (const message of prompts) {
    const decision = resolveAskRoutingCascade(message, { propertyId: 'p1' });
    const entry = resolveAskSemanticEntryDecision({ rawMessage: message, routingStage: decision.stage, routingOperationId: decision.operation.operationId, requiresClarification: decision.requiresClarification, hasSemanticProvider: true });
    assert.equal(entry.shouldDispatchToSemanticEntry, true, message);
    assert.equal(entry.reasonCode, 'CROSS_DOMAIN_PLAN_MATCH', message);
  }
});
