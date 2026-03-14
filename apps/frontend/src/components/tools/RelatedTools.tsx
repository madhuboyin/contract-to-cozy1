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
      className={cn(
        'rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.35)] backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            A few adjacent tools worth opening from here.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-3.5 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-700 transition-colors group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="truncate">{item.label}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-teal-600" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
