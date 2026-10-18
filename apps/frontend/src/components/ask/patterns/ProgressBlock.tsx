'use client';

import { cn } from '@/lib/utils';
import { ActionLink, AskContextLink } from '../blocks/context';
import type { AskBlockRenderer } from '../blocks/types';
import { ItemActionButtons, TONE_CHIP } from './PatternParts';

// IW-PRES-020 (FRD v1.72). The ring shows the domain's own readiness figure with its basis. It is drawn from
// `percent` only; the renderer never recomputes it from the steps.

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ProgressBlock: AskBlockRenderer<'PROGRESS'> = ({ block, onItemAction, itemActionsDisabled }) => {
  const percent = Math.max(0, Math.min(100, block.percent));
  const rounded = Math.round(percent);
  if (block.id === 'digital-will-progress') {
    return <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="continuity-readiness">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3"><span className="text-2xl font-bold tabular-nums text-slate-950">{rounded}%</span><div><h3 className="font-semibold text-slate-950">{block.title}</h3><p className="text-xs text-slate-500">{block.basis}</p></div></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={block.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}><div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} /></div>
        </div>
        {block.metrics.length > 0 && <dl className="grid shrink-0 grid-cols-3 gap-1.5">{block.metrics.map((metric) => <div key={metric.label} className={cn('min-w-16 rounded-lg px-2.5 py-1.5 text-center', TONE_CHIP[metric.tone])}><dd className="text-sm font-bold tabular-nums">{metric.value}</dd><dt className="text-[10px] opacity-80">{metric.label}</dt></div>)}</dl>}
      </div>
      {block.nextSteps.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Do next</p><ul className="grid gap-2 md:grid-cols-3">{block.nextSteps.map((step) => <li key={step.id} className="flex min-h-16 flex-col justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-sm font-semibold leading-5 text-slate-900">{step.title}</p><ItemActionButtons item={step} actions={step.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} /></li>)}</ul></div>}
    </section>;
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-display-pattern="progress">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-sm text-slate-600">{block.description}</p>}
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`${rounded}% ready. ${block.basis}`}>
          <svg viewBox="0 0 108 108" className="h-28 w-28 -rotate-90" aria-hidden="true">
            <circle cx="54" cy="54" r={RADIUS} fill="none" strokeWidth="10" className="stroke-slate-100" />
            <circle cx="54" cy="54" r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-teal-600"
              strokeDasharray={`${((CIRCUMFERENCE * percent) / 100).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <span className="text-2xl font-semibold tabular-nums text-slate-950">{rounded}%</span>
          </span>
        </div>
        <div className="w-full min-w-0 space-y-3">
          <p className="text-sm text-slate-700">{block.basis}</p>
          {block.metrics.length > 0 && (
            <dl className="grid grid-cols-3 gap-2">
              {block.metrics.map((metric) => (
                <div key={metric.label} className={cn('flex flex-col-reverse rounded-xl px-3 py-2', TONE_CHIP[metric.tone])}>
                  <dt className="text-[11px] opacity-80">{metric.label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{metric.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {block.nextSteps.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Next steps</h4>
          <ul className="space-y-2">
            {block.nextSteps.map((step) => (
              <li key={step.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5" data-ask-progress-step={step.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                  {(step.description || step.amountLabel) && <p className="text-xs text-slate-500">{[step.description, step.amountLabel].filter(Boolean).join(' · ')}</p>}
                </div>
                <ItemActionButtons item={step} actions={step.actions} onItemAction={onItemAction} disabled={itemActionsDisabled} />
                {step.href && <AskContextLink href={step.href} className="text-xs font-semibold text-teal-700 hover:underline">Open<span className="sr-only"> {step.title}</span></AskContextLink>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
};
