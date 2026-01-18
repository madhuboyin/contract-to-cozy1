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

    try {
      const reqId = ++reqRef.current;
      const r = await getCostVolatility(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to load cost volatility');
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

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="📉"
        title="Cost Volatility Index"
        description="Measures how unpredictable your ownership costs are year-to-year."
      />

      <div className="mt-4">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

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
              className={`text-xs underline ${years === 5 ? 'text-black font-medium' : 'text-black/50 hover:text-black'}`}
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
              className={`text-xs underline ${years === 10 ? 'text-black font-medium' : 'text-black/50 hover:text-black'}`}
            >
              10y
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Index</div>
            <div className="text-2xl font-semibold tabular-nums">{data?.index?.volatilityIndex ?? '—'}</div>
            <div className="mt-1">{badgeForBand(data?.index?.band)}</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Insurance volatility</div>
            <div className="text-xl font-semibold tabular-nums">{data?.index?.insuranceVolatility ?? '—'}</div>
            <div className="text-xs opacity-60 mt-1">Std dev of YoY premium changes</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Tax volatility</div>
            <div className="text-xl font-semibold tabular-nums">{data?.index?.taxVolatility ?? '—'}</div>
            <div className="text-xs opacity-60 mt-1">YoY variance + cadence pressure</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">ZIP proxy</div>
            <div className="text-xl font-semibold tabular-nums">{data?.index?.zipVolatility ?? '—'}</div>
            <div className="text-xs opacity-60 mt-1">Messaging-only modifier</div>
          </div>
        </div>

        {/* YoY chart */}
        <div className="mt-4 rounded-xl border border-black/10 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">
              Total annual cost YoY change (%)
            </span>
            <span className="text-xs opacity-60 ml-auto">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
          </div>

          <MiniLineChartPct xLabels={yoyChart.x} yValues={yoyChart.y} ariaLabel="Total cost YoY change chart" />

          <div className="mt-2 text-xs opacity-60">
            Higher swings = more surprise risk. 10y view is sampled for readability.
          </div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">What’s driving unpredictability</div>
            <div className="text-xs opacity-70 mt-1">Ranked by estimated impact (Phase 1).</div>
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
