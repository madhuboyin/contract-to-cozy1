// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tax/property-tax/PropertyTaxClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { getPropertyTaxEstimate, PropertyTaxEstimateDTO } from './taxApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import { Button } from '@/components/ui/button';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
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
      className="h-[180px] w-full text-slate-600 dark:text-slate-300"
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
    // User enters percent (e.g. 1.85); API expects decimal (e.g. 0.0185)
    const trPct = taxRate ? Number(taxRate) : undefined;
    const tr = trPct !== undefined && Number.isFinite(trPct) ? trPct / 100 : undefined;
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
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur';
    if (c === 'HIGH') return <span className={`${base} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`}>High confidence</span>;
    if (c === 'MEDIUM') return <span className={`${base} border-amber-200/70 bg-amber-50/85 text-amber-800`}>Medium confidence</span>;
    return <span className={`${base} border-slate-300/70 bg-slate-50/85 text-slate-700`}>Estimated</span>;
  };

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home Tool"
      title="Property Tax Intelligence"
      subtitle="Review tax estimates, trend projection, and key drivers behind changes."
      rail={<HomeToolsRail propertyId={propertyId} context="property-tax" currentToolId="property-tax" />}
      trust={{
        confidenceLabel: estimate?.current?.confidence ?? 'Estimated confidence',
        freshnessLabel: estimate?.meta?.generatedAt ? 'Updated with latest tax model run' : 'Run estimate to refresh',
        sourceLabel: 'Property value assumptions + local rate estimates + historical trend projection',
        rationale: 'Surfaces annual tax direction and major contributors so planning decisions stay proactive.',
      }}
      priorityAction={{
        title: 'Validate your assessed value assumptions',
        description: 'Apply assessed value and local rate overrides to reduce uncertainty before acting on projected taxes.',
        impactLabel: `${trendYears}-year projection`,
        confidenceLabel: estimate?.current?.confidence ?? 'Medium',
        primaryAction: (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              const nextYears = trendYears === 5 ? 10 : 5;
              setTrendYears(nextYears);
              void getAndSet(nextYears);
            }}
          >
            Switch to {trendYears === 5 ? '10-year' : '5-year'} projection
          </Button>
        ),
      }}
    >

      {/* Controls */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Optional overrides</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          If you know your assessed value or local rate, enter it for a tighter estimate.
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-300">Assessed value (USD)</div>
            <input
              value={assessedValue}
              onChange={(e) => setAssessedValue(e.target.value)}
              placeholder="e.g. 425000"
              inputMode="decimal"
              className={`min-h-[44px] w-full rounded-xl border bg-white/85 px-3 py-2.5 text-sm text-slate-800 shadow-sm backdrop-blur outline-none transition-colors focus:ring-2 dark:bg-slate-900/55 dark:text-slate-100 sm:min-h-0 sm:py-2 ${assessedValue && !Number.isFinite(Number(assessedValue)) ? 'border-red-300 focus:ring-red-200 dark:border-red-700/70 dark:focus:ring-red-800/60' : 'border-slate-300/70 focus:border-slate-400 focus:ring-slate-200 dark:border-slate-700/70 dark:focus:border-slate-500 dark:focus:ring-slate-700'}`}
            />
            {assessedValue && !Number.isFinite(Number(assessedValue)) && (
              <div className="text-xs text-red-500 mt-1">Enter a valid number</div>
            )}
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-300">Tax rate (%)</div>
            <input
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="e.g. 1.85"
              inputMode="decimal"
              className={`min-h-[44px] w-full rounded-xl border bg-white/85 px-3 py-2.5 text-sm text-slate-800 shadow-sm backdrop-blur outline-none transition-colors focus:ring-2 dark:bg-slate-900/55 dark:text-slate-100 sm:min-h-0 sm:py-2 ${taxRate && !Number.isFinite(Number(taxRate)) ? 'border-red-300 focus:ring-red-200 dark:border-red-700/70 dark:focus:ring-red-800/60' : 'border-slate-300/70 focus:border-slate-400 focus:ring-slate-200 dark:border-slate-700/70 dark:focus:border-slate-500 dark:focus:ring-slate-700'}`}
            />
            {taxRate && !Number.isFinite(Number(taxRate)) && (
              <div className="text-xs text-red-500 mt-1">Enter a valid number</div>
            )}
          </label>

          <div className="flex items-end">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-300/70 bg-white/85 px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-white disabled:opacity-50 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {loading ? 'Refreshing…' : 'Refresh estimate'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3 backdrop-blur">
            <div className="flex-1 text-sm text-red-600">{error}</div>
            <button onClick={() => refresh()} className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900">Retry</button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estimated annual property tax</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{estimate?.input?.addressLabel || '—'}</div>
            </div>
            {confidenceBadge(estimate?.current?.confidence)}
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{money(estimate?.current?.annualTax)}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">≈ {money(estimate?.current?.monthlyTax)} / month</div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-300">Assessed value</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{money(estimate?.current?.assessedValue)}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Rate: {estimate?.current?.taxRate ? pct(estimate.current.taxRate) : '—'}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-300">
              Trend (last {estimate?.history?.length || trendYears} yrs)
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/55">
              <button
                type="button"
                onClick={async () => {
                  if (trendYears === 5) return;
                  setTrendYears(5);
                  await getAndSet(5);
                }}
                className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                  trendYears === 5
                    ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
                }`}
              >
                5y
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (trendYears === 10) return;
                  setTrendYears(10);
                  await getAndSet(10);
                }}
                className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-all touch-manipulation ${
                  trendYears === 10
                    ? 'border border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border border-transparent text-slate-600 hover:border-slate-300/70 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900/60'
                }`}
              >
                10y
              </button>
            </div>
          </div>


          <div className="mt-2 text-slate-700 dark:text-slate-200">
            <MiniLineChart points={historyPoints} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(estimate?.projection || []).map((p) => (
              <div key={p.years} className="rounded-xl border border-slate-300/70 bg-white/80 px-3 py-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55">
                <div className="text-xs text-slate-500 dark:text-slate-300">{p.years}-year est.</div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{money(p.estimatedAnnualTax)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison */}
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comparison</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            Approximate percentile within your state: <span className="font-medium">{estimate?.comparison?.percentileApprox ?? '—'}%</span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-300">City median (est.)</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{money(estimate?.comparison?.cityMedianAnnualTax)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-300">County median (est.)</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{money(estimate?.comparison?.countyMedianAnnualTax)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-300">State median (est.)</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{money(estimate?.comparison?.stateMedianAnnualTax)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/70 bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
            <div className="text-xs text-slate-500 dark:text-slate-300">Note</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Median figures are estimates based on state and county-level averages. Your actual position may vary by local assessment district.
            </div>
          </div>
        </div>
      </div>

      {/* Drivers */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What impacts your property tax</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Plain-English drivers to help explain increases over time.</div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(estimate?.drivers || []).map((d) => (
            <div key={d.factor} className="rounded-2xl border border-white/70 bg-white/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/48">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.factor}</div>
                <span className="rounded-full border border-slate-300/70 bg-slate-50/85 px-2.5 py-1 text-xs text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-300">
                  {d.impact}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.explanation}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data & assumptions</div>
        <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {(estimate?.meta?.notes || []).slice(0, 6).map((n, idx) => (
            <div key={idx}>• {n}</div>
          ))}
          <div className="pt-2 text-slate-500 dark:text-slate-300">Generated: {estimate?.meta?.generatedAt || '—'}</div>
        </div>
      </div>

      {estimate && (
        <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">What to do next</div>
          <div className="mt-3 space-y-2">
            {estimate.comparison?.percentileApprox !== undefined && estimate.comparison.percentileApprox > 60 && (
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300">
                Your estimated tax is in the <span className="font-semibold">{estimate.comparison.percentileApprox}th percentile</span> for your state — above the majority of homeowners. Consider reviewing your assessed value with your county assessor; an informal appeal can reduce your bill if the valuation is above market.
              </div>
            )}
            {estimate.comparison?.percentileApprox !== undefined && estimate.comparison.percentileApprox <= 60 && (
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-3 text-xs text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                Your estimated tax is below the majority of similar homeowners in your state. Review annually — reassessment cycles or local budget changes can shift your bill unexpectedly.
              </div>
            )}
            {!estimate.comparison?.percentileApprox && (
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
                Enter your assessed value override above for a sharper estimate, then compare to your county assessor's records annually.
              </div>
            )}
            <div className="rounded-xl border border-white/70 bg-white/70 p-3 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/48 dark:text-slate-300">
              See how taxes fit into your total cost picture with the <span className="font-medium">True Cost of Ownership</span> tool — it combines taxes, insurance, maintenance, and utilities into one view.
            </div>
          </div>
        </div>
      )}
    </ToolWorkspaceTemplate>
  );
}
