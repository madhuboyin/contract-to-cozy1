'use client';

// FRD-FR-07: High-value asset decision gate — inline repair vs replace verdict
// Rendered by renderStepCta when step.toolKey === 'replace-repair'.
// Shows a compact summary of an existing or freshly-run ReplaceRepairAnalysis.

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, RefreshCw, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getReplaceRepairAnalysis,
  runReplaceRepairAnalysis,
  ReplaceRepairAnalysisDTO,
} from '@/lib/api/replaceRepairApi';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { formatCurrency } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Verdict config
// ---------------------------------------------------------------------------

const VERDICT_CONFIG: Record<
  ReplaceRepairAnalysisDTO['verdict'],
  { label: string; tone: string; icon: React.ReactNode }
> = {
  REPLACE_NOW: {
    label: 'Replace now',
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
  },
  REPLACE_SOON: {
    label: 'Plan to replace soon',
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <TrendingDown className="h-4 w-4 text-amber-600" />,
  },
  REPAIR_AND_MONITOR: {
    label: 'Repair and monitor',
    tone: 'text-sky-700 bg-sky-50 border-sky-200',
    icon: <RefreshCw className="h-4 w-4 text-sky-600" />,
  },
  REPAIR_ONLY: {
    label: 'Repair only',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RepairReplaceGateProps = {
  propertyId: string;
  inventoryItemId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  assetName?: string;
  onComplete: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RepairReplaceGate({
  propertyId,
  inventoryItemId,
  journeyId,
  stepId: _stepId,
  stepKey,
  assetName = 'this item',
  onComplete,
}: RepairReplaceGateProps) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = React.useState(false);
  const [completeDone, setCompleteDone] = React.useState(false);

  // Fetch existing analysis
  const analysisQuery = useQuery({
    queryKey: ['replace-repair', propertyId, inventoryItemId],
    queryFn: () => getReplaceRepairAnalysis(propertyId, inventoryItemId),
    staleTime: 5 * 60_000,
  });

  const existingAnalysis: ReplaceRepairAnalysisDTO | null =
    analysisQuery.data?.exists ? analysisQuery.data.analysis : null;

  // Run analysis mutation
  const runMutation = useMutation({
    mutationFn: () =>
      runReplaceRepairAnalysis(propertyId, inventoryItemId, undefined, {
        guidanceJourneyId: journeyId,
        guidanceStepKey: stepKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replace-repair', propertyId, inventoryItemId] });
    },
  });

  // Proceed: record step completion
  async function handleProceed(analysis: ReplaceRepairAnalysisDTO) {
    setCompleting(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        journeyId,
        stepKey,
        sourceToolKey: 'replace-repair',
        status: 'COMPLETED',
        producedData: {
          verdict: analysis.verdict,
          confidence: analysis.confidence,
          remainingYears: analysis.remainingYears ?? null,
          breakEvenMonths: analysis.breakEvenMonths ?? null,
          analysisId: analysis.id,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setCompleteDone(true);
      onComplete();
    } catch (err) {
      console.error('[RepairReplaceGate] proceed failed', err);
    } finally {
      setCompleting(false);
    }
  }

  if (completeDone) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Decision recorded. Moving to next step.
      </div>
    );
  }

  const displayAnalysis = runMutation.data ?? existingAnalysis;

  // Loading state
  if (analysisQuery.isLoading) {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Checking repair vs replace analysis…
      </div>
    );
  }

  // Show result if available
  if (displayAnalysis) {
    const verdictCfg = VERDICT_CONFIG[displayAnalysis.verdict];
    const repairCost = displayAnalysis.estimatedNextRepairCostCents
      ? displayAnalysis.estimatedNextRepairCostCents / 100
      : null;
    const replaceCost = displayAnalysis.estimatedReplacementCostCents
      ? displayAnalysis.estimatedReplacementCostCents / 100
      : null;

    return (
      <div className="space-y-3">
        {/* Verdict badge */}
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${verdictCfg.tone}`}>
          {verdictCfg.icon}
          <div className="flex-1">
            <p className="text-sm font-semibold">{verdictCfg.label}</p>
            {displayAnalysis.summary && (
              <p className="mt-0.5 text-xs opacity-90">{displayAnalysis.summary}</p>
            )}
          </div>
        </div>

        {/* Key metrics */}
        {(repairCost || replaceCost || displayAnalysis.remainingYears != null) && (
          <div className="grid grid-cols-3 gap-2">
            {repairCost != null && (
              <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
                <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Est. repair</p>
                <p className="text-sm font-semibold">{formatCurrency(repairCost)}</p>
              </div>
            )}
            {replaceCost != null && (
              <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
                <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Est. replace</p>
                <p className="text-sm font-semibold">{formatCurrency(replaceCost)}</p>
              </div>
            )}
            {displayAnalysis.remainingYears != null && (
              <div className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white p-2 text-center">
                <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Remaining life</p>
                <p className="text-sm font-semibold">{displayAnalysis.remainingYears}yr</p>
              </div>
            )}
          </div>
        )}

        {/* Top next step from analysis */}
        {displayAnalysis.nextSteps?.[0] && (
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
            <span className="font-medium">Suggested: </span>
            {displayAnalysis.nextSteps[0].title}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            className="min-h-[44px] w-full"
            disabled={completing}
            onClick={() => handleProceed(displayAnalysis)}
          >
            {completing ? 'Saving…' : 'Confirm decision & continue'}
          </Button>
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/items/${inventoryItemId}/replace-repair?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}`}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
          >
            See full analysis
          </Link>
        </div>
      </div>
    );
  }

  // No analysis yet — offer to run it
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
        <p className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
          Should you repair or replace {assetName}?
        </p>
        <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
          Run a quick analysis to get a data-driven decision before spending money on repairs.
        </p>
      </div>

      {runMutation.isError && (
        <p className="text-xs text-rose-700">Analysis failed. Please try again.</p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          className="min-h-[44px] w-full"
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate()}
        >
          {runMutation.isPending ? 'Running analysis…' : 'Run repair vs replace analysis'}
        </Button>
        <Link
          href={`/dashboard/properties/${propertyId}/inventory/items/${inventoryItemId}/replace-repair?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}`}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full analysis page
        </Link>
      </div>
    </div>
  );
}
