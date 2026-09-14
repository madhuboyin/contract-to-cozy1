import type { PropertyContextScope } from '../../modules/propertyContext';
import { getContextCompleteness, getPropertyContext } from '../../modules/propertyContext';
import { evaluateAggregationContext } from './applicabilityPolicy';
import { projectAggregationLifecycle } from './lifecycle';

export type AggregationContextFeature =
  | 'UNIFIED_HOME'
  | 'DASHBOARD_TODAY'
  | 'ACTION_CENTER'
  | 'PERSONALIZED_GUIDANCE'
  | 'HOME_GAZETTE'
  | 'KNOWLEDGE_TARGETING'
  | 'NOTIFICATIONS'
  | 'SEARCH_ASSISTANT'
  | 'REPORT_SUMMARIES'
  | 'WORKER_BATCH';

export const AGGREGATION_FEATURE_SCOPES: Record<AggregationContextFeature, PropertyContextScope[]> = {
  UNIFIED_HOME: ['CORE', 'LOCATION', 'STRUCTURE', 'SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'COVERAGE', 'RISK', 'PROJECTS', 'EVENTS', 'GUIDANCE_STATE', 'PRODUCT_CONTEXT'],
  DASHBOARD_TODAY: ['CORE', 'MAINTENANCE', 'RISK', 'FINANCIAL', 'GUIDANCE_STATE', 'PRODUCT_CONTEXT'],
  ACTION_CENTER: ['CORE', 'MAINTENANCE', 'COVERAGE', 'RISK', 'PROJECTS', 'GUIDANCE_STATE'],
  PERSONALIZED_GUIDANCE: ['CORE', 'STRUCTURE', 'SYSTEMS', 'SAFETY', 'INVENTORY', 'MAINTENANCE', 'GUIDANCE_STATE'],
  HOME_GAZETTE: ['CORE', 'LOCATION', 'EVENTS', 'MAINTENANCE', 'GUIDANCE_STATE'],
  KNOWLEDGE_TARGETING: ['CORE', 'LOCATION', 'SYSTEMS'],
  NOTIFICATIONS: ['CORE', 'MAINTENANCE', 'RISK', 'EVENTS', 'GUIDANCE_STATE'],
  // External review, 2026-09-14 (FRD §9's own [REQUIREMENT]; Stage 2 target-
  // architecture [DECISION], ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md
  // §9/§661): widened from ['CORE', 'LOCATION', 'PRODUCT_CONTEXT'] to add
  // STRUCTURE/EVENTS -- this was an explicit, governing-doc requirement that
  // was never actually implemented, confirmed by grep before this pass (no
  // reference anywhere in the incremental implementation plan's own
  // phase-by-phase tracking either). Without it, a homeowner-stated
  // STRUCTURE fact (e.g. roofType, captured via capturePropertyFact) or a
  // recent HomeEvent (captured via the conversational capture pipeline) was
  // successfully saved but never actually reachable by a later
  // answerGroundedAsk (GROUNDED_GUIDANCE) turn's own `context.facts` read --
  // "Cozy remembers it next turn" never worked for exactly the two scopes
  // the extraction pipeline's own writes target. Both scopes already have 7
  // other features' worth of precedent (UNIFIED_HOME/PERSONALIZED_GUIDANCE
  // for STRUCTURE; UNIFIED_HOME/HOME_GAZETTE/NOTIFICATIONS/REPORT_SUMMARIES/
  // WORKER_BATCH for EVENTS) producing plain `context.facts` entries
  // (`events.recentHomeEvents`/`events.activeRadarMatches` for EVENTS) that
  // slot into the exact same `Object.values(context.facts)` read
  // `answerGroundedAsk`/`gemini.service.ts` already do -- a genuine config
  // change to an already-proven mechanism, not new data-shape risk.
  SEARCH_ASSISTANT: ['CORE', 'LOCATION', 'STRUCTURE', 'EVENTS', 'PRODUCT_CONTEXT'],
  REPORT_SUMMARIES: ['CORE', 'EVENTS', 'GUIDANCE_STATE'],
  WORKER_BATCH: ['CORE', 'MAINTENANCE', 'RISK', 'EVENTS', 'GUIDANCE_STATE'],
};

const PRIMARY_DECISION_BY_FEATURE = {
  UNIFIED_HOME: 'dashboardToday',
  DASHBOARD_TODAY: 'dashboardToday',
  ACTION_CENTER: 'actionCenter',
  PERSONALIZED_GUIDANCE: 'personalizedGuidance',
  HOME_GAZETTE: 'homeGazette',
  KNOWLEDGE_TARGETING: 'knowledgeTargeting',
  NOTIFICATIONS: 'notificationAggregation',
  SEARCH_ASSISTANT: 'searchAssistant',
  REPORT_SUMMARIES: 'reportSummaries',
  WORKER_BATCH: 'workerBatch',
} as const;

export async function getAggregationContextEnvelope(
  propertyId: string,
  userId: string,
  feature: AggregationContextFeature,
) {
  const context = await getAggregationPropertyContext(propertyId, userId, feature);
  const relatedDecisions = evaluateAggregationContext(context);
  return {
    propertyId,
    feature,
    contextVersion: context.contextVersion,
    scopes: context.scopes,
    decision: relatedDecisions[PRIMARY_DECISION_BY_FEATURE[feature]],
    relatedDecisions,
    lifecycle: projectAggregationLifecycle(context),
    // Home Operations Item #12 (§5.16): pure in-memory computation over the
    // snapshot already fetched above — no extra I/O — used to distinguish
    // "missing facts" from other empty-state reasons on the Home Operations
    // feed.
    completeness: getContextCompleteness(context),
  };
}

/** Internal bounded snapshot. Consumers must select a feature rather than scopes. */
export async function getAggregationPropertyContext(
  propertyId: string,
  userId: string,
  feature: AggregationContextFeature,
) {
  return getPropertyContext(
    propertyId,
    { userId },
    { scopes: AGGREGATION_FEATURE_SCOPES[feature] },
  );
}
