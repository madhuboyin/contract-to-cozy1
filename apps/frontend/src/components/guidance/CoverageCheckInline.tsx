'use client';

// Inline coverage check for the check_coverage guidance step.
// When inventoryItemId is present uses item-level analysis (ItemCoverageAnalysisDTO).
// Falls back to property-level analysis (CoverageAnalysisDTO) for non-item journeys.
// Rendered by renderStepCta when step.toolKey === 'coverage-intelligence'.

import React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getCoverageAnalysis,
  getItemCoverageAnalysis,
  runCoverageAnalysis,
  runItemCoverageAnalysis,
  type CoverageAnalysisDTO,
  type CoverageVerdict,
  type ItemCoverageAnalysisDTO,
} from '@/lib/api/coverageAnalysisApi';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';

// ---------------------------------------------------------------------------
// Verdict display config
// ---------------------------------------------------------------------------

const VERDICT_CONFIG: Record<
  CoverageVerdict,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  WORTH_IT: {
    label: 'Coverage looks solid',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
  },
  SITUATIONAL: {
    label: 'Coverage needs review',
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  NOT_WORTH_IT: {
    label: 'Coverage gap identified',
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    icon: <ShieldAlert className="h-4 w-4 text-rose-600" />,
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CoverageCheckInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId: string | null;
  assetName?: string;
  onComplete: () => void;
};

// Normalised shape we render from — covers both analysis types
type NormalisedResult = {
  overallVerdict: CoverageVerdict;
  summary: string | null;
  nextStepTitle: string | null;
};

function normaliseItem(a: ItemCoverageAnalysisDTO): NormalisedResult {
  return {
    overallVerdict: a.overallVerdict,
    summary: a.summary ?? null,
    nextStepTitle: a.nextSteps?.[0]?.title ?? null,
  };
}

function normaliseProperty(a: CoverageAnalysisDTO): NormalisedResult {
  return {
    overallVerdict: a.overallVerdict,
    summary: a.summary ?? null,
    nextStepTitle: a.nextSteps?.[0]?.title ?? null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CoverageCheckInline({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId,
  assetName = 'this item',
  onComplete,
}: CoverageCheckInlineProps) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = React.useState(false);
  const [completeDone, setCompleteDone] = React.useState(false);

  const isItemScoped = Boolean(inventoryItemId);

  // ---- Fetch existing analysis — two separate hooks, one enabled at a time ----
  const itemAnalysisQuery = useQuery({
    queryKey: ['coverage-analysis', 'item', propertyId, inventoryItemId ?? ''],
    queryFn: () => getItemCoverageAnalysis(propertyId, inventoryItemId!),
    enabled: isItemScoped,
    staleTime: 5 * 60_000,
  });

  const propertyAnalysisQuery = useQuery({
    queryKey: ['coverage-analysis', 'property', propertyId],
    queryFn: () => getCoverageAnalysis(propertyId),
    enabled: !isItemScoped,
    staleTime: 5 * 60_000,
  });

  const isLoading = isItemScoped ? itemAnalysisQuery.isLoading : propertyAnalysisQuery.isLoading;

  const existingResult: NormalisedResult | null = React.useMemo(() => {
    if (isItemScoped) {
      const d = itemAnalysisQuery.data;
      return d?.exists ? normaliseItem(d.analysis) : null;
    }
    const d = propertyAnalysisQuery.data;
    return d?.exists ? normaliseProperty(d.analysis) : null;
  }, [isItemScoped, itemAnalysisQuery.data, propertyAnalysisQuery.data]);

  // ---- Run analysis mutation — two separate mutations, one called at a time ----
  const runItemMutation = useMutation({
    mutationFn: () =>
      runItemCoverageAnalysis(propertyId, inventoryItemId!, undefined, {
        guidanceJourneyId: journeyId,
        guidanceStepKey: stepKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['coverage-analysis', 'item', propertyId, inventoryItemId ?? ''],
      });
    },
  });

  const runPropertyMutation = useMutation({
    mutationFn: () =>
      runCoverageAnalysis(propertyId, undefined, {
        guidanceJourneyId: journeyId,
        guidanceStepKey: stepKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['coverage-analysis', 'property', propertyId],
      });
    },
  });

  const isPending = isItemScoped ? runItemMutation.isPending : runPropertyMutation.isPending;
  const isError = isItemScoped ? runItemMutation.isError : runPropertyMutation.isError;

  function handleRunAnalysis() {
    if (isItemScoped) {
      runItemMutation.mutate();
    } else {
      runPropertyMutation.mutate();
    }
  }

  const mutationResult: NormalisedResult | null = React.useMemo(() => {
    if (isItemScoped && runItemMutation.data) return normaliseItem(runItemMutation.data);
    if (!isItemScoped && runPropertyMutation.data) return normaliseProperty(runPropertyMutation.data);
    return null;
  }, [isItemScoped, runItemMutation.data, runPropertyMutation.data]);

  const displayResult: NormalisedResult | null = mutationResult ?? existingResult;

  // ---- Complete step ----
  async function handleMarkReviewed() {
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        coverageVerdict: displayResult?.overallVerdict ?? 'SITUATIONAL',
        sourceToolKey: 'coverage-intelligence',
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setCompleteDone(true);
      onComplete();
    } catch (err) {
      console.error('[CoverageCheckInline] complete failed', err);
    } finally {
      setCompleting(false);
    }
  }

  // Build the full-tool link with guidance context pre-attached
  const fullToolHref = isItemScoped
    ? `/dashboard/properties/${propertyId}/tools/coverage-intelligence?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}&itemId=${inventoryItemId}`
    : `/dashboard/properties/${propertyId}/tools/coverage-intelligence?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}`;

  // ---- Completed state ----
  if (completeDone) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Coverage reviewed. Moving to next step.
      </div>
    );
  }

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Checking coverage status…
      </div>
    );
  }

  // ---- Analysis available — show verdict ----
  if (displayResult) {
    const cfg = VERDICT_CONFIG[displayResult.overallVerdict];
    return (
      <div className="space-y-3">
        {/* Verdict badge */}
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${cfg.tone}`}>
          {cfg.icon}
          <div className="flex-1">
            <p className="text-sm font-semibold">{cfg.label}</p>
            {displayResult.summary && (
              <p className="mt-0.5 text-xs opacity-90">{displayResult.summary}</p>
            )}
          </div>
        </div>

        {/* Suggested next action from analysis */}
        {displayResult.nextStepTitle && (
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
            <span className="font-medium">Suggested: </span>
            {displayResult.nextStepTitle}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            className="min-h-[44px] w-full"
            disabled={completing}
            onClick={handleMarkReviewed}
          >
            {completing ? 'Saving…' : 'Mark coverage reviewed'}
          </Button>
          <Link
            href={fullToolHref}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
          >
            Open full coverage tool
          </Link>
        </div>
      </div>
    );
  }

  // ---- No analysis yet — offer to run or skip straight to review ----
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
        <p className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
          {isItemScoped
            ? `Check coverage status for ${assetName}`
            : 'Check property coverage status'}
        </p>
        <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
          Run a quick analysis to see whether insurance and warranty coverage is adequate before
          proceeding.
        </p>
      </div>

      {isError && (
        <p className="text-xs text-rose-700">Analysis failed. Please try again.</p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          className="min-h-[44px] w-full"
          disabled={isPending}
          onClick={handleRunAnalysis}
        >
          {isPending ? 'Running analysis…' : 'Run coverage check'}
        </Button>
        <Link
          href={fullToolHref}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full coverage tool
        </Link>
      </div>
    </div>
  );
}
