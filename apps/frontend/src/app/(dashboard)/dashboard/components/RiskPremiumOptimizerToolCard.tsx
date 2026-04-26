'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { BadgeStatus, StatusBadge } from '@/components/ui/StatusBadge';
import {
  getRiskPremiumOptimizer,
  RiskPremiumOptimizationDTO,
  runRiskPremiumOptimizer,
} from '@/lib/api/riskPremiumOptimizerApi';

type RiskPremiumOptimizerToolCardProps = {
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

function statusMeta(loading: boolean, analysis: RiskPremiumOptimizationDTO | null, hasAnalysis: boolean) {
  if (loading) {
    return { status: 'watch' as BadgeStatus, customLabel: 'Checking' };
  }
  if (!hasAnalysis || !analysis) {
    return { status: 'watch' as BadgeStatus, customLabel: 'Not run yet' };
  }
  if (analysis.status === 'STALE') {
    return { status: 'action' as BadgeStatus, customLabel: 'Review recommended' };
  }
  if (analysis.status === 'ERROR') {
    return { status: 'action' as BadgeStatus, customLabel: 'Review recommended' };
  }
  return { status: 'good' as BadgeStatus, customLabel: 'Stable' };
}

function money(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RiskPremiumOptimizerToolCard({
  propertyId,
}: RiskPremiumOptimizerToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<RiskPremiumOptimizationDTO | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!propertyId) {
        setLoading(false);
        setHasAnalysis(false);
        setAnalysis(null);
        return;
      }

      setLoading(true);
      try {
        const result = await getRiskPremiumOptimizer(propertyId);
        if (!mounted) return;

        if (result.exists) {
          setHasAnalysis(true);
          setAnalysis(result.analysis);
        } else {
          setHasAnalysis(false);
          setAnalysis(null);
        }
      } catch {
        if (!mounted) return;
        setHasAnalysis(false);
        setAnalysis(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [propertyId]);

  const ctaLabel = useMemo(() => {
    if (!hasAnalysis || !analysis) return 'Run optimizer';
    if (analysis.status === 'STALE') return 'Re-run';
    return 'View details';
  }, [analysis, hasAnalysis]);

  const handlePrimaryCta = async () => {
    if (!propertyId) return;

    if (!hasAnalysis || analysis?.status === 'STALE') {
      setRunning(true);
      try {
        const latest = await runRiskPremiumOptimizer(propertyId);
        setHasAnalysis(true);
        setAnalysis(latest);
        router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer?source=dashboard-card&action=run&savingsRange=${encodeURIComponent(savingsRange)}`);
      } finally {
        setRunning(false);
      }
      return;
    }

    router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer?source=dashboard-card&hasAnalysis=${hasAnalysis}&status=${analysis?.status || 'ready'}`);
  };

  const status = statusMeta(loading, analysis, hasAnalysis);

  const savingsRange =
    analysis && hasAnalysis
      ? `${money(analysis.estimatedSavingsMin)} - ${money(analysis.estimatedSavingsMax)}`
      : '—';
  const topRecommendation = analysis?.recommendations?.[0]?.title ?? 'Pending';
  const confidence = analysis?.confidence ? analysis.confidence.toLowerCase() : '—';

  return (
    <div className={CARD_BASE}>
      <div className="space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={HEADER_ICON_WRAP}>
            <ShieldAlert className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Lower Your Insurance Cost</h3>
        </div>
        <StatusBadge status={status.status} customLabel={status.customLabel} />
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">
        Lower premium pressure without increasing risk.
      </p>

      <div className={VALUE_ZONE}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking optimization profile…
          </span>
        ) : hasAnalysis && analysis ? (
          <div>
            <p className="text-xl font-medium leading-tight tracking-tight text-gray-800">{savingsRange}</p>
            <p className="mt-1 text-sm text-gray-600">Potential annual savings range.</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium leading-tight tracking-tight text-gray-800">Run optimizer</p>
            <p className="mt-1 text-sm text-gray-600">Get the highest-impact premium moves for this home.</p>
          </div>
        )}
      </div>

      <div className="mt-1.5 space-y-1">
        <p className="line-clamp-1 text-[10px] font-normal leading-snug text-gray-600">
          Top move:{' '}
          <span className="font-normal text-gray-600">{hasAnalysis ? topRecommendation : 'Shown after first run'}</span>
        </p>
        <p className="text-[10px] font-normal leading-snug text-gray-600">
          <span className="font-normal capitalize text-gray-600">{confidence}</span> confidence{' '}
          <span className="text-gray-300">·</span>{' '}
          {hasAnalysis ? analysis?.recommendations.length ?? 0 : '—'} recommendations
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handlePrimaryCta}
          disabled={loading || running || !propertyId}
          className={CTA_CLASS}
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
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
