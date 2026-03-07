'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { MetricRow, MobileCard, StatusChip } from './MobilePrimitives';

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function sparkTone(value: number): string {
  if (value >= 75) return 'bg-emerald-400';
  if (value >= 50) return 'bg-teal-400';
  if (value >= 25) return 'bg-amber-400';
  return 'bg-rose-400';
}

export function MoneyImpactTrackerCard({
  annualExposure,
  annualSavings,
  monthlySavings,
  weeklyFinancialDelta,
  financialTrend,
}: {
  annualExposure: number;
  annualSavings: number;
  monthlySavings: number;
  weeklyFinancialDelta: number | null;
  financialTrend: number[];
}) {
  const netAnnualImpact = Math.max(0, annualExposure - annualSavings);
  const savingsCoveragePct = annualExposure > 0 ? Math.min(100, Math.round((annualSavings / annualExposure) * 100)) : 0;

  const deltaVisual =
    weeklyFinancialDelta === null || Number.isNaN(weeklyFinancialDelta)
      ? { icon: <Minus className="h-3.5 w-3.5" />, label: 'No change', className: 'text-slate-500' }
      : weeklyFinancialDelta >= 0
        ? {
            icon: <ArrowUp className="h-3.5 w-3.5" />,
            label: `+${Math.round(weeklyFinancialDelta)} pts`,
            className: 'text-emerald-600',
          }
        : {
            icon: <ArrowDown className="h-3.5 w-3.5" />,
            label: `${Math.round(weeklyFinancialDelta)} pts`,
            className: 'text-rose-600',
          };

  return (
    <MobileCard variant="compact" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">Money Impact Tracker</p>
          <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
            Exposure versus savings trajectory
          </p>
        </div>
        <StatusChip tone={netAnnualImpact > 0 ? 'elevated' : 'good'}>
          {netAnnualImpact > 0 ? 'Watch' : 'Stable'}
        </StatusChip>
      </div>

      <MetricRow label="Annual exposure" value={formatCurrency(annualExposure)} />
      <MetricRow label="Potential annual savings" value={formatCurrency(annualSavings)} />
      <MetricRow label="Net annual impact" value={formatCurrency(netAnnualImpact)} />
      <MetricRow
        label="Weekly financial trend"
        value={deltaVisual.label}
        trend={<span className={`inline-flex items-center gap-1 ${deltaVisual.className}`}>{deltaVisual.icon}</span>}
      />
      <MetricRow label="Potential monthly savings" value={formatCurrency(monthlySavings)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[hsl(var(--mobile-text-secondary))]">
          <span>Savings coverage</span>
          <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">{savingsCoveragePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--mobile-bg-muted))]">
          <div
            className="h-2 rounded-full bg-[hsl(var(--mobile-brand-strong))] transition-all duration-500"
            style={{ width: `${savingsCoveragePct}%` }}
          />
        </div>
      </div>

      {financialTrend.length > 0 ? (
        <div className="space-y-1">
          <p className="mb-0 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]">
            8-week score trend
          </p>
          <div className="flex h-10 items-end gap-1">
            {financialTrend.slice(-8).map((point, index) => {
              const clamped = Math.max(0, Math.min(100, Math.round(point)));
              return (
                <div key={`${index}-${point}`} className="flex w-full flex-col justify-end">
                  <div
                    className={`w-full rounded-t-sm ${sparkTone(clamped)}`}
                    style={{ height: `${Math.max(8, Math.round((clamped / 100) * 36))}px` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </MobileCard>
  );
}
