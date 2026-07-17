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
  | 'DO_NOTHING'
  | 'HOME_SAVINGS'
  | 'BUDGET_PLANNER'
  | 'TRUE_COST'
  | 'COST_GROWTH'
  | 'COST_VOLATILITY'
  | 'COST_EXPLAINER'
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
  DO_NOTHING: ['CORE', 'SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'COVERAGE', 'RISK', 'PROJECTS', 'FINANCIAL'],
  HOME_SAVINGS: ['CORE', 'LOCATION', 'SYSTEMS', 'COVERAGE', 'FINANCIAL'],
  BUDGET_PLANNER: ['CORE', 'LOCATION', 'SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'PROJECTS', 'FINANCIAL'],
  TRUE_COST: ['CORE', 'LOCATION', 'SYSTEMS', 'MAINTENANCE', 'COVERAGE', 'FINANCIAL'],
  COST_GROWTH: ['CORE', 'LOCATION', 'SYSTEMS', 'MAINTENANCE', 'COVERAGE', 'RISK', 'FINANCIAL'],
  COST_VOLATILITY: ['CORE', 'LOCATION', 'COVERAGE', 'RISK', 'FINANCIAL'],
  COST_EXPLAINER: ['CORE', 'LOCATION', 'SYSTEMS', 'MAINTENANCE', 'COVERAGE', 'RISK', 'FINANCIAL'],
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
  DO_NOTHING: ['core.propertyUse', 'core.occupancyStatus', 'inventory.items', 'maintenance.tasks', 'inspection.openFindings', 'coverage.insurancePolicies', 'risk.report', 'projects.activeProjects'],
  HOME_SAVINGS: ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode', 'systems.installedItemTypes', 'coverage.insurancePolicies', 'financial.financingProfile'],
  BUDGET_PLANNER: ['core.propertyUse', 'core.occupancyStatus', 'core.dwellingType', 'core.yearBuilt', 'location.state', 'location.zipCode', 'inventory.items', 'maintenance.tasks', 'financial.ownershipExpenseSummary'],
  TRUE_COST: ['core.propertyUse', 'core.occupancyStatus', 'core.dwellingType', 'location.state', 'location.zipCode', 'coverage.insurancePolicies', 'financial.financingProfile', 'financial.ownershipExpenseSummary'],
  COST_GROWTH: ['core.propertyUse', 'core.occupancyStatus', 'core.dwellingType', 'location.state', 'location.zipCode', 'coverage.insurancePolicies', 'risk.report', 'financial.financingProfile', 'financial.ownershipExpenseSummary'],
  COST_VOLATILITY: ['core.propertyUse', 'core.occupancyStatus', 'location.state', 'location.zipCode', 'coverage.insurancePolicies', 'risk.report', 'financial.ownershipExpenseSummary'],
  COST_EXPLAINER: ['core.propertyUse', 'core.occupancyStatus', 'core.dwellingType', 'location.state', 'location.zipCode', 'coverage.insurancePolicies', 'risk.report', 'financial.ownershipExpenseSummary'],
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
  DO_NOTHING: 'doNothingModeling',
  HOME_SAVINGS: 'homeSavingsModeling',
  BUDGET_PLANNER: 'budgetPlanning',
  TRUE_COST: 'ownershipCostModeling',
  COST_GROWTH: 'costGrowthModeling',
  COST_VOLATILITY: 'costVolatilityModeling',
  COST_EXPLAINER: 'costExplainerModeling',
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

export async function getCurrentFinancialContextEnvelope(
  propertyId: string,
  userId: string,
  feature: FinancialContextFeature,
  input: FinancialContextInput = {},
) {
  const context = await getFinancialContextDecisions(propertyId, userId, feature, input);
  const decision = context.decisions[PRIMARY_DECISION_BY_FEATURE[feature]];
  return {
    contextVersion: context.contextVersion,
    decision,
    relatedDecisions: context.decisions,
    generatedContextVersion: context.contextVersion,
    isStale: false,
    reconciliation: reconcileFinancialOutput(context.contextVersion, context.contextVersion, decision),
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
