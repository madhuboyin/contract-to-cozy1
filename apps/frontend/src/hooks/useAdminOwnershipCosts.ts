import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchOwnershipCostLaunchGate,
  fetchOwnershipCostOperations,
  replayOwnershipCostSnapshot,
} from '@/lib/api/adminOwnershipCosts';

export function useAdminOwnershipCostOperations(
  enabled = true,
  windowDays = 30,
) {
  return useQuery({
    queryKey: ['admin-ownership-cost-operations', windowDays],
    queryFn: () => fetchOwnershipCostOperations(windowDays),
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminOwnershipCostLaunchGate(enabled = true) {
  return useQuery({
    queryKey: ['admin-ownership-cost-launch-gate'],
    queryFn: fetchOwnershipCostLaunchGate,
    enabled,
    staleTime: 30_000,
  });
}

export function useOwnershipCostReplay() {
  return useMutation({ mutationFn: replayOwnershipCostSnapshot });
}
