// apps/frontend/src/lib/api/adminPlatformOps.ts
//
// API client for the Phase 5 platform-operations UIs: Shared Data Health
// (ADMIN_MODULE_FRD.md §10.9, over the existing /api/admin/shared-data API,
// SHARED_DATA_OPERATE) and Release Gates (over /api/admin/release-gates,
// RELEASE_GATE_VIEW). Read-mostly; the only action is the shared-data
// backfill, which supports dry runs.

import { api } from '@/lib/api/client';

// ─── Shared data health ───────────────────────────────────────────────────────

export interface SharedDataDiagnostics {
  generatedAt: string;
  propertiesEvaluated: number;
  fallbackRisk: {
    coverageAnalysesWithoutAssumptionSet: number;
    riskAnalysesWithoutAssumptionSet: number;
    doNothingRunsWithoutAssumptionSet: number;
    homeScoreReportsWithoutPreferenceProfile: number;
    totalAnalyzedRows: number;
    missingSharedLinkRatio: number;
  };
  readinessSummary: {
    ready: number;
    partial: number;
    legacyHeavy: number;
    avgPreferenceCompletenessRatio: number;
    avgAssumptionLinkRatio: number;
    avgSignalCoverageRatio: number;
  };
  consistencySummary: {
    issueCount: number;
    byCode: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  signalSummary: {
    staleSignals: number;
    lowConfidenceSignals: number;
    interactionSignals: number;
    totalSignals: number;
  };
}

export interface SharedDataConsistencyIssue {
  propertyId: string;
  code: string;
  severity: string;
  message: string;
}

export interface SharedDataConsistencyReport {
  generatedAt: string;
  propertiesEvaluated: number;
  issueCount: number;
  issues: SharedDataConsistencyIssue[];
}

export interface BackfillInput {
  dryRun: boolean;
  propertyId?: string;
  limit?: number;
}

export async function fetchSharedDataDiagnostics(): Promise<SharedDataDiagnostics> {
  const res = await api.get<SharedDataDiagnostics>('/api/admin/shared-data/diagnostics');
  return res.data;
}

export async function fetchSharedDataConsistency(): Promise<SharedDataConsistencyReport> {
  const res = await api.get<SharedDataConsistencyReport>('/api/admin/shared-data/consistency');
  return res.data;
}

export async function runSharedDataBackfill(input: BackfillInput): Promise<Record<string, unknown>> {
  const res = await api.post<Record<string, unknown>>('/api/admin/shared-data/backfill', input);
  return res.data;
}

// ─── Release gates ────────────────────────────────────────────────────────────

export interface GateCheckResult {
  toolKey: string;
  label: string;
  cohort: 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL';
  rolloutPct: number;
  pass: boolean;
  issues: string[];
  activeIncidentCount: number;
  checkedAt: string;
}

export type CapabilityLaunchReviewState = 'READY' | 'HELD' | 'BLOCKED';
export type CapabilityGovernanceReviewRole =
  | 'PRODUCT'
  | 'DOMAIN'
  | 'TRUST'
  | 'LEGAL_COMPLIANCE'
  | 'COMMERCIAL_INTEGRITY';

export interface CapabilityLaunchReview {
  capabilityId: string;
  label: string;
  owner: string;
  rolloutKey: string;
  releaseStage: 'ACTIVE' | 'BETA';
  safetyTier:
    | 'LOW_CONSEQUENCE'
    | 'MATERIAL_FINANCIAL'
    | 'REGULATED_COVERAGE'
    | 'SAFETY_EMERGENCY';
  recommendationMode: 'CONTEXTUAL' | 'CATALOG_ONLY' | 'WORKFLOW_ONLY';
  state: CapabilityLaunchReviewState;
  blockers: string[];
  rollout: {
    cohort: 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL';
    rolloutPct: number;
  } | null;
  incidentGate: {
    pass: boolean;
    activeIncidentCount: number;
    issues: string[];
    checkedAt: string;
  } | null;
  governanceReview: {
    enforced: boolean;
    ready: boolean;
    requiredRoles: CapabilityGovernanceReviewRole[];
    approvedRoles: CapabilityGovernanceReviewRole[];
    rejectedRoles: CapabilityGovernanceReviewRole[];
    missingRoles: CapabilityGovernanceReviewRole[];
  };
}

export interface ReleaseGateSummary {
  totalTools: number;
  passing: number;
  failing: number;
  byRolloutCohort: Record<string, number>;
  capabilityReviewCounts: Record<CapabilityLaunchReviewState, number>;
  operationalControls: {
    releaseMode: 'INTERNAL_BETA' | 'REAL_USER_LAUNCH';
    failureMode: 'BETA_FAIL_OPEN' | 'LAUNCH_FAIL_CLOSED';
    releaseReady: boolean;
    releaseBlockers: string[];
    humanPolicyApprovalEnforced: boolean;
    governanceReviewSourceAvailable: boolean;
    globalEnabled: boolean;
    releaseGateEnforced: boolean;
    registryVersion: string;
    expectedRegistryVersion: string | null;
    registryVersionMatches: boolean;
    configurationValid: boolean;
    invalidConfigurationEntries: string[];
    invalidManifestVersionEntries: string[];
    rolloutKeyParity: {
      valid: boolean;
      missingKeys: string[];
      unknownKeys: string[];
    };
    disabledCapabilityIds: string[];
    unknownDisabledCapabilityIds: string[];
    brokenRouteCapabilityIds: string[];
    unknownBrokenRouteCapabilityIds: string[];
    releaseGateBlockedCapabilityIds: string[];
    unknownReleaseGateBlockedCapabilityIds: string[];
    manifestVersionMismatches: Array<{
      capabilityId: string;
      currentVersion: number;
      expectedVersion: number;
    }>;
  };
  capabilityReviews: CapabilityLaunchReview[];
  gates: GateCheckResult[];
}

export async function fetchReleaseGateSummary(): Promise<ReleaseGateSummary> {
  const res = await api.get<ReleaseGateSummary>('/api/admin/release-gates');
  return res.data;
}

export async function recordCapabilityGovernanceReview(
  capabilityId: string,
  input: {
    role: CapabilityGovernanceReviewRole;
    decision: 'APPROVED' | 'REJECTED';
    notes?: string | null;
  },
) {
  const res = await api.post(
    `/api/admin/release-gates/capabilities/${encodeURIComponent(capabilityId)}/governance-reviews`,
    input,
  );
  return res.data;
}
