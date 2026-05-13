'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  getTrueCostOwnership,
  type TrueCostOwnershipDTO,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/trueCostApi';

type TrueCostGuidanceStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId?: string | null;
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

function buildSummary(data: TrueCostOwnershipDTO) {
  const total = data.rollup?.totalCost ?? 0;
  const breakdown = data.rollup?.breakdown ?? null;
  const topDriver = breakdown
    ? Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]
    : null;
  const topDriverLabel = topDriver
    ? topDriver[0].replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : null;

  return {
    total,
    topDriverLabel,
    topDriverAmount: topDriver?.[1] ?? null,
  };
}

export function TrueCostGuidanceStep({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId = null,
  onComplete,
}: TrueCostGuidanceStepProps) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = React.useState(false);
  const query = useQuery({
    queryKey: ['guidance', 'true-cost-step', propertyId, journeyId, inventoryItemId ?? 'none'],
    queryFn: () => getTrueCostOwnership(propertyId, 5),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  const summary = query.data ? buildSummary(query.data) : null;

  async function handleComplete() {
    if (!query.data) return;
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        proofType: 'true_cost_summary_reviewed',
        proofId: `${journeyId}:${stepKey}:${query.data.meta.generatedAt}`,
        journeyId,
        stepKey,
        sourceToolKey: 'true-cost',
        years: query.data.input.years,
        totalCost: query.data.rollup.totalCost,
        breakdown: query.data.rollup.breakdown,
        generatedAt: query.data.meta.generatedAt,
        dataSources: query.data.meta.dataSources,
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
        Loading true cost summary…
      </div>
    );
  }

  if (query.isError || !query.data || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-3">
            <p className="mb-0">We couldn’t load the true cost summary for this step.</p>
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
          Review the cost summary for this decision
        </p>
        <p className="mb-0 text-sm text-slate-600">
          Guidance now uses the same underlying true-cost analysis directly here so you can keep
          moving without leaving the journey.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">5-year total</p>
          <p className="mb-0 text-lg font-semibold text-slate-900">
            {formatMoney(summary.total)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Largest driver</p>
          <p className="mb-0 text-sm font-semibold text-slate-900">
            {summary.topDriverLabel ?? 'Not available'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Driver amount</p>
          <p className="mb-0 text-sm font-semibold text-slate-900">
            {formatMoney(summary.topDriverAmount)}
          </p>
        </div>
      </div>

      {query.data.drivers.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-900">What is driving the estimate</p>
          <ul className="space-y-2 text-sm text-slate-600">
            {query.data.drivers.slice(0, 3).map((driver) => (
              <li key={driver.factor}>
                <span className="font-medium text-slate-900">{driver.factor}:</span>{' '}
                {driver.explanation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="rounded-xl" disabled={completing} onClick={handleComplete}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {completing ? 'Saving…' : 'Use this summary & continue'}
        </Button>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => query.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh summary
        </Button>
      </div>
    </div>
  );
}

export default TrueCostGuidanceStep;
