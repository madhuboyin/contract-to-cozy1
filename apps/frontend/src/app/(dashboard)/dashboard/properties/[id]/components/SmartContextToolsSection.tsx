'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import type { GuidanceIssueDomain } from '@/lib/api/guidanceApi';
import {
  buildPropertyAwareToolHref,
  getToolDefinition,
  type ToolId,
} from '@/features/tools/toolRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SmartToolRecommendation = {
  toolId: ToolId;
  reason: string;
  score: number;
};

// ---------------------------------------------------------------------------
// Deterministic signal → tool recommendation engine (no ML)
// ---------------------------------------------------------------------------

function byDomain(actions: GuidanceActionModel[], domain: GuidanceIssueDomain) {
  return actions.filter((a) => a.issueDomain === domain);
}

function bySeverity(actions: GuidanceActionModel[], domain: GuidanceIssueDomain) {
  return actions.filter(
    (a) => a.issueDomain === domain && (a.severity === 'HIGH' || a.severity === 'CRITICAL'),
  );
}

export function selectSmartContextTools(
  actions: GuidanceActionModel[],
): SmartToolRecommendation[] {
  const recs: SmartToolRecommendation[] = [];
  const added = new Set<ToolId>();

  function add(toolId: ToolId, reason: string, score: number) {
    if (!added.has(toolId)) {
      added.add(toolId);
      recs.push({ toolId, reason, score });
    }
  }

  // 1. Insurance pressure or coverage gaps → insurance-trend
  const insuranceCritical = bySeverity(actions, 'INSURANCE');
  const coverageGaps = actions.filter(
    (a) => a.coverageImpact === 'NOT_COVERED' || a.coverageImpact === 'PARTIAL',
  );
  if (insuranceCritical.length > 0) {
    add('insurance-trend', 'Premium pressure detected — track your renewal risk', 90);
  } else if (coverageGaps.length > 0) {
    add('insurance-trend', 'Coverage gaps found — review your protection exposure', 85);
  }

  // 2. High-severity maintenance → service-price-radar
  const maintenanceHigh = bySeverity(actions, 'MAINTENANCE');
  if (maintenanceHigh.length > 0) {
    add('service-price-radar', 'Work needed soon — compare quotes before booking', 82);
  }

  // 3. Safety signals → home-risk-replay
  const safetyActions = byDomain(actions, 'SAFETY');
  if (safetyActions.length > 0) {
    const n = safetyActions.length;
    add(
      'home-risk-replay',
      `${n} safety signal${n > 1 ? 's' : ''} active — review what your home has been through`,
      88,
    );
  }

  // 4. Weather signals → home-event-radar
  const weatherActions = byDomain(actions, 'WEATHER');
  if (weatherActions.length > 0) {
    add('home-event-radar', 'Weather events may be affecting your property', 76);
  }

  // 5. Neighborhood signals → neighborhood-change-radar
  const neighborhoodActions = byDomain(actions, 'NEIGHBORHOOD');
  if (neighborhoodActions.length > 0) {
    add(
      'neighborhood-change-radar',
      'Nearby changes detected that could affect value or livability',
      74,
    );
  }

  // 6. Financial signals → cost-growth
  const financialActions = byDomain(actions, 'FINANCIAL');
  if (financialActions.length > 0) {
    add('cost-growth', 'Financial signals active — model how ownership costs may grow', 70);
  }

  // 7. Asset lifecycle signals → capital-timeline
  const assetActions = byDomain(actions, 'ASSET_LIFECYCLE');
  if (assetActions.length > 0) {
    add('capital-timeline', 'Asset replacement may be approaching — plan your capital timeline', 68);
  }

  // 8. Funding gap → break-even
  if (actions.some((a) => a.fundingGapFlag)) {
    add('break-even', 'Funding pressure detected — review your break-even horizon', 65);
  }

  // 9. Multiple urgent signals → home-habit-coach
  const urgentCount = actions.filter(
    (a) => a.priorityGroup === 'IMMEDIATE' || a.priorityBucket === 'HIGH',
  ).length;
  if (urgentCount >= 2) {
    add('home-habit-coach', 'Multiple urgent signals — build a proactive care routine', 60);
  }

  // Fallbacks: ensure we always surface at least 2 useful tools
  if (recs.length < 2) add('home-event-radar', 'Track current events affecting your property', 40);
  if (recs.length < 2) add('status-board', "Monitor your home's health and readiness at a glance", 38);
  if (recs.length < 3) add('home-gazette', 'Your weekly home intelligence briefing', 35);

  return recs
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ToolRowProps = {
  toolId: ToolId;
  reason: string;
  propertyId: string;
};

function ToolRow({ toolId, reason, propertyId }: ToolRowProps) {
  const def = getToolDefinition(toolId);
  if (!def) return null;

  const href = buildPropertyAwareToolHref(toolId, propertyId);
  const Icon = def.icon;

  return (
    <Link
      href={href}
      className="group flex min-h-[44px] items-center gap-3 rounded-lg border border-border/50 bg-background px-3.5 py-2.5 transition-colors hover:border-border hover:bg-muted/30"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground group-hover:bg-muted transition-colors">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground/80 truncate">{def.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-1">{reason}</p>
      </div>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main section — Level 3 (exploratory), visually de-emphasized
// ---------------------------------------------------------------------------

interface SmartContextToolsSectionProps {
  propertyId: string;
}

export function SmartContextToolsSection({ propertyId }: SmartContextToolsSectionProps) {
  const { actions, isLoading } = useGuidance(propertyId);

  const recommendations = useMemo(
    () => (isLoading ? [] : selectSmartContextTools(actions)),
    [actions, isLoading],
  );

  if (isLoading || recommendations.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Suggested tools
        </p>
        <Link
          href={`/dashboard/home-tools?propertyId=${propertyId}`}
          className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-0.5 transition-colors"
        >
          All tools
          <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        {recommendations.map(({ toolId, reason }) => (
          <ToolRow key={toolId} toolId={toolId} reason={reason} propertyId={propertyId} />
        ))}
      </div>
    </section>
  );
}
