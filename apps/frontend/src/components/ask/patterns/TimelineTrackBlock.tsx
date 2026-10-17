'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pause, Play, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveTimelineTrack } from '@/features/ask/displayPatterns';
import { AskContextLink } from '../blocks/context';
import { TimelineList } from '../blocks/CoreBlocks';
import { TimelineEventDetail } from './TimelineEventDetail';
import { ResultViewContext } from '@/features/ask/useResultView';
import type { AskBlockRenderer } from '../blocks/types';
import { CapitalWindowDetail } from '../CapitalWindowDetail';
import { ItemActionButtons } from './PatternParts';
import { exportHomeTimelineEvents } from '@/lib/api/homeTimelineApi';

// IW-PRES-017 (FRD v1.72). Dated records on a sideways track with year ticks, a Today marker, category filters
// with a text legend, and previous/next buttons. The selected record's detail shows below the track. When any
// date cannot be read, or there is a single record, the existing vertical list is used instead.

const CATEGORY_COLOURS = ['bg-teal-600', 'bg-sky-600', 'bg-amber-500', 'bg-violet-600', 'bg-rose-600', 'bg-slate-600'];
// FRD v1.90: the capital windows keep their live canonical detail (CapitalWindowDetail, re-read from the capital timeline)
// under the track and in the list, whichever the homeowner picks; any other timeline has no domain detail.
const CAPITAL_WINDOWS_BLOCK_ID = 'capital-timeline-table';

