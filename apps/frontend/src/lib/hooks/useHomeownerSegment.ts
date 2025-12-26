

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export function useHomeownerSegment() {
  return useQuery({
    queryKey: ['homeowner-segment'],
    queryFn: async () => {
      const response = await api.getUserProfile();
      // request() throws on error, so response is always APISuccess<T> when it returns
      if ('data' in response) {
        return response.data?.homeownerProfile?.segment || null;
      }
      return null;
    },
  });
}