'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronRight, CircleCheck, CircleDashed, Hammer, Layers, Loader2, LockKeyhole, Pencil, Repeat2, X } from 'lucide-react';
import { getSpec } from '@/app/(dashboard)/dashboard/properties/[id]/materials/materialSpecApi';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { cn } from '@/lib/utils';
import type { MaterialSpec } from '@/types';
import { CorrectionActions } from './CorrectionActions';
import { ActionLink } from './blocks/context';

// Material Specs (FRD v1.390): a compact, divider-based collection with an explicit View details, a continuous inline canonical detail for
// every household role, and a compact Manage region that holds Edit material (contributors and owners, declared by the server). The
// detail is read through the canonical spec route, so a material removed after the answer is a "no longer exists" state, not a stale card.

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemActionHandler = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string) => void;

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
}

const readable = (value: string | null | undefined): string => (value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded');

function formatDay(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString(undefined, { timeZone: 'UTC' });
}

export const MATERIAL_STATUS: Record<string, { label: string; note: string; className: string; icon: typeof CircleDashed }> = {
  PROPOSED: { label: 'Planned', note: 'Not yet confirmed as installed.', className: 'border-sky-200 bg-sky-50 text-sky-900', icon: CircleDashed },
  APPROVED: { label: 'Approved', note: 'Approved for use, not yet recorded as installed.', className: 'border-teal-200 bg-teal-50 text-teal-900', icon: CircleCheck },
  INSTALLED: { label: 'Installed', note: 'Recorded as installed in this home.', className: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: Hammer },
  AS_BUILT: { label: 'Verified installed', note: 'Installed and recorded as built; its identity can only change by recording a substitution.', className: 'border-emerald-300 bg-emerald-100 text-emerald-950', icon: BadgeCheck },
  SUBSTITUTED: { label: 'Replaced', note: 'Replaced by another material.', className: 'border-slate-300 bg-slate-100 text-slate-700', icon: Repeat2 },
};
const statusOf = (key: string | null | undefined) => MATERIAL_STATUS[key ?? ''] ?? MATERIAL_STATUS.PROPOSED;

function StatusPill({ status }: { status: string | null | undefined }) {
  const presentation = statusOf(status);
  const Icon = presentation.icon;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', presentation.className)}><Icon className="h-3 w-3" aria-hidden="true" />{presentation.label}</span>;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-900">{value}</dd></div>;
}

function MaterialDetail({ specId, expectedPropertyId, fallbackItem, disabled, onAction, onAccessLost, onClose }: {
  specId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled?: boolean;
  onAction?: ItemActionHandler;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [spec, setSpec] = useState<MaterialSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };
  const manageActions = fallbackItem.actions ?? [];
  const canManage = Boolean(onAction && manageActions.length > 0);

  useEffect(() => {
    if (!expectedPropertyId) { setLoading(false); setError(true); return undefined; }
    let active = true;
    setLoading(true); setError(false); setNotFound(false); setSpec(null);
    getSpec(expectedPropertyId, specId)
      .then((response) => { if (active) setSpec(response); })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = caught && typeof caught === 'object' ? ((caught as { payload?: { error?: { code?: unknown } } }).payload?.error?.code) : null;
        if (status === 404 && code === 'SPEC_NOT_FOUND') { setNotFound(true); return; }
        if (status === 401 || status === 403 || status === 404) { callbacksRef.current.onAccessLost(); return; }
        setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, specId]);

  useEffect(() => { if (!loading) headingRef.current?.focus(); }, [loading]);

  const status = statusOf(spec?.lifecycleStatus ?? fallbackItem.status);
  const productLine = spec ? [spec.manufacturer, spec.productLine, spec.productName].filter(Boolean).join(' · ') : '';
  const where = spec ? (spec.room?.name ?? (spec.scopeLevel === 'PROPERTY' ? 'Whole home' : 'Not recorded')) : '';

  return <aside className="border-t border-slate-200 bg-slate-50/70 px-4 py-5 sm:px-5" aria-labelledby={`material-detail-${specId}`} data-material-detail="">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Material detail</p>
          <StatusPill status={spec?.lifecycleStatus ?? fallbackItem.status} />
        </div>
        <h4 ref={headingRef} tabIndex={-1} id={`material-detail-${specId}`} className="mt-2 text-xl font-semibold tracking-tight text-slate-950 outline-none">{spec?.label ?? fallbackItem.title}</h4>
        <p className="mt-1 text-sm text-slate-600">{status.note}</p>
      </div>
      <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close material detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current material…</p>}
    {(notFound || error) && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
      <p className="text-sm font-semibold text-amber-900">{notFound ? 'Material no longer exists' : 'Could not verify the current material'}</p>
      <p className="mt-1 text-sm text-slate-700">{notFound ? 'This material was removed after the Ask result was created.' : 'The current canonical material record could not be loaded.'}</p>
      <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your home record.</p>
    </div>}
    {spec && <>
      <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Type" value={readable(spec.category)} />
        <Fact label="Where" value={where} />
        <Fact label="Surface" value={readable(spec.surface)} />
        <Fact label="Brand and product" value={productLine || 'Not recorded'} />
        <Fact label="SKU or part number" value={spec.sku ?? 'Not recorded'} />
        <Fact label="Colour" value={spec.colorCode || spec.colorHex
          ? <span className="inline-flex items-center gap-2">{spec.colorHex && <span className="inline-block h-4 w-4 rounded border border-slate-300" style={{ backgroundColor: spec.colorHex }} aria-hidden="true" />}{spec.colorCode ?? spec.colorHex}</span>
          : 'Not recorded'} />
        <Fact label="Finish" value={spec.finish ?? 'Not recorded'} />
        <Fact label="Size" value={spec.dimensions ?? 'Not recorded'} />
        <Fact label="Material" value={spec.material ?? 'Not recorded'} />
        <Fact label="Lot or batch" value={spec.lotBatch ?? 'Not recorded'} />
        <Fact label="Supplier" value={spec.supplier ?? 'Not recorded'} />
        <Fact label="Purchased" value={formatDay(spec.purchaseDate)} />
        <Fact label="Quantity" value={spec.quantityPurchased ?? 'Not recorded'} />
        {spec.linkedInventoryItemId && <Fact label="Linked inventory item" value="Linked" />}
        <Fact label="Verification" value={readable(spec.verificationConfidence)} />
      </dl>
      {(spec.supplierCheckedAt || spec.supplierDiscontinued || spec.successorProductUrl) && <section className="mt-5" aria-labelledby={`material-source-${specId}`}>
        <h5 id={`material-source-${specId}`} className="text-sm font-semibold text-slate-950">Supplier information</h5>
        <p className={cn('mt-1 text-sm leading-6', spec.supplierDiscontinued ? 'text-amber-900' : 'text-slate-700')}>
          {spec.supplierDiscontinued ? 'The supplier has marked this product discontinued.' : 'The supplier has not marked this product discontinued.'}
          {spec.supplierCheckedAt ? ` Supplier information last checked ${formatDay(spec.supplierCheckedAt)}.` : ''}
        </p>
      </section>}
      <section className="mt-5" aria-labelledby={`material-notes-${specId}`}>
        <h5 id={`material-notes-${specId}`} className="text-sm font-semibold text-slate-950">Notes</h5>
        <p className={cn('mt-1 whitespace-pre-line text-sm leading-6', spec.notes ? 'text-slate-700' : 'text-slate-500')}>{spec.notes || 'No notes are recorded.'}</p>
      </section>
      <section className="mt-5" aria-labelledby={`material-photos-${specId}`}>
        <h5 id={`material-photos-${specId}`} className="text-sm font-semibold text-slate-950">Photos</h5>
        {spec.photos.length > 0
          ? <ul className="mt-2 flex flex-wrap gap-2">{spec.photos.map((photo) => <li key={photo.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.photoUrl} alt={photo.caption ?? `Photo of ${spec.label}`} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" loading="lazy" />
          </li>)}</ul>
          : <p className="mt-1 text-sm text-slate-500">No photos are attached.</p>}
      </section>
      {canManage && <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby={`material-manage-${specId}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Pencil className="h-4 w-4 text-teal-700" aria-hidden="true" /><h5 id={`material-manage-${specId}`} className="text-sm font-semibold text-slate-950">Manage material</h5></div>
            <p className="mt-1 text-sm text-slate-600">Changes are reviewed before saving.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-material-actions="">
            <CorrectionActions className="mt-0" actions={manageActions} subject={spec.label} entityType={fallbackItem.entityType} entityId={fallbackItem.id} disabled={disabled} onAction={onAction!} />
          </div>
        </div>
      </section>}
      {!canManage && <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600" data-material-edit-unavailable="">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <p><span className="font-semibold text-slate-800">View only.</span> Your current access does not allow changes to this material.</p>
      </div>}
    </>}
  </aside>;
}

export function MaterialSpecResultList({ block, propertyId, disabled, onAction, onAccessLost }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: ItemActionHandler;
  onAccessLost: () => void;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId);
  const openDetail = (item: Item) => { if (controls) controls.openDetail(block.id, item.id); else setLocalDetailId(item.id); };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail(); else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-material-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };
  const addAction = block.actions.find((action) => action.interactionType === 'START_WORKFLOW');
  const visibleCount = block.sections.reduce((total, section) => total + section.items.length, 0);

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-material-specs="">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Layers className="h-4 w-4" aria-hidden="true" /></span>
          <h3 className="text-base font-semibold text-slate-950">{block.title}</h3>
          {visibleCount > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">{visibleCount} shown</span>}
        </div>
        {block.description && <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">{block.description}</p>}
      </div>
      {addAction && <div data-material-add=""><ActionLink action={addAction} /></div>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-200 px-4 py-4 last:border-b-0 sm:px-5">
      <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{section.title} · {section.count}</h4>
      <ul className="mt-2 divide-y divide-slate-200">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          const [where, ...rest] = item.meta;
          const canEdit = Boolean(onAction && (item.actions?.length ?? 0) > 0);
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('outline-offset-2 transition-colors', selected ? 'bg-teal-50/70' : 'hover:bg-slate-50')}>
            <button type="button" aria-label={item.title} data-material-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`material-detail-${item.id}`}
              onClick={() => openDetail(item)} className="group grid w-full gap-x-4 gap-y-1 px-1 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950 group-hover:text-teal-800">{item.title}</span>
                  <StatusPill status={item.status} />
                </div>
                <p className="mt-1 text-sm text-slate-700">{[where, item.description].filter(Boolean).join(' · ')}</p>
                {rest.length > 0 && <p className="mt-0.5 text-sm text-slate-500">{rest.join(' · ')}</p>}
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800">
                {!canEdit && <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><LockKeyhole className="h-3 w-3" aria-hidden="true" />View only</span>}
                View details <ChevronRight className={cn('h-4 w-4 transition-transform', detailId === item.id && 'rotate-90')} aria-hidden="true" />
              </span>
            </button>
          </li>;
        })}
      </ul>
    </div>)}
    {detailId && detailItem && <MaterialDetail key={detailId} specId={detailId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} />}
  </section>;
}
