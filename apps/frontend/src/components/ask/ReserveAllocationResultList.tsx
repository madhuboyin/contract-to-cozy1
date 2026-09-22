'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { listLineItems, type ReserveFundLineItemDTO } from '@/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/reserveFundApi';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

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

// Same shape of exception as HouseholdMemberDetail/WarrantyDetail: the reserve-fund line-items endpoint
// (reserveFundApi.listLineItems) has no per-line-item GET, only a list, so a retired-and-cleared or otherwise
// removed line item is a data absence, never an HTTP 404 -- there is no shared-status ambiguity to resolve the
// way Inventory/Document detail must. Read-only, like Household: no per-item mutation operation exists, so no
// onAction prop -- this is the Home Capital Timeline reference journey's first inline-detail slice (item-level
// "planning/refinement" writes remain a separate, not-yet-scoped follow-up, per the FRD's own Appendix D language).
function ReserveAllocationDetail({ lineItemId, expectedPropertyId, fallbackItem, onAccessLost, onClose }: {
  lineItemId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [lineItem, setLineItem] = useState<ReserveFundLineItemDTO | null>(null);
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
    setLineItem(null);
    listLineItems(expectedPropertyId)
      .then((lineItems) => {
        if (!active) return;
        const match = lineItems.find((candidate) => candidate.id === lineItemId);
        if (!match) { setNotFound(true); return; }
        setLineItem(match);
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
  }, [expectedPropertyId, lineItemId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const title = lineItem?.timelineItem?.inventoryItem?.name ?? label(lineItem?.timelineItem?.category) ?? fallbackItem.title;

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`reserve-allocation-detail-${lineItemId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Reserve allocation detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`reserve-allocation-detail-${lineItemId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{title}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close reserve allocation detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current reserve allocation…</p>}
    {(notFound || error) && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{notFound ? 'Allocation no longer exists' : 'Could not verify the current allocation'}</p>
      <p className="mt-1 text-sm text-slate-700">{notFound ? 'This allocation was removed after the Ask result was created.' : 'The current canonical reserve fund record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your reserve fund.</p>
    </div>}
    {lineItem && <>
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{label(lineItem.status)}</dd></div>
        <div><dt className="text-xs text-slate-500">Target cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatCents(lineItem.targetCostCents)}</dd></div>
        <div><dt className="text-xs text-slate-500">Allocated monthly</dt><dd className="mt-0.5 font-medium text-slate-900">{formatCents(lineItem.allocatedMonthlyCents)}</dd></div>
        <div><dt className="text-xs text-slate-500">Allocated balance</dt><dd className="mt-0.5 font-medium text-slate-900">{formatCents(lineItem.allocatedBalanceCents)}</dd></div>
        <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{label(lineItem.timelineItem?.category)}</dd></div>
        <div><dt className="text-xs text-slate-500">Event type</dt><dd className="mt-0.5 font-medium text-slate-900">{label(lineItem.timelineItem?.eventType)}</dd></div>
        <div><dt className="text-xs text-slate-500">Planning window</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(lineItem.timelineItem?.windowStart)} – {formatDate(lineItem.timelineItem?.windowEnd)}</dd></div>
        <div><dt className="text-xs text-slate-500">Estimated cost range</dt><dd className="mt-0.5 font-medium text-slate-900">{lineItem.timelineItem?.estimatedCostMinCents == null || lineItem.timelineItem?.estimatedCostMaxCents == null ? 'Not recorded' : `${formatCents(lineItem.timelineItem.estimatedCostMinCents)} – ${formatCents(lineItem.timelineItem.estimatedCostMaxCents)}`}</dd></div>
        {lineItem.retiredAt && <div><dt className="text-xs text-slate-500">Retired</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(lineItem.retiredAt)}{lineItem.retiredReason ? ` · ${label(lineItem.retiredReason)}` : ''}</dd></div>}
        {lineItem.timelineItem?.inventoryItem && <div><dt className="text-xs text-slate-500">Linked inventory item</dt><dd className="mt-0.5 font-medium text-slate-900">{lineItem.timelineItem.inventoryItem.name} · {label(lineItem.timelineItem.inventoryItem.condition)}</dd></div>}
      </dl>
      {lineItem.timelineItem?.why && <p className="mt-3 text-sm leading-6 text-slate-700">{lineItem.timelineItem.why}</p>}
      <p className="mt-3 text-xs text-slate-500">Current canonical reserve allocation record.</p>
    </>}
  </aside>;
}

export function ReserveAllocationResultList({ block, propertyId, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-reserve-allocation-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No reserve allocations are recorded yet.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-reserve-allocation-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`reserve-allocation-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
            </div>
            {item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}
            {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more allocations are available through the full Reserve Fund page.</p>}
    </div>)}
    {detailId && detailItem && <ReserveAllocationDetail key={detailId} lineItemId={detailId} expectedPropertyId={propertyId} fallbackItem={detailItem} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : action.interactionType === 'START_WORKFLOW' ? <ActionLink key={action.id} action={action} /> : null)}</div>
  </section>;
}
