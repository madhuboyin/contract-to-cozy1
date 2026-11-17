// FR-ANS-6 presentation conformance at the real delivery boundary: every answered cross-domain job must survive the answer-trust
// validator with no internal identifier in homeowner-visible copy. (A list answer once rendered "domain.warranties_coverage" and an
// executor id as headings and was withheld as "I couldn't verify this answer".)
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const B = '../../src/services/ask/';
const { executeCrossDomainSnapshot, buildOperationResultFromCrossDomainExecution } = require(B + 'semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require(B + 'semantic/crossDomain/index.ts');
const { SEALED_EVALUATION_CASES } = require(B + 'semantic/evaluation/endToEndEvaluationHarness.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require(B + 'askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require(B + 'askAnswerTrustValidator.ts');

const rec = (id, name, values) => ({ id, propertyId: 'prop-waves-1', name, values });
const snapshot = () => ({
  ...buildSeededCrossDomainSnapshot(),
  inventoryFieldRecords: [rec('i1', 'Dishwasher', { serialNumber: null, modelNumber: 'M', installedOn: '2020-01-01', purchasedOn: null, purchaseCostCents: 1, replacementCostCents: null, lastServicedOn: '2019-01-01' }), rec('i2', 'Furnace', { serialNumber: 'S', modelNumber: null, installedOn: null, purchasedOn: '2020-01-01', purchaseCostCents: null, replacementCostCents: 5, lastServicedOn: null })],
  taxSeries: {
    'taxBill.amount': [{ id: 'b1', propertyId: 'prop-waves-1', taxYear: 2024, value: 5000 }, { id: 'b2', propertyId: 'prop-waves-1', taxYear: 2025, value: 5500 }],
    'taxAssessment.totalAssessedValue': [{ id: 'a1', propertyId: 'prop-waves-1', taxYear: 2025, value: 400000 }],
  },
});

// Internal shapes that must never reach a homeowner: dotted registry ids, snake/screaming ids, adapter ids, cents.
const INTERNAL = /\b(?:domain|entity|field|relation|predicate|path|query|job|variant)\.[a-z_.]+\b|\b[a-z]+(?:-[a-z]+){2,}-(?:executor|adapter)\b|\b[A-Z]{3,}_[A-Z0-9_]{2,}\b|\b[a-z]{3,}_[a-z_]{3,}\b|\b\d+\s+cents?\b/;
const copyOf = (blocks) => JSON.stringify(blocks.map((b) => {
  const { id, type, actions, filters, ...rest } = b; // ids are structural, not copy
  if (b.sections) rest.sections = b.sections.map((s) => ({ title: s.title, items: s.items.map((i) => ({ title: i.title, description: i.description, subtitle: i.subtitle, badge: i.badge, meta: i.meta })) }));
  return rest;
}));

const PROMPTS = [
  // the screenshot prompts
  'how many appliances are not having warranty', 'provide details of all items without warranty', 'list items without warranty',
  'how many appliances have no warranty?', 'which items are having warranty', 'do any appliances have a warranty',
  // field absence, service gap, tax series
  'which appliances have no serial number recorded', 'how many appliances are missing a purchase date', 'provide details of appliances without a model number',
  'which appliances have I not serviced in over a year', 'which appliances have never been serviced', 'how many appliances havent been serviced in over 2 years',
  'how has my property tax changed over the years', 'how has my assessed value changed',
  // the sealed cross-domain cases (every domain)
  ...SEALED_EVALUATION_CASES.filter((c) => c.expectedExecutionStatus === 'ANSWERED' || c.expectedExecutionStatus === 'PARTIAL').map((c) => c.prompt),
];

test('every answered cross-domain turn passes the real answer-trust validator and shows no internal identifier', async () => {
  const seen = new Set();
  let checked = 0;
  for (const prompt of PROMPTS) {
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    const execution = await executeCrossDomainSnapshot({ rawText: prompt, snapshot: snapshot(), role: 'OWNER', propertyAuthorized: true });
    if (execution.status !== 'ANSWERED' && execution.status !== 'PARTIAL') continue;
    let result = buildOperationResultFromCrossDomainExecution(execution);
    result = attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
    const copy = copyOf(result.blocks);
    assert.equal(INTERNAL.test(copy), false, `${prompt}\n  internal identifier in homeowner copy: ${(copy.match(INTERNAL) ?? [])[0]}\n  ${copy.slice(0, 400)}`);
    const out = validateAskAnswerTrustPipeline({ question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: true });
    assert.ok(!out.trust.reasonCodes.includes('INTERNAL_PRESENTATION_TOKEN'), `${prompt}: ${out.trust.reasonCodes.join(',')}`);
    assert.notEqual(out.result.reasonCode, 'ASK_ANSWER_TRUST_FAILED', `${prompt}: answer was withheld (${out.trust.reasonCodes.join(',')})`);
    checked += 1;
  }
  assert.ok(checked >= 20, `expected to verify at least 20 answered turns, verified ${checked}`);
});

test('the screenshot warranty questions deliver real, correctly worded answers (not a generic count card or a withheld card)', async () => {
  const ask = async (prompt) => {
    const execution = await executeCrossDomainSnapshot({ rawText: prompt, snapshot: snapshot(), role: 'OWNER', propertyAuthorized: true });
    let result = buildOperationResultFromCrossDomainExecution(execution);
    result = attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
    return validateAskAnswerTrustPipeline({ question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: true }).result;
  };
  const list = await ask('list items without warranty');
  assert.notEqual(list.reasonCode, 'ASK_ANSWER_TRUST_FAILED');
  const summary = list.blocks.find((b) => b.type === 'SUMMARY');
  assert.match(summary.title, /Items without a linked warranty record/);
  assert.match(summary.body, /no warranty linked in your home record/);
  assert.match(summary.body, /does not decide whether warranty terms cover the item/);
  const names = list.blocks.find((b) => b.type === 'GROUPED_LIST').sections.flatMap((s) => s.items.map((i) => i.title));
  assert.ok(names.length >= 1 && names.every((n) => !/^item-/.test(n)), 'rows show item names, never record ids');
  const count = await ask('how many appliances have no warranty?');
  const countSummary = count.blocks.find((b) => b.type === 'SUMMARY');
  assert.match(countSummary.title, /\d+ items? ha(?:s|ve) no linked warranty record/);
  assert.doesNotMatch(countSummary.title, /^Property answer$/);
  const positive = await ask('which items are having warranty');
  assert.match(positive.blocks.find((b) => b.type === 'SUMMARY').body, /a warranty linked in your home record/);
  assert.match(positive.blocks.find((b) => b.type === 'SUMMARY').body, /does not by itself establish/);
});
