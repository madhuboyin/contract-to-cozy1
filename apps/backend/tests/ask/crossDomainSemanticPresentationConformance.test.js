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
  // capability analyses (receipt records ANALYSIS as DETAIL) and the other acceptance rows reported from the live app
  'how long until owning beats renting?', 'which projects still need a permit?', 'which claim documents are missing?', 'are any of my appliances affected by recalls?',
  'what buyer deadlines are due before closing?', 'what do I still need to finish before listing the house?', 'compare these two kitchen contractor quotes',
  'which appliances have neither a manual nor a receipt?', 'what is my deductible?', 'show maintenance tasks due next month', 'which appliances have no warranty',
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
    const out = validateAskAnswerTrustPipeline({ question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
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

test('conflicted and unknown records are disclosed in a note that survives the trust policy; a foreign boundary does not', async () => {
  const base = snapshot();
  // Two items with conflicting warranty links and one with unknown evidence.
  const items = base.items.map((item, i) => (i === 0 ? { ...item, propertyPlanWarrantyId: 'war-plan-x', itemWarrantyIds: ['war-item-y'], coverageEvidenceStatus: 'NONE' } : i === 1 ? { ...item, coverageEvidenceStatus: 'NOT_SURE', propertyPlanWarrantyId: null, itemWarrantyIds: [] } : item));
  const ask = async (prompt, mutate = (r) => r) => {
    const execution = await executeCrossDomainSnapshot({ rawText: prompt, snapshot: { ...base, items }, role: 'OWNER', propertyAuthorized: true });
    let result = attachAskAuthoritativeSourceEvidence(buildOperationResultFromCrossDomainExecution(execution), [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
    result = mutate(result);
    return validateAskAnswerTrustPipeline({ question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
  };
  const out = await ask('list items without warranty');
  const boundary = out.result.blocks.find((b) => b.type === 'BOUNDARY');
  assert.ok(boundary, 'the uncertainty note must be delivered');
  assert.match(boundary.title, /Warranty linkage requires confirmation/);
  assert.ok(!out.trust.reasonCodes.includes('INAPPLICABLE_BOUNDARY_REMOVED'));
  // a boundary that is not this answer's own receipt boundary is still removed
  const forged = await ask('list items without warranty', (r) => ({ ...r, blocks: [...r.blocks, { type: 'BOUNDARY', id: 'some-other-boundary', title: 'Other', body: 'x', severity: 'INFO', suggestions: [] }] }));
  assert.ok(!forged.result.blocks.some((b) => b.id === 'some-other-boundary'));
  // non-warranty uncertainty gets neutral wording, not a warranty heading
  const permits = await ask('which projects still need a permit?');
  const permitBoundary = permits.result.blocks.find((b) => b.type === 'BOUNDARY');
  assert.ok(permitBoundary && !/warrant/i.test(permitBoundary.title));
});

test('the live delivery path (promoted from a fallback: not provisional, not deterministic) delivers every typed read instead of a wrong-question clarification', async () => {
  // These twenty-ish prompts were reported from the running app as "Let's make sure I answer the right home question",
  // "I'm not sure that answers your question" or "I couldn't verify this answer".
  const LIVE = [
    'which appliances have no warranty', 'which appliances have neither a manual nor a receipt?', 'which claim documents are missing?',
    'how long until owning beats renting?', 'which projects still need a permit?', 'compare these two kitchen contractor quotes',
    'what buyer deadlines are due before closing?', 'what do I still need to finish before listing the house?', 'are any of my appliances affected by recalls?',
    'show maintenance tasks due next month', 'what is my deductible?', 'list items without warranty', 'which items are having warranty',
  ];
  for (const prompt of LIVE) {
    const execution = await executeCrossDomainSnapshot({ rawText: prompt, snapshot: snapshot(), role: 'OWNER', propertyAuthorized: true });
    assert.ok(execution.status === 'ANSWERED' || execution.status === 'PARTIAL', `${prompt}: ${execution.status}`);
    const result = attachAskAuthoritativeSourceEvidence(buildOperationResultFromCrossDomainExecution(execution), [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
    const out = validateAskAnswerTrustPipeline({
      question: prompt, operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true,
      routedDeterministically: false, provisionalRead: false, entityResolution: null, segmentationCertified: false,
    });
    assert.ok(out.semantic && out.semantic.outcome === 'PASS', `${prompt}: semantic relevance ${out.semantic && out.semantic.outcome} (${out.semantic && out.semantic.reasonCodes.join(',')})`);
    assert.ok(out.semantic.reasonCodes.includes('TYPED_RECEIPT_GROUNDED'), prompt);
    assert.ok(!['ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE', 'ASK_ANSWER_TRUST_FAILED'].includes(out.result.reasonCode), `${prompt}: ${out.result.reasonCode}`);
    assert.equal(out.result.status === 'NEEDS_CLARIFICATION', false, `${prompt}: became a clarification`);
  }
});

test('a typed read that is NOT grounded by its question still goes through the ordinary relevance check (no blanket bypass)', async () => {
  const execution = await executeCrossDomainSnapshot({ rawText: 'which appliances have no warranty', snapshot: snapshot(), role: 'OWNER', propertyAuthorized: true });
  const result = attachAskAuthoritativeSourceEvidence(buildOperationResultFromCrossDomainExecution(execution), [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
  // the same receipt offered as the answer to an unrelated question must not be accepted on the strength of its receipt
  const out = validateAskAnswerTrustPipeline({ question: 'what is the weather in paris', operationId: 'DATA_POINT_READ', result, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
  assert.ok(!(out.semantic && out.semantic.reasonCodes.includes('TYPED_RECEIPT_GROUNDED')));
  const forged = structuredClone(result);
  forged.parameters.semanticExecutionReceipt.population.confirmedCount = 99;
  const forgedOut = validateAskAnswerTrustPipeline({ question: 'which appliances have no warranty', operationId: 'DATA_POINT_READ', result: forged, propertyId: 'prop-waves-1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
  assert.ok(!(forgedOut.semantic && forgedOut.semantic.reasonCodes.includes('TYPED_RECEIPT_GROUNDED')));
});
