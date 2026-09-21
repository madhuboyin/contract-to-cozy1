'use client';

import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { getHomeEvent, type HomeEvent } from '@/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

// Same ambiguity as InventoryResultList's own errorCode: propertyAuthMiddleware's
// access-denial 404 ("Property not found or access denied.") and the
// event-not-found 404 (HOME_EVENT_NOT_FOUND, from HomeEventsService.getHomeEvent)
// share the same HTTP status -- must distinguish by the response body's
// error code, not status alone.
function errorCode(error: unknown): string | null {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const code = payload && typeof payload === 'object' ? (payload as { error?: { code?: unknown } }).error?.code : null;
  return typeof code === 'string' ? code : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function formatAmount(value: string | null | undefined, currency: string | null | undefined): string {
  const parsed = value == null ? null : Number(value);
  return parsed == null || Number.isNaN(parsed)
    ? 'Not recorded'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(parsed);
}

function fieldLabel(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

type HomeEventItemActionHandler = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

function HomeEventDetail({ eventId, expectedPropertyId, fallbackItem, disabled, onAction, onAccessLost, onClose }: {
  eventId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled?: boolean;
  onAction?: HomeEventItemActionHandler;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [event, setEvent] = useState<HomeEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError('REVALIDATION_FAILED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setEvent(null);
    getHomeEvent(expectedPropertyId, eventId)
      .then((fetched) => {
        if (!active) return;
        if (!fetched) throw new Error('This home timeline event is unavailable.');
        setEvent(fetched);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = errorCode(caught);
        if (status === 401 || (status === 404 && code !== 'HOME_EVENT_NOT_FOUND')) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(status === 404 ? 'EVENT_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, eventId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`home-event-detail-${eventId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Timeline event detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`home-event-detail-${eventId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{event?.title ?? fallbackItem.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close timeline event detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current timeline event…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'EVENT_NOT_FOUND' ? 'Event no longer exists' : 'Could not verify the current event'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'EVENT_NOT_FOUND' ? 'This event was removed after the Ask result was created.' : 'The current canonical record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your home timeline.</p>
      </div>}
      {event && <>
        {event.summary && <p className="mt-3 text-sm leading-6 text-slate-700">{event.summary}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Type</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(event.type)}{event.subtype ? ` · ${fieldLabel(event.subtype)}` : ''}</dd></div>
          <div><dt className="text-xs text-slate-500">Importance</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(event.importance)}</dd></div>
          <div><dt className="text-xs text-slate-500">Visibility</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(event.visibility)}</dd></div>
          <div><dt className="text-xs text-slate-500">Occurred</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(event.occurredAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Verification</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(event.verificationStatus)}</dd></div>
          <div><dt className="text-xs text-slate-500">Recorded as</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(event.observationKind)}</dd></div>
          <div><dt className="text-xs text-slate-500">Amount</dt><dd className="mt-0.5 font-medium text-slate-900">{formatAmount(event.amount, event.currency)}</dd></div>
        </dl>
        {onAction && (fallbackItem.actions?.length ?? 0) > 0 && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Corrections for ${event.title}`}>
          {fallbackItem.actions!.map((action) => <button key={action.id} type="button" disabled={disabled}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            onClick={() => onAction(fallbackItem.entityType, fallbackItem.id, action.message, action.operationId, action.interactionType)}>{action.label}<span className="sr-only"> for {event.title}</span></button>)}
        </div>}
        <p className="mt-3 text-xs text-slate-500">{event.documents?.length ?? 0} document{(event.documents?.length ?? 0) === 1 ? '' : 's'} · Current canonical record · updated {formatDate(event.updatedAt)}</p>
      </>}
    </aside>
  );
}

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: renders authoritative HomeEvent
// collections (`inventory-history` and PROPERTY_SUMMARY's
// `property-recent-events`) with the same inline-detail pattern as
// InventoryResultList/MaintenanceResultList, but for a different canonical
// entity (HomeEvent, via the existing homeEventsApi.getHomeEvent -- no new
// API client method needed). No per-item mutation actions exist for these
// blocks.
export function HomeEventResultList({ block, propertyId, disabled, onAction, onFilter, onPage, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: HomeEventItemActionHandler;
  onFilter: (message: string) => void;
  onPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailEventId, setLocalDetailEventId] = useState<string | null>(null);
  const detailEventId = controls ? controls.detailIdFor(block.id) : localDetailEventId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailEventId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailEventId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailEventId;
    if (controls) controls.closeDetail();
    else setLocalDetailEventId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-home-event-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {block.filters.length > 0 && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Timeline filters">
        {block.filters.map((filter) => <button key={filter.id} type="button" aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>}
    </div>
    {block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const visible = controls?.view.visibleCounts[section.id] ?? 5;
      return <div key={section.id} className="border-b border-slate-100 p-4">
        <h4 className="font-semibold">{section.title} · {section.count}</h4>
        {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No visible timeline events.</p>}
        <ul className="mt-3 space-y-3">
          {section.items.slice(0, controls ? visible : section.items.length).map((item) => {
            const selected = controls?.view.selectedTaskId === item.id;
            return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-home-event-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailEventId === item.id} aria-controls={`home-event-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
                {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>
              {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
            </li>;
          })}
        </ul>
        {controls && visible < section.items.length && <button type="button" className="mt-3 min-h-10 text-sm font-semibold text-teal-800" onClick={() => controls.change((view) => ({ ...view, visibleCounts: { ...view.visibleCounts, [section.id]: Math.min(section.items.length, visible + 5) } }))}>Show more {section.title.toLowerCase()} events ({offset + Math.min(visible, section.items.length)} of {section.count} reached)</button>}
        {(offset > 0 || offset + section.items.length < section.count) && <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3" aria-label={`${section.title} pages`}>
          <p className="text-xs text-slate-500">Server results {section.items.length ? offset + 1 : 0}–{offset + section.items.length} of {section.count}</p>
          <div className="flex gap-2">
            {offset > 0 && <button type="button" className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => onPage(section.id, 'PREVIOUS')}>Previous page<span className="sr-only"> of {section.title}</span></button>}
            {offset + section.items.length < section.count && <button type="button" className="min-h-10 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => onPage(section.id, 'NEXT')}>Next page<span className="sr-only"> of {section.title}</span></button>}
          </div>
        </nav>}
      </div>;
    })}
    {detailEventId && detailItem && <HomeEventDetail key={detailEventId} eventId={detailEventId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span>)}</div>
  </section>;
}
