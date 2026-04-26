'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, PiggyBank } from 'lucide-react';
import { BadgeStatus, StatusBadge } from '@/components/ui/StatusBadge';
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
  'flex self-start flex-col gap-2.5 rounded-2xl border border-gray-200/85 bg-white p-3.5 shadow-sm sm:p-4';
const HEADER_ICON_WRAP = 'flex h-7 w-7 items-center justify-center rounded-md bg-slate-100/60';
const HEADER_ICON = 'h-3.5 w-3.5 text-slate-600';
const TITLE_CLASS = 'text-[12px] font-semibold leading-none text-gray-900 whitespace-nowrap';
const VALUE_ZONE = 'mt-1 rounded-lg border border-gray-200/70 bg-gray-50/70 px-2.5 py-2';
const CTA_CLASS =
  'group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50';

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
      status: 'watch' as BadgeStatus,
      customLabel: 'Checking',
    };
  }
  if (!summary || configuredCount === 0) {
    return {
      status: 'watch' as BadgeStatus,
      customLabel: 'Not set up',
    };
  }
  if (foundSavingsCount > 0) {
    return {
      status: 'excellent' as BadgeStatus,
      customLabel: 'Found savings',
    };
  }
  return {
    status: 'good' as BadgeStatus,
    customLabel: 'Stable',
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

    // Pass savings amounts as URL params to ensure destination shows same values
    const params = new URLSearchParams();
    if (monthlyPotential > 0) {
      params.set('expectedMonthly', monthlyPotential.toString());
      params.set('expectedAnnual', annualPotential.toString());
    }
    if (foundSavingsCount > 0) {
      params.set('highlight', 'opportunities');
    }
    
    const queryString = params.toString();
    router.push(`/dashboard/properties/${propertyId}/tools/home-savings${queryString ? `?${queryString}` : ''}`);
  };

  const status = statusMeta(loading, summary, configuredCount, foundSavingsCount);

  const monthlyPotential = summary?.potentialMonthlySavings ?? 0;
  const annualPotential = summary?.potentialAnnualSavings ?? 0;

  const showPotential = !loading && summary && configuredCount > 0;
  const hasPositiveSavings = monthlyPotential > 0 || annualPotential > 0;

  return (
    <div className={CARD_BASE}>
      <div className="space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={HEADER_ICON_WRAP}>
            <PiggyBank className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Home Savings Check</h3>
        </div>
        <StatusBadge status={status.status} customLabel={status.customLabel} />
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">
        You may be paying more than necessary.
      </p>

      <div className={VALUE_ZONE}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking savings profile…
          </span>
        ) : showPotential ? (
          hasPositiveSavings ? (
            <div>
              <div className="flex items-end gap-1.5">
                <span className="text-xl font-medium leading-[1.05] tracking-tight text-gray-800">
                  {money(monthlyPotential)}
                </span>
                <span className="mb-1 text-sm font-medium text-gray-500">/mo</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{money(annualPotential)}/yr potential</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium leading-tight tracking-tight text-gray-800">No savings identified</p>
              <p className="mt-1 text-sm text-gray-600">Refresh after adding current provider pricing.</p>
            </div>
          )
        ) : (
          <div>
            <p className="text-sm font-medium leading-tight tracking-tight text-gray-800">Add bill categories</p>
            <p className="mt-1 text-sm text-gray-600">Connect one category to unlock comparisons.</p>
          </div>
        )}
      </div>

      <div className="mt-1.5 space-y-1">
        <p className="text-[10px] font-normal leading-snug text-gray-600">
          <span className="font-normal text-gray-600">
            {summary ? `${configuredCount}/${summary.categories.length}` : '—'}
          </span>{' '}
          categories connected
        </p>
        <p className="truncate text-[10px] font-normal leading-snug text-gray-600" title={topOpportunity?.headline ?? ''}>
          {topOpportunity ? (
            <>
              Top opportunity:{' '}
              <span className="font-normal text-gray-600">{topOpportunity.headline}</span>
            </>
          ) : (
            'Top opportunity appears after first run.'
          )}
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleCta}
          disabled={!propertyId || loading || running}
          className={CTA_CLASS}
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Comparing…
            </>
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
