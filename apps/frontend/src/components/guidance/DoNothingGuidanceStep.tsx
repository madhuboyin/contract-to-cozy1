'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  getLatestDoNothingRun,
  runDoNothingSimulation,
  type DoNothingRunDTO,
} from '@/lib/api/doNothingSimulatorApi';

type DoNothingGuidanceStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  onComplete: () => void;
};

function formatMoney(cents: number | null | undefined) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function severityRank(value: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (value === 'HIGH') return 3;
  if (value === 'MEDIUM') return 2;
  return 1;
}

function summarizeRun(run: DoNothingRunDTO) {
  const topRisk = [...run.outputs.topRiskDrivers].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  )[0] ?? null;
  const topLoss = [...run.outputs.biggestAvoidableLosses].sort(
    (a, b) => (b.estCostCentsMax ?? 0) - (a.estCostCentsMax ?? 0)
  )[0] ?? null;

  return {
    topRisk,
    topLoss,
    nextStepCount: run.nextSteps.length,
  };
}

export function DoNothingGuidanceStep({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  onComplete,
}: DoNothingGuidanceStepProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);

  const query = useQuery({
    queryKey: ['guidance', 'do-nothing-step', propertyId, journeyId],
    queryFn: () => getLatestDoNothingRun(propertyId, { horizonMonths: 12 }),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  const run = query.data?.exists ? query.data.run : null;
  const summary = run ? summarizeRun(run) : null;

  async function handleRun() {
    setRunning(true);
    try {
      await runDoNothingSimulation(propertyId, { horizonMonths: 12 });
      await query.refetch();
    } finally {
      setRunning(false);
    }
  }

  async function handleComplete() {
    if (!run || !summary) return;
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        proofType: 'do_nothing_summary_reviewed',
        proofId: `${journeyId}:${stepKey}:${run.id}`,
        journeyId,
        stepKey,
        sourceToolKey: 'do-nothing-simulator',
        runId: run.id,
        horizonMonths: run.horizonMonths,
        confidence: run.confidence,
        riskScoreDelta: run.riskScoreDelta,
        expectedCostDeltaCentsMin: run.expectedCostDeltaCentsMin,
        expectedCostDeltaCentsMax: run.expectedCostDeltaCentsMax,
        incidentLikelihood: run.incidentLikelihood,
        topRiskDriver: summary.topRisk?.title ?? null,
        topAvoidableLoss: summary.topLoss?.title ?? null,
        computedAt: run.computedAt,
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      onComplete();
    } finally {
      setCompleting(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Loading delay-cost summary…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-3">
            <p className="mb-0">We couldn’t load the cost-of-delay summary for this step.</p>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-2">
        <p className="mb-0 text-base font-semibold text-slate-900">
          Review the likely cost of waiting
        </p>
        <p className="mb-0 text-sm text-slate-600">
          Guidance uses the same delay-impact analysis here so you can compare action now versus
          waiting without leaving the journey.
        </p>
      </div>

      {!run || !summary ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm text-slate-600">
            No recent delay-impact analysis is available yet for this property.
          </p>
          <Button type="button" className="rounded-xl" disabled={running} onClick={handleRun}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            {running ? 'Generating…' : 'Generate 12-month delay analysis'}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">12-month added cost</p>
              <p className="mb-0 text-sm font-semibold text-slate-900">
                {formatMoney(run.expectedCostDeltaCentsMin)} to {formatMoney(run.expectedCostDeltaCentsMax)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Incident likelihood</p>
              <p className="mb-0 text-sm font-semibold text-slate-900">
                {run.incidentLikelihood ?? 'Not available'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Suggested next actions</p>
              <p className="mb-0 text-sm font-semibold text-slate-900">{summary.nextStepCount}</p>
            </div>
          </div>

          {summary.topRisk ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-sm font-medium text-slate-900">Top risk driver</p>
              <p className="mb-0 text-sm text-slate-700">
                {summary.topRisk.title} · {summary.topRisk.detail}
              </p>
            </div>
          ) : null}

          {summary.topLoss ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-sm font-medium text-slate-900">Biggest avoidable loss</p>
              <p className="mb-0 text-sm text-slate-700">
                {summary.topLoss.title} · {formatMoney(summary.topLoss.estCostCentsMin)} to{' '}
                {formatMoney(summary.topLoss.estCostCentsMax)}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" className="rounded-xl" disabled={completing} onClick={handleComplete}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {completing ? 'Saving…' : 'Use this summary & continue'}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" disabled={running} onClick={handleRun}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {running ? 'Refreshing…' : 'Refresh summary'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default DoNothingGuidanceStep;
