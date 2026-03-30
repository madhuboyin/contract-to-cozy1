import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getPropertyGuidance,
  GuidanceIssueDomain,
  GuidanceNextStepResult,
} from '@/lib/api/guidanceApi';
import {
  filterGuidanceActions,
  mapGuidanceJourneyToActionModel,
} from '../utils/guidanceMappers';

type UseGuidanceOptions = {
  enabled?: boolean;
  issueDomains?: readonly GuidanceIssueDomain[];
  toolKey?: string;
  limit?: number;
  userSelectedScopeId?: string;
};

export function useGuidance(propertyId: string | null | undefined, options?: UseGuidanceOptions) {
  const userSelectedScopeId = options?.userSelectedScopeId;
  const query = useQuery({
    queryKey: ['guidance', 'property', propertyId, userSelectedScopeId],
    queryFn: async () => {
      if (!propertyId) throw new Error('Property ID is required');
      return getPropertyGuidance(propertyId, { userSelectedScopeId });
    },
    enabled: Boolean(propertyId) && (options?.enabled ?? true),
    staleTime: 20_000,
  });

  const nextByJourney = useMemo(() => {
    const map = new Map<string, GuidanceNextStepResult>();
    for (const item of query.data?.next ?? []) {
      map.set(item.journeyId, item);
    }
    return map;
  }, [query.data?.next]);

  const actions = useMemo(() => {
    if (!query.data || !propertyId) return [];

    // Filter out DISMISSED journeys — they are not visible to users
    const visibleJourneys = query.data.journeys.filter((j) => j.status !== 'DISMISSED');

    const base = visibleJourneys.map((journey) =>
      mapGuidanceJourneyToActionModel({
        propertyId,
        journey,
        next: nextByJourney.get(journey.id) ?? null,
      })
    );

    return filterGuidanceActions(base, {
      issueDomains: options?.issueDomains,
      toolKey: options?.toolKey,
      limit: options?.limit,
    });
  }, [nextByJourney, options?.issueDomains, options?.limit, options?.toolKey, propertyId, query.data]);

  return {
    ...query,
    counts: query.data?.counts ?? null,
    signals: query.data?.signals ?? [],
    journeys: query.data?.journeys ?? [],
    actions,
    nextByJourney,
  };
}
