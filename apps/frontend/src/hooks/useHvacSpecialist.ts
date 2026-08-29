// apps/frontend/src/hooks/useHvacSpecialist.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getHvacSpecialistStatus,
  startHvacSpecialist,
  submitHvacSpecialistContext,
  type SpecialistResult,
} from '@/lib/api/hvacSpecialist';

function key(propertyId: string, inventoryItemId: string) {
  return ['hvac-specialist', propertyId, inventoryItemId];
}

export function useHvacSpecialistStatus(
  propertyId: string,
  inventoryItemId: string | null,
  options: { enabled?: boolean; homeActionId?: string } = {},
) {
  return useQuery({
    queryKey: key(propertyId, inventoryItemId ?? ''),
    queryFn: () => getHvacSpecialistStatus(propertyId, inventoryItemId as string, options.homeActionId),
    enabled: Boolean(inventoryItemId) && (options.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useStartHvacSpecialist(propertyId: string, inventoryItemId: string, homeActionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startHvacSpecialist(propertyId, inventoryItemId, homeActionId),
    onSuccess: (result: SpecialistResult) => {
      qc.setQueryData(key(propertyId, inventoryItemId), result);
    },
  });
}

export function useSubmitHvacSpecialistContext(propertyId: string, inventoryItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { contextIntake: Record<string, unknown>; expectedCasVersion?: number }) =>
      submitHvacSpecialistContext(propertyId, inventoryItemId, vars.contextIntake, vars.expectedCasVersion),
    onSuccess: (result: SpecialistResult) => {
      qc.setQueryData(key(propertyId, inventoryItemId), result);
      qc.invalidateQueries({ queryKey: ['home-actions'] });
      qc.invalidateQueries({ queryKey: ['unified-home'] });
    },
  });
}
