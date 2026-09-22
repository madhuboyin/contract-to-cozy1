'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { getLatestTimeline, type TimelineItemDTO } from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

function label(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function formatCents(cents: number | null | undefined): string {
  return cents == null ? 'Not recorded' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

// Same list-scan exception as ReserveAllocationDetail (see that file's own
// comment): the capital timeline endpoint (capitalTimelineApi.getLatestTimeline)
// has no per-item GET, only the whole analysis, so an item removed or
// superseded by a later re-run is a data absence, never an HTTP 404. Read-only:
// no per-item mutation operation exists here either -- this is the TABLE-block
// row-click-to-detail platform capability's first (and so far only) slice;
// "planning/refinement" writes remain the same deliberately unscoped follow-up
// already noted for reserve-allocations (FRD Appendix D).
export function CapitalWindowDetail({ windowId, expectedPropertyId, fallbackTitle, onAccessLost, onClose }: {
  windowId: string;
  expectedPropertyId?: string;
  fallbackTitle: string;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [item, setItem] = useState<TimelineItemDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError(true);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    setNotFound(false);
    setItem(null);
    getLatestTimeline(expectedPropertyId)
      .then((result) => {
        if (!active) return;
        const match = result.analysis?.items.find((candidate) => candidate.id === windowId);
        if (!match) { setNotFound(true); return; }
        setItem(match);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 401 || status === 403 || status === 404) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, windowId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const title = item?.inventoryItem?.name ?? (item ? label(item.category) : fallbackTitle);

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`capital-window-detail-${windowId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Capital window detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`capital-window-detail-${windowId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{title}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close capital window detail for ${title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current capital timeline item…</p>}
    {(notFound || error) && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{notFound ? 'Capital window no longer exists' : 'Could not verify the current capital window'}</p>
      <p className="mt-1 text-sm text-slate-700">{notFound ? 'This planning window was removed or superseded after the Ask result was created.' : 'The current canonical capital timeline record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your capital timeline.</p>
    </div>}
    {item && <>
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{label(item.category)}</dd></div>
        <div><dt className="text-xs text-slate-500">Event type</dt><dd className="mt-0.5 font-medium text-slate-900">{label(item.eventType)}</dd></div>
        <div><dt className="text-xs text-slate-500">Planning window</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(item.windowStart)} – {formatDate(item.windowEnd)}</dd></div>
        <div><dt className="text-xs text-slate-500">Estimated cost range</dt><dd className="mt-0.5 font-medium text-slate-900">{item.estimatedCostMinCents == null || item.estimatedCostMaxCents == null ? 'Not recorded' : `${formatCents(item.estimatedCostMinCents)} – ${formatCents(item.estimatedCostMaxCents)}`}</dd></div>
        <div><dt className="text-xs text-slate-500">Confidence</dt><dd className="mt-0.5 font-medium text-slate-900">{label(item.confidence)}</dd></div>
        <div><dt className="text-xs text-slate-500">Priority</dt><dd className="mt-0.5 font-medium text-slate-900">{label(item.priority)}</dd></div>
        {item.inventoryItem && <div><dt className="text-xs text-slate-500">Linked inventory item</dt><dd className="mt-0.5 font-medium text-slate-900">{item.inventoryItem.name}{item.inventoryItem.brand ? ` · ${item.inventoryItem.brand}` : ''}{item.inventoryItem.model ? ` ${item.inventoryItem.model}` : ''}</dd></div>}
        {item.missingFactors.length > 0 && <div><dt className="text-xs text-slate-500">Missing factors</dt><dd className="mt-0.5 font-medium text-slate-900">{item.missingFactors.map((factor) => label(factor)).join(', ')}</dd></div>}
      </dl>
      {item.why && <p className="mt-3 text-sm leading-6 text-slate-700">{item.why}</p>}
      <p className="mt-3 text-xs text-slate-500">Current canonical capital timeline record.</p>
    </>}
  </aside>;
}
