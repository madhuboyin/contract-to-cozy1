// apps/backend/src/services/analytics/taxonomy.ts
//
// Centralized product analytics event taxonomy for Contract-to-Cozy.
// Re-exports the Prisma-generated enum so feature modules never use raw strings.
// Also provides module/feature key constants for consistent tagging.

import { ProductAnalyticsEventType } from '@prisma/client';

// ============================================================================
// RE-EXPORT DB ENUM — single source of truth for event type values
// ============================================================================

export { ProductAnalyticsEventType };

// Convenience alias used throughout the codebase
export const AnalyticsEvent = ProductAnalyticsEventType;
export type AnalyticsEventType = ProductAnalyticsEventType;

// Framework north-star lineage. These events are intentionally distinct from
// generic feature and outcome events so a material action can be traced from
// entry context through verified resolution without relying on eventName text.
export const NorthStarAnalyticsEvent = {
  ENTRY_CONTEXT_CAPTURED: ProductAnalyticsEventType.ENTRY_CONTEXT_CAPTURED,
  ACTIVE_TRIGGER_IDENTIFIED: ProductAnalyticsEventType.ACTIVE_TRIGGER_IDENTIFIED,
  HOME_ACTION_IDENTIFIED: ProductAnalyticsEventType.HOME_ACTION_IDENTIFIED,
  HOME_ACTION_SURFACED: ProductAnalyticsEventType.HOME_ACTION_SURFACED,
  HOME_ACTION_OPENED: ProductAnalyticsEventType.HOME_ACTION_OPENED,
  HOME_ACTION_ACTED: ProductAnalyticsEventType.HOME_ACTION_ACTED,
  HOME_ACTION_SUPERSEDED: ProductAnalyticsEventType.HOME_ACTION_SUPERSEDED,
  HOME_ACTION_RESOLUTION_RECORDED: ProductAnalyticsEventType.HOME_ACTION_RESOLUTION_RECORDED,
  HOME_ACTION_OUTCOME_VERIFIED: ProductAnalyticsEventType.HOME_ACTION_OUTCOME_VERIFIED,
} as const;

export type NorthStarAnalyticsEventType = typeof NorthStarAnalyticsEvent[keyof typeof NorthStarAnalyticsEvent];

// ============================================================================
// MODULE KEYS
// Identifies which major product area emitted the event.
// ============================================================================

export const AnalyticsModule = {
  PROPERTY:          'property',
  MAINTENANCE:       'maintenance',
  RISK:              'risk',
  INVENTORY:         'inventory',
  CLAIMS:            'claims',
  INCIDENTS:         'incidents',
  DOCUMENTS:         'documents',
  HIDDEN_ASSETS:     'hidden_assets',
  NEGOTIATION:       'negotiation',
  HOME_PULSE:        'home_pulse',
  DIGITAL_TWIN:      'digital_twin',
  KNOWLEDGE_HUB:     'knowledge_hub',
  FINANCIAL:         'financial',
  DASHBOARD:         'dashboard',
  ADMIN_ANALYTICS:   'admin_analytics',
  RENOVATION_ADVISOR: 'renovation_advisor',
  GAZETTE:           'gazette',
  INSURANCE:         'insurance',
  PROJECT_MGMT:      'project_mgmt',
  TAX:               'tax',
  COMMUNITY:         'community',
  MARKETPLACE:       'marketplace',
  INSPECTION:        'inspection',
  HOME_BUYER:        'home_buyer',
  AI_INSIGHTS:       'ai_insights',
  GUIDANCE:          'guidance',
} as const;

export type AnalyticsModuleKey = typeof AnalyticsModule[keyof typeof AnalyticsModule];

// ============================================================================
// FEATURE KEYS
// Identifies the specific sub-feature within a module.
// ============================================================================

