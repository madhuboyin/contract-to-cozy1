import { getPropertyContext } from '../../modules/propertyContext';
import type { PropertyContextScope } from '../../modules/propertyContext';
import { evaluateProjectComplianceContext } from './applicabilityPolicy';
import { APIError } from '../../middleware/error.middleware';
import type { ProjectComplianceWorkInput } from './workScope';
import { reconcileProjectComplianceOutputs } from './reconciliation';

export type ProjectComplianceFeature =
  | 'AGGREGATE'
  | 'RENOVATION_ADVISOR'
  | 'PERMIT_TRACKER'
  | 'HOA_COMPLIANCE'
  | 'PROJECT_TRACKER'
  | 'MATERIAL_SPECS'
  | 'SERVICE_PRICE_RADAR'
  | 'QUOTE_COMPARISON'
  | 'PRICE_FINALIZATION'
  | 'NEGOTIATION_SHIELD'
  | 'PROVIDER_BOOKING';

export const PROJECT_COMPLIANCE_FEATURES: ProjectComplianceFeature[] = [
  'AGGREGATE', 'RENOVATION_ADVISOR', 'PERMIT_TRACKER', 'HOA_COMPLIANCE',
  'PROJECT_TRACKER', 'MATERIAL_SPECS', 'SERVICE_PRICE_RADAR', 'QUOTE_COMPARISON',
  'PRICE_FINALIZATION', 'NEGOTIATION_SHIELD', 'PROVIDER_BOOKING',
];

export const PROJECT_COMPLIANCE_FEATURE_SCOPES: Record<ProjectComplianceFeature, PropertyContextScope[]> = {
  AGGREGATE: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY', 'COMPLIANCE', 'PROJECTS'],
  RENOVATION_ADVISOR: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'COMPLIANCE', 'PROJECTS'],
  PERMIT_TRACKER: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'COMPLIANCE', 'PROJECTS'],
  HOA_COMPLIANCE: ['CORE', 'RESPONSIBILITY', 'COMPLIANCE', 'PROJECTS'],
  PROJECT_TRACKER: ['CORE', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY', 'COMPLIANCE', 'PROJECTS'],
  MATERIAL_SPECS: ['CORE', 'ROOMS', 'INVENTORY', 'PROJECTS'],
  SERVICE_PRICE_RADAR: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY', 'PROJECTS'],
  QUOTE_COMPARISON: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'PROJECTS'],
  PRICE_FINALIZATION: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'PROJECTS'],
  NEGOTIATION_SHIELD: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'COVERAGE', 'PROJECTS'],
  PROVIDER_BOOKING: ['CORE', 'LOCATION', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY', 'PROJECTS'],
};

export async function getProjectComplianceContextDecisions(
  propertyId: string,
  userId: string,
  feature: ProjectComplianceFeature = 'AGGREGATE',
  work?: ProjectComplianceWorkInput,
) {
  const context = await getPropertyContext(propertyId, { userId }, { scopes: PROJECT_COMPLIANCE_FEATURE_SCOPES[feature] });
  const decisions = evaluateProjectComplianceContext(context, work);
  return {
    contextVersion: context.contextVersion,
    feature,
    scopes: context.scopes,
    decisions,
    reconciliation: reconcileProjectComplianceOutputs(context, decisions),
  };
}

const PRIMARY_DECISION_BY_FEATURE = {
  AGGREGATE: 'projectTracking',
  RENOVATION_ADVISOR: 'renovationAdvisor',
  PERMIT_TRACKER: 'permitTracking',
  HOA_COMPLIANCE: 'hoaCompliance',
  PROJECT_TRACKER: 'projectTracking',
  MATERIAL_SPECS: 'materialSpecifications',
  SERVICE_PRICE_RADAR: 'localPriceBenchmarking',
  QUOTE_COMPARISON: 'quoteComparison',
  PRICE_FINALIZATION: 'priceFinalization',
  NEGOTIATION_SHIELD: 'negotiationShield',
  PROVIDER_BOOKING: 'providerBooking',
} as const;

export type ProjectComplianceDecisionKey = keyof ReturnType<typeof evaluateProjectComplianceContext>;

export async function getProjectComplianceEnvelope(
  propertyId: string,
  userId: string,
  feature: ProjectComplianceFeature,
  work?: ProjectComplianceWorkInput,
  generatedContextVersion?: string | null,
) {
  const context = await getProjectComplianceContextDecisions(propertyId, userId, feature, work);
  return {
    contextVersion: context.contextVersion,
    decision: context.decisions[PRIMARY_DECISION_BY_FEATURE[feature]],
    relatedDecisions: context.decisions,
    reconciliation: context.reconciliation,
    generatedContextVersion: generatedContextVersion ?? null,
    isStale: Boolean(
      generatedContextVersion && generatedContextVersion !== context.contextVersion,
    ),
  };
}

export async function assertProjectComplianceApplicable(
  propertyId: string,
  userId: string,
  feature: ProjectComplianceFeature,
  work: ProjectComplianceWorkInput,
  decisionKey: ProjectComplianceDecisionKey,
) {
  return assertProjectComplianceDecisionsApplicable(
    propertyId,
    userId,
    feature,
    work,
    [decisionKey],
  );
}

export async function assertProjectComplianceDecisionsApplicable(
  propertyId: string,
  userId: string,
  feature: ProjectComplianceFeature,
  work: ProjectComplianceWorkInput,
  decisionKeys: ProjectComplianceDecisionKey[],
) {
  const context = await getProjectComplianceContextDecisions(propertyId, userId, feature, work);
  const blocked = decisionKeys
    .map((key) => ({ key, decision: context.decisions[key] }))
    .find(({ decision }) => decision.status !== 'APPLICABLE');
  if (!blocked) return context;

  const { decision } = blocked;
  if (decision.status !== 'APPLICABLE') {
    const responsibilityConflict = decision.status === 'NOT_APPLICABLE' &&
      (blocked.key === 'ownerProjectExecution' || blocked.key === 'providerBooking');
    throw new APIError(
      decision.status === 'NOT_APPLICABLE'
        ? 'This action is not applicable to the current property and work context.'
        : 'Complete the required property context before starting this work.',
      409,
      responsibilityConflict
        ? 'WORK_RESPONSIBILITY_CONFLICT'
        : decision.status === 'NOT_APPLICABLE'
          ? 'PROPERTY_CONTEXT_NOT_APPLICABLE'
          : 'PROPERTY_CONTEXT_INCOMPLETE',
      { contextVersion: context.contextVersion, decision, decisionKey: blocked.key, feature },
    );
  }
  return context;
}
