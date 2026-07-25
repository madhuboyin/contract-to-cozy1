'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CapabilitySuggestionDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/events';
import { cn } from '@/lib/utils';
import { appendCapabilityLaunchContext } from './capabilityCatalog';
import { resolveCapabilityIcon } from './capabilityIconRegistry';
import { capabilitySuggestionLaunchContext } from './capabilitySuggestionLaunchContext';
import { recordCapabilitySuggestionFeedback } from './capabilityApi';
import type { ToolDiscoverySurface } from './toolDiscoveryRegistry';
import { useCapabilityImpression } from './useCapabilityImpression';

export type InlineCapabilitySuggestionSurface = Extract<
  ToolDiscoverySurface,
  'workflow' | 'completion' | 'property_detail' | 'unified_home'
>;

export type InlineCapabilitySuggestionFeedback =
  | 'DISMISSED'
  | 'NOT_RELEVANT';

export interface InlineCapabilitySuggestionProps {
  suggestion: CapabilitySuggestionDTO;
  propertyId: string;
  registryVersion: string;
  surface: InlineCapabilitySuggestionSurface;
  position?: number;
  className?: string;
  controlsDisabled?: boolean;
  onDismiss?: (suggestion: CapabilitySuggestionDTO) => void | Promise<void>;
  onNotRelevant?: (suggestion: CapabilitySuggestionDTO) => void | Promise<void>;
  onOpen?: (suggestion: CapabilitySuggestionDTO) => void;
}

/**
 * Shared, non-modal renderer for a server-selected inline capability.
 *
 * Eligibility, ranking, copy, readiness, and destination remain server-owned.
 * Callers may opt into feedback controls by providing the corresponding
 * handler; the primitive never invents or persists a feedback decision.
 */
export function InlineCapabilitySuggestion({
  suggestion,
  propertyId,
  registryVersion,
  surface,
  position = 0,
  className,
  controlsDisabled = false,
  onDismiss,
  onNotRelevant,
  onOpen,
}: InlineCapabilitySuggestionProps) {
  const Icon = resolveCapabilityIcon(suggestion.iconName);
  const impressionRef = useCapabilityImpression<HTMLElement>({
    capabilityId: suggestion.capabilityId,
    propertyId,
    surface,
    registryVersion,
    manifestVersion: suggestion.manifestVersion,
    recommendationReason: suggestion.reasonCode,
    recommendationVersion: suggestion.recommendationVersion,
    contextVersion: suggestion.contextVersion,
    sourceActionId: suggestion.source.actionId,
    sourceEntityType: suggestion.source.entityType,
    sourceEntityId: suggestion.source.entityId,
    journeyId: suggestion.source.journeyId,
    sourceKind: suggestion.source.kind,
    sourceId: suggestion.source.id,
    readiness: suggestion.readiness.state,
  });
  const href = appendCapabilityLaunchContext(
    suggestion.launch.href,
    capabilitySuggestionLaunchContext(suggestion, surface),
  );
  const isReady = suggestion.readiness.state === 'READY';
  const readinessExplanation = suggestion.readiness.explanations[0]
    ?? (isReady
      ? 'Ready with the current home context.'
      : 'Add the requested context for a more useful result.');

  const handleOpen = () => {
    track('tool_discovery_clicked', {
      propertyId,
      surface,
      toolId: suggestion.capabilityId,
      manifestVersion: suggestion.manifestVersion,
      registryVersion,
      position,
      recommendationReason: suggestion.reasonCode,
      recommendationVersion: suggestion.recommendationVersion,
      contextVersion: suggestion.contextVersion,
      sourceActionId: suggestion.source.actionId,
      sourceEntityType: suggestion.source.entityType,
      sourceEntityId: suggestion.source.entityId,
      journeyId: suggestion.source.journeyId,
      sourceKind: suggestion.source.kind,
      sourceId: suggestion.source.id,
      readiness: suggestion.readiness.state,
    });
    void recordCapabilitySuggestionFeedback({
      propertyId,
      registryVersion,
      surface,
      suggestion,
      type: 'OPENED',
    }).catch(() => undefined);
    onOpen?.(suggestion);
  };

  return (
    <article
      ref={impressionRef}
      aria-label={`Suggested tool: ${suggestion.label}`}
      className={cn(
        'rounded-xl border border-indigo-200 bg-gradient-to-r from-white to-indigo-50/50 p-4 shadow-sm',
        className,
      )}
      data-capability-id={suggestion.capabilityId}
      data-testid={`inline-capability-${suggestion.capabilityId}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{suggestion.label}</h3>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full text-[10px]',
                isReady
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600',
              )}
            >
              {isReady ? 'Ready' : 'Needs context'}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-slate-700">
            {suggestion.whyNow}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {suggestion.expectedOutcome}
          </p>
          <p className="mt-2 text-xs leading-4 text-slate-500">
            {readinessExplanation}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-indigo-100 pt-3">
        {onNotRelevant ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            onClick={() => void onNotRelevant(suggestion)}
          >
            Not relevant
          </Button>
        ) : null}
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            onClick={() => void onDismiss(suggestion)}
          >
            Dismiss
          </Button>
        ) : null}
        <Button asChild size="sm">
          <Link
            href={href}
            onClick={handleOpen}
            data-testid={`inline-capability-open-${suggestion.capabilityId}`}
          >
            {suggestion.launch.label}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
