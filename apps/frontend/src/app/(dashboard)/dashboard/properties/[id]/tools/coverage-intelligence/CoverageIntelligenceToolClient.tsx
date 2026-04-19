'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import { track } from '@/lib/analytics/events';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import { coverageLoopTrust } from '@/lib/trust/trustPresets';
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

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'coverage-intelligence', propertyId, entryPoint: isGuidanceContext ? 'guidance' : 'direct' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const backHref = isGuidanceContext
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;
  const trust = coverageLoopTrust({
    confidenceLabel: 'Medium-High, based on linked policy and inventory signals',
    freshnessLabel: 'Updates when coverage documents, warranties, or inventory change',
    sourceLabel: 'CtC coverage graph + property inventory + policy metadata',
  });

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      eyebrow="Home Tool"
      title="Coverage Intelligence"
      subtitle="Insurance and warranty coverage assessment for this property."
      trust={trust}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
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
