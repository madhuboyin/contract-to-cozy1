'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, { openToolExplainer } from '@/components/tool-explainer/ToolExplainerSection';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';

export default function RiskPremiumOptimizerToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Risk-to-Premium Optimizer"
        subtitle="Lower premium pressure without increasing risk."
        action={
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() =>
              openToolExplainer({
                id: 'how-it-works',
                toolKey: 'riskToPremiumOptimizer',
              })
            }
          >
            Learn how it works
          </Button>
        }
      />

      <MobileFilterSurface>
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      <ToolExplainerSection toolKey="riskToPremiumOptimizer" id="how-it-works" />

      <RiskPremiumOptimizerPanel propertyId={propertyId} />
    </MobilePageContainer>
  );
}
