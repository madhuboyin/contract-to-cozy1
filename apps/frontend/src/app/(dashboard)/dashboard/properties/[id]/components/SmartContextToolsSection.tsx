'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { CapabilitySuggestionDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { appendCapabilityLaunchContext } from '@/features/tools/capabilityCatalog';
import {
  capabilitySuggestionLaunchContext,
} from '@/features/tools/capabilitySuggestionLaunchContext';
import { getDiscoverableTool } from '@/features/tools/toolDiscoveryRegistry';
import { useCapabilityImpression } from '@/features/tools/useCapabilityImpression';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';

function ToolRow({
  suggestion,
  propertyId,
  registryVersion,
  position,
  showExplainability = false,
}: {
  suggestion: CapabilitySuggestionDTO;
  propertyId: string;
  registryVersion: string;
  position: number;
  showExplainability?: boolean;
}) {
  const tool = getDiscoverableTool(suggestion.capabilityId);
  const Icon = tool?.icon ?? Sparkles;
  const launchContext = capabilitySuggestionLaunchContext(
    suggestion,
    'property_detail',
  );
  const impressionRef = useCapabilityImpression<HTMLAnchorElement>({
    capabilityId: suggestion.capabilityId,
    propertyId,
    surface: 'property_detail',
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
    launchContext,
  );
  const readinessExplanation = suggestion.readiness.explanations[0]
    ?? (suggestion.readiness.state === 'READY'
      ? 'Ready with the current property context.'
      : 'Add the requested context for a more useful result.');

  return (
    <article className="group rounded-lg border border-border/50 bg-background px-3.5 py-3 transition-colors hover:border-border hover:bg-muted/20">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition-colors group-hover:bg-muted">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground/90">
              {suggestion.label}
            </p>
            <Badge
              variant="outline"
              className={
                suggestion.readiness.state === 'READY'
                  ? 'border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600'
              }
            >
              {suggestion.readiness.state === 'READY'
                ? 'Recommended'
                : 'Needs context'}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/75">Why now:</span>{' '}
            {suggestion.whyNow}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/75">Value:</span>{' '}
            {suggestion.expectedOutcome}
          </p>
          {showExplainability ? (
            <details className="mt-1">
              <summary className="cursor-pointer select-none list-none text-[11px] text-muted-foreground/65 transition-colors hover:text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span className="underline decoration-dotted underline-offset-2">
                  Why this recommendation?
                </span>
              </summary>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {readinessExplanation}
              </p>
            </details>
          ) : null}
        </div>
        <Link
          ref={impressionRef}
          href={href}
          data-testid={`smart-context-tool-${suggestion.capabilityId}`}
          onClick={() => {
            track('tool_discovery_clicked', {
              propertyId,
              surface: 'property_detail',
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
            if (suggestion.source.actionId) {
              void api.recordHomeActionOpened(
                propertyId,
                suggestion.source.actionId,
              ).catch(() => undefined);
            }
          }}
          className="mt-0.5 inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}

interface SmartContextToolsSectionProps {
  propertyId: string;
}

export function SmartContextToolsSection({
  propertyId,
}: SmartContextToolsSectionProps) {
  const query = useQuery({
    queryKey: ['capability-suggestions', propertyId, 'PROPERTY', 3],
    queryFn: () => api.getCapabilitySuggestions(propertyId, {
      surface: 'PROPERTY',
      limit: 3,
    }),
    staleTime: 2 * 60 * 1000,
  });
  const suggestions = query.data?.suggestions.slice(0, 3) ?? [];

  return (
    <section className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 sm:px-4">
      <div className="mb-2 space-y-1">
        <p className="text-[11px] font-medium tracking-normal text-muted-foreground/70">
          Smart context tools
        </p>
        <p className="text-xs text-muted-foreground">
          Recommendation-first tools matched to your home&apos;s current signals.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-1.5">
          <div className="h-[76px] animate-pulse rounded-lg border border-border/60 bg-background/70" />
          <div className="h-[76px] animate-pulse rounded-lg border border-border/60 bg-background/70" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-border/60 bg-background px-3.5 py-3 text-xs text-muted-foreground">
          Smart tool recommendations are temporarily unavailable. You can still browse all tools.
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
          No high-confidence tool picks right now. You can still explore the full tools library.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {suggestions.map((suggestion, index) => (
            <ToolRow
              key={suggestion.suggestionId}
              suggestion={suggestion}
              propertyId={propertyId}
              registryVersion={query.data!.registryVersion}
              position={index}
              showExplainability={index === 0}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end">
        <Link
          href={`/dashboard/home-tools?propertyId=${encodeURIComponent(propertyId)}`}
          className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        >
          All tools
          <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </section>
  );
}
