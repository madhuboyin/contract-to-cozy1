'use client';

import { ArrowLeft, CheckCircle2, Clock, Flower2, Home, Leaf, ListChecks, ListPlus, PlayCircle, Repeat, SkipForward, Snowflake, Sun, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './blocks/context';

type SummaryBlock = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;

// The seasonal home-care answer's intro and next steps (block ids below). The calm shell keeps one action per summary and shows a
// summary as a bare headline; the seasonal answer is a short plan with up to three next steps and a season icon, so these two summaries
// render as their own cards. Every action is the server's own inline action: nothing here links out.
// Each is shared by the general answer (`seasonal-home-care-*`) and the home's own checklist answer (`seasonal-maintenance-*`).
// The Home Habit Coach list (`home-habits-*`) uses the same cards; one habit's review is a single guide card (see TaskGuideBlock).
export const SEASONAL_INTRO_BLOCK_IDS: ReadonlySet<string> = new Set(['seasonal-home-care-summary', 'seasonal-maintenance-summary', 'home-habits-summary']);
export const SEASONAL_NEXT_STEPS_BLOCK_IDS: ReadonlySet<string> = new Set(['seasonal-home-care-next', 'seasonal-maintenance-next', 'home-habits-next', 'home-basics-next']);
export const SEASONAL_ABOUT_BLOCK_IDS: ReadonlySet<string> = new Set(['seasonal-home-care-boundary', 'home-habits-boundary']);
export const isSeasonalIntroBlockId = (id: string): boolean => SEASONAL_INTRO_BLOCK_IDS.has(id);

const SEASON_ICONS = [
  { word: 'winter', Icon: Snowflake, tone: 'bg-sky-50 text-sky-600' },
  { word: 'spring', Icon: Flower2, tone: 'bg-emerald-50 text-emerald-600' },
  { word: 'summer', Icon: Sun, tone: 'bg-amber-50 text-amber-600' },
  { word: 'fall', Icon: Leaf, tone: 'bg-orange-50 text-orange-600' },
] as const;

export const ACTION_ICONS: Record<string, typeof ListPlus> = {
  'seasonal-add-tasks': ListPlus,
  'seasonal-walkthrough': PlayCircle,
  'seasonal-next-task': PlayCircle,
  'seasonal-back-to-plan': ArrowLeft,
  'seasonal-show-checklist': ListChecks,
  'seasonal-update-home-details': Home,
  'habit-adopt': ListPlus,
  'habit-complete': CheckCircle2,
  'habit-snooze': Clock,
  'habit-skip': SkipForward,
  'habit-dismiss': XCircle,
  'habits-back-to-list': ArrowLeft,
  'habits-review-first': PlayCircle,
  'habits-show-maintenance': ListChecks,
  'seasonal-show-pending': ListChecks,
  'seasonal-show-completed': ListChecks,
  'seasonal-show-dismissed': ListChecks,
  'seasonal-show-maintenance': ListChecks,
};

export function SeasonalIntroCard({ block }: { block: SummaryBlock }) {
  const season = SEASON_ICONS.find(({ word }) => block.title.toLowerCase().includes(word));
  const habit = block.id.startsWith('home-habits');
  const Icon = season?.Icon ?? (habit ? Repeat : null);
  const tone = season?.tone ?? 'bg-teal-50 text-teal-700';
  return (
    <section data-seasonal-intro="" className="flex max-w-[800px] items-start gap-4">
      {Icon && <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', tone)} aria-hidden="true"><Icon className="h-6 w-6" /></span>}
      <div className="min-w-0">
        <h3 className="font-display text-[22px] font-medium leading-snug tracking-[-0.01em] text-slate-950 sm:text-[26px]">{block.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{block.body}</p>
        {block.actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
      </div>
    </section>
  );
}

// The "about this recommendation" disclosure as a card, not a footnote: it says why these are general tasks, which is the reason the
// next step below offers to update the home details. The disclosure text itself is the server's.
export function SeasonalAboutCard({ block }: { block: Extract<AskPresentationBlock, { type: 'BOUNDARY' }> }) {
  return (
    <section data-seasonal-about="" className="flex max-w-[800px] items-start gap-3 rounded-2xl bg-slate-100/70 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700" aria-hidden="true"><Home className="h-5 w-5" /></span>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-950">{block.title}</h4>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{block.body}</p>
      </div>
    </section>
  );
}

export function SeasonalNextSteps({ block }: { block: SummaryBlock }) {
  // Each action keeps the style its producer declared (PRIMARY, SECONDARY or QUIET): the producer owns which step is recommended, so a card
  // whose producer recommends none shows no filled button.
  const action = (candidate: AskAction) => {
    const Icon = ACTION_ICONS[candidate.id];
    return <ActionLink key={candidate.id} action={candidate} icon={Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : undefined} />;
  };
  return (
    <section data-seasonal-next-steps="" aria-labelledby="seasonal-next-steps-heading" className="flex max-w-[800px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700" aria-hidden="true"><ListChecks className="h-5 w-5" /></span>
      <div className="min-w-0">
        <h4 id="seasonal-next-steps-heading" className="text-sm font-semibold text-slate-950">{block.title}</h4>
        {block.body && <p className="mt-0.5 text-sm leading-5 text-slate-600">{block.body}</p>}
        {block.actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{block.actions.map(action)}</div>}
      </div>
    </section>
  );
}
