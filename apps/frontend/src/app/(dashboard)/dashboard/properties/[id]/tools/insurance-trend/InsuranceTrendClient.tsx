// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import MultiLineChart from './MultiLineChart';
import { getInsuranceTrend, InsuranceCostTrendDTO } from './insuranceTrendApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import { Button } from '@/components/ui/button';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function InsuranceTrendClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsuranceCostTrendDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [trendYears, setTrendYears] = useState<5 | 10>(5);
  const reqRef = React.useRef(0);

  async function getAndSet(years: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const reqId = ++reqRef.current;
    try {
      const r = await getInsuranceTrend(propertyId, { years });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load insurance trend');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    getAndSet(trendYears);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    const hist = data?.history ?? [];
    if (!hist.length) {
      return {
        x: ['—', '—'],
        series: [
          { key: 'premium', label: 'Premium', values: [0, 0], opacity: 0.9, strokeWidth: 2.75 },
          { key: 'state', label: 'State avg', values: [0, 0], opacity: 0.6, dash: '6 5' },
        ],
      };
    }

    if (trendYears === 5) {
      const s = hist.slice(-5);
      return {
        x: s.map((h) => String(h.year)),
        series: [
          { key: 'premium', label: 'Premium', values: s.map((h) => h.annualPremium), opacity: 0.9, strokeWidth: 2.75 },
          { key: 'state', label: 'State avg', values: s.map((h) => h.stateAvgAnnual), opacity: 0.6, dash: '6 5' },
        ],
      };
    }

    // 10y view: all 10 points
    const ten = hist.slice(-10);
    return {
      x: ten.map((h) => String(h.year)),
      series: [
        { key: 'premium', label: 'Premium', values: ten.map((h) => h.annualPremium), opacity: 0.9, strokeWidth: 2.75 },
        { key: 'state', label: 'State avg', values: ten.map((h) => h.stateAvgAnnual), opacity: 0.6, dash: '6 5' },
      ],
    };
  }, [data, trendYears]);

  const confidenceBadge = (c?: string) => {
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
    if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
  };

  const deltaNow = data?.current?.deltaVsStateNow ?? 0;
  const deltaTone =
    deltaNow <= 0
      ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white/75 to-teal-50/70 text-emerald-800'
      : 'border-rose-200/70 bg-gradient-to-br from-rose-50/85 via-white/75 to-amber-50/65 text-rose-800';

  const insurancePriorityAction = (() => {
    if (!data || loading || data.current?.deltaVsStateNow == null) return undefined;
    const delta = data.current.deltaVsStateNow;
    if (delta > 0.02) {
      return {
        title: `Your premium is running ${pct(delta)} above state average`,
        description: 'This drift is worth acting on before your next renewal — shopping alternatives now gives you leverage.',
        impactLabel: `${trendYears}-year premium trend`,
        confidenceLabel: data.meta?.confidence ?? 'Medium',
        primaryAction: (
          <Button type="button" className="w-full sm:w-auto">
            Get insurance quotes
          </Button>
        ),
      };
    }
    if (delta <= 0) {
      return {
        title: `Your premium is tracking ${pct(Math.abs(delta))} below state average`,
        description: 'A healthy signal. Review at renewal to confirm the gap holds — market conditions can shift it.',
        impactLabel: `${trendYears}-year premium trend`,
        confidenceLabel: data.meta?.confidence ?? 'Medium',
        primaryAction: (
          <Button type="button" variant="outline" className="w-full sm:w-auto">
            Get insurance quotes
          </Button>
        ),
      };
    }
    return undefined;
  })();

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Educational Estimate"
      title="Insurance Cost Trend Analyzer"
      subtitle="Directional heuristic only — not decision-grade for major financial planning."
      rail={<HomeToolsRail propertyId={propertyId} context="insurance-trend" currentToolId="insurance-trend" />}
      trust={{
        confidenceLabel: data?.meta?.confidence ?? 'Estimated confidence',
        freshnessLabel: data?.meta?.generatedAt ? 'Updated with latest premium trend inputs' : 'Analyzing your property…',
        sourceLabel: 'Property premium history + state average trend data',
        rationale: 'Shows whether your premium trajectory is tracking above or below state-level pressure.',
      }}
      priorityAction={insurancePriorityAction}
    >

      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Premium growth vs state average</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            <button
              type="button"
              onClick={async () => {
                if (trendYears === 5) return;
                setTrendYears(5);
                await getAndSet(5);
              }}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                trendYears === 5
                  ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
              }`}
            >
              5y
            </button>
            <button
              type="button"
              onClick={async () => {
                if (trendYears === 10) return;
                setTrendYears(10);
                await getAndSet(10);
              }}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                trendYears === 10
                  ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
              }`}
            >
              10y
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3 backdrop-blur">
            <div className="flex-1 text-sm text-red-600">{error}</div>
            <button onClick={() => getAndSet(trendYears)} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
          </div>
        )}

        {data && (() => {
          const delta = data.current?.deltaVsStateNow ?? 0;
          const premium = data.current?.insuranceAnnualNow;
          const stateAvg = data.current?.stateAvgAnnualNow;
          const cagr = data.rollup?.cagrPremium ?? 0;
          const aboveBelow = delta > 0 ? 'above' : 'below';
          const absBelowAmt = money(Math.abs(delta));
          return (
            <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white/72 p-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-100">
              Your estimated premium is <span className="font-semibold">{money(premium)}/yr</span> —{' '}
              <span className={delta > 0 ? 'font-semibold text-rose-700 dark:text-rose-400' : 'font-semibold text-emerald-700 dark:text-emerald-400'}>
                {absBelowAmt} {aboveBelow} the {data.input?.state} average
              </span> of {money(stateAvg)}/yr.{' '}
              Premiums in this area are growing at roughly <span className="font-semibold">{(cagr * 100).toFixed(1)}%/yr</span> — that adds up to{' '}
              <span className="font-semibold">{money(data.rollup?.totalPremiumPaid)}</span> over {trendYears} years.
            </div>
          );
        })()}

        <div className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 p-3 text-xs text-amber-900 backdrop-blur">
          <div className="font-semibold">Educational Estimate — not decision-grade</div>
          <div className="mt-1">
            {data?.meta?.disclaimer ??
              'This output is an educational estimate based on heuristic models. Do not use as a sole input for major financial decisions.'}
          </div>
          {Array.isArray(data?.meta?.usageRestrictions) && data.meta.usageRestrictions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.meta.usageRestrictions.map((restriction, idx) => (
                <li key={idx}>{restriction}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-12 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-4">
            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Current estimated premium</div>
              <div className="mt-1 text-[1.75rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.current?.insuranceAnnualNow)}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-300">Confidence</div>
                {confidenceBadge(data?.meta?.confidence)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual premium growth ({trendYears}y avg)</div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{pct(data?.rollup?.cagrPremium)}</div>

              <div className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">State avg growth</div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{pct(data?.rollup?.cagrStateAvg)}</div>

              {data?.rollup?.cagrPremium != null && data?.rollup?.cagrStateAvg != null && (
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {data.rollup.cagrPremium > data.rollup.cagrStateAvg
                    ? 'Your premium is growing faster than the state average — worth shopping coverage annually.'
                    : 'Your premium growth is tracking at or below the state average.'}
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur ${deltaTone}`}>
              <div className="text-xs uppercase tracking-[0.12em] opacity-80">Delta vs state (now)</div>
              <div className="mt-1 text-2xl font-semibold leading-tight">{money(deltaNow)}</div>
              <div className="mt-1 text-xs opacity-70">
                State baseline: <span className="font-medium">{money(data?.current?.stateAvgAnnualNow)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">Premium</span>
              <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">State avg</span>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-300">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
            </div>

            <div className="text-slate-700 dark:text-slate-200">
              <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Insurance premium trend chart" />
            </div>

            <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
              Premium growth is modeled using state and ZIP-level benchmarks. The state average line shows where your area typically sits.
            </div>
          </div>
        </div>
      </div>

      {/* Rollup cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Total premium paid</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.totalPremiumPaid)}</div>
        </div>
        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">State baseline paid</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.totalStateAvgPaid)}</div>
        </div>
        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Total delta vs state</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.totalDeltaVsState)}</div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Localized drivers</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          Insights are localized to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                  d.impact === 'HIGH'
                    ? 'border-rose-200/70 bg-rose-50/85 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300'
                    : d.impact === 'MEDIUM'
                    ? 'border-amber-200/70 bg-amber-50/85 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-300/70 bg-slate-50/85 text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300'
                }`}>{d.impact}</span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assumptions & methodology</div>
        <div className="mt-3 space-y-2">
          {(data?.meta?.notes || []).map((n, i) => (
            <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="text-xs text-slate-500 dark:text-slate-300">Data sources</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{(data?.meta?.dataSources || []).join(' · ')}</div>
        </div>
      </div>

      {data && (
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What to do next</div>
          <div className="mt-3 space-y-2">
            {(data.current?.deltaVsStateNow ?? 0) > 200 ? (
              <>
                <div className="rounded-xl border border-rose-200/70 bg-rose-50/80 p-3 text-xs text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300">
                  Your estimated premium is meaningfully above the state average. Consider shopping your coverage annually — a 10–15% reduction is often achievable by switching carriers or adjusting deductibles.
                </div>
                <div className="rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
                  Check the <span className="font-medium">Cost Volatility Index</span> to see how unpredictable your total ownership costs are likely to be, and whether building a larger reserve is warranted.
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-3 text-xs text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Your estimated premium is at or below the state average — a good position. Review coverage limits annually to make sure you're not underinsured as your home's value changes.
                </div>
                <div className="rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
                  Use the <span className="font-medium">True Cost of Ownership</span> tool to see how insurance fits into your full annual ownership expense picture.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark premium trend reviewed"
      />
    </ToolWorkspaceTemplate>
  );
}
