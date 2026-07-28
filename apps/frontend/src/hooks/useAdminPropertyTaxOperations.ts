import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disablePropertyTaxRule,
  emergencyDisablePropertyTaxAi,
  fetchPropertyTaxOperations,
  setPropertyTaxSourceEnabled,
} from '@/lib/api/adminPropertyTaxOperations';

const OPERATIONS_KEY = ['admin-property-tax-operations'];

export function useAdminPropertyTaxOperations(enabled = true) {
  return useQuery({
    queryKey: OPERATIONS_KEY,
    queryFn: fetchPropertyTaxOperations,
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminPropertyTaxCommands() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: OPERATIONS_KEY });

  return {
    source: useMutation({
      mutationFn: ({
        sourceId,
        enabled,
        reason,
      }: {
        sourceId: string;
        enabled: boolean;
        reason: string;
      }) => setPropertyTaxSourceEnabled(sourceId, enabled, reason),
      onSuccess: refresh,
    }),
    rule: useMutation({
      mutationFn: ({ profileId, reason }: { profileId: string; reason: string }) =>
        disablePropertyTaxRule(profileId, reason),
      onSuccess: refresh,
    }),
    ai: useMutation({
      mutationFn: (reason: string) => emergencyDisablePropertyTaxAi(reason),
      onSuccess: refresh,
    }),
  };
}
