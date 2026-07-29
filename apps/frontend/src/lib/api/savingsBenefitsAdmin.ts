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

export type HiddenAssetRuleKind = 'MANDATORY' | 'OPTIONAL' | 'DISQUALIFYING';

export interface AdminProgramRuleInput {
  attribute: string;
  operator: string;
  value: string;
  sortOrder?: number;
  /**
   * MANDATORY (default): must resolve true or the program is excluded.
   * OPTIONAL: only raises/lowers confidence, never excludes.
   * DISQUALIFYING: resolving true excludes the program outright.
   * Rules sharing a groupKey are OR'd together and must share one kind.
   */
  kind?: HiddenAssetRuleKind;
  groupKey?: string | null;
  evidenceRequirement?: string | null;
  homeownerExplanation?: string | null;
  isSensitive?: boolean;
  requiresExternalVerification?: boolean;
  unknownHandling?: 'HOLD_CANDIDATE' | 'EXCLUDE' | 'EXTERNAL_VERIFICATION';
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
  benefitPeriod: HiddenAssetBenefitPeriod;
  fundingStatus: 'UNKNOWN' | 'OPEN' | 'CLOSED';
  applicationWindowOpensAt: string | null;
  applicationWindowClosesAt: string | null;
  expiresAt: string | null;
  reviewStatus: HiddenAssetProgramReviewStatus;
  eligibilityNotes: string | null;
  sourceUrl: string | null;
  updatedAt: string;
  source: { id: string; name: string };
  rules: AdminProgramRuleInput[];
  exclusionGroupKey: string | null;
  version: number;
  beneficiaryScope: HiddenAssetBeneficiaryScope;
}

export type HiddenAssetBeneficiaryScope = 'PROPERTY' | 'HOUSEHOLD' | 'EITHER';
export type HiddenAssetBenefitPeriod = 'UNKNOWN' | 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';

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
  benefitPeriod?: HiddenAssetBenefitPeriod;
  currency?: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  eligibilityNotes?: string | null;
  expiresAt?: string | null;
  fundingStatus?: 'UNKNOWN' | 'OPEN' | 'CLOSED';
  applicationWindowOpensAt?: string | null;
  applicationWindowClosesAt?: string | null;
  /**
   * Programs sharing a non-null exclusionGroupKey are mutually exclusive —
   * a homeowner can realistically claim only one from the group.
   */
  exclusionGroupKey?: string | null;
  /** Who the benefit belongs to — property or household (HSB-038). Defaults to PROPERTY. */
  beneficiaryScope?: HiddenAssetBeneficiaryScope;
  rules: AdminProgramRuleInput[];
}

export interface ProgramVersionSnapshot {
  id: string;
  programId: string;
  version: number;
  snapshotJson: unknown;
  changeReason: string | null;
  recordedBy: string | null;
  createdAt: string;
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

export interface OutcomeVerificationQueueItem {
  family: 'BENEFIT' | 'RECURRING_COST';
  id: string;
  title: string;
  value: string | null;
  currency: string;
  verificationState: 'SELF_REPORTED' | 'EVIDENCE_ATTACHED';
  evidenceNote: string | null;
  documents: Array<{ id: string; name: string }>;
  recordedAt: string;
}

export interface SavingsBenefitPartnerItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'RETIRED';
  supportedJurisdictions: string[];
  disclosureVersion: string;
  compensationMayOccur: boolean;
  compensationDisclosure: string;
  rankingDisclosure: string;
  privacyDisclosure: string;
  fulfillmentSlaHours: number;
  effectiveAt: string;
  expiresAt: string | null;
}

export type SavingsBenefitPartnerInput = Omit<SavingsBenefitPartnerItem, 'id'>;

export interface SavingsBenefitPartnerComplaintItem {
  id: string;
  category: string;
  description: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  action: {
    id: string;
    partner: { id: string; name: string } | null;
  };
}

