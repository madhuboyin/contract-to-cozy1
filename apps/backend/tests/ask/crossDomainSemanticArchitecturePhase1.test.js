const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { SemanticRequestPlanSchema } = require('../../src/services/ask/semantic/semanticRequestPlan.ts');
const { ASK_SHARED_SEMANTIC_LEXICON, generateSharedSemanticLexicon } = require('../../src/services/ask/semantic/sharedSemanticLexicon.ts');
const { parseDeterministicSemanticRequest } = require('../../src/services/ask/semantic/deterministicSemanticParser.ts');
const { warrantyShapeGrammarAgreement } = require('../../src/services/ask/semantic/legacyGrammarAgreement.ts');
const { SemanticReadReceiptSchema } = require('../../src/services/ask/semantic/semanticExecutionReceipt.ts');
const { resolvePropertyEntityReference } = require('../../src/services/ask/semantic/propertyEntityResolver.ts');

test('the generated shared lexicon is stable and keeps warranty separate from insurance and claims', () => {
  assert.deepEqual(generateSharedSemanticLexicon(), ASK_SHARED_SEMANTIC_LEXICON);
  const warranty = ASK_SHARED_SEMANTIC_LEXICON.filter((entry) => entry.semanticId.includes('warranty'));
  assert.ok(warranty.length > 0);
  assert.equal(warranty.some((entry) => /insurance|claim|policy/.test(entry.phrase)), false);
});

