'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getRiskPremiumOptimizer,
  RiskPremiumOptimizationDTO,
  runRiskPremiumOptimizer,
} from '@/lib/api/riskPremiumOptimizerApi';

type RiskPremiumOptimizerToolCardProps = {
  propertyId: string;
};

const CARD_BASE =
  'flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5';
const HEADER_ICON_WRAP = 'rounded-lg border border-gray-200/80 bg-gray-50/80 p-1.5';
const HEADER_ICON = 'h-4 w-4 text-teal-700';
const TITLE_CLASS = 'text-sm font-semibold text-gray-900';
const SUPPORT_LABEL = 'text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500';
const BADGE_BASE = 'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium';

function statusMeta(loading: boolean, analysis: RiskPremiumOptimizationDTO | null, hasAnalysis: boolean) {
  if (loading) {
    return { label: 'Checking', className: 'border-slate-200/80 bg-slate-50/75 text-slate-700' };
  }
  if (!hasAnalysis || !analysis) {
    return { label: 'Not run yet', className: 'border-slate-200/80 bg-slate-50/75 text-slate-700' };
  }
  if (analysis.status === 'STALE') {
    return {
      label: 'Review recommended',
      className: 'border-amber-200/80 bg-amber-50/75 text-amber-700',
    };
  }
  if (analysis.status === 'ERROR') {
    return { label: 'Needs refresh', className: 'border-rose-200/80 bg-rose-50/75 text-rose-700' };
  }
  return { label: 'Ready', className: 'border-emerald-200/80 bg-emerald-50/75 text-emerald-700' };
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
        router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`);
      } finally {
        setRunning(false);
      }
      return;
    }

    router.push(`/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`);
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={HEADER_ICON_WRAP}>
            <ShieldAlert className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Risk-to-Premium Optimizer</h3>
        </div>
        <span className={cn(BADGE_BASE, status.className)}>{status.label}</span>
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">
        Lower premium pressure without increasing risk.
      </p>

      <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5">
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking optimization profile…
          </span>
        ) : hasAnalysis && analysis ? (
          <>
            <p className={SUPPORT_LABEL}>Savings Range</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-gray-900">{savingsRange}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">
              Top recommendation: <span className="font-medium text-gray-800">{topRecommendation}</span>
            </p>
          </>
        ) : (
          <>
            <p className={SUPPORT_LABEL}>Optimization</p>
            <p className="mt-1 text-base font-semibold text-gray-900">Run optimizer</p>
            <p className="mt-1 text-xs text-gray-600">Get the highest-impact premium actions for this home.</p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Confidence</span>
          <span className="text-sm font-semibold capitalize text-gray-900">{confidence}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Recommendations</span>
          <span className="text-sm font-semibold text-gray-900">{hasAnalysis ? analysis?.recommendations.length ?? 0 : '—'}</span>
        </div>
      </div>

      <div className="mt-auto border-t border-gray-200/80 pt-3">
        <button
          type="button"
          onClick={handlePrimaryCta}
          disabled={loading || running || !propertyId}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running…
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
