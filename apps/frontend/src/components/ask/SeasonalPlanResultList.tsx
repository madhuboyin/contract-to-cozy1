'use client';

import { useId, useState } from 'react';
import { ChevronDown, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskGroupedListItem, AskPresentationBlock } from '@/features/ask/types';

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedListBlock['sections'][number];

// The seasonal home-care answer (block id `seasonal-home-care-tasks`): what to do soon and what can wait, as numbered cards that open to
// a short "how to do it". The facts come from the task template itself (item.detail, one "Label: value" per line); nothing here is
// inferred about the home. Read-only: the next steps (set up the checklist, walk me through, update home details) are the answer's own
// actions, so these cards never navigate.
export const SEASONAL_PLAN_BLOCK_ID = 'seasonal-home-care-tasks';

const URGENT = { panel: 'border-rose-100 bg-rose-50/60', icon: 'text-rose-600', badge: 'bg-rose-100 text-rose-700', chip: 'bg-rose-100 text-rose-700' };
const CALM = { panel: 'border-sky-100 bg-sky-50/60', icon: 'text-sky-700', badge: 'bg-sky-100 text-sky-700', chip: 'bg-sky-100 text-sky-800' };

function detailFacts(detail: string | null | undefined): Array<{ label: string; value: string }> {
  return (detail ?? '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf(': ');
    return separator > 0 ? { label: line.slice(0, separator), value: line.slice(separator + 2) } : { label: '', value: line };
  });
}

function PlanTask({ item, urgent }: { item: AskGroupedListItem; urgent: boolean }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const palette = urgent ? URGENT : CALM;
  const facts = detailFacts(item.detail);
  const diy = item.meta.includes('DIY');
  const toggleLabel = open ? 'Hide details' : diy ? 'How to do it' : 'What to know';
  return (
    <li data-seasonal-task={item.id} className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', palette.badge)} aria-hidden="true">{item.countLabel}</span>
        <div className="min-w-0 flex-1">
          <h5 className="text-sm font-semibold leading-5 text-slate-950">{item.title}</h5>
          {item.description && <p className="mt-0.5 text-sm leading-5 text-slate-600">{item.description}</p>}
          {item.meta.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Task details">
              {item.meta.map((chip, index) => <li key={chip} className={cn('rounded-md px-2 py-0.5 text-xs font-medium', index === 0 ? palette.chip : 'bg-slate-100 text-slate-700')}>{chip}</li>)}
            </ul>
          )}
        </div>
        {facts.length > 0 && (
          <button type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
            {toggleLabel}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && facts.length > 0 && (
        <dl id={detailId} data-seasonal-task-detail={item.id} className="ml-10 mt-3 grid gap-x-4 gap-y-2 rounded-xl bg-white/80 p-3 text-sm sm:grid-cols-[8rem_1fr]">
          {facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="contents">
              {fact.label && <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</dt>}
              <dd className={cn('text-slate-800', !fact.label && 'sm:col-span-2')}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function PlanSection({ section }: { section: Section }) {
  const urgent = section.items.some((item) => item.tone === 'CAUTION');
  const palette = urgent ? URGENT : CALM;
  const Icon = urgent ? Zap : Clock;
  return (
    <section data-seasonal-section={section.id} aria-labelledby={`${section.id}-heading`} className={cn('rounded-2xl border p-4', palette.panel)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 id={`${section.id}-heading`} className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Icon className={cn('h-4 w-4', palette.icon)} aria-hidden="true" />
          {section.title}
          <span className="font-normal text-slate-500">({section.count})</span>
        </h4>
        {section.caption && <p className="text-xs text-slate-600">{section.caption}</p>}
      </header>
      <ol className="divide-y divide-slate-200/70">
        {section.items.map((item) => <PlanTask key={item.id} item={item} urgent={urgent} />)}
      </ol>
    </section>
  );
}

export function SeasonalPlanResultList({ block }: { block: GroupedListBlock }) {
  return (
    <div data-seasonal-plan="" className="space-y-3">
      {block.sections.map((section) => <PlanSection key={section.id} section={section} />)}
    </div>
  );
}
