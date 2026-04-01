'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import HomeToolsRail from '../../components/HomeToolsRail';

function buildQuery(searchParams: URLSearchParams): string {
  const keys = [
    'guidanceJourneyId',
    'guidanceStepKey',
    'guidanceSignalIntentFamily',
    'itemId',
    'homeAssetId',
    'serviceCategory',
    'vendorName',
    'quoteAmount',
    'quoteComparisonWorkspaceId',
    'serviceRadarCheckId',
    'negotiationShieldCaseId',
  ] as const;

  const query = new URLSearchParams();
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export default function QuoteComparisonPlaceholderClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const contextQuery = buildQuery(searchParams);
  const isGuidanceContext = Boolean(guidanceJourneyId);

  const backHref = isGuidanceContext
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isGuidanceContext ? 'Back to guidance' : 'Back to property'}
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Quote Comparison Workspace"
        subtitle="Placeholder surface for side-by-side vendor comparison while we complete full workspace capabilities."
      />

      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} context="quote-comparison" currentToolId="quote-comparison" />
      </MobileFilterSurface>

      <ScenarioInputCard
        title="What you can do in this placeholder"
        subtitle="Use this step to keep guidance flows moving while workspace build-out continues."
        badge={
          <StatusChip tone="info">
            <Wrench className="mr-1 h-3.5 w-3.5" />
            Placeholder
          </StatusChip>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p className="mb-0">1. Validate each quote in Service Price Radar.</p>
          <p className="mb-0">2. Use Negotiation Shield for response strategy when needed.</p>
          <p className="mb-0">3. Continue to Price Finalization to capture accepted terms.</p>
        </div>

        <ActionPriorityRow
          primaryAction={
            <Link
              href={`/dashboard/properties/${propertyId}/tools/price-finalization${contextQuery}`}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm text-white hover:bg-black/90"
            >
              Continue to Price Finalization
            </Link>
          }
          secondaryActions={
            <div className="flex w-full flex-wrap gap-2">
              <Link
                href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
                className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
              >
                Open Service Price Radar
              </Link>
              <Link
                href={`/dashboard/properties/${propertyId}/tools/negotiation-shield${contextQuery}`}
                className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
              >
                Open Negotiation Shield
              </Link>
            </div>
          }
        />
      </ScenarioInputCard>

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark quote comparison reviewed"
        producedData={{
          signalIntentFamily: guidanceSignalIntentFamily ?? null,
          placeholder: true,
          reviewedAt: new Date().toISOString(),
        }}
      />
    </MobilePageContainer>
  );
}