test('equivalent inventory/warranty wording produces the same typed meaning', () => {
  const prompts = [
    "list down all items which don't have warranty",
    'provide details of all items without warranty',
    'how many appliances are not having warranty',
    'which items are having warranty',
  ];
  const plans = prompts.map(parseDeterministicSemanticRequest);
  plans.forEach((plan) => assert.doesNotThrow(() => SemanticRequestPlanSchema.parse(plan)));
  assert.deepEqual(plans.map((plan) => plan.facets[0].projection), ['LIST', 'DETAIL', 'COUNT', 'LIST']);
  assert.deepEqual(plans.map((plan) => plan.facets[0].polarity), ['NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'POSITIVE']);
  assert.ok(plans.every((plan) => plan.facets[0].relations[0].semanticRelationId === 'relation.inventory_item.warranty'));
  assert.ok(plans.every((plan) => plan.facets[0].confidenceSignals.grammarComplete), 'the declared examples consume every meaningful token');
});

test('unconsumed meaning is surfaced and cannot be admitted as a complete grammar plan', () => {
  const plan = parseDeterministicSemanticRequest('show appliances without warranty next month');
  assert.equal(plan.outcome, 'MATCH');
  assert.deepEqual(plan.unresolvedSpans.map((span) => span.text.toLowerCase()), ['next', 'month']);
  assert.equal(plan.facets[0].confidenceSignals.grammarComplete, false);
});

test('bounded typo tolerance resolves unique registry identities', () => {
  const plan = parseDeterministicSemanticRequest('which apliances have no warrenty');
  assert.equal(plan.outcome, 'MATCH');
  assert.equal(plan.facets[0].subject.entityId, 'entity.inventory_item');
  assert.equal(plan.facets[0].relations[0].semanticRelationId, 'relation.inventory_item.warranty');
  assert.equal(plan.facets[0].polarity, 'NEGATIVE');
  assert.equal(plan.facets[0].projection, 'LIST');
  assert.deepEqual(plan.unresolvedSpans, []);
  assert.equal(plan.facets[0].confidenceSignals.grammarComplete, true);
});

test('morphological normalization preserves relation meaning across tense and number', () => {
  const pastNegative = parseDeterministicSemanticRequest('which appliances did not have warranties');
  assert.equal(pastNegative.outcome, 'MATCH');
  assert.equal(pastNegative.facets[0].polarity, 'NEGATIVE');
  assert.equal(pastNegative.facets[0].relations[0].predicateId, 'predicate.inventory_item.has_no_warranty_record');
  assert.deepEqual(pastNegative.unresolvedSpans, []);
  assert.equal(pastNegative.facets[0].confidenceSignals.grammarComplete, true);

  const pastPositive = parseDeterministicSemanticRequest('which appliance had warranty');
  assert.equal(pastPositive.outcome, 'MATCH');
  assert.equal(pastPositive.facets[0].polarity, 'POSITIVE');
  assert.equal(pastPositive.facets[0].relations[0].predicateId, 'predicate.inventory_item.has_warranty_record');
  assert.deepEqual(pastPositive.unresolvedSpans, []);
  assert.equal(pastPositive.facets[0].confidenceSignals.grammarComplete, true);
});

test('typo tolerance does not guess short or distant registry terms', () => {
  const shortCollision = parseDeterministicSemanticRequest('which itms have no warranty');
  assert.equal(shortCollision.outcome, 'NONE_FITS');
  assert.deepEqual(shortCollision.unresolvedSpans.map((span) => span.text.toLowerCase()), ['itms']);

  const distant = parseDeterministicSemanticRequest('which appliances have no guarantee');
  assert.equal(distant.outcome, 'NONE_FITS');
  assert.deepEqual(distant.unresolvedSpans.map((span) => span.text.toLowerCase()), ['guarantee']);
});

test('unsupported questions remain unmatched rather than selecting a nearby operation', () => {
  const plan = parseDeterministicSemanticRequest('what claims are still open?');
  assert.equal(plan.outcome, 'NONE_FITS');
  assert.deepEqual(plan.facets, []);
});

test('legacy warranty reads execute only when the independently built grammar agrees', () => {
  const count = { shape: 'NO_WARRANTY', relationId: 'inventory-warranty', currentOnly: false, count: true, detail: false, exists: false };
  assert.equal(warrantyShapeGrammarAgreement('how many appliances have no warranty?', count).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('provide details of appliances without warranty', { ...count, count: false, detail: true }).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('which appliances are out of warranty?', { ...count, currentOnly: true, count: false }).outcome, 'DISAGREE');
  assert.equal(warrantyShapeGrammarAgreement('which appliances have a warranty?', { shape: 'HAS_WARRANTY', relationId: 'inventory-warranty', count: false, detail: false, exists: false }).outcome, 'AGREE');
  assert.equal(warrantyShapeGrammarAgreement('do any appliances have a warranty?', { shape: 'HAS_WARRANTY', relationId: 'inventory-warranty', count: false, detail: false, exists: true }).outcome, 'AGREE');
});

test('the minimal receipt rejects missing structural evidence', () => {
  assert.equal(SemanticReadReceiptSchema.safeParse({ schemaVersion: '1.0.0' }).success, false);
});

test('property-backed entity resolution returns one opaque authorised identity', () => {
  const resolution = resolvePropertyEntityReference({
    entityId: 'entity.inventory_item',
    mention: '  KITCHEN-dishwasher ',
    applicable: true,
    candidates: [
      { entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Kitchen dishwasher', identityLabels: ['Kitchen Dishwasher'], authorization: 'AUTHORISED' },
      { entityId: 'entity.inventory_item', recordId: 'item-2', safeDisplayLabel: 'Garage freezer', identityLabels: ['Garage freezer'], authorization: 'AUTHORISED' },
      { entityId: 'entity.warranty', recordId: 'warranty-1', safeDisplayLabel: 'Kitchen dishwasher warranty', identityLabels: ['Kitchen Dishwasher'], authorization: 'AUTHORISED' },
    ],
  });
  assert.deepEqual(resolution, { outcome: 'RESOLVED', entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Kitchen dishwasher' });
});

test('property-backed entity resolution preserves ambiguity and does not disclose hidden records', () => {
  const duplicateCandidates = [
    { entityId: 'entity.inventory_item', recordId: 'item-1', safeDisplayLabel: 'Hall thermostat', identityLabels: ['Thermostat'], authorization: 'AUTHORISED' },
    { entityId: 'entity.inventory_item', recordId: 'item-2', safeDisplayLabel: 'Bedroom thermostat', identityLabels: ['Thermostat'], authorization: 'AUTHORISED' },
  ];
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'thermostat', applicable: true, candidates: duplicateCandidates }), {
    outcome: 'MULTIPLE_MATCHES',
    entityId: 'entity.inventory_item',
    candidates: [
      { recordId: 'item-1', safeDisplayLabel: 'Hall thermostat' },
      { recordId: 'item-2', safeDisplayLabel: 'Bedroom thermostat' },
    ],
  });

  assert.deepEqual(resolvePropertyEntityReference({
    entityId: 'entity.inventory_item',
    mention: 'private safe',
    applicable: true,
    candidates: [{ entityId: 'entity.inventory_item', recordId: 'hidden-1', safeDisplayLabel: 'Private safe', identityLabels: ['Private safe'], authorization: 'UNAUTHORISED' }],
  }), { outcome: 'UNAUTHORISED', entityId: 'entity.inventory_item' });
});

test('property-backed entity resolution distinguishes missing and not-applicable states', () => {
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'attic fan', applicable: true, candidates: [] }), {
    outcome: 'MISSING', entityId: 'entity.inventory_item',
  });
  assert.deepEqual(resolvePropertyEntityReference({ entityId: 'entity.inventory_item', mention: 'attic fan', applicable: false, candidates: [] }), {
    outcome: 'NOT_APPLICABLE', entityId: 'entity.inventory_item',
  });
});
