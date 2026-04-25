'use client';

import * as React from 'react';
import { ArrowRight, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'urgent';

const toneMap: Record<Tone, { card: string; icon: string; badge: string }> = {
  neutral: {
    card: 'border-slate-200/80 bg-white',
    icon: 'border-slate-200 bg-slate-50 text-slate-600',
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  brand: {
    card: 'border-teal-200/70 bg-teal-50/25',
    icon: 'border-teal-200 bg-teal-50 text-teal-700',
    badge: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  success: {
    card: 'border-emerald-200/70 bg-emerald-50/25',
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  warning: {
    card: 'border-amber-200/70 bg-amber-50/30',
    icon: 'border-amber-200 bg-amber-50 text-amber-700',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  urgent: {
    card: 'border-rose-200/70 bg-rose-50/25',
    icon: 'border-rose-200 bg-rose-50 text-rose-700',
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

export function PremiumCard({
  className,
  tone = 'neutral',
  interactive = false,
  children,
}: {
  className?: string;
  tone?: Tone;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[24px] border p-6 shadow-[var(--ctc-shadow-card)]',
        'transition-[transform,box-shadow,border-color,background-color] duration-[240ms] ease-out',
        toneMap[tone].card,
        interactive && 'hover:-translate-y-0.5 hover:shadow-[var(--ctc-shadow-hover)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  action,
  meta,
  className,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/80 bg-[var(--ctc-surface-hero)] p-6 shadow-[var(--ctc-shadow-card)] md:p-8',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 flex items-center gap-3">
            {icon ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-200 bg-white/80 text-teal-700 shadow-sm">
                {icon}
              </span>
            ) : null}
            <p className="mb-0 text-[11px] font-semibold text-teal-700">
              {eyebrow}
            </p>
          </div>
          <h1 className="mb-0 text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] text-slate-950 md:text-[2.4rem]">
            {title}
          </h1>
          <p className="mb-0 mt-3 max-w-2xl text-[15px] leading-6 text-slate-600 md:text-base">
            {description}
          </p>
          {meta ? <div className="mt-5">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="relative z-10 mt-6">{children}</div> : null}
    </section>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <PremiumCard tone={tone} className={cn('p-4', className)}>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{label}</p>
      <div className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">{value}</div>
      {hint ? <p className="mb-0 mt-1 text-xs leading-5 text-slate-600">{hint}</p> : null}
    </PremiumCard>
  );
}

export function SmartCTA({
  children,
  className,
  variant = 'primary',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'variant'> & { variant?: 'primary' | 'secondary' }) {
  const baseClassName = cn(
    'group min-h-11 rounded-[14px] px-5 font-semibold tracking-normal transition-all duration-[180ms] ease-out active:scale-[0.98]',
    variant === 'primary'
      ? 'bg-teal-700 text-white shadow-[0_14px_32px_-18px_rgba(13,148,136,0.8)] hover:bg-teal-800'
      : 'border border-slate-200 bg-white/80 text-slate-800 shadow-sm hover:bg-slate-50',
    className,
  );

  if (props.asChild) {
    return (
      <Button {...props} className={baseClassName}>
        {children}
      </Button>
    );
  }

  return (
    <Button
      {...props}
      className={baseClassName}
    >
      <span>{children}</span>
      <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-[180ms] group-hover:translate-x-0.5" />
    </Button>
  );
}

export function ConfidenceBadge({
  label = 'High confidence based on live signals',
  tone = 'success',
  className,
}: {
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold', toneMap[tone].badge, className)}>
      <ShieldCheck className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function TrustMetaRow({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs text-slate-600', className)}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5">
          {index === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Info className="h-3.5 w-3.5 text-slate-400" />}
          {item}
        </span>
      ))}
    </div>
  );
}

export function EmptyStatePremium({
  title,
  description,
  action,
  tone = 'success',
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <PremiumCard tone={tone} className="py-10 text-center">
      <div className={cn('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border', toneMap[tone].icon)}>
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="mb-0 text-xl font-semibold tracking-[-0.01em] text-slate-950">{title}</h3>
      <p className="mx-auto mb-0 mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </PremiumCard>
  );
}
