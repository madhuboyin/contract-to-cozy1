'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { getGuidanceJourneyDetail } from '@/lib/api/guidanceApi';
import {
  findDiscoverableToolByHref,
  type ToolLaunchContext,
} from './toolDiscoveryRegistry';
import { parseToolLaunchContext } from './capabilitySuggestionLaunchContext';
import { hasRecentToolCompletion, persistToolLifecycleEvent } from './toolLifecycleTelemetry';
import {
  resolveToolDestinationContext,
  type ResolvedToolDestinationContext,
} from './toolDestinationContext';

export type ToolLaunchContextValue = {
  toolId: string;
  propertyId: string;
  context: ToolLaunchContext;
  resolved: ResolvedToolDestinationContext;
  isResolving: boolean;
} | null;

const Context = createContext<ToolLaunchContextValue>(null);
const PROPERTY_TOOL_PATH = /^\/dashboard\/properties\/([^/]+)\/tools\//;

function readPropertyId(pathname: string, selectedPropertyId?: string | null): string | null {
  const match = pathname.match(PROPERTY_TOOL_PATH);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return selectedPropertyId ?? null;
}

export function useToolLaunchContext(): ToolLaunchContextValue {
  return useContext(Context);
}

export function ToolLaunchContextBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const query = searchParams.toString();

  const baseValue = useMemo(() => {
    const href = query ? `${pathname}?${query}` : pathname;
    const tool = findDiscoverableToolByHref(href);
    const propertyId = readPropertyId(pathname, selectedPropertyId);
    if (!tool || !propertyId) return null;

    return {
      toolId: tool.id,
      propertyId,
      context: parseToolLaunchContext(searchParams),
    };
  }, [pathname, query, searchParams, selectedPropertyId]);

  const needsHomeContext = Boolean(
    baseValue?.context.sourceActionId || baseValue?.context.contextVersion,
  );
  const homeQuery = useQuery({
    queryKey: ['unified-home', baseValue?.propertyId],
    queryFn: () => api.getUnifiedHome(baseValue!.propertyId),
    enabled: Boolean(baseValue?.propertyId && needsHomeContext),
    staleTime: 2 * 60 * 1000,
  });
  const journeyQuery = useQuery({
    queryKey: ['guidance', 'journey', baseValue?.propertyId, baseValue?.context.journeyId],
    queryFn: () => getGuidanceJourneyDetail(
      baseValue!.propertyId,
      baseValue!.context.journeyId!,
    ),
    enabled: Boolean(baseValue?.propertyId && baseValue?.context.journeyId),
    staleTime: 20_000,
  });
  const value = useMemo<ToolLaunchContextValue>(() => {
    if (!baseValue) return null;
    return {
      ...baseValue,
      resolved: resolveToolDestinationContext({
        propertyId: baseValue.propertyId,
        context: baseValue.context,
        home: homeQuery.data ?? null,
        journeyDetail: journeyQuery.data ?? null,
      }),
      isResolving: homeQuery.isLoading || journeyQuery.isLoading,
    };
  }, [baseValue, homeQuery.data, homeQuery.isLoading, journeyQuery.data, journeyQuery.isLoading]);

  const lifecycle = useMemo(() => baseValue ? {
      propertyId: baseValue.propertyId,
      toolId: baseValue.toolId,
      surface: baseValue.context.launchSurface,
      recommendationReason: baseValue.context.recommendationReason,
      recommendationVersion: baseValue.context.recommendationVersion,
      contextVersion: baseValue.context.contextVersion,
      sourceActionId: baseValue.context.sourceActionId,
      sourceEntityType: baseValue.context.sourceEntityType,
      sourceEntityId: baseValue.context.sourceEntityId,
      journeyId: baseValue.context.journeyId,
    } : null,
    [baseValue],
  );

  useEffect(() => {
    if (!lifecycle) return;
    const startedAt = Date.now();
    persistToolLifecycleEvent(lifecycle.propertyId, {
      toolId: lifecycle.toolId,
      stage: 'STARTED',
      surface: lifecycle.surface,
      recommendationReason: lifecycle.recommendationReason,
      recommendationVersion: lifecycle.recommendationVersion,
      contextVersion: lifecycle.contextVersion,
      sourceActionId: lifecycle.sourceActionId,
      sourceEntityType: lifecycle.sourceEntityType,
      sourceEntityId: lifecycle.sourceEntityId,
      journeyId: lifecycle.journeyId,
    });
    return () => {
      const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      if (durationSeconds < 5 || hasRecentToolCompletion(lifecycle.propertyId, lifecycle.toolId)) return;
      persistToolLifecycleEvent(lifecycle.propertyId, {
        toolId: lifecycle.toolId,
        stage: 'ABANDONED',
        surface: lifecycle.surface,
        recommendationReason: lifecycle.recommendationReason,
        recommendationVersion: lifecycle.recommendationVersion,
        contextVersion: lifecycle.contextVersion,
        sourceActionId: lifecycle.sourceActionId,
        sourceEntityType: lifecycle.sourceEntityType,
        sourceEntityId: lifecycle.sourceEntityId,
        journeyId: lifecycle.journeyId,
        durationSeconds,
      });
    };
  }, [lifecycle]);

  const showContinuity = Boolean(value && (
    value.context.sourceActionId ||
    value.context.sourceEntityId ||
    value.context.journeyId ||
    value.context.contextVersion ||
    value.context.recommendationReason
  ));

  return (
    <Context.Provider value={value}>
      {showContinuity && value ? (
        <aside className="mb-4 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-4 text-sm text-teal-950" aria-label="Tool launch context">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Continuing from Home</p>
                <p className="mt-1 font-semibold text-slate-950">{value.resolved.sourceTitle}</p>
                {value.resolved.sourceSummary ? (
                  <p className="mt-1 max-w-3xl text-slate-600">{value.resolved.sourceSummary}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {value.isResolving ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-slate-600">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Resolving context
                    </span>
                  ) : null}
                  {value.resolved.contextVersionStatus === 'CURRENT' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Home context current
                    </span>
                  ) : null}
                  {value.resolved.contextVersionStatus === 'UPDATED' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                      <RefreshCw className="h-3 w-3" /> Home context updated; current facts applied
                    </span>
                  ) : null}
                  {value.resolved.journey ? (
                    <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                      Journey {value.resolved.journey.progress.percent}% complete
                      {value.resolved.nextJourneyLabel ? ` · Next: ${value.resolved.nextJourneyLabel}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {value.resolved.actionPlanHref ? (
                <Link href={value.resolved.actionPlanHref} className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-white px-3 py-2 font-semibold text-teal-800 hover:text-teal-950">
                  View source action <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {value.resolved.journeyHref ? (
                <Link href={value.resolved.journeyHref} className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-3 py-2 font-semibold text-white hover:bg-teal-800">
                  Resume journey <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </aside>
      ) : null}
      {children}
    </Context.Provider>
  );
}
