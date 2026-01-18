// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/SellHoldRentClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import MultiLineChart from '../cost-growth/MultiLineChart';

import { api } from '@/lib/api/client';
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

// Best-effort premium detection. If unknown, we default to "unlocked" to avoid breaking UX.
async function detectPremium(): Promise<boolean> {
  try {
    // Common patterns across apps; adjust later if your user API differs
    const res = await api.get('/api/users/me');
    const d: any = res.data;
    const u = d?.user ?? d?.data?.user ?? d;

    if (u?.isPremium === true) return true;
    if (u?.plan === 'PREMIUM' || u?.plan === 'PRO') return true;
    if (u?.subscription?.tier === 'PREMIUM') return true;
    if (u?.subscriptionStatus === 'ACTIVE' && u?.subscriptionTier === 'PREMIUM') return true;

    return false;
  } catch {
    // Unknown contract → don’t block tool.
    return true;
  }
}

function LockOverlay(props: { title: string; description: string }) {
  return (
    <div className="absolute inset-0 rounded-2xl bg-white/70 backdrop-blur-[2px] border border-black/10 flex items-center justify-center">
      <div className="max-w-[420px] text-center p-4">
        <div className="text-sm font-semibold">{props.title}</div>
        <div className="mt-1 text-xs text-black/70 leading-5">{props.description}</div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
          🔒 Premium
          <span className="opacity-60">Unlock full simulator</span>
        </div>
      </div>
    </div>
  );
}

