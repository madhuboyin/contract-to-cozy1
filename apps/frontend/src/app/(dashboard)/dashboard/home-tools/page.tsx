'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LayoutGrid, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getDiscoverableTools, TOOL_OUTCOME_CATEGORIES } from '@/features/tools/toolDiscoveryRegistry';

function appendGuidanceContext(
  href: string,
  guidanceContext: {
    guidanceJourneyId?: string;
    guidanceStepKey?: string;
    guidanceSignalIntentFamily?: string;
    itemId?: string;
  },
): string {
  const queryParams = new URLSearchParams();
  if (guidanceContext?.guidanceJourneyId) queryParams.set('guidanceJourneyId', guidanceContext.guidanceJourneyId);
  if (guidanceContext?.guidanceStepKey) queryParams.set('guidanceStepKey', guidanceContext.guidanceStepKey);
  if (guidanceContext?.guidanceSignalIntentFamily) queryParams.set('guidanceSignalIntentFamily', guidanceContext.guidanceSignalIntentFamily);
  if (guidanceContext?.itemId) queryParams.set('itemId', guidanceContext.itemId);
  const suffix = queryParams.toString();

  if (!suffix) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${suffix}`;
}

const DISCOVERABLE_TOOLS = getDiscoverableTools();

export default function HomeToolsPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState('');
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const itemId = searchParams.get('itemId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;
  const propertyFallbackBackHref = '/dashboard';
  const backHref = resolveDashboardBackHref(searchParams.get('backTo'), propertyFallbackBackHref);
  const backLabel = backHref === '/dashboard' ? 'Back to Home' : 'Back to previous page';
  const normalizedQuery = query.trim().toLowerCase();
  const groupedTools = TOOL_OUTCOME_CATEGORIES.map((category) => ({
    ...category,
    items: DISCOVERABLE_TOOLS.filter((tool) => {
      if (tool.outcomeCategory !== category.key) return false;
      if (!normalizedQuery) return true;
      return `${tool.label} ${tool.description} ${category.title}`.toLowerCase().includes(normalizedQuery);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <MobilePageContainer className="space-y-7 pt-2 pb-24 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection className="space-y-3">
        <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <MobilePageIntro title="Explore tools" subtitle="Decision, planning, protection, and home-intelligence tools in one place" />
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools by goal or outcome"
            aria-label="Search home tools"
            className="min-h-[44px] pl-9"
          />
        </div>
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
                    key={tool.id}
                    title={tool.label}
                    subtitle={tool.description || 'Open tool'}
                    icon={<ToolIcon className="h-5 w-5" />}
                    href={appendGuidanceContext(tool.buildHref(resolvedPropertyId), {
                      guidanceJourneyId,
                      guidanceStepKey,
                      guidanceSignalIntentFamily,
                      itemId,
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

      {groupedTools.length === 0 && (
        <MobileSection>
          <SummaryCard title="No matching tools" subtitle="Try a broader goal such as cost, coverage, maintenance, risk, or project.">
            <Button variant="outline" onClick={() => setQuery('')}>Clear search</Button>
          </SummaryCard>
        </MobileSection>
      )}

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
