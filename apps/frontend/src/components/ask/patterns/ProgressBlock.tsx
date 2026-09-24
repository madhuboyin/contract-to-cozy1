'use client';

import { cn } from '@/lib/utils';
import { ActionLink } from '../blocks/context';
import type { AskBlockRenderer } from '../blocks/types';
import { ItemActionButtons, TONE_CHIP } from './PatternParts';

// IW-PRES-020 (FRD v1.72). The ring shows the domain's own readiness figure with its basis. It is drawn from
// `percent` only; the renderer never recomputes it from the steps.

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const ProgressBlock: AskBlockRenderer<'PROGRESS'> = ({ block, onItemAction, itemActionsDisabled }) => {
  const percent = Math.max(0, Math.min(100, block.percent));
  const rounded = Math.round(percent);
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
              </li>
            ))}
          </ul>
        </div>
      )}
      {block.actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{block.actions.map((action) => <ActionLink key={action.id} action={action} />)}</div>}
    </section>
  );
};
