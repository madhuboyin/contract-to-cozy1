'use client';

import { ReactNode } from 'react';
import { ShieldCheck, Info, Database, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';
import type { TrustContract, TrustConfidenceBand } from '@/lib/trust/trustContract';
import { ConfidenceBadge } from '../trust/ConfidenceBadge';
import { SourceChip } from '../trust/SourceChip';
import { WhyThisMattersCard } from '../trust/WhyThisMattersCard';
import { ConfidenceLevel } from '@/lib/types/trust';

export interface TrustStripProps extends Pick<
  TrustContract,
  'confidenceLabel' | 'freshnessLabel' | 'sourceLabel' | 'rationale' | 'confidenceBand'
> {
  className?: string;
  trailing?: ReactNode;
  title?: string;
  /** 'panel' = full card (dashboard). 'footnote' = single muted line (tool/detail pages). Default: 'panel' */
  variant?: 'panel' | 'footnote';
}

function mapBandToLevel(band?: TrustConfidenceBand | null): ConfidenceLevel {
  if (band === 'HIGH') return 'high';
  if (band === 'MEDIUM') return 'medium';
  return 'low';
}

export default function TrustStrip({
  confidenceLabel,
  freshnessLabel,
  sourceLabel,
  rationale,
  confidenceBand,
  className,
  trailing,
  title = 'Trust Signals',
  variant = 'panel',
}: TrustStripProps) {
  const confidenceLevel = mapBandToLevel(confidenceBand);

  if (variant === 'footnote') {
    return (
      <div className={cn('mb-0 flex items-center flex-wrap gap-2.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500', className)}>
        <ConfidenceBadge level={confidenceLevel} className="scale-90 origin-left" />
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-slate-300" />
          <span>{sourceLabel}</span>
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-slate-300" />
          <span>{freshnessLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <section className={cn(CTC_TEMPLATE_SURFACES_V1.trustCard, 'p-4 space-y-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <div className="rounded-full bg-emerald-100 p-1">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mb-0 text-xs font-bold tracking-normal text-emerald-900">
            {title}
          </p>
        </span>
        {trailing}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-normal text-slate-400 ml-1">Confidence</p>
          <ConfidenceBadge level={confidenceLevel} score={confidenceLevel === 'high' ? 96 : confidenceLevel === 'medium' ? 78 : 42} />
        </div>
        
        <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block" />

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-normal text-slate-400 ml-1">Source</p>
          <SourceChip source={sourceLabel} />
        </div>

        <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block" />

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-normal text-slate-400 ml-1">Updated</p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-[11px] font-semibold text-slate-600 border border-slate-100">
            <Clock className="h-3 w-3 text-slate-400" />
            {freshnessLabel}
          </div>
        </div>
      </div>

      {rationale && (
        <div className="pt-2">
          <WhyThisMattersCard 
            explanation={rationale} 
            className="border-none bg-emerald-50/40 p-0 shadow-none"
            defaultExpanded={true}
          />
        </div>
      )}
    </section>
  );
}
