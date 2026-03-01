'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import {
  ItemCoverageAnalysisDTO,
  ItemCoverageAnalysisOverrides,
  getItemCoverageAnalysis,
  runItemCoverageAnalysis,
} from '@/lib/api/coverageAnalysisApi';
import { getInventoryItem } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { InventoryItem } from '@/types';

type TraceImpact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

const EMPTY_OVERRIDES: ItemCoverageAnalysisOverrides = {
  coverageType: 'WARRANTY',
  annualCostUsd: undefined,
  serviceFeeUsd: undefined,
  cashBufferUsd: undefined,
  riskTolerance: 'MEDIUM',
  replacementCostUsd: undefined,
  expectedRemainingYears: undefined,
};

const CATEGORY_LIFESPAN_YEARS: Record<string, number> = {
  APPLIANCE: 12,
  HVAC: 15,
  PLUMBING: 20,
  ELECTRICAL: 22,
  ROOF_EXTERIOR: 24,
  SAFETY: 10,
  SMART_HOME: 8,
  FURNITURE: 11,
  ELECTRONICS: 7,
  OTHER: 10,
};

function money(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function compactDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function toInputValue(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '';
  return String(value);
}

function verdictClasses(verdict?: ItemCoverageAnalysisDTO['overallVerdict']) {
  if (verdict === 'WORTH_IT') return 'bg-emerald-100 text-emerald-700';
  if (verdict === 'NOT_WORTH_IT') return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-700';
}

function impactClasses(impact?: TraceImpact) {
  if (impact === 'POSITIVE') return 'bg-emerald-50 text-emerald-700';
  if (impact === 'NEGATIVE') return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

function recommendationCopy(recommendation?: ItemCoverageAnalysisDTO['warranty']['recommendation']) {
  if (recommendation === 'BUY_NOW') return 'Buy coverage now';
  if (recommendation === 'REPLACE_SOON') return 'Plan replacement soon';
  if (recommendation === 'WAIT') return 'Wait and monitor';
  return '—';
}

function mapItemCategoryToWarrantyCategory(category?: string): string {
  if (category === 'HVAC') return 'HVAC';
  if (category === 'PLUMBING') return 'PLUMBING';
  if (category === 'ELECTRICAL') return 'ELECTRICAL';
  if (category === 'ROOF_EXTERIOR') return 'ROOFING';
  if (category === 'APPLIANCE') return 'APPLIANCE';
  return 'OTHER';
}

function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/dashboard/')) return null;
  return raw;
}

function normalizeOverrides(overrides: ItemCoverageAnalysisOverrides): ItemCoverageAnalysisOverrides {
  const parsed: ItemCoverageAnalysisOverrides = {
    coverageType: overrides.coverageType ?? 'WARRANTY',
    riskTolerance: overrides.riskTolerance ?? 'MEDIUM',
  };

  const numericKeys: Array<
    'annualCostUsd' | 'serviceFeeUsd' | 'cashBufferUsd' | 'replacementCostUsd' | 'expectedRemainingYears'
  > = ['annualCostUsd', 'serviceFeeUsd', 'cashBufferUsd', 'replacementCostUsd', 'expectedRemainingYears'];

  for (const key of numericKeys) {
    const value = overrides[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      parsed[key] = value;
    }
  }

  return parsed;
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

function buildPrefillOverrides(item: InventoryItem): ItemCoverageAnalysisOverrides {
  const replacementCostUsd =
    item.replacementCostCents !== null && item.replacementCostCents !== undefined
      ? Math.round((item.replacementCostCents / 100) * 100) / 100
      : undefined;

  const lifespan = CATEGORY_LIFESPAN_YEARS[item.category] ?? CATEGORY_LIFESPAN_YEARS.OTHER;
  const ageYears = inferAgeYears(item);
  const expectedRemainingYears =
    ageYears !== null ? Math.max(0, Math.round((lifespan - ageYears) * 10) / 10) : undefined;

  const annualCostFromWarranty = typeof (item.warranty as any)?.cost === 'number'
    ? (item.warranty as any).cost
    : undefined;

  return {
    coverageType: 'WARRANTY',
    annualCostUsd: annualCostFromWarranty,
    replacementCostUsd,
    expectedRemainingYears,
    riskTolerance: 'MEDIUM',
  };
}

function mergeOverridesWithPrefill(
  current: ItemCoverageAnalysisOverrides,
  prefill: ItemCoverageAnalysisOverrides
): ItemCoverageAnalysisOverrides {
  return {
    coverageType: current.coverageType ?? prefill.coverageType,
    annualCostUsd: current.annualCostUsd ?? prefill.annualCostUsd,
    serviceFeeUsd: current.serviceFeeUsd ?? prefill.serviceFeeUsd,
    cashBufferUsd: current.cashBufferUsd ?? prefill.cashBufferUsd,
    riskTolerance: current.riskTolerance ?? prefill.riskTolerance,
    replacementCostUsd: current.replacementCostUsd ?? prefill.replacementCostUsd,
    expectedRemainingYears: current.expectedRemainingYears ?? prefill.expectedRemainingYears,
  };
}

export default function ItemGetCoverageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string; itemId: string }>();
  const propertyId = params.id;
  const itemId = params.itemId;
  const safeReturnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const currentPathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const fallbackBackHref = propertyId
    ? `/dashboard/properties/${propertyId}/inventory?tab=coverage`
    : '/dashboard/properties';
  const backHref = safeReturnTo ?? fallbackBackHref;
  const defaultWarrantyCategory = mapItemCategoryToWarrantyCategory(analysis?.item?.category);
  const addWarrantyHref =
    propertyId && itemId
      ? `/dashboard/warranties?action=new&from=coverage-buy&propertyId=${encodeURIComponent(propertyId)}&homeAssetId=${encodeURIComponent(itemId)}&category=${encodeURIComponent(defaultWarrantyCategory)}&returnTo=${encodeURIComponent(currentPathWithQuery)}`
      : '/dashboard/warranties';

  const [analysis, setAnalysis] = useState<ItemCoverageAnalysisDTO | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ItemCoverageAnalysisOverrides>(EMPTY_OVERRIDES);
  const [itemName, setItemName] = useState<string>('Inventory Item');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);

  useEffect(() => {
    setDidAutoPrefill(false);
  }, [itemId]);

  const fetchStatus = async () => {
    if (!propertyId || !itemId) return;
    setLoading(true);
    setError(null);
    try {
      const [analysisResult, itemResult] = await Promise.allSettled([
        getItemCoverageAnalysis(propertyId, itemId),
        getInventoryItem(propertyId, itemId),
      ]);

      if (itemResult.status === 'fulfilled') {
        const fetchedItem = itemResult.value;
        setItemName(fetchedItem.name || 'Inventory Item');
        setRoomName(fetchedItem.room?.name || null);
        if (!didAutoPrefill) {
          setOverrides((prev) => mergeOverridesWithPrefill(prev, buildPrefillOverrides(fetchedItem)));
          setDidAutoPrefill(true);
        }
      } else {
        setItemName('Inventory Item');
        setRoomName(null);
      }

      if (analysisResult.status !== 'fulfilled') {
        throw analysisResult.reason;
      }

      const result = analysisResult.value;
      if (result.exists) {
        setHasAnalysis(true);
        setAnalysis(result.analysis);
        setItemName((prev) => result.analysis.item?.name || prev || 'Inventory Item');
      } else {
        setHasAnalysis(false);
        setAnalysis(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load item coverage analysis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, itemId, didAutoPrefill]);

  const runAnalysis = async () => {
    if (!propertyId || !itemId) return;
    setRunning(true);
    setError(null);
    try {
      const next = await runItemCoverageAnalysis(propertyId, itemId, normalizeOverrides(overrides));
      setHasAnalysis(true);
      setAnalysis(next);
    } catch (err: any) {
      setError(err?.message || 'Failed to run item coverage analysis.');
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
        onClick={() => router.push(backHref)}
        className="inline-flex items-center gap-2 text-sm text-teal-700 hover:text-teal-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Get coverage</h1>
            <p className="text-sm text-gray-600 mt-1">
              Evaluate whether coverage is worth buying now for this specific item.
            </p>
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <p>
                Item Name: <span className="font-medium text-gray-800">{analysis?.item?.name || itemName}</span>
              </p>
              <p>
                Room Name: <span className="font-medium text-gray-800">{roomName || 'Unassigned'}</span>
              </p>
            </div>
          </div>
          <ShieldCheck className="h-6 w-6 text-teal-600" />
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational estimate only. This tool does not recommend carriers or guarantee outcomes.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Inputs</h2>
        <p className="text-sm text-gray-600 mt-1">Optional assumptions used to run your what-if analysis.</p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">
            Coverage type
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              value={overrides.coverageType ?? 'WARRANTY'}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  coverageType: e.target.value as ItemCoverageAnalysisOverrides['coverageType'],
                }))
              }
            >
              <option value="WARRANTY">Warranty</option>
              <option value="SERVICE_PLAN">Service plan</option>
            </select>
          </label>

          <label className="text-xs text-gray-600">
            Annual cost (USD)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toInputValue(overrides.annualCostUsd)}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  annualCostUsd: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Service fee (USD)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toInputValue(overrides.serviceFeeUsd)}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  serviceFeeUsd: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Cash buffer (USD)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toInputValue(overrides.cashBufferUsd)}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  cashBufferUsd: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Replacement cost (USD)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toInputValue(overrides.replacementCostUsd)}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  replacementCostUsd: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Expected remaining years
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={toInputValue(overrides.expectedRemainingYears)}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  expectedRemainingYears: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Risk tolerance
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              value={overrides.riskTolerance ?? 'MEDIUM'}
              onChange={(e) =>
                setOverrides((prev) => ({
                  ...prev,
                  riskTolerance: e.target.value as ItemCoverageAnalysisOverrides['riskTolerance'],
                }))
              }
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
            ) : (
              'Run analysis'
            )}
          </Button>
          <Button variant="ghost" onClick={fetchStatus} disabled={loading}>
            Refresh
          </Button>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          <span className="text-sm text-gray-600">Loading item analysis…</span>
        </div>
      )}

      {!loading && !hasAnalysis && (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">No saved analysis yet</h3>
          <p className="text-sm text-gray-600 mt-1">Run analysis to evaluate this item.</p>
        </div>
      )}

      {!loading && analysis && (
        <>
          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{analysis.item.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>{analysis.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{analysis.summary || 'No summary available.'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {analysis.item.category || 'Unknown category'} • Computed {compactDate(analysis.computedAt)}
                </p>
              </div>

              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdictClasses(analysis.overallVerdict)}`}>
                {analysis.overallVerdict.replace('_', ' ')}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Expected annual repair risk</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.warranty.expectedAnnualRepairRiskUsd)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Expected coverage cost</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.warranty.expectedCoverageCostUsd)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Expected net impact</div>
                <div className="text-base font-semibold text-gray-900">{money(analysis.warranty.expectedNetImpactUsd)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Recommendation</div>
                <div className="text-base font-semibold text-gray-900">{recommendationCopy(analysis.warranty.recommendation)}</div>
              </div>
            </div>

            {analysis.warranty.recommendation === 'BUY_NOW' && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button asChild>
                  <Link href={addWarrantyHref}>Add warranty coverage</Link>
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Decision trace</h4>
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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${impactClasses(trace.impact)}`}>{trace.impact}</span>
                </div>
              ))}
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
        </>
      )}
    </div>
  );
}
