import { useQuery } from '@tanstack/react-query';
import { getGuidanceJourneyDetail } from '@/lib/api/guidanceApi';

export function useJourney(propertyId: string | null | undefined, journeyId: string | null | undefined) {
  return useQuery({
    queryKey: ['guidance', 'journey', propertyId, journeyId],
    queryFn: async () => {
      if (!propertyId || !journeyId) throw new Error('Property ID and journey ID are required');
      return getGuidanceJourneyDetail(propertyId, journeyId);
    },
    enabled: Boolean(propertyId && journeyId),
    staleTime: 20_000,
  });
}
