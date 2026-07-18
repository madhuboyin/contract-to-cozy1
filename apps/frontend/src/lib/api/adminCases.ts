// apps/frontend/src/lib/api/adminCases.ts
//
// API client for Admin case management (ADMIN_MODULE_FRD.md §10.5 safety/
// abuse case types + Phase 1 cross-domain case foundation).

import { api } from '@/lib/api/client';

export type AdminCaseType = 'SAFETY' | 'ABUSE' | 'REVIEW_INVESTIGATION' | 'SUPPORT';
export type AdminCaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AdminCaseStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface AdminCaseRow {
  id: string;
  caseNumber: string;
  type: AdminCaseType;
  severity: AdminCaseSeverity;
  status: AdminCaseStatus;
  title: string;
  entityType: string | null;
  entityId: string | null;
  openedById: string;
  assignedToId: string | null;
  openedByName: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCaseListResult {
  cases: AdminCaseRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminCaseNote {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface AdminCaseDetail extends AdminCaseRow {
  description: string;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  notes: AdminCaseNote[];
}

export interface CaseListFilters {
  type?: AdminCaseType;
  status?: AdminCaseStatus;
  severity?: AdminCaseSeverity;
  page?: number;
}

export async function fetchAdminCases(filters: CaseListFilters = {}): Promise<AdminCaseListResult> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) });
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.severity) params.set('severity', filters.severity);
  const res = await api.get<AdminCaseListResult>(`/api/admin/cases?${params.toString()}`);
  return res.data;
}

export async function fetchAdminCaseDetail(caseId: string): Promise<AdminCaseDetail> {
  const res = await api.get<AdminCaseDetail>(`/api/admin/cases/${caseId}`);
  return res.data;
}

export interface CreateCaseInput {
  type: AdminCaseType;
  severity: AdminCaseSeverity;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
}

export async function createAdminCase(input: CreateCaseInput): Promise<AdminCaseRow> {
  const res = await api.post<AdminCaseRow>('/api/admin/cases', input);
  return res.data;
}

export async function changeAdminCaseStatus(
  caseId: string,
  status: AdminCaseStatus,
  reason: string,
  resolution?: string,
): Promise<{ previousStatus: AdminCaseStatus; status: AdminCaseStatus }> {
  const res = await api.post<{ previousStatus: AdminCaseStatus; status: AdminCaseStatus }>(
    `/api/admin/cases/${caseId}/status`,
    { status, reason, resolution },
  );
  return res.data;
}

export async function addAdminCaseNote(caseId: string, body: string): Promise<AdminCaseNote> {
  const res = await api.post<AdminCaseNote>(`/api/admin/cases/${caseId}/notes`, { body });
  return res.data;
}

export async function requestReviewInvestigation(
  reviewId: string,
  reason: string,
  severity?: AdminCaseSeverity,
): Promise<AdminCaseRow> {
  const res = await api.post<AdminCaseRow>(`/api/admin/reviews/${reviewId}/request-investigation`, {
    reason,
    severity,
  });
  return res.data;
}
