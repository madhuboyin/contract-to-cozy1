'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
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

export function CalmLanding({ view, loading, failed, starters, usingFallbackStarters, onAsk, headlineShownAbove = false, composer, children }: {
  view: ConciergeHomeView | null;
  loading: boolean;
  failed: boolean;
  starters: AskFeaturedPrompt[];
  usingFallbackStarters: boolean;
  onAsk: (prompt: AskCapabilityPrompt, source: 'ATTENTION' | 'DECISION' | 'DISCOVERY' | 'FALLBACK' | 'PERSONALIZED') => void;
  /** ACUI-001: the workspace already shows the state headline above the composer, so the landing does not repeat it. */
  headlineShownAbove?: boolean;
  /** Prototype parity: attention precedes the compact composer. */
  composer?: ReactNode;
  /** The capability explorer link, rendered last. */
  children?: ReactNode;
}) {
  const strip = view && !failed ? buildConciergeStateStrip(view) : null;
  // ACUI-002: which entry's "Why this appeared" is open. Local state, so opening it never touches the composer or the launch.
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  // A starter that repeats a strip chip, the top priority, or the same question is dropped, so nothing is offered twice.
  const covered = new Set<string>();
  for (const entry of strip?.chips ?? []) { covered.add(entry.prompt.id); covered.add(entry.prompt.question.trim().toLowerCase()); }
  if (strip?.urgent) { covered.add(strip.urgent.prompt.id); covered.add(strip.urgent.prompt.question.trim().toLowerCase()); }
  const shownStarters = starters.filter((prompt) => !covered.has(prompt.id) && !covered.has(prompt.question.trim().toLowerCase())).slice(0, 3);
  // Prototype-parity slice: at most two grounded attention cards before the
  // compact composer. Their actions and explanations retain the same
  // governed prompts; only hierarchy and presentation change.
  const contextLine = (entry: StripChip) => {
    const reasons = entry.explanation?.reasons.filter(Boolean) ?? [];
    const whyId = `why-${entry.id}`;
    const open = openWhy === entry.id;
    return (
      <li key={entry.id} className={cn('min-w-0 rounded-2xl border border-transparent p-4 sm:p-5', open && 'pb-4', TONE[entry.tone].chip.split(' ')[0])}>
        <button type="button" data-strip-chip={entry.id} onClick={() => onAsk(entry.prompt, entry.source)} className="group block w-full text-left">
          <span className={cn('block text-[11px] font-semibold uppercase tracking-[0.12em]', TONE[entry.tone].chip.split(' ')[1])}>{entry.label}</span>
          {entry.detail && <span className="mt-2 block text-base font-semibold leading-5 text-slate-950">{entry.detail}</span>}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-900">Review <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
        </button>
        {reasons.length > 0 && <>
          <button type="button" data-why-toggle={entry.id} aria-expanded={open} aria-controls={whyId} onClick={() => setOpenWhy(open ? null : entry.id)} className="mt-1 min-h-8 rounded-lg text-xs font-medium text-slate-600 underline-offset-2 hover:underline">Why this appeared</button>
          <ul id={whyId} hidden={!open} data-why-panel={entry.id} className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-5 text-slate-700 marker:text-slate-400">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </>}
      </li>
    );
  };
  const stripChips = (strip?.chips ?? []).slice(0, 2);
    return (
    <div className="mt-5" data-calm-landing="">
      <section aria-label="Your home today" data-calm-state-strip="">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking your home…</p>}
        {!loading && (failed || !strip) && <p className="text-sm text-slate-500">Your home overview is temporarily unavailable. You can still ask anything above.</p>}
        {strip && !loading && <>
          {!headlineShownAbove && stripChips.length === 0 && strip.headline && <p className="text-[15px] leading-6 text-slate-600">{strip.headline}</p>}
          {strip.notes.map((note) => <p key={note} className="mt-2 text-xs text-slate-500">{note}</p>)}
        </>}
      </section>
      {/* IW-CONV-016 (FRD v1.112): one row of suggestions and nothing else on the landing: what needs attention (with a dot), then a few
          starter questions, then "More ideas". The top priority is one tap away through the first chip, not a second element. */}
      {stripChips.length > 0 && !loading && <ul className="grid gap-3 sm:grid-cols-2" aria-label="Needs your attention">{stripChips.map(contextLine)}</ul>}
      {composer && <div className="mt-4">{composer}</div>}
      {(shownStarters.length > 0 || children) && !loading && <ul className={cn(ROW, 'mt-4')} aria-label="Suggestions">
        {shownStarters.map((prompt) => <li key={prompt.id} className="shrink-0"><button type="button" onClick={() => onAsk(prompt, usingFallbackStarters ? 'FALLBACK' : prompt.source)} className="min-h-9 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-teal-300 hover:text-teal-900">{prompt.question}</button></li>)}
        {children && <li className="shrink-0">{children}</li>}
      </ul>}
    </div>
  );
}
