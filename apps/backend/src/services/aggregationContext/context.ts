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
  SEARCH_ASSISTANT: ['CORE', 'LOCATION', 'PRODUCT_CONTEXT'],
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
