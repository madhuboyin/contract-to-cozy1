// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/CostVolatilityClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';

import { getCostVolatility, type CostVolatilityDTO } from './costVolatilityApi';
import MiniLineChartPct from './MiniLineChartPct';

function badgeForBand(b?: 'LOW' | 'MEDIUM' | 'HIGH') {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
  if (b === 'HIGH') return <span className={`${base} border-red-200/70 bg-red-50/85 text-red-700`}>High</span>;
  if (b === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium</span>;
  return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>Low</span>;
}

function confidenceBadge(c?: string) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
  if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
}

function eventLabel(t?: string) {
  if (t === 'INSURANCE_SHOCK') return 'Insurance';
  if (t === 'TAX_RESET') return 'Tax';
  if (t === 'CLIMATE_EVENT') return 'Regional';
  return 'Event';
}

function isFiniteNumber(n: any): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export default function CostVolatilityClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CostVolatilityDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reqRef = React.useRef(0);

  async function load(nextYears: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const reqId = ++reqRef.current;
    try {
      const r = await getCostVolatility(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load cost volatility');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Build YoY total chart points with your 10y sampling rule (5 points spaced by 2 years)
  const yoyChart = useMemo(() => {
    const hist = data?.history ?? [];
    if (!hist.length) {
      return { x: ['—', '—'], y: [0, 0] as Array<number | null> };
    }

    if (years === 5) {
      const s = hist.slice(-5);
      return { x: s.map((h) => String(h.year)), y: s.map((h) => h.yoyTotalPct) };
    }

    const ten = hist.slice(-10);
    const sampled = [0, 2, 4, 6, 8].filter((i) => i < ten.length).map((i) => ten[i]);
    return { x: sampled.map((h) => String(h.year)), y: sampled.map((h) => h.yoyTotalPct) };
  }, [data, years]);

  // ✅ Phase-2: show markers only for years visible on the sampled chart (keeps calm + avoids mismatch)
  const chartEvents = useMemo(() => {
    const ev = data?.events || [];
    const shown = new Set(yoyChart.x);
    return ev
      .map((e) => ({ year: String(e.year), type: e.type, description: e.description }))
      .filter((e) => shown.has(e.year));
  }, [data, yoyChart.x]);

  const recentEvents = useMemo(() => {
    const ev = data?.events || [];
    return [...ev].sort((a, b) => a.year - b.year).slice(-8);
  }, [data]);

  // ✅ Patch: avoid “Insurance volatility = 0” when it’s actually “not enough history”
  const insuranceDeltaCount = useMemo(() => {
    const hist = data?.history || [];
    // count non-null yoy insurance points
    return hist.reduce((acc, h) => acc + (isFiniteNumber(h.yoyInsurancePct) ? 1 : 0), 0);
  }, [data]);

  const showInsuranceAsMissing = useMemo(() => {
    const v = data?.index?.insuranceVolatility;
    // If score is exactly 0 and we have <3 delta points, it’s likely “insufficient history”
    return v === 0 && insuranceDeltaCount < 3;
  }, [data, insuranceDeltaCount]);

  // ✅ Patch: year-anchored spikes copy when events exist
  const spikeAnchor = useMemo(() => {
    if (!recentEvents.length) return null;
    const top = recentEvents[recentEvents.length - 1];
    return `In ${top.year}, we flagged a ${eventLabel(top.type).toLowerCase()} event that can increase surprise risk.`;
  }, [recentEvents]);

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <SectionHeader
            icon="📉"
            title="Cost Volatility Index"
            description="Measures how unpredictable your ownership costs are year-to-year."
          />

          <div className="mt-4">
            <HomeToolsRail propertyId={propertyId} />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3 backdrop-blur">
          <div className="flex-1 text-sm text-red-600">{error}</div>
          <button onClick={() => load(years)} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Volatility score (0–100)</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
              Your costs aren’t just rising — they’re unpredictable.
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            <button
              type="button"
              onClick={async () => {
                if (years === 5) return;
                setYears(5);
                await load(5);
              }}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                years === 5
                  ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
              }`}
            >
              5y
            </button>
            <button
              type="button"
              onClick={async () => {
                if (years === 10) return;
                setYears(10);
                await load(10);
              }}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                years === 10
                  ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
              }`}
            >
              10y
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Index</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data?.index?.volatilityIndex ?? '—'}</div>

            <div className="mt-1 flex items-center gap-2">
              {badgeForBand(data?.index?.band)}
              {!!data?.index?.bandLabel && (
                <span className="text-xs text-slate-500 dark:text-slate-300">{data.index.bandLabel}</span>
              )}
            </div>

            {!!data?.index?.dominantDriver && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                Primary driver: <span className="font-medium text-slate-700 dark:text-slate-200">{data.index.dominantDriver}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Insurance volatility</div>

            {/* ✅ Patch: show "—" if insufficient history */}
            <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {showInsuranceAsMissing ? '—' : (data?.index?.insuranceVolatility ?? '—')}
            </div>

            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              {showInsuranceAsMissing ? 'Insufficient renewal history' : 'Std dev of YoY premium changes'}
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Tax volatility</div>
            <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data?.index?.taxVolatility ?? '—'}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">YoY variance + cadence pressure</div>
          </div>

          {/* ✅ Patch: rename ZIP proxy to Phase-2 meaning */}
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Regional sensitivity</div>
            <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data?.index?.zipVolatility ?? '—'}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Pricing environment modifier
              <span
                className="ml-2 underline decoration-dotted cursor-help"
                title="Derived from regional sensitivity signals. Not a direct risk score."
              >
                ?
              </span>
            </div>
          </div>
        </div>

        {/* YoY chart */}
        <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
              Total annual cost YoY change (%)
            </span>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-300">
              {loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}
            </span>
          </div>

          <MiniLineChartPct
            xLabels={yoyChart.x}
            yValues={yoyChart.y}
            events={chartEvents}
            ariaLabel="Total cost YoY change chart"
          />

          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Higher swings = more surprise risk. 10y view is sampled for readability.
          </div>
        </div>

        {/* ✅ Phase-2: calm event chips */}
        {!!recentEvents.length && (
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Years with surprise risk</div>
              <div className="text-xs text-slate-500 dark:text-slate-300">Dots mark flagged years</div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {recentEvents.map((e, idx) => (
                <span
                  key={`${e.year}-${idx}`}
                  className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200"
                  title={e.description}
                >
                  {e.year} <span className="opacity-60">·</span> {eventLabel(e.type)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ✅ Phase-2: why spikes (top 2 drivers) */}
        {!!(data?.drivers?.length ?? 0) && (
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Why volatility spikes here</div>

            {/* ✅ Patch: year anchor when events exist */}
            {!!spikeAnchor && (
              <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {spikeAnchor}
              </div>
            )}

            <div className="mt-2 space-y-2">
              {(data?.drivers || []).slice(0, 2).map((d, idx) => (
                <div key={`${d.factor}-${idx}`} className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{d.factor}:</span> {d.explanation}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ✅ Phase-2: optional AI readiness hook */}
        {!!data?.meta?.aiSummary && (
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Summary</div>
            <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{data.meta.aiSummary.shortExplanation}</div>
            <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{data.meta.aiSummary.riskNarrative}</div>

            {!!data.meta.aiSummary.whatToWatch?.length && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300">What to watch</div>
                <div className="mt-1 space-y-1">
                  {data.meta.aiSummary.whatToWatch.slice(0, 3).map((w, i) => (
                    <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {w}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What’s driving unpredictability</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Ranked by estimated impact.</div>

            {/* ✅ Patch: confidence clarification */}
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Confidence reflects data availability, not volatility severity.
            </div>
          </div>
          <div className="shrink-0">{confidenceBadge(data?.meta?.confidence)}</div>
        </div>

        <div className="mt-4 space-y-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={`${d.factor}-${idx}`} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">{d.impact}</span>
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
          {!loading && !(data?.drivers || []).length && (
            <div className="text-sm text-slate-500 dark:text-slate-300">No drivers available.</div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assumptions & notes</div>
        <div className="mt-2 space-y-1">
          {(data?.meta?.notes || []).map((n, idx) => (
            <div key={idx} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              • {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
