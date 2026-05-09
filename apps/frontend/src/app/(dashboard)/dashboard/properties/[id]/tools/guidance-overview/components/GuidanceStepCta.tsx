'use client';

import React from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { type GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { resolveGuidanceStepHref } from '@/features/guidance/utils/guidanceDisplay';
import { type GuidanceStepDTO, type GuidanceJourneyDTO, type ReplacementPriorities } from '@/lib/api/guidanceApi';
import { VerifyHistoryStep } from '@/components/guidance/VerifyHistoryStep';
import { RepairReplaceGate } from '@/components/guidance/RepairReplaceGate';
import { CoverageCheckInline } from '@/components/guidance/CoverageCheckInline';
import { PriceCheckInline } from '@/components/guidance/PriceCheckInline';
import { PriceFinalizationInline } from '@/components/guidance/PriceFinalizationInline';
import { RecallCheckInline } from '@/components/guidance/RecallCheckInline';
import { ReplacementJourneyInline } from '@/components/guidance/ReplacementJourneyInline';
import { ReplacementPrioritiesCapture } from '@/components/guidance/ReplacementPrioritiesCapture';
import { NegotiationShieldInline } from '@/components/guidance/NegotiationShieldInline';
import TrustStrip from '../../../components/route-templates/TrustStrip';
import { guidanceEngineTrust } from '@/lib/trust/trustPresets';

export type GuidanceStepCtaProps = {
  step: GuidanceStepDTO;
  isActive: boolean;

  // Journey context
  propertyId: string;
  activePrimaryAction: GuidanceActionModel | null;
  activeJourneySteps: GuidanceStepDTO[];
  /** Resolved journey with inventoryItemId/homeAssetId patched in from URL params */
  journeyForSelectedStepHref: (GuidanceJourneyDTO & { inventoryItemId: string | null; homeAssetId: string | null }) | null;

  // URL param state used to fill in gaps in the journey row
  selectedInventoryItemId: string | null;
  selectedHomeAssetId: string | null;
  selectedIssueType: string | null;
  selectedAssetOption: { assetName: string; category: string } | null;

  // Navigation
  router: { replace: (url: string, options?: { scroll?: boolean }) => void };
  pathname: string;
  searchParams: URLSearchParams;

  // Called after an inline step completes — parent advances the step selector
  onStepComplete?: (nextStepKey: string | null) => void;
};

export function GuidanceStepCta({
  step,
  isActive,
  propertyId,
  activePrimaryAction,
  activeJourneySteps,
  journeyForSelectedStepHref,
  selectedInventoryItemId,
  selectedHomeAssetId,
  selectedIssueType,
  selectedAssetOption,
  router,
  pathname,
  searchParams,
  onStepComplete,
}: GuidanceStepCtaProps) {
  const queryClient = useQueryClient();

  if (!isActive) return null;

  const resolvedJourney = journeyForSelectedStepHref;

  const nextStep = activeJourneySteps.find((s) => s.stepOrder === step.stepOrder + 1) ?? null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
  }

  function handleInlineComplete() {
    invalidate();
    onStepComplete?.(nextStep?.stepKey ?? null);
  }

  // FRD-FR-03/04: Inline verify_history step — render the VerifyHistoryStep form
  // instead of navigating to a separate page (history-verify has no routePath).
  if (step.toolKey === 'history-verify' && activePrimaryAction) {
    const journeyInventoryItemId =
      resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const assetCategory =
      resolvedJourney?.inventoryItem?.category ?? selectedAssetOption?.category ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';
    return (
      <VerifyHistoryStep
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={journeyInventoryItemId}
        assetCategory={assetCategory}
        assetName={displayAssetName}
        presentation="guided"
        onComplete={handleInlineComplete}
      />
    );
  }

  // FRD-FR-07: Inline repair vs replace gate for high-value asset decisions.
  // Only renders inline when inventoryItemId is available; otherwise falls through
  // to the standard navigation link for the replace-repair page.
  if (step.toolKey === 'replace-repair' && activePrimaryAction) {
    const gateItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    if (gateItemId) {
      const displayAssetName =
        resolvedJourney?.inventoryItem?.name?.trim() ||
        selectedAssetOption?.assetName ||
        'this item';
      return (
        <RepairReplaceGate
          propertyId={propertyId}
          inventoryItemId={gateItemId}
          journeyId={activePrimaryAction.journeyId}
          stepId={step.id}
          stepKey={step.stepKey}
          assetName={displayAssetName}
          presentation="guided"
          onComplete={(result) => {
            invalidate();
            if (result?.activeJourneyId) {
              const nextParams = new URLSearchParams(searchParams.toString());
              nextParams.set('journeyId', result.activeJourneyId);
              nextParams.delete('stepKey');
              nextParams.delete('guidanceStepKey');
              router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
            } else {
              onStepComplete?.(nextStep?.stepKey ?? null);
            }
          }}
        />
      );
    }
  }

  // Inline coverage check for check_coverage step — no page navigation.
  if (step.toolKey === 'coverage-intelligence' && activePrimaryAction) {
    const coverageItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';
    return (
      <CoverageCheckInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={coverageItemId}
        assetName={displayAssetName}
        presentation="guided"
        journeyTypeKey={activePrimaryAction.journey.journeyTypeKey}
        onComplete={handleInlineComplete}
      />
    );
  }

  // Inline price check for validate_price / estimate_improvement_cost steps.
  if (step.toolKey === 'service-price-radar' && activePrimaryAction) {
    const priceItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const priceItemCategory =
      resolvedJourney?.inventoryItem?.category ?? selectedAssetOption?.category ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';
    return (
      <PriceCheckInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={priceItemId}
        inventoryItemCategory={priceItemCategory}
        assetName={displayAssetName}
        issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
        presentation="guided"
        onComplete={handleInlineComplete}
      />
    );
  }

  if (step.toolKey === 'replacement-priorities-capture' && activePrimaryAction) {
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';
    return (
      <ReplacementPrioritiesCapture
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        toolKey={step.toolKey}
        assetName={displayAssetName}
        onComplete={handleInlineComplete}
      />
    );
  }

  if (
    (
      step.toolKey === 'replacement-model-comparison' ||
      step.toolKey === 'replacement-purchase-options' ||
      step.toolKey === 'replacement-purchase-finalization' ||
      step.toolKey === 'replacement-planning' ||
      step.toolKey === 'replacement-plan-followup'
    ) &&
    activePrimaryAction
  ) {
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';

    // Extract priorities from the completed set_replacement_priorities step
    const prioritiesStep = activeJourneySteps.find((s) => s.stepKey === 'set_replacement_priorities');
    const savedPriorities = prioritiesStep?.producedData as ReplacementPriorities | null | undefined;
    const priorities: ReplacementPriorities | undefined =
      savedPriorities && !savedPriorities.skipped ? savedPriorities : undefined;

    // Extract selected model name from the completed compare_replacement_models step
    const modelStep = activeJourneySteps.find((s) => s.stepKey === 'compare_replacement_models');
    const selectedModelNameForVendors =
      typeof modelStep?.producedData?.selectedModelName === 'string'
        ? modelStep.producedData.selectedModelName
        : undefined;

    return (
      <ReplacementJourneyInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        toolKey={step.toolKey}
        assetName={displayAssetName}
        issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
        producedData={step.producedData}
        priorities={priorities}
        selectedModelName={selectedModelNameForVendors}
        onComplete={handleInlineComplete}
      />
    );
  }

  // Inline recall check for safety_alert, check_recall_coverage,
  // review_remedy_instructions, recall_resolution steps.
  if (step.toolKey === 'recalls' && activePrimaryAction) {
    const recallItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this item';
    return (
      <RecallCheckInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={recallItemId}
        assetName={displayAssetName}
        presentation="guided"
        onComplete={handleInlineComplete}
      />
    );
  }

  // FRD-FR-09: Inline NegotiationShield for prepare_negotiation step.
  if (step.toolKey === 'negotiation-shield' && activePrimaryAction) {
    const nsItemId = resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this service';
    return (
      <NegotiationShieldInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={nsItemId}
        assetName={displayAssetName}
        issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
        presentation="guided"
        onComplete={handleInlineComplete}
      />
    );
  }

  if (step.toolKey === 'price-finalization' && activePrimaryAction) {
    const priceFinalizationItemId =
      resolvedJourney?.inventoryItemId ?? selectedInventoryItemId ?? null;
    const priceFinalizationItemCategory =
      resolvedJourney?.inventoryItem?.category ?? selectedAssetOption?.category ?? null;
    const displayAssetName =
      resolvedJourney?.inventoryItem?.name?.trim() ||
      selectedAssetOption?.assetName ||
      'this service';
    return (
      <PriceFinalizationInline
        propertyId={propertyId}
        journeyId={activePrimaryAction.journeyId}
        stepId={step.id}
        stepKey={step.stepKey}
        inventoryItemId={priceFinalizationItemId}
        inventoryItemCategory={priceFinalizationItemCategory}
        homeAssetId={resolvedJourney?.homeAssetId ?? selectedHomeAssetId ?? null}
        guidanceSignalIntentFamily={resolvedJourney?.primarySignal?.signalIntentFamily ?? null}
        assetName={displayAssetName}
        issueType={resolvedJourney?.issueType ?? selectedIssueType ?? null}
        onComplete={handleInlineComplete}
      />
    );
  }

  // Patch: if the journey lacks inventoryItemId/homeAssetId but the user explicitly
  // selected one via URL params, inject it so resolveGuidanceStepHref can substitute
  // :itemId in the route template. This handles journeys originally linked via
  // homeAsset signals where inventoryItemId was not stored on the journey row.
  const href = resolvedJourney
    ? resolveGuidanceStepHref({ propertyId, journey: resolvedJourney, step })
    : null;

  if (!href) {
    return (
      <div className="space-y-2">
        <TrustStrip
          variant="footnote"
          {...guidanceEngineTrust()}
        />
        <p className="text-xs text-slate-500">
          This step requires additional property context to generate a link. Check that your property details and linked assets are up to date, then refresh.
        </p>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[hsl(var(--mobile-brand-strong))]/90"
    >
      Continue: {step.label}
    </Link>
  );
}
