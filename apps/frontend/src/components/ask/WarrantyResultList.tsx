'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronRight, ExternalLink, FileText, Loader2, LockKeyhole, Pencil, ShieldCheck, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { CorrectionActions } from './CorrectionActions';
import { AttachEvidenceControl, EVIDENCE_ATTACH_MESSAGES } from './AttachEvidenceControl';
import { ActionLink } from './blocks/context';
import { useCalmAnswer } from './blocks/calmContext';
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

// Warranty dates are stored as calendar days at UTC midnight, and the Ask row states them that way ("Expires Dec 1, 2027"). Formatting in the
// browser's local zone showed the previous day in the Americas, so the detail disagreed with the row above it.
function formatDay(value: string | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString(undefined, { timeZone: 'UTC' });
}

function formatCurrency(value: number | null | undefined): string {
  return value == null ? 'Not recorded' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function statusPresentation(status: string | null | undefined): { label: string; className: string } {
  switch (status) {
    case 'ACTIVE': return { label: 'Active', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
    case 'EXPIRING': return { label: 'Expiring soon', className: 'border-amber-200 bg-amber-50 text-amber-900' };
    case 'EXPIRED': return { label: 'Expired', className: 'border-rose-200 bg-rose-50 text-rose-800' };
    case 'NEEDS_REVIEW': return { label: 'Needs review', className: 'border-amber-200 bg-amber-50 text-amber-900' };
    case 'STARTS_LATER': return { label: 'Starts later', className: 'border-sky-200 bg-sky-50 text-sky-800' };
    default: return { label: status?.replace(/_/g, ' ') ?? 'Status unavailable', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
}

function documentCount(item: Item): string | null {
  return item.meta.find((value) => /^\d+ documents?$/.test(value)) ?? null;
}

// Same shape of exception as HouseholdMemberDetail: the property-scoped
// warranties endpoint (getPropertyWarranties) has no per-warranty GET, only
// a list, so a removed warranty is a data absence, never an HTTP 404 --
// there is no shared-status ambiguity to resolve the way Inventory/Document
// detail must.
type WarrantyItemActionHandler = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string) => void;

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
  const correctionActions = fallbackItem.actions ?? [];
  const status = statusPresentation(fallbackItem.status);
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

  return <aside className="border-t border-slate-200 bg-slate-50/70 px-4 py-5 sm:px-5" aria-labelledby={`warranty-detail-${warrantyId}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Warranty detail</p>
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', status.className)}>{status.label}</span>
        </div>
        <h4 ref={headingRef} tabIndex={-1} id={`warranty-detail-${warrantyId}`} className="mt-2 text-xl font-semibold tracking-tight text-slate-950 outline-none">{warranty?.providerName ?? fallbackItem.title}</h4>
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
      <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{label(warranty.category)}</dd></div>
        <div><dt className="text-xs text-slate-500">Policy number</dt><dd className="mt-0.5 font-medium text-slate-900">{warranty.policyNumber ?? 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-slate-500">Cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatCurrency(warranty.cost)}</dd></div>
        <div><dt className="text-xs text-slate-500">Start date</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDay(warranty.startDate)}</dd></div>
        <div><dt className="text-xs text-slate-500">Expires</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDay(warranty.expiryDate)}</dd></div>
        <div><dt className="text-xs text-slate-500">Linked documents</dt><dd className="mt-0.5 font-medium text-slate-900">{warranty.documents?.length ?? 0}</dd></div>
      </dl>
      <section className="mt-5" aria-labelledby={`warranty-coverage-${warrantyId}`}>
        <h5 id={`warranty-coverage-${warrantyId}`} className="text-sm font-semibold text-slate-950">Coverage details</h5>
        <p className={cn('mt-1 text-sm leading-6', warranty.coverageDetails ? 'text-slate-700' : 'text-amber-900')}>
          {warranty.coverageDetails || 'No coverage details are recorded. Add them so future repair and coverage decisions have the right context.'}
        </p>
      </section>
      {onAction && correctionActions.length > 0 && <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby={`warranty-manage-${warrantyId}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h5 id={`warranty-manage-${warrantyId}`} className="text-sm font-semibold text-slate-950">Manage warranty</h5>
            </div>
            <p className="mt-1 text-sm text-slate-600">Changes are reviewed before saving.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-warranty-actions="">
            <CorrectionActions className="mt-0" actions={correctionActions} subject={warranty.providerName} entityType={fallbackItem.entityType} entityId={fallbackItem.id} disabled={disabled} onAction={onAction} />
            <AttachEvidenceControl
              className="mt-0"
              event={{ entityType: fallbackItem.entityType, id: fallbackItem.id, title: warranty.providerName }}
              propertyId={expectedPropertyId}
              disabled={disabled}
              label="Attach document"
              onAttached={(documentId) => onAction(fallbackItem.entityType, fallbackItem.id, EVIDENCE_ATTACH_MESSAGES.WARRANTY, 'CAPTURE_EVIDENCE_CONFIRM', 'MUTATE_RECORD', documentId)}
            />
          </div>
        </div>
      </section>}
      {correctionActions.length === 0 && <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600" data-warranty-edit-unavailable="">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <p><span className="font-semibold text-slate-800">Editing unavailable.</span> Your current access does not allow changes to this warranty.</p>
      </div>}
    </>}
  </aside>;
}

export function WarrantyResultList({ block, propertyId, disabled, onAction, onFilter, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: WarrantyItemActionHandler;
  /** A declared filter chip (W-2) sends its own message through the source execution. */
  onFilter?: (message: string) => void;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  // Warranties W-1 (FRD v1.124): inside an adopted calm answer the first workflow action ("Add a warranty") is the one dominant step
  // and the Warranties page link is quiet text. The list's own copy of that link exists for the calm answer only.
  const calm = useCalmAnswer();
  const listActions = block.actions.filter((action) => calm || action.id !== 'open-warranties-list');
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

  const visibleCount = block.sections.reduce((total, section) => total + section.items.length, 0);
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
            <h3 className="text-base font-semibold text-slate-950">{block.title}</h3>
          </div>
          {block.description && <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">{block.description}</p>}
        </div>
        {visibleCount > 0 && <p className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">{visibleCount} shown</p>}
      </div>
      {block.filters.length > 0 && (calm
        // W-2: the two filter dimensions (status, category) and the way back are separate quiet groups, so it is clear which chip replaces
        // which. A result without the id prefixes falls back to one group.
        ? <div className="mt-3 space-y-1" data-warranty-filters="">
          {([['status-', 'Warranty status filters'], ['category-', 'Warranty category filters'], ['clear-', 'Clear warranty filters']] as const).map(([prefix, groupLabel]) => {
            const group = block.filters.filter((filter) => filter.id.startsWith(prefix));
            return group.length > 0 ? <div key={prefix} className="flex flex-wrap gap-0.5" role="group" aria-label={groupLabel}>{group.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={prefix === 'clear-' ? undefined : filter.active}
              onClick={() => onFilter?.(filter.message)} className={cn('min-h-8 rounded-md px-2.5 py-1 text-sm disabled:opacity-100', filter.active ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900', prefix === 'clear-' && 'underline underline-offset-2')}>{filter.label}</button>)}</div> : null;
          })}
        </div>
        : <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Warranty filters">
          {block.filters.map((filter) => <button key={filter.id} type="button" aria-pressed={filter.active} disabled={disabled}
            onClick={() => onFilter?.(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
        </div>)}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-200 px-4 py-4 sm:px-5">
      <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <div className="mt-3 rounded-xl bg-slate-50 px-4 py-5"><p className="text-sm font-medium text-slate-800">No warranties are recorded yet.</p><p className="mt-1 text-sm text-slate-600">Add a warranty to keep coverage dates and documents connected to this home.</p></div>}
      <ul className="mt-2 divide-y divide-slate-200">
        {section.items.map((item) => {
          const selected = controls?.view.selectedTaskId === item.id;
          const status = statusPresentation(item.status);
          const documents = documentCount(item);
          const supportingMeta = item.meta.filter((value) => value !== documents);
          const canEdit = Boolean(onAction && (item.actions?.length ?? 0) > 0);
          const missingCoverage = item.description === 'No coverage details recorded.';
          return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('outline-offset-2 transition-colors', selected ? 'bg-teal-50/70' : 'hover:bg-slate-50')}>
            <button type="button" aria-label={item.title} data-warranty-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailWarrantyId === item.id} aria-controls={`warranty-detail-${item.id}`} onClick={() => openDetail(item)} className="group grid min-h-[104px] w-full gap-3 px-2 py-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950 group-hover:text-teal-800">{item.title}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', status.className)}>{status.label}</span>
                </div>
                {supportingMeta.length > 0 && <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600"><CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{supportingMeta.join(' · ')}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {documents && <span className="inline-flex items-center gap-1.5 text-slate-500"><FileText className="h-3.5 w-3.5" aria-hidden="true" />{documents}</span>}
                  <span className={cn('font-medium', missingCoverage ? 'text-amber-800' : 'text-slate-600')}>{missingCoverage ? 'Coverage details missing' : 'Coverage details recorded'}</span>
                  <span className={cn('inline-flex items-center gap-1.5 font-medium', canEdit ? 'text-teal-700' : 'text-slate-500')}>{canEdit ? <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}{canEdit ? 'Editing available' : 'View only'}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-teal-800">View details <ChevronRight className={cn('h-4 w-4 transition-transform', detailWarrantyId === item.id && 'rotate-90')} aria-hidden="true" /></span>
            </button>
          </li>;
        })}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more warranties are available through the full Warranties collection.</p>}
    </div>)}
    {detailWarrantyId && detailItem && <WarrantyDetail key={detailWarrantyId} warrantyId={detailWarrantyId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} />}
    {listActions.some((action) => action.href || action.interactionType === 'START_WORKFLOW') && <div data-ask-action-footer="" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm font-semibold text-teal-800 sm:px-5">{listActions.map((action) => action.href ? <span key={action.id} className="text-sm font-medium">{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : action.interactionType === 'START_WORKFLOW' ? <ActionLink key={action.id} action={calm ? { ...action, style: 'SECONDARY' } : action} /> : null)}</div>}
  </section>;
}
