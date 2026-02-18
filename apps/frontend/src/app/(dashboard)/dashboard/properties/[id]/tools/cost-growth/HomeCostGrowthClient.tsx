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

    const reqId = ++reqRef.current;
    try {
      const r = await getHomeCostGrowth(propertyId, { years });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
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
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
    if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
  };

  const netTone =
    (data?.rollup?.totalNet ?? 0) >= 0
      ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white/75 to-teal-50/70 text-emerald-800'
      : 'border-rose-200/70 bg-gradient-to-br from-rose-50/85 via-white/75 to-amber-50/65 text-rose-800';

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <SectionHeader
            icon="📈"
            title="Home Cost Growth Analyzer"
            description="Compare appreciation vs ownership expense growth to understand your net cost trend over time."
          />
          <div className="mt-4">
            <HomeToolsRail propertyId={propertyId} />
          </div>
        </div>
      </div>

      {/* Main Story Card */}
      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Appreciation vs Expenses</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Property-scoped estimate for <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
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

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-12 lg:grid-cols-12">
          {/* Left: summary */}
          <div className="space-y-3 lg:col-span-4">
            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Current estimated home value</div>
              <div className="mt-1 text-[1.75rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.current?.homeValueNow)}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-300">Confidence</div>
                {confidenceBadge(data?.meta?.confidence)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">CAGR appreciation ({trendYears}y)</div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{pct(data?.current?.appreciationRate)}</div>

              <div className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual expenses (now)</div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualExpensesNow)}</div>
            </div>

            <div className={`rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur ${netTone}`}>
              <div className="text-xs uppercase tracking-[0.12em] opacity-80">Net impact ({trendYears}y)</div>
              <div className="mt-1 text-2xl font-semibold leading-tight">{money(data?.rollup?.totalNet)}</div>
              <div className="mt-1 text-xs opacity-70">
                Appreciation gain <span className="font-medium">{money(data?.rollup?.totalAppreciationGain)}</span> minus expenses{' '}
                <span className="font-medium">{money(data?.rollup?.totalExpenses)}</span>
              </div>
            </div>
          </div>

          {/* Right: chart */}
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48 lg:col-span-8">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">Home value</span>
              <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">Total expenses</span>
              <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">Net Δ</span>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-300">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
            </div>

            <div className="text-slate-700 dark:text-slate-200">
              <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Home value vs expenses trend" />
            </div>

            <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
              Net Δ is year-over-year appreciation gain minus annual expenses (tax + insurance + maintenance).
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Taxes</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Total over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.expenseBreakdown?.taxes)}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Current annual tax</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualTaxNow)}</div>
        </div>

        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Insurance</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Total over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.expenseBreakdown?.insurance)}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Current annual insurance</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualInsuranceNow)}</div>
        </div>

        <div className="group rounded-2xl border border-white/70 bg-gradient-to-br from-white/78 via-amber-50/50 to-teal-50/42 p-4 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-24px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Maintenance</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Total over {trendYears}y</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.expenseBreakdown?.maintenance)}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Current annual maintenance</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualMaintenanceNow)}</div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Localized insights</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          Phase 1 ties insights to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                <span className="rounded-full border border-slate-300/70 bg-slate-50/85 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">{d.impact}</span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Assumptions / Notes */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assumptions (Phase 1)</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          These are heuristic estimates designed for story + trend comparisons. We can swap in free datasets (FHFA HPI, etc.) later.
        </div>

        <div className="mt-3 space-y-2">
          {(data?.meta?.notes || []).map((n, i) => (
            <div key={i} className="text-xs text-slate-600 dark:text-slate-300">
              • {n}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="text-xs text-slate-500 dark:text-slate-300">Data sources</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{(data?.meta?.dataSources || []).join(' · ')}</div>
        </div>
      </div>
    </div>
  );
}
