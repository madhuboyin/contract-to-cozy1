// apps/frontend/src/lib/api/adminPrivacyRequests.ts
//
// API client for the Admin Privacy Requests workspace
// (ADMIN_MODULE_FRD.md §11.4, Phase 3 slice). Tracking only — no data
// operations on the subject's account happen through this surface.

import { api } from '@/lib/api/client';

export type PrivacyRequestType = 'ACCESS_EXPORT' | 'CORRECTION' | 'DELETION' | 'RESTRICTION';
export type PrivacyRequestStatus =
  | 'RECEIVED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface PrivacyRequestRow {
  id: string;
  requestNumber: string;
  userId: string;
  userEmail: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  jurisdiction: string | null;
  dueAt: string | null;
  legalHold: boolean;
  identityVerifiedAt: string | null;
  identityVerifiedBy: string | null;
  resolutionSummary: string | null;
  completedAt: string | null;
  openedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivacyRequestListResult {
  requests: PrivacyRequestRow[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAdminPrivacyRequests(
  status?: PrivacyRequestStatus,
  type?: PrivacyRequestType,
  page = 1,
): Promise<PrivacyRequestListResult> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const res = await api.get<PrivacyRequestListResult>(`/api/admin/privacy-requests?${params.toString()}`);
  return res.data;
}

export async function fetchAdminPrivacyRequestDetail(requestId: string): Promise<PrivacyRequestRow> {
  const res = await api.get<PrivacyRequestRow>(`/api/admin/privacy-requests/${requestId}`);
  return res.data;
}

export async function createAdminPrivacyRequest(input: {
  userEmail: string;
  type: PrivacyRequestType;
  jurisdiction?: string;
}): Promise<PrivacyRequestRow> {
  const res = await api.post<PrivacyRequestRow>('/api/admin/privacy-requests', input);
  return res.data;
}

export async function changeAdminPrivacyRequestStatus(
  requestId: string,
  status: PrivacyRequestStatus,
  reason: string,
  resolutionSummary?: string,
): Promise<{ previousStatus: PrivacyRequestStatus; status: PrivacyRequestStatus }> {
  const res = await api.post<{ previousStatus: PrivacyRequestStatus; status: PrivacyRequestStatus }>(
    `/api/admin/privacy-requests/${requestId}/status`,
    { status, reason, resolutionSummary },
  );
  return res.data;
}

export async function setAdminPrivacyLegalHold(
  requestId: string,
  legalHold: boolean,
  reason: string,
): Promise<{ legalHold: boolean; noop: boolean }> {
  const res = await api.post<{ legalHold: boolean; noop: boolean }>(
    `/api/admin/privacy-requests/${requestId}/legal-hold`,
    { legalHold, reason },
  );
  return res.data;
}
