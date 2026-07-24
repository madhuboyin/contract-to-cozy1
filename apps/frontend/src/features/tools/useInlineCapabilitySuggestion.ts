'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchCapabilitySuggestions,
  type CapabilitySuggestionsRequest,
} from './capabilityApi';
import {
  buildInlineCapabilityRequest,
  type InlineCapabilityContext,
} from './inlineCapabilityContext';

export function useInlineCapabilitySuggestion(
  context: InlineCapabilityContext | null,
  options: { enabled?: boolean } = {},
) {
  const request: CapabilitySuggestionsRequest | null = context
    ? buildInlineCapabilityRequest(context)
    : null;

  return useQuery({
    queryKey: [
      'inline-capability-suggestion',
      request?.propertyId ?? null,
      request?.surface ?? null,
      request?.sourceKind ?? null,
      request?.sourceId ?? null,
      request?.sourceActionId ?? null,
      request?.sourceEntityType ?? null,
      request?.sourceEntityId ?? null,
      request?.sourceEventType ?? null,
    ],
    queryFn: () => fetchCapabilitySuggestions(request!),
    enabled: Boolean(request) && (options.enabled ?? true),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
