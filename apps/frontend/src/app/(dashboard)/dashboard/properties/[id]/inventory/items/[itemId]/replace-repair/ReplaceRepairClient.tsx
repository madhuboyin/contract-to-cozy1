'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Wrench } from 'lucide-react';
import { getInventoryItem } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InventoryItem } from '@/types';
import {
  getReplaceRepairAnalysis,
  ReplaceRepairAnalysisDTO,
  ReplaceRepairOverrides,
  runReplaceRepairAnalysis,
} from '@/lib/api/replaceRepairApi';

const CATEGORY_LIFESPAN_YEARS: Record<string, number> = {
  APPLIANCE: 12,
  HVAC: 15,
  PLUMBING: 12,
  ELECTRICAL: 14,
  ROOF_EXTERIOR: 24,
  SAFETY: 10,
  SMART_HOME: 8,
  FURNITURE: 11,
  ELECTRONICS: 7,
  OTHER: 10,
};

type DollarInputs = {
  estimatedNextRepairCostUsd: string;
  estimatedReplacementCostUsd: string;
  expectedRemainingYears: string;
  cashBufferUsd: string;
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  usageIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
};

const INITIAL_DOLLAR_INPUTS: DollarInputs = {
  estimatedNextRepairCostUsd: '',
  estimatedReplacementCostUsd: '',
  expectedRemainingYears: '',
  cashBufferUsd: '',
  riskTolerance: 'MEDIUM',
  usageIntensity: 'MEDIUM',
};

function centsToDollars(cents?: number | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '';
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.round(numeric * 100);
}

