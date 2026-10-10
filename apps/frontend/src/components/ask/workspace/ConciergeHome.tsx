'use client';

import { useRef, useState } from 'react';
import { ArrowRight, BellRing, BookOpen, CircleDollarSign, ClipboardCheck, Loader2, Search, ShieldCheck, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskCapabilityCategoryId, AskCapabilityGroup, AskCapabilityPrompt, ConciergeHomeView } from '@/features/ask/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { resolveConciergeLandingSpotlight } from '@/features/ask/conciergeLandingPolicy';
import { humanizeReason } from './support';
import { EXPLORER_SEARCH_MIN_LENGTH, normalizeSearchText, searchExplorerGroups } from '@/features/ask/explorerSearch';

export function CapabilityCategoryIcon({ categoryId, className = 'h-4 w-4' }: { categoryId: AskCapabilityCategoryId; className?: string }) {
  const icons = {
    UNDERSTAND: BookOpen,
    MAINTAIN: Wrench,
    PROTECT: ShieldCheck,
    SAVE: CircleDollarSign,
    DECIDE: ClipboardCheck,
    PLAN_MONITOR: BellRing,
  };
  const Icon = icons[categoryId];
  return <Icon className={className} aria-hidden="true" />;
}

/** What a prompt shows: the reviewed homeowner label when the server sent one, otherwise the question itself. */
const promptText = (prompt: AskCapabilityPrompt) => prompt.label ?? prompt.question;

function ExplorerPrompt({ prompt, groupLabel, onPick }: { prompt: AskCapabilityPrompt; groupLabel?: string; onPick: (prompt: AskCapabilityPrompt) => void }) {
  return (
    <button type="button" onClick={() => onPick(prompt)} className="group flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium leading-5 text-slate-700 hover:bg-white hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
      <span>
        {promptText(prompt)}
        {groupLabel && <span className="ml-2 text-xs font-normal text-slate-500">{groupLabel}</span>}
        {prompt.note && <span className="mt-0.5 block text-xs font-normal text-slate-500" data-explorer-note="">{prompt.note}</span>}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
    </button>
  );
}

