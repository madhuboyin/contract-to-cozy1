'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export function useToolDiscoveryAvailability() {
  return useQuery({
    queryKey: ['tool-discovery-availability'],
    queryFn: () => api.getToolDiscoveryAvailability(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
