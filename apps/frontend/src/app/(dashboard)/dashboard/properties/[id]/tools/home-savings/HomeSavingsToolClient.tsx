'use client';

import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

export default function HomeSavingsToolClient() {
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
      title="Home Savings Check"
      subtitle="See where you may be overpaying and compare practical savings opportunities."
      trust={{
        confidenceLabel: 'Medium, based on linked utility, service, and maintenance context',
        freshnessLabel: 'Updated when cost inputs or service recommendations change',
        sourceLabel: 'CtC savings model + property profile + tool-derived spend patterns',
        rationale: 'Savings recommendations prioritize realistic, actionable changes with measurable downside protection.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >

      <div id="home-savings-opportunities">
        <HomeSavingsCheckPanel propertyId={propertyId} />
      </div>

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark savings review complete"
      />
    </ToolWorkspaceTemplate>
  );
}
