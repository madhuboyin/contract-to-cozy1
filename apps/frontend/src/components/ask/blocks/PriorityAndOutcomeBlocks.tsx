'use client';

import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ActionLink } from './context';
import type { AskBlockRenderer } from './types';

// Ask Intelligence FRD §22.1/Phase 9B "usefulness feedback" deliverable —
// per-PRIORITY_LIST-item rating, distinct from ExecutionFeedback's
// whole-response UP/DOWN thumbs.
function HomeActionUsefulnessButtons({ executionId, homeActionId }: { executionId: string; homeActionId: string }) {
  const [rating, setRating] = useState<'USEFUL' | 'NOT_USEFUL' | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (nextRating: 'USEFUL' | 'NOT_USEFUL') => {
    setSaving(true);
    try {
      const response = await api.submitHomeActionUsefulnessFeedback(executionId, homeActionId, { rating: nextRating });
      if (response.success) setRating(nextRating);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <span>{rating ? 'Thanks—saved.' : 'Useful?'}</span>
      <button type="button" disabled={saving} aria-label="Mark useful" aria-pressed={rating === 'USEFUL'} onClick={() => void submit('USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'USEFUL' && 'bg-teal-50 text-teal-700')}><ThumbsUp className="h-3.5 w-3.5" /></button>
      <button type="button" disabled={saving} aria-label="Mark not useful" aria-pressed={rating === 'NOT_USEFUL'} onClick={() => void submit('NOT_USEFUL')} className={cn('rounded-lg p-1.5 hover:bg-slate-100', rating === 'NOT_USEFUL' && 'bg-amber-50 text-amber-700')}><ThumbsDown className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export const PriorityListBlock: AskBlockRenderer<'PRIORITY_LIST'> = ({ block, executionId }) => {
  const categoryLabel: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'Do now', PLAN_SOON: 'Plan soon', WATCH: 'Watch', OPTIONAL: 'Optional', NO_ACTION: 'No action needed',
  };
  const categoryBadge: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'bg-red-100 text-red-800', PLAN_SOON: 'bg-amber-200 text-amber-900',
    WATCH: 'bg-slate-100 text-slate-700', OPTIONAL: 'bg-slate-100 text-slate-500', NO_ACTION: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        <span className="text-xs text-slate-500">Ranking policy {block.rankingPolicyVersion}</span>
      </div>
      {block.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No ranked item is currently available on this channel. This does not mean the home needs no attention — it means the governed feed has nothing eligible to show right now.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {block.items.map((item, index) => (
            <li key={item.homeActionId} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                <h4 className="font-semibold text-slate-900">{item.title}</h4>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{categoryLabel[item.consumerPriority]}</span>
                {item.suppressed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Suppressed</span>}
                {item.completed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Completed</span>}
                {item.unavailable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Unavailable</span>}
                {item.stale && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Stale</span>}
              </div>
              {item.comparativeReasonCodes.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">Ranked here because: {item.comparativeReasonCodes.map((code) => code.replace(/_/g, ' ').toLowerCase()).join(', ')}.</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {item.confidenceLabel.toLowerCase()} confidence
                {item.deadlineAt && ` · Due ${new Date(item.deadlineAt).toLocaleDateString()}`}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>{item.cta ? <ActionLink action={item.cta} /> : item.watchState && <p className="text-sm text-slate-700">{item.watchState}</p>}</div>
                <HomeActionUsefulnessButtons executionId={executionId} homeActionId={item.homeActionId} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {block.truncated && <p className="mt-3 text-xs text-slate-500">More ranked items exist than are shown here. Open Home Actions to see the full list.</p>}
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
