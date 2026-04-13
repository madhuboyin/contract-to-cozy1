'use client';

import { useParams } from 'next/navigation';
import HomeToolsRail from '../../components/HomeToolsRail';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, { openToolExplainer } from '@/components/tool-explainer/ToolExplainerSection';
import CompareTemplate from '../../components/route-templates/CompareTemplate';

export default function RiskPremiumOptimizerToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

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
        sourceLabel: 'Property profile + risk signals + modeled premium pressure factors',
        rationale: 'Optimizer prioritizes explainable actions that preserve protection while reducing premium pressure.',
      }}
      priorityAction={{
        title: 'Review your highest premium pressure lever',
        description: 'Start with one mitigation lever, then compare premium impact before applying changes.',
        impactLabel: 'Potential premium relief',
        confidenceLabel: 'Medium',
        primaryAction: (
          <Button
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
            onClick={() =>
              openToolExplainer({
                id: 'how-it-works',
                toolKey: 'riskToPremiumOptimizer',
              })
            }
          >
            Learn how it works
          </Button>
        ),
      }}
      summary={<ToolExplainerSection toolKey="riskToPremiumOptimizer" id="how-it-works" />}
      compareContent={<RiskPremiumOptimizerPanel propertyId={propertyId} />}
    />
  );
}
