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
    key: 'monitoring',
    title: 'Monitoring + Awareness',
    summary: 'Live events and signals matched to your specific home',
    toolKeys: ['home-event-radar'],
  },
  {
    key: 'history',
    title: 'History + Replay',
    summary: 'See what your home has already been through',
    toolKeys: ['home-risk-replay'],
  },
  {
    key: 'negotiation',
    title: 'Negotiation + Review',
    summary: 'Quote and premium review with response-ready guidance',
    toolKeys: ['service-price-radar', 'negotiation-shield'],
  },
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
    key: 'renovation',
    title: 'Renovation Planning',
    summary: 'Understand permit, tax, and contractor requirements before starting a project.',
    toolKeys: ['home-renovation-risk-advisor'],
  },
  {
    key: 'timeline',
    title: 'Readiness + Timeline',
    summary: 'Capital planning, prep, and timeline execution',
    toolKeys: ['capital-timeline', 'seller-prep', 'home-timeline', 'status-board'],
  },
  {
    key: 'habits',
    title: 'Home Habits',
    summary: 'Seasonal care routines, safety checks, and maintenance habits',
    toolKeys: ['home-habit-coach'],
  },
] as const;

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
    <MobilePageContainer className="space-y-7 pt-2 pb-24 lg:max-w-7xl lg:px-8 lg:pb-10">
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
                const ToolIcon = tool.icon;
                return (
                  <QuickActionTile
                    key={tool.key}
                    title={tool.name}
                    subtitle={tool.description || 'Open tool'}
                    icon={<ToolIcon className="h-5 w-5" />}
                    trailingIcon={<ToolIcon className="h-5 w-5" />}
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
