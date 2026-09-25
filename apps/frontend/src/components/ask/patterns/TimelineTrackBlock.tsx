'use client';

import { useContext, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveTimelineTrack } from '@/features/ask/displayPatterns';
import { AskContextLink } from '../blocks/context';
import { TimelineBlock, TimelineList } from '../blocks/CoreBlocks';
import { ResultViewContext } from '@/features/ask/useResultView';
import type { AskBlockRenderer } from '../blocks/types';
import { CapitalWindowDetail } from '../CapitalWindowDetail';
import { ItemActionButtons } from './PatternParts';

// IW-PRES-017 (FRD v1.72). Dated records on a sideways track with year ticks, a Today marker, category filters
// with a text legend, and previous/next buttons. The selected record's detail shows below the track. When any
// date cannot be read, or there is a single record, the existing vertical list is used instead.

const CATEGORY_COLOURS = ['bg-teal-600', 'bg-sky-600', 'bg-amber-500', 'bg-violet-600', 'bg-rose-600', 'bg-slate-600'];
const PX_PER_YEAR = 110;

// FRD v1.90: the capital windows keep their live canonical detail (CapitalWindowDetail, re-read from the capital timeline)
// under the track and in the list, whichever the homeowner picks; any other timeline has no domain detail.
const CAPITAL_WINDOWS_BLOCK_ID = 'capital-timeline-table';

