// apps/backend/src/homeRenovationAdvisor/engine/tax/taxRules.data.ts
//
// Static v1 tax impact heuristics.
// Median project costs, value uplift multipliers, and reassessment trigger defaults.
// Conservative national-level defaults — real data providers can replace these.

import {
  HomeRenovationType,
  PropertyTaxReassessmentTriggerType,
} from '@prisma/client';

// ============================================================================
// MEDIAN PROJECT COST BY RENOVATION TYPE (USD)
// Source: Home Advisor / Remodeling Magazine national averages (approximate)
// ============================================================================

export const MEDIAN_PROJECT_COST_BY_TYPE: Record<HomeRenovationType, { median: number; low: number; high: number }> = {
  ROOM_ADDITION:             { median: 55000,  low: 22000,  high: 130000 },
  BATHROOM_ADDITION:         { median: 30000,  low: 15000,  high: 75000  },
  BATHROOM_FULL_REMODEL:     { median: 15000,  low: 5000,   high: 40000  },
  GARAGE_CONVERSION:         { median: 25000,  low: 10000,  high: 60000  },
  BASEMENT_FINISHING:        { median: 35000,  low: 12000,  high: 80000  },
  ADU_CONSTRUCTION:          { median: 150000, low: 60000,  high: 350000 },
  DECK_ADDITION:             { median: 15000,  low: 5000,   high: 45000  },
  PATIO_MAJOR_ADDITION:      { median: 10000,  low: 3000,   high: 30000  },
  STRUCTURAL_WALL_REMOVAL:   { median: 8000,   low: 3000,   high: 20000  },
  STRUCTURAL_WALL_ADDITION:  { median: 6000,   low: 2500,   high: 15000  },
  ROOF_REPLACEMENT:          { median: 12000,  low: 5000,   high: 30000  },
  STRUCTURAL_REPAIR_MAJOR:   { median: 20000,  low: 5000,   high: 60000  },
};

// ============================================================================
// VALUE UPLIFT MULTIPLIER (% of project cost added to assessed value)
// These are conservative estimates. Actual uplift depends on jurisdiction and market.
// ============================================================================

export const VALUE_UPLIFT_MULTIPLIER_BY_TYPE: Record<HomeRenovationType, { min: number; max: number; label: string }> = {
  ROOM_ADDITION:            { min: 0.50, max: 0.80, label: 'Significant value addition typical for room additions' },
  BATHROOM_ADDITION:        { min: 0.55, max: 0.85, label: 'Bathroom additions often recoup 50–85% as value' },
  BATHROOM_FULL_REMODEL:    { min: 0.50, max: 0.70, label: 'Full bath remodels add moderate value' },
  GARAGE_CONVERSION:        { min: 0.40, max: 0.70, label: 'Conversion value depends heavily on use and market' },
  BASEMENT_FINISHING:       { min: 0.50, max: 0.75, label: 'Finished basements add substantial value in most markets' },
  ADU_CONSTRUCTION:         { min: 0.60, max: 0.90, label: 'ADUs can add near-full project value in high-demand areas' },
  DECK_ADDITION:            { min: 0.60, max: 0.80, label: 'Decks recoup a good portion of cost as assessed value' },
  PATIO_MAJOR_ADDITION:     { min: 0.40, max: 0.65, label: 'Patio improvements provide moderate value uplift' },
  STRUCTURAL_WALL_REMOVAL:  { min: 0.30, max: 0.60, label: 'Open-plan improvements add value but are hard to quantify' },
  STRUCTURAL_WALL_ADDITION: { min: 0.20, max: 0.50, label: 'Wall additions have limited direct value impact' },
  ROOF_REPLACEMENT:         { min: 0.60, max: 0.80, label: 'Roof replacement preserves value; some uplift possible' },
  STRUCTURAL_REPAIR_MAJOR:  { min: 0.30, max: 0.60, label: 'Major repairs preserve but may not increase value' },
};

