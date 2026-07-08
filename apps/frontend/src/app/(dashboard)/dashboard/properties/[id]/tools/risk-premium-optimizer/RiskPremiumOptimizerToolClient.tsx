'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import ToolExplainerSection from '@/components/tool-explainer/ToolExplainerSection';
import CompareTemplate from '../../components/route-templates/CompareTemplate';
import { track } from '@/lib/analytics/events';

export default function RiskPremiumOptimizerToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'risk-premium-optimizer', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  return (
    <CompareTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      title="Risk-to-Premium Optimizer"
      subtitle="Lower premium pressure without increasing risk."
      rail={<HomeToolsRail propertyId={propertyId} />}
      trust={{
        confidenceLabel: 'Medium confidence, improves with current property and premium records',
        freshnessLabel: 'Updates whenever premium drivers or property context changes',
        sourceLabel: 'Property profile + risk signals + premium pressure factors',
        rationale: 'Optimizer prioritizes explainable actions that preserve protection while reducing premium pressure.',
      }}
      summary={<ToolExplainerSection toolKey="riskToPremiumOptimizer" id="how-it-works" />}
      compareContent={<RiskPremiumOptimizerPanel propertyId={propertyId} />}
    />
  );
}
