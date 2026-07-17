import { createHash } from 'node:crypto';
import type { PropertyContextScope } from '../../modules/propertyContext';
import { getPropertyContext } from '../../modules/propertyContext';
import { APIError } from '../../middleware/error.middleware';
import { evaluatePlanningContext, type PlanningDecisionKey } from './applicabilityPolicy';
import { reconcilePlanningOutput } from './reconciliation';

export type PlanningContextFeature =
  | 'SELLER_PREP'
  | 'HOME_BUYER'
  | 'MOVING_PLAN'
  | 'NEIGHBORHOOD_RADAR'
  | 'LOCAL_UPDATES'
  | 'COMMUNITY_EVENTS'
  | 'DIGITAL_WILL'
  | 'DIGITAL_TWIN'
  | 'TIMELINE'
  | 'REPORTS'
  | 'SHARED_REPORT';

export const PLANNING_FEATURE_SCOPES: Record<PlanningContextFeature, PropertyContextScope[]> = {
  SELLER_PREP: ['CORE', 'LOCATION', 'INSPECTION', 'COMPLIANCE', 'PROJECTS', 'COVERAGE', 'EVENTS'],
  HOME_BUYER: ['CORE', 'PRODUCT_CONTEXT'],
  MOVING_PLAN: ['CORE', 'LOCATION', 'EVENTS'],
  NEIGHBORHOOD_RADAR: ['CORE', 'LOCATION', 'EVENTS'],
  LOCAL_UPDATES: ['CORE', 'LOCATION'],
  COMMUNITY_EVENTS: ['CORE', 'LOCATION'],
  DIGITAL_WILL: ['CORE', 'INVENTORY', 'COVERAGE', 'EVENTS', 'PRODUCT_CONTEXT'],
  DIGITAL_TWIN: ['CORE', 'STRUCTURE', 'SYSTEMS', 'INVENTORY', 'RISK', 'EVENTS'],
  TIMELINE: ['CORE', 'EVENTS'],
  REPORTS: ['CORE', 'LOCATION', 'STRUCTURE', 'INVENTORY', 'MAINTENANCE', 'COVERAGE'],
  SHARED_REPORT: ['CORE', 'LOCATION'],
};

const PLANNING_FEATURE_FACT_KEYS: Record<PlanningContextFeature, string[]> = {
  SELLER_PREP: [
    'core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode',
    'inspection.openFindings', 'compliance.activePermits', 'compliance.openUnpermittedFlags',
    'projects.activeProjects', 'coverage.insurancePolicies',
  ],
  HOME_BUYER: ['product.homeownerSegment', 'core.activationStatus'],
  MOVING_PLAN: ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode', 'location.city'],
  NEIGHBORHOOD_RADAR: ['location.zipCode', 'location.geocoded', 'core.propertyUse', 'events.activeRadarMatches'],
  LOCAL_UPDATES: ['location.city', 'location.state', 'location.zipCode', 'core.dwellingType'],
  COMMUNITY_EVENTS: ['location.city', 'location.state', 'location.zipCode'],
  DIGITAL_WILL: ['inventory.items', 'coverage.insurancePolicies', 'coverage.warranties', 'events.recentHomeEvents'],
  DIGITAL_TWIN: [
    'core.yearBuilt', 'core.propertySizeSqFt', 'structure.roofType', 'structure.roofReplacementYear',
    'structure.foundationType', 'systems.heatingType', 'systems.coolingType', 'systems.waterHeaterType',
    'systems.installedItemTypes', 'inventory.items', 'risk.report',
  ],
  TIMELINE: ['events.recentHomeEvents'],
  REPORTS: [
    'core.dwellingType', 'core.propertyUse', 'core.yearBuilt', 'core.propertySizeSqFt',
    'location.city', 'location.state', 'location.zipCode',
    'inventory.items', 'maintenance.tasks', 'coverage.insurancePolicies', 'coverage.warranties',
  ],
  SHARED_REPORT: ['location.city', 'location.state', 'core.dwellingType', 'core.yearBuilt'],
};

function featureContextVersion(
  propertyId: string,
  feature: PlanningContextFeature,
  facts: Record<string, unknown>,
): string {
  const configuredKeys = PLANNING_FEATURE_FACT_KEYS[feature];
  const keys = configuredKeys.length > 0 ? [...configuredKeys] : Object.keys(facts);
  const selectedFacts = keys.sort().map((key) => [key, facts[key] ?? null]);
  return createHash('sha256')
    .update(JSON.stringify({ propertyId, feature, facts: selectedFacts }))
    .digest('hex');
}

const PRIMARY_DECISION_BY_FEATURE: Record<PlanningContextFeature, PlanningDecisionKey> = {
  SELLER_PREP: 'sellerPrepPlanning',
  HOME_BUYER: 'homeBuyerWorkflow',
  MOVING_PLAN: 'movingPlanning',
  NEIGHBORHOOD_RADAR: 'neighborhoodRelevance',
  LOCAL_UPDATES: 'localUpdatesTargeting',
  COMMUNITY_EVENTS: 'localUpdatesTargeting',
  DIGITAL_WILL: 'digitalWillComposition',
  DIGITAL_TWIN: 'digitalTwinProjection',
  TIMELINE: 'timelineComposition',
  REPORTS: 'reportGeneration',
  SHARED_REPORT: 'sharedReportProjection',
};

export async function getPlanningContextDecisions(
  propertyId: string,
  userId: string,
  feature: PlanningContextFeature,
) {
  const context = await getPropertyContext(
    propertyId,
    { userId },
    { scopes: PLANNING_FEATURE_SCOPES[feature] },
  );
  return {
    contextVersion: featureContextVersion(propertyId, feature, context.facts),
    feature,
    scopes: context.scopes,
    context,
    decisions: evaluatePlanningContext(context),
  };
}

export async function getPlanningContextEnvelope(
  propertyId: string,
  userId: string,
  feature: PlanningContextFeature,
  generatedContextVersion?: string | null,
) {
  const result = await getPlanningContextDecisions(propertyId, userId, feature);
  const decision = result.decisions[PRIMARY_DECISION_BY_FEATURE[feature]];
  return {
    contextVersion: result.contextVersion,
    decision,
    relatedDecisions: result.decisions,
    generatedContextVersion: generatedContextVersion ?? null,
    isStale: Boolean(generatedContextVersion && generatedContextVersion !== result.contextVersion),
    reconciliation: reconcilePlanningOutput(result.contextVersion, generatedContextVersion, decision),
  };
}

export async function assertPlanningContextApplicable(
  propertyId: string,
  userId: string,
  feature: PlanningContextFeature,
  decisionKey?: PlanningDecisionKey,
) {
  const result = await getPlanningContextDecisions(propertyId, userId, feature);
  const key = decisionKey ?? PRIMARY_DECISION_BY_FEATURE[feature];
  const decision = result.decisions[key];
  if (decision.status !== 'NOT_APPLICABLE') return result;
  throw new APIError(
    'This feature does not apply to the selected property context.',
    409,
    'PROPERTY_PLANNING_CONTEXT_NOT_APPLICABLE',
    { contextVersion: result.contextVersion, decision, decisionKey: key, feature },
  );
}
