'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  MobilePageContainer,
  MobilePageIntro,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { formatIssueDomain } from '@/features/guidance/utils/guidanceDisplay';
import type { InventoryItem } from '@/types';
import { listInventoryItems } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { skipGuidanceStep } from '@/lib/api/guidanceApi';
import { GuidanceJourneyStrip } from '@/components/guidance/GuidanceJourneyStrip';
import { getProviderCategoryForSystemType } from '@/lib/config/serviceCategoryMapping';
import { formatCurrency } from '@/lib/utils/format';
import { formatEnumLabel } from '@/lib/utils/formatters';

const DOMAIN_FOCUS_LABELS: Record<string, string> = {
  ASSET_LIFECYCLE: 'Aging home system',
  MAINTENANCE: 'Home maintenance issue',
  SAFETY: 'Home safety issue',
  INSURANCE: 'Coverage decision',
  FINANCIAL: 'Home expense planning',
  COMPLIANCE: 'Compliance issue',
  WEATHER: 'Weather readiness issue',
  ENERGY: 'Energy cost issue',
  OTHER: 'Home issue',
};

const SIGNAL_SUBTITLE_LABELS: Record<string, string> = {
  cost_of_inaction_risk: 'Delaying this issue could increase your total cost.',
  coverage_gap: 'Coverage may not protect this issue right now.',
  coverage_lapse_detected: 'Coverage may expire soon for this issue.',
  lifecycle_end_or_past_life: 'This asset is near or past expected life.',
  maintenance_failure_risk: 'This issue can worsen if maintenance is delayed.',
  inspection_followup_needed: 'Inspection follow-up is needed before execution.',
  recall_detected: 'A safety recall may require immediate action.',
  high_utility_cost: 'This issue may be increasing your ongoing utility costs.',
};

type AssetScopeOption = {
  key: string;
  assetName: string;
  systemType: string;
  category: string;
  actionCta: string | null;
  riskLevel: 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
  outOfPocketCost: number;
  inventoryItemId: string | null;
  homeAssetId: string | null;
  supportsPreciseScope: boolean;
};

