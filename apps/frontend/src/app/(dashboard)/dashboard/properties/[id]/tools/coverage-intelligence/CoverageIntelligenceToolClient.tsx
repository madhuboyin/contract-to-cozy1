'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, { openToolExplainer } from '@/components/tool-explainer/ToolExplainerSection';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import PropertyOrchestrationStrip from '@/components/orchestration/PropertyOrchestrationStrip';

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');

  // When the user arrives from a guidance step, suppress property-wide widgets
  // (orchestration strip, "Where This Tool Fits" panel, tool explainer) and
  // surface the coverage tool immediately. Standalone page behaviour is unchanged.
  const isGuidanceContext = Boolean(guidanceJourneyId);

  const backHref = isGuidanceContext
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {isGuidanceContext ? 'Back to guidance' : 'Back to property'}
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Coverage Intelligence"
        subtitle="Insurance and warranty coverage assessment for this property."
        action={
          !isGuidanceContext ? (
            <Button
              variant="outline"
              className="min-h-[44px] lg:hidden"
              onClick={() =>
                openToolExplainer({
                  id: 'how-it-works',
                  toolKey: 'coverageIntelligence',
                })
              }
            >
              Learn how it works
            </Button>
          ) : undefined
        }
      />

      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      {/* Standalone-only widgets — hidden when arriving from a guidance step */}
      {!isGuidanceContext && (
        <>
          <PropertyOrchestrationStrip propertyId={propertyId} contextTool="coverage-intelligence" />

          <GuidanceInlinePanel
            propertyId={propertyId}
            title="Where This Tool Fits"
            subtitle="Coverage Intelligence is part of active guidance journeys. Complete the next required step after review."
            toolKey="coverage-intelligence"
            limit={1}
            journeyId={guidanceJourneyId}
          />

          <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />
        </>
      )}

      {/* Core tool content — always shown; surfaced immediately in guidance context */}
      <CoverageIntelligencePanel propertyId={propertyId} />

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark coverage review complete"
      />
    </MobilePageContainer>
  );
}
