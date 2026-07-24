'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CapabilityCompletionNextResponseDTO } from '@/types';
import { InlineCapabilitySuggestion } from './InlineCapabilitySuggestion';

export interface PostCompletionCapabilityNextStepProps {
  result: CapabilityCompletionNextResponseDTO | null | undefined;
  className?: string;
}

/**
 * Bounded completion handoff: zero or one server-selected primary next step
 * with Explore Tools retained as the non-promotional fallback.
 */
export function PostCompletionCapabilityNextStep({
  result,
  className,
}: PostCompletionCapabilityNextStepProps) {
  if (!result) return null;

  if (!result.suggestion) {
    return (
      <Link
        href={result.exploreToolsHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-800"
      >
        Explore tools
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <section
      aria-label="Recommended next step"
      className={className}
      data-testid="post-completion-next-step"
    >
      <InlineCapabilitySuggestion
        suggestion={result.suggestion}
        propertyId={result.propertyId}
        registryVersion={result.registryVersion}
        surface="completion"
      />
      <div className="mt-2 flex justify-end">
        <Link
          href={result.exploreToolsHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          Explore all tools
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
