import { GuidanceJourneyTemplate, GuidanceStepSkipPolicy } from './guidanceTypes';

const templates: GuidanceJourneyTemplate[] = [
  // ── Asset Lifecycle ─────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'asset_lifecycle_resolution',
    journeyKey: 'journey_asset_lifecycle_resolution',
    // FRD-FR-03/FR-04: bumped to 2.0.0 — verify_history inserted as step 1,
    // all prior steps shifted +1. Journeys created on v1.x will have stale
    // stepOrder values; templateVersion mismatch surfaces a staleness warning.
    version: '2.0.0',
    signalIntentFamilies: ['lifecycle_end_or_past_life', 'maintenance_failure_risk'],
    issueDomain: 'ASSET_LIFECYCLE',
    defaultDecisionStage: 'DIAGNOSIS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'verify_history',
    steps: [
      // FRD-FR-03/FR-04: Step 1 — Verify issue & capture 2-year service history.
      // Rendered inline inside GuidanceActionCard (toolKey: 'history-verify').
      // Three sub-sections:
      //   A) Symptom Picker  — dropdown driven by SYMPTOM_TYPES_BY_CATEGORY
      //   B) 2-Year Lookback — form shown when no HomeEvent found in last 24mo
      //   C) Visual Evidence — optional photo/video upload → GuidanceStepEvidence
      {
        stepOrder: 1,
        stepKey: 'verify_history',
        stepType: 'DIAGNOSIS',
        label: 'Verify issue & service history',
        description: 'Describe the symptom and review or add the last 2 years of service records so the engine can give accurate guidance.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'history-verify',
        // No routePath — rendered inline, does not navigate away
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 2,
        stepKey: 'repair_replace_decision',
        stepType: 'DECISION',
        label: 'Decide repair vs replace',
        description: 'Use existing repair and failure context to choose a durable path.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replace-repair',
        routePath: '/dashboard/properties/:propertyId/inventory/items/:itemId/replace-repair',
        // FRD-FR-07: may be auto-SKIPPED at journey creation for low-value assets
        // (purchaseCost < HIGH_VALUE_THRESHOLD). Skip policy set to ALLOWED to
        // support that path; the system skips it programmatically, not the user.
        skipPolicy: 'ALLOWED',
      },
      // P1-6: Add cost framing before execution decision
      {
        stepOrder: 3,
        stepKey: 'estimate_cost_impact',
        stepType: 'DIAGNOSIS',
        label: 'Estimate cost of ownership vs replacement',
        description: 'Understand full cost context before committing to repair or replace.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'true-cost',
        routePath: '/dashboard/properties/:propertyId/tools/true-cost',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'check_coverage',
        stepType: 'VALIDATION',
        label: 'Check coverage and deductible exposure',
        description: 'Verify policy and warranty overlap before executing spend.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 5,
        stepKey: 'validate_price',
        stepType: 'VALIDATION',
        label: 'Validate fair market price',
        description: 'Pull localized labor and parts ranges. NegotiationShield surfaces inline once a quote is entered.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 6,
        stepKey: 'compare_quotes',
        stepType: 'DECISION',
        label: 'Compare quotes side by side',
        description: 'Organize multiple vendor quotes before committing to a final offer.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'quote-comparison',
        routePath: '/dashboard/properties/:propertyId/tools/quote-comparison',
        skipPolicy: 'ALLOWED',
      },
      // FRD-FR-09: prepare_negotiation is now auto-completed inline by the
      // NegotiationShieldInline sub-component within the validate_price step.
      // Kept in the template as isRequired:false / skipPolicy:ALLOWED so existing
      // v1.x journeys that have it as a manual step continue to resolve correctly.
      {
        stepOrder: 7,
        stepKey: 'prepare_negotiation',
        stepType: 'VALIDATION',
        label: 'Prepare negotiation strategy',
        description: 'Scripts and leverage points to lower the final quote price.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'negotiation-shield',
        routePath: '/dashboard/properties/:propertyId/tools/negotiation-shield',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 8,
        stepKey: 'finalize_price',
        stepType: 'DECISION',
        label: 'Finalize accepted terms and price',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'price-finalization',
        routePath: '/dashboard/properties/:propertyId/tools/price-finalization',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 9,
        stepKey: 'book_service',
        stepType: 'EXECUTION',
        label: 'Book service execution',
        description: 'Select a provider. Asset ID and issue description are pre-populated.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&inventoryItemId=:inventoryItemId&issueDescription=:issueType',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Coverage Gap ─────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'coverage_gap_resolution',
    journeyKey: 'journey_coverage_gap_resolution',
    version: '1.1.0',
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
        routePath: '/dashboard/properties/:propertyId/inventory/coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Recall Safety ─────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'recall_safety_resolution',
    journeyKey: 'journey_recall_safety_resolution',
    version: '1.2.0',
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
        routePath: '/dashboard/providers?propertyId=:propertyId&category=GENERAL',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Weather Risk ──────────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'weather_risk_resolution',
    journeyKey: 'journey_weather_risk_resolution',
    version: '1.3.0',
    // S6-38: Covers all severe weather families; category derived per signal in resolveGuidanceStepHref
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
    version: '1.3.0',
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
        routePath: '/dashboard/inspection-report?propertyId=:propertyId',
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
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'compare_quotes',
        stepType: 'DECISION',
        label: 'Compare quote options',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'quote-comparison',
        routePath: '/dashboard/properties/:propertyId/tools/quote-comparison',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 6,
        stepKey: 'finalize_price',
        stepType: 'DECISION',
        label: 'Finalize accepted quote terms',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'price-finalization',
        routePath: '/dashboard/properties/:propertyId/tools/price-finalization',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 7,
        stepKey: 'route_specialist',
        stepType: 'EXECUTION',
        label: 'Route to specialist and schedule',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId',
        skipPolicy: 'DISALLOWED',
      },
      // P1-4: Replaced home-event-radar (wrong tool) with passive guidance acknowledgment
      {
        stepOrder: 8,
        stepKey: 'track_resolution',
        stepType: 'TRACKING',
        label: 'Confirm repair completed',
        description: 'Mark this inspection finding as resolved once the repair is confirmed complete.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Financial Exposure ────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'financial_exposure_resolution',
    journeyKey: 'journey_financial_exposure_resolution',
    version: '1.2.0',
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
        routePath: '/dashboard/providers?propertyId=:propertyId',
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
    version: '1.1.0',
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
        routePath: '/dashboard/providers?propertyId=:propertyId',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Compliance Resolution ─────────────────────────────────────────────────────
  // S6-37: New template for permit/HOA/safety-inspection compliance signals.
  // CLAIMS, PRICING, NEGOTIATION, BOOKING, DOCUMENTATION, NEIGHBORHOOD,
  // ONBOARDING, MARKET_VALUE — formally out of scope for journey templates;
  // signals in those domains route to DEFAULT_TEMPLATE.
  {
    journeyTypeKey: 'compliance_resolution',
    journeyKey: 'journey_compliance_resolution',
    version: '1.0.0',
    signalIntentFamilies: ['permit_required', 'hoa_violation_detected', 'safety_inspection_due'],
    issueDomain: 'COMPLIANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_compliance_requirement',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_compliance_requirement',
        stepType: 'AWARENESS',
        label: 'Review compliance requirement',
        description: 'Understand what is required and the deadline or consequence for non-compliance.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'check_compliance_coverage',
        stepType: 'VALIDATION',
        label: 'Check if remediation costs are covered',
        description: 'Verify whether fines, inspections, or required work are covered under policy or warranty.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'complete_compliance_task',
        stepType: 'DECISION',
        label: 'Complete required compliance tasks',
        description: 'Work through the maintenance checklist to address the compliance items.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'maintenance',
        routePath: '/dashboard/maintenance?propertyId=:propertyId',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'schedule_compliance_service',
        stepType: 'EXECUTION',
        label: 'Schedule inspection or remediation service',
        description: 'Book a licensed contractor or inspector to resolve the compliance requirement.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Energy Efficiency ─────────────────────────────────────────────────────────
  // S6-37: New template for energy inefficiency and high utility cost signals.
  {
    journeyTypeKey: 'energy_efficiency_resolution',
    journeyKey: 'journey_energy_efficiency_resolution',
    version: '1.0.0',
    signalIntentFamilies: ['energy_inefficiency_detected', 'high_utility_cost'],
    issueDomain: 'ENERGY',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_energy_signal',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_energy_signal',
        stepType: 'AWARENESS',
        label: 'Review energy inefficiency signal',
        description: 'Understand the source of elevated energy use or utility costs.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'home-event-radar',
        routePath: '/dashboard/properties/:propertyId/tools/home-event-radar',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'find_energy_savings',
        stepType: 'DECISION',
        label: 'Identify savings to fund improvements',
        description: 'Find recurring household overpayments that could be redirected to energy upgrades.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'home-savings',
        routePath: '/dashboard/properties/:propertyId/tools/home-savings',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'estimate_improvement_cost',
        stepType: 'DIAGNOSIS',
        label: 'Estimate contractor cost for upgrades',
        description: 'Get a fair-market price check before committing to energy improvement work.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'plan_capital_improvements',
        stepType: 'DECISION',
        label: 'Plan energy improvements on capital timeline',
        description: 'Schedule energy upgrades alongside other planned capital expenditures.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'capital-timeline',
        routePath: '/dashboard/properties/:propertyId/tools/capital-timeline',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 5,
        stepKey: 'book_energy_service',
        stepType: 'EXECUTION',
        label: 'Book energy improvement service',
        description: 'Schedule a contractor to perform the energy upgrade or audit.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Warranty Purchase (SERVICE) ───────────────────────────────────────────
  {
    journeyTypeKey: 'warranty_purchase_journey',
    journeyKey: 'journey_warranty_purchase',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_warranty_options',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_warranty_options',
        stepType: 'AWARENESS',
        label: 'Review warranty options',
        description: 'Understand what home warranty plans are available and what they cover.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'compare_warranty_plans',
        stepType: 'DECISION',
        label: 'Compare warranty plans',
        description: 'Evaluate coverage limits, deductibles, and provider reputation side by side.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-options',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-options',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'select_and_purchase_warranty',
        stepType: 'EXECUTION',
        label: 'Select and purchase a plan',
        description: 'Commit to the chosen warranty plan and complete the purchase.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'coverage-options',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-options',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'confirm_warranty_coverage',
        stepType: 'TRACKING',
        label: 'Confirm coverage is active',
        description: 'Upload proof of purchase and confirm the new warranty is on file.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory/coverage',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Insurance Purchase (SERVICE) ──────────────────────────────────────────
  {
    journeyTypeKey: 'insurance_purchase_journey',
    journeyKey: 'journey_insurance_purchase',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'assess_coverage_need',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'assess_coverage_need',
        stepType: 'AWARENESS',
        label: 'Assess your coverage need',
        description: 'Identify which systems or events are currently unprotected.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'compare_insurance_policies',
        stepType: 'DECISION',
        label: 'Compare policy options',
        description: 'Evaluate coverage types, deductibles, and premiums.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-options',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-options',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'select_insurance_provider',
        stepType: 'DECISION',
        label: 'Select a provider',
        description: 'Choose a licensed insurer and confirm premium and deductible.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-options',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-options',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'bind_policy',
        stepType: 'EXECUTION',
        label: 'Bind the policy',
        description: 'Complete the application and bind the selected insurance policy.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory/coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── General Inspection (SERVICE) ──────────────────────────────────────────
  {
    journeyTypeKey: 'general_inspection_journey',
    journeyKey: 'journey_general_inspection',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'schedule_inspection',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'schedule_inspection',
        stepType: 'AWARENESS',
        label: 'Schedule inspection',
        description: 'Book a licensed inspector for the date and scope you need.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=INSPECTION',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'prepare_property_access',
        stepType: 'DIAGNOSIS',
        label: 'Prepare property access',
        description: 'Ensure access to all areas the inspector needs to evaluate.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'review_inspection_report',
        stepType: 'DECISION',
        label: 'Review inspection report',
        description: 'Go through the inspector\'s findings and flag any items requiring action.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        routePath: '/dashboard/inspection-report?propertyId=:propertyId',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'act_on_inspection_findings',
        stepType: 'EXECUTION',
        label: 'Act on findings',
        description: 'Create follow-up actions for any flagged items from the inspection.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Cleaning Service (SERVICE) ─────────────────────────────────────────────
  {
    journeyTypeKey: 'cleaning_service_journey',
    journeyKey: 'journey_cleaning_service',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'select_cleaning_type',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'select_cleaning_type',
        stepType: 'AWARENESS',
        label: 'Select cleaning service type',
        description: 'Choose between standard, deep clean, move-in/out, or specialty cleaning.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'get_cleaning_quotes',
        stepType: 'DECISION',
        label: 'Get quotes from cleaning providers',
        description: 'Request at least two quotes for the selected cleaning type.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'service-price-radar',
        routePath: '/dashboard/properties/:propertyId/tools/service-price-radar',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'book_cleaning_provider',
        stepType: 'EXECUTION',
        label: 'Book cleaning provider',
        description: 'Schedule the selected provider for the desired date and time.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=CLEANING',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'confirm_cleaning_complete',
        stepType: 'TRACKING',
        label: 'Confirm service completed',
        description: 'Mark the cleaning job as done once the provider has finished.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
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
  version: '1.1.0',
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
  'quote-comparison': 'compare_quotes',
  'price-finalization': 'finalize_price',
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
    'quote-comparison': 'compare_quotes',
    'price-finalization': 'finalize_price',
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
    'quote-comparison': 'compare_quotes',
    'negotiation-shield': 'prepare_negotiation',
    'price-finalization': 'finalize_price',
    booking: 'book_service',
  },
  // S6-37: New journey overrides
  compliance_resolution: {
    'coverage-intelligence': 'check_compliance_coverage',
    maintenance: 'complete_compliance_task',
    booking: 'schedule_compliance_service',
    'guidance-overview': 'review_compliance_requirement',
  },
  energy_efficiency_resolution: {
    'home-savings': 'find_energy_savings',
    'service-price-radar': 'estimate_improvement_cost',
    'capital-timeline': 'plan_capital_improvements',
    booking: 'book_energy_service',
    'home-event-radar': 'review_energy_signal',
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

// Maps user-facing issue types to journey template keys.
// Used by createUserInitiatedJourney() to route to the correct template.
const ISSUE_TYPE_TO_TEMPLATE_KEY: Record<string, string> = {
  // Asset lifecycle / maintenance issues
  'not_working':               'asset_lifecycle_resolution',
  'not_cooling':               'asset_lifecycle_resolution',
  'not_heating':               'asset_lifecycle_resolution',
  'past_life':                 'asset_lifecycle_resolution',
  'aging':                     'asset_lifecycle_resolution',
  'broken':                    'asset_lifecycle_resolution',
  'maintenance_needed':        'inspection_followup_resolution',
  'inspection_needed':         'general_inspection_journey',
  // Coverage / financial issues
  'coverage_question':         'coverage_gap_resolution',
  'cost_estimate':             'financial_exposure_resolution',
  // Leak / water damage — asset lifecycle path
  'leak':                      'asset_lifecycle_resolution',
  'water_damage':              'asset_lifecycle_resolution',
  // SERVICE scope issue types
  'purchase_warranty':         'warranty_purchase_journey',
  'purchase_insurance':        'insurance_purchase_journey',
  'schedule_inspection':       'general_inspection_journey',
  'arrange_cleaning':          'cleaning_service_journey',
  'get_quotes':                'financial_exposure_resolution',
};

/**
 * Resolves the best journey template for a user-initiated journey given
 * the issue type and scope category. Falls back to the generic resolution
 * template when no specific mapping exists.
 */
export function getTemplateByIssueType(
  issueType: string,
  scopeCategory: string
): GuidanceJourneyTemplate {
  const normalised = issueType.trim().toLowerCase().replace(/\s+/g, '_');
  const templateKey = ISSUE_TYPE_TO_TEMPLATE_KEY[normalised];
  if (templateKey) {
    const found = templates.find((t) => t.journeyTypeKey === templateKey);
    if (found) return found;
  }
  // SERVICE scope with no specific mapping → warranty purchase as generic service journey
  if (scopeCategory === 'SERVICE') {
    return templates.find((t) => t.journeyTypeKey === 'warranty_purchase_journey') ?? DEFAULT_TEMPLATE;
  }
  // ITEM scope with no specific mapping → asset lifecycle as generic item journey
  return templates.find((t) => t.journeyTypeKey === 'asset_lifecycle_resolution') ?? DEFAULT_TEMPLATE;
}

// List of suggested issue types returned by GET /guidance/issue-types
export const SUGGESTED_ISSUE_TYPES_ITEM = [
  { key: 'not_working',      label: 'Not working properly' },
  { key: 'not_cooling',      label: 'Not cooling' },
  { key: 'not_heating',      label: 'Not heating' },
  { key: 'leak',             label: 'Leaking or water damage' },
  { key: 'past_life',        label: 'Aging or past expected life' },
  { key: 'broken',           label: 'Broken or damaged' },
  { key: 'inspection_needed',label: 'Needs inspection or maintenance' },
  { key: 'coverage_question',label: 'Coverage or warranty question' },
  { key: 'cost_estimate',    label: 'Need a cost estimate' },
] as const;

export const SUGGESTED_ISSUE_TYPES_SERVICE = [
  { key: 'purchase_warranty',    label: 'Purchase or find a home warranty' },
  { key: 'purchase_insurance',   label: 'Purchase or review home insurance' },
  { key: 'schedule_inspection',  label: 'Schedule a home inspection' },
  { key: 'arrange_cleaning',     label: 'Arrange a cleaning service' },
  { key: 'get_quotes',           label: 'Get quotes and compare options' },
] as const;

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

// ---------------------------------------------------------------------------
// FRD-FR-04: Asset-category-specific symptom pickers for the verify_history step.
// Keys match InventoryItemCategory enum values from the Prisma schema.
// The DEFAULT bucket is used when the item category has no dedicated list.
// ---------------------------------------------------------------------------

export type SymptomTypeOption = { key: string; label: string };

export const SYMPTOM_TYPES_BY_CATEGORY: Record<string, SymptomTypeOption[]> = {
  APPLIANCE: [
    { key: 'not_working',        label: 'Not working / won\'t turn on' },
    { key: 'not_cooling',        label: 'Not cooling properly' },
    { key: 'not_heating',        label: 'Not heating properly' },
    { key: 'leak',               label: 'Leaking water' },
    { key: 'unusual_noise',      label: 'Making unusual noise' },
    { key: 'error_code',         label: 'Showing error code or fault light' },
    { key: 'broken_part',        label: 'Broken or damaged part' },
    { key: 'past_life',          label: 'Aging or past expected life' },
    { key: 'inspection_needed',  label: 'Needs inspection or maintenance' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  HVAC: [
    { key: 'not_cooling',        label: 'Not cooling' },
    { key: 'not_heating',        label: 'Not heating' },
    { key: 'poor_airflow',       label: 'Poor airflow or weak output' },
    { key: 'unusual_noise',      label: 'Loud or unusual noise' },
    { key: 'short_cycling',      label: 'Turning on and off repeatedly' },
    { key: 'refrigerant_issue',  label: 'Possible refrigerant / freon issue' },
    { key: 'thermostat_issue',   label: 'Thermostat not responding correctly' },
    { key: 'filter_clog',        label: 'Filter clogged or overdue for replacement' },
    { key: 'past_life',          label: 'Aging or past expected life' },
    { key: 'inspection_needed',  label: 'Annual maintenance or tune-up needed' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  PLUMBING: [
    { key: 'leak',               label: 'Leak or drip' },
    { key: 'low_pressure',       label: 'Low water pressure' },
    { key: 'no_hot_water',       label: 'No hot water' },
    { key: 'drain_slow',         label: 'Slow or blocked drain' },
    { key: 'pipe_noise',         label: 'Banging or rattling pipes' },
    { key: 'water_discoloration',label: 'Discolored or smelly water' },
    { key: 'past_life',          label: 'Aging pipes or fixtures' },
    { key: 'inspection_needed',  label: 'Needs inspection or maintenance' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  ELECTRICAL: [
    { key: 'no_power',           label: 'No power to outlet or circuit' },
    { key: 'breaker_tripping',   label: 'Breaker keeps tripping' },
    { key: 'flickering_lights',  label: 'Flickering or dimming lights' },
    { key: 'burning_smell',      label: 'Burning smell or warm outlet' },
    { key: 'gfci_tripping',      label: 'GFCI outlet keeps tripping' },
    { key: 'panel_upgrade',      label: 'Panel upgrade or capacity concern' },
    { key: 'past_life',          label: 'Aging wiring or panel' },
    { key: 'inspection_needed',  label: 'Needs inspection or code compliance check' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  ROOF_EXTERIOR: [
    { key: 'leak',               label: 'Leak or water intrusion' },
    { key: 'missing_shingles',   label: 'Missing or damaged shingles' },
    { key: 'gutter_issue',       label: 'Gutter blockage or damage' },
    { key: 'storm_damage',       label: 'Storm or hail damage' },
    { key: 'moss_algae',         label: 'Moss or algae growth' },
    { key: 'past_life',          label: 'Aging or past expected life' },
    { key: 'inspection_needed',  label: 'Needs inspection or assessment' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  SAFETY: [
    { key: 'not_working',        label: 'Device not functioning' },
    { key: 'battery_low',        label: 'Low battery or chirping' },
    { key: 'false_alarm',        label: 'Frequent false alarms' },
    { key: 'past_life',          label: 'Past replacement date' },
    { key: 'inspection_needed',  label: 'Needs testing or inspection' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  SMART_HOME: [
    { key: 'not_working',        label: 'Device offline or unresponsive' },
    { key: 'connectivity_issue', label: 'Wi-Fi or connectivity problem' },
    { key: 'app_issue',          label: 'App or integration not working' },
    { key: 'broken_part',        label: 'Physical damage' },
    { key: 'past_life',          label: 'Past expected life' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  // Fallback for FURNITURE, ELECTRONICS, OTHER, and any unmapped category
  DEFAULT: [
    { key: 'not_working',        label: 'Not working properly' },
    { key: 'not_cooling',        label: 'Not cooling' },
    { key: 'not_heating',        label: 'Not heating' },
    { key: 'leak',               label: 'Leaking or water damage' },
    { key: 'past_life',          label: 'Aging or past expected life' },
    { key: 'broken',             label: 'Broken or damaged' },
    { key: 'inspection_needed',  label: 'Needs inspection or maintenance' },
    { key: 'coverage_question',  label: 'Coverage or warranty question' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
};

/**
 * Returns the symptom type list for a given InventoryItemCategory.
 * Falls back to DEFAULT if the category has no dedicated list.
 */
export function getSymptomTypesForCategory(category: string | null | undefined): SymptomTypeOption[] {
  if (!category) return SYMPTOM_TYPES_BY_CATEGORY.DEFAULT;
  return SYMPTOM_TYPES_BY_CATEGORY[category] ?? SYMPTOM_TYPES_BY_CATEGORY.DEFAULT;
}
