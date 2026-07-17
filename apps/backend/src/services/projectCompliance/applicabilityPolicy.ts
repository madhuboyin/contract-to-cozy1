import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';
import {
  classifyPermitApplicability,
  classifyExecutionAppropriateness,
  hasWorkDescriptor,
  hasUnresolvedResponsibilityScope,
  ProjectComplianceWorkInput,
  resolvePermitWorkTypes,
  resolveResponsibilityFactKeys,
} from './workScope';

export interface ProjectComplianceDecisions {
  renovationAdvisor: FeatureDecision;
  permitTracking: FeatureDecision;
  permitApplicability: FeatureDecision;
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
  professionalReview: FeatureDecision;
  diyExecution: FeatureDecision;
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

export function evaluateProjectComplianceContext(
  context: PropertyContextSnapshot,
  work?: ProjectComplianceWorkInput,
): ProjectComplianceDecisions {
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

  const permitApplicabilityFacts = new PropertyContextDecisionBuilder(context);
  const applicabilityState = permitApplicabilityFacts.read<string>('location.state');
  const applicabilityZip = permitApplicabilityFacts.read<string>('location.zipCode');
  const permitClass = classifyPermitApplicability(resolvePermitWorkTypes(work));
  const permitApplicability = !applicabilityState || !applicabilityZip
    ? permitApplicabilityFacts.unknown('PERMIT_JURISDICTION_UNKNOWN')
    : permitClass === 'REQUIRED'
      ? permitApplicabilityFacts.decision('APPLICABLE', ['PERMIT_REQUIRED_FOR_WORK_SCOPE', 'VERIFY_LOCAL_PERMIT_RULES'])
      : permitClass === 'LIKELY_REQUIRED'
        ? permitApplicabilityFacts.decision('APPLICABLE', ['PERMIT_LIKELY_REQUIRED_FOR_WORK_SCOPE', 'VERIFY_LOCAL_PERMIT_RULES'])
        : permitClass === 'CONDITIONAL'
          ? permitApplicabilityFacts.unknown('PERMIT_REQUIREMENT_CONDITIONAL_VERIFY_LOCAL_RULES')
          : permitApplicabilityFacts.unknown('PERMIT_WORK_SCOPE_UNKNOWN');

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
  const resolvedResponsibilityKeys = resolveResponsibilityFactKeys(work);
  const responsibilityKeys = resolvedResponsibilityKeys.length > 0
    ? resolvedResponsibilityKeys
    : hasWorkDescriptor(work)
      ? []
      : PROJECT_RESPONSIBILITY_KEYS;
  const parties = responsibilityKeys.map((key) => responsibilityFacts.read<ResponsibleParty>(key));
  const knownParties = parties.filter((party): party is Exclude<ResponsibleParty, 'UNKNOWN'> => Boolean(party && party !== 'UNKNOWN'));
  const hasUnknownParty = parties.some((party) => !party || party === 'UNKNOWN');
  const workIsScoped = hasWorkDescriptor(work);
  const unresolvedResponsibilityScope = hasUnresolvedResponsibilityScope(work);
  const ownerProjectExecution = unresolvedResponsibilityScope
    ? responsibilityFacts.unknown('WORK_SCOPE_RESPONSIBILITY_MAPPING_UNKNOWN')
    : responsibilityKeys.length === 0 && workIsScoped
    ? responsibilityFacts.decision('APPLICABLE', ['NO_PROPERTY_RESPONSIBILITY_REQUIRED'])
    : workIsScoped && knownParties.some((party) => party === 'ASSOCIATION' || party === 'LANDLORD')
      ? responsibilityFacts.decision('NOT_APPLICABLE', ['WORK_SCOPE_RESPONSIBILITY_ASSIGNED_ELSEWHERE'])
      : knownParties.length === 0 || (workIsScoped && hasUnknownParty)
        ? responsibilityFacts.unknown('WORK_SCOPE_RESPONSIBILITY_UNKNOWN')
        : !workIsScoped && !knownParties.some((party) => party === 'OWNER' || party === 'SHARED')
          ? responsibilityFacts.decision('NOT_APPLICABLE', ['PROJECT_RESPONSIBILITY_ASSIGNED_ELSEWHERE'])
          : responsibilityFacts.decision('APPLICABLE', ['OWNER_OR_SHARED_WORK_SCOPE_RESPONSIBILITY']);

  const pricingFacts = new PropertyContextDecisionBuilder(context);
  const pricingState = pricingFacts.read<string>('location.state');
  const pricingZip = pricingFacts.read<string>('location.zipCode');
  const pricingDwelling = pricingFacts.read<string>('core.dwellingType');
  const pricingSize = pricingFacts.read<number>('core.propertySizeSqFt');
  const localPriceBenchmarking = !pricingState || !pricingZip || !pricingDwelling || !pricingSize
    ? pricingFacts.unknown('LOCAL_PRICING_CONTEXT_UNKNOWN')
    : pricingFacts.decision('APPLICABLE', ['LOCAL_PRICING_CONTEXT_AVAILABLE']);

  const executionClass = classifyExecutionAppropriateness(work);
  const professionalFacts = new PropertyContextDecisionBuilder(context);
  const professionalReview = executionClass === 'LICENSED_PROFESSIONAL_REQUIRED'
    ? professionalFacts.decision('APPLICABLE', ['LICENSED_PROFESSIONAL_REQUIRED_FOR_WORK_SCOPE'])
    : executionClass === 'PROFESSIONAL_REVIEW_RECOMMENDED'
      ? professionalFacts.decision('APPLICABLE', ['PROFESSIONAL_REVIEW_RECOMMENDED_FOR_WORK_SCOPE'])
      : executionClass === 'DIY_ELIGIBLE'
        ? professionalFacts.decision('NOT_APPLICABLE', ['PROFESSIONAL_REVIEW_NOT_REQUIRED_FOR_LOW_RISK_SCOPE'])
        : professionalFacts.unknown('WORK_SCOPE_UNKNOWN_FOR_EXECUTION_GUIDANCE');

  const diyFacts = new PropertyContextDecisionBuilder(context);
  const diyExecution = executionClass === 'LICENSED_PROFESSIONAL_REQUIRED'
    ? diyFacts.decision('NOT_APPLICABLE', ['DIY_NOT_APPROPRIATE_FOR_REGULATED_WORK_SCOPE'])
    : executionClass === 'DIY_ELIGIBLE'
      ? diyFacts.decision('APPLICABLE', ['DIY_APPROPRIATE_FOR_LOW_RISK_WORK_SCOPE'])
      : diyFacts.unknown(
        executionClass === 'PROFESSIONAL_REVIEW_RECOMMENDED'
          ? 'DIY_REQUIRES_SCOPE_AND_LOCAL_RULE_REVIEW'
          : 'WORK_SCOPE_UNKNOWN_FOR_EXECUTION_GUIDANCE',
      );

  return {
    renovationAdvisor,
    permitTracking,
    permitApplicability,
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
    professionalReview,
    diyExecution,
  };
}
