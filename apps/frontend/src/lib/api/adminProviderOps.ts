// apps/frontend/src/lib/api/adminProviderOps.ts
//
// API client for the Admin Provider Operations directory
// (ADMIN_MODULE_FRD.md §10.2, Phase 2 slice).

import { api } from '@/lib/api/client';

export type ProviderStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type GovernedProviderStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface ProviderDirectoryRow {
  id: string;
  businessName: string;
  status: ProviderStatus;
  serviceCategories: string[];
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  insuranceVerified: boolean;
  licenseVerified: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; status: string };
  pendingCredentialCount: number;
  openComplianceAlertCount: number;
}

export interface ProviderDirectoryResult {
  providers: ProviderDirectoryRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ProviderCredentialRow {
  id: string;
  type: string;
  status: string;
  issuingAuthority: string;
  issueDate: string | null;
  expiryDate: string | null;
  serviceCategories: string[];
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface ProviderComplianceAlertRow {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

export interface ProviderDetail extends Omit<ProviderDirectoryRow, 'pendingCredentialCount' | 'openComplianceAlertCount' | 'user'> {
  businessType: string | null;
  serviceRadius: number;
  yearsInBusiness: number | null;
  teamSize: number | null;
  website: string | null;
  backgroundCheckDate: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
  };
  credentials: ProviderCredentialRow[];
  complianceAlerts: ProviderComplianceAlertRow[];
  services: { id: string; name: string; category: string; isActive: boolean }[];
  bookingCounts: Record<string, number>;
  reviewCounts: Record<string, number>;
}

export async function fetchAdminProviders(
  q: string,
  status?: ProviderStatus,
  page = 1,
): Promise<ProviderDirectoryResult> {
  const params = new URLSearchParams({ page: String(page) });
  if (q.trim()) params.set('q', q.trim());
  if (status) params.set('status', status);
  const res = await api.get<ProviderDirectoryResult>(`/api/admin/providers?${params.toString()}`);
  return res.data;
}

export async function fetchAdminProviderDetail(providerProfileId: string): Promise<ProviderDetail> {
  const res = await api.get<ProviderDetail>(`/api/admin/providers/${providerProfileId}`);
  return res.data;
}

export async function changeAdminProviderStatus(
  providerProfileId: string,
  status: GovernedProviderStatus,
  reason: string,
): Promise<{ previousStatus: string; status: string; noop: boolean }> {
  const res = await api.post<{ previousStatus: string; status: string; noop: boolean }>(
    `/api/admin/providers/${providerProfileId}/status`,
    { status, reason },
  );
  return res.data;
}
