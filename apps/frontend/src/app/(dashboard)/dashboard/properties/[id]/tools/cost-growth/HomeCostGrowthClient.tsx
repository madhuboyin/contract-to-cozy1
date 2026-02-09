// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-growth/HomeCostGrowthClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';

import MultiLineChart from './MultiLineChart';
import { getHomeCostGrowth, HomeCostGrowthDTO } from './costGrowthApi';
import HomeToolsRail from '../../components/HomeToolsRail';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function HomeCostGrowthClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HomeCostGrowthDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [trendYears, setTrendYears] = useState<5 | 10>(5);
  const reqRef = React.useRef(0);

  async function getAndSet(years: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const r = await getHomeCostGrowth(propertyId, { years });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cost growth estimate');
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
          { key: 'homeValue', label: 'Home value', values: [0, 0], opacity: 0.9, strokeWidth: 2.75 },
          { key: 'expenses', label: 'Total expenses', values: [0, 0], opacity: 0.65, dash: '6 5' },
          { key: 'net', label: 'Net', values: [0, 0], opacity: 0.45, dash: '2 4' },
        ],
      };
    }

    if (trendYears === 5) {
      const s = hist.slice(-5);
      return {
        x: s.map((h) => String(h.year)),
        series: [
          { key: 'homeValue', label: 'Home value', values: s.map((h) => h.homeValue), opacity: 0.9, strokeWidth: 2.75 },
          { key: 'expenses', label: 'Total expenses', values: s.map((h) => h.annualExpenses), opacity: 0.65, dash: '6 5' },
          { key: 'net', label: 'Net Δ (gain - expenses)', values: s.map((h) => h.netDelta), opacity: 0.45, dash: '2 4' },
        ],
      };
    }

    // 10y view: sample 5 points (every ~2y), matching PropertyTaxClient behavior
    const ten = hist.slice(-10);
    const sampled = [0, 2, 4, 6, 8].filter((i) => i < ten.length).map((i) => ten[i]);

    return {
      x: sampled.map((h) => String(h.year)),
      series: [
        { key: 'homeValue', label: 'Home value', values: sampled.map((h) => h.homeValue), opacity: 0.9, strokeWidth: 2.75 },
        { key: 'expenses', label: 'Total expenses', values: sampled.map((h) => h.annualExpenses), opacity: 0.65, dash: '6 5' },
        { key: 'net', label: 'Net Δ (gain - expenses)', values: sampled.map((h) => h.netDelta), opacity: 0.45, dash: '2 4' },
      ],
    };
  }, [data, trendYears]);

  const confidenceBadge = (c?: string) => {
    const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
    if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} bg-black/5 text-black/70`}>Estimated</span>;
  };

  const netTone =
    (data?.rollup?.totalNet ?? 0) >= 0
      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
      : 'bg-rose-50 text-rose-800 border-rose-100';

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="📈"
        title="Home Cost Growth Analyzer"
        description="Compare appreciation vs ownership expense growth to understand your net cost trend over time."
      />
      <div className="mt-3">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      {/* Main Story Card */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Appreciation vs Expenses</div>
            <div className="text-xs opacity-70 mt-1">
              Property-scoped estimate for <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
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
              className={`text-xs underline ${trendYears === 5 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
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
              className={`text-xs underline ${trendYears === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              10y
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mt-3">{error}</div>}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: summary */}
          <div className="lg:col-span-4 space-y-3">
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Current estimated home value</div>
              <div className="text-lg font-semibold">{money(data?.current?.homeValueNow)}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs opacity-70">Confidence</div>
                {confidenceBadge(data?.meta?.confidence)}
              </div>
            </div>

            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">CAGR appreciation ({trendYears}y)</div>
              <div className="text-sm font-medium">{pct(data?.current?.appreciationRate)}</div>

              <div className="mt-2 text-xs opacity-70">Annual expenses (now)</div>
              <div className="text-sm font-medium">{money(data?.current?.annualExpensesNow)}</div>
            </div>

            <div className={`rounded-xl border p-3 ${netTone}`}>
              <div className="text-xs opacity-80">Net impact ({trendYears}y)</div>
              <div className="text-base font-semibold">{money(data?.rollup?.totalNet)}</div>
              <div className="text-xs opacity-70 mt-1">
                Appreciation gain <span className="font-medium">{money(data?.rollup?.totalAppreciationGain)}</span> minus expenses{' '}
                <span className="font-medium">{money(data?.rollup?.totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Right: chart */}
          <div className="lg:col-span-8 rounded-xl border border-black/10 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">Home value</span>
              <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-80">Total expenses</span>
              <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-70">Net Δ</span>
              <span className="text-xs opacity-60 ml-auto">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
            </div>

            <div className="text-black/70">
              <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Home value vs expenses trend" />
            </div>

            <div className="mt-2 text-xs opacity-60">
              Net Δ is year-over-year appreciation gain minus annual expenses (tax + insurance + maintenance).
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Taxes</div>
          <div className="text-xs opacity-70 mt-1">Total over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.expenseBreakdown?.taxes)}</div>
          <div className="text-xs opacity-60 mt-2">Current annual tax</div>
          <div className="text-sm font-medium">{money(data?.current?.annualTaxNow)}</div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Insurance</div>
          <div className="text-xs opacity-70 mt-1">Total over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.expenseBreakdown?.insurance)}</div>
          <div className="text-xs opacity-60 mt-2">Current annual insurance</div>
          <div className="text-sm font-medium">{money(data?.current?.annualInsuranceNow)}</div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Maintenance</div>
          <div className="text-xs opacity-70 mt-1">Total over {trendYears}y</div>
          <div className="text-lg font-semibold mt-2">{money(data?.rollup?.expenseBreakdown?.maintenance)}</div>
          <div className="text-xs opacity-60 mt-2">Current annual maintenance</div>
          <div className="text-sm font-medium">{money(data?.current?.annualMaintenanceNow)}</div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Localized insights</div>
        <div className="text-xs opacity-70 mt-1">
          Phase 1 ties insights to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
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

      {/* Assumptions / Notes */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Assumptions (Phase 1)</div>
        <div className="text-xs opacity-70 mt-1">
          These are heuristic estimates designed for story + trend comparisons. We can swap in free datasets (FHFA HPI, etc.) later.
        </div>

        <div className="mt-3 space-y-2">
          {(data?.meta?.notes || []).map((n, i) => (
            <div key={i} className="text-xs text-black/70">
              • {n}
            </div>
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
