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
  const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
  if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
  return <span className={`${base} bg-black/5 text-black/70`}>Estimated</span>;
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

    try {
      const reqId = ++reqRef.current;
      const r = await getBreakEven(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
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
      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
      : 'bg-rose-50 text-rose-800 border-rose-100';

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="🎯"
        title="Break-Even Ownership Year"
        description="When appreciation is projected to outweigh cumulative ownership costs."
      />

      <div className="mt-3">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Binary insight</div>
            <div className="text-xs opacity-70 mt-1">
              <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {[5, 10, 20, 30].map((y) => (
              <React.Fragment key={y}>
                <button
                  type="button"
                  onClick={async () => {
                    if (years === y) return;
                    setYears(y as any);
                    await load(y as any);
                  }}
                  className={`text-xs underline ${years === y ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                >
                  {y}y
                </button>
                {y !== 30 && <span className="text-xs opacity-40">|</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left */}
          <div className="lg:col-span-4 space-y-3">
            <div className={`rounded-xl border p-3 ${statusTone}`}>
              <div className="text-xs opacity-80">Break-even</div>
              <div className="text-base font-semibold mt-1">{breakEvenHeadline(data)}</div>
              <div className="text-xs opacity-70 mt-2">
                Net at horizon: <span className="font-medium">{money(data?.rollup?.netAtHorizon)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Cumulative ownership costs ({years}y)</div>
              <div className="text-lg font-semibold">{money(data?.rollup?.cumulativeExpensesAtHorizon)}</div>
              <div className="text-xs opacity-70 mt-2">Cumulative appreciation gain ({years}y)</div>
              <div className="text-base font-semibold">{money(data?.rollup?.cumulativeAppreciationAtHorizon)}</div>
            </div>

            {/* ✅ FIXED wording */}
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Sensitivity</div>

              <div className="text-sm font-medium mt-1">
                Optimistic break-even:{' '}
                {data?.sensitivity?.optimistic?.breakEvenYearIndex
                  ? `Year ${data.sensitivity.optimistic.breakEvenYearIndex}`
                  : 'Not reached'}
              </div>

              <div className="text-xs opacity-60 mt-1">
                Base and conservative scenarios do not reach break-even within this horizon.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">
                  Conservative: {data?.sensitivity?.conservative?.breakEvenYearIndex ? `Year ${data.sensitivity.conservative.breakEvenYearIndex}` : 'Not reached'}
                </span>
                <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">
                  Base: {data?.sensitivity?.base?.breakEvenYearIndex ? `Year ${data.sensitivity.base.breakEvenYearIndex}` : 'Not reached'}
                </span>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="lg:col-span-8 rounded-xl border border-black/10 p-3">
            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              verticalMarkerIndex={chartModel.breakEvenIdx}
              verticalMarkerLabel={data?.breakEven?.reached ? `Break-even (Year ${data.breakEven.breakEvenYearIndex})` : undefined}
              eventMarkers={chartModel.eventIdxs}
            />

            {/* ✅ clearer dot explanation */}
            <div className="mt-2 text-xs opacity-60">
              Dots indicate years with step-changes such as tax reassessment resets or insurance repricing events.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">What matters most</div>

          <div className="mt-4 space-y-2">
            {(data?.drivers || []).map((d, idx) => (
              <div key={idx} className="rounded-xl border border-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {d.factor === 'Appreciation rate' ? 'Appreciation rate (key driver)' : d.factor}
                  </div>
                  <span className="text-xs rounded px-2 py-0.5 border border-black/10 bg-black/5">{d.impact}</span>
                </div>

                <div className="text-xs text-black/70 mt-2">{d.explanation}</div>

                {d.factor === 'Appreciation rate' && (
                  <div className="text-xs opacity-60 mt-1">
                    Break-even timing is highly sensitive to appreciation assumptions.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Assumptions & confidence</div>
            {badgeForConfidence(data?.meta?.confidence)}
          </div>

          {data?.meta?.confidence === 'LOW' && (
            <div className="text-xs opacity-60 mt-1">
              Estimated using localized historical heuristics (Phase 1–2 model). No persisted long-term snapshots yet.
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-black/70">• {n}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
