'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { Button } from '@/components/ui/button';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceStepCompletionCard } from '@/components/guidance/GuidanceStepCompletionCard';

export default function HomeSavingsToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow="Home Tool"
        title="Home Savings Check"
        subtitle="See where you may be overpaying and compare simple savings opportunities."
       className="lg:hidden"/>

      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      <HomeSavingsCheckPanel propertyId={propertyId} />

      <GuidanceStepCompletionCard
        propertyId={propertyId}
        guidanceStepKey={guidanceStepKey}
        guidanceJourneyId={guidanceJourneyId}
        actionLabel="Mark savings review complete"
      />
    </MobilePageContainer>
  );
}
