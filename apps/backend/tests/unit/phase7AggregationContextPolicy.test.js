const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/domain/facts.ts');
const {
  evaluateAggregationContext,
} = require('../../src/services/aggregationContext/applicabilityPolicy.ts');
const {
  AGGREGATION_FEATURE_SCOPES,
} = require('../../src/services/aggregationContext/context.ts');
const {
  aggregationLifecycleIdentity,
  projectAggregationLifecycle,
} = require('../../src/services/aggregationContext/lifecycle.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function snapshot(values = {}) {
  const generatedAt = new Date('2026-07-17T12:00:00.000Z');
  const facts = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, generatedAt),
    ]),
  );
  return {
    propertyId: 'property-1',
    contextVersion: 'phase7-context-v1',
    generatedAt: generatedAt.toISOString(),
    scopes: [],
    facts,
    warnings: [],
  };
}

test('Phase 7 aggregation scopes preserve the optional household consent boundary', () => {
  for (const [feature, scopes] of Object.entries(AGGREGATION_FEATURE_SCOPES)) {
    assert.ok(scopes.length > 0, `${feature} must request bounded context`);
    assert.equal(scopes.includes('OPTIONAL_HOUSEHOLD'), false, `${feature} cannot request optional household facts`);
  }
});

test('aggregation surfaces return explainable decisions from authoritative property facts', () => {
  const decisions = evaluateAggregationContext(snapshot({
    'core.activationStatus': 'ACTIVATED',
    'core.dwellingType': 'CONDO_UNIT',
    'location.state': 'TX',
    'location.zipCode': '78701',
    'maintenance.tasks': [],
    'inventory.items': [],
    'guidance.activeSignals': [],
    'events.recentHomeEvents': [],
  }));

  assert.equal(decisions.dashboardToday.status, 'APPLICABLE');
  assert.equal(decisions.actionCenter.status, 'APPLICABLE');
  assert.equal(decisions.personalizedGuidance.status, 'APPLICABLE');
  assert.equal(decisions.homeGazette.status, 'APPLICABLE');
  assert.equal(decisions.knowledgeTargeting.status, 'APPLICABLE');
  assert.equal(decisions.notificationAggregation.status, 'APPLICABLE');
  assert.equal(decisions.searchAssistant.status, 'APPLICABLE');
  assert.equal(decisions.reportSummaries.status, 'APPLICABLE');
  assert.equal(decisions.workerBatch.status, 'APPLICABLE');
  assert.ok(decisions.actionCenter.usedFactKeys.includes('maintenance.tasks'));
});

test('missing, stale, and conflicted aggregator inputs remain UNKNOWN', () => {
  const context = snapshot({
    'core.activationStatus': 'ACTIVATED',
    'maintenance.tasks': [],
  });
  context.facts['core.activationStatus'].state = 'STALE';
  context.facts['maintenance.tasks'].state = 'CONFLICTED';

  const decisions = evaluateAggregationContext(context);
  assert.equal(decisions.dashboardToday.status, 'UNKNOWN');
  assert.ok(decisions.dashboardToday.missingFactKeys.includes('core.activationStatus'));
  assert.equal(decisions.actionCenter.status, 'UNKNOWN');
  assert.ok(decisions.actionCenter.conflictedFactKeys.includes('maintenance.tasks'));
  assert.equal(decisions.knowledgeTargeting.status, 'UNKNOWN');
});

test('Today, Action Center, and Personalization APIs reuse the Phase 7 envelope', () => {
  const pulse = read('../../src/controllers/dailyHomePulse.controller.ts');
  assert.ok(pulse.includes("getAggregationContextEnvelope(propertyId, userId, 'DASHBOARD_TODAY')"));

  const orchestration = read('../../src/services/orchestration.service.ts');
  assert.ok(orchestration.includes("getAggregationContextEnvelope(propertyId, userId, 'ACTION_CENTER')"));
  assert.ok(orchestration.includes('aggregationContext,'));

  const personalization = read('../../src/modules/personalization/api/personalization.controller.ts');
  assert.ok(personalization.includes("'PERSONALIZED_GUIDANCE'"));
  assert.ok(personalization.includes('propertyContext'));
});

test('Phase 7 lifecycle mutations enforce a contributor role floor', () => {
  for (const relative of [
    '../../src/routes/dailyHomePulse.routes.ts',
    '../../src/routes/homeActions.routes.ts',
  ]) {
    const source = read(relative);
    assert.ok(source.includes("requireHouseholdRole('CONTRIBUTOR')"), relative);
  }
});

test('canonical lifecycle collapses duplicates and terminal state wins across surfaces', () => {
  const context = snapshot({
    'maintenance.tasks': [
      { id: 'task-1', actionKey: 'replace-filter', status: 'PENDING', updatedAt: '2026-07-16T00:00:00.000Z' },
      { id: 'task-2', actionKey: 'replace-filter', status: 'COMPLETED', updatedAt: '2026-07-17T00:00:00.000Z' },
    ],
    'guidance.activeSignals': [
      { signalId: 'signal-1', actionKey: 'replace-filter', status: 'ACTIVE' },
      { signalId: 'signal-2', actionKey: 'inspect-roof', status: 'SNOOZED' },
    ],
  });
  const lifecycle = projectAggregationLifecycle(context);
  assert.equal(lifecycle.length, 2);
  assert.equal(lifecycle.find((item) => item.identity === 'ACTION:REPLACE-FILTER').status, 'COMPLETED');
  assert.equal(lifecycle.find((item) => item.identity === 'ACTION:INSPECT-ROOF').status, 'SNOOZED');
  assert.equal(aggregationLifecycleIdentity({ actionKey: ' replace-filter ', fallback: 'x' }), 'ACTION:REPLACE-FILTER');
});

