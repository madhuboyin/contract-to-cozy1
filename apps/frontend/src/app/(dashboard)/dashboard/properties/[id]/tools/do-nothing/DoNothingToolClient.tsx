'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

export default function DoNothingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const backHref = `/dashboard/properties/${propertyId}`;

  useEffect(() => {
    if (!propertyId || !guidanceJourneyId) return;
    const query = searchParams.toString();
    router.replace(
      `/dashboard/properties/${propertyId}/guidance/step${query ? `?${query}` : ''}`
    );
  }, [guidanceJourneyId, propertyId, router, searchParams]);

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Do-Nothing Simulator"
      subtitle="See risk and cost impact if you delay action for 6, 12, 24, or 36 months."
      trust={{
        confidenceLabel: 'Medium, scenario-based cost and risk projections',
        freshnessLabel: 'Updates when property risk or maintenance context changes',
        sourceLabel: 'Delay-impact analysis + property context + risk signals',
        rationale: 'Shows likely cost escalation and risk compounding when recommended actions are deferred.',
      }}
      introAction={
        <HomeToolsRail propertyId={propertyId} showDesktop={false} />
      }
    >
      {guidanceJourneyId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          Redirecting to the guided step…
        </div>
      ) : null}

      {!guidanceJourneyId ? (
        <ToolExplainerSection toolKey="doNothingSimulator" id="how-it-works" />
      ) : null}

      {!guidanceJourneyId ? <DoNothingSimulatorPanel propertyId={propertyId} /> : null}
    </ToolWorkspaceTemplate>
  );
}
