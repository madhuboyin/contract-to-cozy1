'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CoverageAnalysisDTO,
  getCoverageAnalysis,
  runCoverageAnalysis,
} from '@/lib/api/coverageAnalysisApi';

type CoverageIntelligenceToolCardProps = {
  propertyId: string;
};

const CARD_BASE =
  'flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5';
const HEADER_ICON_WRAP = 'flex h-7 w-7 items-center justify-center rounded-md bg-slate-100/60';
const HEADER_ICON = 'h-3.5 w-3.5 text-slate-600';
const TITLE_CLASS = 'text-sm font-semibold leading-none text-gray-900';
const BADGE_BASE =
  'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none';
const VALUE_ZONE = 'mt-1 rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5';
const CTA_CLASS =
  'group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50';

function normalizeVerdict(verdict: string): string {
  return verdict
    .split('_')
    .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
    .join(' ');
}

function statusMeta(loading: boolean, analysis: CoverageAnalysisDTO | null, hasAnalysis: boolean) {
  if (loading) {
    return { label: 'Checking', className: 'border-slate-200/80 bg-slate-50/70 text-slate-700' };
  }
  if (!hasAnalysis || !analysis) {
    return { label: 'Not run yet', className: 'border-slate-200/80 bg-slate-50/70 text-slate-700' };
  }
  if (analysis.status === 'STALE') {
    return {
      label: 'Review recommended',
      className: 'border-amber-200/80 bg-amber-50/70 text-amber-700',
    };
  }
  if (analysis.status === 'ERROR') {
    return { label: 'Needs refresh', className: 'border-rose-200/80 bg-rose-50/70 text-rose-700' };
  }
  if (analysis.overallVerdict === 'WORTH_IT') {
    return { label: 'Worth it', className: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-700' };
  }
  if (analysis.overallVerdict === 'SITUATIONAL') {
    return { label: 'Situational', className: 'border-amber-200/80 bg-amber-50/70 text-amber-700' };
  }
  return { label: 'Not worth it', className: 'border-rose-200/80 bg-rose-50/70 text-rose-700' };
}

function primaryInsight(analysis: CoverageAnalysisDTO | null, hasAnalysis: boolean) {
  if (!hasAnalysis || !analysis) {
    return {
      headline: 'Run first assessment',
      detail: 'Generate a combined insurance and warranty readout for this home.',
    };
  }
  if (analysis.status === 'STALE') {
    return {
      headline: 'Refresh coverage assumptions',
      detail: 'Inputs are stale. Re-run to validate today\'s recommendation.',
    };
  }
  if (analysis.status === 'ERROR') {
    return {
      headline: 'Assessment needs refresh',
      detail: 'Re-run to restore an up-to-date coverage decision.',
    };
  }
  return {
    headline: normalizeVerdict(analysis.overallVerdict),
    detail:
      analysis.summary?.trim() ||
      'Coverage guidance is ready with insurance, warranty, and risk tradeoff context.',
  };
}

export default function CoverageIntelligenceToolCard({
  propertyId,
}: CoverageIntelligenceToolCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<CoverageAnalysisDTO | null>(null);

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
        const result = await getCoverageAnalysis(propertyId);
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
    if (!hasAnalysis || !analysis) return 'Run analysis';
    if (analysis.status === 'STALE') return 'Re-run';
    return 'View details';
  }, [analysis, hasAnalysis]);

  const handlePrimaryCta = async () => {
    if (!hasAnalysis || analysis?.status === 'STALE') {
      if (!propertyId) return;

      setRunning(true);
      try {
        const latest = await runCoverageAnalysis(propertyId);
        setHasAnalysis(true);
        setAnalysis(latest);
        router.push(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`);
      } finally {
        setRunning(false);
      }
      return;
    }

    if (propertyId) {
      router.push(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`);
    }
  };

  const status = statusMeta(loading, analysis, hasAnalysis);
  const insight = primaryInsight(analysis, hasAnalysis);
  const confidence = analysis?.confidence ? analysis.confidence.toLowerCase() : '—';
  const nextSteps = analysis?.nextSteps?.length ?? 0;

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={HEADER_ICON_WRAP}>
            <ShieldCheck className={HEADER_ICON} />
          </div>
          <h3 className={TITLE_CLASS}>Coverage Intelligence</h3>
        </div>
        <span className={cn(BADGE_BASE, status.className)}>{status.label}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-gray-500">
        Insurance + warranty coverage assessment.
      </p>

      <div className={VALUE_ZONE}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
            Checking coverage profile…
          </span>
        ) : (
          <div>
            <p className="text-4xl font-display font-semibold leading-tight tracking-tight text-gray-900">{insight.headline}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">{insight.detail}</p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-600">
        <span className="font-medium capitalize text-gray-800">{confidence}</span>
        <span>confidence</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span>{hasAnalysis ? `${nextSteps} next step${nextSteps === 1 ? '' : 's'}` : 'Next steps after first run'}</span>
      </div>

      <div className="mt-auto pt-3">
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
