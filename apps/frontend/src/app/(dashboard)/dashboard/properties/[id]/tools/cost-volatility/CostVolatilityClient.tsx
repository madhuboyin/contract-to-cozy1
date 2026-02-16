// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/CostVolatilityClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';

import { getCostVolatility, type CostVolatilityDTO } from './costVolatilityApi';
import MiniLineChartPct from './MiniLineChartPct';

function badgeForBand(b?: 'LOW' | 'MEDIUM' | 'HIGH') {
  const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
  if (b === 'HIGH') return <span className={`${base} bg-red-50 text-red-700`}>High</span>;
  if (b === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium</span>;
  return <span className={`${base} bg-emerald-50 text-emerald-700`}>Low</span>;
}

function confidenceBadge(c?: string) {
  const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
  if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} bg-black/5 text-black/70`}>Estimated</span>;
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
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="📉"
        title="Cost Volatility Index"
        description="Measures how unpredictable your ownership costs are year-to-year."
      />

      <div className="mt-4">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <div className="text-sm text-red-600 flex-1">{error}</div>
          <button onClick={() => load(years)} className="text-sm font-medium text-red-700 hover:text-red-900 shrink-0">Retry</button>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Volatility score (0–100)</div>
            <div className="text-xs opacity-70 mt-1">
              <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
            <div className="mt-2 text-xs opacity-70">
              Your costs aren’t just rising — they’re unpredictable.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (years === 5) return;
                setYears(5);
                await load(5);
              }}
              className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${years === 5 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              5y
            </button>
            <span className="text-xs opacity-40">|</span>
            <button
              type="button"
              onClick={async () => {
                if (years === 10) return;
                setYears(10);
                await load(10);
              }}
              className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${years === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              10y
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Index</div>
            <div className="text-2xl font-semibold tabular-nums">{data?.index?.volatilityIndex ?? '—'}</div>

            <div className="mt-1 flex items-center gap-2">
              {badgeForBand(data?.index?.band)}
              {!!data?.index?.bandLabel && (
                <span className="text-xs opacity-60">{data.index.bandLabel}</span>
              )}
            </div>

            {!!data?.index?.dominantDriver && (
              <div className="mt-2 text-xs opacity-60">
                Primary driver: <span className="font-medium text-black/70">{data.index.dominantDriver}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Insurance volatility</div>

            {/* ✅ Patch: show "—" if insufficient history */}
            <div className="text-xl font-semibold tabular-nums">
              {showInsuranceAsMissing ? '—' : (data?.index?.insuranceVolatility ?? '—')}
            </div>

            <div className="text-xs opacity-60 mt-1">
              {showInsuranceAsMissing ? 'Insufficient renewal history' : 'Std dev of YoY premium changes'}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Tax volatility</div>
            <div className="text-xl font-semibold tabular-nums">{data?.index?.taxVolatility ?? '—'}</div>
            <div className="text-xs opacity-60 mt-1">YoY variance + cadence pressure</div>
          </div>

          {/* ✅ Patch: rename ZIP proxy to Phase-2 meaning */}
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Regional sensitivity</div>
            <div className="text-xl font-semibold tabular-nums">{data?.index?.zipVolatility ?? '—'}</div>
            <div className="text-xs opacity-60 mt-1">
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
        <div className="mt-4 rounded-xl border border-black/10 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">
              Total annual cost YoY change (%)
            </span>
            <span className="text-xs opacity-60 ml-auto">
              {loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}
            </span>
          </div>

          <MiniLineChartPct
            xLabels={yoyChart.x}
            yValues={yoyChart.y}
            events={chartEvents}
            ariaLabel="Total cost YoY change chart"
          />

          <div className="mt-2 text-xs opacity-60">
            Higher swings = more surprise risk. 10y view is sampled for readability.
          </div>
        </div>

        {/* ✅ Phase-2: calm event chips */}
        {!!recentEvents.length && (
          <div className="mt-4 rounded-xl border border-black/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Years with surprise risk</div>
              <div className="text-xs opacity-60">Dots mark flagged years</div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {recentEvents.map((e, idx) => (
                <span
                  key={`${e.year}-${idx}`}
                  className="text-xs rounded-full border border-black/10 bg-white px-2 py-0.5"
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
          <div className="mt-4 rounded-xl border border-black/10 p-3">
            <div className="text-sm font-medium">Why volatility spikes here</div>

            {/* ✅ Patch: year anchor when events exist */}
            {!!spikeAnchor && (
              <div className="mt-2 text-xs text-black/70 leading-5">
                {spikeAnchor}
              </div>
            )}

            <div className="mt-2 space-y-2">
              {(data?.drivers || []).slice(0, 2).map((d, idx) => (
                <div key={`${d.factor}-${idx}`} className="text-xs text-black/70 leading-5">
                  <span className="font-medium text-black/80">{d.factor}:</span> {d.explanation}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ✅ Phase-2: optional AI readiness hook */}
        {!!data?.meta?.aiSummary && (
          <div className="mt-4 rounded-xl bg-black/5 p-3">
            <div className="text-xs font-medium text-black/70">Summary</div>
            <div className="mt-2 text-xs text-black/70 leading-5">{data.meta.aiSummary.shortExplanation}</div>
            <div className="mt-2 text-xs text-black/70 leading-5">{data.meta.aiSummary.riskNarrative}</div>

            {!!data.meta.aiSummary.whatToWatch?.length && (
              <div className="mt-2">
                <div className="text-[11px] uppercase tracking-wide text-black/60">What to watch</div>
                <div className="mt-1 space-y-1">
                  {data.meta.aiSummary.whatToWatch.slice(0, 3).map((w, i) => (
                    <div key={i} className="text-xs text-black/70">• {w}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">What’s driving unpredictability</div>
            <div className="text-xs opacity-70 mt-1">Ranked by estimated impact.</div>

            {/* ✅ Patch: confidence clarification */}
            <div className="text-xs opacity-60 mt-1">
              Confidence reflects data availability, not volatility severity.
            </div>
          </div>
          <div className="shrink-0">{confidenceBadge(data?.meta?.confidence)}</div>
        </div>

        <div className="mt-4 space-y-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={`${d.factor}-${idx}`} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">{d.factor}</div>
                <span className="text-xs rounded px-2 py-0.5 border border-black/10 bg-white">{d.impact}</span>
              </div>
              <div className="text-sm text-black/70 mt-1 leading-6">{d.explanation}</div>
            </div>
          ))}
          {!loading && !(data?.drivers || []).length && (
            <div className="text-sm text-black/60">No drivers available.</div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Assumptions & notes</div>
        <div className="mt-2 space-y-1">
          {(data?.meta?.notes || []).map((n, idx) => (
            <div key={idx} className="text-sm text-black/70 leading-6">
              • {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