function buildScopedOverviewHref(args: {
  propertyId: string;
  inventoryItemId: string | null;
  homeAssetId: string | null;
  assetName?: string | null;
}): string {
  const params = new URLSearchParams();
  if (args.inventoryItemId) {
    params.set('itemId', args.inventoryItemId);
    params.set('inventoryItemId', args.inventoryItemId);
  }
  if (args.homeAssetId) {
    params.set('homeAssetId', args.homeAssetId);
  }
  if (args.assetName) {
    params.set('assetName', args.assetName);
  }

  const base = `/dashboard/properties/${args.propertyId}/tools/guidance-overview`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function appendScopeParams(
  baseHref: string,
  option: Pick<AssetScopeOption, 'inventoryItemId' | 'homeAssetId' | 'assetName'>
): string {
  const params = new URLSearchParams();
  if (option.inventoryItemId) {
    params.set('itemId', option.inventoryItemId);
    params.set('inventoryItemId', option.inventoryItemId);
  }
  if (option.homeAssetId) {
    params.set('homeAssetId', option.homeAssetId);
  }
  params.set('assetName', option.assetName);
  const query = params.toString();
  return query ? `${baseHref}${baseHref.includes('?') ? '&' : '?'}${query}` : baseHref;
}

function buildProvidersHref(propertyId: string, option: AssetScopeOption): string {
  const params = new URLSearchParams();
  params.set('propertyId', propertyId);
  params.set('category', getProviderCategoryForSystemType(option.systemType));
  params.set('insightFactor', option.systemType || option.assetName);
  if (option.inventoryItemId) params.set('itemId', option.inventoryItemId);
  if (option.homeAssetId) params.set('homeAssetId', option.homeAssetId);
  params.set('assetName', option.assetName);
  return `/dashboard/providers?${params.toString()}`;
}

function resolveAssetLabel(action: GuidanceActionModel): string {
  const itemName = action.journey.inventoryItem?.name?.trim();
  if (itemName) return itemName;

  const assetType = action.journey.homeAsset?.assetType;
  if (assetType) return `${formatEnumLabel(assetType)} system`;

  return DOMAIN_FOCUS_LABELS[action.issueDomain] ?? formatIssueDomain(action.issueDomain);
}

function resolvePrimarySubtitle(action: GuidanceActionModel): string {
  const family = action.journey.primarySignal?.signalIntentFamily ?? '';
  const familySubtitle = SIGNAL_SUBTITLE_LABELS[family];
  if (familySubtitle) return familySubtitle;
  if (action.explanation?.why) return action.explanation.why;
  if (action.subtitle) return action.subtitle;
  return 'This is the highest-priority issue to resolve now.';
}

function resolveNextStepLabel(action: GuidanceActionModel): string {
  const stepLabel = action.nextStep?.label?.trim();
  if (stepLabel) return stepLabel;
  const journeyLabel = action.journey.nextStepLabel?.trim();
  if (journeyLabel) return journeyLabel;
  const explanationLabel = action.explanation?.nextStep?.trim();
  if (explanationLabel) return explanationLabel;
  return 'Review next step';
}

function resolveProgressLabel(action: GuidanceActionModel): string {
  const completed = action.progress?.completedCount ?? 0;
  const total = action.progress?.totalCount ?? 0;
  const percent = action.progress?.percent ?? 0;
  return `${completed}/${total} steps (${percent}%)`;
}

function resolvePriorityTone(action: GuidanceActionModel): 'danger' | 'elevated' | 'info' {
  if (action.priorityGroup === 'IMMEDIATE') return 'danger';
  if (action.priorityGroup === 'UPCOMING') return 'elevated';
  return 'info';
}

function renderPrimaryActionButton(action: GuidanceActionModel) {
  const href = action.href;
  const nextStepLabel = resolveNextStepLabel(action);

  if (!href) {
    return (
      <Button className="min-h-[44px] w-full" variant="secondary" disabled>
        Next step is being prepared
      </Button>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[hsl(var(--mobile-brand-strong))]/90"
    >
      Continue: {nextStepLabel}
    </Link>
  );
}

export default function GuidanceOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const selectedInventoryItemId =
    searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const selectedHomeAssetId = searchParams.get('homeAssetId');
  const selectedAssetName = searchParams.get('assetName')?.trim() ?? '';
  const hasScopeFilter = Boolean(selectedInventoryItemId || selectedHomeAssetId || selectedAssetName);

  const userSelectedScopeId = selectedInventoryItemId ?? selectedHomeAssetId ?? undefined;

  // Phase 3.1/3.2: remove limit, pass userSelectedScopeId for suppression bypass
  const guidance = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    userSelectedScopeId,
  });

  // Phase 3.3: source asset picker from inventory, not Risk Assessment
  const inventoryQuery = useQuery({
    queryKey: ['inventory-items', propertyId],
    queryFn: () => listInventoryItems(propertyId, {}),
    enabled: Boolean(propertyId),
    staleTime: 60_000,
  });

  // Phase 3.1: asset search filter state (replaces slice(0,6))
  const [assetSearch, setAssetSearch] = React.useState('');

  // Phase 3.7: skip step mutation
  const skipStepMutation = useMutation({
    mutationFn: ({ stepId }: { stepId: string }) =>
      skipGuidanceStep(propertyId, stepId, { reasonCode: 'USER_SKIPPED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
    },
  });

  // Phase 3.3: map InventoryItem → AssetScopeOption (full list, no truncation)
  const allAssetScopeOptions = React.useMemo<AssetScopeOption[]>(() => {
    const items = inventoryQuery.data ?? [];
    const deduped: AssetScopeOption[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const idKey = `${item.id}:${item.name.toLowerCase()}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      deduped.push({
        key: item.id,
        assetName: item.name,
        systemType: item.category ?? '',
        category: item.category ?? '',
        actionCta: null,
        // Inventory items don't carry a riskLevel — use LOW as neutral default
        riskLevel: 'LOW',
        outOfPocketCost: item.replacementCostCents ? item.replacementCostCents / 100 : 0,
        inventoryItemId: item.id,
        homeAssetId: item.homeAssetId ?? null,
        supportsPreciseScope: true,
      });
    }
    return deduped;
  }, [inventoryQuery.data]);

  // Phase 3.1: filter by search text (no hard cap)
  const filteredAssetOptions = React.useMemo(() => {
    if (!assetSearch.trim()) return allAssetScopeOptions;
    const needle = assetSearch.toLowerCase();
    return allAssetScopeOptions.filter(
      (o) =>
        o.assetName.toLowerCase().includes(needle) ||
        o.category.toLowerCase().includes(needle)
    );
  }, [allAssetScopeOptions, assetSearch]);

  // Phase 3.4: look up selectedAssetOption from full list (not sliced display list)
  const selectedAssetOption = React.useMemo(() => {
    if (!hasScopeFilter) return null;
    return (
      allAssetScopeOptions.find((option) => {
        const inventoryMatch =
          selectedInventoryItemId && option.inventoryItemId === selectedInventoryItemId;
        const homeAssetMatch = selectedHomeAssetId && option.homeAssetId === selectedHomeAssetId;
        const nameMatch =
          selectedAssetName && option.assetName.toLowerCase() === selectedAssetName.toLowerCase();
        return Boolean(inventoryMatch || homeAssetMatch || nameMatch);
      }) ?? null
    );
  }, [allAssetScopeOptions, hasScopeFilter, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId]);

  const allActions = React.useMemo(() => guidance.actions ?? [], [guidance.actions]);
  const filteredActions = React.useMemo(() => {
    if (!hasScopeFilter) return allActions;
    const assetNameNeedle = selectedAssetName.toLowerCase();
    return allActions.filter((action) => {
      if (selectedInventoryItemId && action.journey.inventoryItemId === selectedInventoryItemId) {
        return true;
      }
      if (selectedHomeAssetId && action.journey.homeAssetId === selectedHomeAssetId) {
        return true;
      }
      if (assetNameNeedle) {
        const haystack = [
          resolveAssetLabel(action),
          action.title,
          action.subtitle,
          action.nextStep?.label ?? '',
          action.journey.primarySignal?.signalIntentFamily ?? '',
          action.explanation?.what ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (haystack.includes(assetNameNeedle)) return true;
      }
      return false;
    });
  }, [allActions, hasScopeFilter, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId]);

  const hasScopedMatch = filteredActions.length > 0;
  const actions = React.useMemo(() => {
    if (!hasScopeFilter) return [];
    return filteredActions;
  }, [filteredActions, hasScopeFilter]);

  const primaryAction = actions[0] ?? null;
  const remainingActions = primaryAction ? actions.slice(1) : [];
  const immediateCount = actions.filter((action) => action.priorityGroup === 'IMMEDIATE').length;
  const blockedCount = actions.filter((action) => action.executionReadiness === 'NOT_READY').length;
  const baseOverviewHref = `/dashboard/properties/${propertyId}/tools/guidance-overview`;
  const focusLabel = selectedAssetOption?.assetName ?? (primaryAction ? resolveAssetLabel(primaryAction) : null);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Guidance Engine"
        title="Resolve Home Issues Step by Step"
        subtitle="We guide you through coverage checks, repair vs replace decisions, pricing, negotiation, and booking so each issue gets resolved end to end."
      />

      <ScenarioInputCard
        title="Get guidance for any asset"
        subtitle="Pick a home item to launch an asset-scoped guidance path."
      >
        {/* Phase 3.1: search filter input */}
        <input
          type="text"
          placeholder="Search home items..."
          value={assetSearch}
          onChange={(e) => setAssetSearch(e.target.value)}
          className="mb-3 w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
        />

        {inventoryQuery.isLoading ? (
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Loading your home items...</p>
        ) : filteredAssetOptions.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              {assetSearch
                ? 'No items match your search. Try a different name or category.'
                : 'No home items found. Add items to your inventory to get guidance.'}
            </p>
            {!assetSearch && (
              <ActionPriorityRow
                primaryAction={
                  <Button asChild className="min-h-[42px] w-full">
                    <Link href={`/dashboard/properties/${propertyId}/inventory`}>Open Inventory</Link>
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssetOptions.map((option) => {
              const href = buildScopedOverviewHref({
                propertyId,
                inventoryItemId: option.inventoryItemId,
                homeAssetId: option.homeAssetId,
                assetName: option.assetName,
              });
              const isSelected =
                (selectedInventoryItemId && option.inventoryItemId === selectedInventoryItemId) ||
                (selectedHomeAssetId && option.homeAssetId === selectedHomeAssetId) ||
                (selectedAssetName &&
                  option.assetName.toLowerCase() === selectedAssetName.toLowerCase());
              return (
                <div key={option.key} className="space-y-2">
                  <CompactEntityRow
                    title={option.assetName}
                    subtitle={
                      option.outOfPocketCost > 0
                        ? `Estimated replacement: ${formatCurrency(option.outOfPocketCost)}`
                        : formatEnumLabel(option.category)
                    }
                    meta={formatEnumLabel(option.category)}
                    status={<StatusChip tone="info">{formatEnumLabel(option.category)}</StatusChip>}
                  />
                  <ActionPriorityRow
                    primaryAction={
                      <Link
                        href={href}
                        className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                      >
                        {isSelected ? 'Selected item' : `Guide this item: ${option.assetName}`}
                      </Link>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </ScenarioInputCard>

      {hasScopeFilter ? (
        <ScenarioInputCard
          title="Asset focus enabled"
          subtitle="Showing guidance only for the selected asset context."
          actions={
            // Phase 4.5: "Change asset" label replaces "Clear asset focus"
            <Button asChild variant="ghost" className="min-h-[40px] w-full">
              <Link href={baseOverviewHref}>Change asset</Link>
            </Button>
          }
        >
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
            If this does not match what you expected, pick a different asset above.
          </p>
        </ScenarioInputCard>
      ) : null}

      <ResultHeroCard
        title={hasScopeFilter ? 'Selected asset guidance' : 'Select an asset to begin'}
        value={actions.length}
        status={
          <StatusChip tone={immediateCount > 0 ? 'danger' : actions.length > 0 ? 'elevated' : 'good'}>
            {immediateCount > 0 ? `${immediateCount} urgent` : actions.length > 0 ? 'Action needed' : hasScopeFilter ? 'Journey pending' : 'Selection required'}
          </StatusChip>
        }
        summary={
          !hasScopeFilter
            ? 'Guidance is asset-first. Choose any item above to launch the end-to-end journey.'
            : hasScopeFilter && !hasScopedMatch
            ? 'No active guidance found for this item yet. Use the steps below to investigate.'
            : `${guidance.counts?.activeSignals ?? 0} signals detected · ${blockedCount} blocked by missing context`
        }
        highlights={
          primaryAction
            ? [
                `Focus now: ${focusLabel ?? resolveAssetLabel(primaryAction)}`,
                `Next step: ${resolveNextStepLabel(primaryAction)}`,
                primaryAction.costOfDelay
                  ? `Delay risk: ~${formatCurrency(primaryAction.costOfDelay)}`
                  : primaryAction.explanation?.risk ?? 'Follow the guided path to reduce risk.',
              ]
            : hasScopeFilter
              ? ['No active guidance yet for this item.', 'Use the guided steps below to investigate.']
              : ['Choose an item from the list above.', 'Guidance is always created per asset.']
        }
      />

      {guidance.isLoading ? (
        <ScenarioInputCard title="Loading guidance" subtitle="Fetching active issue journeys.">
          <p className="text-sm text-slate-600">Please wait while we prepare your next best actions.</p>
        </ScenarioInputCard>
      ) : guidance.isError ? (
        <ScenarioInputCard title="Guidance unavailable" subtitle="We could not load active journeys right now.">
          <p className="text-sm text-rose-700">You can still use Risk Assessment and Home Tools while this refreshes.</p>
        </ScenarioInputCard>
      ) : !hasScopeFilter ? (
        <ScenarioInputCard
          title="Select an asset to launch guidance"
          subtitle="Guidance Engine does not run as property-wide flow."
        >
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
            Pick any item in the section above and we will guide coverage, repair vs replace, pricing, provider selection, negotiation, and finalization for that item.
          </p>
        </ScenarioInputCard>
      ) : actions.length === 0 ? (
        <ScenarioInputCard
          title={`Guidance journey for ${focusLabel ?? 'selected item'}`}
          subtitle="No active guidance found for this item yet. Use the steps below to investigate."
          badge={<StatusChip tone="elevated">Journey pending</StatusChip>}
        >
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              No system-detected issues exist for this item yet. You can check coverage, run a repair vs replace analysis, or find providers below.
            </p>
            {selectedAssetOption && (
              <div className="space-y-2 pt-1">
                {selectedAssetOption.inventoryItemId && (
                  <ActionPriorityRow
                    primaryAction={
                      <Link
                        href={appendScopeParams(
                          `/dashboard/properties/${propertyId}/inventory/items/${selectedAssetOption.inventoryItemId}/replace-repair`,
                          selectedAssetOption
                        )}
                        className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                      >
                        Repair vs Replace Analysis
                      </Link>
                    }
                  />
                )}
                <ActionPriorityRow
                  primaryAction={
                    <Link
                      href={appendScopeParams(
                        `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,
                        selectedAssetOption
                      )}
                      className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                    >
                      Check Coverage
                    </Link>
                  }
                />
                <ActionPriorityRow
                  primaryAction={
                    <Link
                      href={buildProvidersHref(propertyId, selectedAssetOption)}
                      className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                    >
                      Find Providers
                    </Link>
                  }
                />
              </div>
            )}
          </div>
        </ScenarioInputCard>
      ) : (
        <>
          {primaryAction ? (
            <ScenarioInputCard
              title={`Start Here: ${focusLabel ?? resolveAssetLabel(primaryAction)}`}
              subtitle={resolvePrimarySubtitle(primaryAction)}
              badge={<StatusChip tone={resolvePriorityTone(primaryAction)}>{primaryAction.priorityGroup.toLowerCase()}</StatusChip>}
            >
              {/* Phase 3.6: visual progress bar above the why-now block */}
              {primaryAction.steps.length > 0 && (
                <div className="mb-2">
                  <GuidanceJourneyStrip steps={primaryAction.steps} />
                  <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                    Step {primaryAction.progress.completedCount + 1} of {primaryAction.progress.totalCount}
                  </p>
                </div>
              )}

              <div className="space-y-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
                <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                  Why now
                </p>
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                  {primaryAction.explanation?.why ??
                    primaryAction.subtitle ??
                    'Following this journey now reduces cost and execution risk.'}
                </p>
                {primaryAction.costOfDelay ? (
                  <p className="mb-0 text-sm font-semibold text-amber-700">
                    Potential delay cost: ~{formatCurrency(primaryAction.costOfDelay)}
                  </p>
                ) : null}
              </div>

              <ActionPriorityRow primaryAction={renderPrimaryActionButton(primaryAction)} />

              {/* Phase 3.7: Skip button for the active step */}
              {primaryAction.currentStep?.id && (
                <Button
                  variant="ghost"
                  className="mt-1 min-h-[40px] w-full text-sm text-[hsl(var(--mobile-text-muted))]"
                  disabled={skipStepMutation.isPending}
                  onClick={() => {
                    if (primaryAction.currentStep?.id) {
                      skipStepMutation.mutate({ stepId: primaryAction.currentStep.id });
                    }
                  }}
                >
                  Skip this step
                </Button>
              )}
            </ScenarioInputCard>
          ) : null}

          <ScenarioInputCard
            title="Journey Steps"
            subtitle="Continue with the remaining steps for this asset."
          >
            <div className="space-y-3">
              {remainingActions.length === 0 ? (
                <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                  No additional active steps for this asset yet.
                </p>
              ) : (
                remainingActions.map((action) => {
                  const nextStepLabel = resolveNextStepLabel(action);
                  return (
                    <div key={action.journeyId} className="space-y-2">
                      <CompactEntityRow
                        title={resolveAssetLabel(action)}
                        subtitle={`Next: ${nextStepLabel}`}
                        meta={`${resolveProgressLabel(action)} · ${formatIssueDomain(action.issueDomain)}`}
                        status={<StatusChip tone={resolvePriorityTone(action)}>{action.priorityGroup.toLowerCase()}</StatusChip>}
                      />
                      <ActionPriorityRow
                        primaryAction={
                          action.href ? (
                            <Link
                              href={action.href}
                              className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                            >
                              Open: {nextStepLabel}
                            </Link>
                          ) : (
                            <Button className="min-h-[42px] w-full" variant="secondary" disabled>
                              Next step preparing
                            </Button>
                          )
                        }
                      />
                      {/* Phase 3.7: skip per remaining step */}
                      {action.currentStep?.id && (
                        <Button
                          variant="ghost"
                          className="min-h-[40px] w-full text-sm text-[hsl(var(--mobile-text-muted))]"
                          disabled={skipStepMutation.isPending}
                          onClick={() => {
                            if (action.currentStep?.id) {
                              skipStepMutation.mutate({ stepId: action.currentStep.id });
                            }
                          }}
                        >
                          Skip this step
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScenarioInputCard>

          <ScenarioInputCard
            title="How Guidance Engine Helps"
            subtitle="Every issue follows a deterministic path so you do not repeat context at every tool."
          >
            <div className="space-y-2">
              <CompactEntityRow
                title="1. Diagnose and check coverage"
                subtitle="We start with risk signals and verify if insurance/warranty can reduce cost."
                leading={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
              />
              <CompactEntityRow
                title="2. Decide repair vs replace"
                subtitle="We route to the right decision tool with your asset context prefilled."
                leading={<Wrench className="h-4 w-4 text-sky-600" />}
              />
              <CompactEntityRow
                title="3. Validate price and negotiate"
                subtitle="We help compare pricing, generate negotiation leverage, and finalize terms."
                leading={<CircleAlert className="h-4 w-4 text-amber-600" />}
              />
            </div>
          </ScenarioInputCard>
        </>
      )}
    </MobilePageContainer>
  );
}
