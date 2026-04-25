// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/break-even/BreakEvenClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Home, DollarSign, TrendingUp, Calendar } from 'lucide-react';

import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import { Button } from '@/components/ui/button';
import HomeToolHeader from '@/components/tools/HomeToolHeader';

import MultiLineChart from '../insurance-trend/MultiLineChart';
import { getBreakEven, BreakEvenDTO } from './breakEvenApi';

function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function moneyFull(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function badgeForConfidence(c?: string) {
  const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium';
  if (c === 'HIGH') return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>Medium confidence</span>;
  return <span className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>Estimated</span>;
}

function impactBadgeClass(impact: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (impact === 'HIGH') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (impact === 'MEDIUM') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
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
          { key: 'cost', label: 'Cumulative costs', values: [0, 0], opacity: 0.9, strokeWidth: 2.5 },
          { key: 'gain', label: 'Cumulative appreciation gain', values: [0, 0], opacity: 0.65, dash: '6 4' },
        ],
        breakEvenIdx: null as number | null,
        eventIdxs: [] as Array<{ idx: number; label: string }>,
      };
    }

    const x = hist.map((h) => String(h.year));
    const series = [
      { key: 'cost', label: 'Cumulative costs', values: hist.map((h) => h.cumulativeExpenses), opacity: 0.9, strokeWidth: 2.5 },
      { key: 'gain', label: 'Cumulative appreciation gain', values: hist.map((h) => h.cumulativeAppreciationGain), opacity: 0.65, dash: '6 4' },
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
      ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900'
      : 'border-rose-100 bg-gradient-to-br from-rose-50 to-amber-50 text-rose-900';

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
        description: `Projected appreciation has already outweighed cumulative ownership costs. Net position at the ${years}-year horizon is ${moneyFull(data.rollup.netAtHorizon)}.`,
        impactLabel: 'Break-even reached',
        confidenceLabel,
        primaryAction: nextAction,
      };
    }

    if (data.breakEven.status === 'PROJECTED') {
      return {
        title: `Projected break-even arrives in year ${data.breakEven.breakEvenYearIndex}`,
        description: `At the current estimated rate, ownership costs are projected to be outweighed by appreciation in ${data.breakEven.breakEvenCalendarYear}. Stress-test the horizon below before making a sell, hold, or capital plan.`,
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
      eyebrow="Home tool"
      title="Break-Even Ownership Year"
      subtitle="See when appreciation is projected to outweigh cumulative ownership costs."
      trust={{
        confidenceLabel: data?.meta?.confidence ? `${data.meta.confidence.toLowerCase()} projection confidence` : 'Model confidence pending',
        freshnessLabel: 'Refreshes when assumption sets or horizon settings change',
        sourceLabel: 'Ownership analysis + appreciation scenarios + expense projections',
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
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
          <div className="flex-1 text-sm text-red-700">{error}</div>
          <button onClick={() => load(years)} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-100 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-900" />
        </div>
      )}

      {loading && data && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-slate-500" />
          Refreshing {years}-year break-even projection...
        </div>
      )}

      {/* Main Content - Premium Two-Column Layout */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        {/* Header Section */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Cost vs appreciation timeline</h1>
            <p className="mt-1 text-sm text-slate-500">
              Property-scoped estimate for <span className="font-medium text-slate-700">{data?.input?.addressLabel || '—'}</span>
            </p>
            {data && (
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {data.breakEven.status === 'ALREADY_BREAKEVEN' && `Your home has already broken even because appreciation has outpaced cumulative ownership costs.`}
                {data.breakEven.status === 'PROJECTED' && `Your home is projected to break even in year ${data.breakEven.breakEvenYearIndex} (${data.breakEven.breakEvenCalendarYear}).`}
                {data.breakEven.status === 'NOT_REACHED' && `Your home is not projected to break even within your ${data.input.years}-year horizon.`}
              </p>
            )}
          </div>

          {/* Premium Time Selector */}
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {([5, 10, 20, 30] as const).map((y) => (
              <button
                key={y}
                type="button"
                onClick={async () => {
                  if (years === y) return;
                  setYears(y);
                  await load(y);
                }}
                className={`inline-flex h-8 min-w-[48px] items-center justify-center rounded-full px-3 text-sm font-medium transition-all ${
                  years === y
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {y}y
              </button>
            ))}
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column - Compact Metric Rail */}
          <div className="lg:col-span-4 space-y-3">
            {/* Break-Even Status Card - Hero Metric */}
            <div className={`rounded-xl border p-4 ${statusTone}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide opacity-75">Break-even</div>
                  <div className="mt-1.5 text-lg font-semibold leading-tight">
                    {data?.breakEven.status === 'ALREADY_BREAKEVEN' && `Year 1 (${data.breakEven.breakEvenCalendarYear})`}
                    {data?.breakEven.status === 'PROJECTED' && `Year ${data.breakEven.breakEvenYearIndex} (${data.breakEven.breakEvenCalendarYear})`}
                    {data?.breakEven.status === 'NOT_REACHED' && `Not projected to break even within ${data?.input.years} years`}
                  </div>
                  <div className="mt-2 text-xs opacity-75">
                    Net at horizon: <span className="font-semibold">{moneyFull(data?.rollup?.netAtHorizon)}</span>
                  </div>
                </div>
                <div className="shrink-0">
                  {data?.breakEven.status === 'NOT_REACHED' ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                      <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between text-xs">
                <span className="opacity-75">
                  Debt model: {data?.current?.debtMode === 'ON' ? 'On (snapshot-backed)' : 'Off (snapshot missing)'}
                </span>
                {badgeForConfidence(data?.meta?.confidence)}
              </div>
            </div>

            {/* Current Metrics - Compact */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200">
                  <Home className="h-4 w-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">Current home value</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{money(data?.current?.homeValueNow)}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200">
                  <DollarSign className="h-4 w-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">Annual expenses now</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{money(data?.current?.annualExpensesNow)}</div>
                </div>
              </div>
            </div>

            {/* Cumulative Metrics - Compact */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200">
                  <Calendar className="h-4 w-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">Cumulative ownership costs ({years}y)</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{money(data?.rollup?.cumulativeExpensesAtHorizon)}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200">
                  <TrendingUp className="h-4 w-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">Cumulative appreciation gain ({years}y)</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{money(data?.rollup?.cumulativeAppreciationAtHorizon)}</div>
                </div>
              </div>
            </div>

            {/* Sensitivity - Compact */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="text-xs font-medium text-slate-700 uppercase tracking-wide">Sensitivity</div>
              <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                Optimistic break-even:{' '}
                <span className="font-semibold text-slate-900">
                  {data?.sensitivity?.optimistic?.breakEvenYearIndex
                    ? `Year ${data.sensitivity.optimistic.breakEvenYearIndex}`
                    : 'Not reached'}
                </span>
              </div>
              {sensitivitySummary && (
                <div className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  {sensitivitySummary}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  Conservative: {data?.sensitivity?.conservative?.breakEvenYearIndex ? `Year ${data.sensitivity.conservative.breakEvenYearIndex}` : 'Not reached'}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  Base: {data?.sensitivity?.base?.breakEvenYearIndex ? `Year ${data.sensitivity.base.breakEvenYearIndex}` : 'Not reached'}
                </span>
              </div>
            </div>

            {/* Mortgage Warning - Soft */}
            {data?.current?.debtMode === 'OFF' && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs text-amber-900 leading-relaxed">
                Mortgage context is missing, so this is a directional break-even read. Add finance snapshot details for debt-aware math.
              </div>
            )}
          </div>

          {/* Right Column - Chart */}
          <div className="lg:col-span-8 rounded-xl border border-slate-100 bg-slate-50/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-slate-900"></span>
                  Cumulative costs
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  <span className="h-2 w-2 rounded-full border-2 border-slate-400"></span>
                  Appreciation gain
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {loading ? 'Refreshing...' : data?.meta?.generatedAt ? 'Updated just now' : ''}
              </span>
            </div>

            <div className="rounded-lg bg-white border border-slate-100 p-4">
              <MultiLineChart
                xLabels={chartModel.x}
                series={chartModel.series}
                ariaLabel="Break-even ownership timeline chart"
                verticalMarkerIndex={chartModel.breakEvenIdx}
                verticalMarkerLabel={data?.breakEven?.reached ? `Break-even (Year ${data.breakEven.breakEvenYearIndex})` : undefined}
                eventMarkers={chartModel.eventIdxs}
              />
            </div>

            <div className="mt-2 text-xs text-slate-500 leading-relaxed">
              Dots indicate years with step-changes such as tax reassessment resets or insurance repricing events.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - What Matters Most & Assumptions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* What Matters Most - Keep Structure */}
        <div className="lg:col-span-7 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">What matters most</h2>

          <div className="mt-3 space-y-2">
            {(data?.drivers || []).map((d, idx) => (
              <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900">
                    {d.factor === 'Appreciation rate' ? 'Appreciation rate (key driver)' : d.factor}
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${impactBadgeClass(d.impact)}`}>
                    {d.impact}
                  </span>
                </div>

                <div className="mt-1.5 text-xs text-slate-600 leading-relaxed">{d.explanation}</div>

                {d.factor === 'Appreciation rate' && (
                  <div className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Break-even timing is highly sensitive to appreciation assumptions.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Assumptions & Confidence - Keep Structure, Remove Data Sources */}
        <div className="lg:col-span-5 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Assumptions & confidence</h2>
            {badgeForConfidence(data?.meta?.confidence)}
          </div>

          {data?.meta?.confidence === 'LOW' && (
            <div className="mt-2 text-xs text-slate-500 leading-relaxed">
              Estimated using localized appreciation and cost benchmarks. Add finance snapshot details for a more precise projection.
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-slate-600 leading-relaxed">• {n}</div>
            ))}
          </div>

          {/* Next Action - Premium CTA */}
          {data?.nextAction && (
            <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50/50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-teal-700">Next action</div>
              <div className="mt-1 text-sm font-medium text-slate-900 leading-relaxed">
                {data.nextAction.reason}
              </div>
              <Button asChild className="mt-3 h-9 w-full rounded-lg bg-teal-600 text-sm font-medium text-white hover:bg-teal-700">
                <Link href={data.nextAction.href}>{data.nextAction.label}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceTemplate>
  );
}