export interface SavingsBenefitPartnerHandoffItem {
  id: string;
  propertyId: string;
  state: string;
  handoffStatus: 'CONSENTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'FAILED' | 'REVOKED';
  startedAt: string;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  fulfilledAt: string | null;
  deliveryReference: string | null;
  sharedFields: Record<string, unknown> | null;
  dueAt: string | null;
  overdue: boolean;
  openComplaintCount: number;
  partner: SavingsBenefitPartnerItem | null;
  outcome: {
    id: string;
    stage: string;
    verificationState: 'SELF_REPORTED' | 'EVIDENCE_ATTACHED' | 'VERIFIED';
    recordedAt: string;
  } | null;
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

export async function reviewSource(
  sourceId: string,
  reason: string,
): Promise<{ source: AdminSourceListItem }> {
  const res = await api.post<{ source: AdminSourceListItem }>(
    `/api/admin/savings-benefits/sources/${sourceId}/review`,
    { reason },
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

export async function fetchProgramVersionHistory(
  programId: string,
): Promise<{ versions: ProgramVersionSnapshot[] }> {
  const res = await api.get<{ versions: ProgramVersionSnapshot[] }>(
    `/api/admin/savings-benefits/programs/${programId}/versions`,
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

export interface AdminQueuePage {
  total: number;
  offset: number;
  limit: number;
}

export async function fetchOutcomeVerificationQueue(offset = 0, limit = 50): Promise<{
  outcomes: OutcomeVerificationQueueItem[];
} & AdminQueuePage> {
  const res = await api.get<{ outcomes: OutcomeVerificationQueueItem[] } & AdminQueuePage>(
    `/api/admin/savings-benefits/outcome-verification-queue?offset=${offset}&limit=${limit}`,
  );
  return res.data;
}

export async function verifyOutcome(
  outcomeId: string,
  family: OutcomeVerificationQueueItem['family'],
  reason: string,
): Promise<void> {
  await api.post(`/api/admin/savings-benefits/outcomes/${outcomeId}/verify`, { family, reason });
}

export async function fetchSavingsBenefitPartners(): Promise<{ partners: SavingsBenefitPartnerItem[] }> {
  const res = await api.get<{ partners: SavingsBenefitPartnerItem[] }>('/api/admin/savings-benefits/partners');
  return res.data;
}

export async function fetchSavingsBenefitPartnerHandoffs(offset = 0, limit = 50): Promise<{
  handoffs: SavingsBenefitPartnerHandoffItem[];
} & AdminQueuePage> {
  const res = await api.get<{ handoffs: SavingsBenefitPartnerHandoffItem[] } & AdminQueuePage>(
    `/api/admin/savings-benefits/handoffs?offset=${offset}&limit=${limit}`,
  );
  return res.data;
}

export async function transitionSavingsBenefitPartnerHandoff(
  actionId: string,
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'FAILED' | 'REVOKED',
  reason: string,
  deliveryReference?: string,
): Promise<void> {
  await api.post(`/api/admin/savings-benefits/handoffs/${actionId}/transition`, {
    status,
    reason,
    deliveryReference,
  });
}

export async function upsertSavingsBenefitPartner(
  partnerId: string,
  input: SavingsBenefitPartnerInput,
): Promise<void> {
  await api.put(`/api/admin/savings-benefits/partners/${partnerId}`, input);
}

export async function fetchSavingsBenefitPartnerComplaints(offset = 0, limit = 50): Promise<{
  complaints: SavingsBenefitPartnerComplaintItem[];
} & AdminQueuePage> {
  const res = await api.get<{ complaints: SavingsBenefitPartnerComplaintItem[] } & AdminQueuePage>(
    `/api/admin/savings-benefits/partner-complaints?status=OPEN&offset=${offset}&limit=${limit}`,
  );
  return res.data;
}

export async function resolveSavingsBenefitPartnerComplaint(
  complaintId: string,
  status: 'RESOLVED' | 'DISMISSED',
  resolution: string,
): Promise<void> {
  await api.post(
    `/api/admin/savings-benefits/partner-complaints/${complaintId}/resolve`,
    { status, resolution },
  );
}
