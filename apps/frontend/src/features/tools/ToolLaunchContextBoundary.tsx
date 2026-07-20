'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  findDiscoverableToolByHref,
  type ToolLaunchContext,
} from './toolDiscoveryRegistry';
import { hasRecentToolCompletion, persistToolLifecycleEvent } from './toolLifecycleTelemetry';

type ToolLaunchContextValue = {
  toolId: string;
  propertyId: string;
  context: ToolLaunchContext;
} | null;

const Context = createContext<ToolLaunchContextValue>(null);
const PROPERTY_TOOL_PATH = /^\/dashboard\/properties\/([^/]+)\/tools\//;

function readPropertyId(pathname: string, selectedPropertyId?: string | null): string | null {
  const match = pathname.match(PROPERTY_TOOL_PATH);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return selectedPropertyId ?? null;
}

function normalizeSurface(value: string | null): ToolLaunchContext['launchSurface'] {
  if (
    value === 'unified_home' ||
    value === 'explore_tools' ||
    value === 'command_palette' ||
    value === 'workflow' ||
    value === 'guidance' ||
    value === 'home_tools' ||
    value === 'dashboard'
  ) {
    return value;
  }
  return value ? 'unknown' : 'direct';
}

export function useToolLaunchContext(): ToolLaunchContextValue {
  return useContext(Context);
}

export function ToolLaunchContextBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const query = searchParams.toString();

  const value = useMemo<ToolLaunchContextValue>(() => {
    const href = query ? `${pathname}?${query}` : pathname;
    const tool = findDiscoverableToolByHref(href);
    const propertyId = readPropertyId(pathname, selectedPropertyId);
    if (!tool || !propertyId) return null;

    return {
      toolId: tool.id,
      propertyId,
      context: {
        launchSurface: normalizeSurface(searchParams.get('launchSurface')),
        sourceActionId: searchParams.get('sourceActionId'),
        sourceEntityType: searchParams.get('sourceEntityType'),
        sourceEntityId: searchParams.get('sourceEntityId'),
        contextVersion: searchParams.get('contextVersion'),
        recommendationReason: searchParams.get('recommendationReason'),
        journeyId: searchParams.get('journeyId') ?? searchParams.get('guidanceJourneyId'),
        guidanceStepKey: searchParams.get('guidanceStepKey'),
        guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
        itemId: searchParams.get('itemId'),
      },
    };
  }, [pathname, query, searchParams, selectedPropertyId]);

  const lifecycle = useMemo(() => value ? {
      propertyId: value.propertyId,
      toolId: value.toolId,
      surface: value.context.launchSurface,
      recommendationReason: value.context.recommendationReason,
      contextVersion: value.context.contextVersion,
      sourceActionId: value.context.sourceActionId,
      sourceEntityType: value.context.sourceEntityType,
      sourceEntityId: value.context.sourceEntityId,
      journeyId: value.context.journeyId,
    } : null,
    [value],
  );

  useEffect(() => {
    if (!lifecycle) return;
    const startedAt = Date.now();
    persistToolLifecycleEvent(lifecycle.propertyId, {
      toolId: lifecycle.toolId,
      stage: 'STARTED',
      surface: lifecycle.surface,
      recommendationReason: lifecycle.recommendationReason,
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
        contextVersion: lifecycle.contextVersion,
        sourceActionId: lifecycle.sourceActionId,
        sourceEntityType: lifecycle.sourceEntityType,
        sourceEntityId: lifecycle.sourceEntityId,
        journeyId: lifecycle.journeyId,
        durationSeconds,
      });
    };
  }, [lifecycle]);

  const showContinuity = Boolean(
    value && (
      value.context.sourceActionId ||
      value.context.sourceEntityId ||
      value.context.journeyId ||
      value.context.contextVersion
    )
  );

  return (
    <Context.Provider value={value}>
      {showContinuity && value ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-teal-950">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-teal-700" />
            <span>
              Using the selected home{value.context.sourceEntityId ? ' and related record' : ''} from your previous step.
            </span>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 font-semibold text-teal-800 hover:text-teal-950">
            <ArrowLeft className="h-4 w-4" />
            Return to Home
          </Link>
        </div>
      ) : null}
      {children}
    </Context.Provider>
  );
}
