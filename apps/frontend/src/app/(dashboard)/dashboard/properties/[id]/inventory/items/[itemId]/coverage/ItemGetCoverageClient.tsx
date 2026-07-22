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
import { getInventoryItem, updateInventoryItem, waiveCoverage } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { InventoryItem, InventoryItemCondition } from '@/types';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  MobileCard,
  MobileToolWorkspace,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { getWarrantyCategoryForInventoryCategory } from '@/lib/config/serviceCategoryMapping';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { cn } from '@/lib/utils';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';

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
    item.effectiveReplacementCostCents !== null && item.effectiveReplacementCostCents !== undefined
      ? Math.round((item.effectiveReplacementCostCents / 100) * 100) / 100
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
      headline: "Replace this item — don't cover it",
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

function strongVerdictRationale(
  verdict: ItemCoverageAnalysisDTO['overallVerdict'],
  recommendation: string | undefined,
  remainingMonths: number | null | undefined,
  netImpact: number | null | undefined,
  repairRisk: number | null | undefined,
  coverageCost: number | null | undefined,
): string {
  if (recommendation === 'REPLACE_SOON') {
    const mo = remainingMonths ?? 0;
    if (netImpact != null && netImpact > 0) {
      return `Coverage saves ${money(netImpact)}/yr on paper — but with only ${mo} ${mo === 1 ? 'month' : 'months'} of expected life left, this item is entering its highest-risk period. Near-end-of-life appliances fail unpredictably, and one repair often uncovers another. A warranty can't fix an aging item. Put that money toward a replacement budget instead.`;
    }
    return `With only ${mo} ${mo === 1 ? 'month' : 'months'} of expected life left and coverage already costing more than expected repairs, the case for replacement is clear. Near-end-of-life items fail unpredictably — budget for a new one rather than maintaining a dying item.`;
  }
  if (verdict === 'WORTH_IT') {
    if (repairRisk != null && coverageCost != null && netImpact != null) {
      return `Your expected repair risk is ${money(repairRisk)}/yr — coverage costs ${money(coverageCost)}/yr, saving you ${money(netImpact)}/yr. Locking in a warranty now protects you from the next unexpected failure at a net benefit.`;
    }
    return 'Coverage costs less than your expected repair bills at current rates. Locking in a warranty now protects you from the next unexpected failure.';
  }
  if (verdict === 'NOT_WORTH_IT') {
    if (repairRisk != null && coverageCost != null && netImpact != null) {
      return `Coverage costs ${money(coverageCost)}/yr but your expected repair risk is only ${money(repairRisk)}/yr — you'd pay ${money(Math.abs(netImpact))}/yr extra for coverage. Self-insure: keep a dedicated repair fund and you'll come out ahead.`;
    }
    return "At current pricing, the warranty costs more than what you'd likely spend on repairs. Self-insure — keep a dedicated repair fund instead and you'll come out ahead.";
  }
  if (repairRisk != null && coverageCost != null) {
    return `At ${money(coverageCost)}/yr for coverage vs ${money(repairRisk)}/yr expected repair risk, the numbers are nearly equal. Your risk tolerance is the deciding factor — if an unexpected repair would strain your budget, lean toward coverage.`;
  }
  return 'The numbers are close. Your risk tolerance is the deciding factor — if an unexpected repair would strain your budget, lean toward coverage.';
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
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [scenarioView, setScenarioView] = useState<'inputs' | 'result'>('inputs');
  const [itemCondition, setItemCondition] = useState<InventoryItemCondition>('UNKNOWN');
  const [showConditionEditor, setShowConditionEditor] = useState(false);
  const [conditionInput, setConditionInput] = useState<InventoryItemCondition>('GOOD');
  const [savingCondition, setSavingCondition] = useState(false);

  const scenarioSectionRef = useRef<HTMLDivElement>(null);
  const openScenario = () => {
    setShowInputs(true);
    setScenarioView('inputs');
    setTimeout(() => {
      scenarioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const defaultWarrantyCategory = getWarrantyCategoryForInventoryCategory(analysis?.item?.category);
  const addWarrantyHref =
    propertyId && itemId
      ? `/dashboard/warranties?action=new&from=coverage-buy&propertyId=${encodeURIComponent(propertyId)}&inventoryItemId=${encodeURIComponent(itemId)}&category=${encodeURIComponent(defaultWarrantyCategory)}&returnTo=${encodeURIComponent(currentPathWithQuery)}`
      : '/dashboard/warranties';

  const replaceHref = propertyId
    ? buildGuidanceOverviewHref({
        propertyId,
        inventoryItemId: itemId,
        assetName: itemName,
        issueType: 'near_end_of_life',
        backTo: currentPathWithQuery,
      })
    : '/dashboard';

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
        setItem(fetchedItem);
        setItemName(fetchedItem.displayName || fetchedItem.name || 'Inventory Item');
        setRoomName(fetchedItem.room?.name || fetchedItem.locationLabel || null);
        setItemCondition((fetchedItem.condition as InventoryItemCondition) || 'UNKNOWN');
        if (!didAutoPrefill) {
          setOverrides((prev) => mergeOverridesWithPrefill(prev, buildPrefillOverrides(fetchedItem)));
          setDidAutoPrefill(true);
        }
      } else {
        setItem(null);
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
      setShowInputs(true);
      setScenarioView('result');
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

  const saveConditionAndRerun = async () => {
    if (!propertyId || !itemId) return;
    setSavingCondition(true);
    setError(null);
    try {
      await updateInventoryItem(propertyId, itemId, { condition: conditionInput });
      setItemCondition(conditionInput);
      setShowConditionEditor(false);
      await runAnalysis();
    } catch (err: any) {
      setError(err?.message || 'Failed to save condition.');
    } finally {
      setSavingCondition(false);
    }
  };

  const config = analysis
    ? verdictConfig(analysis.overallVerdict, analysis.warranty.recommendation)
    : null;
  const coverageState = item?.coverageState ?? 'INCOMPLETE';
  const needsCoverageContext = coverageState === 'INCOMPLETE';
  const coverageManagedElsewhere = coverageState === 'MANAGED_ELSEWHERE';
  const coverageNotRequired = coverageState === 'NOT_REQUIRED';
  const mayAnalyzeCoverage = coverageState === 'MISSING' || coverageState === 'CONFIRMED';
  const coverageOperationInput = useMemo(() => ({
    inventoryItemId: itemId,
    responsibilityScope: item?.responsibilityScope ?? undefined,
    hasDisclosedEstimate: item?.replacementValueSource === 'ESTIMATED',
  }), [item?.replacementValueSource, item?.responsibilityScope, itemId]);

  const recommendScenarioTesting = analysis?.warranty.recommendation === 'REPLACE_SOON';

  const hasFinancialData =
    analysis &&
    (analysis.warranty.expectedAnnualRepairRiskUsd != null ||
      analysis.warranty.expectedCoverageCostUsd != null);

  const netImpact = analysis?.warranty.expectedNetImpactUsd;
  const repairRisk = analysis?.warranty.expectedAnnualRepairRiskUsd ?? null;
  const coverageCost = analysis?.warranty.expectedCoverageCostUsd ?? null;
  // Positive netImpact = repair risk > coverage cost = coverage saves money
  const netImpactLabel =
    netImpact != null
      ? netImpact > 0
        ? `You'd save ${money(netImpact)}/yr with coverage`
        : `Coverage costs ${money(Math.abs(netImpact))}/yr more than expected repairs`
      : null;

  const remainingYears = analysis?.warranty.inputsUsed.expectedRemainingYears;
  const remainingMonths =
    remainingYears != null ? Math.round(remainingYears * 12) : null;
  const coverageInputsUsed = analysis?.warranty.inputsUsed;
  const serviceFeeContribution =
    analysis?.warranty.expectedCoverageCostUsd != null &&
    coverageInputsUsed?.annualCostUsd != null
      ? analysis.warranty.expectedCoverageCostUsd - coverageInputsUsed.annualCostUsd
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

      {!loading && item && (
        <MobileCard className="space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
            <div>
              <p className="font-semibold text-gray-900">{item.coverageStateLabel || 'Coverage information incomplete'}</p>
              <p className="mt-1 text-sm text-gray-600">{item.coverageStateDetail}</p>
              {item.provenanceLabel ? <p className="mt-2 text-xs font-medium text-gray-500">{item.provenanceLabel}</p> : null}
              {item.replacementValueSource === 'ESTIMATED' && item.effectiveReplacementCostCents ? (
                <p className="mt-1 text-xs text-gray-500">Estimated replacement value: {money(item.effectiveReplacementCostCents / 100)}</p>
              ) : null}
            </div>
          </div>
          {coverageManagedElsewhere ? (
            <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
              Homeowner coverage and replacement actions are paused because this system is recorded as managed by another responsible party.
            </p>
          ) : null}
          {coverageNotRequired ? <p className="text-sm text-gray-600">Coverage tracking is turned off for this item.</p> : null}
        </MobileCard>
      )}

      {!loading && item && needsCoverageContext ? (
        <PropertyContextCapturePanel
          propertyId={propertyId}
          featureKey="COVERAGE_INTELLIGENCE"
          operationKey="ASSESS_ITEM_COVERAGE"
          operationInput={coverageOperationInput}
          onCaptured={async () => { await fetchStatus(); }}
        />
      ) : null}

      {!loading && mayAnalyzeCoverage && !hasAnalysis && (
        <>
          <MobileCard className="space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">No analysis yet for {itemName}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Run the analysis to find out whether coverage is worth it. We&apos;ll look at the item&apos;s
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

      {!loading && mayAnalyzeCoverage && hasAnalysis && analysis && config && (
        <>
          {/* Verdict */}
          <div className={cn('rounded-2xl border p-4 space-y-3', config.bg, config.border)}>
            {/* Headline */}
            <div className="flex items-start gap-3">
              <ShieldCheck className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconColor)} />
              <p className="font-bold text-gray-900 text-base leading-snug">{config.headline}</p>
            </div>

            {/* 2-column data row — adapts to verdict type */}
            <div className="grid grid-cols-2 divide-x divide-gray-200 border-t border-b border-gray-200 py-3">
              {recommendScenarioTesting ? (
                <>
                  {/* REPLACE_SOON left — short-term saving */}
                  <div className="pr-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Short-term saving</p>
                    {netImpact != null && netImpact > 0 ? (
                      <>
                        <p className="text-base font-bold text-gray-900">{money(netImpact)}/yr</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Valid for ~{remainingMonths ?? '?'} {(remainingMonths ?? 2) === 1 ? 'month' : 'months'} only
                        </p>
                      </>
                    ) : netImpact != null ? (
                      <>
                        <p className="text-base font-bold text-rose-600">{money(Math.abs(netImpact))}/yr extra</p>
                        <p className="text-xs text-gray-500 mt-0.5">Coverage costs more than repairs</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Run a scenario to see</p>
                    )}
                  </div>
                  {/* REPLACE_SOON right — item reality */}
                  <div className="pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Item reality</p>
                    {remainingMonths != null && (
                      <p className="text-base font-bold text-amber-700">
                        {remainingMonths} {remainingMonths === 1 ? 'month' : 'months'} left
                      </p>
                    )}
                    <div className="mt-0.5 space-y-0.5">
                      {analysis.decisionTrace
                        .filter((t) => t.impact === 'NEGATIVE')
                        .slice(0, 2)
                        .map((t, i) => (
                          <p key={i} className="text-xs text-gray-500 leading-tight">· {t.label}</p>
                        ))}
                    </div>
                  </div>
                </>
              ) : analysis.overallVerdict === 'WORTH_IT' ? (
                <>
                  {/* WORTH_IT left — annual savings */}
                  <div className="pr-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Annual savings</p>
                    {netImpact != null && netImpact > 0 ? (
                      <>
                        <p className="text-base font-bold text-teal-700">{money(netImpact)}/yr</p>
                        <p className="text-xs text-gray-500 mt-0.5">Coverage pays off</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Run a scenario to see</p>
                    )}
                  </div>
                  {/* WORTH_IT right — repair risk */}
                  <div className="pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Repair risk</p>
                    {repairRisk != null ? (
                      <p className="text-base font-bold text-gray-900">{money(repairRisk)}/yr</p>
                    ) : (
                      <p className="text-xs text-gray-400">Not estimated</p>
                    )}
                    <div className="mt-0.5 space-y-0.5">
                      {analysis.decisionTrace
                        .filter((t) => t.impact === 'POSITIVE')
                        .slice(0, 2)
                        .map((t, i) => (
                          <p key={i} className="text-xs text-gray-500 leading-tight">· {t.label}</p>
                        ))}
                    </div>
                  </div>
                </>
              ) : analysis.overallVerdict === 'NOT_WORTH_IT' ? (
                <>
                  {/* NOT_WORTH_IT left — extra cost */}
                  <div className="pr-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Extra cost</p>
                    {netImpact != null && netImpact < 0 ? (
                      <>
                        <p className="text-base font-bold text-rose-600">{money(Math.abs(netImpact))}/yr extra</p>
                        <p className="text-xs text-gray-500 mt-0.5">Coverage costs more than repairs</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Run a scenario to see</p>
                    )}
                  </div>
                  {/* NOT_WORTH_IT right — repair risk */}
                  <div className="pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Repair risk</p>
                    {repairRisk != null ? (
                      <p className="text-base font-bold text-gray-900">{money(repairRisk)}/yr</p>
                    ) : (
                      <p className="text-xs text-gray-400">Not estimated</p>
                    )}
                    <div className="mt-0.5 space-y-0.5">
                      {analysis.decisionTrace
                        .filter((t) => t.impact === 'NEGATIVE')
                        .slice(0, 2)
                        .map((t, i) => (
                          <p key={i} className="text-xs text-gray-500 leading-tight">· {t.label}</p>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* SITUATIONAL left — coverage cost */}
                  <div className="pr-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Coverage cost</p>
                    {coverageCost != null ? (
                      <>
                        <p className="text-base font-bold text-gray-900">{money(coverageCost)}/yr</p>
                        <p className="text-xs text-gray-500 mt-0.5">Annual warranty cost</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Run a scenario to see</p>
                    )}
                  </div>
                  {/* SITUATIONAL right — repair risk */}
                  <div className="pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Repair risk</p>
                    {repairRisk != null ? (
                      <p className="text-base font-bold text-gray-900">{money(repairRisk)}/yr</p>
                    ) : (
                      <p className="text-xs text-gray-400">Not estimated</p>
                    )}
                    <div className="mt-0.5 space-y-0.5">
                      {analysis.decisionTrace.slice(0, 2).map((t, i) => (
                        <p key={i} className="text-xs text-gray-500 leading-tight">· {t.label}</p>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="text-sm text-gray-700 leading-relaxed">
              {strongVerdictRationale(analysis.overallVerdict, analysis.warranty.recommendation, remainingMonths, netImpact, repairRisk, coverageCost)}
            </p>

            <div className="flex flex-wrap gap-2">
              {recommendScenarioTesting ? (
                <>
                  <Button asChild>
                    <Link href={replaceHref}>Plan replacement</Link>
                  </Button>
                  <Button variant="ghost" onClick={openScenario}>
                    Try scenario testing
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link href={addWarrantyHref}>Add coverage anyway</Link>
                  </Button>
                </>
              ) : analysis.overallVerdict === 'WORTH_IT' ? (
                <>
                  <Button asChild>
                    <Link href={addWarrantyHref}>Add warranty coverage</Link>
                  </Button>
                  <Button variant="ghost" onClick={openScenario}>
                    Try scenario testing
                  </Button>
                </>
              ) : analysis.overallVerdict === 'NOT_WORTH_IT' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSkipCoverage}
                    disabled={waiving}
                    className="bg-white"
                  >
                    {waiving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Mark as skipped'}
                  </Button>
                  <Button variant="ghost" onClick={openScenario}>
                    Try scenario testing
                  </Button>
                </>
              ) : (
                /* SITUATIONAL */
                <>
                  <Button asChild>
                    <Link href={addWarrantyHref}>Add warranty coverage</Link>
                  </Button>
                  <Button variant="ghost" onClick={openScenario}>
                    Try scenario testing
                  </Button>
                  <Button variant="ghost" onClick={handleSkipCoverage} disabled={waiving}>
                    {waiving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Skip for now'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Why we recommend this */}
          {analysis.decisionTrace.length > 0 && (
            <MobileCard className="space-y-3">
              <p className="text-sm font-semibold text-gray-900">Why we recommend this</p>
              <div className="space-y-3">
                {analysis.decisionTrace.slice(0, 5).map((trace, index) => {
                  const isUnknownConditionRow =
                    index === 0 && itemCondition === 'UNKNOWN';
                  return (
                    <div key={`${trace.label}-${index}`} className="flex gap-3 items-start">
                      <TraceIcon impact={trace.impact} />
                      <div className="min-w-0 w-full">
                        <p className="text-sm font-medium text-gray-800">{trace.label}</p>
                        {trace.detail && (
                          <p className="text-xs text-gray-500 mt-0.5">{trace.detail}</p>
                        )}

                        {/* Inline condition prompt — shown when condition is UNKNOWN */}
                        {isUnknownConditionRow && !showConditionEditor && (
                          <button
                            type="button"
                            onClick={() => setShowConditionEditor(true)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 underline underline-offset-2"
                          >
                            Add condition →
                          </button>
                        )}
                        {isUnknownConditionRow && !showConditionEditor && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            Condition affects failure probability — adding it improves accuracy.
                          </p>
                        )}

                        {isUnknownConditionRow && showConditionEditor && (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                            <p className="text-xs font-medium text-amber-800">
                              What condition is this item in?
                            </p>
                            <p className="text-xs text-amber-700">
                              Condition changes how we estimate failure probability and repair risk.
                            </p>
                            <select
                              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                              value={conditionInput}
                              onChange={(e) => setConditionInput(e.target.value as InventoryItemCondition)}
                            >
                              <option value="NEW">New — like new, no issues</option>
                              <option value="GOOD">Good — works well, minor wear</option>
                              <option value="FAIR">Fair — some issues, regular maintenance needed</option>
                              <option value="POOR">Poor — frequent problems or visible damage</option>
                            </select>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={saveConditionAndRerun}
                                disabled={savingCondition}
                              >
                                {savingCondition ? (
                                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
                                ) : (
                                  'Save & re-run'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowConditionEditor(false)}
                                disabled={savingCondition}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </MobileCard>
          )}

          {/* Financial comparison */}
          {hasFinancialData && (
            <MobileCard className="space-y-4">
              <p className="text-sm font-semibold text-gray-900">The numbers</p>

              {/* Coverage cost breakdown */}
              {analysis.warranty.expectedCoverageCostUsd != null && (
                <div className="rounded-xl bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">With coverage</p>
                  {coverageInputsUsed?.annualCostUsd != null && (
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>Annual premium</span>
                      <span>{money(coverageInputsUsed.annualCostUsd)}/yr</span>
                    </div>
                  )}
                  {serviceFeeContribution != null && serviceFeeContribution > 0 && (
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>Service fees (per expected claim)</span>
                      <span>+{money(serviceFeeContribution)}/yr</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-gray-900 border-t border-gray-200 pt-2">
                    <span>Total coverage cost</span>
                    <span>{money(analysis.warranty.expectedCoverageCostUsd)}/yr</span>
                  </div>
                </div>
              )}

              {/* Repair risk */}
              {analysis.warranty.expectedAnnualRepairRiskUsd != null && (
                <div className="rounded-xl bg-gray-50 p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Without coverage</p>
                  <div className="flex justify-between text-sm font-semibold text-gray-900">
                    <span>Estimated repair risk</span>
                    <span>{money(analysis.warranty.expectedAnnualRepairRiskUsd)}/yr</span>
                  </div>
                  <p className="text-xs text-gray-400">Based on item age, failure probability, and replacement cost</p>
                </div>
              )}

              {/* Net impact */}
              {netImpactLabel && (
                <p className={cn(
                  'text-sm font-medium',
                  netImpact != null && netImpact > 0 ? 'text-teal-700' : 'text-rose-600'
                )}>
                  {netImpactLabel}
                </p>
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
            {/* Card header — always visible */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {recommendScenarioTesting ? 'Run a scenario' : 'Adjust assumptions'}
              </span>
              {showInputs && scenarioView === 'result' ? (
                <button
                  type="button"
                  onClick={() => setScenarioView('inputs')}
                  className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  Edit inputs
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowInputs((v) => !v)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={showInputs ? 'Collapse' : 'Expand'}
                >
                  {showInputs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>

            {/* Result view — shown after a re-run */}
            {showInputs && scenarioView === 'result' && config && (
              <div className="pt-1 border-t border-gray-100 space-y-3">
                {/* Updated badge */}
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-teal-600" />
                  <span className="text-xs font-medium text-teal-700">Updated</span>
                </div>

                {/* Prominent verdict — first thing user sees after re-run */}
                <div className={cn('rounded-xl border p-3 space-y-1.5', config.bg, config.border)}>
                  <p className="text-sm font-bold text-gray-900">{config.headline}</p>
                  <p className="text-xs font-medium text-gray-700 leading-relaxed">
                    {strongVerdictRationale(analysis.overallVerdict, analysis.warranty.recommendation, remainingMonths, netImpact, repairRisk, coverageCost)}
                  </p>
                </div>

                {/* Cost breakdown */}
                {analysis.warranty.expectedCoverageCostUsd != null && (
                  <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-xs text-gray-600">
                    {coverageInputsUsed?.annualCostUsd != null && (
                      <div className="flex justify-between">
                        <span>Annual premium</span>
                        <span>{money(coverageInputsUsed.annualCostUsd)}/yr</span>
                      </div>
                    )}
                    {serviceFeeContribution != null && serviceFeeContribution > 0 && (
                      <div className="flex justify-between">
                        <span>Service fees</span>
                        <span>+{money(serviceFeeContribution)}/yr</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
                      <span>Total coverage cost</span>
                      <span>{money(analysis.warranty.expectedCoverageCostUsd)}/yr</span>
                    </div>
                    {analysis.warranty.expectedAnnualRepairRiskUsd != null && (
                      <div className="flex justify-between text-gray-500 pt-0.5">
                        <span>vs. repair risk without coverage</span>
                        <span>{money(analysis.warranty.expectedAnnualRepairRiskUsd)}/yr</span>
                      </div>
                    )}
                  </div>
                )}

                {netImpactLabel && (
                  <p className={cn(
                    'text-sm font-semibold',
                    netImpact != null && netImpact > 0 ? 'text-teal-700' : 'text-rose-600'
                  )}>
                    {netImpactLabel}
                  </p>
                )}
              </div>
            )}

            {/* Input view — shown by default or after clicking "Edit inputs" */}
            {showInputs && scenarioView === 'inputs' && (
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
