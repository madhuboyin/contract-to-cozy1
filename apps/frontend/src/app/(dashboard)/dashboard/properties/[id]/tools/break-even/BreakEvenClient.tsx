// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/break-even/BreakEvenClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import { Button } from '@/components/ui/button';
import HomeToolHeader from '@/components/tools/HomeToolHeader';

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

function impactBadgeClass(impact: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (impact === 'HIGH') {
    return 'border-rose-200/70 bg-rose-50/85 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300';
  }
  if (impact === 'MEDIUM') {
    return 'border-amber-200/70 bg-amber-50/85 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'border-slate-300/70 bg-slate-50/85 text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300';
}

export default function BreakEvenClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const requestedAssumptionSetId = searchParams.get('assumptionSetId');

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
      const r = await getBreakEven(propertyId, {
        years: nextYears,
        assumptionSetId: requestedAssumptionSetId ?? undefined,
      });
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
  }, [propertyId, requestedAssumptionSetId]);

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

  const sensitivitySummary = useMemo(() => {
    if (!data?.sensitivity) return null;
    const s = data.sensitivity;
    const reached = [
      s.optimistic?.breakEvenYearIndex ? `optimistic (Year ${s.optimistic.breakEvenYearIndex})` : null,
      s.base?.breakEvenYearIndex ? `base (Year ${s.base.breakEvenYearIndex})` : null,
      s.conservative?.breakEvenYearIndex ? `conservative (Year ${s.conservative.breakEvenYearIndex})` : null,
    ].filter(Boolean);
    if (reached.length === 0) return 'None of the scenarios reach break-even within this horizon.';
    if (reached.length === 3) return 'All three scenarios reach break-even within this horizon.';
    return `Break-even reached under the ${reached.join(' and ')} scenario${reached.length > 1 ? 's' : ''}.`;
  }, [data]);

  const statusTone =
    data?.breakEven.status === 'PROJECTED' || data?.breakEven.status === 'ALREADY_BREAKEVEN'
      ? 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white/75 to-teal-50/70 text-emerald-800'
      : 'border-rose-200/70 bg-gradient-to-br from-rose-50/85 via-white/75 to-amber-50/65 text-rose-800';

  const breakEvenPriorityAction = (() => {
    if (!data || loading) return undefined;

    const confidenceLabel = data.meta?.confidence ?? 'Medium';
    const nextAction = data.nextAction ? (
      <Button type="button" asChild className="w-full sm:w-auto">
        <Link href={data.nextAction.href}>{data.nextAction.label}</Link>
      </Button>
    ) : undefined;

    if (data.breakEven.status === 'ALREADY_BREAKEVEN') {
      return {
        title: 'This home has already passed break-even',
        description: `Projected appreciation has already outweighed cumulative ownership costs. Net position at the ${years}-year horizon is ${money(data.rollup.netAtHorizon)}.`,
        impactLabel: 'Break-even reached',
        confidenceLabel,
        primaryAction: nextAction,
      };
    }

    if (data.breakEven.status === 'PROJECTED') {
      return {
        title: `Projected break-even arrives in year ${data.breakEven.breakEvenYearIndex}`,
        description: `At the current model rate, ownership costs are projected to be outweighed by appreciation in ${data.breakEven.breakEvenCalendarYear}. Stress-test the horizon below before making a sell, hold, or capital plan.`,
        impactLabel: `Year ${data.breakEven.breakEvenYearIndex}`,
        confidenceLabel,
        primaryAction: nextAction,
      };
    }

    return {
      title: `Break-even is not reached within ${data.input.years} years`,
      description: `Cumulative costs remain ahead of appreciation by the end of this horizon. Review sensitivity and capital timing before committing more money to the home.`,
      impactLabel: 'Not reached',
      confidenceLabel,
      primaryAction: nextAction,
    };
  })();

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home Tool"
      title="Break-Even Ownership Year"
      subtitle="See when appreciation is projected to outweigh cumulative ownership costs."
      trust={{
        confidenceLabel: data?.meta?.confidence ? `${data.meta.confidence.toLowerCase()} projection confidence` : 'Model confidence pending',
        freshnessLabel: 'Refreshes when assumption sets or horizon settings change',
        sourceLabel: 'CtC ownership model + appreciation scenarios + expense projections',
        rationale: 'Balances cumulative costs and projected appreciation so ownership timing decisions stay explicit.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} context="break-even" currentToolId="break-even" showDesktop={false} />
      }
      priorityAction={breakEvenPriorityAction}
    >

      <HomeToolHeader
        toolId="break-even"
        propertyId={propertyId}
        context="break-even"
        currentToolId="break-even"
      />

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3 backdrop-blur">
          <div className="flex-1 text-sm text-red-600">{error}</div>
          <button onClick={() => load(years)} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/70 bg-white/65 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/45">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-900 dark:border-slate-100" />
        </div>
      )}

      {loading && data && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-xs text-slate-500 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-slate-500 dark:border-slate-300" />
          Refreshing {years}-year break-even projection...
        </div>
      )}

      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Cost vs appreciation timeline</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Property-scoped estimate for <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
            {data && (
              <div className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {data.breakEven.status === 'ALREADY_BREAKEVEN' && `Your home has already broken even because appreciation has outpaced cumulative ownership costs.`}
                {data.breakEven.status === 'PROJECTED' && `Your home is projected to break even in year ${data.breakEven.breakEvenYearIndex} (${data.breakEven.breakEvenCalendarYear}).`}
                {data.breakEven.status === 'NOT_REACHED' && `Your home is not projected to break even within your ${data.input.years}-year horizon.`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            {([5, 10, 20, 30] as const).map((y) => (
              <button
                key={y}
                type="button"
                onClick={async () => {
                  if (years === y) return;
                  setYears(y);
                  await load(y);
                }}
                className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                  years === y
                    ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
                }`}
              >
                {y}y
              </button>
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
              <div className="mt-2 text-xs opacity-70">
                Debt model:{' '}
                <span className="font-medium">
                  {data?.current?.debtMode === 'ON' ? 'On (snapshot-backed)' : 'Off (snapshot missing)'}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs opacity-70">Confidence</span>
                {badgeForConfidence(data?.meta?.confidence)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Current home value</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{money(data?.current?.homeValueNow)}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual expenses now</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualExpensesNow)}</div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Cumulative ownership costs ({years}y)</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{money(data?.rollup?.cumulativeExpensesAtHorizon)}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Cumulative appreciation gain ({years}y)</div>
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.cumulativeAppreciationAtHorizon)}</div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Sensitivity</div>

              <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                Optimistic break-even:{' '}
                {data?.sensitivity?.optimistic?.breakEvenYearIndex
                  ? `Year ${data.sensitivity.optimistic.breakEvenYearIndex}`
                  : 'Not reached'}
              </div>

              {sensitivitySummary && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {sensitivitySummary}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
                  Conservative: {data?.sensitivity?.conservative?.breakEvenYearIndex ? `Year ${data.sensitivity.conservative.breakEvenYearIndex}` : 'Not reached'}
                </span>
                <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
                  Base: {data?.sensitivity?.base?.breakEvenYearIndex ? `Year ${data.sensitivity.base.breakEvenYearIndex}` : 'Not reached'}
                </span>
              </div>
            </div>

            {data?.current?.debtMode === 'OFF' ? (
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3 text-xs text-amber-900">
                Mortgage context is missing, so this is a directional break-even read. Add finance snapshot details for debt-aware math.
              </div>
            ) : null}
          </div>

          {/* Right */}
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48 lg:col-span-8">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">
                Cumulative costs
              </span>
              <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">
                Appreciation gain
              </span>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-300">
                {loading ? 'Refreshing...' : data?.meta?.generatedAt ? 'Updated just now' : ''}
              </span>
            </div>

            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              ariaLabel="Break-even ownership timeline chart"
              verticalMarkerIndex={chartModel.breakEvenIdx}
              verticalMarkerLabel={data?.breakEven?.reached ? `Break-even (Year ${data.breakEven.breakEvenYearIndex})` : undefined}
              eventMarkers={chartModel.eventIdxs}
            />

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
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${impactBadgeClass(d.impact)}`}>{d.impact}</span>
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
              Estimated using localized appreciation and cost benchmarks. Add finance snapshot details for a more precise projection.
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
            ))}
          </div>

          {(data?.meta?.dataSources?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs text-slate-500 dark:text-slate-300">Data sources</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{(data?.meta?.dataSources ?? []).join(' · ')}</div>
            </div>
          )}

          {data?.nextAction ? (
            <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Next action</div>
              <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {data.nextAction.reason}
              </div>
              <Button asChild className="mt-3 h-9 rounded-xl text-sm">
                <Link href={data.nextAction.href}>{data.nextAction.label}</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </ToolWorkspaceTemplate>
  );
}
