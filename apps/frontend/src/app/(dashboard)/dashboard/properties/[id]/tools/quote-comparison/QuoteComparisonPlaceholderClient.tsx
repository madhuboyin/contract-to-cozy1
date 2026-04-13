'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Wrench } from 'lucide-react';
import {
  ActionPriorityRow,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import HomeToolsRail from '../../components/HomeToolsRail';
import CompareTemplate from '../../components/route-templates/CompareTemplate';

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
    <CompareTemplate
      backHref={backHref}
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      title="Quote Comparison Workspace"
      subtitle="Side-by-side quote review flow for vendor decisions and negotiation prep."
      rail={<HomeToolsRail propertyId={propertyId} context="quote-comparison" currentToolId="quote-comparison" />}
      trust={{
        confidenceLabel: 'Medium while workspace is in phased rollout',
        freshnessLabel: 'Uses current quote context from connected guidance tools',
        sourceLabel: 'Service Price Radar + Negotiation Shield case context',
        rationale: 'Comparison sequence keeps decision-making and negotiation steps in a single structured flow.',
      }}
      priorityAction={{
        title: 'Move accepted quote context into final pricing',
        description: 'Use Price Finalization as the primary decision step so booking inherits the final number, vendor, and terms.',
        impactLabel: 'Cleaner handoff into booking',
        confidenceLabel: 'Confidence improves after Service Price Radar + Negotiation Shield review',
        primaryAction: (
          <Link
            href={`/dashboard/properties/${propertyId}/tools/price-finalization${contextQuery}`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-black/90"
          >
            Continue to Price Finalization
          </Link>
        ),
        supportingAction: (
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
            >
              Open Service Price Radar
            </Link>
            <Link
              href={`/dashboard/properties/${propertyId}/tools/negotiation-shield${contextQuery}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
            >
              Open Negotiation Shield
            </Link>
          </div>
        ),
      }}
      summary={
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
        </ScenarioInputCard>
      }
      compareContent={
        <ActionPriorityRow
          primaryAction={
            <p className="mb-0 w-full rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-center text-sm text-slate-700">
              Primary action is pinned above. Use alternate workspaces below as needed.
            </p>
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
      }
      footer={
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
      }
    />
  );
}
