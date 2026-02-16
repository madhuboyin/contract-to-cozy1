// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/sell-hold-rent/SellHoldRentClient.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import MultiLineChart from '../cost-growth/MultiLineChart';

import ComparisonBars from './ComparisonBars';
import {
  getSellHoldRent,
  getSellHoldRentOverrides,
  saveSellHoldRentOverrides,
  getFinanceSnapshot,
  saveFinanceSnapshot,
  SellHoldRentDTO,
  SellHoldRentOverridePatch,
  FinanceSnapshotDTO,
} from './sellHoldRentApi';

function money(n?: number | null, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function pct(n?: number | null) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function toNum(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function SellHoldRentClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [years, setYears] = useState<5 | 10>(5);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SellHoldRentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase-3: overrides + finance snapshot state
  const [ovLoading, setOvLoading] = useState(false);
  const [ovSaving, setOvSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapSaving, setSnapSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<FinanceSnapshotDTO | null>(null);
  const [snapDraft, setSnapDraft] = useState({
    mortgageBalance: '',
    interestRatePct: '',
    remainingTermMonths: '',
    monthlyPayment: '',
  });

  const loadSimulator = useCallback(async (y: 5 | 10) => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);

    try {
      const dto = await getSellHoldRent(propertyId, { years: y });
      setData(dto);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load simulator');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  const loadOverrides = useCallback(async () => {
    if (!propertyId) return;
    setOvLoading(true);
    try {
      const o = await getSellHoldRentOverrides(propertyId);
      setOverrides(o);

      // hydrate draft inputs (strings for input controls)
      setOverrideDraft({
        HOME_VALUE_NOW: o.HOME_VALUE_NOW !== undefined ? String(o.HOME_VALUE_NOW) : '',
        APPRECIATION_RATE: o.APPRECIATION_RATE !== undefined ? String(o.APPRECIATION_RATE) : '',
        SELLING_COST_RATE: o.SELLING_COST_RATE !== undefined ? String(o.SELLING_COST_RATE) : '',
        MONTHLY_RENT_NOW: o.MONTHLY_RENT_NOW !== undefined ? String(o.MONTHLY_RENT_NOW) : '',
        RENT_GROWTH_RATE: o.RENT_GROWTH_RATE !== undefined ? String(o.RENT_GROWTH_RATE) : '',
        VACANCY_RATE: o.VACANCY_RATE !== undefined ? String(o.VACANCY_RATE) : '',
        MANAGEMENT_RATE: o.MANAGEMENT_RATE !== undefined ? String(o.MANAGEMENT_RATE) : '',
      });
    } finally {
      setOvLoading(false);
    }
  }, [propertyId]);

  const loadSnapshot = useCallback(async () => {
    if (!propertyId) return;
    setSnapLoading(true);
    try {
      const snap = await getFinanceSnapshot(propertyId);
      setSnapshot(snap);

      setSnapDraft({
        mortgageBalance: snap?.mortgageBalance != null ? String(snap.mortgageBalance) : '',
        interestRatePct: snap?.interestRate != null ? String((snap.interestRate * 100).toFixed(3)) : '',
        remainingTermMonths: snap?.remainingTermMonths != null ? String(snap.remainingTermMonths) : '',
        monthlyPayment: snap?.monthlyPayment != null ? String(snap.monthlyPayment) : '',
      });
    } finally {
      setSnapLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadSimulator(years);
    loadOverrides();
    loadSnapshot();
  }, [loadSimulator, loadOverrides, loadSnapshot, years]);

  const hasScenarioData =
    !!data?.scenarios?.sell &&
    !!data?.scenarios?.hold &&
    !!data?.scenarios?.rent;

  const winner = data?.recommendation?.winner;
  const winnerLabel = winner === 'SELL' ? 'Sell' : winner === 'RENT' ? 'Rent' : winner === 'HOLD' ? 'Hold' : '—';

  const sellNet = data?.scenarios?.sell?.netProceeds ?? null;
  const holdNet = data?.scenarios?.hold?.net ?? null;
  const rentNet = data?.scenarios?.rent?.net ?? null;

  const winnerNet =
    winner === 'SELL' ? sellNet : winner === 'RENT' ? rentNet : winner === 'HOLD' ? holdNet : null;

  const chartModel = useMemo(() => {
    const h = data?.history ?? [];
    const x = h.map((r) => String(r.year));
    return {
      x: x.length >= 2 ? x : ['—', '—'],
      series: [
        { key: 'hold', label: 'Hold net Δ', values: h.map((r) => r.holdNetDelta), opacity: 0.75, strokeWidth: 2.75 },
        { key: 'rent', label: 'Rent net Δ', values: h.map((r) => r.rentNetDelta), opacity: 0.55, dash: '6 5' },
      ],
    };
  }, [data]);

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
          Property-scoped decision simulator • {data?.meta?.confidence ? `Confidence: ${data.meta.confidence}` : 'Phase 3'}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              if (years === 5) return;
              setYears(5);
              await loadSimulator(5);
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
              await loadSimulator(10);
            }}
            className={`text-xs underline ${years === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
          >
            10y
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <div className="text-sm text-red-600 flex-1">{error}</div>
          <button onClick={() => loadSimulator(years)} className="text-sm font-medium text-red-700 hover:text-red-900 shrink-0">Retry</button>
        </div>
      )}

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

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 md:grid-cols-12 gap-4">
          <div className="sm:col-span-4 md:col-span-4 space-y-3">
            <div className="rounded-xl border border-black/10 p-3">
              <div className="text-xs opacity-70">Winner</div>
              <div className="text-lg font-semibold mt-1">{winnerLabel}</div>

              <div className="text-xs opacity-70 mt-2">Net outcome ({years}y)</div>
              <div className="text-base font-semibold">
                {loading && !hasScenarioData ? '—' : money(winnerNet)}
              </div>

              <div className="text-xs opacity-60 mt-2">
                Appreciation {pct(data?.current?.appreciationRate)} • Rent now {money(data?.current?.monthlyRentNow)}
              </div>

              <div className="text-xs opacity-60 mt-1">
                Debt model{' '}
                <span className="font-medium">
                  {data?.current?.mortgage ? 'On' : 'Unknown'}
                </span>
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

          <div className="sm:col-span-8 md:col-span-8 rounded-xl border border-black/10 p-3">
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
            {loading && !hasScenarioData ? (
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs text-black/60">
                Loading scenarios…
              </div>
            ) : (
              <ComparisonBars sell={sellNet} hold={holdNet} rent={rentNet} winner={winner || undefined} />
            )}
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
              {'mortgagePayoff' in (data?.scenarios?.sell || {}) && (
                <div>Mortgage payoff: <span className="font-medium">{money(data?.scenarios?.sell?.mortgagePayoff)}</span></div>
              )}
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
              {'mortgageInterestCost' in (data?.scenarios?.hold || {}) && (
                <div>Mortgage interest: <span className="font-medium">{money(data?.scenarios?.hold?.mortgageInterestCost)}</span></div>
              )}
              {'principalToEquity' in (data?.scenarios?.hold || {}) && (
                <div>Principal to equity: <span className="font-medium">{money(data?.scenarios?.hold?.principalToEquity)}</span></div>
              )}
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
                  {money(
                    (data?.scenarios?.rent?.rentalOverheads?.vacancyLoss ?? 0) +
                      (data?.scenarios?.rent?.rentalOverheads?.managementFees ?? 0)
                  )}
                </span>
              </div>
              {'mortgageInterestCost' in (data?.scenarios?.rent || {}) && (
                <div>Mortgage interest: <span className="font-medium">{money(data?.scenarios?.rent?.mortgageInterestCost)}</span></div>
              )}
              {'principalToEquity' in (data?.scenarios?.rent || {}) && (
                <div>Principal to equity: <span className="font-medium">{money(data?.scenarios?.rent?.principalToEquity)}</span></div>
              )}
            </div>

            <div className="mt-3 text-xs opacity-70 space-y-1">
              {(data?.scenarios?.rent?.notes || []).slice(0, 2).map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          </div>
        </div>
      </div>

      {/* Key drivers + assumptions */}
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
          <div className="text-xs opacity-70">Assumptions</div>
          <div className="mt-2 space-y-1">
            {(data?.meta?.notes || []).map((n, i) => (
              <div key={i} className="text-xs text-black/70">• {n}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Phase-3: Override + Debt Snapshot Editor */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Model inputs</div>
            <div className="text-xs opacity-70 mt-1">
              Overrides are saved per property and automatically applied to this tool.
            </div>
          </div>
          <div className="text-xs opacity-60">
            {ovLoading || snapLoading ? 'Loading…' : ''}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Overrides */}
          <div className="lg:col-span-7 rounded-xl border border-black/10 p-3">
            <div className="text-sm font-medium">Overrides</div>
            <div className="text-xs opacity-60 mt-1">Leave blank to use the model default.</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InputField
                label="Home value now"
                placeholder="e.g. 600000"
                value={overrideDraft.HOME_VALUE_NOW || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, HOME_VALUE_NOW: v }))}
              />
              <InputField
                label="Monthly rent now"
                placeholder="e.g. 4800"
                value={overrideDraft.MONTHLY_RENT_NOW || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, MONTHLY_RENT_NOW: v }))}
              />
              <InputField
                label="Appreciation rate (decimal)"
                placeholder="e.g. 0.035"
                value={overrideDraft.APPRECIATION_RATE || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, APPRECIATION_RATE: v }))}
              />
              <InputField
                label="Selling cost rate (decimal)"
                placeholder="e.g. 0.06"
                value={overrideDraft.SELLING_COST_RATE || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, SELLING_COST_RATE: v }))}
              />
              <InputField
                label="Rent growth rate (decimal)"
                placeholder="e.g. 0.03"
                value={overrideDraft.RENT_GROWTH_RATE || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, RENT_GROWTH_RATE: v }))}
              />
              <InputField
                label="Vacancy rate (decimal)"
                placeholder="e.g. 0.06"
                value={overrideDraft.VACANCY_RATE || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, VACANCY_RATE: v }))}
              />
              <InputField
                label="Management rate (decimal)"
                placeholder="e.g. 0.08"
                value={overrideDraft.MANAGEMENT_RATE || ''}
                onChange={(v) => setOverrideDraft((p) => ({ ...p, MANAGEMENT_RATE: v }))}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-black/60">
                Applied overrides: {Object.keys(overrides || {}).length ? Object.keys(overrides).length : '0'}
              </div>

              <button
                type="button"
                disabled={ovSaving}
                onClick={async () => {
                  if (!propertyId) return;

                  const patch: SellHoldRentOverridePatch = {};
                  const keys = [
                    'HOME_VALUE_NOW',
                    'MONTHLY_RENT_NOW',
                    'APPRECIATION_RATE',
                    'SELLING_COST_RATE',
                    'RENT_GROWTH_RATE',
                    'VACANCY_RATE',
                    'MANAGEMENT_RATE',
                  ] as const;

                  for (const k of keys) {
                    const n = toNum(overrideDraft[k] || '');
                    if (n !== undefined) patch[k] = n;
                  }

                  setOvSaving(true);
                  try {
                    await saveSellHoldRentOverrides(propertyId, patch);
                    await loadOverrides();
                    await loadSimulator(years);
                  } finally {
                    setOvSaving(false);
                  }
                }}
                className="text-xs rounded-lg border border-black/10 bg-black/5 px-3 py-1.5 hover:bg-black/10 disabled:opacity-60"
              >
                {ovSaving ? 'Saving…' : 'Save overrides'}
              </button>
            </div>
          </div>

          {/* Debt snapshot */}
          <div className="lg:col-span-5 rounded-xl border border-black/10 p-3">
            <div className="text-sm font-medium">Debt snapshot</div>
            <div className="text-xs opacity-60 mt-1">
              If provided, SELL/HOLD/RENT outcomes become mortgage-aware.
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <InputField
                label="Mortgage balance"
                placeholder="e.g. 350000"
                value={snapDraft.mortgageBalance}
                onChange={(v) => setSnapDraft((p) => ({ ...p, mortgageBalance: v }))}
              />
              <InputField
                label="Interest rate (%)"
                placeholder="e.g. 6.25"
                value={snapDraft.interestRatePct}
                onChange={(v) => setSnapDraft((p) => ({ ...p, interestRatePct: v }))}
              />
              <InputField
                label="Remaining term (months)"
                placeholder="e.g. 312"
                value={snapDraft.remainingTermMonths}
                onChange={(v) => setSnapDraft((p) => ({ ...p, remainingTermMonths: v }))}
              />
              <InputField
                label="Monthly payment"
                placeholder="e.g. 2450"
                value={snapDraft.monthlyPayment}
                onChange={(v) => setSnapDraft((p) => ({ ...p, monthlyPayment: v }))}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-black/60">
                {snapshot?.lastVerifiedAt ? `Last verified: ${new Date(snapshot.lastVerifiedAt).toLocaleDateString()}` : 'Not set'}
              </div>

              <button
                type="button"
                disabled={snapSaving}
                onClick={async () => {
                  if (!propertyId) return;

                  const mb = toNum(snapDraft.mortgageBalance);
                  const irPct = toNum(snapDraft.interestRatePct);
                  const term = toNum(snapDraft.remainingTermMonths);
                  const pay = toNum(snapDraft.monthlyPayment);

                  const patch: Partial<FinanceSnapshotDTO> = {
                    mortgageBalance: mb ?? null,
                    interestRate: irPct !== undefined ? irPct / 100 : null,
                    remainingTermMonths: term ?? null,
                    monthlyPayment: pay ?? null,
                  };

                  setSnapSaving(true);
                  try {
                    await saveFinanceSnapshot(propertyId, patch);
                    await loadSnapshot();
                    await loadSimulator(years);
                  } finally {
                    setSnapSaving(false);
                  }
                }}
                className="text-xs rounded-lg border border-black/10 bg-black/5 px-3 py-1.5 hover:bg-black/10 disabled:opacity-60"
              >
                {snapSaving ? 'Saving…' : 'Save snapshot'}
              </button>
            </div>

            <div className="mt-3 text-xs text-black/60">
              Tip: This is not a full amortization import — it’s a lightweight snapshot for Phase-3 accuracy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField(props: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs text-black/70">{props.label}</div>
      <input
        className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode="decimal"
      />
    </label>
  );
}
