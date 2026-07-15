'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';
import {
  ExpandableSummaryCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  QuickActionGrid,
  QuickActionTile,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_HOME_TOOL_GROUPS, MOBILE_HOME_TOOL_LINKS } from '@/components/mobile/dashboard/mobileToolCatalog';

function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string,
  guidanceContext?: {
    guidanceJourneyId?: string;
    guidanceStepKey?: string;
    guidanceSignalIntentFamily?: string;
    itemId?: string;
    homeAssetId?: string;
  }
): string {
  const queryParams = new URLSearchParams();
  if (guidanceContext?.guidanceJourneyId) queryParams.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
  if (guidanceContext?.guidanceStepKey) queryParams.set('guidanceStepKey', guidanceContext.guidanceStepKey);
  if (guidanceContext?.guidanceSignalIntentFamily) queryParams.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
  if (guidanceContext?.itemId) queryParams.set('itemId', guidanceContext.itemId);
  if (guidanceContext?.homeAssetId) queryParams.set('homeAssetId', guidanceContext.homeAssetId);
  const suffix = queryParams.toString();

  if (propertyId) {
    const base = `/dashboard/properties/${propertyId}/${hrefSuffix}`;
    return suffix ? `${base}${base.includes('?') ? '&' : '?'}${suffix}` : base;
  }

  const base = `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
  return suffix ? `${base}&${suffix}` : base;
}

const GROUPED_TOOLS = MOBILE_HOME_TOOL_GROUPS.map((group) => ({
  ...group,
  items: MOBILE_HOME_TOOL_LINKS.filter((tool) => tool.group === group.key && !tool.workflowOnly),
})).filter((group) => group.items.length > 0);

export default function HomeToolsPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const homeAssetId = searchParams.get('homeAssetId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;
  const propertyFallbackBackHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}`
    : '/dashboard';
  const backHref = resolveDashboardBackHref(searchParams.get('backTo'), propertyFallbackBackHref);
  const backLabel = resolvedPropertyId ? 'Back to property' : 'Back to dashboard';

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection className="space-y-3">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <MobilePageIntro title="Home tools" subtitle="Ownership planning tools for your property" />
      </MobileSection>

      {GROUPED_TOOLS.map((group) => (
        <MobileSection key={group.key}>
          <ExpandableSummaryCard
            title={group.title}
            summary={group.summary}
            metric={`${group.items.length} tools`}
            defaultOpen
          >
            <QuickActionGrid className="gap-2.5">
              {group.items.map((tool) => {
                const ToolIcon = tool.icon;
                return (
                  <QuickActionTile
                    key={tool.key}
                    title={tool.name}
                    subtitle={tool.description || 'Open tool'}
                    icon={<ToolIcon className="h-5 w-5" />}
                    href={buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget, {
                      guidanceJourneyId,
                      guidanceStepKey,
                      guidanceSignalIntentFamily,
                      itemId,
                      homeAssetId,
                    })}
                    badgeLabel=""
                    variant="compact"
                  />
                );
              })}
            </QuickActionGrid>
          </ExpandableSummaryCard>
        </MobileSection>
      ))}

      <MobileSection>
        <SummaryCard title="Need broader navigation?" subtitle="Use the More tab for full dashboard navigation.">
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
