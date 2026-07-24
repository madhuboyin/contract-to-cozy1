'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCapabilityCatalog, type CapabilityCatalogRequest } from './capabilityApi';

export function useCapabilityCatalog(
  request: CapabilityCatalogRequest = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      'capability-catalog',
      request.propertyId ?? null,
      request.includeWorkflowContext ?? false,
    ],
    queryFn: () => fetchCapabilityCatalog(request),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
