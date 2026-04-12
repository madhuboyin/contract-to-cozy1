'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandCenterTemplateProps {
  primaryAction: ReactNode;
  supportingAction?: ReactNode;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceLabel: string;
  rationale?: string | null;
  secondaryModules?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export default function CommandCenterTemplate({
  primaryAction,
  supportingAction,
  confidenceLabel,
  freshnessLabel,
  sourceLabel,
  rationale,
  secondaryModules,
  defaultExpanded = false,
  className,
}: CommandCenterTemplateProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasSecondaryModules = Boolean(secondaryModules);

  return (
    <section className={cn('space-y-3', className)}>
      <div>{primaryAction}</div>

      <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/75 p-3">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">
            Trust Signals
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-3">
          <p className="mb-0 rounded-xl bg-white/90 px-3 py-2">
            <span className="font-semibold text-slate-900">Confidence:</span> {confidenceLabel}
          </p>
          <p className="mb-0 rounded-xl bg-white/90 px-3 py-2">
            <span className="font-semibold text-slate-900">Freshness:</span> {freshnessLabel}
          </p>
          <p className="mb-0 rounded-xl bg-white/90 px-3 py-2">
            <span className="font-semibold text-slate-900">Source:</span> {sourceLabel}
          </p>
        </div>
        {rationale ? <p className="mt-2 mb-0 text-xs text-emerald-800/90">Why now: {rationale}</p> : null}
      </div>

      {supportingAction ? <div>{supportingAction}</div> : null}

      {hasSecondaryModules ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <span>{expanded ? 'Show fewer modules' : 'View more intelligence modules'}</span>
            <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', expanded ? 'rotate-180' : '')} />
          </button>
          {expanded ? <div className="mt-4 space-y-6">{secondaryModules}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
