// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-explainer/CostExplainerClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import { getCostExplainer, CostExplainerDTO } from './costExplainerApi';
import MultiLineChart from '../insurance-trend/MultiLineChart';
import HomeToolsRail from '../../components/HomeToolsRail';
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

export default function CostExplainerClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CostExplainerDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reqRef = React.useRef(0);

  async function load(nextYears: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const reqId = ++reqRef.current;
      const r = await getCostExplainer(propertyId, { years: nextYears });
      if (reqId !== reqRef.current) return;
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to load explainer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

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

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="🧘"
        title="Why Is My Home Cost Increasing?"
        description="Plain-English breakdown of what’s driving higher taxes, insurance, and maintenance — tied to your state + ZIP."
      />
      <div className="mt-4">
        <HomeToolsRail propertyId={propertyId} />
      </div>
      {/* Top block */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Cost drivers (explainable)</div>
            <div className="text-xs opacity-70 mt-1">
              <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (years === 5) return;
                setYears(5);
                await load(5);
              }}
              className={`text-xs underline ${years === 5 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              5y
            </button>
            <span className="text-xs opacity-40">|</span>
            <button
              type="button"
              onClick={async () => {
                if (years === 10) return;
                setYears(10);
                await load(10);
              }}
              className={`text-xs underline ${years === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              10y
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mt-3">{error}</div>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Total annual (now)</div>
            <div className="text-lg font-semibold">{money(data?.snapshot?.annualTotalNow)}</div>
            <div className="text-xs opacity-70 mt-1">Δ vs last year</div>
            <div className="text-sm font-medium">{money(data?.snapshot?.deltaVsPriorYear?.total)}</div>
          </div>
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Taxes (now)</div>
            <div className="text-base font-semibold">{money(data?.snapshot?.annualTaxNow)}</div>
            <div className="text-xs opacity-70 mt-1">Δ</div>
            <div className="text-sm font-medium">{money(data?.snapshot?.deltaVsPriorYear?.tax)}</div>
          </div>
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Insurance (now)</div>
            <div className="text-base font-semibold">{money(data?.snapshot?.annualInsuranceNow)}</div>
            <div className="text-xs opacity-70 mt-1">Δ</div>
            <div className="text-sm font-medium">{money(data?.snapshot?.deltaVsPriorYear?.insurance)}</div>
          </div>
          <div className="rounded-xl border border-black/10 p-3">
            <div className="text-xs opacity-70">Maintenance (now)</div>
            <div className="text-base font-semibold">{money(data?.snapshot?.annualMaintenanceNow)}</div>
            <div className="text-xs opacity-70 mt-1">Δ</div>
            <div className="text-sm font-medium">{money(data?.snapshot?.deltaVsPriorYear?.maintenance)}</div>
          </div>
        </div>

        {/* ✅ Trend chart */}
        <div className="mt-4 rounded-xl border border-black/10 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white">Total</span>
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-80">Taxes</span>
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-80">Insurance</span>
            <span className="text-xs rounded-full border border-black/10 px-2 py-0.5 bg-white opacity-80">Maintenance</span>
            <span className="text-xs opacity-60 ml-auto">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</span>
          </div>

          <div className="text-black/70">
            <MultiLineChart
              xLabels={chartModel.x}
              series={chartModel.series}
              ariaLabel="Home cost trend chart"
            />
          </div>

          <div className="mt-2 text-xs opacity-60">
            Total is emphasized; Taxes/Insurance/Maintenance are shown as comparison lines. 10y view is sampled for readability.
          </div>
        </div>
      </div>

      {/* Explanations */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Plain-English breakdown</div>
        <div className="text-xs opacity-70 mt-1">
          Tied to <span className="font-medium">{data?.input?.state || '—'}</span> and ZIP{' '}
          <span className="font-medium">{data?.input?.zipCode || '—'}</span>.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.explanations || []).map((e, idx) => (
            <div key={idx} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{e.headline}</div>
                {badgeForConfidence(e.confidence)}
              </div>
              <div className="mt-2 space-y-1">
                {(e.bullets || []).map((b, i) => (
                  <div key={i} className="text-xs text-black/70">• {b}</div>
                ))}
              </div>
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
          <div className="text-xs text-black/60 mt-2">
            {loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
