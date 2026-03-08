'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
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

type CoverageIntelligencePanelProps = {
  propertyId: string;
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

function verdictHeroClass(verdict?: CoverageAnalysisDTO['overallVerdict']) {
  if (verdict === 'NOT_WORTH_IT') {
    return 'border-rose-200/90 bg-[linear-gradient(145deg,#fffaf9,#ffeef0)]';
  }
  if (verdict === 'WORTH_IT') {
    return 'border-emerald-200/90 bg-[linear-gradient(145deg,#ffffff,#ecfdf5)]';
  }
  return 'border-amber-200/90 bg-[linear-gradient(145deg,#ffffff,#fffbeb)]';
}

export default function CoverageIntelligencePanel({ propertyId }: CoverageIntelligencePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
      const latest = await runCoverageAnalysis(propertyId);
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

  const selectedItemHasGap = !!selectedItem && (!selectedItem.warrantyId || !selectedItem.insurancePolicyId);
  const currentPathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const decisionTraceCounts = useMemo(() => {
    const counts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
    for (const trace of analysis?.decisionTrace ?? []) {
      if (trace.impact === 'POSITIVE' || trace.impact === 'NEGATIVE' || trace.impact === 'NEUTRAL') {
        counts[trace.impact] += 1;
      }
    }
    return counts;
  }, [analysis?.decisionTrace]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading coverage intelligence…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

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
          <Button
            type="button"
            disabled={!selectedItemId}
            onClick={() =>
              router.push(
                `/dashboard/properties/${propertyId}/inventory/items/${selectedItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`
              )
            }
          >
            Get coverage
          </Button>
        </div>
        {selectedItem ? (
          <ReadOnlySummaryBlock
            items={[
              { label: 'Category', value: selectedItem.category },
              { label: 'Room', value: selectedItem.room?.name ?? 'Unassigned room' },
              {
                label: 'Coverage links',
                value: selectedItemHasGap ? 'Gap detected' : 'Active links present',
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
            eyebrow="Coverage Result"
            title="Coverage Intelligence"
            value={humanizeEnum(analysis.overallVerdict)}
            status={<StatusChip tone={statusChipTone}>{humanizeEnum(analysis.status)}</StatusChip>}
            summary={analysis.summary || 'No summary available.'}
            highlights={[
              `Confidence: ${analysis.confidence}`,
              `Insurance verdict: ${humanizeEnum(analysis.insuranceVerdict)}`,
              `Warranty verdict: ${humanizeEnum(analysis.warrantyVerdict)}`,
            ]}
            className={verdictHeroClass(analysis.overallVerdict)}
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
              { label: 'Overall verdict', value: humanizeEnum(analysis.overallVerdict), emphasize: true },
              { label: 'Impact level', value: humanizeEnum(analysis.impactLevel) },
              { label: 'Insurance verdict', value: humanizeEnum(analysis.insuranceVerdict) },
              { label: 'Warranty verdict', value: humanizeEnum(analysis.warrantyVerdict) },
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
                  <div className="text-sm text-gray-500">No critical flags detected.</div>
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

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-gray-900">Decision trace</h4>
                <p className="mt-1 text-xs text-slate-500">How the recommendation was reached, step by step</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['NEUTRAL', 'NEGATIVE', 'POSITIVE'] as const).map((impact) => (
                  <span
                    key={impact}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${traceImpactPillClasses(impact)}`}
                  >
                    {humanizeEnum(impact)} {decisionTraceCounts[impact]}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {analysis.decisionTrace.map((trace, index) => (
                <div
                  key={`${trace.label}-${index}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    index === analysis.decisionTrace.length - 1 ? '' : 'border-b border-slate-100'
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

          {analysis.nextSteps && analysis.nextSteps.length > 0 && (
            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Recommended next steps</h4>
              <div className="mt-3 space-y-2">
                {analysis.nextSteps.map((step, index) => (
                  <div key={`${step.title}-${index}`} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900">{step.title}</div>
                      {step.priority && (
                        <span className="text-xs text-gray-500">{step.priority}</span>
                      )}
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
