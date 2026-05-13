'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calendar, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  getLatestTimeline,
  runTimeline,
  type TimelineAnalysisDTO,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi';

type CapitalTimelineGuidanceStepProps = {
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

function buildTimelineSummary(analysis: TimelineAnalysisDTO) {
  const items = analysis.items ?? [];
  const highPriorityCount = items.filter((item) => item.priority === 'HIGH').length;
  const topItem = [...items].sort((a, b) => {
    if (a.priority !== b.priority) {
      const rank = (value: string) => (value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1);
      return rank(b.priority) - rank(a.priority);
    }
    return (b.estimatedCostMaxCents ?? 0) - (a.estimatedCostMaxCents ?? 0);
  })[0] ?? null;

  return {
    itemCount: items.length,
    highPriorityCount,
    topItem,
  };
}

export function CapitalTimelineGuidanceStep({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  onComplete,
}: CapitalTimelineGuidanceStepProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const query = useQuery({
    queryKey: ['guidance', 'capital-timeline-step', propertyId, journeyId],
    queryFn: () => getLatestTimeline(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  const analysis = query.data?.analysis ?? null;
  const summary = analysis ? buildTimelineSummary(analysis) : null;

  async function handleRun() {
    setRunning(true);
    try {
      await runTimeline(propertyId, 10, {
        assumptionSetId: query.data?.assumptionSetId ?? null,
      });
      await query.refetch();
    } finally {
      setRunning(false);
    }
  }

  async function handleComplete() {
    if (!analysis || !summary) return;
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        proofType: 'capital_timeline_summary_reviewed',
        proofId: `${journeyId}:${stepKey}:${analysis.id}`,
        journeyId,
        stepKey,
        sourceToolKey: 'capital-timeline',
        analysisId: analysis.id,
        horizonYears: analysis.horizonYears,
        itemCount: summary.itemCount,
        highPriorityCount: summary.highPriorityCount,
        topItemId: summary.topItem?.id ?? null,
        topItemLabel: summary.topItem?.inventoryItem?.name ?? null,
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
        Loading capital timeline summary…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-3">
            <p className="mb-0">We couldn’t load the capital timeline for this step.</p>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => query.refetch()}
            >
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
          Review where this work fits on the capital timeline
        </p>
        <p className="mb-0 text-sm text-slate-600">
          Guidance uses the same timeline analysis here so you can place this work in the broader
          home plan without leaving the journey.
        </p>
      </div>

      {!analysis || !summary ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm text-slate-600">
            No recent capital timeline analysis is available yet for this property.
          </p>
          <Button type="button" className="rounded-xl" disabled={running} onClick={handleRun}>
            <Calendar className="mr-2 h-4 w-4" />
            {running ? 'Generating…' : 'Generate timeline summary'}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Timeline items</p>
              <p className="mb-0 text-lg font-semibold text-slate-900">{summary.itemCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">High priority</p>
              <p className="mb-0 text-lg font-semibold text-slate-900">{summary.highPriorityCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Horizon</p>
              <p className="mb-0 text-lg font-semibold text-slate-900">{analysis.horizonYears} years</p>
            </div>
          </div>

          {summary.topItem ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-sm font-medium text-slate-900">Top suggested item</p>
              <p className="mb-0 text-sm text-slate-700">
                {summary.topItem.inventoryItem?.name ?? 'Capital item'} ·{' '}
                {formatMoney(summary.topItem.estimatedCostMinCents)} to{' '}
                {formatMoney(summary.topItem.estimatedCostMaxCents)}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" className="rounded-xl" disabled={completing} onClick={handleComplete}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {completing ? 'Saving…' : 'Use this timeline & continue'}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" disabled={running} onClick={handleRun}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {running ? 'Refreshing…' : 'Refresh timeline'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default CapitalTimelineGuidanceStep;
