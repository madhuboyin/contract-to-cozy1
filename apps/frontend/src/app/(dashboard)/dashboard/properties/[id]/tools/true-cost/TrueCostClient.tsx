// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/TrueCostClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import { getTrueCostOwnership, TrueCostOwnershipDTO } from './trueCostApi';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import { Button } from '@/components/ui/button';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';

// Use the upgraded chart you already shipped (legend + tooltip)
import MultiLineChart from '../cost-growth/MultiLineChart';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

export default function TrueCostClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const inventoryItemId = searchParams.get('itemId');

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrueCostOwnershipDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartExpanded, setChartExpanded] = useState(false);
  const reqRef = React.useRef(0);

  async function load(nextYears: 5 | 10 = years) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    const reqId = ++reqRef.current;
    try {
      const r = await getTrueCostOwnership(
        propertyId,
        { guidanceJourneyId, guidanceStepKey, guidanceSignalIntentFamily, inventoryItemId },
        nextYears,
      );
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load true cost');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, guidanceJourneyId, guidanceStepKey, guidanceSignalIntentFamily, inventoryItemId]);

  const allSeries = useMemo(() => {
    const h = data?.history ?? [];
    return [
      { key: 'total', label: 'Total', values: h.map((r) => r.annualTotal), strokeWidth: 2.75, color: '#475569' },
      { key: 'tax', label: 'Taxes', values: h.map((r) => r.annualTax), color: '#d97706', dash: '6 5' },
      { key: 'ins', label: 'Insurance', values: h.map((r) => r.annualInsurance), color: '#e11d48', dash: '2 4' },
      { key: 'maint', label: 'Maintenance', values: h.map((r) => r.annualMaintenance), color: '#0284c7', dash: '10 6' },
      { key: 'util', label: 'Utilities', values: h.map((r) => r.annualUtilities), color: '#0d9488', dash: '1 6' },
    ];
  }, [data]);

  // Keys for the 2 largest cost contributors, mapped to chart series keys
  const top2SeriesKeys: string[] = useMemo(() => {
    const categoryToKey: Record<string, string> = {
      taxes: 'tax',
      insurance: 'ins',
      maintenance: 'maint',
      utilities: 'util',
    };
    const b = data?.rollup?.breakdown;
    if (!b) return ['tax', 'ins'];
    // cast via variable to avoid <> generics in TSX expression context
    const entries = Object.entries(b) as [string, number][];
    return entries
      .sort((entA, entB) => entB[1] - entA[1])
      .slice(0, 2)
      .map((ent) => categoryToKey[ent[0]])
      .filter(Boolean) as string[];
  }, [data]);

  const chartModel = useMemo(() => {
    const h = data?.history ?? [];
    const x = h.map((r) => String(r.year));
    const visibleSeries = chartExpanded
      ? allSeries
      : allSeries.filter((s) => s.key === 'total' || top2SeriesKeys.includes(s.key));
    return { x, series: visibleSeries };
  }, [data, allSeries, chartExpanded, top2SeriesKeys]);

  const trueCostPriorityAction = (() => {
    if (!data || loading || !data?.rollup?.breakdown) return undefined;
    const breakdown = data.rollup.breakdown as Record<string, number>;
    const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const topEntry = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0];
    if (!topEntry || total <= 0) return undefined;
    const categoryLabels: Record<string, string> = {
      taxes: 'property tax',
      insurance: 'insurance premiums',
      maintenance: 'maintenance',
      utilities: 'utilities',
    };
    const topLabel = categoryLabels[topEntry[0]] ?? topEntry[0];
    const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    return {
      title: `Your ${years}-year ownership cost is projected at ${fmt(total)}`,
      description: `Biggest driver: ${topLabel} at ${fmt(topEntry[1])} over ${years} years. Scroll down to see how each category compounds.`,
      impactLabel: `${years}-year total`,
      confidenceLabel: data.meta?.confidence ?? 'Medium',
      primaryAction: (
        <Button type="button" asChild className="w-full sm:w-auto">
          <a href={`/dashboard/properties/${propertyId}/tools/home-savings`}>Find savings opportunities</a>
        </Button>
      ),
    };
  })();

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="True Cost of Home Ownership"
      subtitle={`A ${years}-year reality check including taxes, insurance, maintenance, and utilities.`}
      trust={{
        confidenceLabel: data?.meta?.confidence
          ? `${data.meta.confidence.charAt(0) + data.meta.confidence.slice(1).toLowerCase()} confidence — localized tax, insurance, and maintenance assumptions`
          : 'Localized tax, insurance, and maintenance assumptions',
        freshnessLabel: data?.meta?.generatedAt ? 'Updated with latest cost inputs' : 'Analyzing your property…',
        sourceLabel: 'Cost analysis + property profile + localized trend assumptions',
        rationale: 'Bundles recurring and structural cost drivers into one ownership view to reduce hidden-spend blind spots.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} context="true-cost" currentToolId="true-cost" showDesktop={false} />
      }
      priorityAction={trueCostPriorityAction}
    >

      {/* Tool identity + Related tools — desktop only, above NBA */}
      <HomeToolHeader
        toolId="true-cost"
        propertyId={propertyId}
        context="true-cost"
        currentToolId="true-cost"
      />

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3 backdrop-blur">
          <div className="flex-1 text-sm text-red-600">{error}</div>
          <button onClick={() => load()} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
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
          Refreshing {years}-year projection…
        </div>
      )}

      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{years}-year projection</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            {([5, 10] as const).map((y) => (
              <button
                key={y}
                type="button"
                onClick={async () => { if (years === y) return; setYears(y); await load(y); }}
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

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Total ({years}y)</div>
            <div className="mt-1 text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.totalCost)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualTotalNow)}</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Taxes ({years}y)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.breakdown?.taxes)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualTaxNow)}</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Insurance ({years}y)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.breakdown?.insurance)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualInsuranceNow)}</div>
          </div>

          <div className="rounded-2xl border border-teal-200/60 bg-teal-50/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-teal-700/50 dark:bg-teal-950/30">
            <div className="flex items-center gap-2">
              <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Maintenance + Utilities ({years}y)</div>
              <span className="rounded-full border border-teal-300/70 bg-teal-100/80 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:border-teal-600/60 dark:bg-teal-900/50 dark:text-teal-300">Includes utilities</span>
            </div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">
              {money(
                (data?.rollup?.breakdown?.maintenance ?? 0) +
                  (data?.rollup?.breakdown?.utilities ?? 0)
              )}
            </div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {money((data?.current?.annualMaintenanceNow ?? 0) + (data?.current?.annualUtilitiesNow ?? 0))}
            </div>
            <div className="mt-1 text-[10px] text-teal-600 dark:text-teal-400">Not included in other tools</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs text-slate-500 dark:text-slate-300">
              {chartExpanded ? 'All cost components' : 'Total + 2 largest contributors'}
            </div>
            <button
              type="button"
              onClick={() => setChartExpanded((v) => !v)}
              className="rounded-full border border-slate-200/80 bg-white/75 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300 dark:hover:bg-slate-900/80"
            >
              {chartExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>
          <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="True cost trend chart" />
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Total is emphasized; other lines show the components that drive the &quot;true cost&quot;. <span className="text-teal-600 dark:text-teal-400 font-medium">Utilities (teal) are tracked here only</span> — not included in other home tools.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Localized insights</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          Tied to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-2xl border border-white/70 bg-white/68 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                  d.impact === 'HIGH'
                    ? 'border-rose-200/70 bg-rose-50/85 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300'
                    : d.impact === 'MEDIUM'
                    ? 'border-amber-200/70 bg-amber-50/85 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-300/70 bg-slate-50/85 text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300'
                }`}>{d.impact}</span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Assumptions & methodology</div>
          <div className="mt-2 space-y-1">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
            ))}
          </div>
          {(data?.meta?.dataSources?.length ?? 0) > 0 && (
            <div className="mt-3 border-t border-slate-200/60 pt-3 dark:border-slate-700/50">
              <div className="text-xs text-slate-500 dark:text-slate-400">Data sources</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {(data?.meta?.dataSources ?? []).join(' · ')}
              </div>
            </div>
          )}
        </div>
      </div>

      {data && (
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What to do next</div>
          {(() => {
            const b = data.rollup?.breakdown;
            if (!b) return null;
            const largest = Object.entries(b).sort(([, a], [, bv]) => bv - a)[0];
            const largestLabel = largest ? { taxes: 'property tax', insurance: 'insurance', maintenance: 'maintenance', utilities: 'utilities' }[largest[0]] ?? largest[0] : null;
            return (
              <div className="mt-3 space-y-2">
                {largestLabel && (
                  <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300">
                    Your largest {years}-year cost is <span className="font-semibold">{largestLabel}</span> at {money(largest![1])}. Focus here first for the biggest savings opportunity.
                  </div>
                )}
                <div className="rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
                  Use the <span className="font-medium">Cost Volatility Index</span> to see how unpredictable these costs are likely to be, then build a buffer accordingly.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark cost review complete"
        producedData={guidanceSignalIntentFamily ? { signalIntentFamily: guidanceSignalIntentFamily } : undefined}
      />
    </ToolWorkspaceTemplate>
  );
}
