'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchRelatedCapabilities,
  type RelatedCapabilitiesRequest,
} from './capabilityApi';
import { shouldRetryCapabilityQuery } from './capabilityQueryPolicy';

export function useRelatedCapabilities(
  request: RelatedCapabilitiesRequest | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [
      'related-capabilities',
      request?.propertyId ?? null,
      request?.currentCapabilityId ?? null,
      request?.limit ?? 3,
      request?.sourceEntityType ?? null,
      request?.workflowContextTypes ?? [],
    ],
    queryFn: () => fetchRelatedCapabilities(request!),
    enabled: Boolean(request) && (options.enabled ?? true),
    staleTime: 2 * 60 * 1000,
    retry: shouldRetryCapabilityQuery,
  });
}
