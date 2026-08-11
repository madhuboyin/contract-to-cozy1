import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const SAVE_OPTIMIZE_CAPABILITIES = buildCapabilityDefinitions(([
  ['break-even', 'Break-Even', 'Estimate when the value of a decision offsets its cost.', '/dashboard/properties/[id]/tools/break-even', 'BREAK_EVEN', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['coverage-intelligence', 'Coverage & Premium Review', 'Review protection records, compare equivalent choices, and record a coverage decision.', '/dashboard/properties/[id]/tools/coverage-intelligence', 'COVERAGE_INTELLIGENCE', 'BETA', 'REGULATED_COVERAGE', 'CATALOG_ONLY'],
  ['financing', 'Financing Center', 'Review equity position and project payment options.', '/dashboard/properties/[id]/tools/financing', 'FINANCING', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['mortgage-refinance-radar', 'Mortgage Refinance Radar', 'Track potential mortgage optimization windows.', '/dashboard/properties/[id]/tools/mortgage-refinance-radar', 'MORTGAGE_REFINANCE_RADAR', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['ownership-costs', 'Ownership Costs', 'Understand what this home costs, what changed, what may change, and what to do next.', '/dashboard/properties/[id]/ownership-costs', 'OWNERSHIP_COSTS', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['property-tax', 'Property Tax Center', 'Verify property-tax facts and prepare jurisdiction-qualified next steps.', '/dashboard/properties/[id]/tools/property-tax', 'PROPERTY_TAX', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['savings-benefits', 'Savings and Benefits', 'Find rebates, credits, and recurring-cost savings for this home, verify what remains, and record a decision.', '/dashboard/properties/[id]/tools/savings-benefits', 'SAVINGS_BENEFITS', 'BETA', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['sell-hold-rent', 'Sell / Hold / Rent', 'Compare ownership paths and their tradeoffs.', '/dashboard/properties/[id]/tools/sell-hold-rent', 'SELL_HOLD_RENT', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
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
    id === 'coverage-intelligence' || id === 'mortgage-refinance-radar' || id === 'ownership-costs' || id === 'property-tax' || id === 'savings-benefits'
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
  ...(id === 'mortgage-refinance-radar' ? {
    version: 2,
    description:
      'Watch this mortgage for a refinance opportunity and compare the real tradeoffs.',
    homeownerOutcome:
      'Understand a property-specific refinance opportunity, review realistic alternatives, and record a homeowner-controlled decision.',
    expectedTimeToValue:
      'Passive monitoring; under one minute to understand an alert; comparison time varies.',
    livingHomeRecordReads: [
      'property-context',
      'financing-profile',
      'property-valuation',
      'property-liens',
      'mortgage-document',
      'refinance-scenario',
      'loan-estimate-comparison',
      'refinance-decision',
    ],
    livingHomeRecordWrites: [
      'financing-profile',
      'refinance-scenario',
      'loan-estimate-comparison',
      'refinance-decision',
      'refinance-outcome',
    ],
    acceptedContext: ['PROPERTY', 'HOME_ACTION', 'DOCUMENT', 'JOURNEY'] as const,
    triggerFamilies: [
      'REFINANCE_OPPORTUNITY_OPENED',
      'REFINANCE_OPPORTUNITY_UPDATED',
      'REFINANCE_DATA_REQUIRED',
    ],
    reasonTemplates: {
      REFINANCE_OPPORTUNITY_OPENED:
        'Current mortgage and benchmark-rate evidence indicate that a refinance comparison may be worthwhile.',
      REFINANCE_OPPORTUNITY_UPDATED:
        'A material change to the current refinance opportunity needs review.',
      REFINANCE_DATA_REQUIRED:
        'A meaningful rate change makes missing mortgage facts useful to correct.',
    },
    readinessRequirements: [{
      kind: 'KNOWN_FACTS' as const,
      minimum: 3,
      reason:
        'Mortgage status, current balance, interest rate, and remaining term determine whether a bounded refinance estimate is available; freshness is evaluated separately.',
    }],
    expectedOutput:
      'A property-specific opportunity conclusion, reviewed alternatives, and a recorded refinance decision; verified outcomes can update Financing.',
    completionSignal: 'refinance_decision_recorded',
    outputEntityTypes: ['REFINANCE_DECISION'] as const,
  } : {}),
  ...(id === 'sell-hold-rent' ? {
    intentAliases: [
      'should I sell hold or rent my home',
      'keep this property as a rental',
      'become a landlord or sell',
      'compare selling with renting out my house',
      'is now a good time to sell my house',
      'sell my property and rent instead',
      'move out and keep the property',
    ],
  } : {}),
  ...(id === 'ownership-costs' ? {
    version: 2,
    iconName: 'receipt' as const,
    intentAliases: [
      'ownership costs',
      'cost of owning my home',
      'monthly home expenses',
      'what changed in my home costs',
      'future ownership cost',
      'plan a home cost buffer',
      'true cost',
      'cost growth',
      'cost explainer',
      'cost volatility',
    ],
    navTarget: 'ownership-costs',
    homeownerOutcome:
      'Understand the current cost of owning this home, the evidence behind each category, verified changes, planning scenarios, and the next relevant action.',
    livingHomeRecordReads: [
      'property-context',
      'property-tax-record',
      'insurance-policy',
      'financing-profile',
      'expense',
      'utility-record',
      'hoa-record',
      'maintenance-record',
      'capital-timeline',
      'reserve-plan',
    ],
    livingHomeRecordWrites: [
      'ownership-cost-confirmation',
      'ownership-cost-scenario',
      'ownership-cost-decision',
    ],
    expectedOutput:
      'A versioned ownership-cost snapshot or a recorded homeowner cost decision with category-level evidence.',
    completionSignal: 'ownership_cost_decision_recorded',
    outputEntityTypes: ['OWNERSHIP_COST_DECISION'] as const,
  } : {}),
  mode,
})));
