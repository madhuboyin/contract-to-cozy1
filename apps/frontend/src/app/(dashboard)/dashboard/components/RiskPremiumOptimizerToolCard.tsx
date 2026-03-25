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
  'flex h-full flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-[0_6px_18px_-16px_rgba(15,23,42,0.4)] sm:p-5';
const HEADER_ICON_WRAP = 'flex h-7 w-7 items-center justify-center rounded-md bg-slate-100/80';
const HEADER_ICON = 'h-3.5 w-3.5 text-slate-600';
const TITLE_CLASS = 'text-[15px] font-semibold leading-none text-gray-900';
const BADGE_BASE = 'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium leading-none';
const CTA_CLASS =
  'group inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 transition-colors hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50';

function statusMeta(loading: boolean, analysis: RiskPremiumOptimizationDTO | null, hasAnalysis: boolean) {
  if (loading) {
    return { label: 'Checking', className: 'bg-slate-100 text-slate-700' };
  }
  if (!hasAnalysis || !analysis) {
    return { label: 'Not run yet', className: 'bg-slate-100 text-slate-700' };
  }
  if (analysis.status === 'STALE') {
    return {
      label: 'Review recommended',
      className: 'bg-amber-50 text-amber-700',
    };
  }
  if (analysis.status === 'ERROR') {
    return { label: 'Needs refresh', className: 'bg-rose-50 text-rose-700' };
  }
  return { label: 'Ready', className: 'bg-emerald-50 text-emerald-700' };
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
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={HEADER_ICON_WRAP}>
            <ShieldAlert className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Risk-to-Premium Optimizer</h3>
        </div>
        <span className={cn(BADGE_BASE, status.className)}>{status.label}</span>
      </div>

      <p className="line-clamp-2 text-[13px] leading-5 text-gray-500">
        Lower premium pressure without increasing risk.
      </p>

      {loading ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
          Checking optimization profile…
        </span>
      ) : hasAnalysis && analysis ? (
        <div>
          <p className="text-[1.85rem] font-semibold leading-tight tracking-tight text-gray-900">{savingsRange}</p>
          <p className="mt-1 text-sm text-gray-600">Potential annual savings range.</p>
        </div>
      ) : (
        <div>
          <p className="text-xl font-semibold tracking-tight text-gray-900">Run optimizer</p>
          <p className="mt-1 text-sm text-gray-600">Get the highest-impact premium moves for this home.</p>
        </div>
      )}

      <div className="space-y-1.5 text-[13px] leading-5 text-gray-600">
        <p className="line-clamp-2">
          Top move:{' '}
          <span className="font-medium text-gray-800">{hasAnalysis ? topRecommendation : 'Shown after first run'}</span>
        </p>
        <p>
          <span className="font-medium capitalize text-gray-800">{confidence}</span> confidence{' '}
          <span className="text-gray-300">·</span>{' '}
          {hasAnalysis ? analysis?.recommendations.length ?? 0 : '—'} recommendations
        </p>
      </div>

      <div className="mt-auto pt-1">
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
