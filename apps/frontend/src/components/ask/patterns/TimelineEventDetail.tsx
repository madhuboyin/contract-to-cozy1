'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
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
  const headingId = `timeline-event-detail-${item.id}`;
  return (
    <aside className="mt-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4" aria-labelledby={headingId} data-ask-timeline-detail={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">{[item.category?.label, localStatus].filter(Boolean).join(' · ') || 'Record'}</p>
          <h4 ref={headingRef} tabIndex={-1} id={headingId} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{item.label}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close details for ${item.label}`}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {item.description && <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>}
      {detail && detail.facts.length > 0 && (
        <dl className="mt-3 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
          {detail.facts.map((fact) => <div key={fact.label}><dt className="text-xs text-slate-500">{fact.label}</dt><dd className="mt-0.5 font-medium text-slate-900">{fact.value}</dd></div>)}
        </dl>
      )}
      <div className="mt-3">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</h5>
        {detail && detail.evidence.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {detail.evidence.map((row, index) => (
              <li key={`${row.label}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="font-medium text-slate-900">{row.label}</span>{row.meta && <span className="text-slate-600"> · {row.meta}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-slate-600">No evidence is attached to this record yet.</p>}
      </div>
      {detail?.canReviewVerification && propertyId && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <h5 className="text-sm font-semibold text-slate-900">Review this event</h5>
          {!reviewChoice ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={disabled || reviewing} onClick={() => setReviewChoice('HOMEOWNER_CONFIRMED')} className="min-h-10 rounded-xl border border-teal-200 px-3 text-sm font-semibold text-teal-800 disabled:opacity-50">Confirm event</button>
              <button type="button" disabled={disabled || reviewing} onClick={() => setReviewChoice('DISPUTED')} className="min-h-10 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 disabled:opacity-50">Mark disputed</button>
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
                  {reviewChoice === 'HOMEOWNER_CONFIRMED' ? 'Confirm event' : 'Save dispute'}
                </button>
                <button type="button" disabled={reviewing} onClick={() => setReviewChoice(null)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Cancel</button>
              </div>
            </div>
          )}
          {reviewError && <p className="mt-2 text-xs text-rose-700" role="alert">{reviewError}</p>}
        </div>
      )}
      {detail?.canAttachEvidence && onItemAction && (
        <AttachEvidenceControl
          event={{ entityType: item.entityType, id: item.id, title: item.label }}
          propertyId={propertyId}
          disabled={disabled}
          onAttached={(documentId) => onItemAction(item.entityType, item.id, EVIDENCE_ATTACH_MESSAGE, 'CAPTURE_EVIDENCE_CONFIRM', 'MUTATE_RECORD', documentId)}
        />
      )}
      {onItemAction && <ItemActionButtons className="mt-4" item={item} actions={item.actions} onItemAction={onItemAction} disabled={disabled ?? false} />}
    </aside>
  );
}
