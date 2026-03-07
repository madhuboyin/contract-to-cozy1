'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
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
import { MOBILE_HOME_TOOL_LINKS } from '@/components/mobile/dashboard/mobileToolCatalog';

function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string
): string {
  if (propertyId) {
    return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  }

  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

const HOME_TOOL_GROUPS = [
  {
    key: 'ownership',
    title: 'Ownership Strategy',
    summary: 'Tax, cost, and hold/sell/rent planning',
    toolKeys: [
      'property-tax',
      'cost-growth',
      'insurance-trend',
      'cost-explainer',
      'true-cost',
      'sell-hold-rent',
      'cost-volatility',
      'break-even',
    ],
  },
  {
    key: 'timeline',
    title: 'Readiness + Timeline',
    summary: 'Capital planning, prep, and timeline execution',
    toolKeys: ['capital-timeline', 'seller-prep', 'home-timeline', 'status-board'],
  },
] as const;

const HOME_TOOL_TILE_META: Record<string, { subtitle: string; icon: string }> = {
  'property-tax': { subtitle: 'Forecast annual tax drag', icon: '🏛️' },
  'cost-growth': { subtitle: 'Model ownership cost trend', icon: '📈' },
  'insurance-trend': { subtitle: 'Track premium pressure', icon: '🛡️' },
  'cost-explainer': { subtitle: 'Understand what drives costs', icon: '🧮' },
  'true-cost': { subtitle: 'View full ownership cost', icon: '💵' },
  'sell-hold-rent': { subtitle: 'Compare next-step scenarios', icon: '⚖️' },
  'cost-volatility': { subtitle: 'Measure cost variability', icon: '📊' },
  'break-even': { subtitle: 'Estimate decision break-even', icon: '🎯' },
  'capital-timeline': { subtitle: 'Plan major capital events', icon: '🧳' },
  'seller-prep': { subtitle: 'Prep high-ROI improvements', icon: '🧰' },
  'home-timeline': { subtitle: 'Track milestones over time', icon: '🗓️' },
  'status-board': { subtitle: 'Monitor home status signals', icon: '🧭' },
};

export default function HomeToolsPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;
  const toolByKey = new Map(MOBILE_HOME_TOOL_LINKS.map((tool) => [tool.key, tool]));

  const groupedTools = HOME_TOOL_GROUPS.map((group) => ({
    ...group,
    items: group.toolKeys
      .map((toolKey) => toolByKey.get(toolKey))
      .filter((tool): tool is (typeof MOBILE_HOME_TOOL_LINKS)[number] => Boolean(tool)),
  })).filter((group) => group.items.length > 0);

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24">
      <MobileSection>
        <MobileSectionHeader title="Home Tools" subtitle="Ownership planning tools for your property" />
      </MobileSection>

      {groupedTools.map((group) => (
        <MobileSection key={group.key}>
          <ExpandableSummaryCard
            title={group.title}
            summary={group.summary}
            metric={`${group.items.length} tools`}
            defaultOpen
          >
            <QuickActionGrid className="gap-2.5">
              {group.items.map((tool) => {
                const meta = HOME_TOOL_TILE_META[tool.key];
                return (
                  <QuickActionTile
                    key={tool.key}
                    title={tool.name}
                    subtitle={meta?.subtitle || 'Open tool'}
                    icon={meta?.icon || '🧩'}
                    trailingIcon={meta?.icon || '🧩'}
                    href={buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget)}
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
            Back to Dashboard
          </Link>
        </SummaryCard>
      </MobileSection>
    </MobilePageContainer>
  );
}
