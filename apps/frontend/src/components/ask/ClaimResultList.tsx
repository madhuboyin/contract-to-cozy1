'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { getClaim } from '@/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi';
import type { ClaimDTO, ClaimStatus } from '@/types/claims.types';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

// The canonical claim lifecycle (backend claims.transitions.ts ALLOWED_TRANSITIONS), used only to choose which of the
// declared actions to show for the LIVE status. The server re-checks the transition before proposing and again on
// confirm, so a stale copy here can hide a button but never allow an illegal change.
const NEXT_STATUSES: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'SUBMITTED', 'CLOSED'],
  IN_PROGRESS: ['SUBMITTED', 'UNDER_REVIEW', 'CLOSED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'DENIED', 'CLOSED'],
  UNDER_REVIEW: ['APPROVED', 'DENIED', 'CLOSED'],
  APPROVED: ['CLOSED'],
  DENIED: ['CLOSED'],
  CLOSED: [],
};
const ACTION_STATUS: Record<string, ClaimStatus> = {
  'claim-start': 'IN_PROGRESS',
  'claim-submit': 'SUBMITTED',
  'claim-under-review': 'UNDER_REVIEW',
  'claim-approve': 'APPROVED',
  'claim-deny': 'DENIED',
  'claim-close': 'CLOSED',
};

export function claimActionsForLiveStatus(actions: ItemAction[], status: ClaimStatus): ItemAction[] {
  const next = NEXT_STATUSES[status] ?? [];
  return actions.filter((action) => ACTION_STATUS[action.id] !== undefined && next.includes(ACTION_STATUS[action.id]));
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

// The claims GET answers a missing claim with 404 { message: 'Claim not found' }, while propertyAuthMiddleware's
// access denial is also a 404 (with a different message), so the body decides which one it is.
function isClaimNotFound(error: unknown): boolean {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const message = payload && typeof payload === 'object' ? (payload as { message?: unknown }).message : null;
  return typeof message === 'string' && /claim not found/i.test(message);
}

const label = (value: string | null | undefined) => value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
};
const formatMoney = (value: string | null | undefined) => {
  if (value == null || value === '') return 'Not recorded';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : 'Not recorded';
};

// Claims capability-card slice (FRD v1.42). Reads the same canonical GET /claims/:claimId the traditional claim page
// uses. Status changes are the declared CLAIM_TRANSITION actions; everything else the claim page edits (checklist,
// documents, timeline notes, claim fields) stays on the Claims page, which this detail links to.
function ClaimDetail({ claimId, expectedPropertyId, fallbackItem, disabled, onAction, onAccessLost, onClose, link }: {
  claimId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const [claim, setClaim] = useState<ClaimDTO | null>(null);
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
    setClaim(null);
    getClaim(expectedPropertyId, claimId)
      .then((fetched) => { if (active) setClaim(fetched); })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 404 && isClaimNotFound(caught)) { setError('NOT_FOUND'); return; }
        if (status === 401 || status === 403 || status === 404) { callbacksRef.current.onAccessLost(); return; }
        setError('REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, claimId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const actions = claim && onAction ? claimActionsForLiveStatus(fallbackItem.actions ?? [], claim.status) : [];
  const checklist = claim?.checklistItems ?? [];
  const recentEvents = [...(claim?.timelineEvents ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 3);

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`claim-detail-${claimId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Claim detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`claim-detail-${claimId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{claim?.title ?? fallbackItem.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close claim detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current claim…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'NOT_FOUND' ? 'Claim no longer exists' : 'Could not verify the current claim'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'NOT_FOUND' ? 'This claim was removed after the Ask result was created.' : 'The current claim record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with Claims.</p>
      </div>}
      {claim && <>
        {claim.description && <p className="mt-3 text-sm leading-6 text-slate-700">{claim.description}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{label(claim.status)}</dd></div>
          <div><dt className="text-xs text-slate-500">Type</dt><dd className="mt-0.5 font-medium text-slate-900">{label(claim.type)}</dd></div>
          <div><dt className="text-xs text-slate-500">Provider</dt><dd className="mt-0.5 font-medium text-slate-900">{claim.providerName || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-slate-500">Claim number</dt><dd className="mt-0.5 font-medium text-slate-900">{claim.claimNumber || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-slate-500">Incident date</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(claim.incidentAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Submitted</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(claim.submittedAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Estimated loss</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(claim.estimatedLossAmount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Deductible</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(claim.deductibleAmount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Settlement</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(claim.settlementAmount)}</dd></div>
          {claim.nextFollowUpAt && <div><dt className="text-xs text-slate-500">Next follow-up</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(claim.nextFollowUpAt)}</dd></div>}
        </dl>
        {checklist.length > 0 && (
          <p className="mt-3 text-sm text-slate-700">
            Checklist: {checklist.filter((item) => item.status === 'DONE').length} of {checklist.length} done{typeof claim.checklistCompletionPct === 'number' ? ` (${Math.round(claim.checklistCompletionPct)}%)` : ''}.
          </p>
        )}
        {recentEvents.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent activity</p>
            <ul className="mt-2 space-y-1.5">
              {recentEvents.map((event) => <li key={event.id} className="text-sm text-slate-700">{formatDate(event.occurredAt)} · {event.title || label(event.type)}</li>)}
            </ul>
          </div>
        )}
        {claim.status === 'CLOSED' && <p className="mt-4 text-sm text-slate-600">This claim is closed. Closed claims cannot change status.</p>}
        {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} data-claim-action={action.id}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          onClick={() => onAction?.(fallbackItem.entityType, fallbackItem.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
        <p className="mt-3 text-xs text-slate-500">
          Checklist items, documents, notes and claim details are edited on the claim page.{' '}
          {fallbackItem.href && link(fallbackItem.href, <>Open this claim<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}
        </p>
      </>}
    </aside>
  );
}

// Claims capability-card slice (FRD v1.42): renders INCIDENT_CLAIM_STATUS's incident-claim-list. Claim rows open the
// canonical claim inline; incident rows keep their link, since incidents are outside this slice.
export function ClaimResultList({ block, propertyId, disabled, onAction, onAccessLost, link }: {
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
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId && item.entityType === 'CLAIM');
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-claim-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing in this group.</p>}
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => <li key={item.id} className={cn('rounded-xl border p-3', detailId === item.id ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {item.entityType === 'CLAIM'
              ? <button type="button" data-claim-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`claim-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
              : item.href ? <span className="font-medium text-slate-950">{link(item.href, item.title)}</span> : <span className="font-medium text-slate-950">{item.title}</span>}
            {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ').toLowerCase()}</span>}
          </div>
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
        </li>)}
      </ul>
      {section.count > section.items.length && <p className="mt-3 text-sm text-slate-500">+{section.count - section.items.length} more are available on the full page.</p>}
    </div>)}
    {detailId && detailItem && <ClaimDetail key={detailId} claimId={detailId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} link={link} />}
  </section>;
}
