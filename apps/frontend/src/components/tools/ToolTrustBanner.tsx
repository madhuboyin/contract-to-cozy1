'use client';

import { Database, Zap, Info, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolTrustBannerProps {
  dataSources: string[];
  calculationMethod: string;
  disclaimer?: string;
  learnMoreHref?: string;
  tone?: 'amber' | 'teal' | 'blue';
}

const TONE: Record<
  NonNullable<ToolTrustBannerProps['tone']>,
  {
    wrapper: string;
    border: string;
    iconBg: string;
    iconBorder: string;
    icon: string;
    label: string;
    body: string;
    chip: string;
    chipBorder: string;
    dot: string;
    footerBorder: string;
    footerText: string;
    link: string;
  }
> = {
  amber: {
    wrapper: 'bg-amber-50',
    border: 'border-amber-100',
    iconBg: 'bg-white/70',
    iconBorder: 'border-amber-200',
    icon: 'text-amber-500',
    label: 'text-amber-800',
    body: 'text-amber-700',
    chip: 'bg-white/80',
    chipBorder: 'border-amber-200',
    dot: 'bg-amber-400',
    footerBorder: 'border-amber-100',
    footerText: 'text-amber-600',
    link: 'text-amber-700 hover:text-amber-900',
  },
  teal: {
    wrapper: 'bg-teal-50',
    border: 'border-teal-100',
    iconBg: 'bg-white/70',
    iconBorder: 'border-teal-200',
    icon: 'text-teal-600',
    label: 'text-teal-800',
    body: 'text-teal-700',
    chip: 'bg-white/80',
    chipBorder: 'border-teal-200',
    dot: 'bg-teal-400',
    footerBorder: 'border-teal-100',
    footerText: 'text-teal-600',
    link: 'text-teal-700 hover:text-teal-900',
  },
  blue: {
    wrapper: 'bg-blue-50',
    border: 'border-blue-100',
    iconBg: 'bg-white/70',
    iconBorder: 'border-blue-200',
    icon: 'text-blue-500',
    label: 'text-blue-800',
    body: 'text-blue-700',
    chip: 'bg-white/80',
    chipBorder: 'border-blue-200',
    dot: 'bg-blue-400',
    footerBorder: 'border-blue-100',
    footerText: 'text-blue-600',
    link: 'text-blue-700 hover:text-blue-900',
  },
};

export function ToolTrustBanner({
  dataSources,
  calculationMethod,
  disclaimer,
  learnMoreHref,
  tone = 'blue',
}: ToolTrustBannerProps) {
  const t = TONE[tone];

  return (
    <div className={cn('rounded-xl border p-4', t.wrapper, t.border)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
              t.iconBg,
              t.iconBorder
            )}
          >
            <Database className={cn('h-3.5 w-3.5', t.icon)} />
          </div>
          <div className="min-w-0">
            <p className={cn('text-[11px] font-semibold uppercase tracking-wider', t.label)}>
              Uses your data
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {dataSources.map((source) => (
                <span
                  key={source}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                    t.chip,
                    t.chipBorder,
                    t.body
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} />
                  {source}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
              t.iconBg,
              t.iconBorder
            )}
          >
            <Zap className={cn('h-3.5 w-3.5', t.icon)} />
          </div>
          <div className="min-w-0">
            <p className={cn('text-[11px] font-semibold uppercase tracking-wider', t.label)}>
              How it calculates
            </p>
            <p className={cn('mt-1.5 text-xs leading-relaxed', t.body)}>{calculationMethod}</p>
          </div>
        </div>
      </div>

      {(disclaimer || learnMoreHref) && (
        <div
          className={cn(
            'mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5',
            t.footerBorder
          )}
        >
          {disclaimer && (
            <div className="flex items-center gap-1.5">
              <Info className={cn('h-3 w-3 shrink-0', t.icon)} />
              <p className={cn('text-xs italic', t.footerText)}>{disclaimer}</p>
            </div>
          )}
          {learnMoreHref && (
            <a
              href={learnMoreHref}
              className={cn(
                'ml-auto flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline',
                t.link
              )}
            >
              How we model this
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
