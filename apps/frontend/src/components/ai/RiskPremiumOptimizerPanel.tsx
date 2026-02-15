'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  getRiskPremiumOptimizer,
  RiskMitigationPlanItemStatus,
  RiskPremiumOptimizationDTO,
  RiskPremiumOptimizerOverrides,
  runRiskPremiumOptimizer,
  updateRiskMitigationPlanItem,
} from '@/lib/api/riskPremiumOptimizerApi';
import { Button } from '@/components/ui/button';

type RiskPremiumOptimizerPanelProps = {
  propertyId: string;
};

type OverrideInputs = {
  annualPremium: string;
  deductibleAmount: string;
  cashBuffer: string;
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  assumeBundled: boolean;
};

const EMPTY_INPUTS: OverrideInputs = {
  annualPremium: '',
  deductibleAmount: '',
  cashBuffer: '',
  riskTolerance: 'MEDIUM',
  assumeBundled: false,
};

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return numeric;
}

function money(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function compactDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function statusTone(status?: RiskPremiumOptimizationDTO['status']) {
  if (status === 'READY') return 'bg-emerald-100 text-emerald-700';
  if (status === 'STALE') return 'bg-amber-100 text-amber-700';
  if (status === 'ERROR') return 'bg-rose-100 text-rose-700';
  return 'bg-gray-100 text-gray-700';
}

function priorityTone(priority: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (priority === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (priority === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function RiskPremiumOptimizerPanel({ propertyId }: RiskPremiumOptimizerPanelProps) {
  const [analysis, setAnalysis] = useState<RiskPremiumOptimizationDTO | null>(null);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<OverrideInputs>(EMPTY_INPUTS);
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [updatingPlanItemId, setUpdatingPlanItemId] = useState<string | null>(null);
  const [rerunRecommended, setRerunRecommended] = useState(false);

  const fetchStatus = async () => {
    if (!propertyId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getRiskPremiumOptimizer(propertyId);
      if (result.exists) {
        setHasAnalysis(true);
        setAnalysis(result.analysis);
      } else {
        setHasAnalysis(false);
        setAnalysis(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Risk-to-Premium Optimizer.');
      setHasAnalysis(false);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const normalizedOverrides = useMemo<RiskPremiumOptimizerOverrides>(() => {
    return {
      annualPremium: parseOptionalNumber(inputs.annualPremium),
      deductibleAmount: parseOptionalNumber(inputs.deductibleAmount),
      cashBuffer: parseOptionalNumber(inputs.cashBuffer),
      riskTolerance: inputs.riskTolerance,
      assumeBundled: inputs.assumeBundled,
    };
  }, [inputs]);

  const runNow = async () => {
    if (!propertyId) return;
    setRunning(true);
    setError(null);
    try {
      const next = await runRiskPremiumOptimizer(propertyId, normalizedOverrides);
      setHasAnalysis(true);
      setAnalysis(next);
      setRerunRecommended(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to run Risk-to-Premium Optimizer.');
    } finally {
      setRunning(false);
    }
  };

  const handlePlanStatusUpdate = async (planItemId: string, nextStatus: RiskMitigationPlanItemStatus) => {
    if (!analysis) return;
    setUpdatingPlanItemId(planItemId);
    setError(null);

    try {
      const payload = {
        status: nextStatus,
        completedAt: nextStatus === 'DONE' ? new Date().toISOString() : null,
      };

      const result = await updateRiskMitigationPlanItem(propertyId, planItemId, payload);

      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status:
            nextStatus === 'DONE' || nextStatus === 'SKIPPED'
              ? 'STALE'
              : prev.status,
          planItems: prev.planItems.map((item) =>
            item.id === planItemId ? result.planItem : item
          ),
        };
      });

      if (nextStatus === 'DONE' || nextStatus === 'SKIPPED') {
        setRerunRecommended(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update mitigation plan item.');
    } finally {
      setUpdatingPlanItemId(null);
    }
  };

  const topRecommendations = useMemo(() => {
    if (!analysis) return [];
    return showAllRecommendations ? analysis.recommendations : analysis.recommendations.slice(0, 3);
  }, [analysis, showAllRecommendations]);

  const topDrivers = useMemo(() => {
    if (!analysis) return [];
    return showAllDrivers ? analysis.premiumDrivers : analysis.premiumDrivers.slice(0, 3);
  }, [analysis, showAllDrivers]);

  const savingsLabel = useMemo(() => {
    if (!analysis) return '—';
    if (analysis.estimatedSavingsMin == null && analysis.estimatedSavingsMax == null) {
      return '—';
    }
    if (analysis.estimatedSavingsMin != null && analysis.estimatedSavingsMax != null) {
      return `${money(analysis.estimatedSavingsMin)} - ${money(analysis.estimatedSavingsMax)}`;
    }
    return money(analysis.estimatedSavingsMax ?? analysis.estimatedSavingsMin ?? null);
  }, [analysis]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading optimizer…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
        Educational insights only. This tool does not recommend specific insurers or carriers.
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h4 className="text-base font-semibold text-gray-900">Run optimizer</h4>
        <p className="text-sm text-gray-600 mt-1">
          Compare mitigation actions and policy levers with your current premium posture.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">
            Annual premium (USD)
            <input
              type="number"
              min={0}
              value={inputs.annualPremium}
              onChange={(e) => setInputs((prev) => ({ ...prev, annualPremium: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-gray-600">
            Deductible amount (USD)
            <input
              type="number"
              min={0}
              value={inputs.deductibleAmount}
              onChange={(e) => setInputs((prev) => ({ ...prev, deductibleAmount: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-gray-600">
            Cash buffer (USD)
            <input
              type="number"
              min={0}
              value={inputs.cashBuffer}
              onChange={(e) => setInputs((prev) => ({ ...prev, cashBuffer: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-gray-600">
            Risk tolerance
            <select
              value={inputs.riskTolerance}
              onChange={(e) =>
                setInputs((prev) => ({
                  ...prev,
                  riskTolerance: e.target.value as OverrideInputs['riskTolerance'],
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
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
            checked={inputs.assumeBundled}
            onChange={(e) => setInputs((prev) => ({ ...prev, assumeBundled: e.target.checked }))}
          />
          Assume bundled-discount posture in scenario
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={runNow} disabled={running}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              'Run optimizer'
            )}
          </Button>
          <Button variant="ghost" onClick={fetchStatus}>
            Refresh
          </Button>
        </div>
      </section>

      {!hasAnalysis && (
        <section className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">No optimizer run yet</h3>
              <p className="text-sm text-gray-600 mt-1">
                Run the optimizer to generate premium drivers and mitigation plan items.
              </p>
            </div>
            <ShieldAlert className="h-6 w-6 text-teal-700" />
          </div>
        </section>
      )}

      {analysis && (
        <>
          {(analysis.status === 'STALE' || rerunRecommended) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Inputs changed or plan progress was updated. Re-run the optimizer for a fresh estimate.
            </div>
          )}

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">Risk-to-Premium Optimizer</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(analysis.status)}`}>
                    {analysis.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {analysis.summary || 'No summary available yet.'}
                </p>
              </div>

              <Button variant="outline" onClick={runNow} disabled={running}>
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
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Estimated savings range</div>
                <div className="text-lg font-semibold text-gray-900">{savingsLabel}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Confidence</div>
                <div className="text-lg font-semibold text-gray-900">{analysis.confidence}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Annual premium input</div>
                <div className="text-lg font-semibold text-gray-900">
                  {money(analysis.inputs.annualPremium)}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Computed</div>
                <div className="text-sm font-semibold text-gray-900">{compactDate(analysis.computedAt)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Premium drivers</h4>
            <div className="mt-3 space-y-2">
              {topDrivers.map((driver) => (
                <div key={driver.code} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">{driver.title}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityTone(driver.severity)}`}>
                      {driver.severity}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{driver.detail}</div>
                </div>
              ))}
            </div>
            {analysis.premiumDrivers.length > 3 && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => setShowAllDrivers((prev) => !prev)}
              >
                {showAllDrivers ? 'Show fewer drivers' : `Show all ${analysis.premiumDrivers.length} drivers`}
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Recommendations</h4>
            <div className="mt-3 space-y-2">
              {topRecommendations.map((recommendation) => (
                <div key={recommendation.code} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">{recommendation.title}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityTone(recommendation.priority)}`}>
                      {recommendation.priority}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{recommendation.detail}</div>
                  <div className="text-xs text-gray-500 mt-2">{recommendation.whyThisMatters}</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                    <div>Type: {recommendation.type}</div>
                    <div>Cost: {money(recommendation.estimatedCost)}</div>
                    <div>
                      Savings: {money(recommendation.estimatedSavingsMin)} -{' '}
                      {money(recommendation.estimatedSavingsMax)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {analysis.recommendations.length > 3 && (
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => setShowAllRecommendations((prev) => !prev)}
              >
                {showAllRecommendations
                  ? 'Show fewer recommendations'
                  : `Show all ${analysis.recommendations.length} recommendations`}
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Mitigation plan checklist</h4>
            <div className="mt-3 space-y-2">
              {analysis.planItems.length === 0 && (
                <div className="text-sm text-gray-600">No plan items generated yet.</div>
              )}

              {analysis.planItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {item.title || item.actionType.replaceAll('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{item.why}</div>
                      <div className="text-xs text-gray-500 mt-2">
                        Cost: {money(item.estimatedCost)} • Savings: {money(item.estimatedSavingsMin)} - {money(item.estimatedSavingsMax)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityTone(item.priority)}`}>
                        {item.priority}
                      </span>
                      <select
                        value={item.status}
                        disabled={updatingPlanItemId === item.id}
                        onChange={(e) =>
                          handlePlanStatusUpdate(item.id, e.target.value as RiskMitigationPlanItemStatus)
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white"
                      >
                        <option value="RECOMMENDED">Recommended</option>
                        <option value="PLANNED">Planned</option>
                        <option value="DONE">Done</option>
                        <option value="SKIPPED">Skipped</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
