'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import type { PermitDetail } from '@/types';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

const words = (value: string | null | undefined) => value
  ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
  : 'Not recorded';
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : 'Not recorded';
const money = (value: number | null | undefined) => typeof value === 'number'
  ? (value / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  : 'Not recorded';
const errorStatus = (error: unknown) => error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
  ? (error as { status: number }).status
  : null;

function PermitDetailPanel({ item, propertyId, disabled, onAction, onAccessLost, onClose }: {
  item: Item;
  propertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [permit, setPermit] = useState<PermitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!propertyId) { setLoading(false); setFailed(true); return; }
    let active = true;
    setLoading(true);
    setFailed(false);
    api.getPermitDetail(propertyId, item.id)
      .then((value) => { if (active) setPermit(value); })
      .catch((error: unknown) => {
        if (!active) return;
        const status = errorStatus(error);
        if (status === 401 || status === 403) { onAccessLost(); return; }
        setFailed(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id, onAccessLost, propertyId]);

  useEffect(() => { if (!loading) headingRef.current?.focus(); }, [loading]);

  return <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`permit-detail-${item.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Permit detail</p>
        <h4 ref={headingRef} tabIndex={-1} id={`permit-detail-${item.id}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{item.title}</h4>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close permit detail for ${item.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current permit…</p>}
    {failed && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert"><p className="text-sm font-semibold text-amber-900">Could not verify the current permit</p><p className="mt-1 text-sm text-slate-700">The permit may have changed since this answer was created.</p></div>}
    {permit && <>
      {permit.description && <p className="mt-3 text-sm leading-6 text-slate-700">{permit.description}</p>}
      <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Official status</dt><dd className="mt-0.5 font-medium text-slate-900">{words(permit.status)}</dd></div>
        <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{words(permit.category)}</dd></div>
        <div><dt className="text-xs text-slate-500">Permit number</dt><dd className="mt-0.5 font-medium text-slate-900">{permit.permitNumber || 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-slate-500">Issued</dt><dd className="mt-0.5 font-medium text-slate-900">{date(permit.issueDate)}</dd></div>
        <div><dt className="text-xs text-slate-500">Expires</dt><dd className="mt-0.5 font-medium text-slate-900">{date(permit.expirationDate)}</dd></div>
        <div><dt className="text-xs text-slate-500">Finaled</dt><dd className="mt-0.5 font-medium text-slate-900">{date(permit.finaledDate)}</dd></div>
        <div><dt className="text-xs text-slate-500">Contractor</dt><dd className="mt-0.5 font-medium text-slate-900">{permit.contractorName || 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">{money(permit.estimatedCostCents)}</dd></div>
        <div><dt className="text-xs text-slate-500">Open inspections</dt><dd className="mt-0.5 font-medium text-slate-900">{permit.inspectionMilestones.filter((step) => !['PASSED', 'WAIVED'].includes(step.status)).length}</dd></div>
      </dl>
      {(item.actions ?? []).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{item.actions?.map((action) => <button key={action.id} type="button" disabled={disabled} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onAction?.(action.entityType ?? item.entityType, action.entityId ?? item.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
      <p className="mt-3 text-xs text-slate-500">Official status comes from the recorded authority evidence; household-reported status does not replace it.</p>
    </>}
  </aside>;
}

export function PermitResultList({ block, propertyId, disabled, onAction, onAccessLost }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId && item.entityType === 'PERMIT_RECORD');
  const open = (item: Item) => controls ? controls.openDetail(block.id, item.id) : setLocalDetailId(item.id);
  const close = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail(); else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-permit-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4"><h3 className="font-semibold text-slate-950">{block.title}</h3>{block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}</div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-600">No pending permit records were found in this home record.</p>}
      <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">{section.items.map((item) => <li key={item.id} className={cn('px-1 py-2.5', detailId === item.id && 'bg-teal-50')}>
        <button type="button" data-permit-detail-trigger={item.id} aria-expanded={detailId === item.id} aria-controls={`permit-detail-${item.id}`} onClick={() => open(item)} className="group flex min-h-10 w-full items-center justify-between gap-3 text-left font-semibold text-slate-950 hover:text-teal-800"><span className="truncate group-hover:underline">{item.title}</span><ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', detailId === item.id && 'rotate-90')} aria-hidden="true" /></button>
        {item.description && <p className="mt-0.5 text-sm text-slate-600">{item.description}</p>}
      </li>)}</ul>
    </div>)}
    {detailItem && <PermitDetailPanel key={detailItem.id} item={detailItem} propertyId={propertyId} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={close} />}
  </section>;
}
