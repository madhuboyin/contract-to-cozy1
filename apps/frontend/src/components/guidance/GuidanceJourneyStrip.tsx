'use client';

import { Check, Circle, PauseCircle, XCircle } from 'lucide-react';
import { GuidanceStepDTO } from '@/lib/api/guidanceApi';
import { cn } from '@/lib/utils';

type GuidanceJourneyStripProps = {
  steps: GuidanceStepDTO[];
  className?: string;
};

function dotForStatus(status: GuidanceStepDTO['status']) {
  if (status === 'COMPLETED') return <Check className="h-3 w-3" />;
  if (status === 'BLOCKED') return <XCircle className="h-3 w-3" />;
  if (status === 'SKIPPED') return <PauseCircle className="h-3 w-3" />;
  if (status === 'IN_PROGRESS') return <Circle className="h-3 w-3 fill-current" />;
  return <Circle className="h-3 w-3" />;
}

function toneForStatus(status: GuidanceStepDTO['status']) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'BLOCKED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'IN_PROGRESS') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'SKIPPED') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-white text-slate-600 border-slate-200';
}

export function GuidanceJourneyStrip({ steps, className }: GuidanceJourneyStripProps) {
  if (!steps.length) return null;

  return (
    <ol className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>
      {steps.map((step) => (
        <li
          key={step.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
            toneForStatus(step.status)
          )}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/40">
            {dotForStatus(step.status)}
          </span>
          <span className="truncate">
            {step.stepOrder}. {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
