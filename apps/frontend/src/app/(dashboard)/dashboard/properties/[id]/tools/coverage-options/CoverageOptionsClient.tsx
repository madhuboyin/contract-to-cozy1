'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { Button } from '@/components/ui/button';
import {
  ResultHeroCard,
  ScenarioInputCard,
  CompactEntityRow,
  ActionPriorityRow,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import PriorityActionHero from '@/components/system/PriorityActionHero';
import RouteStateCard from '@/components/system/RouteStateCard';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { track } from '@/lib/analytics/events';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';

export default function CoverageOptionsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toolLaunchContext = useToolLaunchContext();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ??
    toolLaunchContext?.resolved.prefill.journeyId ??
    undefined;
  const currentPathWithQuery = React.useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);
  const guidanceStepKey = searchParams.get('guidanceStepKey') ?? 'compare_coverage_options';
  const focusedEntityId = toolLaunchContext?.resolved.prefill.itemId ??
    toolLaunchContext?.resolved.prefill.entityId ??
    searchParams.get('itemId') ??
    searchParams.get('sourceEntityId');

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [progressing, setProgressing] = React.useState(false);
  const [proofCompleted, setProofCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', {
      tool: 'coverage-options',
      propertyId,
      entryPoint: guidanceJourneyId ? 'guidance' : 'direct',
    });
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get(`/api/properties/${propertyId}/inventory/coverage-gaps`);
        if (!cancelled) setData(res.data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load coverage gaps');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  async function handleMarkReviewed() {
    if (!propertyId || !guidanceJourneyId) return;
    setProgressing(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId,
        sourceToolKey: 'coverage-options',
        status: 'COMPLETED',
        producedData: {
          proofType: 'coverage_options_review',
          proofId: `coverage-options-review:${guidanceJourneyId}:${guidanceStepKey}`,
          reviewedAt: new Date().toISOString(),
          totalCoverageGaps: Number(totalGaps),
          topCoverageGapType: topGap?.gapType ?? null,
          topCoverageGapItemId: topGap?.inventoryItemId ?? null,
          topCoverageGapItemName: topGap?.itemName ?? null,
        },
      });
      setProofCompleted(true);
      track('workflow_completed', { tool: 'coverage-options', propertyId });
    } catch (e) {
      console.error('[CoverageOptions] failed to record completion', e);
    } finally {
      setProgressing(false);
    }
  }

  const gaps = React.useMemo(() => {
    const rows = Array.isArray(data?.gaps) ? data.gaps : [];
    if (!focusedEntityId) return rows;
    return [...rows].sort((left, right) => {
      const leftMatch = left.inventoryItemId === focusedEntityId || left.id === focusedEntityId;
      const rightMatch = right.inventoryItemId === focusedEntityId || right.id === focusedEntityId;
      return Number(rightMatch) - Number(leftMatch);
    });
  }, [data?.gaps, focusedEntityId]);
  const counts = data?.counts ?? {};
  const totalGaps = counts.total ?? 0;
  const topGap = gaps[0] ?? null;

  const routeState = loading
    ? {
        kind: 'loading' as const,
        title: 'Loading coverage gaps',
        description: 'Fetching the latest coverage status across your inventory items.',
      }
    : err
      ? {
          kind: 'error' as const,
          title: 'Coverage data unavailable',
          description: err,
          secondaryAction: (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/properties/${propertyId}/inventory`}>Open inventory</Link>
            </Button>
          ),
        }
      : gaps.length === 0
        ? {
            kind: 'success' as const,
            title: 'No missing item protection records found',
            description: 'The tracked records do not raise an item-level question. This does not confirm what an insurance policy covers.',
          }
        : undefined;

  const buildGapGuidanceHref = React.useCallback(
    (gap: any) =>
      buildGuidanceOverviewHref({
        propertyId,
        journeyId: guidanceJourneyId ?? null,
        stepKey: guidanceStepKey,
        inventoryItemId: gap.inventoryItemId,
        assetName: gap.itemName ?? null,
        customIssueLabel: gap.reasons?.[0] || `${gap.itemName || 'Item'} coverage gap`,
      }),
    [guidanceJourneyId, guidanceStepKey, propertyId]
  );

  // Only surface guidance context when there are gaps to resolve or the user
  // arrived via an explicit guidance journey link. Avoids contradicting a clean
  // "no gaps" result with an active-journey card for a different item.
  const showGuidancePanel = totalGaps > 0 || Boolean(guidanceJourneyId);

  // Fix 1: Avoid double-negative when gapType is NO_COVERAGE
  const gapExposureDescription = topGap
    ? topGap.gapType === 'NO_COVERAGE'
      ? 'This item has no coverage protection.'
      : `${formatEnumLabel(topGap.gapType) || 'Gap'} protection is missing on this item.`
    : '';

  // Fix 2: Suppress "remaining 0 gaps" clause when there's only 1 gap
  const remainingClause = totalGaps > 1
    ? ` Start here, then work through the remaining ${totalGaps - 1} gap${totalGaps - 1 !== 1 ? 's' : ''}.`
    : '';

  // Fix 3: "No Coverage exposure" sounds like there's no risk — use a clear label instead
  const impactLabel = topGap
    ? topGap.gapType === 'NO_COVERAGE'
      ? 'Uninsured exposure'
      : `${formatEnumLabel(topGap.gapType) || 'Gap'} exposure`
    : '';

  return (
    <div className="space-y-4">
      {/* Priority action — only when gaps exist */}
      {!loading && !err && totalGaps > 0 && topGap ? (
        <PriorityActionHero
          eyebrow="Compare Decision"
          title={`You have ${totalGaps} coverage gap${totalGaps !== 1 ? 's' : ''} — highest priority: ${topGap.itemName}`}
          description={`${gapExposureDescription}${remainingClause}`}
          impactLabel={impactLabel}
          confidenceLabel="Confidence improves as item-level coverage records stay current"
          primaryAction={
            <Link
              href={`/dashboard/properties/${propertyId}/inventory/items/${topGap.inventoryItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-black/90"
            >
              Resolve top gap
            </Link>
          }
          supportingAction={
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href={buildGapGuidanceHref(topGap)}>
                Review repair/replace context
              </Link>
            </Button>
          }
        />
      ) : null}

      {/* Coverage gap data — always shown first so data leads the page */}
      {routeState ? (
        <RouteStateCard
          state={routeState.kind}
          title={routeState.title}
          description={routeState.description}
          action={(routeState as any).action}
          secondaryAction={(routeState as any).secondaryAction}
        />
      ) : (
        <>
          {/* Fix 6: Priority hero already shows the count when there's only 1 gap */}
          {totalGaps !== 1 && (
            <ResultHeroCard
              title="Open Protection Record Questions"
              value={totalGaps}
              status={
                <StatusChip tone={totalGaps > 0 ? 'elevated' : 'good'}>
                  {totalGaps > 0 ? 'Review records' : 'No questions found'}
                </StatusChip>
              }
              summary={`${counts.NO_COVERAGE ?? 0} missing records · ${(counts.WARRANTY_ONLY ?? 0) + (counts.INSURANCE_ONLY ?? 0)} incomplete records`}
            />
          )}

          {/* Fix 4: Single-gap — priority hero already surfaces the item; gap breakdown is redundant */}
          {totalGaps !== 1 && <ScenarioInputCard
            title="Gap Breakdown"
            subtitle="Review each gap and select the best coverage option to close it."
          >
            <div className="space-y-3">
              {gaps.map((gap: any) => {
                const gapLabel = formatEnumLabel(gap.gapType) || 'Coverage Gap';
                return (
                  <div key={gap.inventoryItemId} className="space-y-2.5 rounded-xl border border-black/10 p-2.5">
                    <CompactEntityRow
                      title={gap.itemName}
                      subtitle={gap.reasons?.join('. ') || 'Coverage gap detected'}
                      meta={gap.roomName ? `${gap.roomName} · ${gapLabel}` : gapLabel}
                      status={
                        <StatusChip tone={gap.gapType === 'NO_COVERAGE' ? 'danger' : 'elevated'}>
                          {gapLabel}
                        </StatusChip>
                      }
                    />
                    <ActionPriorityRow
                      primaryAction={
                        <Link
                          href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/coverage?returnTo=${encodeURIComponent(currentPathWithQuery)}`}
                          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
                        >
                          Get coverage
                        </Link>
                      }
                      secondaryActions={
                        <Link
                          href={buildGapGuidanceHref(gap)}
                          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                        >
                          Repair/Replace
                        </Link>
                      }
                    />
                  </div>
                );
              })}
            </div>
          </ScenarioInputCard>}
        </>
      )}

      {/* Guidance panel — below coverage data, only when contextually relevant */}
      {showGuidancePanel ? (
        <GuidanceInlinePanel
          propertyId={propertyId}
          title="Guidance"
          subtitle="Any active plans tied to your coverage gaps will appear here."
          toolKey="coverage-options"
          limit={1}
          journeyId={guidanceJourneyId}
        />
      ) : null}

      {/* Guidance progress — only shown when user arrived via a guidance journey */}
      {guidanceJourneyId ? (
        <ScenarioInputCard
          title="Mark Step Complete"
          subtitle="Record that you've compared coverage options for this guidance journey."
        >
          {proofCompleted ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              Completion recorded. Return to your guidance journey to continue.
            </div>
          ) : (
            <Button
              className="min-h-[44px] w-full"
              onClick={handleMarkReviewed}
              disabled={progressing}
            >
              {progressing ? 'Saving...' : 'Complete this step'}
            </Button>
          )}
        </ScenarioInputCard>
      ) : null}
    </div>
  );
}
