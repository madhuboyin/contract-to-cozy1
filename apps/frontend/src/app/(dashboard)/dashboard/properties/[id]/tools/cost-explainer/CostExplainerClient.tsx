// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-explainer/CostExplainerClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getCostExplainer, CostExplainerDTO } from './costExplainerApi';
import MultiLineChart from '../insurance-trend/MultiLineChart';
import HomeToolsRail from '../../components/HomeToolsRail';
import { Button } from '@/components/ui/button';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function badgeForConfidence(c?: string) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
  if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
  if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
  if (c === 'LOW') return <span className={`${base} border-red-200/70 bg-red-50/85 text-red-700`}>Low confidence</span>;
  return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
}

export default function CostExplainerClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const focusCategory = searchParams.get('focus')?.toUpperCase() ?? null;

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CostExplainerDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reqRef = React.useRef(0);

  async function load(nextYears: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    const reqId = ++reqRef.current;
    try {
      const r = await getCostExplainer(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: unknown) {
      if (reqId !== reqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load explainer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (!focusCategory || !data) return;
    const timer = setTimeout(() => {
      document.querySelector(`[data-cost-category="${focusCategory}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
    return () => clearTimeout(timer);
  }, [focusCategory, data]);

  // ✅ Build chart model from snapshot.history
  const chartModel = useMemo(() => {
    const hist = data?.snapshot?.history ?? [];
    if (!hist.length) {
      return {
        x: ['—', '—'],
        series: [
          { key: 'total', label: 'Total', values: [0, 0], opacity: 0.9, strokeWidth: 2.75 },
          { key: 'tax', label: 'Taxes', values: [0, 0], opacity: 0.55, dash: '6 5' },
          { key: 'ins', label: 'Insurance', values: [0, 0], opacity: 0.55, dash: '2 4' },
          { key: 'maint', label: 'Maintenance', values: [0, 0], opacity: 0.55, dash: '10 6' },
        ],
      };
    }

    if (years === 5) {
      const s = hist.slice(-5);
      return {
        x: s.map((h) => String(h.year)),
        series: [
          { key: 'total', label: 'Total', values: s.map((h) => h.annualTotal), opacity: 0.9, strokeWidth: 2.75 },
          { key: 'tax', label: 'Taxes', values: s.map((h) => h.annualTax), opacity: 0.55, dash: '6 5' },
          { key: 'ins', label: 'Insurance', values: s.map((h) => h.annualInsurance), opacity: 0.55, dash: '2 4' },
          { key: 'maint', label: 'Maintenance', values: s.map((h) => h.annualMaintenance), opacity: 0.55, dash: '10 6' },
        ],
      };
    }

    // 10y: sample 5 points spaced by 2 years (like your other tools)
    const ten = hist.slice(-10);
    const sampled = [0, 2, 4, 6, 8].filter((i) => i < ten.length).map((i) => ten[i]);
    return {
      x: sampled.map((h) => String(h.year)),
      series: [
        { key: 'total', label: 'Total', values: sampled.map((h) => h.annualTotal), opacity: 0.9, strokeWidth: 2.75 },
        { key: 'tax', label: 'Taxes', values: sampled.map((h) => h.annualTax), opacity: 0.55, dash: '6 5' },
        { key: 'ins', label: 'Insurance', values: sampled.map((h) => h.annualInsurance), opacity: 0.55, dash: '2 4' },
        { key: 'maint', label: 'Maintenance', values: sampled.map((h) => h.annualMaintenance), opacity: 0.55, dash: '10 6' },
      ],
    };
  }, [data, years]);

  const costExplainerPriorityAction = (() => {
    if (!data || loading) return undefined;
    const lastYear = data?.snapshot?.history?.slice(-1)[0];
    if (!lastYear) return undefined;
    const drivers: Record<string, number> = {
      taxes: lastYear.annualTax ?? 0,
      insurance: lastYear.annualInsurance ?? 0,
      maintenance: lastYear.annualMaintenance ?? 0,
    };
    const topEntry = Object.entries(drivers).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    if (!topEntry) return undefined;
    const categoryLabels: Record<string, string> = {
      taxes: 'Property tax',
      insurance: 'Insurance',
      maintenance: 'Maintenance',
    };
    const topLabel = categoryLabels[topEntry[0]] ?? topEntry[0];
    const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    return {
      title: `${topLabel} is your largest cost driver at ${fmt(topEntry[1])}/year`,
      description: 'Review the breakdown below to see whether this driver is accelerating, and decide if action is warranted before your next renewal or reassessment.',
      impactLabel: `${years}-year driver lens`,
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
      title="Why Is My Home Cost Increasing?"
      subtitle="Plain-English breakdown of higher taxes, insurance, and maintenance drivers."
      introAction={
        <HomeToolsRail propertyId={propertyId} context="cost-explainer" currentToolId="cost-explainer" showDesktop={false} />
      }
      trust={{
        confidenceLabel: 'Medium confidence',
        freshnessLabel: data?.meta?.generatedAt ? 'Updated with latest driver calculation' : 'Run analysis to refresh',
        sourceLabel: 'Tax, insurance, maintenance, and property profile inputs',
        rationale: 'Explains which cost categories are driving homeowner spend growth and why.',
      }}
      priorityAction={costExplainerPriorityAction}
    >
      {/* Tool identity + Related tools — desktop only, above NBA */}
      <HomeToolHeader
        toolId="cost-explainer"
        propertyId={propertyId}
        context="cost-explainer"
        currentToolId="cost-explainer"
      />

      {/* Top block */}
      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">Cost drivers (explainable)</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
            <button
              type="button"
              onClick={async () => {
                if (years === 5) return;
                setYears(5);
                await load(5);
              }}
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                years === 5
                  ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
              }`}
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
              className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                years === 10
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
            <button onClick={() => load(years)} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Total annual (now)</div>
            <div className="mt-1 text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.snapshot?.annualTotalNow)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Δ vs last year</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.deltaVsPriorYear?.total)}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Taxes (now)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.annualTaxNow)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Δ</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.deltaVsPriorYear?.tax)}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Insurance (now)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.annualInsuranceNow)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Δ</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.deltaVsPriorYear?.insurance)}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs tracking-normal text-slate-500 dark:text-slate-300">Maintenance (now)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.annualMaintenanceNow)}</div>
            <div className="mt-1 text-xs tracking-normal text-slate-500 dark:text-slate-300">Δ</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.snapshot?.deltaVsPriorYear?.maintenance)}</div>
          </div>
        </div>

        {/* ✅ Trend chart */}
        <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200">Total</span>
            <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">Taxes</span>
            <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">Insurance</span>
            <span className="rounded-full border border-slate-300/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/45 dark:text-slate-300">Maintenance</span>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-300">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
          </div>

          <div className="text-slate-700 dark:text-slate-200">
            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              ariaLabel="Home cost trend chart"
            />
          </div>

          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Total is emphasized; Taxes/Insurance/Maintenance are shown as comparison lines. 10y view is sampled for readability.
          </div>
        </div>
      </div>

      {/* Explanations */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Plain-English breakdown</div>
          {loading && <span className="text-xs text-slate-500 dark:text-slate-300">Refreshing…</span>}
        </div>
        {data?.input?.state && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            Tied to <span className="font-medium">{data.input.state}</span> and ZIP{' '}
            <span className="font-medium">{data.input.zipCode}</span>.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {data && !loading && (data.explanations || []).length === 0 && (
            <div className="md:col-span-2 rounded-2xl border border-white/70 bg-white/70 p-4 text-center text-sm text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
              No breakdown available for this analysis.
            </div>
          )}
          {(data?.explanations || []).map((e, _idx, arr) => {
            const isFocused = focusCategory === e.category;
            return (
            <div
              key={e.category}
              data-cost-category={e.category}
              className={`rounded-2xl border bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:bg-slate-900/48 scroll-mt-8${arr.length % 2 !== 0 && _idx === arr.length - 1 ? ' md:col-span-2' : ''}${isFocused ? ' border-teal-300 ring-2 ring-teal-200 ring-offset-1' : ' border-white/70 dark:border-slate-700/70'}`}
            >
              <div className="mb-1 text-[10px] font-semibold tracking-normal text-slate-400 dark:text-slate-500">
                {e.category === 'TAXES' ? 'Property Tax' : e.category === 'INSURANCE' ? 'Insurance' : e.category === 'MAINTENANCE' ? 'Maintenance' : 'Total Cost'}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.headline}</div>
                {badgeForConfidence(e.confidence)}
              </div>
              <div className="mt-2 space-y-1">
                {(e.bullets || []).map((b, i) => (
                  <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {b}</div>
                ))}
              </div>
            </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="text-xs font-semibold tracking-normal text-slate-500 dark:text-slate-300">Assumptions</div>
          <div className="mt-2 space-y-1">
            {(data?.meta?.notes || []).length > 0 ? (
              (data?.meta?.notes || []).map((n, i) => (
                <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
              ))
            ) : (
              <div className="text-xs text-slate-400 dark:text-slate-500">No assumptions recorded for this analysis.</div>
            )}
          </div>
          {(data?.meta?.dataSources || []).length > 0 && (
            <div className="mt-3 border-t border-slate-200/60 pt-2 dark:border-slate-700/50">
              <div className="text-[10px] font-semibold tracking-normal text-slate-400 dark:text-slate-500">Data sources</div>
              <div className="mt-1 space-y-0.5">
                {(data?.meta?.dataSources ?? []).map((s, i) => (
                  <div key={i} className="text-xs text-slate-500 dark:text-slate-400">• {s}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceTemplate>
  );
}
