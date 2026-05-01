'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getGuidanceJourneyDetail,
  getGuidanceNextStep,
  type GuidanceJourneyDTO,
  type GuidanceNextStepResult,
  type GuidanceStepDTO,
} from '@/lib/api/guidanceApi';
import {
  buildJourneyTitle,
  formatIssueTypeLabel,
  formatReadinessLabel,
  formatStepStatusLabel,
  resolveGuidanceStepHref,
} from '@/features/guidance/utils/guidanceDisplay';
import { GuidedJourneyTemplate } from '@/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/components/GuidedJourneyTemplate';
import { VerifyHistoryStep } from '@/components/guidance/VerifyHistoryStep';
import { RepairReplaceGate } from '@/components/guidance/RepairReplaceGate';
import { CoverageCheckInline } from '@/components/guidance/CoverageCheckInline';
import { PriceCheckInline } from '@/components/guidance/PriceCheckInline';
import { RecallCheckInline } from '@/components/guidance/RecallCheckInline';
import { NegotiationShieldInline } from '@/components/guidance/NegotiationShieldInline';
import { ReplacementJourneyInline } from '@/components/guidance/ReplacementJourneyInline';

function shellBackHref(propertyId: string, journey: GuidanceJourneyDTO): string {
  const params = new URLSearchParams({ journeyId: journey.id });
  if (journey.inventoryItemId) {
    params.set('itemId', journey.inventoryItemId);
    params.set('inventoryItemId', journey.inventoryItemId);
  }
  if (journey.homeAssetId) params.set('homeAssetId', journey.homeAssetId);
  const assetName = journey.inventoryItem?.name?.trim() || journey.homeAsset?.assetType || '';
  if (assetName) params.set('assetName', assetName);
  if (journey.issueType) params.set('issueType', journey.issueType);
  return `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;
}

function GuidanceStepList({
  journey,
  activeStepKey,
}: {
  journey: GuidanceJourneyDTO;
  activeStepKey: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-900">Journey progress</p>
      <div className="space-y-2">
        {journey.steps.map((step) => {
          const isActive = step.stepKey === activeStepKey;
          return (
            <div
              key={step.id}
              className={`rounded-xl border px-3 py-2 ${
                isActive
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="mb-0 text-sm font-medium text-slate-900">
                  {step.stepOrder}. {step.label}
                </p>
                <span className="text-xs text-slate-600">{formatStepStatusLabel(step.status)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JourneyContextCard({
  journey,
}: {
  journey: GuidanceJourneyDTO;
}) {
  const assetName = journey.inventoryItem?.name?.trim() || journey.homeAsset?.assetType || 'This item';
  const issueLabel = formatIssueTypeLabel(journey.issueType);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-900">Guidance context</p>
      <div className="space-y-1 text-sm text-slate-700">
        <p className="mb-0 font-medium text-slate-900">{assetName}</p>
        {issueLabel ? <p className="mb-0">{issueLabel}</p> : null}
        <p className="mb-0">Readiness: {formatReadinessLabel(journey.executionReadiness)}</p>
        <p className="mb-0">
          Progress: {journey.progress.completedCount}/{journey.progress.totalCount} complete
        </p>
      </div>
    </div>
  );
}

function UnsupportedGuidanceStep({
  propertyId,
  journey,
  step,
  next,
}: {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  step: GuidanceStepDTO;
  next: GuidanceNextStepResult | null;
}) {
  const standaloneHref =
    resolveGuidanceStepHref({
      propertyId,
      journey,
      step,
      next,
      mode: 'standalone',
    }) ?? shellBackHref(propertyId, journey);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
        <div className="space-y-2">
          <p className="mb-0 text-base font-semibold text-slate-900">{step.label}</p>
          <p className="mb-0 text-sm text-slate-600">
            This guidance step now has a focused shell, but its dedicated simplified task flow is
            still being finished. You can continue in the existing workspace without losing journey
            context.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild className="rounded-xl">
          <Link href={standaloneHref}>
            Open workspace
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href={shellBackHref(propertyId, journey)}>Back to journey</Link>
        </Button>
      </div>
    </div>
  );
}

export default function GuidanceStepPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const propertyId = params.id;
  const journeyId =
    searchParams.get('guidanceJourneyId') ??
    searchParams.get('journeyId') ??
    '';
  const requestedStepKey = searchParams.get('guidanceStepKey');

  const journeyQuery = useQuery({
    queryKey: ['guidance', 'journey', propertyId, journeyId, 'detail'],
    queryFn: () => getGuidanceJourneyDetail(propertyId, journeyId),
    enabled: Boolean(propertyId && journeyId),
    staleTime: 30_000,
  });

  const nextQuery = useQuery({
    queryKey: ['guidance', 'journey', propertyId, journeyId, 'next'],
    queryFn: () => getGuidanceNextStep(propertyId, journeyId),
    enabled: Boolean(propertyId && journeyId),
    staleTime: 10_000,
  });

  const journey = journeyQuery.data?.journey ?? null;
  const targetStep = useMemo(() => {
    if (!journey) return null;
    if (requestedStepKey) {
      const requested = journey.steps.find((step) => step.stepKey === requestedStepKey);
      if (requested) return requested;
    }
    if (journey.currentStepKey) {
      const current = journey.steps.find((step) => step.stepKey === journey.currentStepKey);
      if (current) return current;
    }
    return journey.steps[0] ?? null;
  }, [journey, requestedStepKey]);

  const nextStep = nextQuery.data?.nextStep ?? null;
  const continueHref =
    journey && nextStep
      ? resolveGuidanceStepHref({
          propertyId,
          journey,
          step: nextStep,
          next: nextQuery.data ?? null,
        })
      : null;

  const refreshGuidance = () => {
    queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
    journeyQuery.refetch();
    nextQuery.refetch();
  };

  const renderFocusedStep = () => {
    if (!journey || !targetStep) return null;

    const assetName = journey.inventoryItem?.name?.trim() || 'this item';
    const inventoryItemId = journey.inventoryItemId ?? null;
    const issueType = journey.issueType ?? null;

    if (targetStep.toolKey === 'history-verify') {
      return (
        <VerifyHistoryStep
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          inventoryItemId={inventoryItemId}
          assetCategory={journey.inventoryItem?.category ?? null}
          assetName={assetName}
          onComplete={refreshGuidance}
        />
      );
    }

    if (targetStep.toolKey === 'replace-repair' && inventoryItemId) {
      return (
        <RepairReplaceGate
          propertyId={propertyId}
          inventoryItemId={inventoryItemId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          assetName={assetName}
          onComplete={() => refreshGuidance()}
        />
      );
    }

    if (targetStep.toolKey === 'coverage-intelligence') {
      return (
        <CoverageCheckInline
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          inventoryItemId={inventoryItemId}
          assetName={assetName}
          onComplete={refreshGuidance}
        />
      );
    }

    if (targetStep.toolKey === 'service-price-radar') {
      return (
        <PriceCheckInline
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          inventoryItemId={inventoryItemId}
          inventoryItemCategory={journey.inventoryItem?.category ?? null}
          assetName={assetName}
          issueType={issueType}
          onComplete={refreshGuidance}
        />
      );
    }

    if (
      targetStep.toolKey === 'replacement-model-comparison' ||
      targetStep.toolKey === 'replacement-purchase-options' ||
      targetStep.toolKey === 'replacement-purchase-finalization' ||
      targetStep.toolKey === 'replacement-planning' ||
      targetStep.toolKey === 'replacement-plan-followup'
    ) {
      return (
        <ReplacementJourneyInline
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          toolKey={targetStep.toolKey}
          assetName={assetName}
          issueType={issueType}
          producedData={targetStep.producedData}
          onComplete={refreshGuidance}
        />
      );
    }

    if (targetStep.toolKey === 'recalls') {
      return (
        <RecallCheckInline
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          inventoryItemId={inventoryItemId}
          assetName={assetName}
          onComplete={refreshGuidance}
        />
      );
    }

    if (targetStep.toolKey === 'negotiation-shield') {
      return (
        <NegotiationShieldInline
          propertyId={propertyId}
          journeyId={journey.id}
          stepId={targetStep.id}
          stepKey={targetStep.stepKey}
          inventoryItemId={inventoryItemId}
          assetName={assetName}
          issueType={issueType}
          onComplete={refreshGuidance}
        />
      );
    }

    return (
      <UnsupportedGuidanceStep
        propertyId={propertyId}
        journey={journey}
        step={targetStep}
        next={nextQuery.data ?? null}
      />
    );
  };

  if (!journeyId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Guidance journey context is missing for this step.
        </div>
      </div>
    );
  }

  if (journeyQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          Loading guided step…
        </div>
      </div>
    );
  }

  if (journeyQuery.isError || !journey || !targetStep) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          We couldn’t load this guided step. Try reopening it from your guidance journey.
        </div>
      </div>
    );
  }

  const title = `${targetStep.stepOrder}. ${targetStep.label}`;
  const subtitle =
    targetStep.description ??
    `Complete this step for ${journey.inventoryItem?.name?.trim() || buildJourneyTitle(journey)}.`;

  const trustPanel = (
    <>
      <JourneyContextCard journey={journey} />
      <GuidanceStepList journey={journey} activeStepKey={targetStep.stepKey} />
    </>
  );

  const isCurrentStepCompleted =
    journey.steps.find((step) => step.stepKey === targetStep.stepKey)?.status === 'COMPLETED';
  const showContinue = Boolean(isCurrentStepCompleted && nextStep && continueHref);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <Button asChild variant="ghost" className="pl-0 text-slate-600 hover:text-slate-900">
          <Link href={shellBackHref(propertyId, journey)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to journey
          </Link>
        </Button>
      </div>

      <GuidedJourneyTemplate
        phase="B"
        title={title}
        subtitle={subtitle}
        progressLabel="Progress"
        progressValue={`${journey.progress.completedCount}/${journey.progress.totalCount}`}
        trustPanel={trustPanel}
        stickyAction={
          showContinue ? (
            <Button asChild className="w-full rounded-xl">
              <Link href={continueHref!}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Continue to {nextStep?.label}
              </Link>
            </Button>
          ) : undefined
        }
        stickyHelpText={
          showContinue
            ? 'Your current step is complete. Continue when you are ready.'
            : undefined
        }
        main={
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-semibold tracking-normal text-slate-500">
                Guided task
              </p>
              <p className="mb-0 text-sm text-slate-600">
                Stay focused on this one decision. You can still open the full workspace later if
                you need more detail.
              </p>
            </div>

            {renderFocusedStep()}

            {showContinue ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
                <p className="mb-3">
                  This step is complete. Continue to {nextStep?.label} when you’re ready.
                </p>
                <Button asChild className="w-full rounded-xl sm:w-auto">
                  <Link href={continueHref!}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Continue to {nextStep?.label}
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
