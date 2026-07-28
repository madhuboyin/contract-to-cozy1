import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const SAVE_OPTIMIZE_CAPABILITIES = buildCapabilityDefinitions(([
  ['break-even', 'Break-Even', 'Estimate when the value of a decision offsets its cost.', '/dashboard/properties/[id]/tools/break-even', 'BREAK_EVEN', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['cost-explainer', 'Cost Explainer', 'Explain the components behind home expenses.', '/dashboard/properties/[id]/tools/cost-explainer', 'COST_EXPLAINER', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['cost-growth', 'Cost Growth', 'Model long-term ownership cost trends.', '/dashboard/properties/[id]/tools/cost-growth', 'COST_GROWTH', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['cost-volatility', 'Volatility', 'Review variability in ownership costs.', '/dashboard/properties/[id]/tools/cost-volatility', 'COST_VOLATILITY', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['coverage-intelligence', 'Coverage & Premium Review', 'Review protection records, compare equivalent choices, and record a coverage decision.', '/dashboard/properties/[id]/tools/coverage-intelligence', 'COVERAGE_INTELLIGENCE', 'BETA', 'REGULATED_COVERAGE', 'CATALOG_ONLY'],
  ['financing', 'Financing Center', 'Review equity position and project payment options.', '/dashboard/properties/[id]/tools/financing', 'FINANCING', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['mortgage-refinance-radar', 'Mortgage Refinance Radar', 'Track potential mortgage optimization windows.', '/dashboard/properties/[id]/tools/mortgage-refinance-radar', 'MORTGAGE_REFINANCE_RADAR', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['property-tax', 'Property Tax Center', 'Verify property-tax facts and prepare jurisdiction-qualified next steps.', '/dashboard/properties/[id]/tools/property-tax', 'PROPERTY_TAX', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['savings-benefits', 'Savings and Benefits', 'Find rebates, credits, and recurring-cost savings for this home, verify what remains, and record a decision.', '/dashboard/properties/[id]/tools/savings-benefits', 'SAVINGS_BENEFITS', 'BETA', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['sell-hold-rent', 'Sell / Hold / Rent', 'Compare ownership paths and their tradeoffs.', '/dashboard/properties/[id]/tools/sell-hold-rent', 'SELL_HOLD_RENT', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['true-cost', 'True Cost', 'Review the full cost of owning this home.', '/dashboard/properties/[id]/tools/true-cost', 'TRUE_COST', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
] as const).map(([
  id,
  label,
  description,
  routeTemplate,
  rolloutKey,
  releaseStage,
  safetyTier,
  mode,
]) => ({
  id,
  label,
  description,
  routeTemplate,
  outcomeCategory:
    id === 'coverage-intelligence' ? 'DECIDE_COMPARE' as const : 'SAVE_OPTIMIZE' as const,
  rolloutKey,
  releaseStage,
  safetyTier,
  completionKind:
    id === 'coverage-intelligence' || id === 'property-tax' || id === 'savings-benefits'
      ? 'DECISION_RECORDED' as const
      : 'OUTPUT_GENERATED' as const,
  ...(id === 'property-tax' ? {
    version: 2,
    homeownerOutcome:
      'Verify the relevant property-tax facts and record a no-action, correction, exemption, review, or appeal decision.',
    expectedOutput:
      'A recorded property-tax decision or externally completed action grounded in verified jurisdiction rules.',
    completionSignal: 'property_tax_decision_or_external_action_recorded',
  } : {}),
  ...(id === 'savings-benefits' ? {
    homeownerOutcome:
      'Identify a reviewed opportunity relevant to this home, understand what remains to verify, and record a decision or completed external action.',
    expectedOutput:
      'A saved decision, application/switch state, or verified realized outcome tied to a reviewed source and current property context.',
    completionSignal: 'savings_benefit_decision_or_external_action_recorded',
  } : {}),
  mode,
})));
