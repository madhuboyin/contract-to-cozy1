'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CapabilityContextType,
  RelatedCapabilityItem,
} from '@/features/tools/capabilityTypes';
import { appendCapabilityLaunchContext } from '@/features/tools/capabilityCatalog';
import { resolveCapabilityIcon } from '@/features/tools/capabilityIconRegistry';
import type { PageContextId } from '@/features/tools/pageContext';
import { trackRelatedToolsEvent } from '@/features/tools/relatedToolsAnalytics';
import { resolvePageContext } from '@/features/tools/resolvePageContext';
import { getDiscoverableTool } from '@/features/tools/toolDiscoveryRegistry';
import { useCapabilityImpression } from '@/features/tools/useCapabilityImpression';
import { useRelatedCapabilities } from '@/features/tools/useRelatedCapabilities';
import { track } from '@/lib/analytics/events';

export type RelatedToolsProps = {
  context?: PageContextId | null;
  currentToolId?: string | null;
  propertyId?: string | null;
  maxItems?: number;
  sourceEntityType?: CapabilityContextType;
  workflowContextTypes?: CapabilityContextType[];
  title?: string;
  className?: string;
  minViewport?: 'base' | 'md' | 'lg';
};

const VIEWPORT_QUERIES = {
  base: null,
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
} as const;

function getViewportMatch(minViewport: 'base' | 'md' | 'lg'): boolean {
  const query = VIEWPORT_QUERIES[minViewport];
  if (!query) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

function RelatedCapabilityLink({
  item,
  propertyId,
  position,
  response,
  onLegacyClick,
}: {
  item: RelatedCapabilityItem;
  propertyId: string;
  position: number;
  response: {
    registryVersion: string;
    recommendationVersion: string;
    contextVersion: string;
  };
  onLegacyClick: () => void;
}) {
  const Icon = resolveCapabilityIcon(item.iconName);
  const impressionRef = useCapabilityImpression<HTMLDivElement>({
    capabilityId: item.capabilityId,
    propertyId,
    surface: 'workflow',
    registryVersion: response.registryVersion,
    recommendationReason: item.reasonCode,
    recommendationVersion: response.recommendationVersion,
    contextVersion: response.contextVersion,
  });
  const href = appendCapabilityLaunchContext(item.href, {
    launchSurface: 'workflow',
    recommendationReason: item.reasonCode,
    recommendationVersion: response.recommendationVersion,
    contextVersion: response.contextVersion,
  });

  return (
    <div ref={impressionRef}>
      <Link
        href={href}
        className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white/72 px-3 py-2 text-left text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
        onClick={() => {
          track('tool_discovery_clicked', {
            propertyId,
            surface: 'workflow',
            toolId: item.capabilityId,
            position,
            recommendationReason: item.reasonCode,
            recommendationVersion: response.recommendationVersion,
            contextVersion: response.contextVersion,
          });
          onLegacyClick();
        }}
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-teal-700" />
        <span className="truncate">{item.label}</span>
        <span className="sr-only">{item.shortDescription}</span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-300 transition-colors group-hover:bg-slate-100 group-hover:text-slate-500">
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </Link>
    </div>
  );
}

export default function RelatedTools({
  context,
  currentToolId,
  propertyId,
  maxItems,
  sourceEntityType,
  workflowContextTypes,
  title = 'Related tools',
  className,
  minViewport = 'base',
}: RelatedToolsProps) {
  const pathname = usePathname();
  const titleId = useId();
  const impressionKeyRef = useRef<string | null>(null);
  const [isVisibleViewport, setIsVisibleViewport] = useState(
    () => getViewportMatch(minViewport),
  );

  useEffect(() => {
    const query = VIEWPORT_QUERIES[minViewport];
    if (!query) {
      setIsVisibleViewport(true);
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const updateVisibility = () => setIsVisibleViewport(mediaQuery.matches);
    updateVisibility();
    mediaQuery.addEventListener('change', updateVisibility);
    return () => mediaQuery.removeEventListener('change', updateVisibility);
  }, [minViewport]);

  const resolvedContext = useMemo(
    () => resolvePageContext({ pathname, explicitContext: context }),
    [context, pathname],
  );
  const effectiveCurrentToolId = currentToolId
    ?? (resolvedContext ? getDiscoverableTool(resolvedContext)?.id ?? null : null);
  const request = propertyId && effectiveCurrentToolId
    ? {
        propertyId,
        currentCapabilityId: effectiveCurrentToolId,
        limit: maxItems,
        sourceEntityType,
        workflowContextTypes,
      }
    : null;
  const relatedQuery = useRelatedCapabilities(request, {
    enabled: isVisibleViewport,
  });
  const response = relatedQuery.data;
  const items = response?.suggestions ?? [];

  useEffect(() => {
    if (
      !isVisibleViewport
      || !propertyId
      || !resolvedContext
      || !effectiveCurrentToolId
      || items.length === 0
    ) return;
    const impressionKey = [
      propertyId,
      resolvedContext,
      effectiveCurrentToolId,
      items.map((item) => item.capabilityId).join(','),
    ].join('|');
    if (impressionKeyRef.current === impressionKey) return;
    impressionKeyRef.current = impressionKey;
    void trackRelatedToolsEvent('related_tools_impression', {
      propertyId,
      pageContext: resolvedContext,
      currentToolId: effectiveCurrentToolId,
      recommendedToolIds: items.map((item) => item.capabilityId),
    }).catch(() => undefined);
  }, [
    effectiveCurrentToolId,
    isVisibleViewport,
    items,
    propertyId,
    resolvedContext,
  ]);

  if (
    !isVisibleViewport
    || !propertyId
    || !resolvedContext
    || !effectiveCurrentToolId
    || !response
    || items.length === 0
  ) return null;

  return (
    <section aria-labelledby={titleId} className={cn('space-y-2', className)}>
      <div className="min-w-0">
        <h2 id={titleId} className="text-[11px] font-semibold tracking-normal text-slate-500">
          {title}
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <RelatedCapabilityLink
            key={item.capabilityId}
            item={item}
            propertyId={propertyId}
            position={index}
            response={response}
            onLegacyClick={() => {
              void trackRelatedToolsEvent('related_tools_click', {
                propertyId,
                pageContext: resolvedContext,
                currentToolId: effectiveCurrentToolId,
                recommendedToolIds: items.map((entry) => entry.capabilityId),
                clickedToolId: item.capabilityId,
                positionIndex: index,
              }).catch(() => undefined);
            }}
          />
        ))}
      </div>
    </section>
  );
}
