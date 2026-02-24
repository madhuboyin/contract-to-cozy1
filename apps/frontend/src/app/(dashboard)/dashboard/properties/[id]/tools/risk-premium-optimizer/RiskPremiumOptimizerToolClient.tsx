'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, {
  openToolExplainer,
} from '@/components/tool-explainer/ToolExplainerSection';

export default function RiskPremiumOptimizerToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="🧭"
        title="Risk-to-Premium Optimizer"
        description="Lower premium pressure without increasing risk."
        action={(
          <Button
            variant="link"
            className="h-auto p-0 text-sm text-brand-primary"
            onClick={() =>
              openToolExplainer({
                id: 'how-it-works',
                toolKey: 'riskToPremiumOptimizer',
              })
            }
          >
            Learn how it works
          </Button>
        )}
      />

      <HomeToolsRail propertyId={propertyId} />

      <ToolExplainerSection toolKey="riskToPremiumOptimizer" id="how-it-works" />

      <RiskPremiumOptimizerPanel propertyId={propertyId} />
    </div>
  );
}
