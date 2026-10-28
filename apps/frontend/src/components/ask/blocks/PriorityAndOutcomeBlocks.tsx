'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ActionLink } from './context';
import { useCalmAnswer } from './calmContext';
import type { AskBlockRenderer } from './types';
import { formatAskDateOnly } from '@/features/ask/dateFormatting';

const PRIORITY_REASON_TEXT: Record<string, string> = {
  SAFETY_FLOOR: 'Safety comes first',
  HIGHER_CONSEQUENCE: 'More important if left unresolved',
  HIGHER_URGENCY: 'Needs attention sooner',
  HIGHER_CONFIDENCE: 'Supported more strongly by your home record',
  HIGHER_HOUSEHOLD_RELEVANCE: 'More relevant to your household',
  MORE_ACTIONABLE: 'Ready for you to act on',
  FEWER_MISSING_CONTEXT_ITEMS: 'Based on more complete home details',
};

function priorityReason(codes: string[]): string | null {
  const reasons = codes.map((code) => PRIORITY_REASON_TEXT[code]).filter((reason): reason is string => Boolean(reason));
  return reasons.length ? reasons.join(' · ') : null;
}

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable —
// per-PRIORITY_LIST-item rating, distinct from ExecutionFeedback's
// whole-response UP/DOWN thumbs.
function HomeActionUsefulnessButtons({ executionId, homeActionId, bare = false, onSaved }: { executionId: string; homeActionId: string; bare?: boolean; onSaved?: () => void }) {
  const [rating, setRating] = useState<'USEFUL' | 'NOT_USEFUL' | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (nextRating: 'USEFUL' | 'NOT_USEFUL') => {
    setSaving(true);
    try {
      const response = await api.submitHomeActionUsefulnessFeedback(executionId, homeActionId, { rating: nextRating });
      if (response.success) {
        setRating(nextRating);
        onSaved?.();
      }
    } finally { setSaving(false); }
  };

  const buttons = (
      <div className="mt-1 flex items-center justify-end gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        <span className="whitespace-nowrap px-1">Useful?</span>
        <button type="button" disabled={saving} aria-label="Mark useful" aria-pressed={rating === 'USEFUL'} onClick={() => void submit('USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'USEFUL' && 'bg-teal-50 text-teal-700')}><ThumbsUp className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={saving} aria-label="Mark not useful" aria-pressed={rating === 'NOT_USEFUL'} onClick={() => void submit('NOT_USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'NOT_USEFUL' && 'bg-amber-50 text-amber-700')}><ThumbsDown className="h-3.5 w-3.5" /></button>
      </div>
  );
  if (bare) return <div className="text-xs text-slate-500"><p className="px-1 font-medium">{rating ? 'Feedback saved' : 'Rate this action'}</p>{buttons}</div>;
  return (
    <details className="text-xs text-slate-500">
      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 font-medium hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">{rating ? 'Feedback saved' : 'Rate this action'}</summary>
      {buttons}
    </details>
  );
}

// Calm rows keep the rating out of the way: one overflow button opens the same two-button rating.
function HomeActionOverflow({ executionId, homeActionId }: { executionId: string; homeActionId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <details ref={containerRef} open={open} className="relative shrink-0">
      <summary role="button" aria-label="More options" aria-expanded={open} onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></summary>
      <div className="absolute right-0 z-10 mt-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-md"><HomeActionUsefulnessButtons executionId={executionId} homeActionId={homeActionId} bare onSaved={() => setOpen(false)} /></div>
    </details>
  );
}

const reviewButtonClass = 'min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50';

