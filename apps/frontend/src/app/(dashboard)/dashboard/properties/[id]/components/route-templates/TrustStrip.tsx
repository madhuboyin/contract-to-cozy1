'use client';

import { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrustStripProps {
  confidenceLabel: string;
  freshnessLabel: string;
  sourceLabel: string;
  rationale?: string | null;
  className?: string;
  trailing?: ReactNode;
}

export default function TrustStrip({
  confidenceLabel,
  freshnessLabel,
  sourceLabel,
  rationale,
  className,
  trailing,
}: TrustStripProps) {
  return (
    <section className={cn('rounded-2xl border border-emerald-200/70 bg-emerald-50/75 p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">
            Trust Strip
          </p>
        </span>
        {trailing}
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
      {rationale ? <p className="mt-2 mb-0 text-xs text-emerald-800/90">Why this recommendation: {rationale}</p> : null}
    </section>
  );
}
