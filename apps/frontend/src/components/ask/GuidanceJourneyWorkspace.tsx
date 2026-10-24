'use client';

import { useContext, useRef } from 'react';
import { CheckCircle2, ChevronDown, Circle, CircleDot, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskPresentationBlock, AskTaskGuideOutlineEntry } from '@/features/ask/types';
import { ActionLink, AskBlockActionContext } from './blocks/context';

// Guided journey workspace (a TASK_GUIDE the Guidance Overview producer names `guidance-journey-workspace`): where the journey stands, the one step to do
// now, the ordered rail and what has been recorded. Everything shown is the producer's own: no state, count or percentage is computed here, and there is
// no Auto/List/Cards choice because a journey is one ordered path. Skip and dismiss are the producer's QUIET actions, kept behind a menu.

export const GUIDANCE_JOURNEY_WORKSPACE_ID = 'guidance-journey-workspace';

type TaskGuide = Extract<AskPresentationBlock, { type: 'TASK_GUIDE' }>;

const STATE: Record<AskTaskGuideOutlineEntry['state'], { text: string; icon: typeof Circle; tone: string }> = {
  DONE: { text: 'Done', icon: CheckCircle2, tone: 'text-emerald-700' },
  SKIPPED: { text: 'Skipped', icon: MinusCircle, tone: 'text-slate-500' },
  CURRENT: { text: 'Current step', icon: CircleDot, tone: 'text-teal-800' },
  UPCOMING: { text: 'Not started', icon: Circle, tone: 'text-slate-500' },
};

function Rail({ outline }: { outline: AskTaskGuideOutlineEntry[] }) {
  return (
    // A vertical rail on a wide screen; on a phone it is one horizontal strip, so it never pushes the current step below the fold.
    <ol data-journey-rail="" aria-label="Steps in this journey" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {outline.map((entry, index) => {
        const state = STATE[entry.state];
        const Icon = state.icon;
        return (
          <li
            key={entry.stepId} data-step-state={entry.state} aria-current={entry.state === 'CURRENT' ? 'step' : undefined}
            className={cn('flex min-w-[10rem] shrink-0 items-start gap-2 rounded-lg px-2.5 py-2 text-sm lg:min-w-0', entry.state === 'CURRENT' ? 'bg-white ring-1 ring-teal-600' : 'bg-transparent')}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', state.tone)} aria-hidden="true" />
            <span className="min-w-0">
              <span className={cn('block leading-5', entry.state === 'CURRENT' ? 'font-semibold text-slate-950' : 'text-slate-800')}>{index + 1}. {entry.title}</span>
              <span className="block text-xs font-medium text-slate-600">{state.text}{entry.optional ? ' · Optional' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function GuidanceJourneyWorkspace({ block }: { block: TaskGuide }) {
  const controls = useContext(AskBlockActionContext);
  const menu = useRef<HTMLDetailsElement>(null);
  const primary = block.actions.find((action) => action.style === 'PRIMARY');
  const quiet = block.actions.filter((action) => action.style === 'QUIET');
  const outline = block.outline ?? [];
  const progress = block.progress;
  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const runQuiet = (action: AskAction) => {
    if (menu.current) menu.current.open = false;
    controls?.invoke(action);
  };
  return (
    <article data-guidance-journey={block.id} className="max-w-[1000px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {block.eyebrow.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{block.eyebrow.join(' · ')}</p>}
            <h3 data-task-guide-heading="" tabIndex={-1} className="mt-0.5 text-xl font-semibold leading-snug text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:text-2xl">{block.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {block.chips.map((chip) => <span key={chip.label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{chip.label}</span>)}
            {quiet.length > 0 && (
              <details ref={menu} className="relative">
                <summary aria-label="More journey options" className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
                  More<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-10 mt-1 min-w-48 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {quiet.map((action) => (
                    <button key={action.id} type="button" disabled={!controls || controls.disabled} onClick={() => runQuiet(action)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{action.label}</button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-700">{block.summary}</p>
        {progress && (
          <div>
            <div role="progressbar" aria-label="Journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} />
            </div>
            <p data-journey-progress="" role="status" className="mt-1.5 text-sm font-semibold text-slate-900">{progress.label}</p>
          </div>
        )}
      </header>

      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[16rem_1fr]">
        {outline.length > 0 && <div className="rounded-xl bg-slate-50 p-2"><Rail outline={outline} /></div>}
        <div className={cn('min-w-0 space-y-3', outline.length === 0 && 'lg:col-span-2')}>
          {block.main ? (
            <section data-journey-current="" className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-teal-700">{block.main.title}</h4>
              <p className="mt-1 text-[15px] leading-6 text-slate-900">{block.main.body}</p>
              {block.main.facts.length > 0 && (
                <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                  {block.main.facts.map((fact) => (
                    <div key={fact.label} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</dt><dd className="text-slate-800">{fact.value}</dd></div>
                  ))}
                </dl>
              )}
              {primary && <div className="mt-4"><ActionLink action={primary} /></div>}
            </section>
          ) : (
            <section data-journey-complete="" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-950">{block.summary}</section>
          )}
          {block.history.length > 0 && (
            <section data-journey-recorded="" aria-label="What has been recorded" className="rounded-xl bg-slate-50 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">What has been recorded</h4>
              <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">{block.history.map((entry, index) => <li key={`${entry.label}-${index}`}>{entry.label} <span className="text-slate-500">· {entry.value}</span></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
