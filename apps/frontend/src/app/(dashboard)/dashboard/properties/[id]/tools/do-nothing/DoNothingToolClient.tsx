'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import { track } from '@/lib/analytics/events';

export default function DoNothingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const backHref = `/dashboard/properties/${propertyId}`;

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'do-nothing', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

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
      <ToolExplainerSection toolKey="doNothingSimulator" id="how-it-works" />

      <DoNothingSimulatorPanel propertyId={propertyId} />
    </ToolWorkspaceTemplate>
  );
}
