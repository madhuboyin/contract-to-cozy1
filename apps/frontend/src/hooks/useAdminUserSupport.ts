// apps/frontend/src/hooks/useAdminUserSupport.ts
//
// React Query hooks for the Admin User & Account Support workspace.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeAdminUserStatus,
  fetchAdminUserSummary,
  GovernedUserStatus,
  revokeAdminUserSessions,
  searchAdminUsers,
} from '@/lib/api/adminUserSupport';

export function useAdminUserSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['admin-user-search', query],
    queryFn: () => searchAdminUsers(query),
    enabled: enabled && query.trim().length > 0,
    staleTime: 15_000,
  });
}

export function useAdminUserSummary(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['admin-user-summary', userId],
    queryFn: () => fetchAdminUserSummary(userId as string),
    enabled: enabled && !!userId,
    staleTime: 5_000,
  });
}

export function useRevokeAdminUserSessions(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => revokeAdminUserSessions(userId as string, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user-summary', userId] });
    },
  });
}

export function useChangeAdminUserStatus(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason }: { status: GovernedUserStatus; reason: string }) =>
      changeAdminUserStatus(userId as string, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user-summary', userId] });
      qc.invalidateQueries({ queryKey: ['admin-user-search'] });
    },
  });
}
