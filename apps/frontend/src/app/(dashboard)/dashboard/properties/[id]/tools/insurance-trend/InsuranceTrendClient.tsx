// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ChevronDown, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react';

import MultiLineChart from './MultiLineChart';
import { getInsuranceTrend, InsuranceCostTrendDTO } from './insuranceTrendApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { insuranceTrendTrust } from '@/lib/trust/trustPresets';
import { track } from '@/lib/analytics/events';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}
function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export default function InsuranceTrendClient({ embedded = false }: { embedded?: boolean }) {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceBackHref = guidanceJourneyId
    ? buildGuidanceOverviewHref({
        propertyId,
        journeyId: guidanceJourneyId,
        stepKey: guidanceStepKey,
        inventoryItemId: searchParams.get('itemId'),
        issueType: searchParams.get('issueType'),
      })
    : null;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsuranceCostTrendDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trendYears, setTrendYears] = useState<5 | 10>(5);
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const reqRef = React.useRef(0);
  const workflowCompletedTrackedRef = React.useRef(false);

  useEffect(() => {
    if (!propertyId || !data || workflowCompletedTrackedRef.current) return;
    workflowCompletedTrackedRef.current = true;
    track('workflow_completed', { tool: 'coverage-intelligence', propertyId });
  }, [propertyId, data]);

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
    track('workflow_started', { tool: 'coverage-intelligence', propertyId, entryPoint: 'direct' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    const hist = data?.history ?? [];
    if (!hist.length) {
      return {
        x: ['—', '—'],
        series: [
          { key: 'premium', label: 'Modeled home estimate', values: [0, 0], opacity: 1, strokeWidth: 3 },
          { key: 'state', label: 'Modeled state baseline', values: [0, 0], opacity: 0.4, dash: '6 5', strokeWidth: 1.5 },
        ],
      };
    }
    const slice = trendYears === 5 ? hist.slice(-5) : hist.slice(-10);
    return {
      x: slice.map((h) => String(h.year)),
      series: [
        { key: 'premium', label: 'Modeled home estimate', values: slice.map((h) => h.annualPremium), opacity: 1, strokeWidth: 3 },
        { key: 'state', label: 'Modeled state baseline', values: slice.map((h) => h.stateAvgAnnual), opacity: 0.4, dash: '6 5', strokeWidth: 1.5 },
      ],
    };
  }, [data, trendYears]);

  // Derived values
  const deltaNow = data?.current?.deltaVsStateNow ?? 0;
  const isAboveModeledBaseline = deltaNow > 100;
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
      embedded={embedded}
      backHref={
        guidanceBackHref
          ? guidanceBackHref
          : searchParams.get('from') === 'coverage-intelligence'
          ? `/dashboard/properties/${propertyId}/tools/coverage-intelligence`
          : `/dashboard/properties/${propertyId}`
      }
      backLabel={
        guidanceBackHref
          ? 'Back to guidance'
          : searchParams.get('from') === 'coverage-intelligence'
          ? 'Back to Coverage Intelligence'
          : 'Back to property'
      }
      eyebrow="Estimate"
      title="Insurance Cost Trend"
      subtitle="Based on local trends — not your actual policy data."
      introAction={embedded ? undefined : (
        /* Mobile-only Home tools trigger — hidden on desktop */
        <HomeToolsRail
          propertyId={propertyId}
          context="insurance-trend"
          currentToolId="insurance-trend"
          showDesktop={false}
        />
      )}
      trust={insuranceTrendTrust({
        confidenceLabel: data?.meta?.confidence ?? 'Heuristic estimate — confidence reflects local trend data quality.',
        freshnessLabel: data?.meta?.generatedAt ? 'Updated with latest local trend data' : 'Analyzing your property…',
      })}
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

      {/* ── Tool identity + Related tools — desktop only, above NBA ──── */}
      {!embedded ? (
        <HomeToolHeader
          toolId="coverage-intelligence"
          propertyId={propertyId}
          context="coverage-intelligence"
          currentToolId="coverage-intelligence"
        />
      ) : null}

      {/* ── Hero: Next Best Action — 2-column on desktop ────────────────── */}
      {loading && !data ? (
        <div className="animate-pulse rounded-[20px] border border-slate-100 bg-slate-50 h-[160px] dark:border-slate-700/50 dark:bg-slate-900/40" />
      ) : data ? (
        <section
          aria-label="Next best action"
          className="rounded-[20px] border border-[hsl(var(--mobile-border-subtle))] bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.10),transparent_55%),white] p-5 shadow-[0_4px_20px_rgba(15,23,42,0.07)] dark:border-slate-700/70 dark:bg-slate-900/70 md:p-6"
        >
          <p className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold tracking-normal text-teal-700 dark:text-teal-400">
            <Sparkles className="h-3.5 w-3.5" />
            Next Best Action
          </p>

          {/* 2-col on lg: left = NBA content, right = delta summary panel */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-8">

            {/* Left column — headline, description, chips, horizontal CTA row */}
            <div className="space-y-3.5">
              <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100 md:text-[1.25rem]">
                {isAboveModeledBaseline
                  ? `The modeled estimate is ${money(deltaNow)} above its state baseline`
                  : deltaNow <= 0
                  ? `The modeled estimate is ${money(Math.abs(deltaNow))} below its state baseline`
                  : `The modeled estimate is close to its state baseline`
                }
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                This is regional context generated from property and state assumptions. It is not a
                quote, a coverage-equivalent comparison, or evidence of what you paid.
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
              </div>
              {/* Horizontal CTA row */}
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <a
                  href="#why-costs"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(15,23,42,0.20)] transition-all hover:-translate-y-px hover:bg-slate-700 hover:shadow-[0_4px_14px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Review modeled factors
                </a>
              </div>
            </div>

            {/* Right column — supporting panel, desktop only */}
            {isAboveModeledBaseline ? (
              <div className="hidden lg:flex lg:flex-col lg:justify-center lg:rounded-2xl lg:border lg:border-amber-200/60 lg:bg-amber-50/40 lg:px-5 lg:py-5 dark:lg:border-amber-700/40 dark:lg:bg-amber-950/20">
                <div className="text-[11px] font-semibold tracking-normal text-slate-500 dark:text-slate-400">
                  Modeled difference
                </div>
                <div className="mt-1.5 text-[1.75rem] font-semibold leading-none tabular-nums text-amber-800 dark:text-amber-300">
                  {money(deltaNow)} <span className="text-base font-medium">above</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  not an observed policy cost
                </div>
              </div>
            ) : (
              <div className="hidden lg:flex lg:flex-col lg:justify-center lg:rounded-2xl lg:border lg:border-emerald-200/60 lg:bg-emerald-50/40 lg:px-5 lg:py-5 dark:lg:border-emerald-700/40 dark:lg:bg-emerald-950/20">
                <div className="text-[11px] font-semibold tracking-normal text-slate-500 dark:text-slate-400">
                  vs local average
                </div>
                <div className="mt-1.5 text-[1.75rem] font-semibold leading-none tabular-nums text-emerald-800 dark:text-emerald-300">
                  {money(Math.abs(deltaNow))} <span className="text-base font-medium">below</span>
                </div>
                <div className="mt-4 border-t border-emerald-200/50 pt-4 dark:border-emerald-700/30">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Modeled below baseline</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Not a coverage or price verdict
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
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Modeled annual estimate</div>
            <div className="mt-2 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {data ? money(data.current?.insuranceAnnualNow) : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">per year</span>
              {data?.meta?.confidence && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
              {deltaNow > 0 ? 'Modeled difference above baseline' : 'Modeled difference below baseline'}
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
              {deltaNow > 0 ? '↑ modeled above baseline' : '↓ modeled below baseline'}
            </div>
          </div>
        </div>

        {/* Premium trend chart — full-width, premium */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Modeled regional trend
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
              ariaLabel="Modeled insurance cost trend and state baseline chart"
              gapFill
              annotation={isAboveModeledBaseline && deltaNow > 0 ? `+${money(deltaNow)} vs modeled baseline` : undefined}
            />
          </div>

          {/* Chart footer: growth context */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100/80 pt-4 dark:border-slate-700/40">
            {data?.rollup?.cagrPremium != null && data?.rollup?.cagrStateAvg != null && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Modeled home growth:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{pct(data.rollup.cagrPremium)}/yr</span>
                {' · '}
                Modeled state growth:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{pct(data.rollup.cagrStateAvg)}/yr</span>
                {data.rollup.cagrPremium > data.rollup.cagrStateAvg && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400">· Modeled faster than baseline</span>
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
              Modeled home total · {trendYears}y
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
              {money(data?.rollup?.totalPremiumPaid)}
            </div>
          </div>

          <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Modeled state baseline · {trendYears}y
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
                Modeled cumulative difference · {trendYears}y
              </div>
              {(data?.rollup?.totalDeltaVsState ?? 0) > 0 && (
                <span className="shrink-0 rounded-full border border-amber-200/70 bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/50 dark:text-amber-300">
                  estimate
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
                not observed payments or savings
              </p>
            )}
          </div>
        </div>

        {/* What's driving your premium */}
        {allDrivers.length > 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.06)] dark:border-slate-700/70 dark:bg-slate-900/60">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Factors used in this model
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
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
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
            isAboveModeledBaseline
              ? 'border-teal-200/70 bg-gradient-to-br from-teal-50/60 to-white dark:border-teal-800/50 dark:from-teal-950/30 dark:to-slate-900/60'
              : 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/60 to-white dark:border-emerald-800/50 dark:from-emerald-950/30 dark:to-slate-900/60'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isAboveModeledBaseline
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              }`}>
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                  Review the controlling policy before making a cost or coverage decision
                </h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Regional models cannot determine whether a policy is fairly priced or whether options
              provide equivalent protection. Confirm premium, deductible, limits, exclusions, and
              endorsements from policy documents or with a licensed insurance professional.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href={`/dashboard/properties/${propertyId}/tools/true-cost`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-px hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300"
              >
                View full ownership cost →
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
                <p className="text-[11px] font-semibold tracking-normal text-slate-400 dark:text-slate-500">
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
