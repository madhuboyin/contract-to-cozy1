// apps/backend/src/config/adminCapabilities.ts
//
// Single source of truth for the ADMIN capability model defined in
// docs/functional/ADMIN_MODULE_FRD.md §8.2 (capability catalog) and §8.3
// (persona bundles). Capability *names* live here in code, not in the
// database — apps/backend/prisma/schema.prisma's AdminCapabilityGrant model
// only records which user currently holds which named capability.
//
// Adding a capability: add it to ADMIN_CAPABILITIES (+ risk level), assign it
// to the relevant persona bundle(s) below, and update the FRD's §8.2 list so
// the two stay in sync.

export const ADMIN_CAPABILITIES = [
  'ADMIN_DASHBOARD_VIEW',
  'ADMIN_ROLE_MANAGE',
  'USER_VIEW',
  'USER_STATUS_CHANGE',
  'USER_SESSION_REVOKE',
  'PROPERTY_SUPPORT_VIEW',
  'SUPPORT_CASE_MANAGE',
  'PRIVACY_REQUEST_MANAGE',
  'PROVIDER_VIEW',
  'PROVIDER_COMPLIANCE_REVIEW',
  'PROVIDER_SUSPEND',
  'BOOKING_VIEW',
  'BOOKING_OPERATE',
  'PAYMENT_VIEW',
  'REFUND_REQUEST',
  'REFUND_APPROVE',
  'DISPUTE_MANAGE',
  'FINANCING_CONFIG',
  'REVIEW_MODERATE',
  'SAFETY_INCIDENT_MANAGE',
  'CONTENT_AUTHOR',
  'CONTENT_REVIEW',
  'CONTENT_PUBLISH',
  'CATALOG_AUTHOR',
  'CATALOG_REVIEW',
  'CATALOG_PUBLISH',
  'PERSONALIZATION_OPERATE',
  'WORKER_JOB_VIEW',
  'WORKER_JOB_TRIGGER',
  'WORKER_JOB_SMOKE_CLEANUP',
  'SHARED_DATA_OPERATE',
  'INTEGRATION_MANAGE',
  'RELEASE_GATE_VIEW',
  'SYSTEM_SETTINGS_MANAGE',
  'ANALYTICS_VIEW',
  'AUDIT_VIEW',
  'BREAK_GLASS',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === 'string' && (ADMIN_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Granted to every ADMIN automatically — never requires a stored grant row.
 * Bootstrap/rollout would otherwise be circular (nobody could reach the
 * capability admin screen to grant themselves dashboard access).
 */
export const BASELINE_ADMIN_CAPABILITY: AdminCapability = 'ADMIN_DASHBOARD_VIEW';

/**
 * Coarse risk classification per capability (§17 Phase 0: "action-risk
 * classification"). Not yet wired to an approval workflow — FR-6 approval
 * requests are Phase 1+ — but this is the foundation a future approval
 * policy keys off of, and it already drives whether a capability requires
 * an active MFA/step-up session in practice.
 */
export type AdminActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const ADMIN_CAPABILITY_RISK: Record<AdminCapability, AdminActionRiskLevel> = {
  ADMIN_DASHBOARD_VIEW: 'LOW',
  ADMIN_ROLE_MANAGE: 'CRITICAL',
  USER_VIEW: 'LOW',
  USER_STATUS_CHANGE: 'HIGH',
  USER_SESSION_REVOKE: 'HIGH',
  PROPERTY_SUPPORT_VIEW: 'LOW',
  SUPPORT_CASE_MANAGE: 'MEDIUM',
  PRIVACY_REQUEST_MANAGE: 'CRITICAL',
  PROVIDER_VIEW: 'LOW',
  PROVIDER_COMPLIANCE_REVIEW: 'HIGH',
  PROVIDER_SUSPEND: 'HIGH',
  BOOKING_VIEW: 'LOW',
  BOOKING_OPERATE: 'MEDIUM',
  PAYMENT_VIEW: 'MEDIUM',
  REFUND_REQUEST: 'HIGH',
  REFUND_APPROVE: 'CRITICAL',
  DISPUTE_MANAGE: 'HIGH',
  FINANCING_CONFIG: 'HIGH',
  REVIEW_MODERATE: 'MEDIUM',
  SAFETY_INCIDENT_MANAGE: 'HIGH',
  CONTENT_AUTHOR: 'LOW',
  CONTENT_REVIEW: 'MEDIUM',
  CONTENT_PUBLISH: 'HIGH',
  CATALOG_AUTHOR: 'LOW',
  CATALOG_REVIEW: 'MEDIUM',
  CATALOG_PUBLISH: 'HIGH',
  PERSONALIZATION_OPERATE: 'HIGH',
  WORKER_JOB_VIEW: 'LOW',
  WORKER_JOB_TRIGGER: 'MEDIUM',
  WORKER_JOB_SMOKE_CLEANUP: 'MEDIUM',
  SHARED_DATA_OPERATE: 'HIGH',
  INTEGRATION_MANAGE: 'HIGH',
  RELEASE_GATE_VIEW: 'LOW',
  SYSTEM_SETTINGS_MANAGE: 'HIGH',
  ANALYTICS_VIEW: 'LOW',
  AUDIT_VIEW: 'MEDIUM',
  BREAK_GLASS: 'CRITICAL',
};

/**
 * Default least-privilege bundle per target persona (ADMIN_MODULE_FRD.md
 * §8.3). ADMIN_DASHBOARD_VIEW is omitted — it is baseline, not bundle-owned.
 * These are seed/reference bundles for grantBundle(); an individual admin's
 * actual capabilities are whatever AdminCapabilityGrant rows are active for
 * them, which may diverge from the bundle after individual grants/revokes.
 */
export const ADMIN_PERSONA_BUNDLES: Record<string, readonly AdminCapability[]> = {
  PLATFORM_ADMINISTRATOR: [
    'ADMIN_ROLE_MANAGE',
    'USER_SESSION_REVOKE',
    'SYSTEM_SETTINGS_MANAGE',
    'INTEGRATION_MANAGE',
    'RELEASE_GATE_VIEW',
    'AUDIT_VIEW',
    'BREAK_GLASS',
    'PERSONALIZATION_OPERATE',
  ],
  CUSTOMER_SUPPORT_OPERATOR: [
    'USER_VIEW',
    'USER_STATUS_CHANGE',
    'USER_SESSION_REVOKE',
    'PROPERTY_SUPPORT_VIEW',
    'SUPPORT_CASE_MANAGE',
  ],
  PROVIDER_OPERATIONS_REVIEWER: [
    'PROVIDER_VIEW',
    'PROVIDER_COMPLIANCE_REVIEW',
    'PROVIDER_SUSPEND',
    'BOOKING_VIEW',
  ],
  MARKETPLACE_OPERATIONS_OPERATOR: [
    'BOOKING_VIEW',
    'BOOKING_OPERATE',
    'PROVIDER_VIEW',
    'USER_VIEW',
    'SUPPORT_CASE_MANAGE',
  ],
  FINANCE_OPERATIONS_OPERATOR: [
    'PAYMENT_VIEW',
    'REFUND_REQUEST',
    'REFUND_APPROVE',
    'DISPUTE_MANAGE',
    'FINANCING_CONFIG',
    'BOOKING_VIEW',
  ],
  TRUST_AND_SAFETY_REVIEWER: [
    'REVIEW_MODERATE',
    'SAFETY_INCIDENT_MANAGE',
    'PRIVACY_REQUEST_MANAGE',
    'USER_VIEW',
    'PROVIDER_VIEW',
  ],
  CONTENT_AUTHOR: ['CONTENT_AUTHOR', 'CATALOG_AUTHOR'],
  CONTENT_CATALOG_REVIEWER: ['CONTENT_REVIEW', 'CATALOG_REVIEW'],
  CONTENT_CATALOG_PUBLISHER: ['CONTENT_PUBLISH', 'CATALOG_PUBLISH'],
  DATA_PLATFORM_OPERATOR: [
    'WORKER_JOB_VIEW',
    'WORKER_JOB_TRIGGER',
    'WORKER_JOB_SMOKE_CLEANUP',
    'SHARED_DATA_OPERATE',
    'INTEGRATION_MANAGE',
    'RELEASE_GATE_VIEW',
  ],
  ANALYST: ['ANALYTICS_VIEW'],
  AUDITOR_SECURITY_REVIEWER: ['AUDIT_VIEW'],
};

export type AdminPersonaBundleName = keyof typeof ADMIN_PERSONA_BUNDLES;

export function isAdminPersonaBundleName(value: unknown): value is AdminPersonaBundleName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADMIN_PERSONA_BUNDLES, value);
}
