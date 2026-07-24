'use client';

import type { CapabilitySuggestionDTO } from '@/types';
import {
  InlineCapabilitySuggestion,
  type InlineCapabilitySuggestionProps,
} from './InlineCapabilitySuggestion';
import type { InlineCapabilityContext } from './inlineCapabilityContext';
import { useInlineCapabilitySuggestion } from './useInlineCapabilitySuggestion';

export type InlineCapabilitySuggestionSlotProps =
  InlineCapabilityContext &
  Pick<
    InlineCapabilitySuggestionProps,
    | 'className'
    | 'controlsDisabled'
    | 'onDismiss'
    | 'onNotRelevant'
    | 'onOpen'
  > & {
    enabled?: boolean;
  };

/**
 * Integration boundary for inline discovery. Feature modules contribute only
 * source context and placement; the server selects zero or one capability.
 */
export function InlineCapabilitySuggestionSlot({
  enabled = true,
  className,
  controlsDisabled,
  onDismiss,
  onNotRelevant,
  onOpen,
  ...context
}: InlineCapabilitySuggestionSlotProps) {
  const query = useInlineCapabilitySuggestion(context, { enabled });
  const suggestion: CapabilitySuggestionDTO | undefined =
    query.data?.suggestions[0];

  if (!suggestion) return null;

  return (
    <InlineCapabilitySuggestion
      suggestion={suggestion}
      propertyId={context.propertyId}
      registryVersion={query.data!.registryVersion}
      surface={context.placementSurface}
      className={className}
      controlsDisabled={controlsDisabled}
      onDismiss={onDismiss}
      onNotRelevant={onNotRelevant}
      onOpen={onOpen}
    />
  );
}
