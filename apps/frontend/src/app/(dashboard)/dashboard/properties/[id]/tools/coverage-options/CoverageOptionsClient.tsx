'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { Button } from '@/components/ui/button';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  ResultHeroCard,
  ScenarioInputCard,
  CompactEntityRow,
  ActionPriorityRow,
  StatusChip,
  EmptyStateCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import HomeToolsRail from '../../components/HomeToolsRail';
import { formatEnumLabel } from '@/lib/utils/formatters';

export default function CoverageOptionsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ?? undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') ?? 'compare_coverage_options';

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
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Coverage Options"
        subtitle="Compare available home warranty and insurance policy options to close identified coverage gaps."
      />

      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      <GuidanceInlinePanel
        propertyId={propertyId}
        title="Where This Tool Fits"
        subtitle="Coverage Options is part of active guidance journeys. Compare options and mark complete when done."
        toolKey="coverage-options"
        limit={1}
        journeyId={guidanceJourneyId}
      />

      {loading ? (
        <ScenarioInputCard title="Loading" subtitle="Loading coverage gaps..." badge={<StatusChip tone="info">Please wait</StatusChip>}>
          <p className="text-sm text-slate-600">Fetching coverage data for your property.</p>
        </ScenarioInputCard>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : gaps.length === 0 ? (
        <EmptyStateCard
          title="No coverage gaps found"
          description="All tracked items currently have coverage. No policy comparisons are needed at this time."
        />
      ) : (
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
      )}

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
    </MobilePageContainer>
  );
}
