'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  EmptyStateCard,
  MobilePageContainer,
  MobilePageIntro,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { formatIssueDomain } from '@/features/guidance/utils/guidanceDisplay';
import type { AssetRiskDetail, RiskAssessmentReport } from '@/types';
import { api } from '@/lib/api/client';
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
  riskLevel: AssetRiskDetail['riskLevel'];
  outOfPocketCost: number;
  inventoryItemId: string | null;
  homeAssetId: string | null;
  supportsPreciseScope: boolean;
};

const RISK_LEVEL_RANK: Record<AssetRiskDetail['riskLevel'], number> = {
  HIGH: 4,
  ELEVATED: 3,
  MODERATE: 2,
  LOW: 1,
};

function riskLevelTone(level: AssetRiskDetail['riskLevel']): 'danger' | 'elevated' | 'good' {
  if (level === 'HIGH' || level === 'ELEVATED') return 'danger';
  if (level === 'MODERATE') return 'elevated';
  return 'good';
}

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
  const selectedInventoryItemId =
    searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const selectedHomeAssetId = searchParams.get('homeAssetId');
  const selectedAssetName = searchParams.get('assetName')?.trim() ?? '';
  const hasScopeFilter = Boolean(selectedInventoryItemId || selectedHomeAssetId || selectedAssetName);

  const guidance = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    limit: 10,
  });
  const riskReportQuery = useQuery({
    queryKey: ['risk-report-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const reportOrStatus = await api.getRiskReportSummary(propertyId);
      return reportOrStatus === 'QUEUED' ? null : (reportOrStatus as RiskAssessmentReport);
    },
    enabled: Boolean(propertyId),
    staleTime: 60_000,
  });

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
        if (haystack.includes(assetNameNeedle)) {
          return true;
        }
      }
      return false;
    });
  }, [allActions, hasScopeFilter, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId]);

  const assetScopeOptions = React.useMemo<AssetScopeOption[]>(() => {
    const details = riskReportQuery.data?.details ?? [];
    if (!details.length) return [];

    const options = details
      .map((item) => ({
        key: `${item.inventoryItemId ?? 'none'}:${item.homeAssetId ?? 'none'}:${item.assetName}`,
        assetName: item.assetName,
        riskLevel: item.riskLevel,
        outOfPocketCost: item.outOfPocketCost,
        inventoryItemId: item.inventoryItemId ?? null,
        homeAssetId: item.homeAssetId ?? null,
        supportsPreciseScope: Boolean(item.inventoryItemId || item.homeAssetId),
      }))
      .sort((a, b) => {
        const rankDiff = RISK_LEVEL_RANK[b.riskLevel] - RISK_LEVEL_RANK[a.riskLevel];
        if (rankDiff !== 0) return rankDiff;
        return b.outOfPocketCost - a.outOfPocketCost;
      });

    const deduped: AssetScopeOption[] = [];
    const seen = new Set<string>();
    for (const option of options) {
      const idKey = `${option.inventoryItemId ?? ''}:${option.homeAssetId ?? ''}:${option.assetName.toLowerCase()}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      deduped.push(option);
    }
    return deduped.slice(0, 6);
  }, [riskReportQuery.data?.details]);

  const selectedAssetOption = React.useMemo(() => {
    if (!hasScopeFilter) return null;
    return (
      assetScopeOptions.find((option) => {
        const inventoryMatch =
          selectedInventoryItemId && option.inventoryItemId === selectedInventoryItemId;
        const homeAssetMatch = selectedHomeAssetId && option.homeAssetId === selectedHomeAssetId;
        const nameMatch = selectedAssetName && option.assetName.toLowerCase() === selectedAssetName.toLowerCase();
        return Boolean(inventoryMatch || homeAssetMatch || nameMatch);
      }) ?? null
    );
  }, [assetScopeOptions, hasScopeFilter, selectedAssetName, selectedHomeAssetId, selectedInventoryItemId]);

  const hasScopedMatch = filteredActions.length > 0;
  const isScopeFallback = hasScopeFilter && !hasScopedMatch && allActions.length > 0;
  const actions = React.useMemo(() => {
    if (hasScopeFilter) {
      if (filteredActions.length > 0) return filteredActions;
      return allActions;
    }
    const scoped = allActions.filter(
      (action) => Boolean(action.journey.inventoryItemId) || Boolean(action.journey.homeAssetId)
    );
    const propertyWide = allActions.filter(
      (action) => !action.journey.inventoryItemId && !action.journey.homeAssetId
    );
    return [...scoped, ...propertyWide];
  }, [allActions, filteredActions, hasScopeFilter]);

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
        subtitle="Pick a risk item to launch an asset-scoped guidance path."
      >
        {riskReportQuery.isLoading ? (
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Loading assets from Risk Assessment...</p>
        ) : assetScopeOptions.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              No asset-level risk entries are ready yet. Run Risk Assessment to generate asset options.
            </p>
            <ActionPriorityRow
              primaryAction={
                <Button asChild className="min-h-[42px] w-full">
                  <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>Open Risk Assessment</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {assetScopeOptions.map((option) => {
              const href = buildScopedOverviewHref({
                propertyId,
                inventoryItemId: option.inventoryItemId,
                homeAssetId: option.homeAssetId,
                assetName: option.assetName,
              });
              const isSelected =
                (selectedInventoryItemId && option.inventoryItemId === selectedInventoryItemId) ||
                (selectedHomeAssetId && option.homeAssetId === selectedHomeAssetId) ||
                (selectedAssetName && option.assetName.toLowerCase() === selectedAssetName.toLowerCase());
              return (
                <div key={option.key} className="space-y-2">
                  <CompactEntityRow
                    title={option.assetName}
                    subtitle={`Estimated out-of-pocket: ${formatCurrency(option.outOfPocketCost)}`}
                    meta={`Risk: ${formatEnumLabel(option.riskLevel)}${option.supportsPreciseScope ? '' : ' · ID linking pending'}`}
                    status={<StatusChip tone={riskLevelTone(option.riskLevel)}>{formatEnumLabel(option.riskLevel)}</StatusChip>}
                  />
                  <ActionPriorityRow
                    primaryAction={
                      <Link
                        href={href}
                        className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
                      >
                        {isSelected ? 'Selected asset' : `Guide this asset: ${option.assetName}`}
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
            <Button asChild variant="ghost" className="min-h-[40px] w-full">
              <Link href={baseOverviewHref}>Clear asset focus</Link>
            </Button>
          }
        >
          <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
            If this does not match what you expected, pick a different asset above or open Risk Assessment.
          </p>
        </ScenarioInputCard>
      ) : null}

      <ResultHeroCard
        title={hasScopeFilter ? 'Selected asset journeys' : 'Active issue journeys'}
        value={actions.length}
        status={
          <StatusChip tone={immediateCount > 0 ? 'danger' : actions.length > 0 ? 'elevated' : 'good'}>
            {immediateCount > 0 ? `${immediateCount} urgent` : actions.length > 0 ? 'Action needed' : 'All clear'}
          </StatusChip>
        }
        summary={`${guidance.counts?.activeSignals ?? 0} signals detected · ${blockedCount} blocked by missing context`}
        highlights={
          primaryAction
            ? [
                `Focus now: ${focusLabel ?? resolveAssetLabel(primaryAction)}`,
                `Next step: ${resolveNextStepLabel(primaryAction)}`,
                primaryAction.costOfDelay
                  ? `Delay risk: ~${formatCurrency(primaryAction.costOfDelay)}`
                  : primaryAction.explanation?.risk ?? 'Follow the guided path to reduce risk.',
              ]
            : ['No active journeys right now.']
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
      ) : actions.length === 0 ? (
        <EmptyStateCard
          title={hasScopeFilter ? 'No guidance found for selected asset' : 'No active guidance journeys'}
          description={
            hasScopeFilter
              ? 'We could not find an active journey for this asset yet. Recalculate risk or choose another asset.'
              : 'Run Risk Assessment to identify issues, then Guidance Engine will walk you through resolution.'
          }
          action={
            <Button asChild className="min-h-[44px] w-full">
              <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>Open Risk Assessment</Link>
            </Button>
          }
        />
      ) : isScopeFallback ? (
        <>
          <ScenarioInputCard
            title="Asset-specific path is still being prepared"
            subtitle="Showing the closest active guidance journey while we gather asset-level evidence."
            badge={<StatusChip tone="elevated">Fallback</StatusChip>}
          >
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              We found your selected asset, but there is no dedicated active journey for it yet.
            </p>
          </ScenarioInputCard>
          {primaryAction ? (
            <ScenarioInputCard
              title={`Start Here: ${focusLabel ?? resolveAssetLabel(primaryAction)}`}
              subtitle={resolvePrimarySubtitle(primaryAction)}
              badge={<StatusChip tone={resolvePriorityTone(primaryAction)}>{primaryAction.priorityGroup.toLowerCase()}</StatusChip>}
            >
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
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                  Progress: {resolveProgressLabel(primaryAction)}
                </p>
              </div>

              <ActionPriorityRow primaryAction={renderPrimaryActionButton(primaryAction)} />
            </ScenarioInputCard>
          ) : null}
        </>
      ) : (
        <>
          {primaryAction ? (
            <ScenarioInputCard
              title={`Start Here: ${focusLabel ?? resolveAssetLabel(primaryAction)}`}
              subtitle={resolvePrimarySubtitle(primaryAction)}
              badge={<StatusChip tone={resolvePriorityTone(primaryAction)}>{primaryAction.priorityGroup.toLowerCase()}</StatusChip>}
            >
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
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                  Progress: {resolveProgressLabel(primaryAction)}
                </p>
              </div>

              <ActionPriorityRow primaryAction={renderPrimaryActionButton(primaryAction)} />
            </ScenarioInputCard>
          ) : null}

          <ScenarioInputCard
            title="Issue Queue"
            subtitle="After the primary issue, continue with these journeys."
          >
            <div className="space-y-3">
              {remainingActions.length === 0 ? (
                <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                  You only have one active journey right now.
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
