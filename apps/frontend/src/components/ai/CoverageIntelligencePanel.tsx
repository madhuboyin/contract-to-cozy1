'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
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

function verdictClasses(verdict?: CoverageAnalysisDTO['overallVerdict']) {
  if (verdict === 'WORTH_IT') return 'bg-emerald-100 text-emerald-700';
  if (verdict === 'NOT_WORTH_IT') return 'bg-rose-100 text-rose-700';
  return 'bg-amber-100 text-amber-700';
}

function impactClasses(impact?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL') {
  if (impact === 'POSITIVE') return 'bg-emerald-50 text-emerald-700';
  if (impact === 'NEGATIVE') return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

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

  const statusTone = useMemo(() => {
    if (!analysis) return 'bg-gray-100 text-gray-700';
    if (analysis.status === 'STALE') return 'bg-amber-100 text-amber-700';
    if (analysis.status === 'ERROR') return 'bg-rose-100 text-rose-700';
    return 'bg-emerald-100 text-emerald-700';
  }, [analysis]);

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? null;
  }, [items, selectedItemId]);

  const selectedItemHasGap = !!selectedItem && (!selectedItem.warrantyId || !selectedItem.insurancePolicyId);
  const currentPathWithQuery = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading coverage intelligence…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h4 className="text-base font-semibold text-gray-900">Get coverage for any inventory item</h4>
        <p className="text-sm text-gray-600 mt-1">
          Select an item to run a dedicated item-level coverage assessment. Known item details will be pre-filled.
        </p>

        {itemsError && <div className="mt-3 text-sm text-rose-700">{itemsError}</div>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="text-xs text-gray-600">
            Inventory item
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
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

        {selectedItem && (
          <div className="mt-3 text-xs text-gray-600">
            {selectedItem.category}
            {selectedItem.room?.name ? ` • ${selectedItem.room.name}` : ' • Unassigned room'}
            {selectedItemHasGap ? ' • Coverage gap detected' : ' • Has active coverage links'}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational decision support only. This assessment does not recommend specific carriers or plans.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!hasAnalysis && (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">No analysis yet</h3>
              <p className="text-sm text-gray-600 mt-1">
                Run Coverage Intelligence to evaluate insurance and warranty value for this property.
              </p>
            </div>
            <ShieldCheck className="h-6 w-6 text-teal-600" />
          </div>

          <div className="mt-5">
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
          </div>
        </div>
      )}

      {analysis && (
        <>
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">Coverage Intelligence</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                    {analysis.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{analysis.summary || 'No summary available.'}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdictClasses(analysis.overallVerdict)}`}>
                  Overall: {analysis.overallVerdict.replace('_', ' ')}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdictClasses(analysis.insuranceVerdict)}`}>
                  Insurance: {analysis.insuranceVerdict.replace('_', ' ')}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdictClasses(analysis.warrantyVerdict)}`}>
                  Warranty: {analysis.warrantyVerdict.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span>Confidence: {analysis.confidence}</span>
              <span>Impact: {analysis.impactLevel ?? '—'}</span>
              <span>Computed: {compactDate(analysis.computedAt)}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={runNow} disabled={running} variant="outline">
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Re-running…
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Re-run
                  </>
                )}
              </Button>
              <Button onClick={fetchStatus} variant="ghost">
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Insurance findings</h4>

              <div className="mt-3 text-sm text-gray-600 space-y-1">
                <div>Annual premium: {money(analysis.insurance.inputsUsed.annualPremiumUsd)}</div>
                <div>Deductible: {money(analysis.insurance.inputsUsed.deductibleUsd)}</div>
                <div>Cash buffer: {money(analysis.insurance.inputsUsed.cashBufferUsd)}</div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium text-gray-900 mb-2">Flags</div>
                <div className="space-y-2">
                  {analysis.insurance.flags.length === 0 && (
                    <div className="text-sm text-gray-500">No critical flags detected.</div>
                  )}
                  {analysis.insurance.flags.map((flag) => (
                    <div key={flag.code} className="rounded-xl border border-gray-200 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{flag.label}</span>
                        <span className="text-xs text-gray-500">{flag.severity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium text-gray-900 mb-2">Considered add-ons</div>
                <div className="space-y-2">
                  {analysis.insurance.recommendedAddOns.length === 0 && (
                    <div className="text-sm text-gray-500">No add-on prompts from current signals.</div>
                  )}
                  {analysis.insurance.recommendedAddOns.map((addOn) => (
                    <div key={addOn.code} className="rounded-xl border border-gray-200 p-3">
                      <div className="text-sm font-medium text-gray-900">{addOn.label}</div>
                      <div className="text-xs text-gray-600 mt-1">{addOn.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Warranty economics</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Expected annual repair risk</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {money(analysis.warranty.expectedAnnualRepairRiskUsd)}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Expected net impact</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {money(analysis.warranty.expectedNetImpactUsd)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Positive means projected repair risk exceeds warranty costs.
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">Break-even months</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {analysis.warranty.breakEvenMonths ?? '—'}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <div>Warranty annual cost: {money(analysis.warranty.inputsUsed.warrantyAnnualCostUsd)}</div>
                <div>Warranty service fee: {money(analysis.warranty.inputsUsed.warrantyServiceFeeUsd)}</div>
              </div>
            </section>
          </div>

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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${impactClasses(trace.impact)}`}>
                    {trace.impact}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h4 className="text-base font-semibold text-gray-900">Simulation (optional)</h4>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Try alternate premiums, deductible, warranty cost, and risk tolerance.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={saveScenario}
                onChange={(e) => setSaveScenario(e.target.checked)}
              />
              Save this simulation scenario
            </label>

            <div className="mt-4">
              <Button onClick={runSimulation} disabled={simulating} variant="outline">
                {simulating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Simulating…
                  </>
                ) : (
                  'Simulate'
                )}
              </Button>
            </div>
          </section>

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
