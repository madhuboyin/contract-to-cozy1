'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { CapabilitySuggestionDTO, UnifiedHomeDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import { appendCapabilityLaunchContext } from '@/features/tools/capabilityCatalog';
import {
  capabilitySuggestionLaunchContext,
} from '@/features/tools/capabilitySuggestionLaunchContext';
import { getDiscoverableTool } from '@/features/tools/toolDiscoveryRegistry';
import { useCapabilityImpression } from '@/features/tools/useCapabilityImpression';

function CapabilitySuggestionCard({
  suggestion,
  propertyId,
  registryVersion,
  position,
}: {
  suggestion: CapabilitySuggestionDTO;
  propertyId: string;
  registryVersion: string;
  position: number;
}) {
  const tool = getDiscoverableTool(suggestion.capabilityId);
  const ToolIcon = tool?.icon ?? Sparkles;
  const launchContext = capabilitySuggestionLaunchContext(
    suggestion,
    'unified_home',
  );
  const impressionRef = useCapabilityImpression<HTMLAnchorElement>({
    capabilityId: suggestion.capabilityId,
    propertyId,
    surface: 'unified_home',
    registryVersion,
    recommendationReason: suggestion.reasonCode,
    recommendationVersion: suggestion.recommendationVersion,
    contextVersion: suggestion.contextVersion,
  });
  const href = appendCapabilityLaunchContext(
    suggestion.launch.href,
    launchContext,
  );
  const readinessExplanation = suggestion.readiness.explanations[0]
    ?? (suggestion.readiness.state === 'READY'
      ? 'Ready with the current Home Record.'
      : 'Add the requested context for a more useful result.');

  return (
    <Link
      ref={impressionRef}
      href={href}
      data-testid={`unified-home-tool-${suggestion.capabilityId}`}
      onClick={() => {
        track('tool_discovery_clicked', {
          propertyId,
          surface: 'unified_home',
          toolId: suggestion.capabilityId,
          position,
          recommendationReason: suggestion.reasonCode,
          recommendationVersion: suggestion.recommendationVersion,
          contextVersion: suggestion.contextVersion,
          sourceActionId: suggestion.source.actionId,
          sourceEntityType: suggestion.source.entityType,
          sourceEntityId: suggestion.source.entityId,
          journeyId: suggestion.source.journeyId,
        });
        if (suggestion.source.actionId) {
          void api.recordHomeActionOpened(
            propertyId,
            suggestion.source.actionId,
          );
        }
      }}
      className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
          <ToolIcon className="h-5 w-5" />
        </div>
        <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-[10px] text-indigo-700">
          {suggestion.readiness.state === 'READY'
            ? 'Ready for this home'
            : 'Needs more context'}
        </Badge>
      </div>
      <h3 className="mt-3 font-semibold text-slate-950">{suggestion.label}</h3>
      <p className="mt-2 text-sm leading-5 text-slate-700">{suggestion.whyNow}</p>
      <p className="mt-2 text-sm leading-5 text-slate-500">
        {suggestion.expectedOutcome}
      </p>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {readinessExplanation}
      </p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
        {suggestion.launch.label}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function emptyStateMessage(
  status: UnifiedHomeDTO['capabilitySuggestions']['status'] | 'UNAVAILABLE',
): string {
  if (status === 'DISABLED') {
    return 'Contextual suggestions are paused. You can still browse every available tool.';
  }
  if (status === 'UNAVAILABLE') {
    return 'Suggestions are temporarily unavailable. Explore Tools remains available.';
  }
  return 'No additional tool is recommended right now. Browse Explore Tools whenever you need one.';
}

export function UnifiedHomeToolsSection({
  home,
  propertyId,
}: {
  home: UnifiedHomeDTO;
  propertyId: string;
}) {
  const envelope = home.capabilitySuggestions;
  const status = envelope?.status ?? 'UNAVAILABLE';
  const recommendations = status === 'AVAILABLE'
    ? envelope.suggestions.slice(0, 3)
    : [];
  const exploreToolsHref =
    `/dashboard/home-tools?propertyId=${encodeURIComponent(propertyId)}`
    + `&backTo=${encodeURIComponent('/dashboard')}`;

  return (
    <section aria-labelledby="home-tools-heading" className="rounded-[24px] border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="home-tools-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Sparkles className="h-5 w-5 text-indigo-600" />Tools for this home
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Useful next steps selected from this home’s ranked actions and current record.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit rounded-full bg-white">
          <Link href={exploreToolsHref}>
            Explore all tools
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {recommendations.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {recommendations.map((suggestion, index) => (
            <CapabilitySuggestionCard
              key={suggestion.suggestionId}
              suggestion={suggestion}
              propertyId={propertyId}
              registryVersion={envelope.registryVersion}
              position={index}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-indigo-100 bg-white/80 p-4 text-sm text-slate-600">
          {emptyStateMessage(status)}
        </p>
      )}
    </section>
  );
}
