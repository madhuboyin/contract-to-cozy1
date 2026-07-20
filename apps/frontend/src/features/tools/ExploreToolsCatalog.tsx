'use client';

import React from 'react';
import { Search } from 'lucide-react';
import type { ToolDiscoveryAvailabilityDTO } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ExpandableSummaryCard,
  MobileSection,
  QuickActionGrid,
  QuickActionTile,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { track } from '@/lib/analytics/events';
import {
  evaluateToolReadiness,
  getDiscoverableTools,
  TOOL_OUTCOME_CATEGORIES,
  type ToolDiscoveryContext,
  type ToolLaunchContext,
} from './toolDiscoveryRegistry';

export function ExploreToolsCatalog({
  propertyId,
  availability,
  context,
  launchContext,
}: {
  propertyId?: string;
  availability?: ToolDiscoveryAvailabilityDTO;
  context?: ToolDiscoveryContext;
  launchContext?: Omit<ToolLaunchContext, 'launchSurface'>;
}) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const tools = React.useMemo(
    () => getDiscoverableTools({ availability }),
    [availability],
  );
  const groupedTools = TOOL_OUTCOME_CATEGORIES.map((category) => ({
    ...category,
    items: tools.filter((tool) => {
      if (tool.outcomeCategory !== category.key) return false;
      if (!normalizedQuery) return true;
      return `${tool.label} ${tool.description} ${category.title}`.toLowerCase().includes(normalizedQuery);
    }),
  })).filter((group) => group.items.length > 0);
  const visibleTools = groupedTools.flatMap((group) => group.items);

  React.useEffect(() => {
    if (tools.length === 0) return;
    track('tool_discovery_impression', {
      propertyId,
      surface: 'explore_tools',
      toolIds: tools.map((tool) => tool.id),
    });
  }, [propertyId, tools]);

  React.useEffect(() => {
    if (normalizedQuery.length < 2) return;
    const timeoutId = window.setTimeout(() => {
      track('tool_discovery_catalog_searched', {
        propertyId,
        queryLength: normalizedQuery.length,
        resultCount: visibleTools.length,
      });
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [normalizedQuery, propertyId, visibleTools.length]);

  return (
    <>
      <MobileSection className="space-y-3">
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
              {group.items.map((tool, index) => {
                const ToolIcon = tool.icon;
                const readiness = evaluateToolReadiness(tool, context ?? { propertyId }, availability);
                return (
                  <QuickActionTile
                    key={tool.id}
                    title={tool.label}
                    subtitle={`${tool.description}${readiness.state === 'NEEDS_CONTEXT' ? ` · ${readiness.reasons[0]}` : ''}`}
                    icon={<ToolIcon className="h-5 w-5" />}
                    href={tool.buildHref(propertyId, {
                      launchSurface: 'explore_tools',
                      ...launchContext,
                    })}
                    onClick={() => track('tool_discovery_clicked', {
                      propertyId,
                      surface: 'explore_tools',
                      toolId: tool.id,
                      position: index,
                      recommendationReason: launchContext?.recommendationReason,
                      contextVersion: launchContext?.contextVersion,
                      sourceActionId: launchContext?.sourceActionId,
                    })}
                    badgeLabel={readiness.state === 'READY' ? '' : 'More context helps'}
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
    </>
  );
}
