'use client';

import { useId, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Circle, CircleDot, ClipboardList, Clock, DollarSign, Droplets, Fan, HardHat, Home, House, Info, Lightbulb, MinusCircle, Refrigerator, Repeat, ShieldCheck, TreePine, Wrench, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskTaskGuideChip, AskTaskGuideOutlineEntry } from '@/features/ask/types';
import { ActionLink } from './blocks/context';
import { ACTION_ICONS } from './SeasonalAnswerCards';
import type { AskBlockRenderer } from './blocks/types';

// One task or habit as a single conversational card (TASK_GUIDE): where it sits, what it is, its key facts as chips, an optional tip, what to
// do, short explanatory rows and the next actions. It shows exactly what the producer recorded (no steps, photos or advice of its own), and
// a row can carry one of the card's actions so its button sits beside the explanation instead of in the action row. Each action keeps the
// style its producer declared; a guide whose only continuations are plan-level steps declares none PRIMARY and so shows no filled button.
const ICONS = {
  HVAC: Fan, PLUMBING: Droplets, ELECTRICAL: Zap, ROOF: House, OUTDOOR: TreePine, SAFETY: ShieldCheck, APPLIANCE: Refrigerator, HABIT: Repeat, TASK: ClipboardList,
} as const;

const CHIP_ICONS: Partial<Record<AskTaskGuideChip['kind'], typeof Zap>> = {
  PRIORITY_HIGH: Zap, PRIORITY: Zap, TIME: Clock, COST: DollarSign, DIY: Wrench, PRO: HardHat, DATE: CalendarDays, STATUS: CircleDot,
};

const chipTone = (kind: AskTaskGuideChip['kind']) => (kind === 'PRIORITY_HIGH'
  ? 'border-rose-100 bg-rose-50 text-rose-700'
  : kind === 'PRIORITY' ? 'border-sky-100 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-50 text-slate-700');

const NOTE_ICONS: Record<string, typeof Info> = { personalized: Home, about: Home };

// A stepped guide (an `outline` is present; plan docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md): each step's state is said in WORDS (never by colour or
// an icon alone), the current step is marked `aria-current="step"`, and nothing here is computed: the label, the counts and every state are the producer's own.
const OUTLINE_STATE: Record<AskTaskGuideOutlineEntry['state'], { text: string; icon: typeof Info; tone: string }> = {
  DONE: { text: 'Done', icon: CheckCircle2, tone: 'text-emerald-700' },
  SKIPPED: { text: 'Skipped', icon: MinusCircle, tone: 'text-slate-600' },
  CURRENT: { text: 'You are here', icon: CircleDot, tone: 'text-teal-800' },
  UPCOMING: { text: 'Not started', icon: Circle, tone: 'text-slate-500' },
};

