'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { KnowledgeArticleTocItem } from '@/lib/knowledge/articleToc';
import { cn } from '@/lib/utils';

type KnowledgeArticleTocProps = {
  items: KnowledgeArticleTocItem[];
  variant?: 'desktop' | 'mobile';
};

function useActiveSection(items: KnowledgeArticleTocItem[], enabled: boolean) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    setActiveId(itemIds[0] ?? null);
  }, [itemIds]);

  useEffect(() => {
    if (!enabled || itemIds.length === 0 || typeof window === 'undefined') {
      return;
    }

    const visibleIds = new Set<string>();
    const sections = itemIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) {
      return;
    }

    const syncFromHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && itemIds.includes(hash)) {
        setActiveId(hash);
      }
    };

    syncFromHash();

    const updateActiveFromViewport = () => {
      const firstVisibleId = itemIds.find((id) => visibleIds.has(id));
      if (firstVisibleId) {
        setActiveId(firstVisibleId);
        return;
      }

      const closestPastSection = [...sections]
        .reverse()
        .find((section) => section.getBoundingClientRect().top <= window.innerHeight * 0.28);

      if (closestPastSection) {
        setActiveId(closestPastSection.id);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }

        updateActiveFromViewport();
      },
      {
        rootMargin: '-18% 0% -62% 0%',
        threshold: [0, 0.15, 0.4],
      }
    );

    sections.forEach((section) => observer.observe(section));
    window.addEventListener('hashchange', syncFromHash);

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [enabled, itemIds]);

  return { activeId, setActiveId };
}

export function KnowledgeArticleToc({
  items,
  variant = 'desktop',
}: KnowledgeArticleTocProps) {
  const isDesktop = variant === 'desktop';
  const { activeId, setActiveId } = useActiveSection(items, isDesktop);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const nav = (
    <nav aria-label="In this article" className="space-y-1.5">
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => {
              setActiveId(item.id);
              if (!isDesktop) {
                setMobileOpen(false);
              }
            }}
            className={cn(
              'group flex items-start gap-3 rounded-2xl py-1.5 text-sm leading-5 text-slate-500 transition-colors hover:text-slate-900',
              isDesktop ? 'pr-2' : 'pr-1',
              isActive && 'text-slate-950'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-2 h-1.5 w-1.5 flex-none rounded-full bg-slate-300 transition-all group-hover:bg-slate-500',
                isActive && 'w-5 rounded-full bg-teal-700 group-hover:bg-teal-700'
              )}
            />
            <span className={cn('text-pretty', isActive && 'font-medium')}>{item.title}</span>
          </a>
        );
      })}
    </nav>
  );

  if (isDesktop) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">On this page</p>
          <h2 className="text-sm font-medium text-slate-900">A quick read map</h2>
        </div>
        <div className="border-l border-slate-200/80 pl-4">{nav}</div>
      </section>
    );
  }

  return (
    <Collapsible
      open={mobileOpen}
      onOpenChange={setMobileOpen}
      className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-3 shadow-[0_18px_45px_-40px_rgba(15,23,42,0.35)]"
    >
      <div className="space-y-2">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">On this page</p>
            <p className="text-sm text-slate-700">Jump to the sections that matter most.</p>
          </div>
          <ChevronDown className={cn('h-4 w-4 flex-none text-slate-400 transition-transform', mobileOpen && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="border-t border-slate-200/80 pt-3">{nav}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