export const TimelineTrackBlock: AskBlockRenderer<'TIMELINE'> = (props) => {
  const { block, onItemAction, itemActionsDisabled, propertyId, onAccessLost } = props;
  const isCapitalWindows = block.id === CAPITAL_WINDOWS_BLOCK_ID;
  // A record that carries its own detail (home events) opens in place; the capital windows keep their live re-read. Neither navigates away.
  const hasWindowDetail = isCapitalWindows || block.items.some((item) => item.detail);
  const points = useMemo(() => resolveTimelineTrack(block), [block]);
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    block.items.forEach((item) => { if (item.category && !seen.has(item.category.id)) seen.set(item.category.id, item.category.label); });
    return Array.from(seen, ([id, label], index) => ({ id, label, colour: CATEGORY_COLOURS[index % CATEGORY_COLOURS.length] }));
  }, [block]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [displayLimit, setDisplayLimit] = useState(80);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [playbackOn, setPlaybackOn] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const layout = controls?.view.timelineLayouts?.[block.id] ?? 'TRACK';
  const detailId = hasWindowDetail ? (controls ? controls.detailIdFor(block.id) : localDetailId) : null;
  const detailItem = detailId ? block.items.find((item) => item.id === detailId) : undefined;
  const toggleSelected = (itemId: string) => setSelectedForExport((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    return next;
  });
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
    ? !isCapitalWindows ? <TimelineEventDetail key={detailItem.id} item={detailItem} propertyId={propertyId} onClose={closeDetail} onItemAction={onItemAction} disabled={itemActionsDisabled} /> : <CapitalWindowDetail key={detailItem.id} windowId={detailItem.id} expectedPropertyId={propertyId} fallbackTitle={detailItem.label} onAccessLost={onAccessLost} onClose={closeDetail} />
    : null;
  // FRD v1.77: the same records as a vertical list, kept with the result; the track stays the default.
  const eventTypes = useMemo(() => Array.from(new Set(block.items.map((item) => item.meta?.[0]).filter((value): value is string => Boolean(value)))).sort(), [block.items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return block.items.filter((item) => {
      const matchesQuery = !normalizedQuery || [item.label, item.description, item.status, item.category?.label, ...(item.meta ?? [])].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
      const value = item.date ?? '';
      const itemStart = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
      const itemEnd = value.length === 4 ? `${value}-12-31` : value.length === 7 ? `${value}-31` : value;
      const matchesFrom = !fromDate || !value || itemEnd >= fromDate;
      const matchesTo = !toDate || !value || itemStart <= toDate;
      const matchesType = !eventType || item.meta?.[0] === eventType;
      return matchesQuery && matchesFrom && matchesTo && matchesType;
    }).slice(0, displayLimit);
  }, [block.items, displayLimit, eventType, fromDate, query, toDate]);
  const filteredBlock = { ...block, items: filteredItems };
  useEffect(() => {
    if (!playbackOn || filteredItems.length === 0) return;
    setSelectedId(filteredItems[Math.min(playbackIndex, filteredItems.length - 1)].id);
    const timer = window.setTimeout(() => setPlaybackIndex((current) => current + 1 >= filteredItems.length ? 0 : current + 1), 900);
    return () => window.clearTimeout(timer);
  }, [playbackOn, playbackIndex, filteredItems]);
  const downloadJson = (filename: string, value: unknown) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  };
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
  const parityControls = block.controls && (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-2">
        {block.controls.search && <label className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><span className="sr-only">Search timeline events</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events…" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm" /></label>}
        {block.controls.typeFilter && <label><span className="sr-only">Event type</span><select value={eventType} onChange={(event) => setEventType(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>}
        {block.controls.dateFilter && <><label className="text-xs text-slate-500">From<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="ml-2 min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800" /></label><label className="text-xs text-slate-500">To<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="ml-2 min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800" /></label></>}
        {block.controls.limitFilter && <label><span className="sr-only">Event limit</span><select value={displayLimit} onChange={(event) => setDisplayLimit(Number(event.target.value))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value={25}>Last 25 events</option><option value={50}>Last 50 events</option><option value={80}>Last 80 events</option><option value={150}>Last 150 events</option><option value={200}>All events (up to 200)</option></select></label>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {block.controls.selectionExport && <button type="button" disabled={!propertyId || selectedForExport.size === 0} onClick={async () => { try { setActionError(null); const response = await exportHomeTimelineEvents(propertyId!, [...selectedForExport]); downloadJson(`home-timeline-${new Date().toISOString().slice(0, 10)}.json`, response.data); } catch { setActionError('The selected events could not be exported.'); } }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" />Export selected ({selectedForExport.size})</button>}
        {block.controls.annualRecap && <button type="button" onClick={() => { const year = new Date().getFullYear(); const yearEvents = block.items.filter((item) => item.date?.slice(0, 4) === String(year)); downloadJson(`home-recap-${year}.json`, { generatedAt: new Date().toISOString(), propertyId, year, eventCount: yearEvents.length, verifiedCount: yearEvents.filter((item) => /confirmed|verified/i.test(item.status ?? '')).length, events: yearEvents, limitations: yearEvents.length === 0 ? ['No Ask-visible recorded current events fall within this year; this is not confirmation that nothing occurred.'] : ['This recap reflects current Home Timeline records visible to you in Ask Cozy.'] }); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">Prepare {new Date().getFullYear()} recap</button>}
        {block.controls.storyPlayback && <button type="button" onClick={() => { setPlaybackOn((current) => !current); setPlaybackIndex(0); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{playbackOn ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}{playbackOn ? 'Pause story' : 'Play story'}</button>}
        {(query || eventType || fromDate || toDate || displayLimit !== 80) && <button type="button" onClick={() => { setQuery(''); setEventType(''); setFromDate(''); setToDate(''); setDisplayLimit(80); }} className="min-h-10 px-2 text-sm font-semibold text-teal-800">Clear filters</button>}
      </div>
      {(query || eventType || fromDate || toDate || displayLimit !== 80) && <p className="text-xs text-slate-500">Showing {filteredItems.length} of {block.items.length} events.</p>}
      {actionError && <p className="text-xs text-rose-700" role="alert">{actionError}</p>}
    </div>
  );
  if (layout === 'LIST' || !points) {
    return <section id={block.id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="timeline-list">{heading}{parityControls}
      <TimelineList block={filteredBlock} onOpenDetail={hasWindowDetail ? openDetail : undefined} openDetailId={detailId} onItemAction={onItemAction} itemActionsDisabled={itemActionsDisabled} selectedIds={block.controls?.selectionExport ? selectedForExport : undefined} onToggleSelected={block.controls?.selectionExport ? toggleSelected : undefined} />
      {windowDetail}
    </section>;
  }

  const ordered = block.items
    .map((item, index) => ({ item, point: points[index] }))
    .sort((a, b) => a.point.year - b.point.year);
  const filteredIds = new Set(filteredItems.map((item) => item.id));
  const visible = ordered.filter(({ item }) => filteredIds.has(item.id) && (!item.category || !hidden.includes(item.category.id)));
  const selected = visible.find(({ item }) => item.id === selectedId) ?? visible[visible.length - 1] ?? null;
  const firstYear = Math.floor(ordered[0].point.year);
  const nowYear = new Date().getFullYear() + new Date().getMonth() / 12;
  const lastYear = Math.max(Math.ceil(ordered[ordered.length - 1].point.year), firstYear + 1);
  const colourFor = (categoryId: string | undefined) => categories.find((category) => category.id === categoryId)?.colour ?? 'bg-teal-600';
  const step = (direction: -1 | 1) => {
    if (!selected || visible.length === 0) return;
    const position = visible.findIndex(({ item }) => item.id === selected.item.id);
    setSelectedId(visible[(position + direction + visible.length) % visible.length].item.id);
  };
  return (
    <section id={block.id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="timeline">
      {heading}
      {parityControls}
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
        <ol className="flex min-w-max px-6 py-4">
          {Array.from({ length: lastYear - firstYear + 1 }, (_, offset) => firstYear + offset).map((year) => {
            const inYear = visible.filter(({ point }) => Math.floor(point.year) === year);
            const isCurrentYear = Math.floor(nowYear) === year;
            return (
              <li key={year} className={cn('relative flex h-28 w-[110px] shrink-0 flex-col items-center border-b-2 border-slate-200', isCurrentYear && 'border-b-teal-500')}>
                {isCurrentYear && <span className="mb-1 text-[11px] font-semibold text-teal-800">Today</span>}
                <div className="flex flex-1 flex-wrap content-center justify-center gap-2 px-2">
                  {inYear.map(({ item, point }) => (
                    <button key={item.id} type="button" aria-pressed={selected?.item.id === item.id} onClick={() => setSelectedId(item.id)}
                      aria-label={`${point.label}: ${item.label}${item.category ? ` (${item.category.label})` : ''}`}
                      data-ask-timeline-point={item.id}
                      className={cn('h-4 w-4 rounded-full border-[3px] border-slate-50', colourFor(item.category?.id), selected?.item.id === item.id && 'ring-2 ring-slate-900 ring-offset-1')} />
                  ))}
                </div>
                <span className="mt-2 text-[11px] tabular-nums text-slate-500" aria-hidden="true">{year}</span>
              </li>
            );
          })}
        </ol>
      </div>
      {selected ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3" aria-live="polite" data-ask-timeline-selected={selected.item.id}>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{selected.point.label}{selected.item.category ? ` · ${selected.item.category.label}` : ''}{selected.item.status ? ` · ${selected.item.status}` : ''}</p>
            <p className="font-semibold text-slate-950">{selected.item.label}</p>
            {block.controls?.selectionExport && <label className="mt-2 inline-flex min-h-8 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={selectedForExport.has(selected.item.id)} onChange={() => toggleSelected(selected.item.id)} className="h-4 w-4 rounded border-slate-300 text-teal-700" />Select for export</label>}
            {selected.item.meta && selected.item.meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{selected.item.meta.join(' · ')}</p>}
            {selected.item.description && <p className="mt-1 text-sm text-slate-600">{selected.item.description}</p>}
            <ItemActionButtons className="mt-2" item={selected.item} actions={selected.item.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} />
            {hasWindowDetail && <button type="button" data-ask-detail-trigger={selected.item.id} data-ask-detail-block={block.id} aria-expanded={detailId === selected.item.id} onClick={() => openDetail(selected.item.id)}
              className="mt-2 mr-3 min-h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-teal-800 hover:bg-slate-50">Review event<span className="sr-only"> {selected.item.label}</span></button>}
            {selected.item.href && !hasWindowDetail && <AskContextLink href={selected.item.href} className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:underline">Open record</AskContextLink>}
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