function money(cents?: number | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function compactDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function inferAgeYears(item: InventoryItem): number | null {
  const source = item.installedOn ?? item.purchasedOn;
  if (!source) return null;
  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return null;
  const years = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (!Number.isFinite(years) || years < 0) return null;
  return years;
}

function buildPrefillInputs(item: InventoryItem): Partial<DollarInputs> {
  const replacementCostUsd =
    item.replacementCostCents !== null && item.replacementCostCents !== undefined
      ? (item.replacementCostCents / 100).toFixed(2)
      : '';

  const lifespan = CATEGORY_LIFESPAN_YEARS[item.category] ?? CATEGORY_LIFESPAN_YEARS.OTHER;
  const ageYears = inferAgeYears(item);
  const remainingYears = ageYears !== null ? String(Math.max(0, Math.round((lifespan - ageYears) * 10) / 10)) : '';

  return {
    estimatedReplacementCostUsd: replacementCostUsd,
    expectedRemainingYears: remainingYears,
  };
}

function mergeInputs(current: DollarInputs, prefill: Partial<DollarInputs>): DollarInputs {
  return {
    estimatedNextRepairCostUsd: current.estimatedNextRepairCostUsd || prefill.estimatedNextRepairCostUsd || '',
    estimatedReplacementCostUsd: current.estimatedReplacementCostUsd || prefill.estimatedReplacementCostUsd || '',
    expectedRemainingYears: current.expectedRemainingYears || prefill.expectedRemainingYears || '',
    cashBufferUsd: current.cashBufferUsd || prefill.cashBufferUsd || '',
    riskTolerance: current.riskTolerance || prefill.riskTolerance || 'MEDIUM',
    usageIntensity: current.usageIntensity || prefill.usageIntensity || 'MEDIUM',
  };
}

function verdictClasses(verdict?: ReplaceRepairAnalysisDTO['verdict']) {
  if (verdict === 'REPAIR_ONLY') return 'bg-emerald-100 text-emerald-700';
  if (verdict === 'REPAIR_AND_MONITOR') return 'bg-amber-100 text-amber-700';
  if (verdict === 'REPLACE_SOON') return 'bg-orange-100 text-orange-700';
  return 'bg-rose-100 text-rose-700';
}

function verdictLabel(verdict?: ReplaceRepairAnalysisDTO['verdict']) {
  if (!verdict) return '—';
  return verdict.replaceAll('_', ' ');
}

export default function ReplaceRepairClient() {
  const router = useRouter();
  const params = useParams<{ id: string; itemId: string }>();
  const propertyId = params.id;
  const itemId = params.itemId;

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [analysis, setAnalysis] = useState<ReplaceRepairAnalysisDTO | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);
  const [inputs, setInputs] = useState<DollarInputs>(INITIAL_DOLLAR_INPUTS);

  useEffect(() => {
    setDidAutoPrefill(false);
  }, [itemId]);

  const fetchData = async () => {
    if (!propertyId || !itemId) return;
    setLoading(true);
    setError(null);

    try {
      const [itemResult, analysisResult] = await Promise.allSettled([
        getInventoryItem(propertyId, itemId),
        getReplaceRepairAnalysis(propertyId, itemId),
      ]);

      if (itemResult.status === 'fulfilled') {
        const nextItem = itemResult.value;
        setItem(nextItem);
        if (!didAutoPrefill) {
          setInputs((prev) => mergeInputs(prev, buildPrefillInputs(nextItem)));
          setDidAutoPrefill(true);
        }
      } else {
        setItem(null);
      }

      if (analysisResult.status === 'fulfilled') {
        if (analysisResult.value.exists) {
          setHasAnalysis(true);
          setAnalysis(analysisResult.value.analysis);
        } else {
          setHasAnalysis(false);
          setAnalysis(null);
        }
      } else {
        throw analysisResult.reason;
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load replace or repair analysis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, itemId, didAutoPrefill]);

  const overrides = useMemo<ReplaceRepairOverrides>(() => {
    return {
      estimatedNextRepairCostCents: dollarsToCents(inputs.estimatedNextRepairCostUsd),
      estimatedReplacementCostCents: dollarsToCents(inputs.estimatedReplacementCostUsd),
      expectedRemainingYears: inputs.expectedRemainingYears.trim() ? Number(inputs.expectedRemainingYears) : undefined,
      cashBufferCents: dollarsToCents(inputs.cashBufferUsd),
      riskTolerance: inputs.riskTolerance,
      usageIntensity: inputs.usageIntensity,
    };
  }, [inputs]);

  const runAnalysis = async () => {
    if (!propertyId || !itemId) return;
    setRunning(true);
    setError(null);
    try {
      const next = await runReplaceRepairAnalysis(propertyId, itemId, overrides);
      setAnalysis(next);
      setHasAnalysis(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to run replace or repair analysis.');
    } finally {
      setRunning(false);
    }
  };

  const statusTone = useMemo(() => {
    if (!analysis) return 'bg-gray-100 text-gray-700';
    if (analysis.status === 'STALE') return 'bg-amber-100 text-amber-700';
    if (analysis.status === 'ERROR') return 'bg-rose-100 text-rose-700';
    return 'bg-emerald-100 text-emerald-700';
  }, [analysis]);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-teal-700 hover:text-teal-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <section className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Replace or Repair</h1>
            <p className="text-sm text-gray-600 mt-1">
              Educational estimate to help decide whether to repair, replace soon, or replace now.
            </p>
            <div className="mt-2 text-sm text-gray-700">
              <div>
                Item: <span className="font-medium">{item?.name || 'Inventory Item'}</span>
              </div>
              <div>
                Category: <span className="font-medium">{item?.category || '—'}</span>
                {item?.room?.name ? ` • Room: ${item.room.name}` : ''}
              </div>
            </div>
          </div>
          <Wrench className="h-6 w-6 text-teal-600" />
        </div>
      </section>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational decision support only. This estimate does not guarantee outcomes or recommend specific vendors.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Inputs</h2>
        <p className="text-sm text-gray-600 mt-1">Optional overrides for your item-level scenario.</p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">
            Estimated next repair cost ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={inputs.estimatedNextRepairCostUsd}
              onChange={(e) => setInputs((prev) => ({ ...prev, estimatedNextRepairCostUsd: e.target.value }))}
            />
          </label>

          <label className="text-xs text-gray-600">
            Estimated replacement cost ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={inputs.estimatedReplacementCostUsd}
              onChange={(e) => setInputs((prev) => ({ ...prev, estimatedReplacementCostUsd: e.target.value }))}
            />
          </label>

          <label className="text-xs text-gray-600">
            Expected remaining years
            <input
              type="number"
              min={0}
              step="0.1"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={inputs.expectedRemainingYears}
              onChange={(e) => setInputs((prev) => ({ ...prev, expectedRemainingYears: e.target.value }))}
            />
          </label>

          <label className="text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              Cash buffer ($)
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is cash buffer"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      i
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>How much money could you spend on this today without stress</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={inputs.cashBufferUsd}
              onChange={(e) => setInputs((prev) => ({ ...prev, cashBufferUsd: e.target.value }))}
            />
          </label>

          <label className="text-xs text-gray-600">
            Risk tolerance
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              value={inputs.riskTolerance}
              onChange={(e) => setInputs((prev) => ({ ...prev, riskTolerance: e.target.value as any }))}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>

          <label className="text-xs text-gray-600">
            Usage intensity
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              value={inputs.usageIntensity}
              onChange={(e) => setInputs((prev) => ({ ...prev, usageIntensity: e.target.value as any }))}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={runAnalysis} disabled={running || loading}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : hasAnalysis ? (
              'Re-run analysis'
            ) : (
              'Run analysis'
            )}
          </Button>
          <Button variant="ghost" onClick={fetchData} disabled={loading}>
            Refresh
          </Button>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          <span className="text-sm text-gray-600">Loading analysis…</span>
        </div>
      )}

      {!loading && !analysis && (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">No analysis yet</h3>
          <p className="text-sm text-gray-600 mt-1">Run Replace or Repair to generate your item decision support.</p>
        </div>
      )}

      {!loading && analysis && (
        <>
          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">Decision result</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>{analysis.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{analysis.summary || 'No summary available.'}</p>
                <p className="text-xs text-gray-500 mt-1">Computed: {compactDate(analysis.computedAt)}</p>
              </div>

              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdictClasses(analysis.verdict)}`}>
                {verdictLabel(analysis.verdict)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Age</div>
                <div className="text-base font-semibold text-gray-900">
                  {analysis.ageYears !== undefined ? `${analysis.ageYears} year(s)` : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Remaining years</div>
                <div className="text-base font-semibold text-gray-900">
                  {analysis.remainingYears !== undefined ? analysis.remainingYears : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Estimated next repair</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.estimatedNextRepairCostCents)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Estimated replacement</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.estimatedReplacementCostCents)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Expected annual repair risk</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.expectedAnnualRepairRiskCents)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Break-even months</div>
                <div className="text-base font-semibold text-gray-900">{analysis.breakEvenMonths ?? '—'}</div>
              </div>
            </div>
          </section>

          {analysis.nextSteps && analysis.nextSteps.length > 0 && (
            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Next steps</h4>
              <div className="mt-3 space-y-2">
                {analysis.nextSteps.map((step, index) => (
                  <div key={`${step.title}-${index}`} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">{step.title}</div>
                      {step.priority && <span className="text-xs text-gray-500">{step.priority}</span>}
                    </div>
                    {step.detail && <div className="text-xs text-gray-600 mt-1">{step.detail}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <details open>
              <summary className="cursor-pointer text-base font-semibold text-gray-900">Why this?</summary>
              <div className="mt-3 space-y-2">
                {analysis.decisionTrace.map((trace, index) => (
                  <div
                    key={`${trace.label}-${index}`}
                    className="rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{trace.label}</div>
                      {trace.detail && <div className="text-xs text-gray-600 mt-1">{trace.detail}</div>}
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700">{trace.impact}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
