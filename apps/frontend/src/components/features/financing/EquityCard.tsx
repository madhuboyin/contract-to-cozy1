'use client';
// apps/frontend/src/components/features/financing/EquityCard.tsx
import React from 'react';
import Link from 'next/link';
import { RefreshCw, AlertTriangle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EquityPosition, PropertyFinancingProfile } from '@/types';
import { usd, pct, daysSince } from './FinancingUtils';

interface EquityCardProps {
  equity: EquityPosition | null;
  profile: PropertyFinancingProfile | null;
  propertyId: string;
  onRefresh: () => void;
  refreshing?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  APPRECIATION_TRACKER: 'from Appreciation Tracker',
  PURCHASE_PRICE: 'from purchase price',
  USER_ENTERED: 'user entered',
};

export default function EquityCard({
  equity,
  profile,
  propertyId,
  onRefresh,
  refreshing,
}: EquityCardProps) {
  const balanceStaleDays = daysSince(profile?.mortgageBalanceAsOfDate);
  const isBalanceStale = balanceStaleDays != null && balanceStaleDays > 90;

  if (!equity && !profile) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
        <TrendingUp className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Add mortgage details to see your equity
        </p>
        <p className="mt-1 text-xs text-slate-500">
          We'll calculate your home equity and estimated HELOC capacity
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link href={`/dashboard/properties/${propertyId}/tools/financing/profile`}>
            Add mortgage details
          </Link>
        </Button>
      </div>
    );
  }

  // Profile exists but equity couldn't be computed (e.g. missing home value, DB not migrated)
  if (!equity && profile) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-emerald-50/40 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="flex items-start justify-between border-b border-slate-100/70 px-5 py-4 dark:border-slate-800/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Equity Position
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh equity"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Equity data unavailable
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                Add your home&apos;s estimated value and current mortgage balance to your profile, then tap refresh.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <Link href={`/dashboard/properties/${propertyId}/tools/financing/profile`}>
                    Update profile
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-600"
                  onClick={onRefresh}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing…' : 'Try again'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const equityPct = equity ? Number(equity.equityPercent) : null;
  const ltvPct = equity ? Number(equity.ltvPercent) : null;

  // Simple donut via CSS conic-gradient
  const filledPct = equityPct != null ? Math.max(0, Math.min(100, equityPct)) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-emerald-50/40 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
      <div className="flex items-start justify-between border-b border-slate-100/70 px-5 py-4 dark:border-slate-800/60">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Equity Position
          </p>
          {equity && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {SOURCE_LABELS[equity.estimatedValueSource] ?? equity.estimatedValueSource}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh equity"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex items-center gap-6 px-5 py-5">
        {/* Donut chart */}
        {equity && (
          <div
            className="relative h-20 w-20 shrink-0 rounded-full"
            style={{
              background: `conic-gradient(#10b981 0% ${filledPct}%, #e2e8f0 ${filledPct}% 100%)`,
            }}
          >
            <div className="absolute inset-[10px] rounded-full bg-white dark:bg-slate-900" />
            <p className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {equityPct != null ? `${Math.round(equityPct)}%` : '—'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Estimated value</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {equity ? usd(equity.estimatedValueCents) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mortgage balance</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {equity ? usd(equity.mortgageBalanceCents) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Equity</p>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
              {equity ? usd(equity.equityCents) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* HELOC capacity */}
      <div className="border-t border-slate-100/70 px-5 py-4 dark:border-slate-800/60">
        {equity?.helocEligible ? (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Est. HELOC capacity: ~{usd(equity.helocCapacityCents)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Based on 85% CLTV limit · LTV {ltvPct != null ? `${ltvPct.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        ) : equity ? (
          <div className="flex items-start gap-2 text-slate-500">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300" />
            <p className="text-xs">
              HELOC not available — equity must be ≥ 20% and LTV ≤ 85%
              {ltvPct != null ? ` (current LTV: ${ltvPct.toFixed(1)}%)` : ''}
            </p>
          </div>
        ) : null}
      </div>

      {/* Staleness warning */}
      {isBalanceStale && (
        <div className="flex items-start gap-2 border-t border-amber-100 bg-amber-50/80 px-5 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Mortgage balance last updated {balanceStaleDays} days ago —{' '}
            <Link
              href={`/dashboard/properties/${propertyId}/tools/financing/profile`}
              className="underline"
            >
              Update
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
