// apps/frontend/src/lib/api/savingsBenefitsAdmin.ts
//
// API client for the Admin Savings and Benefits reviewed-source registry
// workspace (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// Slice 2), mirroring lib/api/adminContentGovernance.ts.

import { api } from '@/lib/api/client';

export type HiddenAssetSourceKind =
  | 'OFFICIAL_GOVERNMENT'
  | 'OFFICIAL_UTILITY'
  | 'OFFICIAL_NONPROFIT'
  | 'CARRIER_MANUFACTURER'
  | 'LICENSED_MARKET_PARTNER'
  | 'PUBLIC_BENCHMARK';

export type HiddenAssetSourceStatus = 'ACTIVE' | 'PAUSED' | 'RETIRED';

export type HiddenAssetProgramReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export type AuthorAction = 'SUBMIT_FOR_REVIEW' | 'REVIVE_TO_DRAFT';
export type ReviewDecision = 'APPROVE' | 'RETURN_TO_DRAFT';
export type PublishAction = 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE';
export type LifecycleAction = AuthorAction | ReviewDecision | PublishAction;

export interface AdminSourceListItem {
  id: string;
  name: string;
  sourceKind: HiddenAssetSourceKind;
  officialUrl: string;
  reviewSlaDays: number;
  status: HiddenAssetSourceStatus;
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  programCount: number;
  health: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  stale: boolean;
  overdueSince: string | null;
}

export interface AdminSourceInput {
  name: string;
  sourceKind: HiddenAssetSourceKind;
  officialUrl: string;
  reviewSlaDays?: number;
  status?: HiddenAssetSourceStatus;
}

export interface AdminProgramRuleInput {
  attribute: string;
  operator: string;
  value: string;
  sortOrder?: number;
  groupKey?: string | null;
}

export interface AdminProgramListItem {
  id: string;
  name: string;
  category: string;
  regionType: string;
  regionValue: string;
  benefitType: string;
  benefitEstimateMin: number | null;
  benefitEstimateMax: number | null;
  reviewStatus: HiddenAssetProgramReviewStatus;
  eligibilityNotes: string | null;
  sourceUrl: string | null;
  updatedAt: string;
  source: { id: string; name: string };
  rules: AdminProgramRuleInput[];
}

export interface AdminProgramInput {
  sourceId: string;
  name: string;
  category: string;
  description?: string | null;
  regionType: string;
  regionValue: string;
  benefitType: string;
  benefitEstimateMin?: number | null;
  benefitEstimateMax?: number | null;
  currency?: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  eligibilityNotes?: string | null;
  expiresAt?: string | null;
  rules: AdminProgramRuleInput[];
}

export interface EditorialQueueItem {
  id: string;
  name: string;
  category: string;
  regionType: string;
  regionValue: string;
  reviewStatus: HiddenAssetProgramReviewStatus;
  updatedAt: string;
  source: { id: string; name: string };
}

export interface EditorialQueues {
  reviewQueue: EditorialQueueItem[];
  approvedQueue: EditorialQueueItem[];
}

export interface TransitionResult {
  previousStatus: HiddenAssetProgramReviewStatus;
  status: HiddenAssetProgramReviewStatus;
  action: LifecycleAction;
}

const ENDPOINT_FOR_ACTION: Record<LifecycleAction, string> = {
  SUBMIT_FOR_REVIEW: 'author-action',
  REVIVE_TO_DRAFT: 'author-action',
  APPROVE: 'review-decision',
  RETURN_TO_DRAFT: 'review-decision',
  PUBLISH: 'publish-action',
  UNPUBLISH: 'publish-action',
  ARCHIVE: 'publish-action',
};

export async function fetchSources(): Promise<{ sources: AdminSourceListItem[] }> {
  const res = await api.get<{ sources: AdminSourceListItem[] }>('/api/admin/savings-benefits/sources');
  return res.data;
}

export async function createSource(input: AdminSourceInput): Promise<{ source: AdminSourceListItem }> {
  const res = await api.post<{ source: AdminSourceListItem }>('/api/admin/savings-benefits/sources', input);
  return res.data;
}

export async function updateSource(
  sourceId: string,
  input: AdminSourceInput,
): Promise<{ source: AdminSourceListItem }> {
  const res = await api.put<{ source: AdminSourceListItem }>(
    `/api/admin/savings-benefits/sources/${sourceId}`,
    input,
  );
  return res.data;
}

export async function fetchPrograms(): Promise<{ programs: AdminProgramListItem[] }> {
  const res = await api.get<{ programs: AdminProgramListItem[] }>('/api/admin/savings-benefits/programs');
  return res.data;
}

export async function createProgram(input: AdminProgramInput): Promise<{ program: AdminProgramListItem }> {
  const res = await api.post<{ program: AdminProgramListItem }>('/api/admin/savings-benefits/programs', input);
  return res.data;
}

export async function updateProgram(
  programId: string,
  input: AdminProgramInput,
): Promise<{ program: AdminProgramListItem }> {
  const res = await api.put<{ program: AdminProgramListItem }>(
    `/api/admin/savings-benefits/programs/${programId}`,
    input,
  );
  return res.data;
}

export async function fetchEditorialQueues(): Promise<EditorialQueues> {
  const res = await api.get<EditorialQueues>('/api/admin/savings-benefits/queues');
  return res.data;
}

export async function transitionProgram(
  programId: string,
  action: LifecycleAction,
  reason: string,
): Promise<TransitionResult> {
  const res = await api.post<TransitionResult>(
    `/api/admin/savings-benefits/programs/${programId}/${ENDPOINT_FOR_ACTION[action]}`,
    { action, reason },
  );
  return res.data;
}
