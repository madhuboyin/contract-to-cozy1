'use client';

import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, { openToolExplainer } from '@/components/tool-explainer/ToolExplainerSection';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

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
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      eyebrow="Home Tool"
      title="Coverage Intelligence"
      subtitle="Insurance and warranty coverage assessment for this property."
      trust={{
        confidenceLabel: 'Medium-High, based on linked policy and inventory signals',
        freshnessLabel: 'Updates when coverage documents, warranties, or inventory change',
        sourceLabel: 'CtC coverage graph + property inventory + policy metadata',
        rationale: 'Coverage gaps are prioritized by uncovered exposure, expiration state, and room context.',
      }}
      rail={<HomeToolsRail propertyId={propertyId} />}
      introAction={
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
    >

      {/* Standalone-only widgets — hidden when arriving from a guidance step */}
      {!isGuidanceContext && (
        <>
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
    </ToolWorkspaceTemplate>
  );
}
