'use client';

import React from 'react';
import type { ElementType } from 'react';
import { Search } from 'lucide-react';
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
import { resolveCapabilityIcon } from './capabilityIconRegistry';
import {
  appendCapabilityLaunchContext,
  CAPABILITY_OUTCOME_CATEGORIES,
  capabilitySearchTerms,
  evaluateCapabilityReadiness,
} from './capabilityCatalog';
import {
  type ToolDiscoveryContext,
  type ToolLaunchContext,
} from './toolDiscoveryRegistry';
import { useCapabilityCatalog } from './useCapabilityCatalog';
import { useCapabilityImpression } from './useCapabilityImpression';

type ExploreCapability = {
  id: string;
  label: string;
  description: string;
  outcomeCategory: string;
  aliases: string[];
  searchTerms: string[];
  icon: ElementType;
  href: string;
  badgeLabel: string | null;
  readiness: { state: 'READY' | 'NEEDS_CONTEXT' | 'UNAVAILABLE'; reasons: string[] };
};

const PROPERTY_INTELLIGENCE_TOOL_IDS = new Set([
  'home-briefing',
  'home-risk-replay',
  'home-timeline',
  'neighborhood-change-radar',
  'property-brief',
]);

function ExploreCapabilityTile({
  tool,
  propertyId,
  registryVersion,
  position,
  launchContext,
}: {
  tool: ExploreCapability;
  propertyId?: string;
  registryVersion: string;
  position: number;
  launchContext?: Omit<ToolLaunchContext, 'launchSurface'>;
}) {
  const impressionRef = useCapabilityImpression<HTMLDivElement>({
    capabilityId: tool.id,
    propertyId,
    surface: 'explore_tools',
    registryVersion,
    recommendationReason: launchContext?.recommendationReason,
    recommendationVersion: launchContext?.recommendationVersion,
    contextVersion: launchContext?.contextVersion,
  });
  const ToolIcon = tool.icon;

  return (
    <div ref={impressionRef} className="space-y-1.5">
      <QuickActionTile
        title={tool.label}
        subtitle={`${tool.description}${tool.readiness.state === 'NEEDS_CONTEXT' ? ` · ${tool.readiness.reasons[0]}` : ''}`}
        icon={<ToolIcon className="h-5 w-5" />}
        href={tool.href}
        onClick={() => track('tool_discovery_clicked', {
          propertyId,
          surface: 'explore_tools',
          toolId: tool.id,
          position,
          recommendationReason: launchContext?.recommendationReason,
          recommendationVersion: launchContext?.recommendationVersion,
          contextVersion: launchContext?.contextVersion,
          sourceActionId: launchContext?.sourceActionId,
        })}
        badgeLabel={tool.readiness.state === 'READY' ? tool.badgeLabel : 'More context helps'}
        variant="compact"
      />
      {tool.aliases.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-1" aria-label={`Ways to find ${tool.label}`}>
          {tool.aliases.slice(0, 2).map((alias) => (
            <span key={alias} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              {alias}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ExploreToolsCatalog({
  propertyId,
  context,
  launchContext,
}: {
  propertyId?: string;
  context?: ToolDiscoveryContext;
  launchContext?: Omit<ToolLaunchContext, 'launchSurface'>;
}) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const catalogQuery = useCapabilityCatalog({ propertyId });
  const tools = React.useMemo<ExploreCapability[]>(
    () => (catalogQuery.data?.capabilities ?? []).map((capability) => ({
      id: capability.id,
      label: capability.label,
      description: capability.shortDescription,
      outcomeCategory: capability.outcomeCategory,
      aliases: capability.intentAliases,
      icon: resolveCapabilityIcon(capability.iconName),
      href: appendCapabilityLaunchContext(capability.href, {
        launchSurface: 'explore_tools',
        ...launchContext,
      }),
      badgeLabel: capability.badges.includes('BETA') ? 'Beta' : null,
      readiness: evaluateCapabilityReadiness(
        capability,
        context ?? { propertyId },
      ),
      searchTerms: capabilitySearchTerms(capability),
    })),
    [catalogQuery.data?.capabilities, context, launchContext, propertyId],
  );
  const matchesQuery = React.useCallback((tool: ExploreCapability, groupTitle: string) => {
    if (!normalizedQuery) return true;
    return [...tool.searchTerms, groupTitle]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
  }, [normalizedQuery]);
  const propertyIntelligenceGroup = {
    key: 'PROPERTY_INTELLIGENCE',
    title: 'Property Intelligence',
    summary: 'Move from a meaningful change to source context, action, verified history, or a selective brief.',
    items: tools.filter((tool) =>
      PROPERTY_INTELLIGENCE_TOOL_IDS.has(tool.id) && matchesQuery(tool, 'Property Intelligence')),
  };
  const outcomeGroups = CAPABILITY_OUTCOME_CATEGORIES.map((category) => ({
    ...category,
    items: tools.filter((tool) => {
      if (PROPERTY_INTELLIGENCE_TOOL_IDS.has(tool.id)) return false;
      if (tool.outcomeCategory !== category.key) return false;
      return matchesQuery(tool, category.title);
    }),
  })).filter((group) => group.items.length > 0);
  const groupedTools = [
    ...(propertyIntelligenceGroup.items.length > 0 ? [propertyIntelligenceGroup] : []),
    ...outcomeGroups,
  ];
  const visibleTools = groupedTools.flatMap((group) => group.items);

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

      {catalogQuery.isLoading ? (
        <MobileSection>
          <SummaryCard
            title="Loading tools"
            subtitle="Preparing the tools available for this home."
          >
            <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
          </SummaryCard>
        </MobileSection>
      ) : null}

      {catalogQuery.isError ? (
        <MobileSection>
          <SummaryCard
            title="Tool catalog temporarily unavailable"
            subtitle="Your ranked Home actions are still available. Try loading the tool catalog again."
          >
            <Button variant="outline" onClick={() => void catalogQuery.refetch()}>
              Try again
            </Button>
          </SummaryCard>
        </MobileSection>
      ) : null}

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
                return (
                  <ExploreCapabilityTile
                    key={tool.id}
                    tool={tool}
                    propertyId={propertyId}
                    registryVersion={catalogQuery.data?.registryVersion ?? 'canonical-unavailable'}
                    position={index}
                    launchContext={launchContext}
                  />
                );
              })}
            </QuickActionGrid>
          </ExpandableSummaryCard>
        </MobileSection>
      ))}

      {groupedTools.length === 0 && !catalogQuery.isLoading && !catalogQuery.isError && (
        <MobileSection>
          <SummaryCard title="No matching tools" subtitle="Try a broader goal such as cost, coverage, maintenance, risk, or project.">
            <Button variant="outline" onClick={() => setQuery('')}>Clear search</Button>
          </SummaryCard>
        </MobileSection>
      )}
    </>
  );
}
