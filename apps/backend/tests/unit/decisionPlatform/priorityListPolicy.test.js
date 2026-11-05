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
const { AskPresentationBlockSchema } = require('../../../src/productFramework/ask/ask.contract.ts');

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
    whyItMatters: `Why ${id} matters`,
    expectedOutcome: `Expected outcome for ${id}`,
    presentation: {
      variant: 'GENERIC_ACTION', eyebrow: 'Home action', headline: `Headline for ${id}`,
      summary: `Homeowner summary for ${id}`, whyNow: `Homeowner reason for ${id}`,
      keyFacts: [], factGroups: [], subject: null, detailLabel: 'Review details', group: null,
    },
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
    feedbackControls: ['ACKNOWLEDGE'],
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

test('priority list carries governed homeowner copy separately from comparative ranking codes', () => {
  const action = rankedAction({ id: 'chimney' });
  action.presentation = {
    variant: 'SEASONAL_CHECKLIST', eyebrow: 'Fall checklist',
    headline: 'Fall checklist: Chimney cleaning and inspection',
    summary: 'This is a fall checklist task. Can help prevent chimney fires and carbon monoxide hazards.',
    whyNow: 'This is a fall checklist task. Can help prevent chimney fires and carbon monoxide hazards.',
    keyFacts: [{ label: 'Season', value: 'Fall' }, { label: 'Progress', value: '3 of 8 complete' }],
    factGroups: [], subject: null, detailLabel: 'Review checklist', group: { kind: 'SEASONAL_CHECKLIST', itemCount: 8 },
  };

  const view = buildPriorityListView({ propertyId: 'property-1', generatedAt: '2026-11-04T12:00:00.000Z', actions: [action, rankedAction({ id: 'next' })] }, 'ASK');

  assert.equal(view.items[0].whyThisAppeared, 'This is a fall checklist task. Can help prevent chimney fires and carbon monoxide hazards.');
  assert.equal(view.items[0].presentation.kind, 'SEASONAL');
  assert.deepEqual(view.items[0].presentation.keyFacts, [{ label: 'Season', value: 'Fall' }, { label: 'Progress', value: '3 of 8 complete' }]);
  assert.ok(view.items[0].comparativeReasonCodes.length > 0, 'audit codes remain available without becoming homeowner copy');
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

test('buildPriorityListView can exclude suppressed homeowner rows before applying the channel limit', () => {
  const actions = Array.from({ length: PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS.CONCIERGE_HOME + 1 }, (_, index) => rankedAction({ id: `action-${index}` }));
  const view = buildPriorityListView(
    { propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions },
    'CONCIERGE_HOME',
    { suppressedHomeActionIds: new Set(['action-0']), excludeSuppressed: true },
  );
  assert.equal(view.items.some((item) => item.homeActionId === 'action-0'), false);
  assert.equal(view.items.length, PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS.CONCIERGE_HOME);
  assert.equal(view.items.at(-1).homeActionId, `action-${PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS.CONCIERGE_HOME}`);
});

test('buildPriorityListView never reorders the already-ranked feed and stamps the current policy version', () => {
  const actions = [rankedAction({ id: 'a' }), rankedAction({ id: 'b' }), rankedAction({ id: 'c' })];
  const view = buildPriorityListView({ propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions }, 'ASK');
  assert.deepEqual(view.items.map((item) => item.homeActionId), ['a', 'b', 'c']);
  assert.equal(view.rankingPolicyVersion, PRIORITY_LIST_POLICY_VERSION);
  assert.equal(view.propertyId, 'prop-1');
  assert.equal(view.sourceFreshnessAt, '2026-08-01T00:00:00.000Z');
  assert.equal(view.truncated, false);
  assert.deepEqual(view.items[0].inlineLaunch, {
    interactionType: 'CONVERSATION_CONTINUE',
    operationId: 'HOME_ACTIONS',
    message: 'What should I do next for “Headline for a”?',
    label: 'Review details',
  });
});

test('weather presentation preserves impact, preparation, forecast window, source, and reversible controls', () => {
  const action = rankedAction({ id: 'heavy-rain', ctaLabel: 'Start preparation' });
  action.presentation = {
    variant: 'ENVIRONMENT_PREPARATION', eyebrow: 'Environment action recommended',
    headline: 'Heavy rain expected Friday, Nov 6', summary: 'About 2.3 inches of rain is forecast.',
    whyNow: 'Heavy rain can overwhelm exterior drainage.',
    keyFacts: [{ label: 'Forecast window', value: 'Nov 5–Nov 6' }], factGroups: [], subject: null,
    detailLabel: 'Preparation steps', group: null,
  };
  action.whyItMatters = 'Heavy rain can overwhelm gutters and cause water intrusion.';
  action.recommendedAction = 'Clear gutters and exterior drains before rain begins.';
  action.expectedOutcome = 'Reduce avoidable water intrusion.';
  action.timing = { dueAt: '2026-11-06T00:00:00.000Z', windowStart: '2026-11-05T00:00:00.000Z', windowEnd: '2026-11-06T23:59:59.999Z', rationale: 'Prepare before the rain begins.' };
  action.evidence = [{ id: 'rain-source', freshness: 'CURRENT', label: 'Heavy rain', source: 'Open-Meteo forecast and property profile', observedAt: '2026-11-04T12:00:00.000Z', confidence: 0.9 }];
  action.feedbackControls = ['ACKNOWLEDGE', 'SNOOZE', 'NOT_RELEVANT'];

  const [item] = buildPriorityListView({ propertyId: 'property-1', generatedAt: '2026-11-04T12:00:00.000Z', actions: [action] }, 'ASK').items;

  assert.equal(item.presentation.kind, 'WEATHER');
  assert.equal(item.presentation.tone, 'TIME_BOUND');
  assert.equal(item.presentation.whyItMatters, action.whyItMatters);
  assert.equal(item.presentation.recommendedAction, action.recommendedAction);
  assert.equal(item.presentation.timing.windowEnd, action.timing.windowEnd);
  assert.equal(item.presentation.source.label, 'Open-Meteo forecast and property profile');
  assert.deepEqual(item.presentation.controls, [
    { command: 'ACKNOWLEDGE', label: 'Acknowledge' },
    { command: 'SNOOZE', label: 'Remind tomorrow' },
  ]);
  assert.equal(item.inlineLaunch.label, 'View preparation steps');
});

test('priority projection removes mutation controls for a read-only viewer without removing context', () => {
  const action = rankedAction({ id: 'viewer-action' });
  action.feedbackControls = ['ACKNOWLEDGE', 'SNOOZE'];
  const [item] = buildPriorityListView(
    { propertyId: 'property-1', generatedAt: '2026-11-04T12:00:00.000Z', actions: [action] },
    'ASK',
    { includeControls: false },
  ).items;
  assert.deepEqual(item.presentation.controls, []);
  assert.equal(item.presentation.summary, 'Homeowner summary for viewer-action');
});

test('priority-list schema accepts the enriched projection and defaults legacy stored rows', () => {
  const view = buildPriorityListView(
    { propertyId: 'property-1', generatedAt: '2026-11-04T12:00:00.000Z', actions: [rankedAction()] },
    'ASK',
  );
  const enriched = AskPresentationBlockSchema.parse({ type: 'PRIORITY_LIST', id: 'home-actions-priority-list', title: 'What matters now', ...view });
  assert.equal(enriched.items[0].presentation.kind, 'GENERIC');

  const legacyItem = { ...view.items[0], presentation: undefined, inlineLaunch: { ...view.items[0].inlineLaunch, label: undefined } };
  const legacy = AskPresentationBlockSchema.parse({ type: 'PRIORITY_LIST', id: 'legacy', title: 'What matters now', ...view, items: [legacyItem] });
  assert.equal(legacy.items[0].presentation, null);
  assert.equal(legacy.items[0].inlineLaunch.label, 'Review details');
});

test('only the Ask channel declares an inline Home Action continuation', () => {
  const feed = { propertyId: 'prop-1', generatedAt: '2026-08-01T00:00:00.000Z', actions: [rankedAction()] };
  assert.equal(buildPriorityListView(feed, 'CONCIERGE_HOME').items[0].inlineLaunch, null);
  assert.equal(buildPriorityListView(feed, 'EXTERNAL_PROACTIVE').items[0].inlineLaunch, null);
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

test('semantic tone is server-owned: red only for safety-emergency weather, green seasonal, blue planning, neutral otherwise', () => {
  const toneFor = (variant, safetyTier = 'ROUTINE_MAINTENANCE', group = null) => {
    const action = rankedAction({ id: `tone-${variant}-${safetyTier}` });
    action.presentation = { variant, eyebrow: null, headline: 'H', summary: 'S', whyNow: null, keyFacts: [], factGroups: [], subject: null, detailLabel: 'Details', group };
    action.governance = { ...action.governance, safetyTier };
    return buildPriorityListView({ propertyId: 'property-1', generatedAt: '2026-11-04T12:00:00.000Z', actions: [action] }, 'ASK').items[0].presentation.tone;
  };
  assert.equal(toneFor('WEATHER_ALERT', 'SAFETY_EMERGENCY'), 'EMERGENCY');
  assert.equal(toneFor('WEATHER_ALERT'), 'TIME_BOUND');
  assert.equal(toneFor('ENVIRONMENT_PREPARATION'), 'TIME_BOUND');
  assert.equal(toneFor('SEASONAL_CHECKLIST'), 'MAINTENANCE');
  assert.equal(toneFor('FINANCIAL_EXPOSURE'), 'PLANNING');
  assert.equal(toneFor('COVERAGE_REVIEW'), 'PLANNING');
  assert.equal(toneFor('GENERIC_ACTION'), 'NEUTRAL');
});
