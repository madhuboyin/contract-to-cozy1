'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck2, Check, ChevronDown, Clock3, MoreHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ActionLink } from './context';
import { useCalmAnswer } from './calmContext';
import type { AskBlockRenderer } from './types';
import { formatAskDateOnly } from '@/features/ask/dateFormatting';

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
  const [showAll, setShowAll] = useState(false);
  const [commandState, setCommandState] = useState<Record<string, 'SAVING' | 'ACKNOWLEDGED' | 'REMINDER_SET' | 'ERROR'>>({});
  const categoryLabel: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'Do now', PLAN_SOON: 'Plan soon', WATCH: 'Watch', OPTIONAL: 'Optional', NO_ACTION: 'No action needed',
  };
  const bucketLabel: Record<'NOW' | 'SOON' | 'PLAN' | 'CONSIDER', string> = { NOW: 'Now', SOON: 'Soon', PLAN: 'Plan', CONSIDER: 'Consider' };
  const categoryBadge: Record<typeof block.items[number]['consumerPriority'], string> = {
    DO_NOW: 'bg-red-100 text-red-800', PLAN_SOON: 'bg-amber-200 text-amber-900',
    WATCH: 'bg-slate-100 text-slate-700', OPTIONAL: 'bg-slate-100 text-slate-500', NO_ACTION: 'bg-emerald-100 text-emerald-800',
  };
  const visibleItems = calm && !showAll ? block.items.slice(0, 3) : block.items;
  const executeInlineCommand = async (
    item: typeof block.items[number],
    command: 'ACKNOWLEDGE' | 'DEFER' | 'SNOOZE',
  ) => {
    setCommandState((current) => ({ ...current, [item.homeActionId]: 'SAVING' }));
    try {
      let nextTriggerAt: string | null = null;
      if (command === 'DEFER' || command === 'SNOOZE') {
        const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
        const expiry = item.presentation?.timing.windowEnd ? Date.parse(item.presentation.timing.windowEnd) : Number.NaN;
        const bounded = Number.isNaN(expiry) ? tomorrow : Math.min(tomorrow, expiry - 60 * 60 * 1000);
        nextTriggerAt = new Date(Math.max(Date.now() + 60 * 60 * 1000, bounded)).toISOString();
      }
      const response = await api.executeHomeActionCommand(block.propertyId, item.homeActionId, { command, nextTriggerAt });
      if (!response.success) throw new Error('The action could not be updated.');
      setCommandState((current) => ({
        ...current,
        [item.homeActionId]: command === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'REMINDER_SET',
      }));
    } catch {
      setCommandState((current) => ({ ...current, [item.homeActionId]: 'ERROR' }));
    }
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
        <>
        {calm && (() => {
          const lead = block.items[0];
          const leadContext = lead.presentation?.whyItMatters || lead.presentation?.summary || lead.whyThisAppeared;
          return (
            <div className="max-w-3xl space-y-1 text-sm leading-6 text-slate-700" data-home-actions-intro="">
              <p><span className="font-semibold text-slate-950">Start with {lead.title.replace(/[.]$/, '')}.</span>{leadContext ? ` ${leadContext}` : ''}</p>
              {block.items.length > 1 && <p className="text-slate-600">It is ranked first in your current Home Actions. The next priorities are summarized below, with supporting details available when you want them.</p>}
            </div>
          );
        })()}
        <ol className={calm ? 'space-y-3' : 'mt-4 space-y-3'}>
          {visibleItems.map((item, index) => {
            const lifecycle = [
              item.unavailable && 'Details temporarily unavailable',
              item.stale && 'May need refresh',
              item.completed && 'Completed',
            ].filter((label): label is string => Boolean(label));
            const reason = item.whyThisAppeared?.trim() || null;
            const compactMeta = [
              ...lifecycle,
              item.confidenceLabel === 'LOW' ? 'Confirm home details' : null,
              item.deadlineAt ? `Due ${formatAskDateOnly(item.deadlineAt)}` : null,
            ].filter((label): label is string => Boolean(label)).join(' · ');
            return (
            <li key={item.homeActionId} className={cn(!calm && 'rounded-xl border border-slate-200 p-3')}>
              {calm ? (() => {
                const presentation = item.presentation ?? null;
                const rich = index === 0;
                const weather = presentation?.kind === 'WEATHER';
                const seasonal = presentation?.kind === 'SEASONAL';
                const tone = weather
                  ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/70'
                  : seasonal
                    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/60'
                    : 'border-slate-200 bg-white';
                const iconTone = weather ? 'bg-amber-100 text-amber-700' : seasonal ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700';
                const actionState = commandState[item.homeActionId];
                const facts = presentation?.keyFacts ?? [];
                const windowEndMs = presentation?.timing.windowEnd ? Date.parse(presentation.timing.windowEnd) : Number.NaN;
                const controls = presentation?.controls.filter((control) =>
                  control.command === 'ACKNOWLEDGE' || Number.isNaN(windowEndMs) || windowEndMs > Date.now() + 2 * 60 * 60 * 1000,
                ) ?? [];
                const visibleReminder = rich ? controls.find((control) => control.command === 'DEFER' || control.command === 'SNOOZE') : undefined;
                const disclosedControls = controls.filter((control) => control !== visibleReminder);
                const detailLabel = presentation?.source ? 'Details & source' : 'Show details';
                return (
                  <>
                  {!rich && index === 1 && <p className="mb-2 text-sm font-semibold text-slate-950">Also worth planning</p>}
                  <article className={cn('rounded-2xl border', rich ? cn('border-l-4 p-5', tone) : 'border-slate-200 bg-white p-4')} data-home-action-row={rich ? 'start' : 'enriched'}>
                    {rich && <p className={cn('mb-3 text-[11px] font-bold uppercase tracking-wide', weather ? 'text-amber-800' : seasonal ? 'text-emerald-800' : 'text-teal-800')}>Start here</p>}
                    <div className="flex items-start gap-3">
                      <div className={cn('hidden rounded-xl p-2.5 sm:block', iconTone)}>
                        {weather ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : seasonal ? <CalendarCheck2 className="h-5 w-5" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {presentation?.eyebrow && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', weather ? 'bg-amber-600 text-white' : seasonal ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700')}>{presentation.eyebrow}</span>}
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{item.rawPriority ? bucketLabel[item.rawPriority] : categoryLabel[item.consumerPriority]}</span>
                          {compactMeta && <span className="text-xs text-slate-500">{compactMeta}</span>}
                        </div>
                        <h4 className={cn('mt-2 break-words font-semibold text-slate-950', rich ? 'text-lg' : 'text-base')}>{item.title}</h4>
                        {presentation?.summary && (!rich || presentation.summary !== presentation.whyItMatters) && <p className="mt-1 text-sm leading-6 text-slate-700">{presentation.summary}</p>}
                        {!presentation && item.watchState && <p className="mt-1 text-sm text-slate-600">{item.watchState}</p>}

                        {presentation && rich && (
                          <div className={cn('mt-3 rounded-xl border bg-white/80 p-3', weather ? 'border-amber-200' : seasonal ? 'border-emerald-200' : 'border-slate-200')}>
                            <p className={cn('text-xs font-semibold uppercase tracking-wide', weather ? 'text-amber-800' : seasonal ? 'text-emerald-800' : 'text-slate-600')}>{weather ? 'Recommended preparation' : seasonal ? 'Next seasonal step' : 'Recommended next step'}</p>
                            <p className="mt-1 text-sm font-medium leading-6 text-slate-800">{presentation.recommendedAction}</p>
                          </div>
                        )}

                        {(facts.length > 0 || presentation?.source || presentation?.expectedOutcome || presentation?.timing.rationale || reason || (!rich && (presentation?.whyItMatters || presentation?.recommendedAction)) || disclosedControls.length > 0) && (
                          <details className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-600">
                            <summary className="w-fit cursor-pointer font-semibold text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">{detailLabel}</summary>
                            {!rich && presentation?.whyItMatters && presentation.whyItMatters !== presentation.summary && <p className="mt-3"><span className="font-semibold text-slate-800">Why it matters:</span> {presentation.whyItMatters}</p>}
                            {!rich && presentation?.recommendedAction && <p className="mt-3"><span className="font-semibold text-slate-800">Recommended next step:</span> {presentation.recommendedAction}</p>}
                            {presentation?.expectedOutcome && <p className="mt-2"><span className="font-semibold text-slate-800">Expected outcome:</span> {presentation.expectedOutcome}</p>}
                            {presentation?.timing.rationale && <p className="mt-2"><span className="font-semibold text-slate-800">Timing:</span> {presentation.timing.rationale}</p>}
                            {facts.length > 0 && (
                              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                                {facts.map((fact) => (
                                  <div key={`${fact.label}-${fact.value}`} className="min-w-[9rem]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{fact.label}</dt>
                                    <dd className="mt-0.5 text-xs font-medium text-slate-800">{fact.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                            {presentation?.source && <p className="mt-3 text-xs text-slate-500">Source: {presentation.source.label}</p>}
                            {reason && <p className="mt-2 text-xs"><span className="font-semibold text-slate-700">Why this appeared:</span> {/[.!?]$/.test(reason) ? reason : `${reason}.`}</p>}
                            {disclosedControls.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{disclosedControls.map((control) => (
                              <button key={control.command} type="button" disabled={itemActionsDisabled || actionState === 'SAVING' || actionState === 'ACKNOWLEDGED' || actionState === 'REMINDER_SET'} onClick={() => void executeInlineCommand(item, control.command)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50">
                                {control.command === 'ACKNOWLEDGE' ? <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : <Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{control.label}
                              </button>
                            ))}</div>}
                          </details>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.inlineLaunch ? <button type="button" disabled={itemActionsDisabled} onClick={() => onItemAction('HOME_ACTION', item.homeActionId, item.inlineLaunch!.message, item.inlineLaunch!.operationId, item.inlineLaunch!.interactionType, undefined, item.homeActionId)} className={cn(reviewButtonClass, rich && weather && 'border-amber-700 bg-amber-700 text-white hover:bg-amber-800 hover:text-white', rich && seasonal && 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 hover:text-white')}>{rich ? (item.inlineLaunch.label ?? presentation?.detailLabel ?? 'Review details') : 'Ask about this'}</button> : item.cta ? <ActionLink action={item.cta} /> : null}
                          {visibleReminder && (
                            <button type="button" disabled={itemActionsDisabled || actionState === 'SAVING' || actionState === 'ACKNOWLEDGED' || actionState === 'REMINDER_SET'} onClick={() => void executeInlineCommand(item, visibleReminder.command)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50">
                              <Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{visibleReminder.label}
                            </button>
                          )}
                          {!rich && controls.length === 0 && !item.inlineLaunch && presentation?.detailLabel && <span className="text-xs text-slate-500">Ask Cozy for {presentation.detailLabel.toLowerCase()}.</span>}
                          <HomeActionOverflow executionId={executionId} homeActionId={item.homeActionId} />
                        </div>
                        {actionState && actionState !== 'SAVING' && <p role="status" className={cn('mt-2 text-xs font-medium', actionState === 'ERROR' ? 'text-red-700' : 'text-emerald-700')}>{actionState === 'ACKNOWLEDGED' ? 'Acknowledged.' : actionState === 'REMINDER_SET' ? 'Reminder updated.' : 'Unable to update this action. Try again.'}</p>}
                      </div>
                    </div>
                  </article>
                  </>
                );
              })() : <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                <h4 className="font-semibold text-slate-900">{item.title}</h4>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', categoryBadge[item.consumerPriority])}>{categoryLabel[item.consumerPriority]}</span>
                {item.suppressed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Suppressed</span>}
                {item.completed && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Completed</span>}
                {item.unavailable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Unavailable</span>}
                {item.stale && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Stale</span>}
              </div>
              {reason && <p className="mt-2 text-xs text-slate-600">{/[.!?]$/.test(reason) ? reason : `${reason}.`}</p>}
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
        </>
      )}
      {calm && block.items.length > 3 && (
        <button type="button" onClick={() => setShowAll((current) => !current)} className="flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50" aria-expanded={showAll}>
          {showAll ? 'Show fewer actions' : `Show ${block.items.length - 3} more action${block.items.length - 3 === 1 ? '' : 's'}`}
          <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
        </button>
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
