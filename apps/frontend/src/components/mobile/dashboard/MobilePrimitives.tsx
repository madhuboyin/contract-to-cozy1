'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { STATUS_CHIP, type StatusChipLevel } from '@/lib/utils/chipTokens';
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
        'pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8',
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

export type StatusChipTone = StatusChipLevel;

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1',
        STATUS_CHIP[tone],
        MOBILE_TYPE_TOKENS.chip,
        className
      )}
    >
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
  badgeLabel?: string | null;
  variant?: 'default' | 'compact';
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
  variant = 'default',
}: QuickActionTileProps) {
  const normalizedBadgeLabel =
    typeof badgeLabel === 'string' ? badgeLabel.trim() : badgeLabel;
  const showBadge = badgeLabel !== null;

  if (variant === 'compact') {
    return (
      <Link
        href={href}
        className={cn(
          'no-brand-style block rounded-[18px] border px-3 py-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99]',
          tone === 'brand'
            ? 'border-[hsl(var(--mobile-brand-border))] bg-[linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff7e3)]'
            : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            {showBadge ? (
              <p className="mb-0 flex items-center gap-1 text-[11px] font-medium tracking-wide text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                {normalizedBadgeLabel ? <span>{normalizedBadgeLabel}</span> : null}
              </p>
            ) : null}
            <p className="mb-0 mt-0.5 line-clamp-2 text-[14px] font-semibold leading-[1.22] text-[hsl(var(--mobile-text-primary))]">
              {title}
            </p>
            {subtitle ? (
              <p className="mb-0 mt-1 line-clamp-1 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="relative mt-1 h-11 w-11 shrink-0 overflow-hidden rounded-lg">
            {artworkSrc ? (
              <Image
                src={artworkSrc}
                alt={artworkAlt || `${title} artwork`}
                fill
                sizes="44px"
                className="object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl leading-none">
                {trailingIcon || icon}
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

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
        {showBadge ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            {normalizedBadgeLabel ? <span>{normalizedBadgeLabel}</span> : null}
          </span>
        ) : (
          <span />
        )}
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
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>;
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
      <h2 className="mb-0 text-[1.375rem] leading-[1.2] font-semibold text-[hsl(var(--mobile-text-primary))]">
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

export function MobilePageIntro({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <MobileSection className={cn('space-y-2', className)}>
      {eyebrow ? (
        <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mb-0 text-[1.55rem] leading-tight font-semibold tracking-tight text-[hsl(var(--mobile-text-primary))]">
            {title}
          </h1>
          {subtitle ? (
            <p className={cn('mb-0 mt-1.5 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </MobileSection>
  );
}

type ToolWorkspaceProps = {
  intro?: React.ReactNode;
  summary?: React.ReactNode;
  filters?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function MobileToolWorkspace({
  intro,
  summary,
  filters,
  children,
  footer,
  className,
}: ToolWorkspaceProps) {
  return (
    <MobilePageContainer className={cn('space-y-4', className)}>
      {intro}
      {summary}
      {filters}
      {children ? <div className="space-y-4">{children}</div> : null}
      {footer}
    </MobilePageContainer>
  );
}

export function ResponsiveToolWorkspace({
  intro,
  summary,
  filters,
  children,
  footer,
  className,
}: ToolWorkspaceProps) {
  return (
    <MobilePageContainer className={cn('space-y-4 md:max-w-7xl md:px-6 lg:px-8', className)}>
      <div className="space-y-4 md:hidden">
        {intro}
        {summary}
        {filters}
        {children ? <div className="space-y-4">{children}</div> : null}
        {footer}
      </div>

      <div className="hidden md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8">
        <aside className="space-y-4 md:sticky md:top-6">
          {intro}
          {summary}
          {filters}
        </aside>
        <main className="space-y-4">
          {children ? <div className="space-y-4">{children}</div> : null}
          {footer}
        </main>
      </div>
    </MobilePageContainer>
  );
}

export function ScenarioInputCard({
  title,
  subtitle,
  badge,
  children,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <MobileCard className={cn('space-y-3.5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</h3>
          {subtitle ? (
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="space-y-3">{children}</div>
      {actions ? <div className="border-t border-[hsl(var(--mobile-border-subtle))] pt-3">{actions}</div> : null}
    </MobileCard>
  );
}

export function ResultHeroCard({
  eyebrow,
  title,
  value,
  status,
  summary,
  highlights,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  value: React.ReactNode;
  status?: React.ReactNode;
  summary?: string;
  highlights?: string[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <MobileCard
      variant="hero"
      className={cn('bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))]', className)}
    >
      {eyebrow ? (
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mb-0 text-[1.3rem] leading-[1.2] font-semibold tracking-tight text-[hsl(var(--mobile-text-primary))]">
        {title}
      </h2>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.heroMetric)}>{value}</p>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {summary ? (
        <p className={cn('mb-0 mt-3 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{summary}</p>
      ) : null}
      {highlights && highlights.length > 0 ? (
        <div className="mt-3 space-y-2">
          {highlights.slice(0, 3).map((highlight) => (
            <div key={highlight} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mobile-brand-strong))]" />
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>{highlight}</p>
            </div>
          ))}
        </div>
      ) : null}
      {actions ? <div className="mt-4">{actions}</div> : null}
    </MobileCard>
  );
}

type CompactEntityRowProps = {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  status?: React.ReactNode;
  href?: string;
  className?: string;
};

export function CompactEntityRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  status,
  href,
  className,
}: CompactEntityRowProps) {
  const content = (
    <div
      className={cn(
        'flex min-h-[44px] items-center gap-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5',
        className
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('mb-0 truncate text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>{title}</p>
          {status ? <div className="shrink-0">{status}</div> : null}
        </div>
        {(subtitle || meta) ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {subtitle ? (
              <p className={cn('mb-0 truncate text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                {subtitle}
              </p>
            ) : null}
            {meta ? <span className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>{meta}</span> : null}
          </div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
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

export function MobileFilterStack({
  search,
  primaryFilters,
  secondaryFilters,
  chips,
  actions,
  secondaryLabel = 'More filters',
  secondaryCollapsedByDefault = true,
  className,
}: {
  search?: React.ReactNode;
  primaryFilters?: React.ReactNode;
  secondaryFilters?: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  secondaryLabel?: string;
  secondaryCollapsedByDefault?: boolean;
  className?: string;
}) {
  const [secondaryOpen, setSecondaryOpen] = React.useState(!secondaryCollapsedByDefault);

  return (
    <MobileFilterSurface className={cn('space-y-3', className)}>
      {search ? <div>{search}</div> : null}
      {primaryFilters ? <div className="grid gap-2">{primaryFilters}</div> : null}
      {secondaryFilters ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSecondaryOpen((current) => !current)}
            className="flex min-h-[40px] w-full items-center justify-between rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 text-left text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
          >
            <span>{secondaryLabel}</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[hsl(var(--mobile-text-muted))] transition-transform duration-200',
                secondaryOpen && 'rotate-180'
              )}
            />
          </button>
          {secondaryOpen ? <div className="grid gap-2">{secondaryFilters}</div> : null}
        </div>
      ) : null}
      {chips ? <MobileHorizontalScroller className="-mx-1 px-1">{chips}</MobileHorizontalScroller> : null}
      {actions ? <MobileActionRow>{actions}</MobileActionRow> : null}
    </MobileFilterSurface>
  );
}

export function ActionPriorityRow({
  primaryAction,
  secondaryActions,
  className,
}: {
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {primaryAction ? <div className="w-full [&>*]:w-full">{primaryAction}</div> : null}
      {secondaryActions ? <MobileActionRow>{secondaryActions}</MobileActionRow> : null}
    </div>
  );
}

export type ReadOnlySummaryItem = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasize?: boolean;
};

export function ReadOnlySummaryBlock({
  title,
  items,
  columns = 1,
  className,
}: {
  title?: string;
  items: ReadOnlySummaryItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3.5',
        className
      )}
    >
      {title ? (
        <p className={cn('mb-2.5 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>{title}</p>
      ) : null}
      <div className={cn('grid gap-3', columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>{item.label}</p>
            <p
              className={cn(
                'mb-0 mt-0.5 truncate text-[hsl(var(--mobile-text-primary))]',
                item.emphasize ? 'text-sm font-semibold' : MOBILE_TYPE_TOKENS.body
              )}
            >
              {item.value}
            </p>
            {item.hint ? (
              <p className={cn('mb-0 mt-0.5 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                {item.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export type TableToCardField<Row> = {
  key: string;
  label: string;
  value: (row: Row) => React.ReactNode;
  emphasize?: boolean;
};

export function TableToCardAdapter<Row>({
  rows,
  fields,
  getRowId,
  getTitle,
  getSubtitle,
  getActions,
  emptyState,
  className,
  cardClassName,
}: {
  rows: Row[];
  fields: TableToCardField<Row>[];
  getRowId: (row: Row, index: number) => React.Key;
  getTitle?: (row: Row) => React.ReactNode;
  getSubtitle?: (row: Row) => React.ReactNode;
  getActions?: (row: Row) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  cardClassName?: string;
}) {
  if (rows.length === 0) return emptyState ? <>{emptyState}</> : null;

  return (
    <div className={cn('space-y-3', className)}>
      {rows.map((row, index) => (
        <MobileCard key={getRowId(row, index)} variant="compact" className={cn('space-y-3', cardClassName)}>
          {getTitle || getSubtitle || getActions ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {getTitle ? (
                  <p className={cn('mb-0 truncate text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>
                    {getTitle(row)}
                  </p>
                ) : null}
                {getSubtitle ? (
                  <p className={cn('mb-0 mt-0.5 truncate text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
                    {getSubtitle(row)}
                  </p>
                ) : null}
              </div>
              {getActions ? <div className="shrink-0">{getActions(row)}</div> : null}
            </div>
          ) : null}
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.key} className="flex items-start justify-between gap-3">
                <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>{field.label}</p>
                <p
                  className={cn(
                    'mb-0 text-right text-[hsl(var(--mobile-text-primary))]',
                    field.emphasize ? 'text-sm font-semibold' : MOBILE_TYPE_TOKENS.body
                  )}
                >
                  {field.value(row)}
                </p>
              </div>
            ))}
          </div>
        </MobileCard>
      ))}
    </div>
  );
}

export function MobileFilterSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MobileCard variant="compact" className={cn('space-y-3', className)}>
      {children}
    </MobileCard>
  );
}

export function MobileActionRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export function MobileKpiStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('grid grid-cols-2 gap-2.5', className)}>{children}</div>;
}

export function MobileKpiTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'positive'
      ? 'border-emerald-200/90 bg-emerald-50/80'
      : tone === 'warning'
      ? 'border-amber-200/90 bg-amber-50/85'
      : tone === 'danger'
      ? 'border-rose-200/90 bg-rose-50/80'
      : 'border-[hsl(var(--mobile-border-subtle))] bg-white';

  return (
    <div className={cn('rounded-2xl border p-3', toneClass)}>
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>{label}</p>
      <p className="mb-0 mt-1 text-lg font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">{value}</p>
      {hint ? <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>{hint}</p> : null}
    </div>
  );
}

const bottomSafeAreaReserveVariants = {
  compact: 'h-[calc(5.5rem+env(safe-area-inset-bottom))]',
  chatAware: 'h-[calc(8rem+env(safe-area-inset-bottom))]',
  floatingAction: 'h-[calc(10rem+env(safe-area-inset-bottom))]',
} as const;

export function BottomSafeAreaReserve({
  size = 'chatAware',
  className,
}: {
  size?: keyof typeof bottomSafeAreaReserveVariants;
  className?: string;
}) {
  return <div className={cn(bottomSafeAreaReserveVariants[size], className)} aria-hidden="true" />;
}

export function BottomSafeAreaGuard({
  className,
}: {
  className?: string;
}) {
  return <BottomSafeAreaReserve size="chatAware" className={className} />;
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
