const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  PRIORITY_LIST_POLICY_VERSION,
  PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS,
  mapConsumerPriorityCategory,
  comparativeReasonCodes,
  derivePriorityListItemState,
  buildPriorityListView,
} = require('../../../src/services/decisionPlatform/priorityListPolicy.ts');

function rankedAction(overrides = {}) {
  const {
    id = 'action-1',
    priority = 'NOW',
    safetyTier = 'LOW_CONSEQUENCE',
    responseStatus = 'AVAILABLE',
    state = 'OPEN',
    workItem = null,
    freshness = 'CURRENT',
    components = { consequence: 10, urgency: 10, confidence: 10, householdRelevance: 10, actionability: 10, missingContextPenalty: 0 },
    dueAt = null,
    relatedJourneyId = null,
    ctaHref = '/dashboard/home-actions',
    ctaLabel = 'Review',
  } = overrides;

  return {
    id,
    priority,
    state,
    signal: `Signal for ${id}`,
    recommendedAction: `Do the thing for ${id}`,
    presentation: { headline: `Headline for ${id}` },
    timing: { dueAt, windowStart: null, windowEnd: null, rationale: 'because' },
    evidence: [{ id: `${id}-evidence`, freshness, label: 'Evidence', source: 'test', observedAt: null, confidence: null }],
    confidence: { score: 0.8, label: 'HIGH', missing: [] },
    recommendationResponse: {
      status: responseStatus,
      safetyTier,
      reasonCode: 'TEST',
      message: 'test message',
      safeNextAction: `Watch and reassess ${id}`,
      missingFacts: [],
      retryable: false,
      materialActionAllowed: responseStatus === 'AVAILABLE',
    },
    governance: { safetyTier },
    primaryCta: { kind: 'REVIEW', label: ctaLabel, href: ctaHref },
    secondaryCtas: [],
    relatedJourneyId,
    workItem,
    ranking: { rank: 1, score: 0, explanation: '', components },
    deduplication: { canonicalKey: id, mergedActionIds: [] },
  };
}

test('mapConsumerPriorityCategory maps the base priority buckets to the FRD §17.3 consumer categories', () => {
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'NOW' })), 'DO_NOW');
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'SOON' })), 'PLAN_SOON');
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'PLAN' })), 'WATCH');
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'CONSIDER' })), 'OPTIONAL');
});

test('a SAFETY_EMERGENCY item is always DO_NOW regardless of priority bucket (hard floor, FRD §17.2)', () => {
  const action = rankedAction({ priority: 'CONSIDER', safetyTier: 'SAFETY_EMERGENCY' });
  assert.equal(mapConsumerPriorityCategory(action), 'DO_NOW');
});

test('a degraded recommendation response cannot present as a committed DO_NOW/PLAN_SOON action', () => {
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'NOW', responseStatus: 'LOW_CONFIDENCE' })), 'WATCH');
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'SOON', responseStatus: 'DATA_UNAVAILABLE' })), 'WATCH');
  // Already at or below WATCH -- degraded status does not change the category further.
  assert.equal(mapConsumerPriorityCategory(rankedAction({ priority: 'CONSIDER', responseStatus: 'UPSTREAM_FAILURE' })), 'OPTIONAL');
});

test('comparativeReasonCodes returns SAFETY_FLOOR when the current item is an emergency and the next is not', () => {
  const current = rankedAction({ id: 'a', safetyTier: 'SAFETY_EMERGENCY' });
  const next = rankedAction({ id: 'b', safetyTier: 'LOW_CONSEQUENCE' });
  assert.deepEqual(comparativeReasonCodes(current, next), ['SAFETY_FLOOR']);
});

test('comparativeReasonCodes explains a higher-ranked item using its stronger ranking components', () => {
  const current = rankedAction({ id: 'a', components: { consequence: 30, urgency: 20, confidence: 5, householdRelevance: 5, actionability: 5, missingContextPenalty: 0 } });
  const next = rankedAction({ id: 'b', components: { consequence: 10, urgency: 10, confidence: 5, householdRelevance: 5, actionability: 5, missingContextPenalty: 0 } });
  const codes = comparativeReasonCodes(current, next);
  assert.ok(codes.includes('HIGHER_CONSEQUENCE'));
  assert.ok(codes.includes('HIGHER_URGENCY'));
  assert.ok(!codes.includes('HIGHER_CONFIDENCE'));
});

