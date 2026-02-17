'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getHomeSavingsSummary,
  HomeSavingsSummaryDTO,
  HomeSavingsSummaryCategoryDTO,
  runHomeSavings,
} from '@/lib/api/homeSavingsApi';

type HomeSavingsCheckToolCardProps = {
  propertyId: string;
};

function money(value?: number | null): string {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function hasAccountConfigured(entry: HomeSavingsSummaryCategoryDTO): boolean {
  return (
    !!entry.account &&
    ((entry.account.monthlyAmount ?? 0) > 0 || (entry.account.annualAmount ?? 0) > 0 || !!entry.account.providerName)
  );
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

  const statusLabel = useMemo(() => {
    if (!summary || configuredCount === 0) return 'Not set up';
    if (foundSavingsCount > 0) return 'Found savings';
    return 'Connected';
  }, [summary, configuredCount, foundSavingsCount]);

  const ctaLabel = useMemo(() => {
    if (!summary || configuredCount === 0) return 'Add bill';
    if (foundSavingsCount > 0) return 'View details';
    return 'Compare';
  }, [summary, configuredCount, foundSavingsCount]);

  const openTool = () => {
    if (!propertyId) return;
    router.push(`/dashboard/properties/${propertyId}/tools/home-savings`);
  };

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

    openTool();
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-100">
            <PiggyBank className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Home Savings Check</h3>
            <p className="text-sm text-gray-500">You may be paying more than necessary.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-700">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            Checking status…
          </span>
        ) : (
          <>
            <span className="font-medium">Status:</span> {statusLabel}
          </>
        )}
      </div>

      {summary && (
        <div className="mt-3 text-xs text-gray-600 space-y-1">
          <div>
            Potential savings:{' '}
            <span className="font-medium text-gray-800">
              {money(summary.potentialMonthlySavings)}/mo · {money(summary.potentialAnnualSavings)}/yr
            </span>
          </div>
          <div>
            Categories set up:{' '}
            <span className="font-medium text-gray-800">
              {configuredCount}/{summary.categories.length}
            </span>
          </div>
          {topOpportunity?.headline && (
            <div className="truncate">
              Top opportunity: <span className="font-medium text-gray-800">{topOpportunity.headline}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <Button onClick={handleCta} disabled={!propertyId || loading || running}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Comparing…
            </>
          ) : (
            ctaLabel
          )}
        </Button>
      </div>
    </div>
  );
}

