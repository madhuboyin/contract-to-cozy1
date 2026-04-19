'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  ExpandableSummaryCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  QuickActionGrid,
  QuickActionTile,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  MOBILE_AI_TOOL_CATALOG,
  MOBILE_AI_TOOL_GROUPS,
} from '@/components/mobile/dashboard/mobileToolCatalog';

function buildAiToolHref(
  propertyId: string | undefined,
  toolHref: string,
  guidanceContext?: {
    guidanceJourneyId?: string;
    guidanceStepKey?: string;
    guidanceSignalIntentFamily?: string;
    itemId?: string;
    homeAssetId?: string;
  }
): string {
  const queryParams = new URLSearchParams();
  if (propertyId) queryParams.set('propertyId', propertyId);
  if (guidanceContext?.guidanceJourneyId) queryParams.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
  if (guidanceContext?.guidanceStepKey) queryParams.set('guidanceStepKey', guidanceContext.guidanceStepKey);
  if (guidanceContext?.guidanceSignalIntentFamily) queryParams.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
  if (guidanceContext?.itemId) queryParams.set('itemId', guidanceContext.itemId);
  if (guidanceContext?.homeAssetId) queryParams.set('homeAssetId', guidanceContext.homeAssetId);
  const suffix = queryParams.toString();
  if (!suffix) return toolHref;
  return toolHref.includes('?') ? `${toolHref}&${suffix}` : `${toolHref}?${suffix}`;
}

export default function AIToolsPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const homeAssetId = searchParams.get('homeAssetId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;

  const tools = MOBILE_AI_TOOL_CATALOG.filter((tool) => tool.key !== 'view-all');
  const groupedTools = MOBILE_AI_TOOL_GROUPS.map((group) => ({
    ...group,
    items: tools.filter((tool) => tool.group === group.key),
  })).filter((group) => group.items.length > 0);

  const dailySnapshotHref = `/dashboard/daily-snapshot${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`;
  const riskRadarHref = resolvedPropertyId
    ? `/dashboard/properties/${encodeURIComponent(resolvedPropertyId)}/risk-assessment`
    : '/dashboard/risk-radar';

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24 lg:max-w-7xl lg:space-y-8 lg:px-8 lg:pt-4 lg:pb-10">
      <MobileSection>
        <MobileSectionHeader title="AI Tools" subtitle="Smart decision support for your home" />
      </MobileSection>

      {groupedTools.map((group) => (
        <MobileSection key={group.key}>
          <ExpandableSummaryCard
            title={group.title}
            summary={group.summary}
            metric={`${group.items.length} tools`}
            defaultOpen
          >
            <QuickActionGrid className="gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((tool) => (
                (() => {
                  const ToolIcon = tool.icon;
                  return (
                    <QuickActionTile
                      key={tool.key}
                      title={tool.title}
                      subtitle={tool.description}
                      icon={<ToolIcon className="h-5 w-5" />}
                      trailingIcon={<ToolIcon className="h-5 w-5" />}
                      artworkSrc={tool.artworkSrc}
                      href={buildAiToolHref(resolvedPropertyId, tool.href, {
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
                })()
              ))}
            </QuickActionGrid>
          </ExpandableSummaryCard>
        </MobileSection>
      ))}

      <MobileSection>
        <SummaryCard title="Intelligence Details" subtitle="Deep-dive pages from mobile home intelligence">
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <Link
              href={dailySnapshotHref}
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              Daily Snapshot
            </Link>
            <Link
              href={riskRadarHref}
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
            >
              Risk Radar
            </Link>
          </div>
        </SummaryCard>
      </MobileSection>

      <MobileSection>
        <SummaryCard
          title="Need broader navigation?"
          subtitle="Use the More tab in bottom navigation for all pages and tools."
        >
          <Link
            href="/dashboard"
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            <Sparkles className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </SummaryCard>
      </MobileSection>
    </MobilePageContainer>
  );
}
