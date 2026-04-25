'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageContextId } from '@/features/tools/contextToolMappings';
import { getRelatedToolIds, getContextToolId } from '@/features/tools/getRelatedTools';
import { trackRelatedToolsEvent } from '@/features/tools/relatedToolsAnalytics';
import { resolvePageContext } from '@/features/tools/resolvePageContext';
import {
  buildPropertyAwareToolHref,
  getToolDefinition,
  type ToolId,
} from '@/features/tools/toolRegistry';

export type RelatedToolsProps = {
  context?: PageContextId | null;
  currentToolId?: ToolId | null;
  propertyId?: string | null;
  maxItems?: number;
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

export default function RelatedTools({
  context,
  currentToolId,
  propertyId,
  maxItems,
  title = 'Related tools',
  className,
  minViewport = 'base',
}: RelatedToolsProps) {
  const pathname = usePathname();
  const titleId = useId();
  const impressionKeyRef = useRef<string | null>(null);
  const [isVisibleViewport, setIsVisibleViewport] = useState(() => getViewportMatch(minViewport));

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

  const effectiveCurrentToolId = currentToolId ?? getContextToolId(resolvedContext);

  const items = useMemo(() => {
    const toolIds = getRelatedToolIds({
      context: resolvedContext,
      currentToolId: effectiveCurrentToolId,
      maxItems,
    });

    return toolIds.map((toolId) => {
      const definition = getToolDefinition(toolId);
      return {
        ...definition,
        href: buildPropertyAwareToolHref(toolId, propertyId),
      };
    });
  }, [effectiveCurrentToolId, maxItems, propertyId, resolvedContext]);

  useEffect(() => {
    if (!isVisibleViewport || !resolvedContext || items.length === 0) return;

    const impressionKey = [
      propertyId ?? 'no-property',
      resolvedContext,
      effectiveCurrentToolId ?? 'no-current-tool',
      items.map((item) => item.id).join(','),
    ].join('|');

    if (impressionKeyRef.current === impressionKey) return;
    impressionKeyRef.current = impressionKey;

    void trackRelatedToolsEvent('related_tools_impression', {
      propertyId,
      pageContext: resolvedContext,
      currentToolId: effectiveCurrentToolId,
      recommendedToolIds: items.map((item) => item.id),
    }).catch(() => undefined);
  }, [effectiveCurrentToolId, isVisibleViewport, items, propertyId, resolvedContext]);

  if (!isVisibleViewport || !resolvedContext || items.length === 0) return null;

  return (
    <section
      aria-labelledby={titleId}
      className={cn('space-y-2', className)}
    >
      <div className="min-w-0">
        <h2
          id={titleId}
          className="text-[11px] font-semibold tracking-normal text-slate-500"
        >
          {title}
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className="group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white/72 px-3 py-2 text-left text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
              onClick={() => {
                void trackRelatedToolsEvent('related_tools_click', {
                  propertyId,
                  pageContext: resolvedContext,
                  currentToolId: effectiveCurrentToolId,
                  recommendedToolIds: items.map((entry) => entry.id),
                  clickedToolId: item.id,
                  positionIndex: index,
                }).catch(() => undefined);
              }}
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-teal-700" />
              <span className="truncate">{item.label}</span>
              <span className="sr-only">{item.description}</span>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-300 transition-colors group-hover:bg-slate-100 group-hover:text-slate-500">
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
