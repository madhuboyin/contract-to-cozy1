'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Target, Workflow } from 'lucide-react';
import { api } from '@/lib/api/client';
import { adaptOrchestrationSummary } from '@/adapters/orchestration.adapter';
import { cn } from '@/lib/utils';

type OrchestrationToolId =
  | 'coverage-intelligence'
  | 'risk-premium-optimizer'
  | 'do-nothing'
  | 'sell-hold-rent'
  | 'break-even'
  | 'capital-timeline'
  | 'home-event-radar'
  | 'home-risk-replay'
  | 'home-timeline'
  | 'status-board';

type PropertyOrchestrationStripProps = {
  propertyId?: string | null;
  contextTool?: OrchestrationToolId;
  className?: string;
};

const NEXT_TOOL_BY_CONTEXT: Partial<Record<OrchestrationToolId, OrchestrationToolId>> = {
  'coverage-intelligence': 'risk-premium-optimizer',
  'risk-premium-optimizer': 'do-nothing',
  'do-nothing': 'coverage-intelligence',
  'sell-hold-rent': 'break-even',
  'break-even': 'capital-timeline',
  'capital-timeline': 'sell-hold-rent',
  'home-event-radar': 'home-timeline',
  'home-risk-replay': 'home-timeline',
  'home-timeline': 'status-board',
  'status-board': 'home-event-radar',
};

function appendParams(path: string, params: Record<string, string | null | undefined>) {
  const [base, query = ''] = path.split('?');
  const search = new URLSearchParams(query);

  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    if (!search.has(key)) {
      search.set(key, value);
    }
  }

  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function buildToolPath(tool: OrchestrationToolId, propertyId: string) {
  switch (tool) {
    case 'coverage-intelligence':
      return `/dashboard/properties/${propertyId}/tools/coverage-intelligence`;
    case 'risk-premium-optimizer':
      return `/dashboard/properties/${propertyId}/tools/risk-premium-optimizer`;
    case 'do-nothing':
      return `/dashboard/properties/${propertyId}/tools/do-nothing`;
    case 'sell-hold-rent':
      return `/dashboard/properties/${propertyId}/tools/sell-hold-rent`;
    case 'break-even':
      return `/dashboard/properties/${propertyId}/tools/break-even`;
    case 'capital-timeline':
      return `/dashboard/properties/${propertyId}/tools/capital-timeline`;
    case 'home-event-radar':
      return `/dashboard/properties/${propertyId}/tools/home-event-radar`;
    case 'home-risk-replay':
      return `/dashboard/properties/${propertyId}/tools/home-risk-replay`;
    case 'home-timeline':
      return `/dashboard/properties/${propertyId}/timeline`;
    case 'status-board':
    default:
      return `/dashboard/properties/${propertyId}/status-board`;
  }
}

function toolLabel(tool: string | null | undefined) {
  if (!tool) return 'shared tool flow';
  return tool.replace(/-/g, ' ');
}

function timeAgoLabel(timestamp?: string | null) {
  if (!timestamp) return 'Updated recently';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

export default function PropertyOrchestrationStrip({
  propertyId,
  contextTool,
  className,
}: PropertyOrchestrationStripProps) {
  const summaryQuery = useQuery({
    queryKey: ['property-orchestration-strip', propertyId],
    enabled: Boolean(propertyId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!propertyId) return null;
      const summary = await api.getOrchestrationSummary(propertyId);
      return adaptOrchestrationSummary(summary);
    },
  });

  const summary = summaryQuery.data;
  const nextBestMove = summary?.nextBestMove ?? null;
  const activeScenario = summary?.sharedContext?.activeScenario ?? null;

  const primaryPath = useMemo(() => {
    if (!nextBestMove?.targetPath) return null;
    return appendParams(nextBestMove.targetPath, {
      fromTool: contextTool ?? 'orchestration-strip',
      launchSurface: 'orchestration-strip',
      assumptionSetId: activeScenario?.assumptionSetId ?? nextBestMove.assumptionSetId ?? null,
    });
  }, [nextBestMove?.targetPath, nextBestMove?.assumptionSetId, contextTool, activeScenario?.assumptionSetId]);

  const continuityPath = useMemo(() => {
    if (!propertyId || !contextTool) return null;
    const nextTool = NEXT_TOOL_BY_CONTEXT[contextTool];
    if (!nextTool) return null;
    const rawPath = buildToolPath(nextTool, propertyId);
    return appendParams(rawPath, {
      fromTool: contextTool,
      launchSurface: 'orchestration-strip',
      assumptionSetId: activeScenario?.assumptionSetId ?? null,
    });
  }, [propertyId, contextTool, activeScenario?.assumptionSetId]);

  if (!propertyId) return null;

  if (summaryQuery.isLoading) {
    return (
      <div className={cn('rounded-2xl border border-black/10 bg-white/70 p-3 text-sm text-slate-500', className)}>
        Loading shared context…
      </div>
    );
  }

  if (!summary) return null;

  return (
    <section className={cn('rounded-2xl border border-black/10 bg-white/80 p-3 shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Next Best Move</p>
          <p className="mb-0 mt-1 text-sm font-semibold text-slate-900">
            {nextBestMove?.title ?? 'Review current property priorities'}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-600">
            {nextBestMove?.detail ?? summary.sharedContext?.strongestPressure ?? 'Shared orchestration context is active for this property.'}
          </p>
        </div>
        <p className="mb-0 text-[11px] text-slate-500">
          {timeAgoLabel(summary.sharedContext?.generatedAt)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {summary.sharedContext?.posture ? (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
            <Target className="mr-1 h-3 w-3" />
            Posture: {summary.sharedContext.posture.riskTolerance ?? 'Default'}
          </span>
        ) : null}

        {activeScenario ? (
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-700">
            <Workflow className="mr-1 h-3 w-3" />
            Scenario: {toolLabel(activeScenario.toolKey)}
          </span>
        ) : null}

        {summary.sharedContext?.strongestOpportunity ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            Opportunity: {summary.sharedContext.strongestOpportunity}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {primaryPath ? (
          <Link
            href={primaryPath}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Open next move
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        ) : null}

        {continuityPath ? (
          <Link
            href={continuityPath}
            className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Continue flow
          </Link>
        ) : null}
      </div>
    </section>
  );
}
