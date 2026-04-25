'use client';

import { ReactNode } from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';

export interface PriorityActionHeroProps {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  supportingAction?: ReactNode;
  impactLabel?: string;
  confidenceLabel?: string;
  eyebrow?: string;
  className?: string;
}

export default function PriorityActionHero({
  title,
  description,
  primaryAction,
  supportingAction,
  impactLabel,
  confidenceLabel,
  eyebrow = 'Priority action',
  className,
}: PriorityActionHeroProps) {
  return (
    <section
      className={cn(
        CTC_TEMPLATE_SURFACES_V1.elevatedCard,
        'bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.12),transparent_50%),white] p-4 md:p-5',
        className
      )}
    >
      <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold tracking-normal text-brand-700">
        <Sparkles className="h-3.5 w-3.5" />
        {eyebrow}
      </p>
      <h2 className="mb-0 text-lg font-semibold text-slate-900 md:text-xl">{title}</h2>
      <p className="mt-1.5 mb-0 text-sm text-slate-600">{description}</p>

      {(impactLabel || confidenceLabel) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {impactLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <TrendingUp className="h-3.5 w-3.5" />
              {impactLabel}
            </span>
          ) : null}
          {confidenceLabel ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
              {confidenceLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {(primaryAction || supportingAction) ? (
        <div className="mt-4 space-y-2">
          {primaryAction ? <div>{primaryAction}</div> : null}
          {supportingAction ? <div>{supportingAction}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
