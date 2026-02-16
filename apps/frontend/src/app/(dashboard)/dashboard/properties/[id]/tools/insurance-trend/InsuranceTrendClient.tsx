// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/insurance-trend/InsuranceTrendClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';

import MultiLineChart from './MultiLineChart';
import { getInsuranceTrend, InsuranceCostTrendDTO } from './insuranceTrendApi';
import HomeToolsRail from '../../components/HomeToolsRail';

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

    const ten = hist.slice(-10);
    const sampled = [0, 2, 4, 6, 8].filter((i) => i < ten.length).map((i) => ten[i]);
    return {
      x: sampled.map((h) => String(h.year)),
      series: [
        { key: 'premium', label: 'Premium', values: sampled.map((h) => h.annualPremium), opacity: 0.9, strokeWidth: 2.75 },
        { key: 'state', label: 'State avg', values: sampled.map((h) => h.stateAvgAnnual), opacity: 0.6, dash: '6 5' },
      ],
    };
  }, [data, trendYears]);

  const confidenceBadge = (c?: string) => {
    const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
    if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} bg-black/5 text-black/70`}>Estimated</span>;
  };

  const deltaNow = data?.current?.deltaVsStateNow ?? 0;
  const deltaTone =
    deltaNow <= 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-100';

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="🛡️"
        title="Insurance Cost Trend Analyzer"
        description="Insurance premium growth by ZIP, comparison vs state baseline, and climate/claims pressure drivers."
      />
      <div className="mt-4">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Premium growth vs state average</div>
            <div className="text-xs opacity-70 mt-1">
              <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (trendYears === 5) return;
                setTrendYears(5);
                await getAndSet(5);
              }}
              className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${trendYears === 5 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              5y
            </button>
            <span className="text-xs opacity-40">|</span>
            <button
              type="button"
              onClick={async () => {
                if (trendYears === 10) return;
                setTrendYears(10);
                await getAndSet(10);
              }}
              className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${trendYears === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              10y
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
            <div className="text-sm text-red-600 flex-1">{error}</div>
            <button onClick={() => getAndSet(trendYears)} className="text-sm font-medium text-red-700 hover:text-red-900 shrink-0">Retry</button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Current estimated premium</div>
              <div className="text-lg font-semibold">{money(data?.current?.insuranceAnnualNow)}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs opacity-70">Confidence</div>
                {confidenceBadge(data?.meta?.confidence)}
              </div>
            </div>

            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Premium CAGR ({trendYears}y)</div>
              <div className="text-sm font-medium">{pct(data?.rollup?.cagrPremium)}</div>

              <div className="mt-2 text-xs opacity-70">State avg CAGR</div>
              <div className="text-sm font-medium">{pct(data?.rollup?.cagrStateAvg)}</div>
            </div>

            <div className={`rounded-xl border p-3 ${deltaTone}`}>
              <div className="text-xs opacity-80">Delta vs state (now)</div>
              <div className="text-base font-semibold">{money(deltaNow)}</div>
              <div className="text-xs opacity-70 mt-1">
                State baseline: <span className="font-medium">{money(data?.current?.stateAvgAnnualNow)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 rounded-xl border border-black/10 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">Premium</span>
              <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-80">State avg</span>
              <span className="text-xs opacity-60 ml-auto">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
            </div>

            <div className="text-black/70">
              <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Insurance premium trend chart" />
            </div>

            <div className="mt-2 text-xs opacity-60">
              Phase 1: premium growth is modeled; future versions will incorporate DOI rate filings + FEMA/NOAA correlations.
            </div>
          </div>
        </div>
      </div>

      {/* Rollup cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Total premium paid</div>
          <div className="text-xs opacity-70 mt-1">Over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.totalPremiumPaid)}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">State baseline paid</div>
          <div className="text-xs opacity-70 mt-1">Over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.totalStateAvgPaid)}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Total delta vs state</div>
          <div className="text-xs opacity-70 mt-1">Over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.totalDeltaVsState)}</div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Localized drivers</div>
        <div className="text-xs opacity-70 mt-1">
          Phase 1 ties messaging to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{d.factor}</div>
                <span className="text-xs rounded px-2 py-0.5 border border-black/10 bg-black/5">{d.impact}</span>
              </div>
              <div className="text-xs text-black/70 mt-2">{d.explanation}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Assumptions (Phase 1)</div>
        <div className="mt-3 space-y-2">
          {(data?.meta?.notes || []).map((n, i) => (
            <div key={i} className="text-xs text-black/70">• {n}</div>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-black/5 p-3">
          <div className="text-xs opacity-70">Data sources</div>
          <div className="text-xs text-black/70 mt-1">{(data?.meta?.dataSources || []).join(' · ')}</div>
        </div>
      </div>
    </div>
  );
}
