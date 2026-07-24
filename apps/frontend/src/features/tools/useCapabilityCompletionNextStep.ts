'use client';

import { useMutation } from '@tanstack/react-query';
import {
  recordCapabilityCompletionAndGetNext,
  type CapabilityCompletionNextRequest,
} from './capabilityApi';

/**
 * Completion integrations invoke mutate only after their primary workflow has
 * committed and can provide the durable output entity identity.
 */
export function useCapabilityCompletionNextStep() {
  return useMutation({
    mutationFn: (request: CapabilityCompletionNextRequest) =>
      recordCapabilityCompletionAndGetNext(request),
  });
}