export const AnalyticsFeature = {
  // Property
  PROPERTY_PROFILE:         'property_profile',
  PROPERTY_ONBOARDING:      'property_onboarding',
  PROPERTY_ACTIVATION:      'property_activation',

  // Maintenance
  MAINTENANCE_TASK:         'maintenance_task',
  SEASONAL_CHECKLIST:       'seasonal_checklist',
  MAINTENANCE_PREDICTION:   'maintenance_prediction',

  // Risk
  RISK_ASSESSMENT:          'risk_assessment',
  RISK_MITIGATION:          'risk_mitigation',

  // Inventory
  INVENTORY_ITEM:           'inventory_item',
  INVENTORY_ROOM:           'inventory_room',
  INVENTORY_SCAN:           'inventory_scan',

  // Claims & Incidents
  CLAIM:                    'claim',
  INCIDENT:                 'incident',

  // Documents
  DOCUMENT_UPLOAD:          'document_upload',
  VAULT:                    'vault',

  // Hidden Assets / Negotiation
  HIDDEN_ASSET:             'hidden_asset',
  NEGOTIATION_SHIELD:       'negotiation_shield',

  // Home Intelligence
  HOME_PULSE:               'home_pulse',
  DIGITAL_TWIN:             'digital_twin',
  HOME_SCORE:               'home_score',
  HOME_CAPITAL_TIMELINE:    'home_capital_timeline',

  // Knowledge
  KNOWLEDGE_ARTICLE:        'knowledge_article',

  // Financial
  FINANCIAL_EFFICIENCY:     'financial_efficiency',
  COVERAGE_ANALYSIS:        'coverage_analysis',
  REPLACE_REPAIR:           'replace_repair',
  RESERVE_FUND:             'reserve_fund',

  // Admin
  ADMIN_ANALYTICS_DASHBOARD: 'admin_analytics_dashboard',

  // Home Renovation Risk Advisor
  RENOVATION_ADVISOR_SESSION: 'renovation_advisor_session',

  // Home Gazette
  GAZETTE_EDITION:   'gazette_edition',
  GAZETTE_SHARE:     'gazette_share',
  GAZETTE_STORY_CTA: 'gazette_story_cta',

  // Financial (additional tools)
  BREAK_EVEN:             'break_even',
  COST_EXPLAINER:         'cost_explainer',
  COST_VOLATILITY:        'cost_volatility',
  RISK_PREMIUM_OPTIMIZER: 'risk_premium_optimizer',
  DIY_DECISION:           'diy_decision',
  DO_NOTHING_SIMULATOR:   'do_nothing_simulator',
  FINANCING:              'financing',
  TRUE_COST_OWNERSHIP:    'true_cost_ownership',
  HOME_COST_GROWTH:       'home_cost_growth',
  HOME_SAVINGS:           'home_savings',
  COVERAGE_OPTIONS:       'coverage_options',
  MORTGAGE_REFINANCE_RADAR: 'mortgage_refinance_radar',

  // Community / HOA
  HOA_COMPLIANCE:      'hoa_compliance',
  NEIGHBOURHOOD_TRUST: 'neighbourhood_trust',
  NEIGHBORHOOD_CHANGE_RADAR: 'neighborhood_change_radar',

  // Home Buyer / Seller
  HOME_BUYER_TASK: 'home_buyer_task',
  SELL_HOLD_RENT:  'sell_hold_rent',

  // Home Intelligence (additional tools)
  HOME_DIGITAL_WILL:   'home_digital_will',
  HOME_EVENT_RADAR:    'home_event_radar',
  HOME_HABIT_COACH:    'home_habit_coach',
  HOME_REPORT_EXPORT:  'home_report_export',
  HOME_RISK_REPLAY:    'home_risk_replay',
  HOME_SCORE_REPORT:   'home_score_report',
  HOME_SCORE_SHARE:    'home_score_share',

  // Inspection
  INSPECTION_HUB:        'inspection_hub',
  INSPECTION_READINESS:  'inspection_readiness',

  // Insurance
  INSURANCE_AUDITOR:    'insurance_auditor',
  INSURANCE_COST_TREND: 'insurance_cost_trend',
  INSURANCE_OCR:        'insurance_ocr',

  // Inventory (additional)
  INVENTORY_VERIFICATION: 'inventory_verification',

  // Project management
  MATERIAL_SPEC:      'material_spec',
  PERMIT_TRACKER:     'permit_tracker',
  PRICE_FINALIZATION: 'price_finalization',
  PROJECT_TRACKER:    'project_tracker',

  // Tax
  PROPERTY_TAX: 'property_tax',

  // Marketplace
  RECALLS:             'recalls',
  SERVICE_PRICE_RADAR: 'service_price_radar',
  BOOKING:             'booking',

  // AI Insights
  ROOM_INSIGHTS:       'room_insights',
  ROOM_PLANT_ADVISOR:  'room_plant_advisor',
  NARRATIVE:           'narrative',

  // Guidance / Decision engine
  GUIDANCE_ADVISOR: 'guidance_advisor',

  // Dashboard
  DASHBOARD_SUMMARY: 'dashboard_summary',
  STATUS_BOARD:      'status_board',
} as const;

export type AnalyticsFeatureKey = typeof AnalyticsFeature[keyof typeof AnalyticsFeature];

// ============================================================================
// SOURCE KEYS
// Identifies the originating surface (for funnel/attribution analysis).
// ============================================================================

export const AnalyticsSource = {
  DASHBOARD:     'dashboard',
  HOME_TOOLS:    'home_tools',
  MOBILE:        'mobile',
  AUTOMATION:    'automation',
  ADMIN:         'admin',
  SYSTEM:        'system',
  ONBOARDING:    'onboarding',
} as const;

export type AnalyticsSourceKey = typeof AnalyticsSource[keyof typeof AnalyticsSource];
