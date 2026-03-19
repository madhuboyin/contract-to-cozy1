import { useQuery } from '@tanstack/react-query';
import {
  getGuidanceExecutionGuard,
  GuidanceExecutionTargetAction,
} from '@/lib/api/guidanceApi';

type UseExecutionGuardOptions = {
  enabled?: boolean;
  journeyId?: string;
  inventoryItemId?: string;
  homeAssetId?: string;
};

export function useExecutionGuard(
  propertyId: string | null | undefined,
  targetAction: GuidanceExecutionTargetAction,
  options?: UseExecutionGuardOptions
) {
  return useQuery({
    queryKey: [
      'guidance',
      'execution-guard',
      propertyId,
      targetAction,
      options?.journeyId,
      options?.inventoryItemId,
      options?.homeAssetId,
    ],
    queryFn: async () => {
      if (!propertyId) throw new Error('Property ID is required');
      return getGuidanceExecutionGuard(propertyId, targetAction, {
        journeyId: options?.journeyId,
        inventoryItemId: options?.inventoryItemId,
        homeAssetId: options?.homeAssetId,
      });
    },
    enabled: Boolean(propertyId) && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}
