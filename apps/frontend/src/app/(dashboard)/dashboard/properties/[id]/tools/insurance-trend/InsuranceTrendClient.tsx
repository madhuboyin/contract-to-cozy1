// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ChevronDown, Sparkles, TrendingDown, TrendingUp, ShieldCheck } from 'lucide-react';

import MultiLineChart from './MultiLineChart';
import { getInsuranceTrend, InsuranceCostTrendDTO } from './insuranceTrendApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
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
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
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
          { key: 'premium', label: 'Your premium', values: [0, 0], opacity: 1, strokeWidth: 3 },
          { key: 'state', label: 'Local average', values: [0, 0], opacity: 0.4, dash: '6 5', strokeWidth: 1.5 },
        ],
      };
    }
    const slice = trendYears === 5 ? hist.slice(-5) : hist.slice(-10);
    return {
      x: slice.map((h) => String(h.year)),
      series: [
        { key: 'premium', label: 'Your premium', values: slice.map((h) => h.annualPremium), opacity: 1, strokeWidth: 3 },
        { key: 'state', label: 'Local average', values: slice.map((h) => h.stateAvgAnnual), opacity: 0.4, dash: '6 5', strokeWidth: 1.5 },
      ],
    };
  }, [data, trendYears]);

  // Derived values
  const deltaNow = data?.current?.deltaVsStateNow ?? 0;
  const isOverpaying = deltaNow > 100;
  const allDrivers = data?.drivers ?? [];
  const visibleDrivers = showAllDrivers ? allDrivers : allDrivers.slice(0, 3);

  const confidenceText = (() => {
    const c = data?.meta?.confidence;
    if (c === 'HIGH') return 'High confidence · Based on local trends';
    if (c === 'LOW') return 'Low confidence · Limited local data';
    return 'Medium confidence · Based on local trends';
  })();

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Estimate"
      title="Insurance Cost Trend"
      subtitle="Based on local trends — not your actual policy data."
      introAction={
        /* Mobile-only Home Tools trigger — hidden on desktop */
        <HomeToolsRail
          propertyId={propertyId}
          context="insurance-trend"
          currentToolId="insurance-trend"
          showDesktop={false}
        />
      }
      trust={{
        confidenceLabel: data?.meta?.confidence ?? 'Estimated confidence',
        freshnessLabel: data?.meta?.generatedAt ? 'Updated with latest local trend data' : 'Analyzing your property…',
        sourceLabel: 'Property profile · State premium data · Local benchmarks',
        rationale: 'Shows whether your estimated premium tracks above or below similar homes in your area.',
      }}
    >

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => getAndSet(trendYears)}
            className="ml-4 shrink-0 font-medium underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Tool identity + Related Tools — desktop only, above NBA ──── */}
      <HomeToolHeader
        toolId="insurance-trend"
        propertyId={propertyId}
        context="insurance-trend"
        currentToolId="insurance-trend"
      />

      {/* ── Hero: Next Best Action — 2-column on desktop ────────────────── */}
      {loading && !data ? (
        <div className="animate-pulse rounded-[20px] border border-slate-100 bg-slate-50 h-[160px] dark:border-slate-700/50 dark:bg-slate-900/40" />
      ) : data ? (
        <section
          aria-label="Next best action"
          className="rounded-[20px] border border-[hsl(var(--mobile-border-subtle))] bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.10),transparent_55%),white] p-5 shadow-[0_4px_20px_rgba(15,23,42,0.07)] dark:border-slate-700/70 dark:bg-slate-900/70 md:p-6"
        >
          <p className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-teal-700 dark:text-teal-400">
            <Sparkles className="h-3.5 w-3.5" />
            Next Best Action
          </p>

          {/* 2-col on lg: left = NBA content, right = delta summary panel */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-8">

            {/* Left column — headline, description, chips, horizontal CTA row */}
            <div className="space-y-3.5">
              <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100 md:text-[1.25rem]">
                {isOverpaying
                  ? `You may be paying ${money(deltaNow)} more than similar homes`
                  : deltaNow <= 0
                  ? `Your premium is ${money(Math.abs(deltaNow))} below the local average`
                  : `Your premium is close to the local average`
                }
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {isOverpaying
                  ? `Your estimated premium is above the local average for ${data.input?.state ?? 'your area'}. Comparing coverage options now gives you leverage before renewal.`
                  : `A healthy position. Review coverage limits at renewal to make sure protection keeps pace with your home's current value.`
                }
              </p>
              {/* Chips */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 dark:border-teal-700/50 dark:bg-teal-950/30 dark:text-teal-300">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {trendYears}-year trend
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  {confidenceText}
                </span>
                {isOverpaying && (
                  <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                    Potential savings: 10–15%
                  </span>
                )}
              </div>
              {/* Horizontal CTA row */}
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <a
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(15,23,42,0.20)] transition-all hover:-translate-y-px hover:bg-slate-700 hover:shadow-[0_4px_14px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Compare Quotes
                </a>
                {isOverpaying && (
                  <a
                    href="#why-costs"
                    className="text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Why costs are rising →
                  </a>
                )}
              </div>
            </div>

            {/* Right column — supporting panel, desktop only */}
            {isOverpaying ? (
              <div className="hidden lg:flex lg:flex-col lg:justify-center lg:rounded-2xl lg:border lg:border-emerald-200/60 lg:bg-emerald-50/40 lg:px-5 lg:py-5 dark:lg:border-emerald-700/40 dark:lg:bg-emerald-950/20">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Potential savings
                </div>
                <div className="mt-1.5 text-[2rem] font-bold leading-none text-slate-800 dark:text-slate-200">
                  10–15%
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  by comparing carriers
                </div>
              </div>
            ) : (
              <div className="hidden lg:flex lg:flex-col lg:justify-center lg:rounded-2xl lg:border lg:border-emerald-200/60 lg:bg-emerald-50/40 lg:px-5 lg:py-5 dark:lg:border-emerald-700/40 dark:lg:bg-emerald-950/20">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  vs local average
                </div>
                <div className="mt-1.5 text-[1.75rem] font-semibold leading-none tabular-nums text-emerald-800 dark:text-emerald-300">
                  {money(Math.abs(deltaNow))} <span className="text-base font-medium">below</span>
                </div>
                <div className="mt-4 border-t border-emerald-200/50 pt-4 dark:border-emerald-700/30">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Well-positioned</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Below the local average
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* ── Zone B: Why your costs may differ ─────────────────────────── */}
      <section id="why-costs" aria-label="Why your costs may differ" className="space-y-5">

        {/* 3 Summary metric cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          {/* Card 1 — Estimated premium */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Your estimated premium</div>
            <div className="mt-2 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {data ? money(data.current?.insuranceAnnualNow) : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">per year</span>
              {data?.meta?.confidence && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  data.meta.confidence === 'HIGH'
                    ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                }`}>
                  {data.meta.confidence === 'HIGH' ? 'High confidence' : data.meta.confidence === 'MEDIUM' ? 'Medium confidence' : 'Estimated'}
                </span>
              )}
            </div>
          </div>

          {/* Card 2 — Typical local cost */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Typical for your area</div>
            <div className="mt-2 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {data ? money(data.current?.stateAvgAnnualNow) : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </div>
            <div className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">
              {data?.input?.state ?? 'state'} average / year
            </div>
          </div>

          {/* Card 3 — Gap */}
          <div className={`rounded-2xl border p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ${
            deltaNow > 0
              ? 'border-amber-200/80 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/25'
              : 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/25'
          }`}>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {deltaNow > 0 ? 'Extra vs local average' : 'Under local average by'}
            </div>
            <div className={`mt-2 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums ${
              deltaNow > 0
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-emerald-800 dark:text-emerald-300'
            }`}>
              {data ? money(Math.abs(deltaNow)) : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </div>
            <div className={`mt-2.5 text-xs font-medium ${
              deltaNow > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {deltaNow > 0 ? '↑ above local average' : '↓ below local average'}
            </div>
          </div>
        </div>

        {/* Premium trend chart — full-width, premium */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Premium trend vs local average
              </h3>
              {data?.input?.addressLabel && (
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{data.input.addressLabel}</p>
              )}
            </div>

            {/* 5y / 10y toggle */}
            <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 p-1 dark:border-slate-700/70 dark:bg-slate-900/60">
              {([5, 10] as const).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={async () => {
                    if (trendYears === y) return;
                    setTrendYears(y);
                    await getAndSet(y);
                  }}
                  aria-pressed={trendYears === y}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-4 text-sm font-medium transition-all touch-manipulation ${
                    trendYears === y
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  {y}y
                </button>
              ))}
            </div>
          </div>

          <div className="text-slate-700 dark:text-slate-300">
            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              ariaLabel="Insurance premium trend vs local average chart"
              gapFill
              annotation={isOverpaying && deltaNow > 0 ? `+${money(deltaNow)} vs local avg` : undefined}
            />
          </div>

          {/* Chart footer: growth context */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100/80 pt-4 dark:border-slate-700/40">
            {data?.rollup?.cagrPremium != null && data?.rollup?.cagrStateAvg != null && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Your growth:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{pct(data.rollup.cagrPremium)}/yr</span>
                {' · '}
                Local avg:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{pct(data.rollup.cagrStateAvg)}/yr</span>
                {data.rollup.cagrPremium > data.rollup.cagrStateAvg && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400">· Growing faster than local</span>
                )}
              </p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {loading ? 'Refreshing…' : 'Modeled from regional data · Not your actual policy'}
            </p>
          </div>
        </div>

        {/* Financial impact rollup — 3 cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Total paid over {trendYears}y
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {money(data?.rollup?.totalPremiumPaid)}
            </div>
          </div>

          <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Typical local cost · {trendYears}y
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {money(data?.rollup?.totalStateAvgPaid)}
            </div>
          </div>

          <div className={`group rounded-2xl border p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${
            (data?.rollup?.totalDeltaVsState ?? 0) > 0
              ? 'border-amber-200/80 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/25'
              : 'border-slate-200/80 bg-white dark:border-slate-700/70 dark:bg-slate-900/60'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Extra paid over {trendYears}y
              </div>
              {(data?.rollup?.totalDeltaVsState ?? 0) > 0 && (
                <span className="shrink-0 rounded-full border border-amber-200/70 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/50 dark:text-amber-300">
                  opportunity
                </span>
              )}
            </div>
            <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${
              (data?.rollup?.totalDeltaVsState ?? 0) > 0
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-slate-900 dark:text-slate-100'
            }`}>
              {money(data?.rollup?.totalDeltaVsState)}
            </div>
            {(data?.rollup?.totalDeltaVsState ?? 0) > 0 && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                vs. paying the local average
              </p>
            )}
          </div>
        </div>

        {/* What's driving your premium */}
        {allDrivers.length > 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              What&apos;s driving your premium
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Local area factors for {data?.input?.state ?? '—'} · {data?.input?.zipCode ?? '—'}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {visibleDrivers.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition-colors hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/48 dark:hover:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      d.impact === 'HIGH'
                        ? 'border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
                        : d.impact === 'MEDIUM'
                        ? 'border-slate-200/70 bg-white text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300'
                        : 'border-slate-200/70 bg-white text-slate-400 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-500'
                    }`}>
                      {d.impact === 'HIGH' ? '↑ High impact' : d.impact === 'MEDIUM' ? 'Medium' : 'Low'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-[1.6] text-slate-600 dark:text-slate-300">
                    {d.explanation}
                  </p>
                  {d.impact === 'HIGH' && (
                    <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-700/50">
                      <a
                        href="#"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-teal-700 underline-offset-2 transition-colors hover:text-teal-900 hover:underline dark:text-teal-400 dark:hover:text-teal-300"
                      >
                        Compare coverage options →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {allDrivers.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllDrivers((v) => !v)}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline dark:text-slate-400"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showAllDrivers ? 'rotate-180' : ''}`} />
                {showAllDrivers ? 'Show fewer factors' : `View all ${allDrivers.length} factors`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Zone C: Your next step ─────────────────────────────────────── */}
      {data && (
        <section aria-label="Your next step">
          <div className={`rounded-2xl border p-6 ${
            isOverpaying
              ? 'border-teal-200/70 bg-gradient-to-br from-teal-50/60 to-white dark:border-teal-800/50 dark:from-teal-950/30 dark:to-slate-900/60'
              : 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/60 to-white dark:border-emerald-800/50 dark:from-emerald-950/30 dark:to-slate-900/60'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isOverpaying
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              }`}>
                {isOverpaying
                  ? <TrendingDown className="h-5 w-5" />
                  : <ShieldCheck className="h-5 w-5" />
                }
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                  {isOverpaying
                    ? 'A 10–15% reduction may be within reach'
                    : 'Your premium is well-positioned'}
                </h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {isOverpaying
                ? 'Switching carriers or adjusting your deductible can often close the gap against the local average — the sooner you compare, the more leverage you have before your next renewal.'
                : "You're at or below the local average — a strong position. Review your coverage limits annually to make sure protection keeps pace with your home's current value."}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-px hover:bg-slate-700 hover:shadow-[0_6px_18px_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Compare Quotes
              </a>
              <a
                href={`/dashboard/properties/${propertyId}/tools/true-cost`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-px hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300"
              >
                {isOverpaying ? 'View full ownership cost →' : 'Review savings opportunities →'}
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ── How this estimate works — collapsible ─────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-slate-700/70 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setMethodologyOpen((v) => !v)}
          aria-expanded={methodologyOpen}
          className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/20 dark:hover:bg-slate-900/80"
        >
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              How this estimate works
            </span>
            {!methodologyOpen && (
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Uses home profile + local trends. Not actual carrier quotes.
              </p>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${methodologyOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {methodologyOpen && (
          <div className="border-t border-slate-100 px-4 pb-5 pt-4 dark:border-slate-700/50">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {data?.meta?.disclaimer ??
                'This estimate is based on your property profile and regional trend data. It is not derived from carrier quotes or your actual policy records. Use as a directional signal, not a financial decision tool.'}
            </p>

            {(data?.meta?.notes?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-1.5">
                {data!.meta!.notes!.map((n, i) => (
                  <li key={i} className="text-xs text-slate-500 dark:text-slate-400">• {n}</li>
                ))}
              </ul>
            )}

            {Array.isArray(data?.meta?.usageRestrictions) && data!.meta!.usageRestrictions.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {data!.meta!.usageRestrictions.map((r, i) => (
                  <li key={i} className="text-xs text-slate-400 dark:text-slate-500">• {r}</li>
                ))}
              </ul>
            )}

            {(data?.meta?.dataSources?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700/50 dark:bg-slate-900/48">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Data sources
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {data!.meta!.dataSources!.join(' · ')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark premium trend reviewed"
      />
    </ToolWorkspaceTemplate>
  );
}
