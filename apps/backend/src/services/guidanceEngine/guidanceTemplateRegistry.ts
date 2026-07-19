import { GuidanceJourneyTemplate, GuidanceJourneyTemplateDefinition, GuidanceStepSkipPolicy } from './guidanceTypes';
import { applyGuidanceGovernance } from './guidanceGovernance.catalog';

const templateDefinitions: GuidanceJourneyTemplateDefinition[] = [
  // ── Asset Lifecycle ─────────────────────────────────────────────────────────
  {
    journeyTypeKey: 'asset_lifecycle_resolution',
    journeyKey: 'journey_asset_lifecycle_resolution',
    // FRD-FR-03/FR-04: bumped to 2.0.0 — verify_history inserted as step 1,
    // all prior steps shifted +1. Journeys created on v1.x will have stale
    // stepOrder values; templateVersion mismatch surfaces a staleness warning.
    // 2.1.0: removed estimate_cost_impact (stepOrder 3). The repair/replace cost
    // analysis is fully covered inline by RepairReplaceGate in step 2. Routing
    // to the property-level true-cost page was context-inappropriate for an
    // item-scoped issue journey. Steps formerly at 4–9 renumbered to 3–8.
    // 3.0.0: Phase 3 extends the major repair/replacement journey through
    // execution, verified closure, Living Home Record updates, and future care.
    version: '3.0.0',
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
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
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
        stepOrder: 5,
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
        stepOrder: 6,
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
        stepOrder: 7,
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
        stepOrder: 8,
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
      {
        stepOrder: 9,
        stepKey: 'confirm_scope_and_provider',
        stepType: 'EXECUTION',
        label: 'Confirm scope and execution path',
        description: 'Confirm repair or replacement, provider or DIY execution, coverage posture, price, and project complexity before work starts.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'project-tracker',
        routePath: '/dashboard/properties/:propertyId/projects/new',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 10,
        stepKey: 'track_work',
        stepType: 'TRACKING',
        label: 'Track work and exceptions',
        description: 'Track milestones, changes, payments, delays, photos, and issues in the linked project.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: true,
        toolKey: 'project-tracker',
        routePath: '/dashboard/properties/:propertyId/projects',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 11,
        stepKey: 'verify_outcome',
        stepType: 'VALIDATION',
        label: 'Verify the outcome',
        description: 'Confirm operation, commissioning, safety checks, required inspections, and unresolved exceptions.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'project-completion',
        routePath: '/dashboard/properties/:propertyId/projects',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 12,
        stepKey: 'capture_proof',
        stepType: 'VALIDATION',
        label: 'Capture completion proof',
        description: 'Capture invoice, warranty, model or serial, permits, photos, provider result, actual cost, and work date.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'project-completion',
        routePath: '/dashboard/properties/:propertyId/projects',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 13,
        stepKey: 'update_home_record',
        stepType: 'TRACKING',
        label: 'Update the Home Record',
        description: 'Write verified condition, service history, install date, replacement cost, coverage, documents, and HomeEvent updates.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: true,
        toolKey: 'project-completion',
        routePath: '/dashboard/properties/:propertyId/projects',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 14,
        stepKey: 'set_future_care',
        stepType: 'TRACKING',
        label: 'Set future care',
        description: 'Reset maintenance, set inspections and warranty deadlines, update replacement horizon, and schedule follow-up.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: true,
        toolKey: 'project-completion',
        routePath: '/dashboard/properties/:propertyId/projects',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Replacement Purchase Now ───────────────────────────────────────────────
  {
    journeyTypeKey: 'replacement_purchase_now',
    journeyKey: 'journey_replacement_purchase_now',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'ASSET_LIFECYCLE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'confirm_replacement_path',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'confirm_replacement_path',
        stepType: 'DECISION',
        label: 'Confirm replacement path',
        description: 'Lock in the decision to replace before comparing purchase options.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'frontend',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'check_replacement_coverage',
        stepType: 'VALIDATION',
        label: 'Check replacement coverage and rebates',
        description: 'Review warranty, coverage, rebate, and financing options that could lower replacement cost.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'set_replacement_priorities',
        stepType: 'DECISION',
        label: 'Set your priorities',
        description: 'Tell us your budget and what matters most so recommendations match your situation.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'replacement-priorities-capture',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'compare_replacement_models',
        stepType: 'DECISION',
        label: 'Compare models and key specs',
        description: 'Review the best-fit replacement models before you choose where to buy.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-model-comparison',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'compare_purchase_options',
        stepType: 'DECISION',
        label: 'Compare vendors and purchase options',
        description: 'Evaluate price, delivery, warranty, and retailer differences side by side.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-purchase-options',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 6,
        stepKey: 'finalize_purchase_selection',
        stepType: 'EXECUTION',
        label: 'Finalize purchase selection',
        description: 'Choose the purchase option you want to move forward with in this phase.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'replacement-purchase-finalization',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Replacement Plan Later ─────────────────────────────────────────────────
  {
    journeyTypeKey: 'replacement_plan_later',
    journeyKey: 'journey_replacement_plan_later',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'ASSET_LIFECYCLE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'confirm_replacement_plan',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'confirm_replacement_plan',
        stepType: 'DECISION',
        label: 'Confirm replacement planning path',
        description: 'Acknowledge the plan to replace later so we can help you prepare without rushing.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'frontend',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'check_replacement_coverage',
        stepType: 'VALIDATION',
        label: 'Check replacement coverage and rebates',
        description: 'Review warranty, coverage, rebate, and financing options that could affect your plan.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'set_replacement_priorities',
        stepType: 'DECISION',
        label: 'Set your priorities',
        description: 'Tell us your budget and what matters most so recommendations match your situation.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'replacement-priorities-capture',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'compare_replacement_models',
        stepType: 'DECISION',
        label: 'Compare models and key specs',
        description: 'Identify the models worth tracking before you shortlist a purchase.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-model-comparison',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'set_budget_and_shortlist',
        stepType: 'DECISION',
        label: 'Set budget and shortlist options',
        description: 'Narrow the field so you know what to buy when the timing is right.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-planning',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 6,
        stepKey: 'save_plan_and_follow_up',
        stepType: 'TRACKING',
        label: 'Save plan and follow-up',
        description: 'Capture the shortlist and next check-in so you can revisit it later.',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: true,
        toolKey: 'replacement-plan-followup',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Replacement Shop Now ───────────────────────────────────────────────────
  {
    journeyTypeKey: 'replacement_shop_now',
    journeyKey: 'journey_replacement_shop_now',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'ASSET_LIFECYCLE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'confirm_replacement_shopping_path',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'confirm_replacement_shopping_path',
        stepType: 'DECISION',
        label: 'Confirm replacement shopping path',
        description: 'Lock in the decision to shop now before comparing purchase options.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'frontend',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'check_replacement_coverage',
        stepType: 'VALIDATION',
        label: 'Check replacement coverage and rebates',
        description: 'Review warranty, coverage, rebate, and financing options before you compare sellers.',
        decisionStage: 'VALIDATION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'set_replacement_priorities',
        stepType: 'DECISION',
        label: 'Set your priorities',
        description: 'Tell us your budget and what matters most so recommendations match your situation.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'replacement-priorities-capture',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'compare_replacement_models',
        stepType: 'DECISION',
        label: 'Compare models and key specs',
        description: 'Review the strongest model candidates before final price selection.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-model-comparison',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 5,
        stepKey: 'compare_purchase_options',
        stepType: 'DECISION',
        label: 'Compare vendors and purchase options',
        description: 'Choose the retailer or seller with the best overall purchase fit.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'replacement-purchase-options',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 6,
        stepKey: 'finalize_purchase_selection',
        stepType: 'EXECUTION',
        label: 'Finalize purchase selection',
        description: 'Choose the purchase option you want to move forward with in this phase.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'replacement-purchase-finalization',
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
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
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
        // Home Event Radar has no live data source in production (only a QA
        // dummy ingest, now disabled) — route to the Incidents tab instead,
        // which is populated by the real NWS severe-weather ingest.
        toolKey: 'incidents',
        routePath: '/dashboard/properties/:propertyId?tab=incidents',
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

  // ── Tax Reassessment ──────────────────────────────────────────────────────────
  // First real domain promoted through the RadarEvent -> Incident bridge
  // (homeEventRadarMatcher.service.ts's promoteRadarEventToIncident), fed by
  // ingestTaxAssessmentEvents.job.ts (Socrata county tax-assessor data).
  // Step sequence mirrors the 3 actions already anticipated by
  // computeTaxEvent() in homeEventRadarMatcher.service.ts.
  {
    journeyTypeKey: 'tax_reassessment_resolution',
    journeyKey: 'journey_tax_reassessment_resolution',
    version: '1.0.0',
    signalIntentFamilies: ['tax_reassessment'],
    issueDomain: 'FINANCIAL',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'READY',
    canonicalFirstStepKey: 'review_assessment',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_assessment',
        stepType: 'AWARENESS',
        label: 'Review the new tax assessment',
        decisionStage: 'AWARENESS',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'incidents',
        routePath: '/dashboard/properties/:propertyId?tab=incidents',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'prepare_appeal',
        stepType: 'DECISION',
        label: 'Estimate the financial impact and prepare an appeal',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'true-cost',
        routePath: '/dashboard/properties/:propertyId/tools/true-cost',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'update_budget',
        stepType: 'TRACKING',
        label: 'Update your budget for the new assessment',
        decisionStage: 'TRACKING',
        executionReadiness: 'TRACKING_ONLY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
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
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
        // Guidance-native step rendered in the focused shell; no standalone route.
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
    version: '1.1.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_current_warranty_context',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_current_warranty_context',
        stepType: 'AWARENESS',
        label: 'Review current warranty context',
        description: 'Check what systems are already protected and where a home warranty plan could close risk.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'shop_warranty_providers',
        stepType: 'DECISION',
        label: 'Shop warranty providers and plans',
        description: 'Compare home warranty providers, plan terms, service fees, and reputation before choosing a plan.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=WARRANTY',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'activate_warranty_coverage',
        stepType: 'EXECUTION',
        label: 'Record the selected warranty plan',
        description: 'Upload plan details or proof of purchase so the new warranty is active in your home records.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Insurance Purchase (SERVICE) ──────────────────────────────────────────
  {
    journeyTypeKey: 'insurance_purchase_journey',
    journeyKey: 'journey_insurance_purchase',
    version: '1.1.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_current_policy_context',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_current_policy_context',
        stepType: 'AWARENESS',
        label: 'Review current policy context',
        description: 'See what your current insurance setup appears to cover and where protection may be thin.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'review_insurance_market',
        stepType: 'DECISION',
        label: 'Review local premium trends',
        description: 'Benchmark expected premiums and market direction before choosing a policy or renewal strategy.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'insurance-trend',
        routePath: '/dashboard/properties/:propertyId/tools/insurance-trend',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'shop_insurance_providers',
        stepType: 'DECISION',
        label: 'Shop insurance providers',
        description: 'Compare insurers, rates, and coverage terms before choosing the policy you want to bind.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=INSURANCE',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'bind_policy_and_record_documents',
        stepType: 'EXECUTION',
        label: 'Bind policy and upload proof',
        description: 'Finalize the selected policy and store its coverage details in your home records.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Warranty Compare / Quote-First (SERVICE) ─────────────────────────────
  {
    journeyTypeKey: 'warranty_quote_comparison_journey',
    journeyKey: 'journey_warranty_quote_comparison',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'READY',
    canonicalFirstStepKey: 'shop_warranty_providers',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'shop_warranty_providers',
        stepType: 'DECISION',
        label: 'Compare warranty providers and quotes',
        description: 'Start by comparing provider reputation, service fees, and plan terms before you commit.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=WARRANTY',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'activate_warranty_coverage',
        stepType: 'EXECUTION',
        label: 'Record the selected warranty plan',
        description: 'Store the chosen plan details so the warranty is active in your home records.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Warranty Renewal (SERVICE) ───────────────────────────────────────────
  {
    journeyTypeKey: 'warranty_renewal_journey',
    journeyKey: 'journey_warranty_renewal',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_current_warranty_context',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_current_warranty_context',
        stepType: 'AWARENESS',
        label: 'Review the current warranty before renewal',
        description: 'Check what your current warranty protects and whether renewal still matches the home’s needs.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'shop_warranty_providers',
        stepType: 'DECISION',
        label: 'Compare renewal and replacement plans',
        description: 'Compare your renewal option against other providers before you recommit.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=WARRANTY',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 3,
        stepKey: 'activate_warranty_coverage',
        stepType: 'EXECUTION',
        label: 'Update the active warranty record',
        description: 'Record the renewed or replacement warranty so the active plan details stay current.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Insurance Compare / Quote-First (SERVICE) ────────────────────────────
  {
    journeyTypeKey: 'insurance_quote_comparison_journey',
    journeyKey: 'journey_insurance_quote_comparison',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_insurance_market',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_insurance_market',
        stepType: 'DECISION',
        label: 'Review local premium trends first',
        description: 'See where the local insurance market is moving before you compare provider quotes.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'insurance-trend',
        routePath: '/dashboard/properties/:propertyId/tools/insurance-trend',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'shop_insurance_providers',
        stepType: 'DECISION',
        label: 'Compare insurance providers and rates',
        description: 'Shop providers, compare quotes, and narrow to the policy you want to bind.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=INSURANCE',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'bind_policy_and_record_documents',
        stepType: 'EXECUTION',
        label: 'Bind policy and upload proof',
        description: 'Finalize the selected policy and save the active coverage record for this home.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
        skipPolicy: 'DISALLOWED',
      },
    ],
  },

  // ── Insurance Renewal / Coverage Review (SERVICE) ────────────────────────
  {
    journeyTypeKey: 'insurance_renewal_journey',
    journeyKey: 'journey_insurance_renewal',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'INSURANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'review_current_policy_context',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'review_current_policy_context',
        stepType: 'AWARENESS',
        label: 'Review the current policy before renewal',
        description: 'Check whether your current insurance setup still fits the home and where coverage may be thin.',
        decisionStage: 'AWARENESS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'coverage-intelligence',
        routePath: '/dashboard/properties/:propertyId/tools/coverage-intelligence',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 2,
        stepKey: 'review_insurance_market',
        stepType: 'DECISION',
        label: 'Review market pricing before renewal',
        description: 'Benchmark your renewal decision against current premium trends before you compare carriers.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'insurance-trend',
        routePath: '/dashboard/properties/:propertyId/tools/insurance-trend',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'shop_insurance_providers',
        stepType: 'DECISION',
        label: 'Compare renewal and replacement policies',
        description: 'Compare carriers, rates, and terms before renewing or changing providers.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'booking',
        routePath: '/dashboard/providers?propertyId=:propertyId&category=INSURANCE',
        skipPolicy: 'DISALLOWED',
      },
      {
        stepOrder: 4,
        stepKey: 'bind_policy_and_record_documents',
        stepType: 'EXECUTION',
        label: 'Update the active policy record',
        description: 'Record the renewed or replacement policy so the active insurance coverage stays current.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: true,
        toolKey: 'documents',
        routePath: '/dashboard/properties/:propertyId/inventory?filter=missing-coverage',
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
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
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

  // ── Inspection Quote-First (SERVICE) ──────────────────────────────────────
  {
    journeyTypeKey: 'inspection_quote_journey',
    journeyKey: 'journey_inspection_quote',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'DECISION',
    defaultReadiness: 'READY',
    canonicalFirstStepKey: 'shop_inspection_providers',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'shop_inspection_providers',
        stepType: 'DECISION',
        label: 'Compare inspectors and quotes',
        description: 'Start by comparing inspector availability, specialization, and price before booking.',
        decisionStage: 'DECISION',
        executionReadiness: 'READY',
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
        description: 'Once you choose an inspector, make sure access details and the inspection window are ready.',
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
        label: 'Review the inspection report',
        description: 'Go through the final inspection findings once the inspector finishes the visit.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
        skipPolicy: 'DISCOURAGED',
      },
    ],
  },

  // ── Pre-Purchase Inspection (SERVICE) ────────────────────────────────────
  {
    journeyTypeKey: 'pre_purchase_inspection_journey',
    journeyKey: 'journey_pre_purchase_inspection',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'schedule_pre_purchase_inspection',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'schedule_pre_purchase_inspection',
        stepType: 'AWARENESS',
        label: 'Schedule a pre-purchase inspection',
        description: 'Book an inspector for due diligence before you commit to the purchase.',
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
        label: 'Prepare access and due-diligence scope',
        description: 'Confirm access, timing, and any areas or concerns you want the inspector to focus on.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'review_pre_purchase_report',
        stepType: 'DECISION',
        label: 'Review the due-diligence inspection report',
        description: 'Use the report to understand negotiation risk, repair exposure, and next decisions before closing.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'act_on_inspection_findings',
        stepType: 'EXECUTION',
        label: 'Plan follow-up before closing',
        description: 'Create the repair, negotiation, or inspection follow-up actions you need before closing.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Annual Maintenance Inspection (SERVICE) ──────────────────────────────
  {
    journeyTypeKey: 'annual_maintenance_inspection_journey',
    journeyKey: 'journey_annual_maintenance_inspection',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'schedule_maintenance_inspection',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'schedule_maintenance_inspection',
        stepType: 'AWARENESS',
        label: 'Schedule a maintenance inspection',
        description: 'Book a seasonal or annual inspection to check the home’s key systems.',
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
        label: 'Prepare the home for routine inspection',
        description: 'Make sure the inspector can access the systems and areas that need annual review.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'review_maintenance_report',
        stepType: 'DECISION',
        label: 'Review the maintenance inspection report',
        description: 'Use the findings to plan tune-ups, repairs, and preventive work for the coming season.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
        skipPolicy: 'DISCOURAGED',
      },
      {
        stepOrder: 4,
        stepKey: 'act_on_inspection_findings',
        stepType: 'EXECUTION',
        label: 'Plan maintenance follow-up',
        description: 'Turn the annual inspection findings into the maintenance work you want to schedule next.',
        decisionStage: 'EXECUTION',
        executionReadiness: 'READY',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
    ],
  },

  // ── Post-Repair Inspection (SERVICE) ─────────────────────────────────────
  {
    journeyTypeKey: 'post_repair_inspection_journey',
    journeyKey: 'journey_post_repair_inspection',
    version: '1.0.0',
    signalIntentFamilies: [],
    issueDomain: 'MAINTENANCE',
    defaultDecisionStage: 'AWARENESS',
    defaultReadiness: 'NEEDS_CONTEXT',
    canonicalFirstStepKey: 'schedule_post_repair_inspection',
    steps: [
      {
        stepOrder: 1,
        stepKey: 'schedule_post_repair_inspection',
        stepType: 'AWARENESS',
        label: 'Schedule a post-repair inspection',
        description: 'Book an inspector to verify that the completed repair or contractor work meets expectations.',
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
        label: 'Prepare access and repair documentation',
        description: 'Make sure the inspector can review the repaired area and any work records or invoices.',
        decisionStage: 'DIAGNOSIS',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: false,
        toolKey: 'guidance-overview',
        routePath: '/dashboard/properties/:propertyId/tools/guidance-overview',
        skipPolicy: 'ALLOWED',
      },
      {
        stepOrder: 3,
        stepKey: 'review_post_repair_report',
        stepType: 'DECISION',
        label: 'Review the post-repair inspection result',
        description: 'Confirm whether the completed work passed inspection or needs additional follow-up.',
        decisionStage: 'DECISION',
        executionReadiness: 'NEEDS_CONTEXT',
        isRequired: true,
        toolKey: 'inspection-report',
        routePath: '/dashboard/properties/:propertyId/inspection-hub',
        skipPolicy: 'DISCOURAGED',
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
        label: 'Review a cleaning quote',
        description: 'Record or review a quote for the selected cleaning type before booking a provider.',
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

const templates: GuidanceJourneyTemplate[] = templateDefinitions.map(applyGuidanceGovernance);

const templateByFamily = new Map<string, GuidanceJourneyTemplate>();
for (const template of templates) {
  for (const family of template.signalIntentFamilies) {
    templateByFamily.set(family, template);
  }
}

const defaultTemplateDefinition: GuidanceJourneyTemplateDefinition = {
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

export const DEFAULT_TEMPLATE: GuidanceJourneyTemplate = applyGuidanceGovernance(defaultTemplateDefinition);

// Global fallback: maps toolKey → canonical stepKey when no journey context is available.
// P1-2: 'recalls' fixed from 'recall_resolution' to 'safety_alert' (canonical first step).
export const TOOL_DEFAULT_STEP_KEY: Record<string, string> = {
  'replace-repair': 'repair_replace_decision',
  'coverage-intelligence': 'check_coverage',
  'insurance-trend': 'review_insurance_market',
  'quote-comparison': 'compare_quotes',
  'price-finalization': 'finalize_price',
  recalls: 'safety_alert',
  booking: 'book_service',
  // Only energy_efficiency_resolution still uses this toolKey — weather now
  // routes through 'incidents' (see below).
  'home-event-radar': 'review_energy_signal',
  incidents: 'weather_safety_check',
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
  // B2: weather journey uses distinct step keys for all four tools
  weather_risk_resolution: {
    incidents: 'weather_safety_check',
    'coverage-intelligence': 'check_weather_coverage',
    maintenance: 'protect_exposed_systems',
    booking: 'schedule_weather_followup',
  },
  // 'incidents' and 'true-cost' are also used by other journeys with
  // different step keys — this override disambiguates for this journey.
  tax_reassessment_resolution: {
    incidents: 'review_assessment',
    'true-cost': 'prepare_appeal',
    'guidance-overview': 'update_budget',
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
    // 'true-cost' removed: estimate_cost_impact step was dropped in template v2.1.0
    'coverage-intelligence': 'check_coverage',
    'service-price-radar': 'validate_price',
    'quote-comparison': 'compare_quotes',
    'negotiation-shield': 'prepare_negotiation',
    'price-finalization': 'finalize_price',
    booking: 'book_service',
    'project-tracker': 'confirm_scope_and_provider',
    'project-completion': 'verify_outcome',
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
  warranty_purchase_journey: {
    'coverage-intelligence': 'review_current_warranty_context',
    booking: 'shop_warranty_providers',
    documents: 'activate_warranty_coverage',
  },
  warranty_quote_comparison_journey: {
    booking: 'shop_warranty_providers',
    documents: 'activate_warranty_coverage',
  },
  warranty_renewal_journey: {
    'coverage-intelligence': 'review_current_warranty_context',
    booking: 'shop_warranty_providers',
    documents: 'activate_warranty_coverage',
  },
  insurance_purchase_journey: {
    'coverage-intelligence': 'review_current_policy_context',
    'insurance-trend': 'review_insurance_market',
    booking: 'shop_insurance_providers',
    documents: 'bind_policy_and_record_documents',
  },
  insurance_quote_comparison_journey: {
    'insurance-trend': 'review_insurance_market',
    booking: 'shop_insurance_providers',
    documents: 'bind_policy_and_record_documents',
  },
  insurance_renewal_journey: {
    'coverage-intelligence': 'review_current_policy_context',
    'insurance-trend': 'review_insurance_market',
    booking: 'shop_insurance_providers',
    documents: 'bind_policy_and_record_documents',
  },
  general_inspection_journey: {
    booking: 'schedule_inspection',
    'guidance-overview': 'prepare_property_access',
    'inspection-report': 'review_inspection_report',
  },
  inspection_quote_journey: {
    booking: 'shop_inspection_providers',
    'guidance-overview': 'prepare_property_access',
    'inspection-report': 'review_inspection_report',
  },
  pre_purchase_inspection_journey: {
    booking: 'schedule_pre_purchase_inspection',
    'guidance-overview': 'prepare_property_access',
    'inspection-report': 'review_pre_purchase_report',
  },
  annual_maintenance_inspection_journey: {
    booking: 'schedule_maintenance_inspection',
    'guidance-overview': 'prepare_property_access',
    'inspection-report': 'review_maintenance_report',
  },
  post_repair_inspection_journey: {
    booking: 'schedule_post_repair_inspection',
    'guidance-overview': 'prepare_property_access',
    'inspection-report': 'review_post_repair_report',
  },
  cleaning_service_journey: {
    'guidance-overview': 'select_cleaning_type',
    'service-price-radar': 'get_cleaning_quotes',
    booking: 'book_cleaning_provider',
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
  'not_draining':              'asset_lifecycle_resolution',
  'not_drying':                'asset_lifecycle_resolution',
  'not_cleaning':              'asset_lifecycle_resolution',
  'unusual_noise':             'asset_lifecycle_resolution',
  'error_code':                'asset_lifecycle_resolution',
  'door_issue':                'asset_lifecycle_resolution',
  'burner_issue':              'asset_lifecycle_resolution',
  'ice_maker':                 'asset_lifecycle_resolution',
  'poor_airflow':              'asset_lifecycle_resolution',
  'low_pressure':              'asset_lifecycle_resolution',
  'no_hot_water':              'asset_lifecycle_resolution',
  'slow_drain':                'asset_lifecycle_resolution',
  'tripping_breaker':          'asset_lifecycle_resolution',
  'flickering':                'asset_lifecycle_resolution',
  'outlet_issue':              'asset_lifecycle_resolution',
  'visible_damage':            'asset_lifecycle_resolution',
  'gutter_issue':              'asset_lifecycle_resolution',
  'battery_low':               'asset_lifecycle_resolution',
  'connectivity_issue':        'asset_lifecycle_resolution',
  'past_life':                 'asset_lifecycle_resolution',
  'aging':                     'asset_lifecycle_resolution',
  'broken':                    'asset_lifecycle_resolution',
  'broken_part':               'asset_lifecycle_resolution',
  'high_utility_cost':         'energy_efficiency_resolution',
  'near_end_of_life':          'replacement_purchase_now',
  // B3: item-scope "needs maintenance/inspection" means get the item serviced, not
  // follow up on an existing inspection report. Route to asset_lifecycle so the
  // user starts with verifying the symptom and deciding repair vs replace.
  'maintenance_needed':        'asset_lifecycle_resolution',
  'inspection_needed':         'asset_lifecycle_resolution',
  // Coverage / financial issues
  'coverage_question':         'coverage_gap_resolution',
  'cost_estimate':             'financial_exposure_resolution',
  // Leak / water damage — asset lifecycle path
  'leak':                      'asset_lifecycle_resolution',
  'water_damage':              'asset_lifecycle_resolution',
  // SERVICE scope issue types
  'purchase_warranty':         'warranty_purchase_journey',
  'compare_warranty_plans':    'warranty_quote_comparison_journey',
  'understand_coverage':       'warranty_purchase_journey',
  'warranty_renewal':          'warranty_renewal_journey',
  'purchase_insurance':        'insurance_purchase_journey',
  'compare_rates':             'insurance_quote_comparison_journey',
  'coverage_gap':              'coverage_gap_resolution',
  'policy_renewal':            'insurance_renewal_journey',
  'schedule_inspection':       'general_inspection_journey',
  'pre_purchase_inspection':   'pre_purchase_inspection_journey',
  'annual_maintenance':        'annual_maintenance_inspection_journey',
  'post_repair_inspection':    'post_repair_inspection_journey',
  'arrange_cleaning':          'cleaning_service_journey',
  'deep_clean':                'cleaning_service_journey',
  'move_clean':                'cleaning_service_journey',
  'post_construction':         'cleaning_service_journey',
};

// Service issue variants that need serviceKey context to route intentionally.
// This is primarily for shared UI labels like "get_quotes", which mean
// different journeys depending on the selected service.
const SERVICE_ISSUE_TYPE_TO_TEMPLATE_KEY: Record<string, Record<string, string>> = {
  warranty_purchase: {
    get_quotes: 'warranty_quote_comparison_journey',
  },
  insurance_purchase: {
    get_quotes: 'insurance_quote_comparison_journey',
  },
  general_inspection: {
    get_quotes: 'inspection_quote_journey',
  },
  cleaning_service: {
    get_quotes: 'cleaning_service_journey',
  },
};

// Maps SERVICE scope serviceKey values to the correct journey template.
// Used as the fallback when the issue type is not in ISSUE_TYPE_TO_TEMPLATE_KEY
// (e.g. a custom issue typed by the user). Prevents all unmapped SERVICE journeys
// from incorrectly routing to warranty_purchase_journey.
const SERVICE_KEY_TO_TEMPLATE_KEY: Record<string, string> = {
  warranty_purchase:  'warranty_purchase_journey',
  insurance_purchase: 'insurance_purchase_journey',
  general_inspection: 'general_inspection_journey',
  cleaning_service:   'cleaning_service_journey',
};

/**
 * Resolves the best journey template for a user-initiated journey given
 * the issue type, scope category, and optional service key.
 *
 * Resolution order:
 *  1. ISSUE_TYPE_TO_TEMPLATE_KEY exact match (covers both ITEM and SERVICE types)
 *  2. SERVICE scope: SERVICE_KEY_TO_TEMPLATE_KEY match on serviceKey
 *  3. SERVICE scope: DEFAULT_TEMPLATE (no journey template for this service)
 *  4. ITEM scope: asset_lifecycle_resolution as the generic item journey
 */
export function getTemplateByIssueType(
  issueType: string,
  scopeCategory: string,
  serviceKey?: string | null,
): GuidanceJourneyTemplate {
  const normalised = issueType.trim().toLowerCase().replace(/\s+/g, '_');
  const templateKey = ISSUE_TYPE_TO_TEMPLATE_KEY[normalised];
  if (templateKey) {
    const found = templates.find((t) => t.journeyTypeKey === templateKey);
    if (found) return found;
  }
  if (scopeCategory === 'SERVICE') {
    const serviceIssueTemplateKey =
      SERVICE_ISSUE_TYPE_TO_TEMPLATE_KEY[serviceKey ?? '']?.[normalised];
    if (serviceIssueTemplateKey) {
      const found = templates.find((t) => t.journeyTypeKey === serviceIssueTemplateKey);
      if (found) return found;
    }
    // Use the serviceKey to route to the correct service journey template.
    // Previously this always fell back to warranty_purchase_journey, which caused
    // cleaning / inspection journeys to receive the wrong template when the user
    // typed a custom issue description not present in ISSUE_TYPE_TO_TEMPLATE_KEY.
    const serviceTemplateKey = SERVICE_KEY_TO_TEMPLATE_KEY[serviceKey ?? ''];
    if (serviceTemplateKey) {
      const found = templates.find((t) => t.journeyTypeKey === serviceTemplateKey);
      if (found) return found;
    }
    return DEFAULT_TEMPLATE;
  }
  // ITEM scope with no specific mapping → asset lifecycle as generic item journey
  return templates.find((t) => t.journeyTypeKey === 'asset_lifecycle_resolution') ?? DEFAULT_TEMPLATE;
}

export function getTemplateByJourneyTypeKey(
  journeyTypeKey: string
): GuidanceJourneyTemplate {
  return templates.find((t) => t.journeyTypeKey === journeyTypeKey) ?? DEFAULT_TEMPLATE;
}

// List of suggested issue types returned by GET /guidance/issue-types
export const SUGGESTED_ISSUE_TYPES_ITEM = [
  { key: 'not_working',      label: 'Not working properly' },
  { key: 'not_cooling',      label: 'Not cooling' },
  { key: 'not_heating',      label: 'Not heating' },
  { key: 'leak',             label: 'Leaking or water damage' },
  { key: 'past_life',        label: 'Aging or past expected life' },
  { key: 'near_end_of_life', label: 'Planning to replace this item' },
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
    // B5: use canonical key that matches ISSUE_TYPE_TO_TEMPLATE_KEY and ISSUE_TYPE_LABELS
    { key: 'slow_drain',         label: 'Slow or blocked drain' },
    { key: 'pipe_noise',         label: 'Banging or rattling pipes' },
    { key: 'water_discoloration',label: 'Discolored or smelly water' },
    { key: 'past_life',          label: 'Aging pipes or fixtures' },
    { key: 'inspection_needed',  label: 'Needs inspection or maintenance' },
    { key: 'cost_estimate',      label: 'Need a cost estimate' },
  ],
  ELECTRICAL: [
    { key: 'no_power',           label: 'No power to outlet or circuit' },
    // B5: align keys with canonical registry and label map entries
    { key: 'tripping_breaker',   label: 'Breaker keeps tripping' },
    { key: 'flickering',         label: 'Flickering or dimming lights' },
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
