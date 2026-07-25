'use client';

import { useState } from 'react';
import type { CapabilitySuggestionDTO } from '@/types';
import {
  InlineCapabilitySuggestion,
  type InlineCapabilitySuggestionProps,
} from './InlineCapabilitySuggestion';
import type { InlineCapabilityContext } from './inlineCapabilityContext';
import { useInlineCapabilitySuggestion } from './useInlineCapabilitySuggestion';
import { recordCapabilitySuggestionFeedback } from './capabilityApi';

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
  const [hiddenSuggestionId, setHiddenSuggestionId] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const query = useInlineCapabilitySuggestion(context, { enabled });
  const suggestion: CapabilitySuggestionDTO | undefined =
    query.data?.suggestions[0];

  if (!suggestion || hiddenSuggestionId === suggestion.suggestionId) return null;

  const submitNegativeFeedback = async (
    type: 'DISMISSED' | 'NOT_RELEVANT',
    callback?: (value: CapabilitySuggestionDTO) => void | Promise<void>,
  ) => {
    setFeedbackPending(true);
    try {
      await recordCapabilitySuggestionFeedback({
        propertyId: context.propertyId,
        registryVersion: query.data!.registryVersion,
        surface: context.placementSurface,
        suggestion,
        type,
        reasonCode: type === 'NOT_RELEVANT' ? 'NOT_APPLICABLE' : 'OTHER',
      });
      setHiddenSuggestionId(suggestion.suggestionId);
      await callback?.(suggestion);
    } finally {
      setFeedbackPending(false);
    }
  };

  return (
    <InlineCapabilitySuggestion
      suggestion={suggestion}
      propertyId={context.propertyId}
      registryVersion={query.data!.registryVersion}
      surface={context.placementSurface}
      className={className}
      controlsDisabled={controlsDisabled || feedbackPending}
      onDismiss={() => submitNegativeFeedback('DISMISSED', onDismiss)}
      onNotRelevant={() =>
        submitNegativeFeedback('NOT_RELEVANT', onNotRelevant)}
      onOpen={onOpen}
    />
  );
}
