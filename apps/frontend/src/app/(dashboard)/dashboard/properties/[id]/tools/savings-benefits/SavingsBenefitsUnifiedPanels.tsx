'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { SavingsBenefitsUnifiedItemDTO } from '@/types';
import {
  EmptyStateCard,
  MobileCard,
  StatusChip,
  type StatusChipTone,
} from '@/components/mobile/dashboard/MobilePrimitives';

const FAMILY_LABEL: Record<SavingsBenefitsUnifiedItemDTO['family'], string> = {
  BENEFIT: 'Benefit',
  RECURRING_COST: 'Recurring cost',
};

const FAMILY_TONE: Record<SavingsBenefitsUnifiedItemDTO['family'], StatusChipTone> = {
  BENEFIT: 'info',
  RECURRING_COST: 'protected',
};

function formatMoney(value: number | null, currency: string): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function useSavingsBenefitsUnified(propertyId: string) {
  return useQuery({
    queryKey: ['savings-benefits-unified', propertyId],
    queryFn: () => api.getSavingsBenefitsUnified(propertyId),
    staleTime: 60_000,
  });
}

function ItemRow({ item }: { item: SavingsBenefitsUnifiedItemDTO }) {
  const valueLabel =
    item.lifecycle === 'REALIZED'
      ? formatMoney(item.realizedValue, item.currency)
      : formatMoney(item.estimatedValue, item.currency);
  const valueQualifier =
    item.lifecycle === 'REALIZED'
      ? 'Realized'
      : item.estimatedValueBasis === 'ONE_TIME'
        ? 'One-time (est.)'
        : item.estimatedValueBasis === 'RECURRING'
          ? 'Annual (est.)'
          : 'Estimated';
  const deadlineLabel = formatDate(item.deadline);

  return (
    <Link
      href={item.detailHref}
      className="block rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 transition-transform active:scale-[0.99] dark:bg-slate-900/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={FAMILY_TONE[item.family]}>{FAMILY_LABEL[item.family]}</StatusChip>
        <StatusChip tone="info">{item.statusLabel}</StatusChip>
      </div>
      <p className="mt-2 mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">{item.title}</p>
      {item.explanation ? (
        <p className="mt-1 mb-0 text-xs leading-relaxed text-[hsl(var(--mobile-text-secondary))]">
          {item.explanation}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
        {valueLabel ? (
          <span>
            <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">{valueLabel}</span> {valueQualifier}
          </span>
        ) : null}
        {deadlineLabel ? <span>Deadline: {deadlineLabel}</span> : null}
        {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
      </div>
    </Link>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-2">
      {[0, 1].map((key) => (
        <div
          key={key}
          className="h-24 animate-pulse rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-slate-100 dark:bg-slate-800/40"
        />
      ))}
    </div>
  );
}

function ErrorPanel() {
  return (
    <EmptyStateCard
      title="Couldn't load this view"
      description="Something went wrong fetching your combined savings and benefits activity. Try again in a moment."
    />
  );
}

export function InProgressPanel({ propertyId }: { propertyId: string }) {
  const query = useSavingsBenefitsUnified(propertyId);

  if (query.isLoading) return <LoadingPanel />;
  if (query.isError) return <ErrorPanel />;

  const items = query.data?.inProgress ?? [];
  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Nothing in progress yet"
        description="Mark a benefit as Pursuing or apply to a recurring-cost switch, and it'll show up here across both."
      />
    );
  }

  return (
    <MobileCard variant="compact" className="space-y-2 bg-transparent p-0 shadow-none">
      {items.map((item) => (
        <ItemRow key={`${item.family}-${item.id}`} item={item} />
      ))}
    </MobileCard>
  );
}

export function RealizedPanel({ propertyId }: { propertyId: string }) {
  const query = useSavingsBenefitsUnified(propertyId);

  if (query.isLoading) return <LoadingPanel />;
  if (query.isError) return <ErrorPanel />;

  const items = query.data?.realized ?? [];
  const totals = query.data?.totals;

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Nothing realized yet"
        description="Once you record a received benefit or a confirmed recurring-cost switch with evidence, it'll appear here with its verified value. Estimates shown elsewhere aren't counted until confirmed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {totals ? (
        <MobileCard variant="compact" className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[hsl(var(--mobile-text-secondary))]">Verified value realized</span>
          <span className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            {formatMoney(totals.realizedValueTotal, 'USD')}
          </span>
        </MobileCard>
      ) : null}
      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow key={`${item.family}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}