test('Phase 7 archetypes retain the same surface readiness when required facts are known', () => {
  for (const archetype of [
    { dwellingType: 'CONDO_UNIT', propertyUse: 'PRIMARY_RESIDENCE' },
    { dwellingType: 'DETACHED_SINGLE_FAMILY', propertyUse: 'LONG_TERM_RENTAL' },
    { dwellingType: 'TOWNHOUSE', propertyUse: 'VACANT' },
  ]) {
    const decisions = evaluateAggregationContext(snapshot({
      'core.activationStatus': 'ACTIVATED',
      'core.dwellingType': archetype.dwellingType,
      'core.propertyUse': archetype.propertyUse,
      'location.state': 'TX',
      'location.zipCode': '78701',
      'maintenance.tasks': [],
      'inventory.items': [],
      'guidance.activeSignals': [],
      'events.recentHomeEvents': [],
    }));
    assert.ok(Object.values(decisions).every((decision) => decision.status === 'APPLICABLE'));
  }
});

// External review, 2026-09-14 (FRD §9's own [REQUIREMENT]; Stage 2 target-
// architecture [DECISION]): SEARCH_ASSISTANT's scope was still only
// ['CORE', 'LOCATION', 'PRODUCT_CONTEXT'] -- a homeowner-stated STRUCTURE
// fact (e.g. roofType) or a recent HomeEvent, successfully captured via the
// conversational capture pipeline, was never actually reachable by a later
// answerGroundedAsk (GROUNDED_GUIDANCE) turn's own context read. Both
// STRUCTURE and EVENTS already have real precedent elsewhere in this same
// map (UNIFIED_HOME/PERSONALIZED_GUIDANCE; UNIFIED_HOME/HOME_GAZETTE/
// NOTIFICATIONS/REPORT_SUMMARIES/WORKER_BATCH respectively) -- a config
// widening of an already-proven mechanism, not new data-shape risk.
test('SEARCH_ASSISTANT scope includes STRUCTURE and EVENTS so captured facts/events are reachable by a later grounded answer', () => {
  assert.ok(AGGREGATION_FEATURE_SCOPES.SEARCH_ASSISTANT.includes('STRUCTURE'));
  assert.ok(AGGREGATION_FEATURE_SCOPES.SEARCH_ASSISTANT.includes('EVENTS'));
  // CORE/LOCATION/PRODUCT_CONTEXT were already there -- confirms this is an
  // addition, not an accidental full replacement of the existing scope.
  assert.ok(AGGREGATION_FEATURE_SCOPES.SEARCH_ASSISTANT.includes('CORE'));
  assert.ok(AGGREGATION_FEATURE_SCOPES.SEARCH_ASSISTANT.includes('LOCATION'));
  assert.ok(AGGREGATION_FEATURE_SCOPES.SEARCH_ASSISTANT.includes('PRODUCT_CONTEXT'));
});

test('remaining Phase 7 API, UI, and worker consumers use shared contracts', () => {
  const gazetteArchive = read('../../src/modules/gazette/controllers/gazette.controller.ts');
  assert.ok(gazetteArchive.includes("'HOME_GAZETTE'"));
  const knowledge = read('../../src/controllers/knowledgeHub.controller.ts');
  assert.ok(knowledge.includes("'KNOWLEDGE_TARGETING'"));
  const assistant = read('../../src/services/gemini.service.ts');
  assert.ok(assistant.includes("'SEARCH_ASSISTANT'"));
  assert.ok(assistant.includes('missingFacts'));
  const report = read('../../src/services/planningContext/reportSnapshot.ts');
  assert.ok(report.includes("'REPORT_SUMMARIES'"));
  const notification = read('../../src/services/notification.service.ts');
  assert.ok(notification.includes("'NOTIFICATIONS'"));
  const workerPolicy = read('../../../workers/src/services/aggregationDeliveryPolicy.ts');
  assert.ok(workerPolicy.includes("getAggregationContextBatch(scoped, 'NOTIFICATIONS'"));
  const briefingWorker = read('../../../workers/src/jobs/homeBriefingDelivery.job.ts');
  assert.ok(briefingWorker.includes('generateDueHomeBriefings'));
  const knowledgeUi = read('../../../frontend/src/components/knowledge/KnowledgeTargetingNotice.tsx');
  assert.ok(knowledgeUi.includes('PropertyContextStatusNotice'));
  const briefingUi = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-briefing/HomeBriefingClient.tsx');
  assert.ok(briefingUi.includes('Source lineage'));
});

test('production personalization entries pass actor identity into Property Context trait evaluation', () => {
  const traits = read('../../src/modules/personalization/infrastructure/propertyTraitRepository.ts');
  assert.ok(traits.includes('getAggregationPropertyContext'));
  const personalization = read('../../src/modules/personalization/application/getPersonalization.usecase.ts');
  assert.ok(personalization.includes("'PROPERTY_READ', userId"));
  const modules = read('../../src/modules/personalization/application/getModuleRecommendations.usecase.ts');
  assert.ok(modules.includes('actorUserId') || modules.includes('userId'));
});
