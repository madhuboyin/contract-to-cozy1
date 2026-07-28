'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  DollarSign,
  Hourglass,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Tv,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  CoverageAnalysisDTO,
  CoverageAnalysisOverrides,
  getCoverageAnalysis,
  runCoverageAnalysis,
  simulateCoverageAnalysis,
} from '@/lib/api/coverageAnalysisApi';
import { listInventoryItems } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Button } from '@/components/ui/button';
import { InventoryItem } from '@/types';
import {
  ActionPriorityRow,
  MobileKpiStrip,
  MobileKpiTile,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { cn } from '@/lib/utils';

type CoverageIntelligencePanelProps = {
  propertyId: string;
  propertySelector?: React.ReactNode;
};

const EMPTY_OVERRIDES: CoverageAnalysisOverrides = {
  annualPremiumUsd: undefined,
  deductibleUsd: undefined,
  warrantyAnnualCostUsd: undefined,
  warrantyServiceFeeUsd: undefined,
  cashBufferUsd: undefined,
  riskTolerance: 'MEDIUM',
};

function money(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function toInputValue(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '';
  return String(value);
}

function compactDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function humanizeEnum(value?: string | null) {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function insuranceReviewState(analysis: CoverageAnalysisDTO): string {
  if (analysis.insuranceReviewState === 'QUESTIONS_PRESENT') return 'Questions to review';
  if (analysis.insuranceReviewState === 'NO_QUESTIONS_FROM_REVIEWED_FIELDS') {
    return 'No questions from reviewed fields';
  }
  return 'Policy record incomplete';
}

function normalizeOverrides(overrides: CoverageAnalysisOverrides): CoverageAnalysisOverrides {
  const parsed: CoverageAnalysisOverrides = {
    riskTolerance: overrides.riskTolerance ?? 'MEDIUM',
  };

  const keys: Array<
    'annualPremiumUsd' | 'deductibleUsd' | 'warrantyAnnualCostUsd' | 'warrantyServiceFeeUsd' | 'cashBufferUsd'
  > = [
    'annualPremiumUsd',
    'deductibleUsd',
    'warrantyAnnualCostUsd',
    'warrantyServiceFeeUsd',
    'cashBufferUsd',
  ];

  for (const key of keys) {
    const value = overrides[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      parsed[key] = value;
    }
  }

  return parsed;
}

function traceImpactPillClasses(impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL') {
  if (impact === 'POSITIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (impact === 'NEGATIVE') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function getTraceIcon(label?: string | null) {
  const normalized = (label || '').toLowerCase();
  if (normalized.includes('profile')) return Tv;
  if (normalized.includes('age') || normalized.includes('life')) return Hourglass;
  if (normalized.includes('failure')) return Zap;
  if (normalized.includes('repair')) return Wrench;
  if (normalized.includes('cost') || normalized.includes('impact')) return DollarSign;
  return Shield;
}

function severityPillClasses(severity?: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function deltaColorClass(delta: number): string {
  return delta === 0 ? 'text-slate-700' : 'text-slate-900';
}

function deltaCaptionShort(delta: number): string {
  if (delta < 0) return `modeled warranty cost is ${money(Math.abs(delta))} above modeled repair exposure`;
  if (delta > 0) return `modeled repair exposure is ${money(delta)} above modeled warranty cost`;
  return 'modeled costs are equal under these assumptions';
}

function reviewFocus(): string {
  return 'Review contract exclusions, service fees, and controlling terms before deciding.';
}

function simulationTakeaway(analysis: CoverageAnalysisDTO): string {
  const delta = analysis.warranty.expectedNetImpactUsd ?? 0;
  return `${deltaCaptionShort(delta)}. This is scenario math, not guaranteed savings or a direction to buy or decline a contract.`;
}

function scenarioHeroClass() {
  return 'border-slate-200/90 bg-[linear-gradient(145deg,#ffffff,#f8fafc)]';
}

function scenarioPanelClass() {
  return 'border-slate-200 bg-slate-50/70';
}

function getScenarioIcon() {
  return {
    Icon: Shield,
    wrap: 'bg-slate-700 text-white',
  };
}

// ─── Desktop sub-components ──────────────────────────────────────────────────


function InsuranceInputTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <p className="text-[11px] text-slate-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function getBiggestRisk(
  analysis: CoverageAnalysisDTO
): { label: string; title: string; exposure: string } | null {
  const exposure = money(analysis.warranty.expectedAnnualRepairRiskUsd);
  const highFlag = analysis.insurance.flags.find((f) => f.severity === 'HIGH');
  if (highFlag) return { label: 'Insurance gap', title: highFlag.label, exposure };
  const negTrace = analysis.decisionTrace.find((t) => t.impact === 'NEGATIVE');
  if (negTrace) return { label: 'Coverage risk', title: negTrace.label, exposure };
  const highStep = analysis.nextSteps?.find((s) => s.priority === 'HIGH');
  if (highStep) return { label: 'Action needed', title: highStep.title, exposure };
  const medFlag = analysis.insurance.flags.find((f) => f.severity === 'MEDIUM');
  if (medFlag) return { label: 'Insurance signal', title: medFlag.label, exposure };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

function DecisionTraceCard({
  traces,
  counts,
  className,
}: {
  traces: CoverageAnalysisDTO['decisionTrace'];
  counts: Record<'POSITIVE' | 'NEGATIVE' | 'NEUTRAL', number>;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-black/10 bg-white p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold text-gray-900">Decision trace</h4>
          <p className="mt-1 text-xs text-slate-500">Inputs and modeled effects used in the property-level comparison</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['NEUTRAL', 'NEGATIVE', 'POSITIVE'] as const).map((impact) => (
            <span
              key={impact}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${traceImpactPillClasses(impact)}`}
            >
              {humanizeEnum(impact)} {counts[impact]}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {traces.map((trace, index) => (
          <div
            key={`${trace.label}-${index}`}
            className={`flex items-center justify-between gap-3 px-4 py-2 ${
              index === traces.length - 1 ? '' : 'border-b border-slate-100'
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                {(() => {
                  const TraceIcon = getTraceIcon(trace.label);
                  return <TraceIcon className="h-3.5 w-3.5" />;
                })()}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{trace.label}</div>
                {trace.detail && <div className="mt-1 text-xs text-slate-500">{trace.detail}</div>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${traceImpactPillClasses(trace.impact)}`}>
                {humanizeEnum(trace.impact)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CoverageIntelligencePanel({
  propertyId,
  propertySelector,
}: CoverageIntelligencePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedAssumptionSetId = searchParams.get('assumptionSetId');
  const [analysis, setAnalysis] = useState<CoverageAnalysisDTO | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<CoverageAnalysisOverrides>(EMPTY_OVERRIDES);
  const [saveScenario, setSaveScenario] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [hasSimulated, setHasSimulated] = useState(false);

  const fetchStatus = async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCoverageAnalysis(propertyId);
      if (result.exists) {
        setHasAnalysis(true);
        setAnalysis(result.analysis);
      } else {
        setHasAnalysis(false);
        setAnalysis(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load coverage intelligence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyId) return;
      setItemsLoading(true);
      setItemsError(null);
      try {
        const allItems = await listInventoryItems(propertyId, {});
        if (cancelled) return;
        setItems(allItems);
        setSelectedItemId((prev) => (prev ? prev : allItems[0]?.id ?? ''));
      } catch (err: any) {
        if (!cancelled) {
          setItems([]);
          setSelectedItemId('');
          setItemsError(err?.message || 'Failed to load inventory items.');
        }
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const latest = await runCoverageAnalysis(propertyId, undefined, {
        guidanceJourneyId: searchParams.get('guidanceJourneyId'),
        guidanceStepKey: searchParams.get('guidanceStepKey'),
        guidanceSignalIntentFamily: searchParams.get('guidanceSignalIntentFamily'),
        inventoryItemId: searchParams.get('itemId'),
        assumptionSetId: requestedAssumptionSetId,
      });
      setHasAnalysis(true);
      setAnalysis(latest);
    } catch (err: any) {
      setError(err?.message || 'Failed to run analysis.');
    } finally {
      setRunning(false);
    }
  };

  const runSimulation = async () => {
    setSimulating(true);
    setError(null);
    try {
      const next = await simulateCoverageAnalysis(
        propertyId,
        normalizeOverrides(overrides),
        saveScenario,
        saveScenario ? 'What-if simulation' : undefined
      );
      if (saveScenario) {
        setHasAnalysis(true);
      }
      setAnalysis(next);
      setHasSimulated(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to simulate.');
    } finally {
      setSimulating(false);
    }
  };

  const statusChipTone = useMemo<'good' | 'elevated' | 'danger' | 'info'>(() => {
    if (!analysis) return 'info';
    if (analysis.status === 'STALE') return 'elevated';
    if (analysis.status === 'ERROR') return 'danger';
    return 'good';
  }, [analysis]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const selectedItemHasGap = selectedItem?.coverageState === 'MISSING'
    && selectedItem.coverageActionable === true;
  const currentPathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const openItemCoverage = () => {
    if (!selectedItemId) return;
    router.push(
      `/dashboard/properties/${propertyId}/inventory/items/${selectedItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`
    );
  };
  const decisionTraceCounts = useMemo(() => {
    const counts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
    for (const trace of analysis?.decisionTrace ?? []) {
      if (trace.impact === 'POSITIVE' || trace.impact === 'NEGATIVE' || trace.impact === 'NEUTRAL') {
        counts[trace.impact] += 1;
      }
    }
    return counts;
  }, [analysis?.decisionTrace]);

  const analysisBasedOverrides = useMemo<CoverageAnalysisOverrides>(() => {
    if (!analysis) return EMPTY_OVERRIDES;
    return {
      annualPremiumUsd: analysis.insurance.inputsUsed.annualPremiumUsd ?? undefined,
      deductibleUsd: analysis.insurance.inputsUsed.deductibleUsd ?? undefined,
      warrantyAnnualCostUsd: analysis.warranty.inputsUsed.warrantyAnnualCostUsd ?? undefined,
      warrantyServiceFeeUsd: undefined,
      cashBufferUsd: analysis.insurance.inputsUsed.cashBufferUsd ?? undefined,
      riskTolerance: 'MEDIUM',
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.computedAt]);

  useEffect(() => {
    setOverrides(analysisBasedOverrides);
    setHasSimulated(false);
  }, [analysisBasedOverrides]);

  // Scroll to hash anchor once analysis is loaded (e.g. #scenario-simulator from nextSteps CTA).
  useEffect(() => {
    if (loading || !analysis) return;
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, analysis]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading coverage intelligence…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-4">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4 lg:hidden">
        <ScenarioInputCard
          title="Coverage inputs"
          subtitle="Choose an item to evaluate and run a deterministic insurance and warranty analysis."
          badge={<StatusChip tone="info">Trust-first</StatusChip>}
        >
          {itemsError ? <div className="text-sm text-rose-700">{itemsError}</div> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px] md:items-end">
            <label className="text-xs text-gray-600">
              Inventory item
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={itemsLoading || items.length === 0}
              >
                {items.length === 0 && <option value="">No inventory items found</option>}
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.room?.name ? ` • ${item.room.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" disabled={!selectedItemId} onClick={openItemCoverage}>
              Review coverage
            </Button>
          </div>
          {selectedItem ? (
            <ReadOnlySummaryBlock
              items={[
                { label: 'Category', value: selectedItem.category },
                { label: 'Room', value: selectedItem.room?.name ?? 'Unassigned room' },
                {
                  label: 'Coverage status',
                  value: selectedItem.coverageStateLabel
                    || (selectedItemHasGap ? 'Coverage missing' : 'Coverage information incomplete'),
                  emphasize: selectedItemHasGap,
                },
              ]}
              columns={2}
            />
          ) : null}
        </ScenarioInputCard>

        {!hasAnalysis && (
          <ScenarioInputCard
            title="No analysis yet"
            subtitle="Run Coverage Intelligence to evaluate insurance and warranty value for this property."
            badge={<ShieldCheck className="h-5 w-5 text-teal-600" />}
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button onClick={runNow} disabled={running}>
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
              />
            }
          >
            <p className="text-sm text-slate-600">
              Educational decision support only. This assessment does not recommend specific carriers or plans.
            </p>
          </ScenarioInputCard>
        )}

        {analysis && (
          <>
            <ResultHeroCard
              eyebrow="Scenario comparison"
              title="Coverage & Premium Review"
              value="Review modeled tradeoffs"
              status={<StatusChip tone={statusChipTone}>{humanizeEnum(analysis.status)}</StatusChip>}
              summary="This comparison shows modeled warranty cost and repair exposure. Insurance findings are questions from the available record, not a coverage or purchase conclusion."
              highlights={[
                `Confidence: ${analysis.confidence}`,
                `Insurance review: ${insuranceReviewState(analysis)}`,
                'Warranty: scenario estimate only',
              ]}
              className={scenarioHeroClass()}
              actions={
                <ActionPriorityRow
                  primaryAction={
                    <Button onClick={runNow} disabled={running} variant="outline">
                      {running ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Re-running…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Re-run analysis
                        </>
                      )}
                    </Button>
                  }
                  secondaryActions={<Button onClick={fetchStatus} variant="ghost">Refresh</Button>}
                />
              }
            />

            <MobileKpiStrip className="grid-cols-2 lg:grid-cols-4">
              <MobileKpiTile
                label="Expected repair risk"
                value={money(analysis.warranty.expectedAnnualRepairRiskUsd)}
                tone="warning"
              />
              <MobileKpiTile
                label="Warranty annual cost"
                value={money(analysis.warranty.inputsUsed.warrantyAnnualCostUsd)}
                tone="neutral"
              />
              <MobileKpiTile
                label="Net impact"
                value={money(analysis.warranty.expectedNetImpactUsd)}
                tone={(analysis.warranty.expectedNetImpactUsd ?? 0) >= 0 ? 'positive' : 'danger'}
              />
              <MobileKpiTile
                label="Break-even"
                value={
                  analysis.warranty.breakEvenMonths === null || analysis.warranty.breakEvenMonths === undefined
                    ? '—'
                    : `${analysis.warranty.breakEvenMonths} mo`
                }
                tone="neutral"
              />
            </MobileKpiStrip>

            <ReadOnlySummaryBlock
              columns={2}
              items={[
                { label: 'Comparison state', value: 'Scenario estimate only', emphasize: true },
                { label: 'Impact level', value: humanizeEnum(analysis.impactLevel) },
                { label: 'Insurance review', value: insuranceReviewState(analysis) },
                { label: 'Warranty comparison', value: 'Modeled cost and repair exposure' },
                { label: 'Computed', value: compactDate(analysis.computedAt) },
                { label: 'Guidance', value: 'Educational only; not carrier advice.' },
              ]}
            />

            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Insurance findings</h4>

              <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Annual premium</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {money(analysis.insurance.inputsUsed.annualPremiumUsd)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Deductible</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {money(analysis.insurance.inputsUsed.deductibleUsd)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Cash buffer</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {money(analysis.insurance.inputsUsed.cashBufferUsd)}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-900">Flags</div>
                <div className="space-y-2">
                  {analysis.insurance.flags.length === 0 && (
                    <div className="text-sm text-gray-500">
                      No questions were generated from the limited record inputs. This does not confirm coverage.
                    </div>
                  )}
                  {analysis.insurance.flags.map((flag) => (
                    <div key={flag.code} className="rounded-xl border border-gray-200 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{flag.label}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${severityPillClasses(flag.severity)}`}>
                          {humanizeEnum(flag.severity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-900">Considered add-ons</div>
                <div className="space-y-2">
                  {analysis.insurance.recommendedAddOns.length === 0 && (
                    <div className="text-sm text-gray-500">No add-on prompts from current signals.</div>
                  )}
                  {analysis.insurance.recommendedAddOns.map((addOn) => (
                    <div key={addOn.code} className="rounded-xl border border-gray-200 p-3">
                      <div className="text-sm font-medium text-gray-900">{addOn.label}</div>
                      <div className="mt-1 text-xs text-gray-600">{addOn.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Warranty economics</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Expected annual repair risk</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {money(analysis.warranty.expectedAnnualRepairRiskUsd)}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Expected net impact</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {money(analysis.warranty.expectedNetImpactUsd)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Positive means projected repair risk exceeds warranty costs.
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Break-even months</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {analysis.warranty.breakEvenMonths ?? '—'}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <div>Warranty annual cost: {money(analysis.warranty.inputsUsed.warrantyAnnualCostUsd)}</div>
                <div>Warranty service fee: {money(analysis.warranty.inputsUsed.warrantyServiceFeeUsd)}</div>
              </div>
            </section>

            <DecisionTraceCard traces={analysis.decisionTrace} counts={decisionTraceCounts} />

            <ScenarioInputCard
              title="Try your scenario"
              subtitle="Adjust premiums, deductible, warranty cost, and risk tolerance to compare outcomes."
              badge={<Sparkles className="h-4 w-4 text-purple-600" />}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-gray-600">
                  Annual premium (USD)
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={toInputValue(overrides.annualPremiumUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        annualPremiumUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Deductible (USD)
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={toInputValue(overrides.deductibleUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        deductibleUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Warranty annual cost (USD)
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={toInputValue(overrides.warrantyAnnualCostUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        warrantyAnnualCostUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Warranty service fee (USD)
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={toInputValue(overrides.warrantyServiceFeeUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        warrantyServiceFeeUsd: e.target.value === '' ? undefined : Number(e.target.value),
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
                  Risk tolerance
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    value={overrides.riskTolerance ?? 'MEDIUM'}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        riskTolerance: e.target.value as CoverageAnalysisOverrides['riskTolerance'],
                      }))
                    }
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={saveScenario}
                  onChange={(e) => setSaveScenario(e.target.checked)}
                />
                Save this simulation scenario
              </label>
              <ActionPriorityRow
                primaryAction={
                  <Button onClick={runSimulation} disabled={simulating}>
                    {simulating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Simulating…
                      </>
                    ) : (
                      'Simulate scenario'
                    )}
                  </Button>
                }
                secondaryActions={
                  <Button onClick={fetchStatus} disabled={simulating} variant="outline">
                    Refresh
                  </Button>
                }
              />
            </ScenarioInputCard>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
           DESKTOP LAYOUT  (hidden on mobile/tablet — lg:block)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block">

        {/* ─── 1. CONTROLS ROW ─────────────────────────────────────────────── */}
        <div className="flex items-end gap-3 rounded-2xl border border-black/[0.07] bg-white px-5 py-4 shadow-sm">
          {/* Property selector injected from page */}
          {propertySelector && (
            <>
              <div className="w-56 flex-shrink-0">{propertySelector}</div>
              <div className="mx-1 h-8 w-px self-center bg-slate-100" />
            </>
          )}

          {/* Item selector — for drilling into a specific item's page; does not affect property analysis */}
          <div className="min-w-0 flex-1">
            <label htmlFor="coverage-item-selector" className="mb-1.5 block text-xs font-medium text-slate-600">
              Drill into item
            </label>
            {itemsError ? (
              <p className="text-xs text-rose-600">{itemsError}</p>
            ) : (
              <select
                id="coverage-item-selector"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                disabled={itemsLoading || items.length === 0}
              >
                {items.length === 0 && <option value="">No inventory items found</option>}
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.room?.name ? ` · ${item.room.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={openItemCoverage}
            disabled={!selectedItemId}
            className="h-9 flex-shrink-0 text-xs"
          >
            View Item Coverage
          </Button>

          <div className="mx-1 h-8 w-px flex-shrink-0 self-center bg-slate-100" />

          {/* Property-level analysis */}
          <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
            <Button
              onClick={runNow}
              disabled={running}
              size="sm"
              className="h-9 min-w-[160px] text-xs"
            >
              {running ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  Re-run Property Analysis
                </>
              )}
            </Button>
            <p className="text-[11px] text-slate-600">Covers all home systems</p>
          </div>
        </div>

        {/* ─── 2. HERO VERDICT AREA (full-width, no sidebar) ───────────────── */}
        {analysis ? (() => {
          const scenarioIcon = getScenarioIcon();
          const annualDelta = analysis.warranty.expectedNetImpactUsd ?? 0;
          const risk = getBiggestRisk(analysis);
          const metricItems = [
            { label: 'Comparison state', value: 'Scenario estimate' },
            { label: 'Insurance review', value: insuranceReviewState(analysis) },
            { label: 'Warranty', value: 'Modeled tradeoffs' },
            { label: 'Confidence', value: humanizeEnum(analysis.confidence) },
            { label: 'Impact level', value: humanizeEnum(analysis.impactLevel) },
            {
              label: 'Break-even',
              value: analysis.warranty.breakEvenMonths != null
                ? `${analysis.warranty.breakEvenMonths} mo`
                : '—',
            },
          ];
          return (
            <section className={cn('mt-4 rounded-2xl border p-6', scenarioHeroClass())}>
              {/* Top row: eyebrow + timestamp + Re-run */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] font-semibold tracking-normal text-slate-600">Coverage Insight</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600">{compactDate(analysis.computedAt)}</span>
                  <Button
                    onClick={runNow}
                    disabled={running}
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 bg-white/70 px-2.5 text-xs"
                  >
                    {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {running ? 'Running…' : 'Re-run'}
                  </Button>
                </div>
              </div>

              {/* Scenario icon + status + headline */}
              <div className="mt-3 flex items-start gap-4">
                <span className={cn('mt-0.5 inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-sm', scenarioIcon.wrap)}>
                  <scenarioIcon.Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold tracking-normal text-slate-700">
                      Scenario estimate
                    </span>
                    <StatusChip tone={statusChipTone}>{humanizeEnum(analysis.status)}</StatusChip>
                  </div>
                  <h2 className="mt-2.5 text-2xl font-semibold leading-snug tracking-tight text-slate-900">
                    Warranty cost and modeled repair exposure
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    Review the assumptions and controlling contract terms. This comparison does not tell you whether to buy or decline protection.
                  </p>
                </div>
              </div>

              {/* Compact metric strip */}
              <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-1.5 xl:grid-cols-6">
                {metricItems.map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 shadow-sm">
                    <dt className="text-[11px] text-slate-600">{label}</dt>
                    <dd className="mt-0.5 text-xs font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* KPI tiles */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">Expected Repair Cost</p>
                  <p className="mt-2 text-[1.6rem] font-semibold leading-none tracking-tight text-slate-900">
                    {money(analysis.warranty.expectedAnnualRepairRiskUsd)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-600">based on system age &amp; failure probability</p>
                </div>
                <div className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">Warranty Cost</p>
                  <p className="mt-2 text-[1.6rem] font-semibold leading-none tracking-tight text-slate-900">
                    {money(analysis.warranty.inputsUsed.warrantyAnnualCostUsd)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-600">annual premium</p>
                </div>
                <div className="rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">Cost Difference</p>
                  <p className={cn('mt-2 text-[1.6rem] font-semibold leading-none tracking-tight', deltaColorClass(annualDelta))}>
                    {money(annualDelta)}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-600">{deltaCaptionShort(annualDelta)}</p>
                </div>
              </div>

              {/* Review focus + biggest record signal */}
              <div className={cn('mt-3 grid gap-3', risk ? 'xl:grid-cols-2' : 'grid-cols-1')}>
                <div className="flex items-center gap-3 rounded-xl border border-black/[0.07] bg-white/60 px-4 py-3">
                  <Shield className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span className="text-[11px] font-semibold tracking-normal text-slate-600">Review focus</span>
                  <span className="mx-0.5 h-3.5 w-px flex-shrink-0 bg-slate-200" />
                  <span className="text-sm font-medium text-slate-800">{reviewFocus()}</span>
                </div>
                {risk && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
                    <p className="text-[11px] font-semibold tracking-normal text-rose-400">Biggest risk · {risk.label}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold leading-snug text-slate-800">{risk.title}</p>
                      <p className="flex-shrink-0 text-[11px] text-slate-500">Est. {risk.exposure}</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-600">Educational only. Not carrier-specific advice.</p>
            </section>
          );
        })() : (
          /* ─── Empty / no analysis state ─── */
          <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-teal-100 bg-teal-50">
              <ShieldCheck className="h-6 w-6 text-teal-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-800">No analysis yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Click{' '}
              <span className="font-medium text-slate-700">Re-run Property Analysis</span> to generate a
              full coverage report across all your home systems.
            </p>
            <div className="mt-5">
              <Button onClick={runNow} disabled={running}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Run analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ─── 3. NEXT STEPS (full-width horizontal cards) ─────────────────── */}
        {analysis && analysis.nextSteps && analysis.nextSteps.length > 0 && (
          <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Next Steps</p>
            <div className={cn(
              'grid gap-3',
              analysis.nextSteps.length === 1 ? 'grid-cols-1'
                : analysis.nextSteps.length === 2 ? 'xl:grid-cols-2'
                : 'xl:grid-cols-3'
            )}>
              {analysis.nextSteps.slice(0, 3).map((step, i) => {
                const stepAction = step.action;
                return (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700">{step.title}</p>
                        {step.detail && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{step.detail}</p>
                        )}
                        {stepAction && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-7 rounded-lg px-2.5 text-[11px]"
                            onClick={() => router.push(stepAction.href)}
                          >
                            {stepAction.label}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── 3. SCENARIO SIMULATOR + INSURANCE FINDINGS ──────────────────── */}
        {analysis && (
          <div className="mt-4 grid gap-4 xl:grid-cols-2 xl:items-start">

            {/* LEFT: Scenario Simulator */}
            <section id="scenario-simulator" className="rounded-2xl border border-black/[0.07] bg-white p-6 md:p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Scenario Simulator</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Adjust property-wide assumptions to explore how the modeled cost comparison changes.
                  </p>
                </div>
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label htmlFor="coverage-annual-premium" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Annual Premium (USD)
                  </label>
                  <input
                    id="coverage-annual-premium"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={toInputValue(overrides.annualPremiumUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        annualPremiumUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="coverage-deductible" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Deductible (USD)
                  </label>
                  <input
                    id="coverage-deductible"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={toInputValue(overrides.deductibleUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        deductibleUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="coverage-warranty-annual-cost" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Warranty Annual Cost (USD)
                  </label>
                  <input
                    id="coverage-warranty-annual-cost"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={toInputValue(overrides.warrantyAnnualCostUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        warrantyAnnualCostUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="coverage-warranty-service-fee" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Warranty Service Fee (USD)
                  </label>
                  <input
                    id="coverage-warranty-service-fee"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={toInputValue(overrides.warrantyServiceFeeUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        warrantyServiceFeeUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="coverage-cash-buffer" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Cash Buffer (USD)
                  </label>
                  <input
                    id="coverage-cash-buffer"
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={toInputValue(overrides.cashBufferUsd)}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        cashBufferUsd: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="coverage-risk-tolerance" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Risk Tolerance
                  </label>
                  <select
                    id="coverage-risk-tolerance"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 md:h-10 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/60"
                    value={overrides.riskTolerance ?? 'MEDIUM'}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        riskTolerance: e.target.value as CoverageAnalysisOverrides['riskTolerance'],
                      }))
                    }
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={saveScenario}
                    onChange={(e) => setSaveScenario(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Save this scenario
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => { setOverrides(analysisBasedOverrides); setHasSimulated(false); }}
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs"
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={runSimulation}
                    disabled={simulating}
                    size="sm"
                    className="h-9 min-w-[80px] text-xs"
                  >
                    {simulating ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Simulating…
                      </>
                    ) : (
                      'Simulate'
                    )}
                  </Button>
                </div>
              </div>

              {/* Simulation Result Box */}
              {hasSimulated && (
                <div className={cn('mt-4 rounded-xl border p-3.5', scenarioPanelClass())}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold tracking-normal text-slate-500">
                      Simulation result
                    </p>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold tracking-normal text-slate-700">
                      Scenario estimate
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    {simulationTakeaway(analysis)}
                  </p>
                  {analysis.warranty.breakEvenMonths != null && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Break-even: {analysis.warranty.breakEvenMonths} months
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* RIGHT: Insurance Findings */}
            <section className="rounded-2xl border border-black/[0.07] bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Insurance Findings</h3>

              {/* Policy Signals */}
              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-semibold tracking-normal text-slate-600">
                    Policy Signals
                  </p>
                </div>
                {analysis.insurance.flags.length === 0 ? (
                  <p className="pl-5 text-sm text-slate-600">No critical signals detected.</p>
                ) : (
                  <div className="space-y-2">
                    {analysis.insurance.flags.map((flag) => (
                      <div
                        key={flag.code}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                          <p className="text-sm text-slate-700">{flag.label}</p>
                        </div>
                        <span
                          className={cn(
                            'ml-3 flex-shrink-0 rounded-full border px-2 py-0.5 text-xs',
                            severityPillClasses(flag.severity)
                          )}
                        >
                          {humanizeEnum(flag.severity)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Topics to review */}
              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-semibold tracking-normal text-slate-600">
                    Topics to Review
                  </p>
                </div>
                {analysis.insurance.recommendedAddOns.length === 0 ? (
                  <p className="pl-5 text-sm text-slate-600">
                    No topics were generated from the current limited signals. This does not confirm coverage.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {analysis.insurance.recommendedAddOns.map((addOn) => (
                      <div
                        key={addOn.code}
                        className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{addOn.label}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{addOn.why}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Insurance Inputs Summary */}
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                <InsuranceInputTile
                  label="Annual Premium"
                  value={money(analysis.insurance.inputsUsed.annualPremiumUsd)}
                />
                <InsuranceInputTile
                  label="Deductible"
                  value={money(analysis.insurance.inputsUsed.deductibleUsd)}
                />
                <InsuranceInputTile
                  label="Cash Buffer"
                  value={money(analysis.insurance.inputsUsed.cashBufferUsd)}
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Educational record review only. Confirm coverage, exclusions, limits, and eligibility
                using the controlling policy language or a licensed insurance professional.
              </p>
            </section>
          </div>
        )}

        {/* ─── 4. DECISION TRACE (full width) ──────────────────────────────── */}
        {analysis && (
          <DecisionTraceCard className="mt-4" traces={analysis.decisionTrace} counts={decisionTraceCounts} />
        )}

      </div>
    </div>
  );
}
