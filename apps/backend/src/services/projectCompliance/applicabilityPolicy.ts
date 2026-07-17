import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface ProjectComplianceDecisions {
  renovationAdvisor: FeatureDecision;
  permitTracking: FeatureDecision;
  hoaCompliance: FeatureDecision;
  ownerProjectExecution: FeatureDecision;
  projectTracking: FeatureDecision;
  materialSpecifications: FeatureDecision;
  localPriceBenchmarking: FeatureDecision;
  quoteComparison: FeatureDecision;
  priceFinalization: FeatureDecision;
  negotiationShield: FeatureDecision;
  providerBooking: FeatureDecision;
  bookingDeduplication: FeatureDecision;
}

type ResponsibleParty = 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN';

const PROJECT_RESPONSIBILITY_KEYS = [
  'responsibility.roof',
  'responsibility.buildingExterior',
  'responsibility.drivewayWalkways',
  'responsibility.deckPatioBalcony',
  'responsibility.plumbing',
  'responsibility.hvac',
  'responsibility.sharedSystems',
] as const;

function availableCollection(
  context: PropertyContextSnapshot,
  key: string,
  availableReason: string,
  unavailableReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  return facts.read<unknown[]>(key) === undefined
    ? facts.unknown(unavailableReason)
    : facts.decision('APPLICABLE', [availableReason]);
}

export function evaluateProjectComplianceContext(context: PropertyContextSnapshot): ProjectComplianceDecisions {
  const renovationFacts = new PropertyContextDecisionBuilder(context);
  const dwellingType = renovationFacts.read<string>('core.dwellingType');
  const state = renovationFacts.read<string>('location.state');
  const zipCode = renovationFacts.read<string>('location.zipCode');
  const renovationAdvisor = !dwellingType || !state || !zipCode
    ? renovationFacts.unknown('RENOVATION_PROPERTY_OR_JURISDICTION_UNKNOWN')
    : renovationFacts.decision('APPLICABLE', ['RENOVATION_PROPERTY_AND_JURISDICTION_AVAILABLE']);

  const permitFacts = new PropertyContextDecisionBuilder(context);
  const permitState = permitFacts.read<string>('location.state');
  const permitZip = permitFacts.read<string>('location.zipCode');
  const permitTracking = !permitState || !permitZip
    ? permitFacts.unknown('PERMIT_JURISDICTION_UNKNOWN')
    : permitFacts.decision('APPLICABLE', ['PERMIT_JURISDICTION_AVAILABLE']);

  const hoaFacts = new PropertyContextDecisionBuilder(context);
  const association = hoaFacts.read<{ id?: string } | null>('compliance.hoaAssociation');
  const hoaCompliance = association === undefined
    ? hoaFacts.unknown('HOA_STATE_UNAVAILABLE')
    : association
      ? hoaFacts.decision('APPLICABLE', ['HOA_ASSOCIATION_RECORDED'])
      : hoaFacts.decision('NOT_APPLICABLE', ['NO_HOA_ASSOCIATION_RECORDED']);

  // HOA existence deliberately does not participate in this decision. Physical
  // work responsibility comes only from canonical responsibility facts.
  const responsibilityFacts = new PropertyContextDecisionBuilder(context);
  const parties = PROJECT_RESPONSIBILITY_KEYS.map((key) => responsibilityFacts.read<ResponsibleParty>(key));
  const knownParties = parties.filter((party): party is Exclude<ResponsibleParty, 'UNKNOWN'> => Boolean(party && party !== 'UNKNOWN'));
  const ownerProjectExecution = knownParties.length === 0
    ? responsibilityFacts.unknown('PROJECT_RESPONSIBILITY_UNKNOWN')
    : knownParties.some((party) => party === 'OWNER' || party === 'SHARED')
      ? responsibilityFacts.decision('APPLICABLE', ['OWNER_OR_SHARED_PROJECT_RESPONSIBILITY'])
      : responsibilityFacts.decision('NOT_APPLICABLE', ['PROJECT_RESPONSIBILITY_ASSIGNED_ELSEWHERE']);

  const pricingFacts = new PropertyContextDecisionBuilder(context);
  const pricingState = pricingFacts.read<string>('location.state');
  const pricingZip = pricingFacts.read<string>('location.zipCode');
  const pricingDwelling = pricingFacts.read<string>('core.dwellingType');
  const pricingSize = pricingFacts.read<number>('core.propertySizeSqFt');
  const localPriceBenchmarking = !pricingState || !pricingZip || !pricingDwelling || !pricingSize
    ? pricingFacts.unknown('LOCAL_PRICING_CONTEXT_UNKNOWN')
    : pricingFacts.decision('APPLICABLE', ['LOCAL_PRICING_CONTEXT_AVAILABLE']);

  return {
    renovationAdvisor,
    permitTracking,
    hoaCompliance,
    ownerProjectExecution,
    projectTracking: availableCollection(context, 'projects.activeProjects', 'PROJECT_STATE_AVAILABLE', 'PROJECT_STATE_UNAVAILABLE'),
    materialSpecifications: availableCollection(context, 'projects.materialSpecs', 'MATERIAL_STATE_AVAILABLE', 'MATERIAL_STATE_UNAVAILABLE'),
    localPriceBenchmarking,
    quoteComparison: availableCollection(context, 'projects.openQuoteWorkspaces', 'QUOTE_STATE_AVAILABLE', 'QUOTE_STATE_UNAVAILABLE'),
    priceFinalization: availableCollection(context, 'projects.openPriceFinalizations', 'PRICE_FINALIZATION_STATE_AVAILABLE', 'PRICE_FINALIZATION_STATE_UNAVAILABLE'),
    negotiationShield: availableCollection(context, 'projects.openNegotiations', 'NEGOTIATION_STATE_AVAILABLE', 'NEGOTIATION_STATE_UNAVAILABLE'),
    providerBooking: ownerProjectExecution,
    bookingDeduplication: availableCollection(context, 'projects.activeBookings', 'ACTIVE_BOOKING_STATE_AVAILABLE', 'ACTIVE_BOOKING_STATE_UNAVAILABLE'),
  };
}
