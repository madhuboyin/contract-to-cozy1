'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import {
  getOwnershipCosts,
  type OwnershipCostReadModel,
} from '@/app/(dashboard)/dashboard/properties/[id]/ownership-costs/ownershipCostsApi';

type OwnershipCostsGuidanceStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId?: string | null;
  onComplete: () => void;
};

function formatMoneyFromCents(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function buildSummary(data: OwnershipCostReadModel) {
  const topDriver = data.categories
    .filter((category) =>
      category.includedInSelectedLens && category.amountCents != null)
    .sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0))[0] ?? null;
  return {
    annualCents: data.snapshot.annualTotalCents,
    topDriver,
  };
}

export function OwnershipCostsGuidanceStep({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId = null,
  onComplete,
}: OwnershipCostsGuidanceStepProps) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = React.useState(false);
  const query = useQuery({
    queryKey: [
      'guidance',
      'ownership-costs-step',
      propertyId,
      journeyId,
      inventoryItemId ?? 'none',
    ],
    queryFn: () => getOwnershipCosts(propertyId, 'OPERATING_EXPENSE'),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });
  const summary = query.data ? buildSummary(query.data) : null;

  async function handleComplete() {
    if (!query.data) return;
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        proofType: 'ownership_cost_snapshot_reviewed',
        proofId: `${journeyId}:${stepKey}:${query.data.snapshot.id}`,
        journeyId,
        stepKey,
        sourceToolKey: 'ownership-costs',
        snapshotId: query.data.snapshot.id,
        definitionVersion: query.data.definitionVersion,
        methodVersion: query.data.methodVersion,
        categoryDefinitionVersion: query.data.categoryDefinitionVersion,
        lens: query.data.selectedLens,
        annualTotalCents: query.data.snapshot.annualTotalCents,
        calculatedAt: query.data.snapshot.calculatedAt,
      });
      queryClient.invalidateQueries({
        queryKey: ['guidance', 'property', propertyId],
      });
      queryClient.invalidateQueries({
        queryKey: ['guidance', 'journey', propertyId],
      });
      onComplete();
    } finally {
      setCompleting(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Loading the ownership-cost snapshot…
      </div>
    );
  }

  if (query.isError || !query.data || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-3">
            <p className="mb-0">We couldn’t load the ownership-cost snapshot for this step.</p>
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
          Review the current operating-expense snapshot
        </p>
        <p className="mb-0 text-sm text-slate-600">
          Guidance uses the same versioned snapshot as Ownership Costs. Missing
          categories remain missing and are never treated as zero.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Annual operating expense</p>
          <p className="mb-0 text-lg font-semibold text-slate-900">
            {formatMoneyFromCents(summary.annualCents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Largest included category</p>
          <p className="mb-0 text-sm font-semibold text-slate-900">
            {summary.topDriver?.label ?? 'Not available'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Evidence coverage</p>
          <p className="mb-0 text-sm font-semibold text-slate-900">
            {query.data.snapshot.coverageStatus.toLowerCase().replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      <p className="mb-0 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Snapshot {query.data.snapshot.id} · Method {query.data.methodVersion} ·
        Lens {query.data.selectedLens.toLowerCase().replace(/_/g, ' ')}
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="rounded-xl"
          disabled={completing}
          onClick={handleComplete}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {completing ? 'Saving…' : 'Use this snapshot & continue'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => query.refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh snapshot
        </Button>
      </div>
    </div>
  );
}

export default OwnershipCostsGuidanceStep;
