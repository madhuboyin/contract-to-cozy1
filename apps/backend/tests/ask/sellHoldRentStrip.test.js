const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-016, FRD v1.85): the sell, hold and rent scenarios as a comparison strip.
// The analysis handler needs the whole household/feature context, so this drives the block builder with a real-shaped
// analysis, then the answer checker (answer relevance on) over an answer shaped like the handler's.

const { sellHoldRentComparison } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const analysis = (overrides = {}) => ({
  scenarios: {
    sell: { netProceeds: 412000, projectedSalePrice: 455000, sellingCosts: 27300 },
    hold: { net: 18000, appreciationGain: 90000, totalOwnershipCosts: 72000 },
    rent: { net: -6500, totalRentalIncome: 150000, rentalOverheads: { vacancyLoss: 9000, managementFees: 12000 } },
    ...overrides,
  },
});

test('three paths become options with the modeled outcome and its components, and nothing is badged, led or given an amount', () => {
  const block = sellHoldRentComparison(analysis(), 5);
  assert.equal(block.id, 'sell-hold-rent-comparison');
  assert.equal(block.title, '5-year scenario snapshot');
  assert.deepEqual(block.options.map((entry) => entry.id), ['sell', 'hold', 'rent']);
  assert.deepEqual(block.options[0].attributes.map((attribute) => [attribute.label, attribute.value]), [
    ['Modeled outcome', '$412,000 modeled net proceeds'],
    ['Key components', '$455,000 projected price · $27,300 selling costs'],
  ]);
  assert.match(block.options[2].attributes[0].value, /modeled net change/);
  assert.match(block.options[2].attributes[1].value, /\$21,000 vacancy and management overhead/);
  for (const entry of block.options) {
    assert.equal(entry.badge, undefined);
    assert.equal(entry.badges, undefined);
    assert.equal(entry.amount, undefined);
    assert.ok(entry.attributes.every((attribute) => attribute.leading === undefined));
    assert.deepEqual(entry.actions, []);
  }
  AskPresentationBlockSchema.parse(block);
});

test('COMPARISON is an allowed block for the operation, in both the registry and the skill manifest', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.SELL_HOLD_RENT_ANALYSIS.allowedBlockTypes.includes('COMPARISON'));
  const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
  const skill = getSkillForOperation('SELL_HOLD_RENT_ANALYSIS');
  assert.ok(skill.allowedResultBlocks.includes('COMPARISON'));
});

test('the answer checker, with answer relevance on, keeps a sell-hold-rent answer that carries the strip', () => {
  const answer = {
    status: 'ANSWERED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'sell-hold-rent-summary', title: 'Here is the current 5-year sell, hold, and rent comparison', tone: 'DEFAULT', actions: [],
        body: 'The model’s directional indicator currently points to selling, but this is not a conclusion that now is the right time to sell.' },
      sellHoldRentComparison(analysis(), 5),
      { type: 'GROUPED_LIST', filters: [], id: 'sell-hold-rent-assumptions', title: 'Assumptions that materially affect the answer',
        description: 'Adjust these in Sell / Hold / Rent before relying on the comparison for a major decision.',
        sections: [{ id: 'assumptions', title: 'Current planning inputs', count: 1, items: [{ id: 'assumption-1', title: 'Home value $450,000', description: null, meta: [], status: null, href: '/dashboard/properties/p1/tools/sell-hold-rent' }] }], actions: [] },
      { type: 'BOUNDARY', id: 'sell-hold-rent-boundary', title: 'Planning comparison—not financial, tax, legal, or valuation advice', body: 'A sale decision can depend on many things.', severity: 'INFO', suggestions: [] },
    ],
  };
  const checked = validateAskAnswerTrustPipeline({
    question: 'Should I sell, hold, or rent this home?', operationId: 'SELL_HOLD_RENT_ANALYSIS', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('SELL_HOLD_RENT_ANALYSIS')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'COMPARISON'));
});
