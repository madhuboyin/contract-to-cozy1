'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/features/ask/adaptivePresentation';
import type { AskAction, AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';
import { AskContextLink } from '../blocks/context';
import { useCalmAnswer } from '../blocks/calmContext';
import { ItemDetailSheet, TONE_STRIPE, type ItemActionHandler } from './PatternParts';

type Section = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['sections'][number];

/**
 * IW-PRES-011 / IW-PRES-014: a sideways track with visible previous/next buttons that disable at either end and
 * an item count. Scrolling is never the only way through: the buttons and keyboard scrolling reach every card.
 */
export function HorizontalTrack({ label, countLabel, children }: { label: string; countLabel: string; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  // IW-CALM-010: on touch devices the track is swiped, so the arrow buttons appear on pointer devices only.
  const calm = useCalmAnswer();
  const [edges, setEdges] = useState({ start: true, end: true });
  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setEdges({ start: track.scrollLeft <= 2, end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);
  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy?.({ left: direction * track.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</h4>
        <span className="text-xs text-slate-500">{countLabel}</span>
        <span className={cn('ml-auto flex gap-1', calm && '[@media(hover:none)]:hidden')}>
          <button type="button" disabled={edges.start} onClick={() => move(-1)} aria-label={`Scroll ${label} back`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-35"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" disabled={edges.end} onClick={() => move(1)} aria-label={`Scroll ${label} forward`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-35"><ChevronRight className="h-4 w-4" /></button>
        </span>
      </div>
      <div ref={trackRef} onScroll={sync} role="list" aria-label={`${label}, ${countLabel}`} tabIndex={0}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        {children}
      </div>
    </div>
  );
}

export function shelfCountLabel(section: Section): string {
  if (section.count > section.items.length) return `Showing ${section.items.length} of ${section.count}`;
  return `${section.count} item${section.count === 1 ? '' : 's'}`;
}

// `triggerProps` lets a domain list keep the markers its detail and scroll restoration look for (for example
// `data-ask-task-id` and `data-ask-detail-trigger`); `selected` marks the task follow-up questions refer to.
export function ShelfCard({ item, onOpen, selected = false, disabled = false, triggerProps }: {
  item: AskGroupedListItem;
  onOpen: () => void;
  selected?: boolean;
  disabled?: boolean;
  triggerProps?: Record<`data-${string}`, string>;
}) {
  const tone = item.tone ?? 'DEFAULT';
  return (
    <div role="listitem" className="w-52 shrink-0 snap-start">
    <button type="button" onClick={onOpen} data-ask-shelf-item={item.id} disabled={disabled} aria-current={selected ? 'true' : undefined} {...triggerProps}
      className={cn('relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border p-3 pl-4 text-left hover:border-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60', selected ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 bg-white')}>
      <span className={cn('absolute inset-y-0 left-0 w-1', TONE_STRIPE[tone])} aria-hidden="true" />
      <span className="text-sm font-semibold leading-5 text-slate-950">{item.title}</span>
      {!item.timingLabel && !item.amountLabel && item.description && <span className="line-clamp-2 text-xs text-slate-600">{item.description}</span>}
      <span className="mt-auto flex items-center justify-between gap-2 text-xs">
        {item.timingLabel ? <span className={cn('font-semibold', tone === 'CRITICAL' ? 'text-red-700' : tone === 'CAUTION' ? 'text-amber-800' : 'text-slate-700')}>{item.timingLabel}</span> : <span />}
        {item.amountLabel && <span className="tabular-nums text-slate-500">{item.amountLabel}</span>}
      </span>
    </button>
    </div>
  );
}

export function ShelvesView({ sections, moreAction, onItemAction, disabled }: {
  sections: Section[];
  moreAction?: AskAction;
  onItemAction: ItemActionHandler;
  disabled: boolean;
}) {
  const [openItem, setOpenItem] = useState<AskGroupedListItem | null>(null);
  return (
    <div className="space-y-4 p-4">
      {sections.filter((section) => section.items.length > 0).map((section) => (
        <HorizontalTrack key={section.id} label={section.title} countLabel={shelfCountLabel(section)}>
          {section.items.map((item) => <ShelfCard key={item.id} item={item} onOpen={() => setOpenItem(item)} />)}
          {section.count > section.items.length && (
            <div role="listitem" className="flex w-32 shrink-0 snap-start items-center justify-center rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs font-semibold">
              {moreAction?.href
                ? <AskContextLink href={moreAction.href} className="text-teal-700 hover:underline">See all {section.count} · {moreAction.label}</AskContextLink>
                : <span className="text-slate-500">{section.count - section.items.length} more not shown here</span>}
            </div>
          )}
        </HorizontalTrack>
      ))}
      <ItemDetailSheet item={openItem} open={Boolean(openItem)} onOpenChange={(open) => { if (!open) setOpenItem(null); }} onItemAction={onItemAction} disabled={disabled} />
    </div>
  );
}
