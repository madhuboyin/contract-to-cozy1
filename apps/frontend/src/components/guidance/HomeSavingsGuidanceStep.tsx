'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, PiggyBank, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  getHomeSavingsSummary,
  runHomeSavings,
  type HomeSavingsSummaryDTO,
} from '@/lib/api/homeSavingsApi';

type HomeSavingsGuidanceStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  onComplete: () => void;
};

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function summarizeSavings(summary: HomeSavingsSummaryDTO) {
  const opportunities = summary.categories.filter((category) => category.topOpportunity);
  const topOpportunity = [...opportunities].sort(
    (a, b) =>
      (b.topOpportunity?.estimatedAnnualSavings ?? 0) -
      (a.topOpportunity?.estimatedAnnualSavings ?? 0)
  )[0]?.topOpportunity ?? null;

  return {
    connectedCount: summary.categories.filter((category) => category.account).length,
    opportunityCount: opportunities.length,
    topOpportunity,
  };
}

export function HomeSavingsGuidanceStep({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  onComplete,
}: HomeSavingsGuidanceStepProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);

  const query = useQuery({
    queryKey: ['guidance', 'home-savings-step', propertyId, journeyId],
    queryFn: () => getHomeSavingsSummary(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  const summary = query.data ?? null;
  const derivedSummary = summary ? summarizeSavings(summary) : null;

  async function handleRun() {
    setRunning(true);
    try {
      await runHomeSavings(propertyId);
      await query.refetch();
    } finally {
      setRunning(false);
    }
  }

  async function handleComplete() {
    if (!summary || !derivedSummary) return;
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        proofType: 'home_savings_summary_reviewed',
        proofId: `${journeyId}:${stepKey}:${summary.updatedAt}`,
        journeyId,
        stepKey,
        sourceToolKey: 'home-savings',
        potentialMonthlySavings: summary.potentialMonthlySavings,
        potentialAnnualSavings: summary.potentialAnnualSavings,
        connectedCount: derivedSummary.connectedCount,
        opportunityCount: derivedSummary.opportunityCount,
        topOpportunityId: derivedSummary.topOpportunity?.id ?? null,
        topOpportunityHeadline: derivedSummary.topOpportunity?.headline ?? null,
        updatedAt: summary.updatedAt,
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
        Loading savings summary…
      </div>
    );
  }

  if (query.isError || !summary || !derivedSummary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-3">
            <p className="mb-0">We couldn’t load the savings summary for this step.</p>
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
          Review available savings that can offset this decision
        </p>
        <p className="mb-0 text-sm text-slate-600">
          Guidance uses the same savings analysis here so you can see practical offset opportunities
          without leaving the journey.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Potential monthly savings</p>
          <p className="mb-0 text-lg font-semibold text-slate-900">
            {formatMoney(summary.potentialMonthlySavings)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Potential annual savings</p>
          <p className="mb-0 text-lg font-semibold text-slate-900">
            {formatMoney(summary.potentialAnnualSavings)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Savings opportunities</p>
          <p className="mb-0 text-lg font-semibold text-slate-900">
            {derivedSummary.opportunityCount}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-sm font-medium text-slate-900">Connected categories</p>
        <p className="mb-0 text-sm text-slate-700">
          {derivedSummary.connectedCount} of {summary.categories.length} categories have account or plan
          context attached.
        </p>
      </div>

      {derivedSummary.topOpportunity ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-sm font-medium text-slate-900">Top opportunity</p>
          <p className="mb-0 text-sm text-slate-700">
            {derivedSummary.topOpportunity.headline} ·{' '}
            {formatMoney(derivedSummary.topOpportunity.estimatedAnnualSavings)}/yr
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-0 text-sm text-slate-700">
            No major savings flag is active right now, but you can still refresh the analysis with the latest property context.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="rounded-xl" disabled={completing} onClick={handleComplete}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {completing ? 'Saving…' : 'Use this summary & continue'}
        </Button>
        <Button type="button" variant="outline" className="rounded-xl" disabled={running} onClick={handleRun}>
          <PiggyBank className="mr-2 h-4 w-4" />
          {running ? 'Refreshing…' : 'Refresh savings summary'}
        </Button>
      </div>
    </div>
  );
}

export default HomeSavingsGuidanceStep;
