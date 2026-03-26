'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { getPropertyGuidance, recordGuidanceToolCompletion } from '@/lib/api/guidanceApi';
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
import { resolveGuidanceStepHref, formatIssueDomain } from '@/features/guidance/utils/guidanceDisplay';

export default function GuidanceOverviewClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ?? undefined;

  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [completing, setCompleting] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await getPropertyGuidance(propertyId);
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load guidance data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  async function handleMarkReviewed() {
    if (!propertyId) return;
    setCompleting(true);
    try {
      await recordGuidanceToolCompletion(propertyId, {
        stepKey: 'review_signal',
        journeyId: guidanceJourneyId,
        producedData: { reviewedAt: new Date().toISOString() },
      });
      setCompleted(true);
    } catch (e) {
      console.error('[GuidanceOverview] failed to record completion', e);
    } finally {
      setCompleting(false);
    }
  }

  const journeys = data?.journeys ?? [];
  const counts = data?.counts ?? {};
  const activeCount = counts.activeJourneys ?? journeys.length;

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
        title="Guidance Overview"
        subtitle="See all active guidance signals across your property and track recommended resolution steps."
      />

      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      <GuidanceInlinePanel
        propertyId={propertyId}
        title="Active Guidance"
        subtitle="All open signals and journeys for this property."
        limit={3}
      />

      {loading ? (
        <ScenarioInputCard title="Loading" subtitle="Loading guidance signals..." badge={<StatusChip tone="info">Please wait</StatusChip>}>
          <p className="text-sm text-slate-600">Fetching active guidance for your property.</p>
        </ScenarioInputCard>
      ) : err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : journeys.length === 0 ? (
        <EmptyStateCard
          title="No active guidance"
          description="Your property has no active guidance signals at this time. Check back after running diagnostic tools."
        />
      ) : (
        <>
          <ResultHeroCard
            title="Active Guidance Journeys"
            value={activeCount}
            status={<StatusChip tone={activeCount > 0 ? 'elevated' : 'good'}>{activeCount > 0 ? 'Action needed' : 'All clear'}</StatusChip>}
            summary={`${counts.activeSignals ?? 0} signal${(counts.activeSignals ?? 0) !== 1 ? 's' : ''} detected`}
          />

          <ScenarioInputCard
            title="Journeys"
            subtitle="Review each active journey and follow recommended next steps."
          >
            <div className="space-y-3">
              {journeys.map((journey: any) => {
                const domainLabel = formatIssueDomain(journey.issueDomain);
                const nextStep = data?.next?.find((n: any) => n.journeyId === journey.id) ?? null;
                const nextStepLabel = journey.nextStepLabel ?? nextStep?.nextStepLabel ?? null;
                const stepHref = nextStep?.currentStep
                  ? resolveGuidanceStepHref({
                      propertyId,
                      journey,
                      step: nextStep.currentStep,
                      next: nextStep,
                    })
                  : null;

                return (
                  <div key={journey.id} className="space-y-2.5 rounded-xl border border-black/10 p-2.5">
                    <CompactEntityRow
                      title={domainLabel}
                      subtitle={nextStepLabel ? `Next: ${nextStepLabel}` : `${journey.progress?.completedCount ?? 0} of ${journey.progress?.totalCount ?? 0} steps complete`}
                      meta={`${journey.progress?.percent ?? 0}% complete · ${formatEnumLabel(journey.status)}`}
                      status={
                        <StatusChip tone={journey.status === 'ACTIVE' ? 'elevated' : 'info'}>
                          {formatEnumLabel(journey.status)}
                        </StatusChip>
                      }
                    />
                    {stepHref && (
                      <ActionPriorityRow
                        primaryAction={
                          <Link
                            href={stepHref}
                            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
                          >
                            {nextStepLabel ? `Start: ${nextStepLabel}` : 'Continue journey'}
                          </Link>
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </ScenarioInputCard>
        </>
      )}

      <ScenarioInputCard
        title="Step Complete?"
        subtitle="Once you've reviewed all active guidance signals, mark this step as done."
      >
        {completed ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" />
            Step marked complete. Return to your guidance journey to continue.
          </div>
        ) : (
          <Button
            className="min-h-[44px] w-full"
            onClick={handleMarkReviewed}
            disabled={completing}
          >
            {completing ? 'Saving...' : 'Mark guidance reviewed'}
          </Button>
        )}
      </ScenarioInputCard>
    </MobilePageContainer>
  );
}
