'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildConciergeStateStrip, type StripChip, type StripTone } from '@/features/ask/conciergeStateStrip';
import type { AskCapabilityPrompt, AskFeaturedPrompt, ConciergeHomeView } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 slice D (FRD v1.111): the calm landing below the composer. One sentence about the home,
// count chips that each open the matching answer, at most one urgent item, then a few starter questions. It replaces the
// "Popular ways" cards and the "For your attention" card; nothing here is a second source of truth (see conciergeStateStrip).
const TONE: Record<StripTone, { chip: string; dot: string }> = {
  CRITICAL: { chip: 'bg-red-50 text-red-800 hover:bg-red-100', dot: 'bg-red-500' },
  CAUTION: { chip: 'bg-amber-50 text-amber-900 hover:bg-amber-100', dot: 'bg-amber-500' },
  DEFAULT: { chip: 'bg-slate-100 text-slate-700 hover:bg-slate-200', dot: 'bg-slate-400' },
};
// One line on a phone (scrolls sideways), wrapping on wider screens.
const ROW = 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible';

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
  // A starter that repeats a strip chip, the top priority, or the same question is dropped, so nothing is offered twice.
  const covered = new Set<string>();
  for (const entry of strip?.chips ?? []) { covered.add(entry.prompt.id); covered.add(entry.prompt.question.trim().toLowerCase()); }
  if (strip?.urgent) { covered.add(strip.urgent.prompt.id); covered.add(strip.urgent.prompt.question.trim().toLowerCase()); }
  const shownStarters = starters.filter((prompt) => !covered.has(prompt.id) && !covered.has(prompt.question.trim().toLowerCase())).slice(0, 4);
  const chip = (entry: StripChip) => (
    <li key={entry.id} className="shrink-0"><button type="button" data-strip-chip={entry.id} onClick={() => onAsk(entry.prompt, entry.source)} className={cn('inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium tabular-nums transition', TONE[entry.tone].chip)}><span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', TONE[entry.tone].dot)} />{entry.label}</button></li>
  );
  const stripChips = strip?.chips ?? [];
  const suggestionCount = stripChips.length + shownStarters.length;
  return (
    <div className="mt-4" data-calm-landing="">
      <section aria-label="Your home today" data-calm-state-strip="">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your home…</p>}
        {!loading && (failed || !strip) && <p className="text-sm text-slate-500">Your home overview is temporarily unavailable. You can still ask anything above.</p>}
        {strip && !loading && <>
          {stripChips.length === 0 && strip.headline && <p className="text-[15px] leading-6 text-slate-600">{strip.headline}</p>}
          {strip.notes.map((note) => <p key={note} className="mt-2 text-xs text-slate-500">{note}</p>)}
        </>}
      </section>
      {/* IW-CONV-016 (FRD v1.112): one row of suggestions and nothing else on the landing: what needs attention (with a dot), then a few
          starter questions, then "More ideas". The top priority is one tap away through the first chip, not a second element. */}
      {(suggestionCount > 0 || children) && !loading && <ul className={cn(ROW, 'mt-1')} aria-label="Suggestions">
        {stripChips.map(chip)}
        {shownStarters.map((prompt) => <li key={prompt.id} className="shrink-0"><button type="button" onClick={() => onAsk(prompt, usingFallbackStarters ? 'FALLBACK' : prompt.source)} className="min-h-9 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-teal-300 hover:text-teal-900">{prompt.question}</button></li>)}
        {children && <li className="shrink-0">{children}</li>}
      </ul>}
    </div>
  );
}
