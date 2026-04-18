'use client';

import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

export default function DoNothingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const backHref = guidanceJourneyId
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={guidanceJourneyId ? 'Back to guidance' : 'Back to property'}
      eyebrow="Home Tool"
      title="Do-Nothing Simulator"
      subtitle="See risk and cost impact if you delay action for 6, 12, 24, or 36 months."
      trust={{
        confidenceLabel: 'Medium, scenario-based cost and risk projections',
        freshnessLabel: 'Updates when property risk or maintenance context changes',
        sourceLabel: 'CtC delay-impact model + property system context + risk signals',
        rationale: 'Shows likely cost escalation and risk compounding when recommended actions are deferred.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >

      <ToolExplainerSection toolKey="doNothingSimulator" id="how-it-works" />

      <DoNothingSimulatorPanel propertyId={propertyId} />

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark delay cost reviewed"
      />
    </ToolWorkspaceTemplate>
  );
}
