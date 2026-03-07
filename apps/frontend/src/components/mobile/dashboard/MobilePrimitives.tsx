'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  MOBILE_CARD_RADIUS,
  MOBILE_LAYOUT_TOKENS,
  MOBILE_TYPE_TOKENS,
} from './mobileDesignTokens';

export function MobilePageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        MOBILE_LAYOUT_TOKENS.containerMaxWidth,
        MOBILE_LAYOUT_TOKENS.containerPaddingX,
        'pb-24',
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileSection({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={cn('space-y-3', className)}>{children}</section>;
}

export function MobileSectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className={cn('mb-0', MOBILE_TYPE_TOKENS.sectionTitle)}>{title}</h2>
        {subtitle ? (
          <p className={cn('mt-1 mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const mobileCardVariants = cva(
  cn(
    MOBILE_CARD_RADIUS,
    'border bg-[hsl(var(--mobile-card-bg))]',
    'border-[hsl(var(--mobile-border-subtle))]',
    'shadow-[0_10px_30px_rgba(15,23,42,0.05)]'
  ),
  {
    variants: {
      variant: {
        hero: 'p-5',
        standard: 'p-4',
        compact: 'p-3.5',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);

export function MobileCard({
  className,
  variant,
  children,
}: {
  className?: string;
  variant?: VariantProps<typeof mobileCardVariants>['variant'];
  children: React.ReactNode;
}) {
  return <div className={cn(mobileCardVariants({ variant }), className)}>{children}</div>;
}

const iconBadgeVariants = cva(
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border',
  {
    variants: {
      tone: {
        neutral:
          'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]',
        info: 'border-sky-200 bg-sky-50 text-sky-700',
        positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border-rose-200 bg-rose-50 text-rose-700',
        brand:
          'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
);

export function IconBadge({
  className,
  tone,
  children,
}: {
  className?: string;
  tone?: VariantProps<typeof iconBadgeVariants>['tone'];
  children: React.ReactNode;
}) {
  return <span className={cn(iconBadgeVariants({ tone }), className)}>{children}</span>;
}

const chipVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1',
  {
    variants: {
      tone: {
        good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        elevated: 'border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border-rose-200 bg-rose-50 text-rose-700',
        protected: 'border-teal-200 bg-teal-50 text-teal-700',
        needsAction:
          'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]',
        info: 'border-slate-200 bg-slate-50 text-slate-700',
      },
    },
    defaultVariants: {
      tone: 'info',
    },
  }
);

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: 'good' | 'elevated' | 'danger' | 'protected' | 'needsAction' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(chipVariants({ tone }), MOBILE_TYPE_TOKENS.chip, className)}>
      {children}
    </span>
  );
}

export function MetricRow({
  label,
  value,
  trend,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  trend?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {trend ? <span className={MOBILE_TYPE_TOKENS.caption}>{trend}</span> : null}
        <span className={cn('font-semibold text-[hsl(var(--mobile-text-primary))] text-sm', valueClassName)}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function PreviewListRow({
  title,
  subtitle,
  icon,
  href,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        'flex min-h-[44px] items-center gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5',
        className
      )}
    >
      {icon ? <div className="shrink-0">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className={cn('mb-0 truncate text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>{title}</p>
        {subtitle ? (
          <p className={cn('mb-0 truncate text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {href ? <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" /> : null}
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="no-brand-style block">
      {content}
    </Link>
  );
}

export function CompactInsightStrip({
  items,
  href,
}: {
  items: Array<{ label: string; tone?: 'good' | 'elevated' | 'danger' | 'info' }>;
  href?: string;
}) {
  const content = (
    <MobileCard variant="compact" className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-2">
        {items.map((item) => (
          <StatusChip key={item.label} tone={item.tone === 'danger' ? 'danger' : item.tone === 'good' ? 'good' : item.tone === 'elevated' ? 'elevated' : 'info'}>
            {item.label}
          </StatusChip>
        ))}
      </div>
    </MobileCard>
  );

  if (!href) return content;
  return (
    <Link href={href} className="no-brand-style block">
      {content}
    </Link>
  );
}

type QuickActionTileProps = {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  trailingIcon?: React.ReactNode;
  artworkSrc?: string;
  artworkAlt?: string;
  href: string;
  tone?: 'neutral' | 'brand';
  badgeLabel?: string;
};

export function QuickActionTile({
  title,
  subtitle,
  icon,
  trailingIcon,
  artworkSrc,
  artworkAlt,
  href,
  tone = 'neutral',
  badgeLabel = 'AI',
}: QuickActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        'no-brand-style block rounded-[20px] border p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99]',
        tone === 'brand'
          ? 'border-[hsl(var(--mobile-brand-border))] bg-[linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff7e3)]'
          : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-amber-700">
          <Sparkles className="h-3.5 w-3.5" />
          {badgeLabel}
        </span>
        {trailingIcon ? <span className="text-2xl leading-none">{trailingIcon}</span> : null}
      </div>
      <div className="mb-2 flex min-h-14 items-center">
        {artworkSrc ? (
          <div className="relative h-12 w-full">
            <Image
              src={artworkSrc}
              alt={artworkAlt || `${title} artwork`}
              fill
              sizes="(max-width: 768px) 140px, 160px"
              className="object-contain object-left"
            />
          </div>
        ) : (
          <div className="text-[30px] leading-none">{icon}</div>
        )}
      </div>
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</p>
      {subtitle ? (
        <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{subtitle}</p>
      ) : null}
    </Link>
  );
}

export function QuickActionGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function SummaryCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MobileCard className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</h3>
          {subtitle ? (
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-2.5">{children}</div>
    </MobileCard>
  );
}

export function HeroSummaryCard({
  eyebrow,
  title,
  metric,
  status,
  signals,
  ctaLabel,
  ctaHref,
}: {
  eyebrow: string;
  title: string;
  metric: string;
  status: React.ReactNode;
  signals: string[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <MobileCard variant="hero" className="bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))]">
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
        {eyebrow}
      </p>
      <h2 className="mb-0 text-[1.7rem] leading-tight font-semibold text-[hsl(var(--mobile-text-primary))]">
        {title}
      </h2>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.heroMetric)}>{metric}</p>
        <div className="shrink-0">{status}</div>
      </div>
      <div className="mt-4 space-y-2">
        {signals.slice(0, 3).map((signal) => (
          <div key={signal} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mobile-brand-strong))]" />
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{signal}</p>
          </div>
        ))}
      </div>
      <Link
        href={ctaHref}
        className="no-brand-style mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2.5 text-sm font-semibold text-white"
      >
        {ctaLabel}
      </Link>
    </MobileCard>
  );
}

export function ExpandableSummaryCard({
  title,
  summary,
  metric,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary: string;
  metric: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <MobileCard variant="compact">
        <CollapsibleTrigger className="flex w-full min-h-[44px] items-center justify-between gap-3 text-left">
          <div className="min-w-0">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</p>
            <p className={cn('mb-0 mt-1 truncate text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {summary}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip tone="info">{metric}</StatusChip>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[hsl(var(--mobile-text-muted))] transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="pt-3">{children}</div>
        </CollapsibleContent>
      </MobileCard>
    </Collapsible>
  );
}

export function MobileHorizontalScroller({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 no-scrollbar', className)}>
      {children}
    </div>
  );
}

export function EmptyStateCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <MobileCard variant="compact" className="text-center">
      <p className={cn('mb-1 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</p>
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}
