'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ItemCoverageAnalysisDTO,
  ItemCoverageAnalysisOverrides,
  getItemCoverageAnalysis,
  runItemCoverageAnalysis,
} from '@/lib/api/coverageAnalysisApi';
import { getInventoryItem, waiveCoverage } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { InventoryItem } from '@/types';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  MobileCard,
  MobileToolWorkspace,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { getWarrantyCategoryForInventoryCategory } from '@/lib/config/serviceCategoryMapping';
import { cn } from '@/lib/utils';

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
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function toInputValue(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '';
  return String(value);
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

function verdictConfig(verdict?: ItemCoverageAnalysisDTO['overallVerdict'], recommendation?: string) {
  if (recommendation === 'REPLACE_SOON') {
    return {
      headline: 'This item may need replacing soon',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconColor: 'text-amber-500',
    };
  }
  if (verdict === 'WORTH_IT') {
    return {
      headline: 'Coverage is worth getting',
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      iconColor: 'text-teal-600',
    };
  }
  if (verdict === 'NOT_WORTH_IT') {
    return {
      headline: "Coverage isn't worth it right now",
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconColor: 'text-amber-500',
    };
  }
  return {
    headline: 'Worth considering for this item',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    iconColor: 'text-sky-600',
  };
}

function TraceIcon({ impact }: { impact: string }) {
  if (impact === 'POSITIVE') return <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />;
  if (impact === 'NEGATIVE') return <X className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />;
  return <Info className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />;
}

export default function ItemGetCoverageClient() {
  const queryClient = useQueryClient();
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
  const guidanceContext = useMemo(
    () => ({
      guidanceJourneyId: searchParams.get('guidanceJourneyId'),
      guidanceStepKey: searchParams.get('guidanceStepKey'),
      guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
    }),
    [searchParams]
  );
  const fallbackBackHref = propertyId
    ? `/dashboard/properties/${propertyId}/inventory?tab=coverage`
    : '/dashboard/properties';
  const backHref = safeReturnTo ?? fallbackBackHref;

  const [analysis, setAnalysis] = useState<ItemCoverageAnalysisDTO | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [waiving, setWaiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ItemCoverageAnalysisOverrides>(EMPTY_OVERRIDES);
  const [itemName, setItemName] = useState<string>('Inventory Item');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);
  const [showInputs, setShowInputs] = useState(false);

  const scenarioSectionRef = useRef<HTMLDivElement>(null);
  const openScenario = () => {
    setShowInputs(true);
    setTimeout(() => {
      scenarioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const defaultWarrantyCategory = getWarrantyCategoryForInventoryCategory(analysis?.item?.category);
  const addWarrantyHref =
    propertyId && itemId
      ? `/dashboard/warranties?action=new&from=coverage-buy&propertyId=${encodeURIComponent(propertyId)}&homeAssetId=${encodeURIComponent(itemId)}&category=${encodeURIComponent(defaultWarrantyCategory)}&returnTo=${encodeURIComponent(currentPathWithQuery)}`
      : '/dashboard/warranties';

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
        if (result.analysis.warranty.recommendation === 'REPLACE_SOON') {
          setShowInputs(true);
        }
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
      const next = await runItemCoverageAnalysis(
        propertyId,
        itemId,
        normalizeOverrides(overrides),
        guidanceContext
      );
      setHasAnalysis(true);
      setAnalysis(next);
      setShowInputs(next.warranty.recommendation === 'REPLACE_SOON');
      if (guidanceContext.guidanceJourneyId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['guidance', 'journey', propertyId, guidanceContext.guidanceJourneyId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['guidance', 'property', propertyId, itemId],
          }),
          queryClient.invalidateQueries({
            queryKey: ['guidance', 'property', propertyId],
          }),
        ]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to run item coverage analysis.');
    } finally {
      setRunning(false);
    }
  };

  const handleSkipCoverage = async () => {
    if (!propertyId || !itemId) return;
    setWaiving(true);
    setError(null);
    try {
      await waiveCoverage(propertyId, itemId, true);
      await queryClient.invalidateQueries({ queryKey: ['inventory', propertyId] });
      router.push(backHref);
    } catch (err: any) {
      setError(err?.message || 'Failed to update coverage status.');
    } finally {
      setWaiving(false);
    }
  };

  const config = analysis
    ? verdictConfig(analysis.overallVerdict, analysis.warranty.recommendation)
    : null;

  const recommendScenarioTesting = analysis?.warranty.recommendation === 'REPLACE_SOON';

  const hasFinancialData =
    analysis &&
    (analysis.warranty.expectedAnnualRepairRiskUsd != null ||
      analysis.warranty.expectedCoverageCostUsd != null);

  const netImpact = analysis?.warranty.expectedNetImpactUsd;
  const netImpactLabel =
    netImpact != null
      ? netImpact < 0
        ? `You'd save ${money(Math.abs(netImpact))}/yr with coverage`
        : `Coverage costs ${money(netImpact)}/yr more than expected repairs`
      : null;

  const inputsForm = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <option value="LOW">Low — I prefer certainty</option>
            <option value="MEDIUM">Medium — balanced</option>
            <option value="HIGH">High — comfortable with risk</option>
          </select>
        </label>
      </div>

      <Button onClick={runAnalysis} disabled={running || loading} className="w-full sm:w-auto">
        {running ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running…
          </>
        ) : hasAnalysis ? (
          'Re-run with these inputs'
        ) : (
          'Run analysis'
        )}
      </Button>
    </div>
  );

  return (
    <MobileToolWorkspace
      className="space-y-6 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm text-teal-700 hover:text-teal-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Coverage Analysis</p>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mt-0.5">{itemName}</h1>
            {roomName && <p className="text-sm text-gray-500 mt-0.5">{roomName}</p>}
          </div>
        </div>
      }
      footer={<BottomSafeAreaReserve size="chatAware" />}
    >
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <MobileCard>
          <div className="flex items-center gap-3 text-sm text-gray-500 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600 shrink-0" />
            <span>Loading coverage analysis…</span>
          </div>
        </MobileCard>
      )}

      {!loading && !hasAnalysis && (
        <>
          <MobileCard className="space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">No analysis yet for {itemName}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Run the analysis to find out whether coverage is worth it. We'll look at the item's
                  age, replacement value, and typical repair costs to give you a recommendation.
                </p>
              </div>
            </div>
            <Button onClick={runAnalysis} disabled={running} className="w-full">
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running analysis…
                </>
              ) : (
                'Run analysis'
              )}
            </Button>
          </MobileCard>

          <MobileCard className="space-y-3">
            <button
              type="button"
              onClick={() => setShowInputs((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
            >
              <span>Customize inputs</span>
              {showInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showInputs && (
              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-3">
                  Adjust these values to match your specific situation. Defaults are estimated from
                  your item details.
                </p>
                {inputsForm}
              </div>
            )}
          </MobileCard>
        </>
      )}

      {!loading && hasAnalysis && analysis && config && (
        <>
          {/* Verdict */}
          <div className={cn('rounded-2xl border p-4 space-y-3', config.bg, config.border)}>
            <div className="flex items-start gap-3">
              <ShieldCheck className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconColor)} />
              <div>
                <p className="font-semibold text-gray-900 text-base">{config.headline}</p>
                {analysis.summary && (
                  <p className="text-sm text-gray-600 mt-1">{analysis.summary}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {recommendScenarioTesting ? (
                <>
                  <Button onClick={openScenario}>
                    Try scenario testing
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link href={addWarrantyHref}>Add coverage anyway</Link>
                  </Button>
                </>
              ) : analysis.overallVerdict === 'NOT_WORTH_IT' ? (
                <Button
                  variant="outline"
                  onClick={handleSkipCoverage}
                  disabled={waiving}
                  className="bg-white"
                >
                  {waiving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Mark as skipped'}
                </Button>
              ) : (
                <>
                  <Button asChild>
                    <Link href={addWarrantyHref}>Add warranty coverage</Link>
                  </Button>
                  {analysis.overallVerdict === 'SITUATIONAL' && (
                    <Button variant="ghost" onClick={handleSkipCoverage} disabled={waiving}>
                      {waiving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Skip for now'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Why we recommend this */}
          {analysis.decisionTrace.length > 0 && (
            <MobileCard className="space-y-3">
              <p className="text-sm font-semibold text-gray-900">Why we recommend this</p>
              <div className="space-y-3">
                {analysis.decisionTrace.slice(0, 5).map((trace, index) => (
                  <div key={`${trace.label}-${index}`} className="flex gap-3 items-start">
                    <TraceIcon impact={trace.impact} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{trace.label}</p>
                      {trace.detail && (
                        <p className="text-xs text-gray-500 mt-0.5">{trace.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </MobileCard>
          )}

          {/* Financial comparison */}
          {hasFinancialData && (
            <MobileCard className="space-y-3">
              <p className="text-sm font-semibold text-gray-900">The numbers</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.warranty.expectedAnnualRepairRiskUsd != null && (
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Estimated repair risk</p>
                    <p className="text-base font-semibold text-gray-900 mt-0.5">
                      {money(analysis.warranty.expectedAnnualRepairRiskUsd)}/yr
                    </p>
                  </div>
                )}
                {analysis.warranty.expectedCoverageCostUsd != null && (
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Coverage costs</p>
                    <p className="text-base font-semibold text-gray-900 mt-0.5">
                      {money(analysis.warranty.expectedCoverageCostUsd)}/yr
                    </p>
                  </div>
                )}
              </div>
              {netImpactLabel && (
                <p className="text-sm text-gray-700">{netImpactLabel}</p>
              )}
              {analysis.warranty.breakEvenMonths != null && (
                <p className="text-xs text-gray-400">
                  Break-even: {analysis.warranty.breakEvenMonths} months
                </p>
              )}
            </MobileCard>
          )}

          {/* Next steps */}
          {analysis.nextSteps && analysis.nextSteps.length > 0 && (
            <MobileCard className="space-y-3">
              <p className="text-sm font-semibold text-gray-900">What to do next</p>
              <div className="space-y-3">
                {analysis.nextSteps.map((step, index) => {
                  const isScenarioStep =
                    recommendScenarioTesting && index === 0;
                  return (
                    <div key={`${step.title}-${index}`} className="flex gap-3 items-start">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700 mt-0.5">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{step.title}</p>
                        {step.detail && (
                          <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                        )}
                        {isScenarioStep && (
                          <button
                            type="button"
                            onClick={openScenario}
                            className="mt-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 underline underline-offset-2"
                          >
                            Try it →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </MobileCard>
          )}

          {/* Scenario testing / Adjust assumptions */}
          <div ref={scenarioSectionRef}>
          <MobileCard className="space-y-3">
            <button
              type="button"
              onClick={() => setShowInputs((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
            >
              <span>{recommendScenarioTesting ? 'Run a scenario' : 'Adjust assumptions'}</span>
              {showInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showInputs && (
              <div className="pt-1 border-t border-gray-100 space-y-3">
                <p className="text-xs text-gray-500">
                  {recommendScenarioTesting
                    ? 'Try different cost assumptions to see how the recommendation changes. For example, lower the annual cost to find a price point where coverage becomes worthwhile.'
                    : 'Change these values to model a different scenario, then re-run to see how the recommendation changes.'}
                </p>
                {inputsForm}
              </div>
            )}
          </MobileCard>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 px-1">
        Educational estimate only. This tool does not recommend carriers or guarantee outcomes.
      </p>
    </MobileToolWorkspace>
  );
}
