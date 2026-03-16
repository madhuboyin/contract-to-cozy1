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

  // Admin
  ADMIN_ANALYTICS_DASHBOARD: 'admin_analytics_dashboard',

  // Home Renovation Risk Advisor
  RENOVATION_ADVISOR_SESSION: 'renovation_advisor_session',
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
