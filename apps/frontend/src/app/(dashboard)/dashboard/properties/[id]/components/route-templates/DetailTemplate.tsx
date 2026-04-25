'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { TrustContract } from '@/lib/trust/trustContract';
import TrustStrip from './TrustStrip';

interface DetailTemplateProps {
  title: string;
  subtitle: string;
  trust?: TrustContract;
  controls?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function DetailTemplate({
  title,
  subtitle,
  trust,
  controls,
  className,
  children,
}: DetailTemplateProps) {
  return (
    <section className={cn('space-y-4', className)}>
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold tracking-normal text-slate-500">Detail View</p>
            <h1 className="mb-0 text-xl font-semibold text-slate-900 md:text-2xl">{title}</h1>
            <p className="mt-1 mb-0 text-sm text-slate-600">{subtitle}</p>
          </div>
          {controls}
        </div>
      </header>

      {children}

      {trust ? (
        <TrustStrip
          variant="footnote"
          confidenceLabel={trust.confidenceLabel}
          freshnessLabel={trust.freshnessLabel}
          sourceLabel={trust.sourceLabel}
        />
      ) : null}
    </section>
  );
}
