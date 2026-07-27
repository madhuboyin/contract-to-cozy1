'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
import {
  ActionPriorityRow,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import { api } from '@/lib/api/client';
import type { Document } from '@/types';

type RiskPremiumOptimizerPanelProps = {
  propertyId: string;
};

type OverrideInputs = {
  annualPremium: string;
  deductibleAmount: string;
  cashBuffer: string;
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
};

const EMPTY_INPUTS: OverrideInputs = {
  annualPremium: '',
  deductibleAmount: '',
  cashBuffer: '',
  riskTolerance: 'MEDIUM',
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

function statusChipTone(status?: RiskPremiumOptimizationDTO['status']): 'good' | 'elevated' | 'danger' | 'info' {
  if (status === 'READY') return 'good';
  if (status === 'STALE') return 'elevated';
  if (status === 'ERROR') return 'danger';
  return 'info';
}

function priorityTone(priority: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (priority === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (priority === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function verificationTone(direction: 'DECREASED' | 'INCREASED' | 'UNCHANGED' | 'UNKNOWN') {
  if (direction === 'DECREASED') return 'bg-emerald-100 text-emerald-700';
  if (direction === 'INCREASED') return 'bg-rose-100 text-rose-700';
  if (direction === 'UNCHANGED') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function RiskPremiumOptimizerPanel({ propertyId }: RiskPremiumOptimizerPanelProps) {
  const searchParams = useSearchParams();
  const requestedAssumptionSetId = searchParams.get('assumptionSetId');
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
  const [documents, setDocuments] = useState<Document[]>([]);

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

  useEffect(() => {
    void api.listDocuments(propertyId).then((response) => {
      if (response.success) setDocuments(response.data.documents);
    });
  }, [propertyId]);

  const normalizedOverrides = useMemo<RiskPremiumOptimizerOverrides>(() => {
    return {
      annualPremium: parseOptionalNumber(inputs.annualPremium),
      deductibleAmount: parseOptionalNumber(inputs.deductibleAmount),
      cashBuffer: parseOptionalNumber(inputs.cashBuffer),
      riskTolerance: inputs.riskTolerance,
    };
  }, [inputs]);

  const runNow = async () => {
    if (!propertyId) return;
    setRunning(true);
    setError(null);
    try {
      const next = await runRiskPremiumOptimizer(propertyId, normalizedOverrides, {
        assumptionSetId: requestedAssumptionSetId,
      });
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
        completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
      };

      const result = await updateRiskMitigationPlanItem(propertyId, planItemId, payload);

      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status:
            nextStatus === 'COMPLETED' || nextStatus === 'SKIPPED' || nextStatus === 'RESTORED'
              ? 'STALE'
              : prev.status,
          planItems: prev.planItems.map((item) =>
            item.id === planItemId ? result.planItem : item
          ),
        };
      });

      if (nextStatus === 'COMPLETED' || nextStatus === 'SKIPPED' || nextStatus === 'RESTORED') {
        setRerunRecommended(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update mitigation plan item.');
    } finally {
      setUpdatingPlanItemId(null);
    }
  };

  const handleEvidenceUpdate = async (planItemId: string, evidenceDocumentId: string | null) => {
    setUpdatingPlanItemId(planItemId);
    setError(null);
    try {
      const result = await updateRiskMitigationPlanItem(propertyId, planItemId, {
        evidenceDocumentId,
      });
      setAnalysis((previous) => previous
        ? {
            ...previous,
            planItems: previous.planItems.map((item) =>
              item.id === planItemId ? result.planItem : item
            ),
          }
        : previous);
    } catch (err: any) {
      setError(err?.message || 'Failed to update evidence.');
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-8 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm text-gray-600">Loading loss-prevention plan…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <ScenarioInputCard
        title="Loss-prevention context"
        subtitle="Use current home and policy context to identify practical ways to reduce loss exposure."
        badge={<StatusChip tone="info">Planning only</StatusChip>}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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

        <ActionPriorityRow
          primaryAction={
            <Button onClick={runNow} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                'Build loss-prevention plan'
              )}
            </Button>
          }
          secondaryActions={<Button variant="ghost" onClick={fetchStatus}>Refresh</Button>}
        />
      </ScenarioInputCard>

      {!hasAnalysis && (
        <section className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">No loss-prevention plan yet</h3>
              <p className="text-sm text-gray-600 mt-1">
                Build a plan to organize relevant loss-prevention work and evidence.
              </p>
            </div>
            <ShieldAlert className="h-6 w-6 text-teal-700" />
          </div>
        </section>
      )}

      {analysis && (
        <>
          <PropertyContextStatusNotice context={analysis.propertyContext} title="Optimizer applicability" />
          {(analysis.status === 'STALE' || rerunRecommended) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Inputs changed or plan progress was updated. Rebuild the plan for a fresh review.
            </div>
          )}

          <ResultHeroCard
            eyebrow="Loss-prevention review"
            title="Risk reduction plan"
            value={`${analysis.recommendations.length} actions`}
            status={<StatusChip tone={statusChipTone(analysis.status)}>{analysis.status}</StatusChip>}
            summary="Review possible loss-prevention actions. Any premium eligibility or change must be confirmed by the carrier and is not guaranteed."
            highlights={[
              `Confidence: ${analysis.confidence}`,
              `Annual premium input: ${money(analysis.inputs.annualPremium)}`,
              `Computed: ${compactDate(analysis.computedAt)}`,
            ]}
            actions={
              <ActionPriorityRow
                primaryAction={
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
                }
              />
            }
          />

          <ReadOnlySummaryBlock
            columns={2}
            items={[
              { label: 'Recommended actions', value: String(analysis.recommendations.length), emphasize: true },
              { label: 'Confidence', value: analysis.confidence },
              { label: 'Annual premium input', value: money(analysis.inputs.annualPremium) },
              { label: 'Computed', value: compactDate(analysis.computedAt) },
            ]}
          />

          {analysis.observedPremiumComparison?.hasCompletedMitigations ? (
            <section className="rounded-2xl border border-black/10 bg-white p-5">
              <h4 className="text-base font-semibold text-gray-900">Observed premium comparison</h4>
              <p className="mt-1 text-sm text-gray-600">{analysis.observedPremiumComparison.note}</p>
              <p className="mt-1 text-xs font-medium text-amber-800">
                This comparison is observational. It does not establish that completed work caused a premium change.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-black/[0.02] p-3 text-xs text-gray-700">
                  Completed actions: <span className="font-semibold">{analysis.observedPremiumComparison.completedCount}</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-black/[0.02] p-3 text-xs text-gray-700">
                  Baseline run: <span className="font-semibold">{compactDate(analysis.observedPremiumComparison.baselineComputedAt || undefined)}</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-black/[0.02] p-3 text-xs text-gray-700">
                  Baseline premium: <span className="font-semibold">{money(analysis.observedPremiumComparison.baselineAnnualPremium)}</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-black/[0.02] p-3 text-xs text-gray-700">
                  Current premium: <span className="font-semibold">{money(analysis.observedPremiumComparison.currentAnnualPremium)}</span>
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verificationTone(analysis.observedPremiumComparison.observedDirection)}`}>
                  {analysis.observedPremiumComparison.observedDirection}
                </span>
                <span className="text-gray-700">
                  Observed delta: {analysis.observedPremiumComparison.observedPremiumDelta == null ? '—' : money(analysis.observedPremiumComparison.observedPremiumDelta)}
                </span>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Loss exposure signals</h4>
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
                {showAllDrivers ? 'Show less' : 'Show more'}
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Plan suggestions</h4>
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
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>Type: {recommendation.type}</div>
                    <div>Cost: {money(recommendation.estimatedCost)}</div>
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
                  : 'Show more'}
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white p-5">
            <h4 className="text-base font-semibold text-gray-900">Loss-prevention plan</h4>
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
                        Estimated project cost: {money(item.estimatedCost)}
                      </div>
                      <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                        <span className="font-semibold">Carrier benefit:</span>{' '}
                        {item.carrierBenefitStatus === 'UNKNOWN'
                          ? 'Unknown — no discount or premium effect is assumed.'
                          : item.carrierBenefitStatus === 'CONFIRMED_ELIGIBLE'
                            ? 'Eligibility confirmed by linked carrier evidence.'
                            : 'Carrier evidence says this is not eligible.'}
                        <div className="mt-1">{item.carrierReviewQuestion}</div>
                      </div>
                      <div className="mt-2 text-xs">
                        <Link
                          href={item.handoff.href}
                          className="font-medium text-teal-700 underline-offset-2 hover:underline"
                        >
                          {item.handoff.label}
                        </Link>
                        <div className="mt-1 text-gray-500">{item.handoff.safetyNote}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="min-w-[220px] text-xs text-gray-600">
                          Completion evidence
                          <select
                            value={item.evidenceDocumentId ?? ''}
                            disabled={updatingPlanItemId === item.id}
                            onChange={(event) =>
                              void handleEvidenceUpdate(item.id, event.target.value || null)
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="">No linked evidence</option>
                            {documents.map((document) => (
                              <option key={document.id} value={document.id}>{document.name}</option>
                            ))}
                          </select>
                        </label>
                        {item.evidenceDocumentId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={updatingPlanItemId === item.id}
                            onClick={() => void handleEvidenceUpdate(item.id, null)}
                          >
                            Remove evidence
                          </Button>
                        ) : (
                          <Button asChild type="button" variant="ghost">
                            <Link href={`/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}`}>
                              Upload evidence
                            </Link>
                          </Button>
                        )}
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
                        <option value="COMPLETED">Completed</option>
                        <option value="SKIPPED">Skipped</option>
                        <option value="RESTORED">Restored</option>
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
