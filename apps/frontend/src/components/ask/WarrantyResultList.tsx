'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { CorrectionActions } from './CorrectionActions';
import { ActionLink } from './blocks/context';
import type { Warranty } from '@/types';

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

function formatCurrency(value: number | null | undefined): string {
  return value == null ? 'Not recorded' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

// Same shape of exception as HouseholdMemberDetail: the property-scoped
// warranties endpoint (getPropertyWarranties) has no per-warranty GET, only
// a list, so a removed warranty is a data absence, never an HTTP 404 --
// there is no shared-status ambiguity to resolve the way Inventory/Document
// detail must.
type WarrantyItemActionHandler = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

function WarrantyDetail({ warrantyId, expectedPropertyId, fallbackItem, disabled, onAction, onAccessLost, onClose }: {
  warrantyId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled?: boolean;
  onAction?: WarrantyItemActionHandler;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [warranty, setWarranty] = useState<Warranty | null>(null);
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
    setWarranty(null);
    api.getPropertyWarranties(expectedPropertyId)
      .then((warranties) => {
        if (!active) return;
        const match = warranties.find((candidate) => candidate.id === warrantyId);
        if (!match) { setNotFound(true); return; }
        setWarranty(match);
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
  }, [expectedPropertyId, warrantyId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`warranty-detail-${warrantyId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Warranty detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`warranty-detail-${warrantyId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{warranty?.providerName ?? fallbackItem.title}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close warranty detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current warranty record…</p>}
    {(notFound || error) && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{notFound ? 'Warranty no longer exists' : 'Could not verify the current warranty'}</p>
      <p className="mt-1 text-sm text-slate-700">{notFound ? 'This warranty was removed after the Ask result was created.' : 'The current canonical warranty record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your home record.</p>
    </div>}
    {warranty && <>
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{label(warranty.category)}</dd></div>
        <div><dt className="text-xs text-slate-500">Policy number</dt><dd className="mt-0.5 font-medium text-slate-900">{warranty.policyNumber ?? 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-slate-500">Cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatCurrency(warranty.cost)}</dd></div>
        <div><dt className="text-xs text-slate-500">Start date</dt><dd className="mt-0.5 font-medium text-slate-900">{new Date(warranty.startDate).toLocaleDateString()}</dd></div>
        <div><dt className="text-xs text-slate-500">Expires</dt><dd className="mt-0.5 font-medium text-slate-900">{new Date(warranty.expiryDate).toLocaleDateString()}</dd></div>
        <div><dt className="text-xs text-slate-500">Linked documents</dt><dd className="mt-0.5 font-medium text-slate-900">{warranty.documents?.length ?? 0}</dd></div>
      </dl>
      {warranty.coverageDetails && <p className="mt-3 text-sm leading-6 text-slate-700">{warranty.coverageDetails}</p>}
      {onAction && <CorrectionActions actions={fallbackItem.actions ?? []} subject={warranty.providerName} entityType={fallbackItem.entityType} entityId={fallbackItem.id} disabled={disabled} onAction={onAction} />}
      <p className="mt-3 text-xs text-slate-500">Current canonical warranty record.</p>
    </>}
  </aside>;
}

export function WarrantyResultList({ block, propertyId, disabled, onAction, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: WarrantyItemActionHandler;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailWarrantyId, setLocalDetailWarrantyId] = useState<string | null>(null);
  const detailWarrantyId = controls ? controls.detailIdFor(block.id) : localDetailWarrantyId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailWarrantyId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailWarrantyId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailWarrantyId;
    if (controls) controls.closeDetail();
    else setLocalDetailWarrantyId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-warranty-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No warranties are recorded yet.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-warranty-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailWarrantyId === item.id} aria-controls={`warranty-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
            </div>
            {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more warranties are available through the full Warranties collection.</p>}
    </div>)}
    {detailWarrantyId && detailItem && <WarrantyDetail key={detailWarrantyId} warrantyId={detailWarrantyId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : action.interactionType === 'START_WORKFLOW' ? <ActionLink key={action.id} action={action} /> : null)}</div>
  </section>;
}
