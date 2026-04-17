'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
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
import HomeToolsRail from '../../components/HomeToolsRail';
import { formatEnumLabel } from '@/lib/utils/formatters';
import CompareTemplate from '../../components/route-templates/CompareTemplate';

export default function CoverageOptionsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ?? undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') ?? 'compare_coverage_options';
  const backHref = guidanceJourneyId
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [progressing, setProgressing] = React.useState(false);
  const [progressRecorded, setProgressRecorded] = React.useState(false);
  const [proofCompleted, setProofCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!propertyId) return;
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
  }, [propertyId]);

  async function handleMarkReviewed() {
    if (!propertyId) return;
    setProgressing(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId,
        sourceToolKey: 'coverage-options',
        status: 'IN_PROGRESS',
        producedData: {
          proofType: 'progress_checkpoint',
          proofId: 'coverage-options:in-progress',
          reviewedAt: new Date().toISOString(),
        },
      });
      setProgressRecorded(true);
    } catch (e) {
      console.error('[CoverageOptions] failed to record progress', e);
    } finally {
      setProgressing(false);
    }
  }

  const gaps = data?.gaps ?? [];
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
            title: 'No coverage gaps found',
            description: 'All tracked items currently have coverage. No policy comparisons are needed right now.',
          }
        : undefined;

  React.useEffect(() => {
    if (!propertyId || !guidanceJourneyId || proofCompleted) return;
    if (Number(totalGaps) > 0) return;

    let cancelled = false;
    (async () => {
      try {
        await recordGuidanceToolStatus(propertyId, {
          stepKey: guidanceStepKey,
          journeyId: guidanceJourneyId,
          sourceToolKey: 'coverage-options',
          status: 'COMPLETED',
          producedData: {
            proofType: 'coverage_gap_snapshot',
            proofId: `coverage-options:${propertyId}`,
            totalCoverageGaps: Number(totalGaps),
            capturedAt: new Date().toISOString(),
          },
        });
        if (!cancelled) setProofCompleted(true);
      } catch (error) {
        console.error('[CoverageOptions] failed to auto-complete proof-backed step', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guidanceJourneyId, guidanceStepKey, proofCompleted, propertyId, totalGaps]);

  return (
    <CompareTemplate
      backHref={backHref}
      backLabel={guidanceJourneyId ? 'Back to guidance' : 'Back to property'}
      title="Coverage Options"
      subtitle="Compare warranty and insurance options to close identified coverage gaps."
      rail={<HomeToolsRail propertyId={propertyId} />}
      trust={{
        confidenceLabel: 'Medium, based on current item coverage states',
        freshnessLabel: 'Real-time when coverage records are updated',
        sourceLabel: 'Inventory coverage gaps + linked warranty/insurance metadata',
        rationale: 'Recommendations prioritize no-coverage items first, then partial or expired protection.',
      }}
      priorityAction={!loading && !err && totalGaps > 0 && topGap ? {
        title: `You have ${totalGaps} coverage gap${totalGaps !== 1 ? 's' : ''} — highest priority: ${topGap.itemName}`,
        description: `${formatEnumLabel(topGap.gapType) || 'Gap'} protection is missing on this item. Start here, then work through the remaining ${totalGaps - 1} gap${totalGaps - 1 !== 1 ? 's' : ''}.`,
        impactLabel: `${formatEnumLabel(topGap.gapType) || 'Gap'} exposure`,
        confidenceLabel: 'Confidence improves as item-level coverage records stay current',
        primaryAction: (
          <Link
            href={`/dashboard/properties/${propertyId}/inventory/items/${topGap.inventoryItemId}/coverage`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-black/90"
          >
            Resolve top gap
          </Link>
        ),
        supportingAction: (
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/dashboard/properties/${propertyId}/inventory/items/${topGap.inventoryItemId}/replace-repair`}>
              Review repair/replace context
            </Link>
          </Button>
        ),
      } : undefined}
      routeState={routeState}
      summary={
        <GuidanceInlinePanel
          propertyId={propertyId}
          title="Where This Tool Fits"
          subtitle="Coverage Options is part of active guidance journeys. Compare options and mark complete when done."
          toolKey="coverage-options"
          limit={1}
          journeyId={guidanceJourneyId}
        />
      }
      compareContent={
        <>
          <ResultHeroCard
            title="Open Coverage Gaps"
            value={totalGaps}
            status={<StatusChip tone={totalGaps > 0 ? 'elevated' : 'good'}>{totalGaps > 0 ? 'Review options' : 'Covered'}</StatusChip>}
            summary={`${counts.NO_COVERAGE ?? 0} uncovered · ${(counts.WARRANTY_ONLY ?? 0) + (counts.INSURANCE_ONLY ?? 0)} partially covered`}
          />

          <ScenarioInputCard
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
                      status={<StatusChip tone={gap.gapType === 'NO_COVERAGE' ? 'danger' : 'elevated'}>{gapLabel}</StatusChip>}
                    />
                    <ActionPriorityRow
                      primaryAction={
                        <Link
                          href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/coverage`}
                          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
                        >
                          Get coverage
                        </Link>
                      }
                      secondaryActions={
                        <Link
                          href={`/dashboard/properties/${propertyId}/inventory/items/${gap.inventoryItemId}/replace-repair`}
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
          </ScenarioInputCard>
        </>
      }
      footer={
        <ScenarioInputCard
          title="Guidance Progress"
          subtitle="This step auto-completes when proof-backed coverage state is available."
        >
          {proofCompleted ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              Proof-backed completion recorded. Return to your guidance journey to continue.
            </div>
          ) : (
            <Button
              className="min-h-[44px] w-full"
              onClick={handleMarkReviewed}
              disabled={progressing}
            >
              {progressing ? 'Saving...' : progressRecorded ? 'Progress recorded' : 'Record progress'}
            </Button>
          )}
        </ScenarioInputCard>
      }
    />
  );
}
