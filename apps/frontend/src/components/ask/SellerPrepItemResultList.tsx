'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { getSaleCase } from '@/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/saleCaseApi';
import { CATEGORY_LABELS, REQUIREMENT_CLASS_LABELS, type SaleReadinessItem } from '@/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/types';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

// The decisions the sale-case page offers for the item's LIVE state: Pursue on an open presentation item ("Maximize
// your return"), Disclose and waive on an open professional-decision item, Reopen on a waived item. Stop pursuing is
// offered on any pursued item, so one pursued outside the presentation list (possible through Ask) can be undone.
export function saleItemActionsForLiveState(actions: ItemAction[], item: Pick<SaleReadinessItem, 'status' | 'category' | 'requirementClass'>): ItemAction[] {
  return actions.filter((action) => {
    switch (action.id) {
      case 'sale-item-pursue': return item.status === 'OPEN' && item.category === 'PRESENTATION';
      case 'sale-item-unpursue': return item.status === 'PURSUING';
      case 'sale-item-waive': return item.status === 'OPEN' && item.category !== 'PRESENTATION' && item.requirementClass === 'PROFESSIONAL_DECISION';
      case 'sale-item-reopen': return item.status === 'WAIVED';
      default: return false;
    }
  });
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
}

const STATUS_LABELS: Record<string, string> = { OPEN: 'Open', PURSUING: 'Pursuing before listing', WAIVED: 'Disclosed, not addressed', RESOLVED: 'Resolved' };
const range = (min: number | null, max: number | null) => {
  if (min == null) return null;
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return max == null || max === min ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
};

// Seller-prep capability-card slice (FRD v1.44). There is no single-item GET, so the item is re-read from the sale
// case (GET /properties/:id/sale-case, the sale-case page's own read). A missing item, or a sale case that no longer
// exists, is "removed"; an access denial redacts the whole result.
function SaleItemDetail({ item, expectedPropertyId, disabled, onAction, onAccessLost, onClose, link }: {
  item: Item;
  expectedPropertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const [live, setLive] = useState<SaleReadinessItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'NOT_FOUND' | 'REVALIDATION_FAILED' | null>(null);
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
    setLive(null);
    getSaleCase(expectedPropertyId)
      .then((overview) => {
        if (!active) return;
        const found = overview?.saleCase && Array.isArray(overview.readinessItems) ? overview.readinessItems.find((candidate) => candidate.id === item.id) : undefined;
        if (found) setLive(found);
        else setError('NOT_FOUND');
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 401 || status === 403 || status === 404) { callbacksRef.current.onAccessLost(); return; }
        setError('REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, item.id]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const actions = live && onAction ? saleItemActionsForLiveState(item.actions ?? [], live) : [];
  const cost = live ? range(live.estimatedCostMinCents, live.estimatedCostMaxCents) : null;
  const valueAdd = live ? range(live.estimatedValueAddMinCents, live.estimatedValueAddMaxCents) : null;

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`sale-item-detail-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Sale readiness item</p>
          <h4 ref={headingRef} tabIndex={-1} id={`sale-item-detail-${item.id}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{live?.title ?? item.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close item detail for ${item.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current item…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'NOT_FOUND' ? 'Item no longer on the checklist' : 'Could not verify the current item'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'NOT_FOUND' ? 'This item or its sale case was removed after the Ask result was created.' : 'The current sale readiness checklist could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with the checklist.</p>
      </div>}
      {live && <>
        {live.detail && <p className="mt-3 text-sm leading-6 text-slate-700">{live.detail}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{STATUS_LABELS[live.status] ?? live.status}</dd></div>
          <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{CATEGORY_LABELS[live.category] ?? live.category}</dd></div>
          <div><dt className="text-xs text-slate-500">Requirement</dt><dd className="mt-0.5 font-medium text-slate-900">{REQUIREMENT_CLASS_LABELS[live.requirementClass] ?? live.requirementClass}</dd></div>
          {cost && <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">{cost}</dd></div>}
          {valueAdd && <div><dt className="text-xs text-slate-500">Estimated value added</dt><dd className="mt-0.5 font-medium text-slate-900">{valueAdd}</dd></div>}
          {live.recommendedForBudget && <div><dt className="text-xs text-slate-500">Budget</dt><dd className="mt-0.5 font-medium text-slate-900">Recommended for your budget</dd></div>}
          {live.status === 'WAIVED' && live.waivedReason && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs text-slate-500">Reason</dt><dd className="mt-0.5 font-medium text-slate-900">{live.waivedReason}</dd></div>}
        </dl>
        {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} data-sale-item-action={action.id}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          onClick={() => onAction?.(item.entityType, item.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
        <p className="mt-3 text-xs text-slate-500">
          Target dates, budget, the personalization questions and the sale transition are on the checklist page.{' '}
          {item.href && link(item.href, <>Open in the checklist<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}
        </p>
      </>}
    </aside>
  );
}

// Renders SELLER_PREP_CHECKLIST's seller-prep-open-items block (FRD v1.44).
export function SellerPrepItemResultList({ block, propertyId, disabled, onAction, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
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
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sale-item-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => <li key={item.id} className={cn('rounded-xl border p-3', detailId === item.id ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
          <button type="button" data-sale-item-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`sale-item-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
        </li>)}
      </ul>
    </div>)}
    {detailId && detailItem && <SaleItemDetail key={detailId} item={detailItem} expectedPropertyId={propertyId} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} link={link} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : null)}</div>
  </section>;
}
