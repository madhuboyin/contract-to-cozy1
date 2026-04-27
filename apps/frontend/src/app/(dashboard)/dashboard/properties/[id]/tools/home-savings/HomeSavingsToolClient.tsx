'use client';

import { useParams, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function HomeSavingsToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const expectedMonthly = Number(searchParams.get('expectedMonthly') ?? 0);
  const expectedAnnual = Number(searchParams.get('expectedAnnual') ?? 0);
  const highlightOpportunities = searchParams.get('highlight') === 'opportunities';

  const backHref = guidanceJourneyId
    ? `/dashboard/properties/${propertyId}/tools/guidance-overview?journeyId=${guidanceJourneyId}`
    : `/dashboard/properties/${propertyId}`;

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel={guidanceJourneyId ? 'Back to guidance' : 'Back to property'}
      eyebrow="Home tool"
      title="Home Savings Check"
      subtitle="See where you may be overpaying and compare practical savings opportunities."
      trust={{
        confidenceLabel: 'Medium, based on linked utility, service, and maintenance context',
        freshnessLabel: 'Updated when cost inputs or service recommendations change',
        sourceLabel: 'Savings analysis + property profile + tool-derived spend patterns',
        rationale: 'Savings recommendations prioritize realistic, actionable changes with measurable downside protection.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >

      {highlightOpportunities && expectedMonthly > 0 && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          Your profile shows up to{' '}
          <span className="font-semibold">{formatMoney(expectedMonthly)}/mo</span>
          {expectedAnnual > 0 && (
            <> ({formatMoney(expectedAnnual)}/yr)</>
          )}{' '}
          in potential savings. Review the opportunities below.
        </div>
      )}

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