/** The snapshot time as a short local time, or nothing when the producer's value is not a time (no guessing). */
function snapshotTime(asOf: string): string | null {
  const date = new Date(asOf);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const TaskGuideBlock: AskBlockRenderer<'TASK_GUIDE'> = ({ block }) => {
  const Icon = ICONS[block.icon] ?? ClipboardList;
  const inRows = new Set(block.notes.map((note) => note.actionId).filter((id): id is string => Boolean(id)));
  const byId = new Map(block.actions.map((action) => [action.id, action]));
  const footer = block.actions.filter((action) => !inRows.has(action.id));
  const guideMode = Array.isArray(block.outline);
  const [tipOpen, setTipOpen] = useState(false);
  const tipPanelId = useId();
  const asOf = block.progress ? snapshotTime(block.progress.asOf) : null;
  const footerButton = (action: AskAction) => {
    const ActionIcon = ACTION_ICONS[action.id];
    return <ActionLink key={action.id} action={action} icon={ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : undefined} />;
  };
  return (
    <article data-task-guide={block.id} className="max-w-[800px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600" aria-hidden="true"><Icon className="h-7 w-7" /></span>
        <div className="min-w-0">
          {block.eyebrow.length > 0 && (
            <nav aria-label="Where this is" className="flex flex-wrap items-center gap-1 text-sm font-semibold">
              {block.eyebrow.map((crumb, index) => (
                <span key={crumb} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                  <span className={index === 0 && block.eyebrow.length > 1 ? 'text-teal-700' : 'text-slate-900'}>{crumb}</span>
                </span>
              ))}
            </nav>
          )}
          <h3 className="mt-0.5 text-xl font-semibold leading-snug text-slate-950 sm:text-2xl">{block.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{block.summary}</p>
          {block.chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Key facts">
              {block.chips.map((chip) => {
                const ChipIcon = CHIP_ICONS[chip.kind];
                return <li key={`${chip.kind}-${chip.label}`} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', chipTone(chip.kind))}>{ChipIcon && <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" />}{chip.label}</li>;
              })}
            </ul>
          )}
        </div>
      </header>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {block.progress && (
          <p data-task-guide-progress="" className="text-sm font-semibold text-slate-900">
            {block.progress.label}
            {asOf && <span className="ml-2 font-normal text-slate-500">As of {asOf}</span>}
          </p>
        )}

        {block.tip && !guideMode && (
          <section data-task-guide-tip="" className="flex items-start gap-3 rounded-xl bg-sky-50/70 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600" aria-hidden="true"><Lightbulb className="h-4 w-4" /></span>
            <div className="min-w-0"><h4 className="text-sm font-semibold text-slate-950">{block.tip.title}</h4><p className="mt-0.5 text-sm leading-5 text-slate-600">{block.tip.body}</p></div>
          </section>
        )}

        {block.main && (
          <section data-task-guide-main="" className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-teal-700">{block.main.title}</h4>
            <p className="mt-1 text-[15px] leading-6 text-slate-900">{block.main.body}</p>
            {block.main.facts.length > 0 && (
              <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                {block.main.facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline gap-2"><dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</dt><dd className="text-slate-800">{fact.value}</dd></div>
                ))}
              </dl>
            )}
          </section>
        )}

        {guideMode && block.tip && (
          <section data-task-guide-tip="" className="rounded-xl bg-sky-50/70 p-3">
            <button
              type="button" aria-expanded={tipOpen} aria-controls={tipPanelId} onClick={() => setTipOpen((open) => !open)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
            >
              <Lightbulb className="h-4 w-4" aria-hidden="true" />{tipOpen ? 'Hide tip' : 'Show tip'}
            </button>
            <div id={tipPanelId} hidden={!tipOpen} className="mt-2">
              <h4 className="text-sm font-semibold text-slate-950">{block.tip.title}</h4>
              <p className="mt-0.5 text-sm leading-5 text-slate-600">{block.tip.body}</p>
            </div>
          </section>
        )}

        {guideMode && block.outline && block.outline.length > 0 && (
          <section data-task-guide-outline-section="" className="rounded-xl bg-slate-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">All steps</h4>
            <ol data-task-guide-outline="" aria-label="Steps in this project" className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {block.outline.map((entry, index) => {
                const state = OUTLINE_STATE[entry.state];
                const StateIcon = state.icon;
                return (
                  <li
                    key={entry.stepId} data-step-state={entry.state} aria-current={entry.state === 'CURRENT' ? 'step' : undefined}
                    className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', entry.state === 'CURRENT' ? 'bg-white ring-1 ring-teal-600' : '')}
                  >
                    <StateIcon className={cn('mt-0.5 h-4 w-4 shrink-0', state.tone)} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="text-slate-900">{index + 1}. {entry.title}</span>
                      <span className="ml-2 text-xs font-semibold text-slate-600">{state.text}{entry.optional ? ' · Optional' : ''}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {block.history.length > 0 && (
          <section data-task-guide-history="" aria-label="Recent activity" className="rounded-xl bg-slate-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent activity</h4>
            <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">{block.history.map((entry, index) => <li key={`${entry.label}-${index}`}>{entry.label} <span className="text-slate-500">· {entry.value}</span></li>)}</ul>
          </section>
        )}

        {block.notes.map((note) => {
          const NoteIcon = NOTE_ICONS[note.id] ?? Info;
          const rowAction = note.actionId ? byId.get(note.actionId) : undefined;
          return (
            <section key={note.id} data-task-guide-note={note.id} className="flex flex-wrap items-start gap-3 rounded-xl bg-slate-50 p-3 sm:flex-nowrap">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700" aria-hidden="true"><NoteIcon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><h4 className="text-sm font-semibold text-slate-950">{note.title}</h4><p className="mt-0.5 text-xs leading-5 text-slate-600">{note.body}</p></div>
              {rowAction && <div className="shrink-0 self-center"><ActionLink action={{ ...rowAction, style: 'SECONDARY' }} /></div>}
            </section>
          );
        })}
      </div>

      {footer.length > 0 && <div data-task-guide-actions="" className="mt-4 flex flex-wrap gap-2">{footer.map(footerButton)}</div>}
    </article>
  );
};
