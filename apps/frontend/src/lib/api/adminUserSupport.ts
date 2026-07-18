// apps/frontend/src/lib/api/adminUserSupport.ts
//
// API client for the Admin User & Account Support workspace
// (ADMIN_MODULE_FRD.md §10.1, Phase 1). Admin-only — never used by
// homeowner/provider self-service pages.

import { api } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserSearchResult['role'];
  status: UserSearchResult['status'];
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  tokenVersion: number;
  lastLoginAt: string | null;
  tosAcceptedAt: string | null;
  tosVersion: string | null;
  createdAt: string;
  activeSessionCount: number;
  homeownerProfile: { propertyCount: number } | null;
  providerProfile: {
    businessName: string;
    businessType: string | null;
    status: string;
    insuranceVerified: boolean;
    licenseVerified: boolean;
    averageRating: number;
    totalReviews: number;
    totalCompletedJobs: number;
  } | null;
}

export type GovernedUserStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

// ─── API functions ────────────────────────────────────────────────────────────

export async function searchAdminUsers(q: string): Promise<UserSearchResult[]> {
  const res = await api.get<UserSearchResult[]>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  return res.data;
}

export async function fetchAdminUserSummary(userId: string): Promise<UserSummary> {
  const res = await api.get<UserSummary>(`/api/admin/users/${userId}`);
  return res.data;
}

export async function revokeAdminUserSessions(
  userId: string,
  reason: string,
): Promise<{ revokedSessionCount: number }> {
  const res = await api.post<{ revokedSessionCount: number }>(
    `/api/admin/users/${userId}/sessions/revoke`,
    { reason },
  );
  return res.data;
}

export async function changeAdminUserStatus(
  userId: string,
  status: GovernedUserStatus,
  reason: string,
): Promise<{ previousStatus: string; status: string; noop: boolean }> {
  const res = await api.post<{ previousStatus: string; status: string; noop: boolean }>(
    `/api/admin/users/${userId}/status`,
    { status, reason },
  );
  return res.data;
}