// ============================================================================
// REASSESSMENT TRIGGER RULES (default by state — simplified)
// Real data from state tax codes — states marked as ON_PERMIT are common in
// states that trigger at permit-pull. NEXT_ASSESSMENT_CYCLE is the fallback.
// ============================================================================

export type StateTaxTriggerMap = Record<string, {
  triggerType: PropertyTaxReassessmentTriggerType;
  summary: string;
  ruleSummary: string;
}>;

export const STATE_TAX_TRIGGER_DEFAULTS: StateTaxTriggerMap = {
  CA: {
    triggerType: PropertyTaxReassessmentTriggerType.ON_COMPLETION,
    summary: 'California reassesses only the added portion of the improvement upon completion. Your base value is protected under Prop 13.',
    ruleSummary: 'California Prop 13 limits reassessment to the new construction addition, not the entire property.',
  },
  TX: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Texas reassesses property at the next annual appraisal cycle. Improvements may be noted upon permit or inspection.',
    ruleSummary: 'Texas county appraisal districts reassess annually. Major improvements are typically captured within 1–2 appraisal cycles.',
  },
  FL: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Florida reassesses at the next annual assessment. Save Our Homes cap limits increase for primary homesteads.',
    ruleSummary: 'Florida annual assessment captures permitted improvements. Homestead exemption caps annual increase for primary residences.',
  },
  NY: {
    triggerType: PropertyTaxReassessmentTriggerType.ON_PERMIT,
    summary: 'New York localities often trigger reassessment upon permit issuance. Rules vary significantly by municipality.',
    ruleSummary: 'NY local assessors may flag improvements upon permit. Reassessment timing is municipality-specific.',
  },
  WA: {
    triggerType: PropertyTaxReassessmentTriggerType.ON_PERMIT,
    summary: 'Washington reassesses upon permit in many counties. Annual inspection-based updates are common.',
    ruleSummary: 'Washington county assessors track permitted improvements and update assessed value accordingly.',
  },
  IL: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Illinois reassesses on a triennial cycle in Cook County (annual elsewhere). Improvements captured at next reassessment.',
    ruleSummary: 'Illinois assessment cycles vary by county. Major improvements are captured at next scheduled reassessment.',
  },
  AZ: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Arizona reassesses annually. Permitted improvements are captured in the following year\'s assessment.',
    ruleSummary: 'Arizona county assessors update values annually to reflect permitted improvements.',
  },
  CO: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Colorado reassesses on a biennial cycle. Improvements captured at next reassessment.',
    ruleSummary: 'Colorado biennial reassessment captures major improvements from permits.',
  },
  GA: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'Georgia reassesses annually. Improvements are captured in the next annual assessment.',
    ruleSummary: 'Georgia annual assessment captures permitted improvements.',
  },
  NC: {
    triggerType: PropertyTaxReassessmentTriggerType.NEXT_ASSESSMENT_CYCLE,
    summary: 'North Carolina reassesses on a schedule set by each county (typically every 4–8 years). Improvements may be captured earlier.',
    ruleSummary: 'NC county-driven reassessment schedule; improvements may be noted between cycles.',
  },
};

// Default fallback for states not in the map
export const DEFAULT_TAX_TRIGGER: StateTaxTriggerMap['string'] = {
  triggerType: PropertyTaxReassessmentTriggerType.JURISDICTION_SPECIFIC,
  summary: 'Property tax reassessment timing varies by jurisdiction. Contact your local assessor\'s office for specific rules.',
  ruleSummary: 'Reassessment rules are jurisdiction-specific. Expect assessment updates at some point after permit or completion.',
};

// Default millage rate assumption (national average, ~1.1% of assessed value/year)
export const DEFAULT_MILLAGE_RATE = 0.011;

// Version tag
export const TAX_RULES_VERSION = 'v1.0.0-internal';