export function CapabilityExplorer({ groups, onSelect, onOpen, onSearchInteraction, chip = false, row = false }: {
  /** One call per search interaction when the explorer closes or a result is chosen: how many results the last query had, and whether one was picked. Never the phrase. */
  onSearchInteraction?: (interaction: { resultCount: number; selected: boolean }) => void;
  /** The Explore with Cozy rail lists "More ideas" as one more row beside its topics. */
  row?: boolean;
  /** The calm landing shows the entry as one more suggestion chip instead of a text link. */
  chip?: boolean;
  groups: AskCapabilityGroup[];
  onSelect: (prompt: AskCapabilityPrompt) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The interaction is remembered here, not emitted per keystroke: it is reported once, when the explorer closes or a result is chosen.
  const searched = useRef<{ resultCount: number } | null>(null);
  const searching = normalizeSearchText(query).length >= EXPLORER_SEARCH_MIN_LENGTH;
  const results = searching ? searchExplorerGroups(groups, query) : [];
  if (searching) searched.current = { resultCount: results.length };
  const finish = (selected: boolean) => {
    if (searched.current) onSearchInteraction?.({ resultCount: searched.current.resultCount, selected });
    searched.current = null;
    setQuery('');
  };
  const pick = (prompt: AskCapabilityPrompt) => { finish(true); setOpen(false); onSelect(prompt); };
  if (!groups.length) return null;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) finish(false); setOpen(nextOpen); if (nextOpen) onOpen(); }}>
      <DialogTrigger asChild>
        {row
          ? <button type="button" className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-left text-sm text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"><span>More ideas</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /></button>
          : chip
          ? <button type="button" className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-slate-300 px-3.5 py-1.5 text-sm text-slate-600 transition hover:border-teal-300 hover:text-teal-900">More ideas <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
          : <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-900">
            Explore everything Ask Cozy can do <ArrowRight className="h-4 w-4" />
          </button>}
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[85dvh] sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-14 sm:px-5 sm:py-4 sm:pr-16">
          <DialogTitle className="text-xl leading-7 text-slate-950">What Ask Cozy can help with</DialogTitle>
          <DialogDescription className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">Choose an example to start a conversation grounded in your selected home record.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5">
          <label className="relative block">
            <span className="sr-only">Search what Ask Cozy can help with</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="Search ideas, like “insurance” or “winter”" className="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          </label>
          <p className="sr-only" role="status" aria-live="polite">{searching ? `${results.length} ${results.length === 1 ? 'idea matches' : 'ideas match'}` : ''}</p>
        </div>
        {searching ? (
          <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {results.length === 0
              ? <p className="px-2 py-3 text-sm text-slate-600" data-explorer-empty="">Nothing matches that yet. Try different words, or clear the search to browse everything Ask Cozy can help with.</p>
              : <ul className="space-y-0.5" aria-label="Matching ideas">{results.map(({ prompt, group }) => <li key={prompt.id}><ExplorerPrompt prompt={prompt} groupLabel={group.label} onPick={pick} /></li>)}</ul>}
          </div>
        ) : (
        <div className="grid min-h-0 items-start gap-3 overflow-y-auto p-3 sm:grid-cols-2 sm:p-4">
          {groups.map((group) => (
            <section key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-labelledby={`ask-capability-${group.id}`}>
              <div className="flex items-start gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm"><CapabilityCategoryIcon categoryId={group.id} /></span><div><h3 id={`ask-capability-${group.id}`} className="text-sm font-semibold leading-5 text-slate-950">{group.label}</h3><p className="mt-0.5 text-xs leading-4 text-slate-600">{group.description}</p></div></div>
              <div className="mt-2 space-y-0.5">
                {group.prompts.map((prompt) => <ExplorerPrompt key={prompt.id} prompt={prompt} onPick={pick} />)}
              </div>
            </section>
          ))}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConciergeHome({ propertyId, view, loading, failed, onAsk }: {
  propertyId?: string;
  view: ConciergeHomeView | null;
  loading: boolean;
  failed: boolean;
  onAsk: (prompt: AskCapabilityPrompt, source: 'ATTENTION' | 'DECISION') => void;
}) {

  if (!propertyId) return null;

  if (loading) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500" role="status">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading your home overview…
      </div>
    );
  }

  if (failed || !view) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Your personalized home overview is temporarily unavailable. You can still ask any question above.
      </div>
    );
  }

  const spotlight = resolveConciergeLandingSpotlight(view);
  const attentionItem = spotlight?.kind === 'ATTENTION'
    ? view.priorityList.items.find((item) => item.homeActionId === spotlight.entityId)
    : undefined;
  const decision = spotlight?.kind === 'DECISION'
    ? view.decisions.items.find((item) => item.decisionThreadId === spotlight.entityId)
    : undefined;
  if (!attentionItem && !decision) return null;

  return (
    <div className="mt-10 text-left">
      {decision ? <section aria-labelledby="ask-decisions-title">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Pick up a thread</p><h2 id="ask-decisions-title" className="mt-1 text-lg font-semibold text-slate-950">Continue where you left off</h2></div>
        <button type="button" onClick={() => onAsk({ id: `decision-${decision.decisionThreadId}`, categoryId: 'DECIDE', categoryLabel: 'Decide', question: `Help me continue this decision: ${decision.title}`, subject: decision.subject ?? undefined, context: { entityType: 'DECISION_THREAD', entityId: decision.decisionThreadId } }, 'DECISION')} className="group mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
          <span className="font-semibold text-slate-950 group-hover:text-teal-800">{decision.title}</span>
          <span className="mt-1 block text-sm text-slate-600">Updated {new Date(decision.updatedAt).toLocaleDateString()} · {decision.lifecycleStatus.toLowerCase().replace(/_/g, ' ')}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">Continue with Ask Cozy <ArrowRight className="h-4 w-4" /></span>
        </button>
      </section> : attentionItem ? <section aria-labelledby="ask-attention-title">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Based on your home record</p><h2 id="ask-attention-title" className="mt-1 text-lg font-semibold text-slate-950">For your attention</h2></div>
        <button type="button" onClick={() => onAsk({ id: `attention-${attentionItem.homeActionId}`, categoryId: attentionItem.askCategoryId, categoryLabel: attentionItem.askCategoryLabel, question: attentionItem.askQuestion, subject: attentionItem.subject ?? undefined, context: { entityType: 'HOME_ACTION', entityId: attentionItem.homeActionId, actionId: attentionItem.homeActionId, capabilityId: 'home-operations' } }, 'ATTENTION')} className="group mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
          <span className="flex flex-wrap items-start justify-between gap-2"><span><span className="block font-semibold text-slate-950 group-hover:text-teal-800">{attentionItem.title}</span><span className="mt-1 block text-sm text-slate-600">{attentionItem.comparativeReasonCodes[0] ? humanizeReason(attentionItem.comparativeReasonCodes[0]) : 'Recommended from your current home record'}{attentionItem.deadlineAt ? ` · Due ${new Date(attentionItem.deadlineAt).toLocaleDateString()}` : ''}</span></span><span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', attentionItem.consumerPriority === 'DO_NOW' ? 'bg-rose-100 text-rose-800' : attentionItem.consumerPriority === 'PLAN_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>{attentionItem.consumerPriority.replace(/_/g, ' ')}</span></span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">Ask Cozy about this <ArrowRight className="h-4 w-4" /></span>
        </button>
      </section> : null}
    </div>
  );
}
