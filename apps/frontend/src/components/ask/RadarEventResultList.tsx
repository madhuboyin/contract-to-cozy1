'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';
import type { RadarCanonicalDetail } from '@/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

// FRD v1.40: the feed declares every action the member's role allows; only the ones valid for the event's LIVE
// canonical state (re-fetched on open) are shown, mirroring the traditional page's own toggles -- Save/Remove from
// saved, Dismiss/Restore, Mark done (one-way). Save and Dismiss are hidden on a done event because the server
// refuses them there (leaving "done" would re-trigger the property risk recheck without confirmation).
export function radarActionsForLiveState(actions: ItemAction[], userState: string | null | undefined): ItemAction[] {
  const state = userState ?? 'new';
  return actions.filter((action) => {
    switch (action.id) {
      case 'radar-save': return state !== 'saved' && state !== 'acted_on';
      case 'radar-unsave': return state === 'saved';
      case 'radar-dismiss': return state !== 'dismissed' && state !== 'acted_on';
      case 'radar-restore': return state === 'dismissed';
      case 'radar-mark-done': return state !== 'acted_on';
      default: return true;
    }
  });
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

// Same ambiguity as InventoryResultList/HomeEventResultList's own errorCode:
// propertyAuthMiddleware's access-denial 404 and the genuine match-not-found
// 404 (RADAR_MATCH_NOT_FOUND, from radarQueryService.getDetail) share the
// same HTTP status -- must distinguish by the response body's error code,
// not status alone.
function errorCode(error: unknown): string | null {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const code = payload && typeof payload === 'object' ? (payload as { error?: { code?: unknown } }).error?.code : null;
  return typeof code === 'string' ? code : null;
}

function label(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 1 cross-cutting, capability-card audit
// (Appendix D), second reference journey. Reads api.getRadarEventDetail
// directly -- the SAME canonical /radar/events/:matchId read the
// traditional Home Event Radar page itself calls -- rather than a
// list-scan data-absence pattern (Warranty/Household/Reserve's own
// exception): unlike those collections, this canonical endpoint has a real
// single-match GET, with its own genuine 404 (RADAR_MATCH_NOT_FOUND) and no
// state-mutation side effect (confirmed by reading radarQueryService.getDetail
// in full -- unlike the older /radar/matches/:matchId route, which
// auto-marks a match "seen").
function RadarEventDetail({ matchId, expectedPropertyId, fallbackItem, disabled, onAction, onAccessLost, onClose }: {
  matchId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RadarCanonicalDetail | null>(null);
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
    setDetail(null);
    api.getRadarEventDetail(expectedPropertyId, matchId)
      .then((fetched) => {
        if (!active) return;
        setDetail(fetched);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = errorCode(caught);
        if (status === 401 || (status === 404 && code !== 'RADAR_MATCH_NOT_FOUND')) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(status === 404 ? 'MATCH_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, matchId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`radar-event-detail-${matchId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Monitored event detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`radar-event-detail-${matchId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{detail?.title ?? fallbackItem.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close monitored event detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current monitored event…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'MATCH_NOT_FOUND' ? 'Event no longer exists' : 'Could not verify the current event'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'MATCH_NOT_FOUND' ? 'This monitored event was removed or is no longer visible after the Ask result was created.' : 'The current canonical record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with Home Event Radar.</p>
      </div>}
      {detail && <>
        {detail.summary && <p className="mt-3 text-sm leading-6 text-slate-700">{detail.summary}</p>}
        {detail.impactSummary && <p className="mt-1 text-sm leading-6 text-slate-600">{detail.impactSummary}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Severity</dt><dd className="mt-0.5 font-medium text-slate-900">{label(detail.severity)}</dd></div>
          <div><dt className="text-xs text-slate-500">Impact</dt><dd className="mt-0.5 font-medium text-slate-900">{label(detail.impact)}</dd></div>
          <div><dt className="text-xs text-slate-500">Priority</dt><dd className="mt-0.5 font-medium text-slate-900">{label(detail.priorityBand)}</dd></div>
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{label(detail.lifecycleStatus)}</dd></div>
          <div><dt className="text-xs text-slate-500">Your state</dt><dd className="mt-0.5 font-medium text-slate-900">{label(detail.userState)}</dd></div>
          <div><dt className="text-xs text-slate-500">Source</dt><dd className="mt-0.5 font-medium text-slate-900">{detail.sourceName}{detail.provider ? ` · ${detail.provider}` : ''}</dd></div>
          <div><dt className="text-xs text-slate-500">Effective</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(detail.effectiveAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Expires</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(detail.expiresAt)}</dd></div>
          {detail.isSourceStale && <div><dt className="text-xs text-slate-500">Freshness</dt><dd className="mt-0.5 font-medium text-amber-800">{detail.sourceFreshnessReason ?? 'This source may be stale.'}</dd></div>}
        </dl>
        {detail.matchExplanation?.homeownerExplanation && <p className="mt-3 text-sm leading-6 text-slate-700">{detail.matchExplanation.homeownerExplanation}</p>}
        {detail.recommendedActions.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended</p>
            <ul className="mt-2 space-y-1.5">
              {detail.recommendedActions.slice(0, 8).map((action) => (
                <li key={action.code} className="text-sm text-slate-700">{action.label}</li>
              ))}
            </ul>
          </div>
        )}
        {detail.relatedIncident && (
          <p className="mt-3 text-sm text-slate-700">
            Related incident: <a href={detail.relatedIncident.href} className="font-semibold text-teal-800 underline-offset-4 hover:underline">{detail.relatedIncident.title}</a> ({label(detail.relatedIncident.status)})
          </p>
        )}
        {detail.relatedGuidance && (
          <p className="mt-1 text-sm text-slate-700">
            Related guidance: <a href={detail.relatedGuidance.href} className="font-semibold text-teal-800 underline-offset-4 hover:underline">{detail.relatedGuidance.currentStep?.label ?? 'Continue'}</a>
          </p>
        )}
        {(() => {
          const actions = onAction ? radarActionsForLiveState(fallbackItem.actions ?? [], detail.userState) : [];
          return <>
            {detail.userState === 'acted_on' && <p className="mt-4 text-sm text-slate-600">You marked this event done. To change that, use Home Event Radar.</p>}
            {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} data-radar-action={action.id}
              className={cn('min-h-10 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50', action.style === 'PRIMARY' ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-800')}
              onClick={() => onAction?.(fallbackItem.entityType, fallbackItem.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
          </>;
        })()}
        <p className="mt-3 text-xs text-slate-500">Current canonical Home Event Radar record.</p>
      </>}
    </aside>
  );
}

// Second bespoke GROUPED_LIST exception in the capability-card audit arc
// (after ReserveAllocationResultList): renders the home-event-radar-feed
// block (HOME_EVENT_RADAR_FEED operation) with canonical inline detail.
// FRD v1.40 added filter chips and the per-user writes (item actions shown in
// the detail); task create-or-link is still out of scope.
export function RadarEventResultList({ block, propertyId, disabled, onFilter, onAction, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onFilter?: (message: string) => void;
  onAction?: OnAction;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailMatchId, setLocalDetailMatchId] = useState<string | null>(null);
  const detailMatchId = controls ? controls.detailIdFor(block.id) : localDetailMatchId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailMatchId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailMatchId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailMatchId;
    if (controls) controls.closeDetail();
    else setLocalDetailMatchId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-radar-event-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {onFilter && block.filters.length > 0 && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter monitored events">
        {block.filters.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No monitored events in this group.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-radar-event-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailMatchId === item.id} aria-controls={`radar-event-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
            </div>
            {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
            {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more monitored events are available through the full Home Event Radar feed.</p>}
    </div>)}
    {detailMatchId && detailItem && <RadarEventDetail key={detailMatchId} matchId={detailMatchId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : action.interactionType === 'START_WORKFLOW' ? <ActionLink key={action.id} action={action} /> : null)}</div>
  </section>;
}
