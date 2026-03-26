import { GuidanceJourneyTemplate, GuidanceStepSkipPolicy } from './guidanceTypes';

const templates: GuidanceJourneyTemplate[] = [
  // ── Asset Lifecycle ─────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'asset_lifecycle_resolution',
    journeyKey: 'journey_asset_lifecycle_resolution',
    signalIntentFamilies: ['lifecycle_end_or_past_life', 'maintenance_failure_risk'],
    issueDomain: 'ASSET_LIFECYCLE',
    defaultDecisionStage: 'DIAGNOSIS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'repair_replace_decision',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'repair_replace_decision',
        stepType: 'DECISION',
        label: 'Decide repair vs replace',
        description: 'Use existing repair and failure context to choose a durable path.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replace-repair',
        flowKey: 'replace-repair-analysis',
        routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair',
        skipPolicy: 'DISALLOWED',
      },
      // P1-6: Add cost framing before execution decision
      {
        stepOrder: 2,
        stepKey: 'estimate_cost_impact',
        stepType: 'DIAGNOSIS',
        label: 'Estimate cost of ownership vs replacement',
        description: 'Understand full cost context before committing to repair or replace.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'true-cost',
        flowKey: 'true-cost-ownership',
        routePath: '/dashboard/properties/:propertyId/tools/true-cost',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'check_coverage',
        stepType: 'VALIDATION',
        label: 'Check coverage and deductible exposure',
        description: 'Verify policy and warranty overlap before executing spend.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'validate_price',
        stepType: 'VALIDATION',
        label: 'Validate fair market price',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'service-price-radar',
        flowKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 5,
        stepKey: 'prepare_negotiation',
        stepType: 'VALIDATION',
        label: 'Prepare negotiation strategy',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'negotiation-shield',
        flowKey: 'negotiation-shield',
        routePath: '/dashboard/properties/:propertyId/tools/negotiation-shield',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 6,
        stepKey: 'book_service',
        stepType: 'EXECUTION',
        label: 'Book service execution',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        flowKey: 'booking',
        routePath: '/dashboard/bookings',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Coverage Gap ─────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'coverage_gap_resolution',
    journeyKey: 'journey_coverage_gap_resolution',
    signalIntentFamilies: ['coverage_gap', 'coverage_lapse_detected'],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'check_coverage',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'check_coverage',
        stepType: 'DIAGNOSIS',
        label: 'Review current coverage',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'estimate_uninsured_cost',
        stepType: 'DECISION',
        label: 'Estimate uninsured service cost',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'service-price-radar',
        flowKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'compare_coverage_options',
        stepType: 'DECISION',
        label: 'Compare policy and warranty options',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-options',
        flowKey: 'coverage-options',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-options',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'update_policy_or_documents',
        stepType: 'EXECUTION',
        label: 'Update policy or upload documents',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        flowKey: 'inventory-coverage',
        routePath: '/dashboard/properties/:propertyId/inventory/coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Recall Safety ─────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'recall_safety_resolution',
    journeyKey: 'journey_recall_safety_resolution',
    signalIntentFamilies: ['recall_detected'],
    issueDomain: 'SAFETY',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'READY',
    canonicalFirstStepKey: 'safety_alert',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'safety_alert',
        stepType: 'AWARENESS',
        label: 'Acknowledge safety alert',
        decisionStage: 'AWARENESS',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'recalls',
        flowKey: 'recall-alert',
        routePath: '/dashboard/properties/:propertyId/recalls',
        skipPolicy: 'DISALLOWED',
      },
      // P1-9: Check if recall service is covered before proceeding
      {
        stepOrder: 2,
        stepKey: 'check_recall_coverage',
        stepType: 'VALIDATION',
        label: 'Check if recall service is covered',
        description: 'Verify whether the recall remedy is covered under warranty or insurance.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'review_remedy_instructions',
        stepType: 'DIAGNOSIS',
        label: 'Review remedy instructions',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'recalls',
        flowKey: 'recall-remedy',
        routePath: '/dashboard/properties/:propertyId/recalls',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'recall_resolution',
        stepType: 'EXECUTION',
        label: 'Confirm recall outcome',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'recalls',
        flowKey: 'recall-resolution',
        routePath: '/dashboard/properties/:propertyId/recalls',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 5,
        stepKey: 'schedule_recall_service',
        stepType: 'EXECUTION',
        label: 'Schedule technician for recall remedy',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'booking',
        flowKey: 'booking',
        routePath: '/dashboard/providers?category=GENERAL',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Weather Risk ──────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'weather_risk_resolution',
    journeyKey: 'journey_weather_risk_resolution',
    // P1-3: Expanded beyond freeze_risk to cover all severe weather families
    signalIntentFamilies: [
      'freeze_risk',
      'flood_risk',
      'hurricane_risk',
      'wind_risk',
      'heat_risk',
      'wildfire_risk',
    ],
    issueDomain: 'WEATHER',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'weather_safety_check',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'weather_safety_check',
        stepType: 'AWARENESS',
        label: 'Review weather risk details',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'home-event-radar',
        flowKey: 'home-event-radar',
        routePath: '/dashboard/properties/:propertyId/tools/home-event-radar',
        skipPolicy: 'DISALLOWED',
      },
      // P1-9: Check if weather damage would be covered before spend
      {
        stepOrder: 2,
        stepKey: 'check_weather_coverage',
        stepType: 'VALIDATION',
        label: 'Check weather damage coverage',
        description: 'Verify whether weather-related damage is covered under current policy.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'protect_exposed_systems',
        stepType: 'DIAGNOSIS',
        label: 'Protect exposed systems',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'maintenance',
        flowKey: 'maintenance-weather-checklist',
        routePath: '/dashboard/maintenance?propertyId=:propertyId',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'schedule_weather_followup',
        stepType: 'EXECUTION',
        label: 'Schedule urgent weather follow-up',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'booking',
        flowKey: 'booking',
        // P3-21: propertyId added; category derived from signal family in resolveGuidanceStepHref
        routePath: '/dashboard/providers?propertyId=:propertyId',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Inspection Followup ───────────────────────────────────────────────────────
  {
    journeyTypeKey: 'inspection_followup_resolution',
    journeyKey: 'journey_inspection_followup_resolution',
    signalIntentFamilies: ['inspection_followup_needed'],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'DIAGNOSIS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'assess_urgency',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'assess_urgency',
        stepType: 'DIAGNOSIS',
        label: 'Assess urgency from inspection findings',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        flowKey: 'inspection-report-analysis',
        routePath: '/dashboard/inspection-report',
        skipPolicy: 'DISALLOWED',
      },
      // P1-5: Many inspection findings involve end-of-life equipment — ask repair vs replace
      {
        stepOrder: 2,
        stepKey: 'assess_repair_or_replace',
        stepType: 'DECISION',
        label: 'Assess repair vs replace for flagged items',
        description: 'If inspection flagged end-of-life equipment, determine whether to repair or replace.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'replace-repair',
        flowKey: 'replace-repair-analysis',
        routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair',
        skipPolicy: 'ALLOWED',
      },
      // P1-9: Check coverage before committing to spend
      {
        stepOrder: 3,
        stepKey: 'check_inspection_coverage',
        stepType: 'VALIDATION',
        label: 'Check coverage for flagged repairs',
        description: 'Verify whether inspection-flagged repair costs are covered under policy or warranty.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'estimate_repair_cost',
        stepType: 'DECISION',
        label: 'Estimate repair scope and cost',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'service-price-radar',
        flowKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'route_specialist',
        stepType: 'EXECUTION',
        label: 'Route to specialist and schedule',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        flowKey: 'booking',
        routePath: '/dashboard/bookings',
        skipPolicy: 'DISALLOWED',
      },
      // P1-4: Replaced home-event-radar (wrong tool) with passive guidance acknowledgment
      {
        stepOrder: 6,
        stepKey: 'track_resolution',
        stepType: 'TRACKING',
        label: 'Confirm repair completed',
        description: 'Mark this inspection finding as resolved once the repair is confirmed complete.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'guidance-overview',
        flowKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Financial Exposure ────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'financial_exposure_resolution',
    journeyKey: 'journey_financial_exposure_resolution',
    // P1-7: Removed cost_of_inaction_risk — it has its own template now
    signalIntentFamilies: ['financial_exposure'],
    issueDomain: 'FINANCIAL',
    defaultDecisionStage: 'DIAGNOSIS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'estimate_out_of_pocket_cost',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'estimate_out_of_pocket_cost',
        stepType: 'DIAGNOSIS',
        label: 'Estimate out-of-pocket cost',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'true-cost',
        flowKey: 'true-cost-ownership',
        routePath: '/dashboard/properties/:propertyId/tools/true-cost',
        skipPolicy: 'DISCOURAGED',
      },
      // P1-9: Check coverage to avoid unnecessary out-of-pocket spend
      {
        stepOrder: 2,
        stepKey: 'check_financial_coverage',
        stepType: 'VALIDATION',
        label: 'Check if costs are covered',
        description: 'Verify whether the financial exposure is partially covered by policy or warranty.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'compare_action_options',
        stepType: 'DECISION',
        label: 'Compare action vs delay',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'do-nothing-simulator',
        flowKey: 'do-nothing-simulator',
        routePath: '/dashboard/properties/:propertyId/tools/do-nothing',
        skipPolicy: 'DISCOURAGED',
      },
      // P1-8: Relabeled to reflect what home-savings actually does
      {
        stepOrder: 4,
        stepKey: 'evaluate_savings_funding',
        stepType: 'DECISION',
        label: 'Find savings to offset costs',
        description: 'Identify recurring household savings that could offset the financial exposure.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'home-savings',
        flowKey: 'home-savings',
        routePath: '/dashboard/properties/:propertyId/tools/home-savings',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'book_remediation_service',
        stepType: 'EXECUTION',
        label: 'Book remediation service',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        flowKey: 'booking',
        routePath: '/dashboard/providers',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 6,
        stepKey: 'route_financial_plan',
        stepType: 'TRACKING',
        label: 'Route to capital plan timeline',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'capital-timeline',
        flowKey: 'home-capital-timeline',
        routePath: '/dashboard/properties/:propertyId/tools/capital-timeline',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Financial Inaction ────────────────────────────────────────────────────────
  // P1-7: Separate template for cost_of_inaction_risk — do-nothing-simulator is primary
  {
    journeyTypeKey: 'financial_inaction_resolution',
    journeyKey: 'journey_financial_inaction_resolution',
    signalIntentFamilies: ['cost_of_inaction_risk'],
    issueDomain: 'FINANCIAL',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'model_cost_of_delay',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'model_cost_of_delay',
        stepType: 'AWARENESS',
        label: 'Model cost of delayed action',
        description: 'Understand how much inaction will cost over 6, 12, 24, and 36 months.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'do-nothing-simulator',
        flowKey: 'do-nothing-simulator',
        routePath: '/dashboard/properties/:propertyId/tools/do-nothing',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'estimate_total_cost',
        stepType: 'DIAGNOSIS',
        label: 'Estimate total cost of ownership',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'true-cost',
        flowKey: 'true-cost-ownership',
        routePath: '/dashboard/properties/:propertyId/tools/true-cost',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'check_inaction_coverage',
        stepType: 'VALIDATION',
        label: 'Check if exposure is covered',
        description: 'Verify whether the delayed risk is partially covered by insurance or warranty.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        flowKey: 'coverage-analysis',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'find_offset_savings',
        stepType: 'DECISION',
        label: 'Find savings to offset costs',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'home-savings',
        flowKey: 'home-savings',
        routePath: '/dashboard/properties/:propertyId/tools/home-savings',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 5,
        stepKey: 'take_action',
        stepType: 'EXECUTION',
        label: 'Book service to address the risk',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        flowKey: 'booking',
        routePath: '/dashboard/providers',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },
];

const templateByFamily = new Map<string, GuidanceJourneyTemplate>();
for (const template of templates) {
  for (const family of template.signalIntentFamilies) {
    templateByFamily.set(family, template);
  }
}

export const DEFAULT_TEMPLATE: GuidanceJourneyTemplate = {
  journeyTypeKey: 'generic_guidance_resolution',
  journeyKey: 'journey_generic_guidance_resolution',
  signalIntentFamilies: ['generic_actionable_signal'],
  issueDomain: 'OTHER',
  defaultDecisionStage: 'AWARENESS',
  defaultReadiness: 'UNKNOWN',
  canonicalFirstStepKey: 'review_signal',
  steps: [
    {
      stepOrder: 1,
      stepKey: 'review_signal',
      stepType: 'AWARENESS',
      label: 'Review guidance signal',
      decisionStage: 'AWARENESS',
      executionReadiness: 'UNKNOWN',
      isRequired: true,
      toolKey: 'guidance-overview',
      flowKey: 'guidance-overview',
      routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
      skipPolicy: 'DISCOURAGED',
    },
  ],
};

// Global fallback: maps toolKey → canonical stepKey when no journey context is available.
// P1-2: 'recalls' fixed from 'recall_resolution' to 'safety_alert' (canonical first step).
export const TOOL_DEFAULT_STEP_KEY: Record<string, string> = {
  'replace-repair': 'repair_replace_decision',
  'coverage-intelligence': 'check_coverage',
  recalls: 'safety_alert',
  booking: 'book_service',
  'home-event-radar': 'weather_safety_check',
  'inspection-report': 'assess_urgency',
  'service-price-radar': 'validate_price',
  'negotiation-shield': 'prepare_negotiation',
  'do-nothing-simulator': 'model_cost_of_delay',
  'home-savings': 'evaluate_savings_funding',
  'true-cost': 'estimate_out_of_pocket_cost',
  documents: 'update_policy_or_documents',
  'coverage-options': 'compare_coverage_options',
  'guidance-overview': 'review_signal',
  'capital-timeline': 'route_financial_plan',
};

// P1-1: Journey-aware step key overrides for tools that appear in multiple journeys
// under different step keys. getDefaultStepKey() checks this map first.
const JOURNEY_TOOL_STEP_KEY: Record<string, Record<string, string>> = {
  coverage_gap_resolution: {
    'service-price-radar': 'estimate_uninsured_cost',
  },
  recall_safety_resolution: {
    recalls: 'safety_alert',
    booking: 'schedule_recall_service',
  },
  weather_risk_resolution: {
    booking: 'schedule_weather_followup',
  },
  inspection_followup_resolution: {
    'service-price-radar': 'estimate_repair_cost',
    booking: 'route_specialist',
    'replace-repair': 'assess_repair_or_replace',
    'coverage-intelligence': 'check_inspection_coverage',
    'guidance-overview': 'track_resolution',
  },
  financial_exposure_resolution: {
    booking: 'book_remediation_service',
    'do-nothing-simulator': 'compare_action_options',
    'true-cost': 'estimate_out_of_pocket_cost',
    'coverage-intelligence': 'check_financial_coverage',
  },
  financial_inaction_resolution: {
    'do-nothing-simulator': 'model_cost_of_delay',
    'true-cost': 'estimate_total_cost',
    'coverage-intelligence': 'check_inaction_coverage',
    'home-savings': 'find_offset_savings',
    booking: 'take_action',
  },
  asset_lifecycle_resolution: {
    'true-cost': 'estimate_cost_impact',
    'coverage-intelligence': 'check_coverage',
    'service-price-radar': 'validate_price',
    booking: 'book_service',
  },
};

/**
 * P1-1: Journey-aware step key resolution.
 *
 * When recordToolCompletion is called with a toolKey, the correct stepKey
 * depends on which journey the completion is for. This function checks the
 * per-journey override map before falling back to the global default.
 *
 * @param toolKey - The tool that was completed (e.g. 'booking', 'recalls').
 * @param journeyTypeKey - The journey type the completion belongs to, if known.
 * @returns The resolved stepKey string, or null if no mapping exists.
 */
export function getDefaultStepKey(
  toolKey: string,
  journeyTypeKey?: string | null
): string | null {
  if (journeyTypeKey) {
    const journeyOverrides = JOURNEY_TOOL_STEP_KEY[journeyTypeKey];
    if (journeyOverrides?.[toolKey]) {
      return journeyOverrides[toolKey];
    }
  }
  return TOOL_DEFAULT_STEP_KEY[toolKey] ?? null;
}

export function getGuidanceTemplateBySignalFamily(signalIntentFamily?: string | null): GuidanceJourneyTemplate {
  if (!signalIntentFamily) return DEFAULT_TEMPLATE;
  return templateByFamily.get(signalIntentFamily) ?? DEFAULT_TEMPLATE;
}

export function listGuidanceTemplates(): GuidanceJourneyTemplate[] {
  return templates;
}

const stepSkipPolicyByJourney = new Map<string, Map<string, GuidanceStepSkipPolicy>>();
for (const template of [...templates, DEFAULT_TEMPLATE]) {
  const stepMap = new Map<string, GuidanceStepSkipPolicy>();
  for (const step of template.steps) {
    stepMap.set(step.stepKey, step.skipPolicy ?? (step.isRequired ? 'DISCOURAGED' : 'ALLOWED'));
  }
  stepSkipPolicyByJourney.set(template.journeyTypeKey, stepMap);
}

export function getStepSkipPolicy(
  journeyTypeKey: string | null | undefined,
  stepKey: string | null | undefined
): GuidanceStepSkipPolicy {
  if (!journeyTypeKey || !stepKey) return 'DISCOURAGED';
  const journeyPolicies = stepSkipPolicyByJourney.get(journeyTypeKey);
  if (!journeyPolicies) return 'DISCOURAGED';
  return journeyPolicies.get(stepKey) ?? 'DISCOURAGED';
}
