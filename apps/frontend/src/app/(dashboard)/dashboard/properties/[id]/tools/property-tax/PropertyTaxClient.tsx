// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tax/property-tax/PropertyTaxClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';

import { getPropertyTaxEstimate, PropertyTaxEstimateDTO } from './taxApi';
import HomeToolsRail from '../../components/HomeToolsRail';
function money(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
}

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function MiniLineChart({
  points,
}: {
  points: { xLabel: string; y: number }[];
}) {
  const w = 640;
  const h = 180;

  const padL = 54;
  const padR = 14;
  const padT = 12;
  const padB = 32;

  const safe =
    points.length >= 2
      ? points
      : [
          { xLabel: '—', y: 0 },
          { xLabel: '—', y: 0 },
        ];

  const rawMin = Math.min(...safe.map((p) => p.y));
  const rawMax = Math.max(...safe.map((p) => p.y), 1);
  const range = rawMax - rawMin;
  const rel = range / Math.max(rawMax, 1);

  // If variation is small, pad the scale to make slope visually meaningful.
  // Otherwise, start at 0 to show "absolute" level.
  let minY: number;
  let maxY: number;

  if (rel < 0.12) {
    const pad = Math.max(rawMax * 0.08, 250); // at least $250 padding
    minY = Math.max(0, rawMin - pad);
    maxY = rawMax + pad;
  } else {
    minY = 0;
    maxY = rawMax;
  }

  const spanY = Math.max(1e-6, maxY - minY);

  const xFor = (i: number) =>
    padL + (i * (w - padL - padR)) / Math.max(1, safe.length - 1);

  const yFor = (v: number) =>
    padT + (h - padT - padB) * (1 - (v - minY) / spanY);

  const path = safe
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.y).toFixed(2)}`)
    .join(' ');

  // ✅ 5 Y ticks (top -> bottom)
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((t) => minY + (maxY - minY) * t);

  // ✅ X ticks:
  // - If <= 5 points, show all labels (your requirement).
  // - If more (future), show first/mid/last.
  const xTicks =
    safe.length <= 5
      ? safe.map((p, idx) => ({ idx, label: p.xLabel }))
      : [
          { idx: 0, label: safe[0].xLabel },
          { idx: Math.floor((safe.length - 1) / 2), label: safe[Math.floor((safe.length - 1) / 2)].xLabel },
          { idx: safe.length - 1, label: safe[safe.length - 1].xLabel },
        ];

  const fmtMoneyShort = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${Math.round(v / 1000)}k`;
    return `$${Math.round(v)}`;
  };

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-[180px] text-black/70"
      preserveAspectRatio="none"
      role="img"
      aria-label="Property tax trend chart"
    >
      {/* axes */}
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />
      <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="currentColor" strokeOpacity="0.18" />

      {/* y ticks + grid */}
      {yTicks.map((v, i) => {
        const y = yFor(v);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="currentColor" strokeOpacity="0.06" />
            <text x={padL - 10} y={y + 4} fontSize="11" textAnchor="end" fill="currentColor" opacity="0.45">
              {fmtMoneyShort(v)}
            </text>
          </g>
        );
      })}

      {/* line */}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.75" />

      {/* x ticks */}
      {xTicks.map((t, i) => {
        const x = xFor(t.idx);
        return (
          <g key={i}>
            <line x1={x} y1={h - padB} x2={x} y2={h - padB + 5} stroke="currentColor" strokeOpacity="0.22" />
            <text x={x} y={h - 8} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.45">
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PropertyTaxClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<PropertyTaxEstimateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optional overrides UI (simple, can be enhanced later)
  const [assessedValue, setAssessedValue] = useState<string>(''); // USD
  const [taxRate, setTaxRate] = useState<string>(''); // decimal
  const [trendYears, setTrendYears] = useState<5 | 10>(5);
  const reqRef = React.useRef(0);

  async function getAndSet(years: 5 | 10) {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
  
    const av = assessedValue ? Number(assessedValue) : undefined;
    const tr = taxRate ? Number(taxRate) : undefined;
    const reqId = ++reqRef.current;
    try {
      const r = await getPropertyTaxEstimate(propertyId, {
        assessedValue: Number.isFinite(av as any) ? av : undefined,
        taxRate: Number.isFinite(tr as any) ? tr : undefined,
        historyYears: years,
      });

      if (reqId !== reqRef.current) return;
      setEstimate(r);
    } catch (e: any) {
      if (reqId !== reqRef.current) return;
      setError(e?.message || 'Failed to load property tax estimate');
    } finally {
      setLoading(false);
    }
  }
  
  async function refresh() {
    await getAndSet(trendYears);
  }

  useEffect(() => {
    if (!propertyId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const historyPoints = useMemo(() => {
    const hist = estimate?.history ?? [];
    if (!hist.length) return [];
  
    if (trendYears === 5) {
      return hist.slice(-5).map((h) => ({ xLabel: String(h.year), y: h.annualTax }));
    }
  
    // 10y: sample 5 points spaced by 2 years
    const ten = hist.slice(-10);
    const sampled = [0, 2, 4, 6, 8]
      .filter((i) => i < ten.length)
      .map((i) => ten[i]);
  
    return sampled.map((h) => ({ xLabel: String(h.year), y: h.annualTax }));
  }, [estimate, trendYears]);
    

  const confidenceBadge = (c?: string) => {
    const base = 'text-xs rounded px-2 py-0.5 border border-black/10';
    if (c === 'HIGH') return <span className={`${base} bg-emerald-50 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} bg-amber-50 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} bg-black/5 text-black/70`}>Estimated</span>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="🏷️"
        title="Property Tax Intelligence"
        description="Estimated property taxes, trend, projection, and what drives changes."
      />

      <div className="mt-4">
        <HomeToolsRail propertyId={propertyId} />
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Optional overrides</div>
        <div className="text-xs opacity-70 mt-1">
          If you know your assessed value or local rate, enter it for a tighter estimate.
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <div className="text-xs opacity-70 mb-1">Assessed value (USD)</div>
            <input
              value={assessedValue}
              onChange={(e) => setAssessedValue(e.target.value)}
              placeholder="e.g. 425000"
              inputMode="decimal"
              className={`w-full rounded-xl border px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm ${assessedValue && !Number.isFinite(Number(assessedValue)) ? 'border-red-300' : 'border-black/10'}`}
            />
            {assessedValue && !Number.isFinite(Number(assessedValue)) && (
              <div className="text-xs text-red-500 mt-1">Enter a valid number</div>
            )}
          </label>

          <label className="text-sm">
            <div className="text-xs opacity-70 mb-1">Tax rate (decimal)</div>
            <input
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="e.g. 0.0185"
              inputMode="decimal"
              className={`w-full rounded-xl border px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm ${taxRate && !Number.isFinite(Number(taxRate)) ? 'border-red-300' : 'border-black/10'}`}
            />
            {taxRate && !Number.isFinite(Number(taxRate)) && (
              <div className="text-xs text-red-500 mt-1">Enter a valid number</div>
            )}
          </label>

          <div className="flex items-end">
            <button
              onClick={refresh}
              disabled={loading}
              className="w-full rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh estimate'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
            <div className="text-sm text-red-600 flex-1">{error}</div>
            <button onClick={() => refresh()} className="text-sm font-medium text-red-700 hover:text-red-900 shrink-0">Retry</button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Estimated annual property tax</div>
              <div className="text-xs opacity-70 mt-1">{estimate?.input?.addressLabel || '—'}</div>
            </div>
            {confidenceBadge(estimate?.current?.confidence)}
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-2xl font-semibold">{money(estimate?.current?.annualTax)}</div>
              <div className="text-xs opacity-70 mt-1">≈ {money(estimate?.current?.monthlyTax)} / month</div>
            </div>

            <div className="text-right">
              <div className="text-xs opacity-70">Assessed value</div>
              <div className="text-sm font-medium">{money(estimate?.current?.assessedValue)}</div>
              <div className="text-xs opacity-70 mt-1">Rate: {estimate?.current?.taxRate ? pct(estimate.current.taxRate) : '—'}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs opacity-70">
              Trend (last {estimate?.history?.length || trendYears} yrs)
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (trendYears === 5) return;
                  setTrendYears(5);
                  await getAndSet(5);
                }}
                className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${trendYears === 5 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                5y
              </button>
              <span className="text-xs opacity-40">|</span>
              <button
                type="button"
                onClick={async () => {
                  if (trendYears === 10) return;
                  setTrendYears(10);
                  await getAndSet(10);
                }}
                className={`text-xs underline min-h-[44px] inline-flex items-center px-1 touch-manipulation ${trendYears === 10 ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                10y
              </button>
              <div className="text-xs opacity-60 mt-1">Projection shown below</div>
            </div>
          </div>


          <div className="mt-2 text-black/70">
            <MiniLineChart points={historyPoints} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(estimate?.projection || []).map((p) => (
              <div key={p.years} className="rounded-xl border border-black/10 px-3 py-2">
                <div className="text-xs opacity-70">{p.years}-year est.</div>
                <div className="text-sm font-medium">{money(p.estimatedAnnualTax)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison */}
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="text-sm font-medium">Comparison</div>
          <div className="text-xs opacity-70 mt-1">
            Approximate percentile within your state: <span className="font-medium">{estimate?.comparison?.percentileApprox ?? '—'}%</span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs opacity-70">City median (est.)</div>
              <div className="text-sm font-medium">{money(estimate?.comparison?.cityMedianAnnualTax)}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">County median (est.)</div>
              <div className="text-sm font-medium">{money(estimate?.comparison?.countyMedianAnnualTax)}</div>
            </div>
            <div>
              <div className="text-xs opacity-70">State median (est.)</div>
              <div className="text-sm font-medium">{money(estimate?.comparison?.stateMedianAnnualTax)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-black/5 p-3">
            <div className="text-xs opacity-70">Note</div>
            <div className="text-xs text-black/70 mt-1">
              Comparisons are heuristic in v1. You can later swap in county/city medians from open data without changing the UI.
            </div>
          </div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">What impacts your property tax</div>
        <div className="text-xs opacity-70 mt-1">Plain-English drivers to help explain increases over time.</div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(estimate?.drivers || []).map((d) => (
            <div key={d.factor} className="rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{d.factor}</div>
                <span className="text-xs rounded px-2 py-0.5 bg-black/5 border border-black/10">
                  {d.impact}
                </span>
              </div>
              <div className="text-xs opacity-70 mt-2">{d.explanation}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="text-sm font-medium">Data & assumptions</div>
        <div className="mt-2 text-xs opacity-70 space-y-1">
          {(estimate?.meta?.notes || []).slice(0, 6).map((n, idx) => (
            <div key={idx}>• {n}</div>
          ))}
          <div className="pt-2 opacity-60">Generated: {estimate?.meta?.generatedAt || '—'}</div>
        </div>
      </div>
    </div>
  );
}
