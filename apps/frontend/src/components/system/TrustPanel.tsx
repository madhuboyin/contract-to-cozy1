'use client';

import { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';

interface TrustPanelRowProps {
  label: string;
  value: ReactNode;
}

function TrustPanelRow({ label, value }: TrustPanelRowProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="mb-1 text-xs font-semibold tracking-normal text-slate-500">{label}</p>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}

export interface TrustPanelProps {
  title?: string;
  subtitle?: string;
  whyThisStep: ReactNode;
  sourceAndConfidence: ReactNode;
  skipConsequence: ReactNode;
  freshness?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export default function TrustPanel({
  title = 'Step Trust Panel',
  subtitle = 'Why this recommendation is shown and what could happen if you skip it.',
  whyThisStep,
  sourceAndConfidence,
  skipConsequence,
  freshness,
  footer,
  className,
}: TrustPanelProps) {
  return (
    <section className={cn(CTC_TEMPLATE_SURFACES_V1.trustCard, 'space-y-3 p-4', className)}>
      <div>
        <p className="mb-0 inline-flex items-center gap-2 text-xs font-semibold tracking-normal text-emerald-800">
          <ShieldCheck className="h-4 w-4" />
          {title}
        </p>
        <p className="mt-1 mb-0 text-xs text-emerald-900/80">{subtitle}</p>
      </div>

      <div className="space-y-2">
        <TrustPanelRow label="Why this step" value={whyThisStep} />
        <TrustPanelRow label="Source and confidence" value={sourceAndConfidence} />
        {freshness ? <TrustPanelRow label="Data freshness" value={freshness} /> : null}
        <TrustPanelRow label="If you skip now" value={skipConsequence} />
      </div>

      {footer ? <div className="pt-1">{footer}</div> : null}
    </section>
  );
}

