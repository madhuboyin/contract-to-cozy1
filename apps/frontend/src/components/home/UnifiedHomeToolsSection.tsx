'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ToolDiscoveryAvailabilityDTO, UnifiedHomeDTO } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import { getDiscoverableTool } from '@/features/tools/toolDiscoveryRegistry';
import {
  selectUnifiedHomeTools,
  UNIFIED_HOME_TOOL_RULE_VERSION,
} from '@/features/tools/selectUnifiedHomeTools';

export function UnifiedHomeToolsSection({
  home,
  propertyId,
  availability,
}: {
  home: UnifiedHomeDTO;
  propertyId: string;
  availability?: ToolDiscoveryAvailabilityDTO;
}) {
  const recommendations = React.useMemo(
    () => selectUnifiedHomeTools(home, 3, availability),
    [availability, home],
  );
  const recommendationKey = recommendations.map((item) => `${item.toolId}:${item.reasonCode}`).join('|');

  React.useEffect(() => {
    if (recommendations.length === 0) return;
    track('tool_discovery_impression', {
      propertyId,
      surface: 'unified_home',
      toolIds: recommendations.map((item) => item.toolId),
      recommendationReasons: recommendations.map((item) => item.reasonCode),
      contextVersion: home.propertyContext.contextVersion,
    });
  }, [home.propertyContext.contextVersion, propertyId, recommendationKey, recommendations]);

  if (availability?.enabled === false || recommendations.length === 0) return null;

  const exploreToolsHref = `/dashboard/home-tools?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent('/dashboard')}`;

  return (
    <section aria-labelledby="home-tools-heading" className="rounded-[24px] border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/60 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="home-tools-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Sparkles className="h-5 w-5 text-indigo-600" />Tools for this home
          </h2>
          <p className="mt-1 text-sm text-slate-500">Useful next steps selected from this home’s ranked actions and current record.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit rounded-full bg-white">
          <Link href={exploreToolsHref}>Explore all tools<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {recommendations.map((recommendation, index) => {
          const tool = getDiscoverableTool(recommendation.toolId);
          if (!tool) return null;
          const ToolIcon = tool.icon;
          const href = tool.buildHref(propertyId, {
            launchSurface: 'unified_home',
            sourceActionId: recommendation.sourceActionId,
            sourceEntityType: recommendation.sourceEntityType,
            sourceEntityId: recommendation.sourceEntityId,
            contextVersion: home.propertyContext.contextVersion,
            recommendationReason: `${UNIFIED_HOME_TOOL_RULE_VERSION}:${recommendation.reasonCode}`,
            journeyId: home.activeMajorMoment?.kind === 'GUIDANCE_JOURNEY' ? home.activeMajorMoment.id : undefined,
          });

          return (
            <Link
              key={recommendation.toolId}
              href={href}
              data-testid={`unified-home-tool-${recommendation.toolId}`}
              onClick={() => {
                track('tool_discovery_clicked', {
                  propertyId,
                  surface: 'unified_home',
                  toolId: recommendation.toolId,
                  position: index,
                  recommendationReason: `${UNIFIED_HOME_TOOL_RULE_VERSION}:${recommendation.reasonCode}`,
                  contextVersion: home.propertyContext.contextVersion,
                  sourceActionId: recommendation.sourceActionId,
                  sourceEntityType: recommendation.sourceEntityType,
                  sourceEntityId: recommendation.sourceEntityId,
                });
                if (recommendation.sourceActionId) {
                  void api.recordHomeActionOpened(propertyId, recommendation.sourceActionId);
                }
              }}
              className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700"><ToolIcon className="h-5 w-5" /></div>
                <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-[10px] text-indigo-700">
                  {recommendation.readinessState === 'READY' ? 'Ready for this home' : 'Needs more context'}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold text-slate-950">{tool.label}</h3>
              <p className="mt-2 text-sm leading-5 text-slate-700">{recommendation.whyNow}</p>
              <p className="mt-2 text-sm leading-5 text-slate-500">{recommendation.outcome}</p>
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{recommendation.readiness}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
                Open tool<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
