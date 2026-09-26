'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildConciergeStateStrip, type StripChip, type StripTone } from '@/features/ask/conciergeStateStrip';
import type { AskCapabilityPrompt, AskFeaturedPrompt, ConciergeHomeView } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111): the calm landing below the composer. One sentence about the home,
// count chips that each open the matching answer, at most one urgent item, then a few starter questions. It replaces the
// "Popular ways" cards and the "For your attention" card; nothing here is a second source of truth (see conciergeStateStrip).
const TONE: Record<StripTone, string> = {
  CRITICAL: 'bg-red-100 text-red-800 hover:bg-red-200',
  CAUTION: 'bg-amber-100 text-amber-900 hover:bg-amber-200',
  DEFAULT: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
};
const PRIORITY_LABEL = { DO_NOW: 'Do now', PLAN_SOON: 'Plan soon', WATCH: 'Watch', OPTIONAL: 'Optional' } as const;

export function CalmLanding({ view, loading, failed, starters, usingFallbackStarters, onAsk, children }: {
  view: ConciergeHomeView | null;
  loading: boolean;
  failed: boolean;
  starters: AskFeaturedPrompt[];
  usingFallbackStarters: boolean;
  onAsk: (prompt: AskCapabilityPrompt, source: 'ATTENTION' | 'DECISION' | 'DISCOVERY' | 'FALLBACK' | 'PERSONALIZED') => void;
  /** The capability explorer link, rendered last. */
  children?: ReactNode;
}) {
  const strip = view && !failed ? buildConciergeStateStrip(view) : null;
  const chip = (entry: StripChip) => (
    <li key={entry.id}><button type="button" data-strip-chip={entry.id} onClick={() => onAsk(entry.prompt, entry.source)} className={cn('min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums transition', TONE[entry.tone])}>{entry.label}</button></li>
  );
  return (
    <div className="mt-6" data-calm-landing="">
      <section aria-label="Your home today" data-calm-state-strip="">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your home…</p>}
        {!loading && (failed || !strip) && <p className="text-sm text-slate-500">Your home overview is temporarily unavailable. You can still ask anything above.</p>}
        {strip && !loading && <>
          {strip.headline && <p className="font-display text-xl font-semibold leading-snug text-slate-950 sm:text-2xl">{strip.headline}</p>}
          {strip.chips.length > 0 && <ul className="mt-3 flex flex-wrap gap-2" aria-label="At a glance">{strip.chips.map(chip)}</ul>}
          {strip.urgent && <button type="button" data-strip-urgent="" onClick={() => onAsk(strip.urgent!.prompt, 'ATTENTION')} className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal-300">
            <span className="min-w-0 truncate font-medium text-slate-900">{strip.urgent.title}</span>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', strip.urgent.priority === 'DO_NOW' ? 'bg-rose-100 text-rose-800' : strip.urgent.priority === 'PLAN_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>{PRIORITY_LABEL[strip.urgent.priority]}</span>
          </button>}
          {strip.notes.map((note) => <p key={note} className="mt-2 text-xs text-slate-500">{note}</p>)}
        </>}
      </section>
      {starters.length > 0 && <ul className="mt-5 flex flex-wrap gap-2" aria-label="Things you can ask">
        {starters.slice(0, 4).map((prompt) => <li key={prompt.id}><button type="button" onClick={() => onAsk(prompt, usingFallbackStarters ? 'FALLBACK' : prompt.source)} className="min-h-9 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-teal-300 hover:text-teal-900">{prompt.question}</button></li>)}
      </ul>}
      {children}
    </div>
  );
}
