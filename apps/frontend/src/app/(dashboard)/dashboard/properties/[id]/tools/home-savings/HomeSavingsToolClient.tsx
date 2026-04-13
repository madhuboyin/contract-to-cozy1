'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import { Button } from '@/components/ui/button';
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
      priorityAction={{
        title: 'Review highest-impact savings opportunities first',
        description: 'Start with the recommendations that lower recurring home costs without increasing risk exposure.',
        impactLabel: 'Reduced monthly spend',
        confidenceLabel: 'Confidence rises with connected service and utility inputs',
        primaryAction: (
          <Button asChild className="w-full sm:w-auto">
            <Link href="#home-savings-opportunities">Jump to opportunities</Link>
          </Button>
        ),
        supportingAction: (
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/dashboard/properties/${propertyId}/tools/service-price-radar`}>
              Compare service pricing
            </Link>
          </Button>
        ),
      }}
      rail={<HomeToolsRail propertyId={propertyId} />}
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
