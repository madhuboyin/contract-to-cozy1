import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface AggregationContextDecisions {
  dashboardToday: FeatureDecision;
  actionCenter: FeatureDecision;
  personalizedGuidance: FeatureDecision;
  homeGazette: FeatureDecision;
  knowledgeTargeting: FeatureDecision;
  notificationAggregation: FeatureDecision;
  searchAssistant: FeatureDecision;
  reportSummaries: FeatureDecision;
  workerBatch: FeatureDecision;
}

function requiresKnownFact(
  context: PropertyContextSnapshot,
  key: string,
  applicableReason: string,
  unknownReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  return facts.read<unknown>(key) === undefined
    ? facts.unknown(unknownReason)
    : facts.decision('APPLICABLE', [applicableReason]);
}

function requiresLocation(
  context: PropertyContextSnapshot,
  applicableReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const state = facts.read<string>('location.state');
  const zipCode = facts.read<string>('location.zipCode');
  return state && zipCode
    ? facts.decision('APPLICABLE', [applicableReason])
    : facts.unknown('AGGREGATION_LOCATION_UNKNOWN');
}

/**
 * Phase 7 surface policy. This policy decides whether an aggregation surface
 * has enough property context to compose authoritative feature results. It
 * never reimplements the underlying feature's eligibility or calculation.
 */
export function evaluateAggregationContext(
  context: PropertyContextSnapshot,
): AggregationContextDecisions {
  return {
    dashboardToday: requiresKnownFact(
      context,
      'core.activationStatus',
      'PROPERTY_DASHBOARD_CONTEXT_AVAILABLE',
      'PROPERTY_DASHBOARD_CONTEXT_UNKNOWN',
    ),
    actionCenter: requiresKnownFact(
      context,
      'maintenance.tasks',
      'AUTHORITATIVE_ACTION_STATE_AVAILABLE',
      'AUTHORITATIVE_ACTION_STATE_UNKNOWN',
    ),
    personalizedGuidance: requiresKnownFact(
      context,
      'inventory.items',
      'PROPERTY_GUIDANCE_CONTEXT_AVAILABLE',
      'PROPERTY_GUIDANCE_CONTEXT_UNKNOWN',
    ),
    homeGazette: requiresLocation(context, 'LOCAL_GAZETTE_CONTEXT_AVAILABLE'),
    knowledgeTargeting: requiresLocation(context, 'KNOWLEDGE_TARGETING_CONTEXT_AVAILABLE'),
    notificationAggregation: requiresKnownFact(
      context,
      'guidance.activeSignals',
      'NOTIFICATION_SOURCE_STATE_AVAILABLE',
      'NOTIFICATION_SOURCE_STATE_UNKNOWN',
    ),
    searchAssistant: requiresKnownFact(
      context,
      'core.dwellingType',
      'PROPERTY_SEARCH_CONTEXT_AVAILABLE',
      'PROPERTY_SEARCH_CONTEXT_UNKNOWN',
    ),
    reportSummaries: requiresKnownFact(
      context,
      'events.recentHomeEvents',
      'REPORT_SUMMARY_CONTEXT_AVAILABLE',
      'REPORT_SUMMARY_CONTEXT_UNKNOWN',
    ),
    workerBatch: requiresKnownFact(
      context,
      'core.activationStatus',
      'SCOPED_WORKER_CONTEXT_AVAILABLE',
      'SCOPED_WORKER_CONTEXT_UNKNOWN',
    ),
  };
}
