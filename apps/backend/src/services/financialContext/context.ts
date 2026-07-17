import { createHash } from 'node:crypto';
import type { PropertyContextScope } from '../../modules/propertyContext';
import { getPropertyContext } from '../../modules/propertyContext';
import { APIError } from '../../middleware/error.middleware';
import { evaluateFinancialContext, type FinancialContextInput } from './applicabilityPolicy';
import { reconcileFinancialOutput } from './reconciliation';

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

const FINANCIAL_FEATURE_FACT_KEYS: Record<FinancialContextFeature, string[]> = {
  AGGREGATE: [],
  REPAIR_REPLACE: ['inventory.items', 'maintenance.tasks', 'inspection.openFindings', 'projects.activeProjects'],
  CAPITAL_TIMELINE: ['inventory.items', 'maintenance.tasks', 'inspection.openFindings', 'projects.activeProjects'],
  RESERVE_FUND: ['financial.upcomingCapitalExposure', 'financial.reserveFund'],
  OWNERSHIP_COSTS: ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode', 'financial.financingProfile', 'financial.ownershipExpenseSummary'],
  SELL_HOLD_RENT: ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode', 'financial.currentMortgage', 'financial.latestEquity'],
  PROPERTY_TAX_VALUE: ['core.dwellingType', 'core.propertySizeSqFt', 'location.state', 'location.zipCode', 'financial.financingProfile'],
  REFINANCE_RADAR: ['financial.currentMortgage', 'financial.latestEquity'],
  FINANCING_CENTER: ['financial.financingProfile', 'financial.currentMortgage', 'financial.latestEquity'],
  SAVINGS_OPPORTUNITIES: ['core.propertyUse', 'location.state', 'location.zipCode', 'systems.installedItemTypes', 'coverage.insurancePolicies', 'financial.financingProfile'],
};

function featureContextVersion(
  propertyId: string,
  feature: FinancialContextFeature,
  facts: Record<string, unknown>,
): string {
  const configuredKeys = FINANCIAL_FEATURE_FACT_KEYS[feature];
  const keys = configuredKeys.length > 0 ? [...configuredKeys] : Object.keys(facts);
  const selectedFacts = keys.sort().map((key) => [key, facts[key] ?? null]);
  return createHash('sha256')
    .update(JSON.stringify({ propertyId, feature, facts: selectedFacts }))
    .digest('hex');
}

export async function getFinancialContextDecisions(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature = 'AGGREGATE',
  input: FinancialContextInput = {},
) {
  const context = await getPropertyContext(
    propertyId,
    { userId },
    { scopes: FINANCIAL_FEATURE_SCOPES[feature] },
  );
  return {
    contextVersion: featureContextVersion(propertyId, feature, context.facts),
    feature,
    scopes: context.scopes,
    decisions: evaluateFinancialContext(context, input),
  };
}
const PRIMARY_DECISION_BY_FEATURE = {
  AGGREGATE: 'canonicalFinancingSource',
  REPAIR_REPLACE: 'repairReplace',
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
  input: FinancialContextInput = {},
) {
  const context = await getFinancialContextDecisions(propertyId, userId, feature, input);
  const decision = context.decisions[PRIMARY_DECISION_BY_FEATURE[feature]];
  return {
    contextVersion: context.contextVersion,
    decision,
    relatedDecisions: context.decisions,
    generatedContextVersion: generatedContextVersion ?? null,
    isStale: Boolean(generatedContextVersion && generatedContextVersion !== context.contextVersion),
    reconciliation: reconcileFinancialOutput(
      context.contextVersion,
      generatedContextVersion,
      decision,
    ),
  };
}

export async function assertFinancialContextApplicable(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature,
  decisionKey: FinancialDecisionKey,
  input: FinancialContextInput = {},
) {
  const context = await getFinancialContextDecisions(propertyId, userId, feature, input);
  const decision = context.decisions[decisionKey];
  if (decision.status === 'APPLICABLE') return context;
  throw new APIError(
    'Complete the required financial context before running this calculation.',
    409,
    'PROPERTY_FINANCIAL_CONTEXT_INCOMPLETE',
    { contextVersion: context.contextVersion, decision, decisionKey, feature },
  );
}
