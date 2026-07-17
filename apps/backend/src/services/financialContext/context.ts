import type { PropertyContextScope } from '../../modules/propertyContext';
import { getPropertyContext } from '../../modules/propertyContext';
import { APIError } from '../../middleware/error.middleware';
import { evaluateFinancialContext } from './applicabilityPolicy';

export type FinancialContextFeature =
  | 'AGGREGATE'
  | 'REPAIR_REPLACE'
  | 'CAPITAL_TIMELINE'
  | 'RESERVE_FUND'
  | 'OWNERSHIP_COSTS'
  | 'SELL_HOLD_RENT'
  | 'PROPERTY_TAX_VALUE'
  | 'REFINANCE_RADAR'
  | 'FINANCING_CENTER'
  | 'SAVINGS_OPPORTUNITIES';

export const FINANCIAL_FEATURE_SCOPES: Record<FinancialContextFeature, PropertyContextScope[]> = {
  AGGREGATE: ['CORE', 'LOCATION', 'SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'COVERAGE', 'RISK', 'COMPLIANCE', 'PROJECTS', 'FINANCIAL'],
  REPAIR_REPLACE: ['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'PROJECTS', 'FINANCIAL'],
  CAPITAL_TIMELINE: ['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'PROJECTS', 'FINANCIAL'],
  RESERVE_FUND: ['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'PROJECTS', 'FINANCIAL'],
  OWNERSHIP_COSTS: ['CORE', 'LOCATION', 'SYSTEMS', 'MAINTENANCE', 'RISK', 'PROJECTS', 'FINANCIAL'],
  SELL_HOLD_RENT: ['CORE', 'LOCATION', 'INSPECTION', 'COMPLIANCE', 'PROJECTS', 'FINANCIAL'],
  PROPERTY_TAX_VALUE: ['CORE', 'LOCATION', 'STRUCTURE', 'COMPLIANCE', 'PROJECTS', 'FINANCIAL'],
  REFINANCE_RADAR: ['CORE', 'PROJECTS', 'FINANCIAL'],
  FINANCING_CENTER: ['CORE', 'PROJECTS', 'FINANCIAL'],
  SAVINGS_OPPORTUNITIES: ['CORE', 'LOCATION', 'SYSTEMS', 'COVERAGE', 'FINANCIAL'],
};

export async function getFinancialContextDecisions(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature = 'AGGREGATE',
) {
  const context = await getPropertyContext(
    propertyId,
    { userId },
    { scopes: FINANCIAL_FEATURE_SCOPES[feature] },
  );
  return {
    contextVersion: context.contextVersion,
    feature,
    scopes: context.scopes,
    decisions: evaluateFinancialContext(context),
  };
}
const PRIMARY_DECISION_BY_FEATURE = {
  AGGREGATE: 'canonicalFinancingSource',
  REPAIR_REPLACE: 'capitalPlanning',
  CAPITAL_TIMELINE: 'capitalPlanning',
  RESERVE_FUND: 'reservePlanning',
  OWNERSHIP_COSTS: 'ownershipCostModeling',
  SELL_HOLD_RENT: 'mortgageModeling',
  PROPERTY_TAX_VALUE: 'canonicalFinancingSource',
  REFINANCE_RADAR: 'mortgageModeling',
  FINANCING_CENTER: 'canonicalFinancingSource',
  SAVINGS_OPPORTUNITIES: 'canonicalFinancingSource',
} as const;

export type FinancialDecisionKey = keyof ReturnType<typeof evaluateFinancialContext>;

export async function getFinancialContextEnvelope(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature,
  generatedContextVersion?: string | null,
) {
  const context = await getFinancialContextDecisions(propertyId, userId, feature);
  return {
    contextVersion: context.contextVersion,
    decision: context.decisions[PRIMARY_DECISION_BY_FEATURE[feature]],
    relatedDecisions: context.decisions,
    generatedContextVersion: generatedContextVersion ?? null,
    isStale: Boolean(generatedContextVersion && generatedContextVersion !== context.contextVersion),
  };
}

export async function assertFinancialContextApplicable(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature,
  decisionKey: FinancialDecisionKey,
) {
  const context = await getFinancialContextDecisions(propertyId, userId, feature);
  const decision = context.decisions[decisionKey];
  if (decision.status === 'APPLICABLE') return context;
  throw new APIError(
    'Complete the required financial context before running this calculation.',
    409,
    'PROPERTY_FINANCIAL_CONTEXT_INCOMPLETE',
    { contextVersion: context.contextVersion, decision, decisionKey, feature },
  );
}
