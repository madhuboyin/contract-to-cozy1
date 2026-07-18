// apps/frontend/src/hooks/useAdminProviderOps.ts
//
// React Query hooks for the Admin Provider Operations directory.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeAdminProviderStatus,
  fetchAdminProviderDetail,
  fetchAdminProviders,
  GovernedProviderStatus,
  ProviderStatus,
} from '@/lib/api/adminProviderOps';

export function useAdminProviderSearch(q: string, status: ProviderStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['admin-provider-directory', q, status ?? 'ALL', page],
    queryFn: () => fetchAdminProviders(q, status, page),
    staleTime: 15_000,
  });
}

export function useAdminProviderDetail(providerProfileId: string | null) {
  return useQuery({
    queryKey: ['admin-provider-detail', providerProfileId],
    queryFn: () => fetchAdminProviderDetail(providerProfileId as string),
    enabled: !!providerProfileId,
    staleTime: 5_000,
  });
}

export function useChangeAdminProviderStatus(providerProfileId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason }: { status: GovernedProviderStatus; reason: string }) =>
      changeAdminProviderStatus(providerProfileId as string, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-provider-detail', providerProfileId] });
      qc.invalidateQueries({ queryKey: ['admin-provider-directory'] });
    },
  });
}
