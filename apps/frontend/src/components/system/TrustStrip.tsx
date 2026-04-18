'use client';

import { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';
import type { TrustContract } from '@/lib/trust/trustContract';

export interface TrustStripProps extends Pick<
  TrustContract,
  'confidenceLabel' | 'freshnessLabel' | 'sourceLabel' | 'rationale'
> {
  className?: string;
  trailing?: ReactNode;
  title?: string;
  /** 'panel' = full card (dashboard). 'footnote' = single muted line (tool/detail pages). Default: 'panel' */
  variant?: 'panel' | 'footnote';
}

export default function TrustStrip({
  confidenceLabel,
  freshnessLabel,
  sourceLabel,
  rationale,
  className,
  trailing,
  title = 'Trust Signals',
  variant = 'panel',
}: TrustStripProps) {
  if (variant === 'footnote') {
    return (
      <p className={cn('mb-0 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-400', className)}>
        <ShieldCheck className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
        <span>{confidenceLabel} · {freshnessLabel} · {sourceLabel}</span>
      </p>
    );
  }

  return (
    <section className={cn(CTC_TEMPLATE_SURFACES_V1.trustCard, 'p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">
            {title}
          </p>
        </span>
        {trailing}
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-3">
        <p className={cn(CTC_TEMPLATE_SURFACES_V1.insetTile, 'mb-0')}>
          <span className="font-semibold text-slate-900">Confidence:</span> {confidenceLabel}
        </p>
        <p className={cn(CTC_TEMPLATE_SURFACES_V1.insetTile, 'mb-0')}>
          <span className="font-semibold text-slate-900">Freshness:</span> {freshnessLabel}
        </p>
        <p className={cn(CTC_TEMPLATE_SURFACES_V1.insetTile, 'mb-0')}>
          <span className="font-semibold text-slate-900">Source:</span> {sourceLabel}
        </p>
      </div>
      {rationale ? (
        <p className="mt-2 mb-0 text-xs text-emerald-800/90">Why this recommendation: {rationale}</p>
      ) : null}
    </section>
  );
}
