// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/SellHoldRentClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import MultiLineChart from '../cost-growth/MultiLineChart';

import { getSellHoldRent, SellHoldRentDTO } from './sellHoldRentApi';
import ComparisonBars from './ComparisonBars';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function pct(n?: number | null) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function SellHoldRentClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SellHoldRentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find the load function (around line 38) and update it:
  async function load(y: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getSellHoldRent(propertyId, { years: y });
      // Extract the nested object from the API response
      // @ts-ignore - handling the wrapper key from the API
      const actualData = r.sellHoldRent || r; 
      setData(actualData);
    } catch (e: any) {
      setError(e?.message || 'Failed to load simulator');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    // Use optional chaining for safety
    const h = data?.history ?? [];
    const x = h.map((r) => String(r.year));
    return {
      x: x.length >= 2 ? x : ['—', '—'],
      series: [
        { 
          key: 'hold', 
          label: 'Hold net Δ', 
          values: h.map((r) => r.holdNetDelta ?? 0), // Default to 0
          opacity: 0.75, 
          strokeWidth: 2.75 
        },
        { 
          key: 'rent', 
          label: 'Rent net Δ', 
          values: h.map((r) => r.rentNetDelta ?? 0), // Default to 0
          opacity: 0.55, 
          dash: '6 5' 
        },
      ],
    };
  }, [data]);

  // Update these variables (around line 65):
  const winner = data?.recommendation?.winner ?? 'HOLD';
  const winnerLabel = winner === 'SELL' ? 'Sell' : winner === 'RENT' ? 'Rent' : 'Hold';

  const sellNet = data?.scenarios?.sell?.netProceeds ?? 0;
  const holdNet = data?.scenarios?.hold?.net ?? 0;
  const rentNet = data?.scenarios?.rent?.net ?? 0;

  const winnerNet = winner === 'SELL' ? sellNet : winner === 'RENT' ? rentNet : holdNet;

    // ✅ Fix 2: Prevent empty placeholder $0.00 / “Hold” defaults during first load.
  // Show a calm loading shell until we have real data OR we have an error.
  if (!data && !error) {
    return (
      <div className="p-6 space-y-4">
        <SectionHeader
          icon="🎯"
          title="Sell vs Hold vs Rent"
          description="Compare outcomes using appreciation, ownership costs, and rental income assumptions."
        />

        <div className="mt-3">
          <HomeToolsRail propertyId={propertyId} />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Loading simulator…</div>
          <div className="text-xs opacity-70 mt-1">
            Pulling appreciation, ownership cost trends, and rental assumptions.
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="h-20 rounded-xl bg-black/5" />
            <div className="h-20 rounded-xl bg-black/5" />
            <div className="h-20 rounded-xl bg-black/5" />
          </div>

          <div className="mt-3 h-44 rounded-xl bg-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="🎯"
        title="Sell vs Hold vs Rent"
        description="Compare outcomes using appreciation, ownership costs, and rental income assumptions."
      />

      <div className="mt-3">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-black/60">
          Property-scoped decision simulator • {data?.meta?.confidence ? `Confidence: ${data.meta.confidence}` : 'Phase 1'}
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

      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Winner Story Card */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Best outcome</div>
            <div className="text-xs opacity-70 mt-1">
              For <span className="font-medium">{data?.input?.addressLabel || '—'}</span>
            </div>
          </div>
          <div className="text-xs opacity-60">
            {loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 space-y-3">
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Winner</div>
              <div className="text-lg font-semibold mt-1">{winnerLabel}</div>
              <div className="text-xs opacity-70 mt-2">Net outcome ({years}y)</div>
              <div className="text-base font-semibold">{money(winnerNet)}</div>
              <div className="text-xs opacity-60 mt-2">
                Appreciation {pct(data?.current?.appreciationRate)} • Rent now {money(data?.current?.monthlyRentNow)}
              </div>
            </div>

            <div className="rounded-xl bg-black/5 p-3">
              <div className="text-xs opacity-70">Rationale</div>
              <div className="mt-2 space-y-1">
                {(data?.recommendation?.rationale || []).slice(0, 3).map((r, i) => (
                  <div key={i} className="text-xs text-black/70">• {r}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-8 rounded-xl border border-black/10 p-3">
            <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Hold vs Rent annual net delta" />
            <div className="mt-2 text-xs opacity-60">
              Chart shows annual net delta (appreciation gain minus modeled costs). Sell is represented by net proceeds.
            </div>
          </div>
        </div>
      </div>

      {/* Scenario Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Scenario comparison</div>
          <div className="text-xs opacity-70 mt-1">Net outcomes over {years} years</div>
          <div className="mt-3">
            <ComparisonBars sell={sellNet} hold={holdNet} rent={rentNet} winner={winner} />
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* SELL */}
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-sm font-medium">Sell</div>
            <div className="text-xs opacity-70 mt-1">Net proceeds ({years}y)</div>
            <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.sell?.netProceeds)}</div>

            <div className="mt-3 text-xs text-black/70 space-y-1">
              <div>Projected sale: <span className="font-medium">{money(data?.scenarios?.sell?.projectedSalePrice)}</span></div>
              <div>Selling costs: <span className="font-medium">{money(data?.scenarios?.sell?.sellingCosts)}</span></div>
            </div>

            <div className="mt-3 text-xs opacity-70 space-y-1">
              {(data?.scenarios?.sell?.notes || []).slice(0, 2).map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          </div>

          {/* HOLD */}
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-sm font-medium">Hold</div>
            <div className="text-xs opacity-70 mt-1">Net outcome ({years}y)</div>
            <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.hold?.net)}</div>

            <div className="mt-3 text-xs text-black/70 space-y-1">
              <div>Appreciation gain: <span className="font-medium">{money(data?.scenarios?.hold?.appreciationGain)}</span></div>
              <div>Ownership costs: <span className="font-medium">{money(data?.scenarios?.hold?.totalOwnershipCosts)}</span></div>
            </div>

            <div className="mt-3 text-xs opacity-70 space-y-1">
              {(data?.scenarios?.hold?.notes || []).slice(0, 2).map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          </div>

          {/* RENT */}
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-sm font-medium">Rent</div>
            <div className="text-xs opacity-70 mt-1">Net outcome ({years}y)</div>
            <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.rent?.net)}</div>

            <div className="mt-3 text-xs text-black/70 space-y-1">
              <div>Rental income: <span className="font-medium">{money(data?.scenarios?.rent?.totalRentalIncome)}</span></div>
              <div>
                Vacancy + mgmt:{' '}
                <span className="font-medium">
                  {money((data?.scenarios?.rent?.rentalOverheads?.vacancyLoss ?? 0) + (data?.scenarios?.rent?.rentalOverheads?.managementFees ?? 0))}
                </span>
              </div>
            </div>

            <div className="mt-3 text-xs opacity-70 space-y-1">
              {(data?.scenarios?.rent?.notes || []).slice(0, 2).map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          </div>
        </div>
      </div>

      {/* Drivers + Assumptions */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Key drivers</div>
        <div className="text-xs opacity-70 mt-1">What is influencing the result in this model</div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.drivers || []).map((d, idx) => (
            <div key={idx} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{d.factor}</div>
                <span className="text-xs rounded px-2 py-0.5 border border-black/10 bg-black/5">{d.impact}</span>
              </div>
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
