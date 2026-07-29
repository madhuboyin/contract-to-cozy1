'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft, Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import HomeModificationAdvisor from '@/components/HomeModificationAdvisor';
import { Button } from '@/components/ui/button';
import { MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';
import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';

export default function RenovationExplorePage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
      <Button
        variant="link"
        className="h-auto p-0 text-sm text-muted-foreground"
        onClick={() => navigateBackWithDashboardFallback(router)}
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <MobilePageIntro
        title="Explore Home Upgrades"
        subtitle="Compare property-aware options. Nothing becomes a renovation plan until you explicitly select it."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <Lightbulb className="h-5 w-5" />
          </div>
        }
      />
      <HomeModificationAdvisor propertyId={propertyId} />
    </div>
  );
}
