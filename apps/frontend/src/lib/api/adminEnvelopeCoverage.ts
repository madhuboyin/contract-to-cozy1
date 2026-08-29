// apps/frontend/src/lib/api/adminEnvelopeCoverage.ts
//
// API client for the admin-only, read-only Envelope Promotion Coverage
// dashboard (C2C_INTELLIGENCE_AGENTIC_EVOLUTION_IMPLEMENTATION_PLAN.md §6.3).
// Backend route: GET /api/admin/envelope-coverage — ADMIN + MFA +
// WORKER_JOB_VIEW capability. This surface never promotes, creates rules, or
// mutates anything; closing a finding is a separate human-authored change.

import { api } from '@/lib/api/client';

export type CoverageDetermination = 'COVERED' | 'REVIEW_REQUIRED' | 'NOT_ACTIONABLE';
export type CoverageEvidenceBasis = 'DECLARED_ONLY' | 'OBSERVED_ONLY' | 'DECLARED_AND_OBSERVED';
export type CoverageRunTrigger = 'SCHEDULED' | 'MANUAL';
export type CoverageRunStatus = 'RUNNING' | 'COMPLETE' | 'PARTIAL' | 'FAILED';

export interface CoverageFinding {
  id: string;
  producerModel: string;
  domain: string;
  determination: CoverageDetermination;
  evidenceBasis: CoverageEvidenceBasis;
  auditInputsDigest: string;
  matchedRuleIds: string[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  active: boolean;
  lastAuditedAt: string | null;
  retiredAt: string | null;
}

export interface CoverageAuditRun {
  id: string;
  trigger: CoverageRunTrigger;
  status: CoverageRunStatus;
  auditInputsDigest: string;
  taxonomyVersion: string;
  deploymentRevision: string;
  evaluationContractVersion: string | null;
  evaluationStatus: string;
  startedAt: string;
  finishedAt: string | null;
  propertiesExamined: number;
  propertiesAudited: number;
  ownerUnresolved: number;
  propertyFailures: number;
  adapterFailures: number;
  envelopePagesRead: number;
  observedCapabilities: number;
  findings: number;
  reviewRequired: number;
  declarationDrift: number;
  certificationIssueCount: number;
  findingsCreated: number;
  findingsUpdated: number;
  findingsRetired: number;
  diagnostics: string[];
  certificationIssues: string[];
  failureCode: string | null;
  failureSummary: string | null;
}

export interface AdminEnvelopeCoverageReport {
  summary: {
    reviewRequired: number;
    declaredOnly: number;
    recentPartialOrFailed: number;
    evaluationStatus: string;
  };
  reviewRequired: CoverageFinding[];
  declaredOnly: CoverageFinding[];
  retired: CoverageFinding[];
  lastComplete: CoverageAuditRun | null;
  recentRuns: CoverageAuditRun[];
}

export async function fetchAdminEnvelopeCoverage(
  options: { includeRetired?: boolean; runLimit?: number } = {},
): Promise<AdminEnvelopeCoverageReport> {
  const res = await api.get<AdminEnvelopeCoverageReport>('/api/admin/envelope-coverage', {
    params: {
      includeRetired: options.includeRetired ? 'true' : undefined,
      runLimit: options.runLimit,
    },
  });
  return res.data;
}
