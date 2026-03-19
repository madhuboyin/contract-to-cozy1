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
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { getWarrantyCategoryForInventoryCategory } from '@/lib/config/serviceCategoryMapping';

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

function verdictTone(verdict?: ItemCoverageAnalysisDTO['overallVerdict']): 'good' | 'elevated' | 'danger' {
  if (verdict === 'WORTH_IT') return 'good';
  if (verdict === 'NOT_WORTH_IT') return 'danger';
  return 'elevated';
}

function impactTone(impact?: TraceImpact): 'good' | 'info' | 'danger' {
  if (impact === 'POSITIVE') return 'good';
  if (impact === 'NEGATIVE') return 'danger';
  return 'info';
}

function recommendationCopy(recommendation?: ItemCoverageAnalysisDTO['warranty']['recommendation']) {
  if (recommendation === 'BUY_NOW') return 'Buy coverage now';
  if (recommendation === 'REPLACE_SOON') return 'Plan replacement soon';
  if (recommendation === 'WAIT') return 'Wait and monitor';
  return '—';
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
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ItemCoverageAnalysisOverrides>(EMPTY_OVERRIDES);
  const [itemName, setItemName] = useState<string>('Inventory Item');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);
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
    } catch (err: any) {
      setError(err?.message || 'Failed to run item coverage analysis.');
    } finally {
      setRunning(false);
    }
  };

  const statusTone = useMemo<'good' | 'elevated' | 'danger' | 'info'>(() => {
    if (!analysis) return 'info';
    if (analysis.status === 'STALE') return 'elevated';
    if (analysis.status === 'ERROR') return 'danger';
    return 'good';
  }, [analysis]);

  return (
    <MobileToolWorkspace
      className="space-y-6 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm text-teal-700 hover:text-teal-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <MobilePageIntro
            eyebrow="Inventory Decision"
            title="Get Coverage"
            subtitle="Evaluate whether coverage is worth buying now for this specific item."
            action={<ShieldCheck className="h-5 w-5 text-teal-600" />}
          />
        </div>
      }
      summary={
        <ResultHeroCard
          title={analysis?.item?.name || itemName}
          value={analysis ? analysis.overallVerdict.replace('_', ' ') : 'No analysis'}
          status={<StatusChip tone={analysis ? statusTone : 'info'}>{analysis ? analysis.status : 'Pending'}</StatusChip>}
          summary={analysis?.summary || `${roomName || 'Unassigned room'} • Run scenario inputs to compute recommendation.`}
          actions={
            analysis?.warranty.recommendation === 'BUY_NOW' ? (
              <ActionPriorityRow
                primaryAction={
                  <Button asChild>
                    <Link href={addWarrantyHref}>Add warranty coverage</Link>
                  </Button>
                }
              />
            ) : undefined
          }
        />
      }
      footer={<BottomSafeAreaReserve size="chatAware" />}
    >
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational estimate only. This tool does not recommend carriers or guarantee outcomes.
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      <ScenarioInputCard
        title="Scenario Inputs"
        subtitle="Optional assumptions used to run your what-if analysis."
        actions={
          <ActionPriorityRow
            primaryAction={
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
            }
            secondaryActions={<Button variant="ghost" onClick={fetchStatus} disabled={loading}>Refresh</Button>}
          />
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
      </ScenarioInputCard>

      {loading ? (
        <ScenarioInputCard title="Loading analysis" subtitle="Fetching item coverage analysis.">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <span>Loading item analysis…</span>
          </div>
        </ScenarioInputCard>
      ) : !hasAnalysis || !analysis ? (
        <ScenarioInputCard title="No saved analysis yet" subtitle="Run analysis to evaluate this item.">
          <p className="text-sm text-muted-foreground">No prior run is stored for this item.</p>
        </ScenarioInputCard>
      ) : (
        <>
          <ReadOnlySummaryBlock
            title="Result Summary"
            items={[
              { label: 'Recommendation', value: recommendationCopy(analysis.warranty.recommendation), emphasize: true },
              { label: 'Expected annual repair risk', value: money(analysis.warranty.expectedAnnualRepairRiskUsd) },
              { label: 'Expected coverage cost', value: money(analysis.warranty.expectedCoverageCostUsd) },
              { label: 'Expected net impact', value: money(analysis.warranty.expectedNetImpactUsd) },
            ]}
            columns={2}
          />

          <ScenarioInputCard title="Decision Trace" subtitle="How this recommendation was derived.">
            <div className="space-y-2">
              {analysis.decisionTrace.map((trace, index) => (
                <CompactEntityRow
                  key={`${trace.label}-${index}`}
                  title={trace.label}
                  subtitle={trace.detail}
                  status={<StatusChip tone={impactTone(trace.impact)}>{trace.impact}</StatusChip>}
                />
              ))}
            </div>
          </ScenarioInputCard>

          {analysis.nextSteps && analysis.nextSteps.length > 0 ? (
            <ScenarioInputCard title="Next Steps" subtitle="Suggested follow-up actions.">
              <div className="space-y-2">
                {analysis.nextSteps.map((step, index) => (
                  <CompactEntityRow
                    key={`${step.title}-${index}`}
                    title={step.title}
                    subtitle={step.detail}
                    meta={step.priority || undefined}
                  />
                ))}
              </div>
            </ScenarioInputCard>
          ) : null}
        </>
      )}
    </MobileToolWorkspace>
  );
}
