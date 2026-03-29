'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { formatCurrency } from '@/lib/utils/format';
import { formatEnumLabel } from '@/lib/utils/formatters';

function resolveAssetLabel(action: GuidanceActionModel): string {
  const itemName = action.journey.inventoryItem?.name?.trim();
  if (itemName) return itemName;

  const assetType = action.journey.homeAsset?.assetType;
  if (assetType) return `${formatEnumLabel(assetType)} system`;

  const signalFamily = action.journey.primarySignal?.signalIntentFamily;
  if (signalFamily) return formatEnumLabel(signalFamily);

  return formatIssueDomain(action.issueDomain);
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

  const guidance = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    limit: 10,
  });

  const actions = guidance.actions ?? [];
  const primaryAction = actions[0] ?? null;
  const remainingActions = primaryAction ? actions.slice(1) : [];
  const immediateCount = actions.filter((action) => action.priorityGroup === 'IMMEDIATE').length;
  const blockedCount = actions.filter((action) => action.executionReadiness === 'NOT_READY').length;

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

      <ResultHeroCard
        title="Active issue journeys"
        value={guidance.counts?.activeJourneys ?? actions.length}
        status={
          <StatusChip tone={immediateCount > 0 ? 'danger' : actions.length > 0 ? 'elevated' : 'good'}>
            {immediateCount > 0 ? `${immediateCount} urgent` : actions.length > 0 ? 'Action needed' : 'All clear'}
          </StatusChip>
        }
        summary={`${guidance.counts?.activeSignals ?? 0} signals detected · ${blockedCount} blocked by missing context`}
        highlights={
          primaryAction
            ? [
                `Focus now: ${resolveAssetLabel(primaryAction)}`,
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
          title="No active guidance journeys"
          description="Run Risk Assessment to identify issues, then Guidance Engine will walk you through resolution."
          action={
            <Button asChild className="min-h-[44px] w-full">
              <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>Open Risk Assessment</Link>
            </Button>
          }
        />
      ) : (
        <>
          {primaryAction ? (
            <ScenarioInputCard
              title={`Start Here: ${resolveAssetLabel(primaryAction)}`}
              subtitle={
                primaryAction.explanation?.what ??
                'This is the highest-priority issue to resolve now.'
              }
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