export const TimelineTrackBlock: AskBlockRenderer<'TIMELINE'> = (props) => {
  const { block, onItemAction, itemActionsDisabled, propertyId, onAccessLost } = props;
  const hasWindowDetail = block.id === CAPITAL_WINDOWS_BLOCK_ID;
  const points = useMemo(() => resolveTimelineTrack(block), [block]);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    block.items.forEach((item) => { if (item.category && !seen.has(item.category.id)) seen.set(item.category.id, item.category.label); });
    return Array.from(seen, ([id, label], index) => ({ id, label, colour: CATEGORY_COLOURS[index % CATEGORY_COLOURS.length] }));
  }, [block]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const layout = controls?.view.timelineLayouts?.[block.id] ?? 'TRACK';
  const detailId = hasWindowDetail ? (controls ? controls.detailIdFor(block.id) : localDetailId) : null;
  const detailItem = detailId ? block.items.find((item) => item.id === detailId) : undefined;
  const openDetail = (itemId: string) => {
    setSelectedId(itemId);
    if (controls) controls.openDetail(block.id, itemId);
    else setLocalDetailId(itemId);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ask-detail-trigger="${CSS.escape(closingId ?? '')}"][data-ask-detail-block="${CSS.escape(block.id)}"]`)?.focus());
  };
  const windowDetail = detailItem
    ? <CapitalWindowDetail key={detailItem.id} windowId={detailItem.id} expectedPropertyId={propertyId} fallbackTitle={detailItem.label} onAccessLost={onAccessLost} onClose={closeDetail} />
    : null;
  // A single window, or one whose date cannot be read, has no track; the list keeps its detail.
  if (!points && !hasWindowDetail) return <TimelineBlock {...props} />;
  // FRD v1.77: the same records as a vertical list, kept with the result; the track stays the default.
  const layoutSwitch = controls && points && (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${block.title}`}>
      {(['TRACK', 'LIST'] as const).map((choice) => (
        <button key={choice} type="button" aria-pressed={layout === choice}
          onClick={() => controls.change((view) => ({ ...view, timelineLayouts: { ...(view.timelineLayouts ?? {}), [block.id]: choice } }))}
          className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold', layout === choice ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>
          {choice === 'TRACK' ? 'Timeline' : 'List'}
        </button>
      ))}
    </div>
  );
  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
      </div>
      {layoutSwitch}
    </div>
  );
  if (layout === 'LIST' || !points) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="timeline-list">{heading}
      <TimelineList block={block} onOpenDetail={hasWindowDetail ? openDetail : undefined} openDetailId={detailId} />
      {windowDetail}
    </section>;
  }

  const ordered = block.items
    .map((item, index) => ({ item, point: points[index] }))
    .sort((a, b) => a.point.year - b.point.year);
  const visible = ordered.filter(({ item }) => !item.category || !hidden.includes(item.category.id));
  const selected = visible.find(({ item }) => item.id === selectedId) ?? visible[visible.length - 1] ?? null;
  const firstYear = Math.floor(ordered[0].point.year);
  const nowYear = new Date().getFullYear() + new Date().getMonth() / 12;
  const lastYear = Math.max(Math.ceil(ordered[ordered.length - 1].point.year), firstYear + 1);
  const x = (year: number) => (year - firstYear) * PX_PER_YEAR;
  const colourFor = (categoryId: string | undefined) => categories.find((category) => category.id === categoryId)?.colour ?? 'bg-teal-600';
  const step = (direction: -1 | 1) => {
    if (!selected || visible.length === 0) return;
    const position = visible.findIndex(({ item }) => item.id === selected.item.id);
    setSelectedId(visible[(position + direction + visible.length) % visible.length].item.id);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="timeline">
      {heading}
      {categories.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show types">
          {categories.map((category) => {
            const shown = !hidden.includes(category.id);
            return (
              <button key={category.id} type="button" aria-pressed={shown}
                onClick={() => setHidden((current) => shown ? [...current, category.id] : current.filter((id) => id !== category.id))}
                className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold', shown ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400 line-through')}>
                <span className={cn('h-2 w-2 rounded-full', category.colour)} aria-hidden="true" />{category.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50" tabIndex={0} aria-label={`${block.title}, ${visible.length} of ${ordered.length} shown`}>
        <div className="relative mx-6 h-36" style={{ width: `${(lastYear - firstYear) * PX_PER_YEAR}px` }}>
          <div className="absolute inset-x-0 top-24 h-0.5 bg-slate-200" aria-hidden="true" />
          {Array.from({ length: lastYear - firstYear + 1 }, (_, offset) => firstYear + offset).map((year) => (
            <span key={year} className="absolute top-[6.5rem] -translate-x-1/2 text-[11px] tabular-nums text-slate-500" style={{ left: `${x(year)}px` }} aria-hidden="true">{year}</span>
          ))}
          {nowYear >= firstYear && nowYear <= lastYear && (
            <span className="absolute bottom-10 top-4 border-l-2 border-dashed border-teal-500" style={{ left: `${x(nowYear)}px` }} aria-hidden="true">
              <span className="absolute -top-1 left-1 whitespace-nowrap text-[11px] font-semibold text-teal-800">Today</span>
            </span>
          )}
          <ol>
            {visible.map(({ item, point }, index) => (
              <li key={item.id}>
                <button type="button" aria-pressed={selected?.item.id === item.id} onClick={() => setSelectedId(item.id)}
                  aria-label={`${point.label}: ${item.label}${item.category ? ` (${item.category.label})` : ''}`}
                  data-ask-timeline-point={item.id}
                  className={cn('absolute h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-slate-50', colourFor(item.category?.id), selected?.item.id === item.id && 'ring-2 ring-slate-900 ring-offset-1')}
                  style={{ left: `${x(point.year)}px`, top: index % 2 ? '4.25rem' : '2.75rem' }} />
              </li>
            ))}
          </ol>
        </div>
      </div>
      {selected ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3" aria-live="polite" data-ask-timeline-selected={selected.item.id}>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{selected.point.label}{selected.item.category ? ` · ${selected.item.category.label}` : ''}{selected.item.status ? ` · ${selected.item.status}` : ''}</p>
            <p className="font-semibold text-slate-950">{selected.item.label}</p>
            {selected.item.meta && selected.item.meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{selected.item.meta.join(' · ')}</p>}
            {selected.item.description && <p className="mt-1 text-sm text-slate-600">{selected.item.description}</p>}
            <ItemActionButtons className="mt-2" item={selected.item} actions={selected.item.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} />
            {hasWindowDetail && <button type="button" data-ask-detail-trigger={selected.item.id} data-ask-detail-block={block.id} aria-expanded={detailId === selected.item.id} onClick={() => openDetail(selected.item.id)}
              className="mt-2 mr-3 min-h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-teal-800 hover:bg-slate-50">Details<span className="sr-only"> for {selected.item.label}</span></button>}
            {selected.item.href && <AskContextLink href={selected.item.href} className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:underline">Open record</AskContextLink>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => step(-1)} aria-label="Previous event" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => step(1)} aria-label="Next event" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : <p className="mt-3 text-sm text-slate-500">All types are hidden. Turn one back on to see its events.</p>}
      {windowDetail}
    </section>
  );
};
