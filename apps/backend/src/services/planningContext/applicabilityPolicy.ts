import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

function requiresFacts(
  context: PropertyContextSnapshot,
  keys: string[],
  availableReason: string,
  unavailableReason: string,
  extraReasons: string[] = [],
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const values = keys.map((key) => facts.read<unknown>(key));
  return values.every((value) => value !== undefined && value !== null)
    ? facts.decision('APPLICABLE', [availableReason, ...extraReasons])
    : facts.unknown(unavailableReason);
}

function availableCollections(
  context: PropertyContextSnapshot,
  keys: string[],
  availableReason: string,
  unavailableReason: string,
  extraReasons: string[] = [],
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const values = keys.map((key) => facts.read<unknown>(key));
  return values.every((value) => value !== undefined)
    ? facts.decision('APPLICABLE', [availableReason, ...extraReasons])
    : facts.unknown(unavailableReason);
}

export function evaluatePlanningContext(context: PropertyContextSnapshot) {
  const sellerFacts = new PropertyContextDecisionBuilder(context);
  const propertyUse = sellerFacts.read<string>('core.propertyUse');
  const sellerState = sellerFacts.read<string>('location.state');
  const sellerPrepPlanning = propertyUse && sellerState
    ? sellerFacts.decision('APPLICABLE', [
        'PROPERTY_USE_AND_LOCATION_AVAILABLE',
        ...(propertyUse === 'FOR_SALE' ? ['SALE_INTENT_RECORDED'] : []),
      ])
    : sellerFacts.unknown('SELLER_CONTEXT_INCOMPLETE');

  const saleReadiness = availableCollections(
    context,
    [
      'inspection.openFindings',
      'compliance.activePermits',
      'compliance.openUnpermittedFlags',
      'projects.activeProjects',
      'coverage.insurancePolicies',
    ],
    'OPEN_WORK_AND_COVERAGE_CONTEXT_AVAILABLE',
    'SALE_READINESS_CONTEXT_INCOMPLETE',
  );

  const buyerFacts = new PropertyContextDecisionBuilder(context);
  const segment = buyerFacts.read<string>('product.homeownerSegment');
  const homeBuyerWorkflow = segment === undefined
    ? buyerFacts.unknown('HOMEOWNER_SEGMENT_UNKNOWN')
    : segment === 'HOME_BUYER'
      ? buyerFacts.decision('APPLICABLE', ['HOME_BUYER_SEGMENT_ACTIVE'])
      : buyerFacts.decision('NOT_APPLICABLE', ['SEGMENT_NOT_HOME_BUYER']);

  const movingPlanning = requiresFacts(
    context,
    ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode'],
    'PROPERTY_USE_AND_LOCATION_AVAILABLE_FOR_MOVING',
    'MOVING_CONTEXT_INCOMPLETE',
  );

  const neighborhoodFacts = new PropertyContextDecisionBuilder(context);
  const zip = neighborhoodFacts.read<string>('location.zipCode');
  const geocoded = neighborhoodFacts.read<boolean>('location.geocoded');
  const neighborhoodRelevance = zip
    ? neighborhoodFacts.decision('APPLICABLE', [
        'GEOGRAPHIC_MATCH_AVAILABLE',
        ...(geocoded ? ['PRECISE_GEOCODING_AVAILABLE'] : []),
      ])
    : neighborhoodFacts.unknown('LOCATION_CONTEXT_MISSING');

  const localFacts = new PropertyContextDecisionBuilder(context);
  const localCity = localFacts.read<string>('location.city');
  const localState = localFacts.read<string>('location.state');
  localFacts.read<string>('location.zipCode');
  const dwellingType = localFacts.read<string>('core.dwellingType');
  const localUpdatesTargeting = localCity && localState
    ? localFacts.decision('APPLICABLE', [
        'LOCAL_AREA_MATCH_AVAILABLE',
        dwellingType && dwellingType !== 'UNKNOWN'
          ? 'DWELLING_ELIGIBILITY_AVAILABLE'
          : 'DWELLING_ELIGIBILITY_UNKNOWN_BROAD_MATCH',
      ])
    : localFacts.unknown('LOCAL_AREA_CONTEXT_MISSING');

  const digitalWillComposition = availableCollections(
    context,
    ['inventory.items', 'coverage.insurancePolicies', 'coverage.warranties', 'events.recentHomeEvents'],
    'AUTHORITATIVE_CONTINUITY_SOURCES_AVAILABLE',
    'CONTINUITY_SOURCES_INCOMPLETE',
  );

  const digitalTwinProjection = availableCollections(
    context,
    ['inventory.items', 'systems.installedItemTypes'],
    'CANONICAL_SOURCES_AVAILABLE_FOR_PROJECTION',
    'TWIN_SOURCE_CONTEXT_INCOMPLETE',
    ['TWIN_IS_PROJECTION_NOT_SOURCE_OF_TRUTH'],
  );

  const timelineComposition = availableCollections(
    context,
    ['events.recentHomeEvents'],
    'AUTHORITATIVE_EVENT_HISTORY_AVAILABLE',
    'EVENT_HISTORY_UNAVAILABLE',
  );

  const reportGeneration = availableCollections(
    context,
    ['inventory.items', 'maintenance.tasks', 'coverage.insurancePolicies', 'coverage.warranties'],
    'AUTHORITATIVE_REPORT_SOURCES_AVAILABLE',
    'REPORT_SOURCE_CONTEXT_INCOMPLETE',
  );

  const sharedReportProjection = requiresFacts(
    context,
    ['location.city', 'location.state'],
    'REDACTED_LOCATION_CONTEXT_AVAILABLE',
    'REDACTED_PROJECTION_CONTEXT_INCOMPLETE',
    ['REDACTED_PROJECTION_ENFORCED'],
  );

  return {
    sellerPrepPlanning,
    saleReadiness,
    homeBuyerWorkflow,
    movingPlanning,
    neighborhoodRelevance,
    localUpdatesTargeting,
    digitalWillComposition,
    digitalTwinProjection,
    timelineComposition,
    reportGeneration,
    sharedReportProjection,
  };
}

export type PlanningDecisionKey = keyof ReturnType<typeof evaluatePlanningContext>;
