'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getHomeSavingsSummary,
  HomeSavingsSummaryDTO,
  HomeSavingsSummaryCategoryDTO,
  runHomeSavings,
} from '@/lib/api/homeSavingsApi';

type HomeSavingsCheckToolCardProps = {
  propertyId: string;
};

const CARD_BASE =
  'flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5';
const HEADER_ICON_WRAP = 'rounded-lg border border-gray-200/80 bg-gray-50/80 p-1.5';
const HEADER_ICON = 'h-4 w-4 text-teal-700';
const TITLE_CLASS = 'text-sm font-semibold text-gray-900';
const SUPPORT_LABEL = 'text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500';
const BADGE_BASE = 'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium';

function money(value?: number | null): string {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function hasAccountConfigured(entry: HomeSavingsSummaryCategoryDTO): boolean {
  return (
    !!entry.account &&
    ((entry.account.monthlyAmount ?? 0) > 0 || (entry.account.annualAmount ?? 0) > 0 || !!entry.account.providerName)
  );
}

function statusMeta(
  loading: boolean,
  summary: HomeSavingsSummaryDTO | null,
  configuredCount: number,
  foundSavingsCount: number,
) {
  if (loading) {
    return {
      label: 'Checking',
      className: 'border-slate-200/80 bg-slate-50/75 text-slate-700',
    };
  }
  if (!summary || configuredCount === 0) {
    return {
      label: 'Not set up',
      className: 'border-slate-200/80 bg-slate-50/75 text-slate-700',
    };
  }
  if (foundSavingsCount > 0) {
    return {
      label: 'Found savings',
      className: 'border-emerald-200/80 bg-emerald-50/75 text-emerald-700',
    };
  }
  return {
    label: 'Connected',
    className: 'border-teal-200/80 bg-teal-50/75 text-teal-700',
  };
}

export default function HomeSavingsCheckToolCard({ propertyId }: HomeSavingsCheckToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<HomeSavingsSummaryDTO | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!propertyId) {
        setSummary(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const next = await getHomeSavingsSummary(propertyId);
        if (!mounted) return;
        setSummary(next);
      } catch {
        if (!mounted) return;
        setSummary(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [propertyId]);

  const configuredCount = useMemo(
    () => (summary?.categories ?? []).filter(hasAccountConfigured).length,
    [summary?.categories]
  );

  const foundSavingsCount = useMemo(
    () => (summary?.categories ?? []).filter((entry) => entry.status === 'FOUND_SAVINGS').length,
    [summary?.categories]
  );

  const topOpportunity = useMemo(() => {
    const opportunities = (summary?.categories ?? [])
      .map((entry) => entry.topOpportunity)
      .filter(Boolean)
      .sort(
        (a, b) =>
          (b?.estimatedMonthlySavings ?? b?.estimatedAnnualSavings ?? 0) -
          (a?.estimatedMonthlySavings ?? a?.estimatedAnnualSavings ?? 0)
      );
    return opportunities[0] ?? null;
  }, [summary?.categories]);

  const ctaLabel = useMemo(() => {
    if (!summary || configuredCount === 0) return 'Add bill';
    if (foundSavingsCount > 0) return 'View details';
    return 'Compare';
  }, [summary, configuredCount, foundSavingsCount]);

  const handleCta = async () => {
    if (!propertyId) return;

    if (summary && configuredCount > 0 && foundSavingsCount === 0) {
      setRunning(true);
      try {
        await runHomeSavings(propertyId);
      } finally {
        setRunning(false);
      }
    }

    router.push(`/dashboard/properties/${propertyId}/tools/home-savings`);
  };

  const status = statusMeta(loading, summary, configuredCount, foundSavingsCount);

  const monthlyPotential = summary?.potentialMonthlySavings ?? 0;
  const annualPotential = summary?.potentialAnnualSavings ?? 0;

  const showPotential = !loading && summary && configuredCount > 0;
  const hasPositiveSavings = monthlyPotential > 0 || annualPotential > 0;

  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={HEADER_ICON_WRAP}>
            <PiggyBank className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Home Savings Check</h3>
        </div>
        <span className={cn(BADGE_BASE, status.className)}>{status.label}</span>
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">
        You may be paying more than necessary.
      </p>

      <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking savings profile…
          </span>
        ) : showPotential ? (
          hasPositiveSavings ? (
            <>
              <p className={SUPPORT_LABEL}>Potential Savings</p>
              <div className="mt-1 flex items-end gap-1.5">
                <span className="text-2xl font-semibold tracking-tight text-gray-900">{money(monthlyPotential)}</span>
                <span className="mb-0.5 text-xs text-gray-500">/mo</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{money(annualPotential)}/yr estimated</p>
            </>
          ) : (
            <>
              <p className={SUPPORT_LABEL}>Potential Savings</p>
              <p className="mt-1 text-base font-semibold text-gray-900">No savings identified yet</p>
              <p className="mt-1 text-xs text-gray-600">Refresh after adding updated provider pricing.</p>
            </>
          )
        ) : (
          <>
            <p className={SUPPORT_LABEL}>Setup</p>
            <p className="mt-1 text-base font-semibold text-gray-900">Add bill categories</p>
            <p className="mt-1 text-xs text-gray-600">Connect at least one category to unlock comparisons.</p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Categories</span>
          <span className="text-sm font-semibold text-gray-900">
            {summary ? `${configuredCount}/${summary.categories.length}` : '—'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Top Opportunity</span>
          <span className="max-w-[65%] truncate text-sm font-medium text-gray-700" title={topOpportunity?.headline ?? ''}>
            {topOpportunity?.headline ?? 'Pending'}
          </span>
        </div>
      </div>

      <div className="mt-auto border-t border-gray-200/80 pt-3">
        <button
          type="button"
          onClick={handleCta}
          disabled={!propertyId || loading || running}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Comparing…
            </>
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
