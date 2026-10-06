'use client';

import { CalendarDays, ChevronRight, CircleDot, ClipboardList, Clock, DollarSign, Droplets, Fan, HardHat, Home, House, Info, Lightbulb, Refrigerator, Repeat, ShieldCheck, TreePine, Wrench, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAction, AskTaskGuideChip } from '@/features/ask/types';
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

export const TaskGuideBlock: AskBlockRenderer<'TASK_GUIDE'> = ({ block }) => {
  const Icon = ICONS[block.icon] ?? ClipboardList;
  const inRows = new Set(block.notes.map((note) => note.actionId).filter((id): id is string => Boolean(id)));
  const byId = new Map(block.actions.map((action) => [action.id, action]));
  const footer = block.actions.filter((action) => !inRows.has(action.id));
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
        {block.tip && (
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
