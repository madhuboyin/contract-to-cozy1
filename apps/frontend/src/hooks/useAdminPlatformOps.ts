// apps/frontend/src/hooks/useAdminPlatformOps.ts
//
// React Query hooks for the Phase 5 platform-operations UIs.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BackfillInput,
  fetchReleaseGateSummary,
  fetchSharedDataConsistency,
  fetchSharedDataDiagnostics,
  runSharedDataBackfill,
} from '@/lib/api/adminPlatformOps';

export function useSharedDataDiagnostics() {
  return useQuery({
    queryKey: ['admin-shared-data-diagnostics'],
    queryFn: fetchSharedDataDiagnostics,
    staleTime: 60_000,
  });
}

export function useSharedDataConsistency() {
  return useQuery({
    queryKey: ['admin-shared-data-consistency'],
    queryFn: fetchSharedDataConsistency,
    staleTime: 60_000,
  });
}

export function useRunSharedDataBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BackfillInput) => runSharedDataBackfill(input),
    onSuccess: (_result, input) => {
      if (!input.dryRun) {
        qc.invalidateQueries({ queryKey: ['admin-shared-data-diagnostics'] });
        qc.invalidateQueries({ queryKey: ['admin-shared-data-consistency'] });
      }
    },
  });
}

export function useReleaseGateSummary() {
  return useQuery({
    queryKey: ['admin-release-gates'],
    queryFn: fetchReleaseGateSummary,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}
