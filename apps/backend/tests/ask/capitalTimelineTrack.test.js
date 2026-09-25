const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-017, FRD v1.90): the upcoming capital windows as a timeline track. The
// full CAPITAL_RESERVE_PLAN handler composes the capital timeline, reserve fund and financial context services, so this
// drives the block builder with real-shaped windows, then the answer checker (answer relevance on) over an answer
// shaped like the handler's.

const { capitalTimelineBlock } = require('../../src/services/ask/askOrchestrator.service.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');

const win = (id, overrides = {}) => ({
  id, category: 'ROOF', windowStart: new Date('2027-03-15T12:00:00.000Z'), windowEnd: new Date('2029-03-14T12:00:00.000Z'), confidence: 'MEDIUM',
  estimatedCostMinCents: 1200000, estimatedCostMaxCents: 1800000, inventoryItem: { name: 'Asphalt shingle roof' }, ...overrides,
});
const HREF = '/dashboard/properties/p1/tools/capital-timeline';

test('each window sits at its start month, with its whole window, cost range and confidence as facts, and its category for the legend', () => {
  const block = capitalTimelineBlock([win('a'), win('b', { category: 'WATER_HEATER', inventoryItem: null, estimatedCostMinCents: null, confidence: 'LOW', windowStart: '2026-11-02T12:00:00.000Z' })], 2, HREF);
  assert.equal(block.id, 'capital-timeline-table');
  assert.equal(block.title, 'Upcoming capital windows');
  const [roof, heater] = block.items;
  assert.deepEqual([roof.label, roof.date, roof.datePrecision, roof.status, roof.category], ['Asphalt shingle roof', '2027-03', 'MONTH', 'Medium confidence', { id: 'ROOF', label: 'Roof' }]);
  assert.deepEqual(roof.meta, ['Window Mar 15, 2027–Mar 14, 2029', 'Estimated $12,000–$18,000']);
  assert.deepEqual([heater.label, heater.date, heater.category.label, heater.status, heater.meta[1]], ['water heater', '2026-11', 'Water heater', 'Low confidence', 'Cost range not available']);
  assert.equal(roof.href, HREF);
  assert.doesNotMatch(block.description, /Showing the/);
  AskPresentationBlockSchema.parse(block);
});

test('when more windows exist than are shown, the block says so from the true total', () => {
  const block = capitalTimelineBlock([win('a'), win('b')], 15, HREF);
  assert.match(block.description, /Showing the 2 soonest of 15 windows\./);
});

test('TIMELINE is allowed for the operation in the registry and the capital planning skill', () => {
  assert.ok(ASK_OPERATION_DEFINITIONS.CAPITAL_RESERVE_PLAN.allowedBlockTypes.includes('TIMELINE'));
  assert.ok(getSkillForOperation('CAPITAL_RESERVE_PLAN').allowedResultBlocks.includes('TIMELINE'));
});

// Found while testing: whether this answer was kept depended on a few words of link and evidence text
// (INSUFFICIENT_RELEVANCE_SIGNAL), with the earlier table answer too, so the operation's own envelope is matched by a typed
// contract (askCapitalPlanIntent.ts).
test('the answer checker, with answer relevance on, keeps a capital plan answer that carries the track', () => {
  const answer = {
    status: 'ANSWERED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'capital-reserve-summary', title: '2 upcoming capital events are in the current plan', tone: 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open capital timeline', href: HREF, style: 'PRIMARY' }],
        body: 'The modeled cost range for the displayed 10-year horizon is $12,000–$18,000. The canonical reserve plan currently suggests $250 a month.' },
      capitalTimelineBlock([win('a'), win('b', { category: 'HVAC_SYSTEM', inventoryItem: { name: 'Furnace' } })], 2, HREF),
      { type: 'EVIDENCE', id: 'capital-plan-evidence', title: 'Planning sources and freshness', items: [{ label: 'Asphalt shingle roof', source: 'Home Capital Timeline · medium confidence', observedAt: '2026-09-01T00:00:00.000Z' }] },
      { type: 'BOUNDARY', id: 'capital-plan-boundary', title: 'Planning range—not a guaranteed expense schedule', body: 'Actual condition, inspections and local prices can move timing and cost.', severity: 'INFO', suggestions: [] },
    ],
  };
  const checked = validateAskAnswerTrustPipeline({
    question: 'What big expenses are coming up for my home?', operationId: 'CAPITAL_RESERVE_PLAN', propertyId: 'p1', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence(answer, [completedAskAuthoritativeSourceEvidence('CAPITAL_RESERVE_PLAN')]),
  });
  assert.equal(checked.result.status, 'ANSWERED', JSON.stringify(checked.semantic));
  assert.ok(checked.result.blocks.some((block) => block.type === 'TIMELINE'));
});

test('the typed capital plan contract accepts only the plan\'s own envelope, led by its own summary, in the phrasings that were borderline', () => {
  const { matchesCapitalPlanAnswerContract } = require('../../src/services/ask/askCapitalPlanIntent.ts');
  const summary = { type: 'SUMMARY', id: 'capital-reserve-summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] };
  const track = capitalTimelineBlock([win('a'), win('b')], 2, HREF);
  assert.equal(matchesCapitalPlanAnswerContract({ status: 'ANSWERED', blocks: [summary, track] }), true);
  assert.equal(matchesCapitalPlanAnswerContract({ status: 'NEEDS_CONTEXT', blocks: [summary, track] }), false);
  assert.equal(matchesCapitalPlanAnswerContract({ status: 'ANSWERED', blocks: [track] }), false);
  assert.equal(matchesCapitalPlanAnswerContract({ status: 'ANSWERED', blocks: [summary, { ...track, id: 'something-else' }] }), false);
});

test('phrasings that scored below the relevance floor with the earlier answer are kept through the typed contract', () => {
  const answer = (extra) => ({
    status: 'ANSWERED', suggestions: [],
    blocks: [
      { type: 'SUMMARY', id: 'capital-reserve-summary', title: '2 upcoming capital events are in the current plan', tone: 'DEFAULT', actions: [{ id: 'open-timeline', label: 'Open capital timeline', href: HREF, style: 'PRIMARY' }], body: 'The modeled cost range is $12,000–$18,000.' },
      capitalTimelineBlock([win('a'), win('b')], 2, HREF),
      { type: 'EVIDENCE', id: 'capital-plan-evidence', title: 'Planning sources and freshness', items: [{ label: 'Roof', source: 'Home Capital Timeline · medium confidence', observedAt: '2026-09-01T00:00:00.000Z' }] },
      ...extra,
    ],
  });
  for (const question of ['Show my capital reserve plan', 'What is my capital plan for the next 10 years?']) {
    const checked = validateAskAnswerTrustPipeline({
      question, operationId: 'CAPITAL_RESERVE_PLAN', propertyId: 'p1', semanticEnabled: true,
      result: attachAskAuthoritativeSourceEvidence(answer([]), [completedAskAuthoritativeSourceEvidence('CAPITAL_RESERVE_PLAN')]),
    });
    assert.equal(checked.result.status, 'ANSWERED', `${question}: ${JSON.stringify(checked.semantic)}`);
  }
});
