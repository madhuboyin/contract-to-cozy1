// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/TrueCostClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import { getTrueCostOwnership, TrueCostOwnershipDTO } from './trueCostApi';

// Use the upgraded chart you already shipped (legend + tooltip)
import MultiLineChart from '../cost-growth/MultiLineChart';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

export default function TrueCostClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrueCostOwnershipDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getTrueCostOwnership(propertyId);
      setData(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load true cost');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    const h = data?.history ?? [];
    const x = h.map((r) => String(r.year));
    return {
      x,
      series: [
        { key: 'total', label: 'Total', values: h.map((r) => r.annualTotal), opacity: 0.9, strokeWidth: 2.75 },
        { key: 'tax', label: 'Taxes', values: h.map((r) => r.annualTax), opacity: 0.55, dash: '6 5' },
        { key: 'ins', label: 'Insurance', values: h.map((r) => r.annualInsurance), opacity: 0.55, dash: '2 4' },
        { key: 'maint', label: 'Maintenance', values: h.map((r) => r.annualMaintenance), opacity: 0.55, dash: '10 6' },
        { key: 'util', label: 'Utilities', values: h.map((r) => r.annualUtilities), opacity: 0.45, dash: '1 6' },
      ],
    };
  }, [data]);

  return (
    <div className="space-y-5 p-4 sm:p-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <SectionHeader
            icon="🎯"
            title="True Cost of Home Ownership"
            description="A 5-year reality check that includes taxes, insurance, maintenance, and utilities — built for buyer + planning decisions."
          />

          <div className="mt-4">
            <HomeToolsRail propertyId={propertyId} />
          </div>
        </div>
      </div>

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

      <div className="rounded-[26px] border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/70 to-teal-50/45 p-4 sm:p-5 shadow-[0_20px_42px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/60 dark:via-slate-900/50 dark:to-teal-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">5-year projection</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-300">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Total (5y)</div>
            <div className="mt-1 text-[1.7rem] font-semibold leading-tight text-slate-900 dark:text-slate-100">{money(data?.rollup?.total5y)}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualTotalNow)}</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Taxes (5y)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.breakdown5y?.taxes)}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualTaxNow)}</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Insurance (5y)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">{money(data?.rollup?.breakdown5y?.insurance)}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(data?.current?.annualInsuranceNow)}</div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Maintenance + Utilities (5y)</div>
            <div className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">
              {money(
                (data?.rollup?.breakdown5y?.maintenance ?? 0) +
                  (data?.rollup?.breakdown5y?.utilities ?? 0)
              )}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Annual (now)</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {money((data?.current?.annualMaintenanceNow ?? 0) + (data?.current?.annualUtilitiesNow ?? 0))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="True cost trend chart" />
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Total is emphasized; other lines show the components that drive the “true cost”.
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
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
          <div className="text-xs text-slate-500 dark:text-slate-300">Assumptions (Phase 1)</div>
          <div className="mt-2 space-y-1">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {n}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
