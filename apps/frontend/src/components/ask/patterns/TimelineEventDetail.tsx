'use client';

import { useEffect, useRef, useState } from 'react';
import { FileCheck2, Loader2, LockKeyhole, Pencil, X } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import type { AskItemActionInteractionType } from '@/features/ask/types';
import { ItemActionButtons } from './PatternParts';
import { AttachEvidenceControl, EVIDENCE_ATTACH_MESSAGE } from '../AttachEvidenceControl';
import { reviewHomeTimelineEvent } from '@/lib/api/homeTimelineApi';

type TimelineItem = Extract<AskPresentationBlock, { type: 'TIMELINE' }>['items'][number];

/**
 * A timeline record read in place: its labelled facts and the evidence behind it, from the detail the answer carries. Nothing here links to a
 * page; the homeowner stays in the conversation.
 */
export function TimelineEventDetail({ item, propertyId, onClose, onItemAction, disabled }: { item: TimelineItem; propertyId?: string; onClose: () => void; onItemAction?: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string) => void; disabled?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reviewChoice, setReviewChoice] = useState<'HOMEOWNER_CONFIRMED' | 'DISPUTED' | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(item.status);
  useEffect(() => { headingRef.current?.focus(); }, [item.id]);
  const detail = item.detail;
  const canEdit = Boolean(onItemAction && (item.actions?.length ?? 0) > 0);
  const headingId = `timeline-event-detail-${item.id}`;
  return (
    <aside className="mt-4 border-t border-slate-200 bg-slate-50/70 px-4 py-5 sm:px-5" aria-labelledby={headingId} data-ask-timeline-detail={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Timeline event</p>
          <h4 ref={headingRef} tabIndex={-1} id={headingId} className="mt-1 text-xl font-semibold tracking-tight text-slate-950 outline-none">{item.label}</h4>
          <p className="mt-1 text-sm font-medium text-slate-600">{[item.category?.label, localStatus].filter(Boolean).join(' · ') || 'Recorded event'}</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close details for ${item.label}`}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {item.description && <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>}
      {detail && detail.facts.length > 0 && (
        <dl className="mt-4 grid gap-x-6 gap-y-4 border-y border-slate-200 py-4 text-sm sm:grid-cols-2">
          {detail.facts.map((fact) => <div key={fact.label}><dt className="text-xs text-slate-500">{fact.label}</dt><dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd></div>)}
        </dl>
      )}
      {detail?.canReviewVerification && propertyId && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h5 className="text-sm font-semibold text-slate-900">Verify this event</h5>
          {!reviewChoice ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={disabled || reviewing} onClick={() => setReviewChoice('HOMEOWNER_CONFIRMED')} className="min-h-10 rounded-xl border border-teal-200 px-3 text-sm font-semibold text-teal-800 disabled:opacity-50">Confirm as accurate</button>
              <button type="button" disabled={disabled || reviewing} onClick={() => setReviewChoice('DISPUTED')} className="min-h-10 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 disabled:opacity-50">Mark as disputed</button>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-slate-700">{reviewChoice === 'HOMEOWNER_CONFIRMED' ? 'Confirm that this event is accurate?' : 'Mark this event as disputed?'}</p>
              <p className="mt-1 text-xs text-slate-500">This updates the canonical event and adds a verification-history record.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={reviewing} onClick={async () => {
                  setReviewing(true); setReviewError(null);
                  try {
                    await reviewHomeTimelineEvent(propertyId, item.id, reviewChoice);
                    setLocalStatus(reviewChoice === 'HOMEOWNER_CONFIRMED' ? 'Homeowner Confirmed' : 'Disputed');
                    setReviewChoice(null);
                  } catch { setReviewError('The event review could not be saved. Refresh and try again.'); }
                  finally { setReviewing(false); }
                }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white disabled:opacity-50">
                  {reviewing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {reviewChoice === 'HOMEOWNER_CONFIRMED' ? 'Confirm as accurate' : 'Save dispute'}
                </button>
                <button type="button" disabled={reviewing} onClick={() => setReviewChoice(null)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Cancel</button>
              </div>
            </div>
          )}
          {reviewError && <p className="mt-2 text-xs text-rose-700" role="alert">{reviewError}</p>}
        </div>
      )}
      {canEdit && onItemAction && <section className="mt-5 border-t border-slate-200 pt-4" aria-label={`Edit ${item.label}`}>
        <div className="flex items-center gap-2"><Pencil className="h-4 w-4 text-teal-700" aria-hidden="true" /><h5 className="text-sm font-semibold text-slate-950">Edit event</h5></div>
        <p className="mt-1 text-sm text-slate-600">Change any details in one place. Cozy shows only what changed for your review before saving.</p>
        <ItemActionButtons className="mt-3" item={item} actions={item.actions} onItemAction={onItemAction} disabled={disabled ?? false} />
      </section>}
      {!canEdit && <div className="mt-5 flex gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600" data-timeline-edit-unavailable="">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p><span className="font-semibold text-slate-800">Editing unavailable.</span> Your current access does not allow changes to this event.</p>
      </div>}
      <div className="mt-5">
        <div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-teal-700" aria-hidden="true" /><h5 className="text-sm font-semibold text-slate-950">Evidence</h5></div>
        {detail && detail.evidence.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {detail.evidence.map((row, index) => (
              <li key={`${row.label}-${index}`} className="border-l-2 border-teal-200 py-1 pl-3">
                <span className="font-medium text-slate-900">{row.label}</span>{row.meta && <span className="text-slate-600"> · {row.meta}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-slate-600">No evidence is attached to this record yet.</p>}
      </div>
      {detail?.canAttachEvidence && onItemAction && (
        <AttachEvidenceControl
          event={{ entityType: item.entityType, id: item.id, title: item.label }}
          propertyId={propertyId}
          disabled={disabled}
          onAttached={(documentId) => onItemAction(item.entityType, item.id, EVIDENCE_ATTACH_MESSAGE, 'CAPTURE_EVIDENCE_CONFIRM', 'MUTATE_RECORD', documentId)}
        />
      )}
    </aside>
  );
}