export const PriorityListBlock: AskBlockRenderer<'PRIORITY_LIST'> = ({ block, executionId, onItemAction, itemActionsDisabled }) => {
  const calm = useCalmAnswer();
  const categoryLabel: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'Do now', PLAN_SOON: 'Plan soon', WATCH: 'Watch', OPTIONAL: 'Optional', NO_ACTION: 'No action needed',
  };
  const bucketLabel: Record<'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', string> = { NOW: 'Now', SOON: 'Soon', PLAN: 'Plan', CONSIDER: 'Consider' };
  const categoryBadge: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'bg-red-100 text-red-800', PLAN_SOON: 'bg-amber-200 text-amber-900',
    WATCH: 'bg-slate-100 text-slate-700', OPTIONAL: 'bg-slate-100 text-slate-500', NO_ACTION: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <section className={calm ? 'w-full max-w-[960px] space-y-3' : 'rounded-2xl border border-slate-200 bg-white p-4'} data-calm-home-actions={calm ? '' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={calm ? 'sr-only' : 'font-semibold text-slate-950'}>{block.title}</h3>
      </div>
      {calm && block.filters && block.filters.length > 0 && (
        <div role="group" aria-label="Filter by timing" className="flex flex-wrap gap-1.5" data-home-action-filters="">
          {block.filters.map((filter) => (
            <button key={filter.id} type="button" disabled={itemActionsDisabled} aria-pressed={filter.active}
              onClick={() => onItemAction('HOME_ACTION_FILTER', '', filter.message, 'HOME_ACTIONS', 'CONVERSATION_CONTINUE')}
              className={cn('min-h-9 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50', filter.active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50')}>
              {filter.label} · {filter.count}
            </button>
          ))}
        </div>
      )}
      {block.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No ranked item is currently available on this channel. This does not mean the home needs no attention — it means the governed feed has nothing eligible to show right now.</p>
      ) : (
        <ol className={calm ? 'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white' : 'mt-4 space-y-3'}>
          {block.items.map((item, index) => {
            const lifecycle = [
              item.unavailable && 'Unavailable',
              item.stale && 'Stale',
              item.completed && 'Completed',
              item.suppressed && 'Suppressed',
            ].filter((label): label is string => Boolean(label));
            const reason = priorityReason(item.comparativeReasonCodes);
            const compactMeta = [
              ...lifecycle,
              item.confidenceLabel ? `${item.confidenceLabel.toLowerCase()} confidence` : null,
              item.deadlineAt ? `Due ${formatAskDateOnly(item.deadlineAt)}` : null,
            ].filter((label): label is string => Boolean(label)).join(' · ');
            return (
            <li key={item.homeActionId} className={cn(!calm && 'rounded-xl border border-slate-200 p-3')}>
              {calm ? (
                <div className={cn('flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between', index === 0 && 'bg-teal-50/50')} data-home-action-row={index === 0 ? 'start' : 'row'}>
                  <div className="min-w-0 flex-1 space-y-1">
                    {index === 0 && <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">Start here</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{item.rawPriority ? bucketLabel[item.rawPriority] : categoryLabel[item.consumerPriority]}</span>
                      <h4 className="min-w-0 break-words text-sm font-semibold text-slate-900">{item.title}</h4>
                    </div>
                    {index === 0 && (reason ?? item.watchState) && <p className="text-xs text-slate-600">{reason ?? item.watchState}</p>}
                    {compactMeta && <p className="text-xs text-slate-500">{compactMeta}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {item.inlineLaunch ? <button type="button" disabled={itemActionsDisabled} onClick={() => onItemAction('HOME_ACTION', item.homeActionId, item.inlineLaunch!.message, item.inlineLaunch!.operationId, item.inlineLaunch!.interactionType, undefined, item.homeActionId)} className={reviewButtonClass}>Review in Ask</button> : item.cta ? <ActionLink action={item.cta} /> : item.watchState && <p className="text-sm text-slate-700">{item.watchState}</p>}
                    <HomeActionOverflow executionId={executionId} homeActionId={item.homeActionId} />
                  </div>
                </div>
              ) : <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                <h4 className="font-semibold text-slate-900">{item.title}</h4>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{categoryLabel[item.consumerPriority]}</span>
                {item.suppressed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Suppressed</span>}
                {item.completed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Completed</span>}
                {item.unavailable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Unavailable</span>}
                {item.stale && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Stale</span>}
              </div>
              {reason && <p className="mt-2 text-xs text-slate-600">{reason}.</p>}
              <p className="mt-1 text-xs text-slate-500">
                {item.confidenceLabel.toLowerCase()} confidence
                {item.deadlineAt && ` · Due ${formatAskDateOnly(item.deadlineAt)}`}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>{calm && item.inlineLaunch ? <button type="button" disabled={itemActionsDisabled} onClick={() => onItemAction('HOME_ACTION', item.homeActionId, item.inlineLaunch!.message, item.inlineLaunch!.operationId, item.inlineLaunch!.interactionType, undefined, item.homeActionId)} className={reviewButtonClass}>Review in Ask</button> : item.cta ? <ActionLink action={item.cta} /> : item.watchState && <p className="text-sm text-slate-700">{item.watchState}</p>}</div>
                <HomeActionUsefulnessButtons executionId={executionId} homeActionId={item.homeActionId} />
              </div>
              </>}
            </li>
            );
          })}
        </ol>
      )}
      {block.truncated && <p className="mt-3 text-xs text-slate-500">More ranked items exist than are shown here. Ask “What else needs my attention?” to continue.</p>}
    </section>
  );
};

export const OutcomeSummaryBlock: AskBlockRenderer<'OUTCOME_SUMMARY'> = ({ block }) => {
  const verificationBadge: Record<typeof block.entries[number]['verificationStatus'], string> = {
    REPORTED: 'bg-slate-100 text-slate-700', CORROBORATED: 'bg-teal-100 text-teal-800',
    VERIFIED: 'bg-emerald-100 text-emerald-800', REJECTED: 'bg-red-100 text-red-800', SUPERSEDED: 'bg-slate-100 text-slate-400',
  };
  const verificationLabel: Record<typeof block.entries[number]['verificationStatus'], string> = {
    REPORTED: 'Reported', CORROBORATED: 'Corroborated', VERIFIED: 'Verified', REJECTED: 'Disputed', SUPERSEDED: 'Superseded',
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No outcome has been recorded for this decision yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {block.entries.map((entry) => (
            <li key={`${entry.outcomeObservationId}-${entry.relationshipType}`} className={cn('rounded-xl border border-slate-200 p-3', entry.verificationStatus === 'SUPERSEDED' && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', verificationBadge[entry.verificationStatus])}>{verificationLabel[entry.verificationStatus]}</span>
                <span className="text-xs text-slate-500">{entry.relationshipType.replace(/_/g, ' ').toLowerCase()}</span>
                {entry.reviewStatus === 'DISPUTED' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">Disputed</span>}
              </div>
              <p className="mt-2 text-sm text-slate-800">{entry.sourceLabel} · {new Date(entry.occurredAt).toLocaleDateString()}</p>
              {entry.observedCostLabel && <p className="mt-1 text-sm text-slate-700">Cost observed: {entry.observedCostLabel}</p>}
              {entry.note && <p className="mt-1 text-xs text-slate-600">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-slate-500">{block.limitation}</p>
    </section>
  );
};
