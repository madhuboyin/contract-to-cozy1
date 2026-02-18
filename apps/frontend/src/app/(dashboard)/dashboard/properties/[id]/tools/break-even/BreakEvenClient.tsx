// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/break-even/BreakEvenClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';

import MultiLineChart from '../insurance-trend/MultiLineChart';
import { getBreakEven, BreakEvenDTO } from './breakEvenApi';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function badgeForConfidence(c?: string) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
  if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
}

function breakEvenHeadline(dto: BreakEvenDTO | null) {
  if (!dto) return '—';
  const b = dto.breakEven;
  if (b.status === 'ALREADY_BREAKEVEN') return `Break-even: Year 1 (${b.breakEvenCalendarYear})`;
  if (b.status === 'PROJECTED') return `Break-even: Year ${b.breakEvenYearIndex} (${b.breakEvenCalendarYear})`;
  return `Not projected to break even within ${dto.input.years} years`;
}

export default function BreakEvenClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10 | 20 | 30>(20);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BreakEvenDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reqRef = React.useRef(0);

  async function load(nextYears: 5 | 10 | 20 | 30) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const reqId = ++reqRef.current;
    try {
      const r = await getBreakEven(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load break-even estimate');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    const hist = data?.history ?? [];
    if (!hist.length) {
      return {
        x: ['—', '—'],
        series: [
          { key: 'cost', label: 'Cumulative costs', values: [0, 0], opacity: 0.9, strokeWidth: 2.75 },
          { key: 'gain', label: 'Cumulative appreciation gain', values: [0, 0], opacity: 0.65, dash: '6 5' },
        ],
        breakEvenIdx: null as number | null,
        eventIdxs: [] as Array<{ idx: number; label: string }>,
      };
    }

    const x = hist.map((h) => String(h.year));
    const series = [
      { key: 'cost', label: 'Cumulative costs', values: hist.map((h) => h.cumulativeExpenses), opacity: 0.9, strokeWidth: 2.75 },
      { key: 'gain', label: 'Cumulative appreciation gain', values: hist.map((h) => h.cumulativeAppreciationGain), opacity: 0.65, dash: '6 5' },
    ];

    const beIdx = data?.breakEven?.breakEvenYearIndex ? data.breakEven.breakEvenYearIndex - 1 : null;

    const events = (data?.events || [])
      .map((e) => {
        const idx = hist.findIndex((h) => h.year === e.year);
        if (idx < 0) return null;
        return { idx, label: `${e.type}: ${e.description}` };
      })
      .filter(Boolean) as Array<{ idx: number; label: string }>;

    return { x, series, breakEvenIdx: beIdx, eventIdxs: events };
  }, [data]);

  const statusTone =
    data?.breakEven.status === 'PROJECTED' || data?.breakEven.status === 'ALREADY_BREAKEVEN'
      ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white/75 to-teal-50/70 text-emerald-800'
      : 'border-rose-200/70 bg-gradient-to-br from-rose-50/85 via-white/75 to-amber-50/65 text-rose-800';

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <SectionHeader
            icon="🎯"
            title="Break-Even Ownership Year"
            description="When appreciation is projected to outweigh cumulative ownership costs."
          />

          <div className="mt-4">
            <HomeToolsRail propertyId={propertyId} />
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Binary insight</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            {[5, 10, 20, 30].map((y) => (
              <React.Fragment key={y}>
                <button
                  type="button"
                  onClick={async () => {
                    if (years === y) return;
                    setYears(y as any);
                    await load(y as any);
                  }}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                    years === y
                      ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
                  }`}
                >
                  {y}y
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 lg:grid-cols-12 gap-4">
          {/* Left */}
          <div className="space-y-3 lg:col-span-4">
            <div className={`rounded-xl border p-3 ${statusTone}`}>
              <div className="text-xs uppercase tracking-[0.12em] opacity-80">Break-even</div>
              <div className="mt-1 text-base font-semibold">{breakEvenHeadline(data)}</div>
              <div className="mt-2 text-xs opacity-70">
                Net at horizon: <span className="font-medium">{money(data?.rollup?.netAtHorizon)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Cumulative ownership costs ({years}y)</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{money(data?.rollup?.cumulativeExpensesAtHorizon)}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Cumulative appreciation gain ({years}y)</div>
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.cumulativeAppreciationAtHorizon)}</div>
            </div>

            {/* ✅ FIXED wording */}
            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Sensitivity</div>

              <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                Optimistic break-even:{' '}
                {data?.sensitivity?.optimistic?.breakEvenYearIndex
                  ? `Year ${data.sensitivity.optimistic.breakEvenYearIndex}`
                  : 'Not reached'}
              </div>

              <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                Base and conservative scenarios do not reach break-even within this horizon.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
                  Conservative: {data?.sensitivity?.conservative?.breakEvenYearIndex ? `Year ${data.sensitivity.conservative.breakEvenYearIndex}` : 'Not reached'}
                </span>
                <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
                  Base: {data?.sensitivity?.base?.breakEvenYearIndex ? `Year ${data.sensitivity.base.breakEvenYearIndex}` : 'Not reached'}
                </span>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48 lg:col-span-8">
            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              verticalMarkerIndex={chartModel.breakEvenIdx}
              verticalMarkerLabel={data?.breakEven?.reached ? `Break-even (Year ${data.breakEven.breakEvenYearIndex})` : undefined}
              eventMarkers={chartModel.eventIdxs}
            />

            {/* ✅ clearer dot explanation */}
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
              Dots indicate years with step-changes such as tax reassessment resets or insurance repricing events.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 lg:grid-cols-12 gap-4">
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 lg:col-span-7">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What matters most</div>

          <div className="mt-4 space-y-2">
            {(data?.drivers || []).map((d, idx) => (
              <div key={idx} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {d.factor === 'Appreciation rate' ? 'Appreciation rate (key driver)' : d.factor}
                  </div>
                  <span className="rounded-full border border-slate-300/70 bg-slate-50/85 px-2.5 py-1 text-xs text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">{d.impact}</span>
                </div>

                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>

                {d.factor === 'Appreciation rate' && (
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    Break-even timing is highly sensitive to appreciation assumptions.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assumptions & confidence</div>
            {badgeForConfidence(data?.meta?.confidence)}
          </div>

          {data?.meta?.confidence === 'LOW' && (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Estimated using localized historical heuristics (Phase 1–2 model). No persisted long-term snapshots yet.
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
