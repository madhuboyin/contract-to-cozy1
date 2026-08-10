'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import {
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { ExploreToolsCatalog } from '@/features/tools/ExploreToolsCatalog';
import { contextFromUnifiedHome } from '@/features/tools/toolDiscoveryRegistry';
import { api } from '@/lib/api/client';

export default function HomeToolsPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const allowedToolIds = useMemo(() => {
    const raw = searchParams.get('toolIds');
    return raw ? [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))] : undefined;
  }, [searchParams]);
  const isPropertyToolSet = Boolean(allowedToolIds?.length);
  // An explicit deep link must not silently switch to the globally selected home.
  const resolvedPropertyId = propertyIdFromQuery || selectedPropertyId;
  const propertyFallbackBackHref = '/dashboard';
  const backHref = resolveDashboardBackHref(searchParams.get('backTo'), propertyFallbackBackHref);
  const backLabel = backHref === '/dashboard' ? 'Back to Home' : 'Back to previous page';
  const homeQuery = useQuery({
    queryKey: ['unified-home', resolvedPropertyId, 'tool-discovery-context'],
    queryFn: () => api.getUnifiedHome(resolvedPropertyId!),
    enabled: Boolean(resolvedPropertyId),
    staleTime: 2 * 60 * 1000,
  });

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection className="space-y-3">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <MobilePageIntro
          title={isPropertyToolSet ? 'Property tools' : 'Explore tools'}
          subtitle={isPropertyToolSet
            ? 'Tools strongly connected to this property record, its systems, spaces, documents, and history'
            : 'Decision, planning, protection, and home-intelligence tools in one place'}
        />
      </MobileSection>

      <ExploreToolsCatalog
        propertyId={resolvedPropertyId}
        context={homeQuery.data ? contextFromUnifiedHome(homeQuery.data) : { propertyId: resolvedPropertyId }}
        launchContext={{
          journeyId: guidanceJourneyId,
          guidanceStepKey,
          guidanceSignalIntentFamily,
          itemId,
          contextVersion: homeQuery.data?.propertyContext.contextVersion,
        }}
        allowedToolIds={allowedToolIds}
      />

      <MobileSection>
        <SummaryCard title="Return to your home" subtitle="Your ranked actions remain the primary place to decide what to do next.">
          <Link
            href="/dashboard"
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            <LayoutGrid className="h-4 w-4" />
            Open dashboard
          </Link>
        </SummaryCard>
      </MobileSection>
    </MobilePageContainer>
  );
}