export default function SellHoldRentClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SellHoldRentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPremium, setIsPremium] = useState<boolean>(true);

  async function load(y: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getSellHoldRent(propertyId, { years: y });
      setData(r);
    } catch (e: any) {
      setError(e?.message || 'Failed to load simulator');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const p = await detectPremium();
      setIsPremium(p);
    })();
  }, []);

  useEffect(() => {
    load(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const chartModel = useMemo(() => {
    const h = data?.history ?? [];
    const x = h.map((r) => String(r.year));

    // Show deltas as “annual net delta” to keep it calm and interpretable.
    return {
      x: x.length >= 2 ? x : ['—', '—'],
      series: [
        { key: 'hold', label: 'Hold net Δ', values: h.map((r) => r.holdNetDelta), opacity: 0.75, strokeWidth: 2.75 },
        { key: 'rent', label: 'Rent net Δ', values: h.map((r) => r.rentNetDelta), opacity: 0.55, dash: '6 5' },
      ],
    };
  }, [data]);

  const winner = data?.recommendation?.winner ?? 'HOLD';
  const winnerLabel = winner === 'SELL' ? 'Sell' : winner === 'RENT' ? 'Rent' : 'Hold';

  const sellNet = data?.scenarios?.sell?.netProceeds ?? 0;
  const holdNet = data?.scenarios?.hold?.net ?? 0;
  const rentNet = data?.scenarios?.rent?.net ?? 0;

  const teaserNet =
    winner === 'SELL' ? sellNet : winner === 'RENT' ? rentNet : holdNet;

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
          <div className="text-xs opacity-60">{loading ? 'Refreshing…' : data?.meta?.generatedAt ? 'Updated just now' : ''}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 space-y-3">
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Winner</div>
              <div className="text-lg font-semibold mt-1">{winnerLabel}</div>
              <div className="text-xs opacity-70 mt-2">Net outcome ({years}y)</div>
              <div className="text-base font-semibold">{money(teaserNet)}</div>
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

          <div className="md:col-span-8 rounded-xl border border-black/10 p-3 relative overflow-hidden">
            <div className={`${isPremium ? '' : 'blur-[2px]'}`}>
              <MultiLineChart xLabels={chartModel.x} series={chartModel.series} ariaLabel="Hold vs Rent annual net delta" />
              <div className="mt-2 text-xs opacity-60">
                Chart shows annual net delta (appreciation gain minus modeled costs). Sell is shown as a single net proceeds outcome.
              </div>
            </div>

            {!isPremium && (
              <LockOverlay
                title="Unlock full simulator"
                description="Free tier shows the best outcome + a high-level number. Upgrade to see scenario breakdowns, chart details, and assumptions."
              />
            )}
          </div>
        </div>
      </div>

      {/* Scenario Cards + Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-2xl border border-black/10 bg-white p-4 relative overflow-hidden">
          <div className={`${isPremium ? '' : 'blur-[2px]'}`}>
            <div className="text-sm font-medium">Scenario comparison</div>
            <div className="text-xs opacity-70 mt-1">Net outcomes over {years} years</div>

            <div className="mt-3">
              <ComparisonBars sell={sellNet} hold={holdNet} rent={rentNet} winner={winner} />
            </div>
          </div>

          {!isPremium && (
            <LockOverlay
              title="Scenario comparison (Premium)"
              description="Unlock to view full net outcomes and relative impact bars for all scenarios."
            />
          )}
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* SELL */}
          <div className="rounded-2xl border border-black/10 bg-white p-4 relative overflow-hidden">
            <div className={`${isPremium ? '' : 'blur-[2px]'}`}>
              <div className="text-sm font-medium">Sell</div>
              <div className="text-xs opacity-70 mt-1">Net proceeds ({years}y)</div>
              <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.sell?.netProceeds)}</div>

              <div className="mt-3 text-xs text-black/70 space-y-1">
                <div>Projected sale: <span className="font-medium">{money(data?.scenarios?.sell?.projectedSalePrice)}</span></div>
                <div>Selling costs: <span className="font-medium">{money(data?.scenarios?.sell?.sellingCosts)}</span></div>
              </div>

              <div className="mt-3 text-xs opacity-70 space-y-1">
                {(data?.scenarios?.sell?.notes || []).slice(0, 2).map((n, i) => (
                  <div key={i}>• {n}</div>
                ))}
              </div>
            </div>
            {!isPremium && <LockOverlay title="Sell breakdown (Premium)" description="Unlock to see Sell breakdown + assumptions." />}
          </div>

          {/* HOLD */}
          <div className="rounded-2xl border border-black/10 bg-white p-4 relative overflow-hidden">
            <div className={`${isPremium ? '' : 'blur-[2px]'}`}>
              <div className="text-sm font-medium">Hold</div>
              <div className="text-xs opacity-70 mt-1">Net outcome ({years}y)</div>
              <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.hold?.net)}</div>

              <div className="mt-3 text-xs text-black/70 space-y-1">
                <div>Appreciation gain: <span className="font-medium">{money(data?.scenarios?.hold?.appreciationGain)}</span></div>
                <div>Ownership costs: <span className="font-medium">{money(data?.scenarios?.hold?.totalOwnershipCosts)}</span></div>
              </div>

              <div className="mt-3 text-xs opacity-70 space-y-1">
                {(data?.scenarios?.hold?.notes || []).slice(0, 2).map((n, i) => (
                  <div key={i}>• {n}</div>
                ))}
              </div>
            </div>
            {!isPremium && <LockOverlay title="Hold breakdown (Premium)" description="Unlock to see Hold breakdown + assumptions." />}
          </div>

          {/* RENT */}
          <div className="rounded-2xl border border-black/10 bg-white p-4 relative overflow-hidden">
            <div className={`${isPremium ? '' : 'blur-[2px]'}`}>
              <div className="text-sm font-medium">Rent</div>
              <div className="text-xs opacity-70 mt-1">Net outcome ({years}y)</div>
              <div className="text-lg font-semibold mt-2">{money(data?.scenarios?.rent?.net)}</div>

              <div className="mt-3 text-xs text-black/70 space-y-1">
                <div>Rental income: <span className="font-medium">{money(data?.scenarios?.rent?.totalRentalIncome)}</span></div>
                <div>Vacancy + mgmt: <span className="font-medium">{money((data?.scenarios?.rent?.rentalOverheads?.vacancyLoss ?? 0) + (data?.scenarios?.rent?.rentalOverheads?.managementFees ?? 0))}</span></div>
              </div>

              <div className="mt-3 text-xs opacity-70 space-y-1">
                {(data?.scenarios?.rent?.notes || []).slice(0, 2).map((n, i) => (
                  <div key={i}>• {n}</div>
                ))}
              </div>
            </div>
            {!isPremium && <LockOverlay title="Rent breakdown (Premium)" description="Unlock to see Rent breakdown + assumptions." />}
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