test('comparativeReasonCodes falls back to STABLE_TIE_BREAK for identical components (deterministic replay, never a blank explanation)', () => {
  const shared = { consequence: 10, urgency: 10, confidence: 10, householdRelevance: 10, actionability: 10, missingContextPenalty: 0 };
  const current = rankedAction({ id: 'a', components: shared });
  const next = rankedAction({ id: 'b', components: shared });
  assert.deepEqual(comparativeReasonCodes(current, next), ['STABLE_TIE_BREAK']);
});

test('comparativeReasonCodes is empty for the last visible item (no "next" to compare against)', () => {
  assert.deepEqual(comparativeReasonCodes(rankedAction(), null), []);
});

test('derivePriorityListItemState surfaces suppression, completion, unavailable, and stale flags', () => {
  assert.equal(derivePriorityListItemState(rankedAction({ state: 'SNOOZED' })).suppressed, true);
  assert.equal(derivePriorityListItemState(rankedAction({ workItem: { state: 'DEFERRED' } })).suppressed, true);
  assert.equal(derivePriorityListItemState(rankedAction({ state: 'COMPLETED' })).completed, true);
  assert.equal(derivePriorityListItemState(rankedAction({ workItem: { state: 'VERIFIED' } })).completed, true);
  assert.equal(derivePriorityListItemState(rankedAction({ responseStatus: 'DATA_UNAVAILABLE' })).unavailable, true);
  assert.equal(derivePriorityListItemState(rankedAction({ freshness: 'STALE' })).stale, true);
  const clean = derivePriorityListItemState(rankedAction());
  assert.deepEqual(clean, { suppressed: false, completed: false, unavailable: false, stale: false });
});

test('derivePriorityListItemState threads a fatigue-suppressed rating through as suppressed, without touching other flags (FRD §17.2: engagement flags, never removes)', () => {
  const state = derivePriorityListItemState(rankedAction(), true);
  assert.deepEqual(state, { suppressed: true, completed: false, unavailable: false, stale: false });
});

test('buildPriorityListView marks items in the suppressedHomeActionIds set as suppressed without removing them from the list', () => {
  const actions = [rankedAction({ id: 'a' }), rankedAction({ id: 'b' })];
  const view = buildPriorityListView(
    { propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions },
    'ASK',
    { suppressedHomeActionIds: new Set(['a']) },
  );
  assert.equal(view.items.length, 2);
  assert.equal(view.items.find((item) => item.homeActionId === 'a').suppressed, true);
  assert.equal(view.items.find((item) => item.homeActionId === 'b').suppressed, false);
});

test('buildPriorityListView never reorders the already-ranked feed and stamps the current policy version', () => {
  const actions = [rankedAction({ id: 'a' }), rankedAction({ id: 'b' }), rankedAction({ id: 'c' })];
  const view = buildPriorityListView({ propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions }, 'ASK');
  assert.deepEqual(view.items.map((item) => item.homeActionId), ['a', 'b', 'c']);
  assert.equal(view.rankingPolicyVersion, PRIORITY_LIST_POLICY_VERSION);
  assert.equal(view.propertyId, 'prop-1');
  assert.equal(view.sourceFreshnessAt, '2026-08-01T00:00:00.000Z');
  assert.equal(view.truncated, false);
});

test('buildPriorityListView truncates to the requested channel display limit and sets the truncated flag', () => {
  const actions = Array.from({ length: PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS.CONCIERGE_HOME + 3 }, (_, index) => rankedAction({ id: `action-${index}` }));
  const view = buildPriorityListView({ propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions }, 'CONCIERGE_HOME');
  assert.equal(view.items.length, PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS.CONCIERGE_HOME);
  assert.equal(view.truncated, true);
});

test('buildPriorityListView withholds a CTA and surfaces an honest watch state for an unavailable recommendation', () => {
  const actions = [rankedAction({ id: 'a', responseStatus: 'DATA_UNAVAILABLE' })];
  const view = buildPriorityListView({ propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions }, 'ASK');
  assert.equal(view.items[0].cta, null);
  assert.equal(view.items[0].watchState, 'Watch and reassess a');
  assert.equal(view.items[0].unavailable, true);
});

test('buildPriorityListView never invents an action: it only maps items already present in the feed', () => {
  const view = buildPriorityListView({ propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions: [] }, 'ASK');
  assert.deepEqual(view.items, []);
  assert.equal(view.truncated, false);
});
