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
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="🎯"
        title="True Cost of Home Ownership"
        description="A 5-year reality check that includes taxes, insurance, maintenance, and utilities — built for buyer + planning decisions."
      />

      <div className="mt-3">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">5-year projection</div>
            <div className="text-xs opacity-70 mt-1">
              <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>
          <div className="text-xs opacity-60">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Total (5y)</div>
            <div className="text-lg font-semibold">{money(data?.rollup?.total5y)}</div>
            <div className="text-xs opacity-70 mt-1">Annual (now)</div>
            <div className="text-sm font-medium">{money(data?.current?.annualTotalNow)}</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Taxes (5y)</div>
            <div className="text-base font-semibold">{money(data?.rollup?.breakdown5y?.taxes)}</div>
            <div className="text-xs opacity-70 mt-1">Annual (now)</div>
            <div className="text-sm font-medium">{money(data?.current?.annualTaxNow)}</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Insurance (5y)</div>
            <div className="text-base font-semibold">{money(data?.rollup?.breakdown5y?.insurance)}</div>
            <div className="text-xs opacity-70 mt-1">Annual (now)</div>
            <div className="text-sm font-medium">{money(data?.current?.annualInsuranceNow)}</div>
          </div>

          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Maintenance + Utilities (5y)</div>
            <div className="text-base font-semibold">
              {money(
                (data?.rollup?.breakdown5y?.maintenance ?? 0) +
                  (data?.rollup?.breakdown5y?.utilities ?? 0)
              )}
            </div>
            <div className="text-xs opacity-70 mt-1">Annual (now)</div>
            <div className="text-sm font-medium">
              {money((data?.current?.annualMaintenanceNow ?? 0) + (data?.current?.annualUtilitiesNow ?? 0))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-black/10 p-3">
          <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="True cost trend chart" />
          <div className="mt-2 text-xs opacity-60">
            Total is emphasized; other lines show the components that drive the “true cost”.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Localized insights</div>
        <div className="text-xs opacity-70 mt-1">
          Tied to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-xl border border-black/10 p-3">
              <div className="text-sm font-medium">{d.factor}</div>
              <div className="text-xs text-black/70 mt-2">{d.explanation}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-black/5 p-3">
          <div className="text-xs opacity-70">Assumptions (Phase 1)</div>
          <div className="mt-2 space-y-1">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-black/70">• {n}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
