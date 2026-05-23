'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Heart,
  Home,
  Info,
  LayoutGrid,
  Leaf,
  Package,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { getDailySnapshot } from '@/lib/api/dailySnapshotApi';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { getRoomInsights, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  EmptyStateCard,
  MetricRow,
  MobilePageContainer,
  PreviewListRow,
  QuickActionGrid,
  QuickActionTile,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  MOBILE_AI_TOOL_CATALOG,
  MOBILE_HOME_TOOL_LINKS,
} from '@/components/mobile/dashboard/mobileToolCatalog';
import { MoneyImpactTrackerCard } from '@/components/mobile/dashboard/MoneyImpactTrackerCard';
import { resolveToolIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { LocalUpdate } from '@/types';
import type { ScoredProperty } from '../types';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import {
  appendGuidanceContinuityToHref,
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';

type MobileDashboardHomeProps = {
  userFirstName: string;
  properties: ScoredProperty[];
  selectedPropertyId: string | undefined;
  onPropertyChange: (propertyId: string) => void;
  localUpdates?: LocalUpdate[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string
): string {
  if (propertyId) return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

function buildAiToolHref(propertyId: string | undefined, toolHref: string): string {
  return buildPropertyAwareDashboardHref(propertyId, toolHref);
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyCompact(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score > 0) return 'Low';
  return '—';
}

function roomEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('kitchen')) return '🍽️';
  if (n.includes('bed')) return '🛏️';
  if (n.includes('bath')) return '🛁';
  if (n.includes('garage')) return '🚗';
  if (n.includes('office')) return '💻';
  if (n.includes('living')) return '🛋️';
  return '🏠';
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getPrimaryActionEmoji(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('season') || t.includes('spring') || t.includes('summer') || t.includes('fall') || t.includes('winter')) return '🌿';
  if (t.includes('risk') || t.includes('insurance') || t.includes('protect')) return '🛡️';
  if (t.includes('save') || t.includes('saving') || t.includes('financial')) return '💰';
  if (t.includes('repair') || t.includes('fix') || t.includes('maintenance')) return '🔧';
  return '🏠';
}

// ── CollapsibleRow ─────────────────────────────────────────────────────────
// Local component: compact disclosure row used in the grouped sections panel.

function CollapsibleRow({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50">
          {icon}
        </div>
        <span className="flex-1 text-[14px] font-semibold text-slate-800">{title}</span>
        {badge ? <span className="text-[12px] text-slate-400">{badge}</span> : null}
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="space-y-2.5 px-4 pb-4 pt-0.5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MobileDashboardHome({
  userFirstName,
  properties,
  selectedPropertyId,
  onPropertyChange,
  localUpdates = [],
}: MobileDashboardHomeProps) {
  const searchParams = useSearchParams();
  const guidanceContext = React.useMemo(
    () => extractGuidanceContinuityContext(searchParams),
    [searchParams]
  );
  const hasGuidanceContext = hasGuidanceContinuityContext(guidanceContext);
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const propertyId = selectedProperty?.id;

  const resolveLocalUpdateHref = React.useCallback(
    (href: string | null | undefined) => appendGuidanceContinuityToHref(href || '/dashboard', guidanceContext),
    [guidanceContext]
  );

  const trackLocalUpdateProgress = React.useCallback(
    (update: LocalUpdate) => {
      if (
        !propertyId ||
        !hasGuidanceContext ||
        !guidanceContext.guidanceJourneyId ||
        !guidanceContext.guidanceStepKey
      ) {
        return;
      }

      const resolvedHref = resolveLocalUpdateHref(update.ctaUrl ?? '/dashboard');
      void recordGuidanceToolStatus(propertyId, {
        journeyId: guidanceContext.guidanceJourneyId,
        stepKey: guidanceContext.guidanceStepKey,
        signalIntentFamily: guidanceContext.guidanceSignalIntentFamily ?? undefined,
        sourceToolKey: 'dashboard-local-updates',
        sourceEntityType: 'LOCAL_UPDATE',
        sourceEntityId: update.id,
        status: 'IN_PROGRESS',
        producedData: {
          proofType: 'cta_engagement',
          proofId: update.id,
          ctaKey: 'local_update_open',
          ctaUrl: resolvedHref,
          updateTitle: update.title,
          openedAt: new Date().toISOString(),
        },
      }).catch((err) => {
        console.warn('[mobile-dashboard] local update guidance hook failed:', err);
      });
    },
    [guidanceContext, hasGuidanceContext, propertyId, resolveLocalUpdateHref]
  );

  // ── Data queries (all identical to original) ─────────────────────────────

  const homeScoreQuery = useQuery({
    queryKey: ['mobile-home-score-report', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getHomeScoreReport(propertyId, 8);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const snapshotsQuery = useQuery({
    queryKey: ['mobile-property-score-snapshot', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getPropertyScoreSnapshots(propertyId, 8);
    },
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });

  const riskSummaryQuery = useQuery({
    queryKey: ['mobile-risk-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const report = await api.getRiskReportSummary(propertyId);
      if (report === 'QUEUED') return null;
      return report;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const financialSummaryQuery = useQuery({
    queryKey: ['mobile-financial-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getFinancialReportSummary(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const dailySnapshotQuery = useQuery({
    queryKey: ['mobile-daily-snapshot', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return getDailySnapshot(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 2 * 60 * 1000,
  });

  const orchestrationQuery = useQuery({
    queryKey: ['mobile-orchestration-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getOrchestrationSummary(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const maintenanceStatsQuery = useQuery({
    queryKey: ['mobile-maintenance-stats', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getMaintenanceTaskStats(propertyId);
      if (!response.success) return null;
      return response.data;
    },
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const seasonalQuery = useQuery({
    queryKey: ['mobile-seasonal-checklist', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const result = await seasonalAPI.getCurrentChecklist(propertyId);
      return result?.checklist ?? null;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const roomsQuery = useQuery({
    queryKey: ['mobile-rooms', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      return listInventoryRooms(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const savingsQuery = useQuery({
    queryKey: ['mobile-home-savings-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return getHomeSavingsSummary(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const homeEquityQuery = useQuery({
    queryKey: ['mobile-home-equity-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getHomeEquitySummary(propertyId);
      return (response as any)?.data ?? response;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const radarFeedQuery = useQuery({
    queryKey: ['mobile-radar-feed-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getRadarFeed(propertyId, { limit: 20 });
    },
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  // ── Derived scalars ───────────────────────────────────────────────────────

  const homeScore = Math.round(homeScoreQuery.data?.homeScore ?? 0);
  const riskExposure = Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0);
  const financialScore = Math.round(financialSummaryQuery.data?.financialEfficiencyScore ?? 0);
  const urgentActionCount = orchestrationQuery.data?.pendingActionCount ?? 0;
  const topActions = (orchestrationQuery.data?.actions ?? []).slice(0, 2);
  const overdueCount = maintenanceStatsQuery.data?.overdue ?? 0;
  const weatherInsight = dailySnapshotQuery.data?.payload?.weatherInsight?.headline;
  const recommendedAction = homeScoreQuery.data?.nextBestAction;
  const monthlySavings = savingsQuery.data?.potentialMonthlySavings ?? 0;
  const homeEquityDollars = Number(homeEquityQuery.data?.totalEquityWithMaintenanceCents || 0) / 100;

  const confidenceLabel = homeScore >= 80 ? 'High confidence' : homeScore >= 60 ? 'Medium confidence' : 'Building';
  const signalCount = Math.max(6, [homeScore > 0, riskExposure >= 0, financialScore > 0, Boolean(weatherInsight), Boolean(dailySnapshotQuery.data)].filter(Boolean).length * 2);

  const isStable = urgentActionCount === 0 && overdueCount === 0;

  const seasonalChecklist = seasonalQuery.data;
  const seasonalRemaining = Math.max(
    0,
    Number(seasonalChecklist?.totalTasks ?? 0) - Number(seasonalChecklist?.tasksCompleted ?? 0)
  );

  const rooms = roomsQuery.data ?? [];
  const previewRooms = rooms.slice(0, 6);
  const previewRoomIds = React.useMemo(() => previewRooms.map((r) => r.id), [previewRooms]);

  const roomInsightsQuery = useQuery({
    queryKey: ['mobile-room-insights', propertyId, previewRoomIds.join(',')],
    queryFn: async () => {
      if (!propertyId || previewRoomIds.length === 0) return {} as Record<
        string,
        { itemCount: number; docsLinkedCount: number; coverageGapsCount: number }
      >;

      const settled = await Promise.allSettled(
        previewRoomIds.map(async (roomId) => {
          const insight = await getRoomInsights(propertyId, roomId);
          const stats = (insight as any)?.stats ?? {};
          return {
            roomId,
            itemCount: Number(stats.itemCount ?? 0),
            docsLinkedCount: Number(stats.docsLinkedCount ?? 0),
            coverageGapsCount: Number(stats.coverageGapsCount ?? 0),
          };
        })
      );

      const next: Record<string, { itemCount: number; docsLinkedCount: number; coverageGapsCount: number }> = {};
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue;
        const { roomId, itemCount, docsLinkedCount, coverageGapsCount } = result.value;
        next[roomId] = { itemCount, docsLinkedCount, coverageGapsCount };
      }
      return next;
    },
    enabled: !!propertyId && previewRoomIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const totalCoverageGaps = Object.values(roomInsightsQuery.data || {}).reduce(
    (sum, s) => sum + Number(s.coverageGapsCount || 0),
    0
  );
  const worstCoverageRoom = totalCoverageGaps > 0
    ? previewRooms.reduce<{ name: string; count: number } | null>((worst, room) => {
        const count = Number(roomInsightsQuery.data?.[room.id]?.coverageGapsCount ?? 0);
        if (!worst || count > worst.count) return { name: room.name, count };
        return worst;
      }, null)
    : null;

  const radarItems = radarFeedQuery.data?.items ?? [];
  const radarNewCount = radarItems.filter((i) => i.state === 'new').length;
  const radarActiveCount = radarItems.filter((i) => i.state !== 'dismissed').length;

  // ── Hrefs ─────────────────────────────────────────────────────────────────

  const roomsHref = buildPropertyAwareHref(propertyId, 'rooms', 'rooms');
  const riskRadarHref = buildPropertyAwareDashboardHref(propertyId, '/dashboard/risk-radar');
  const radarHref = buildAiToolHref(propertyId, '/dashboard/home-event-radar');
  const healthScoreHref = buildPropertyAwareDashboardHref(propertyId, '/dashboard/health-score');
  const actionsHref = `/dashboard/actions?propertyId=${encodeURIComponent(propertyId || '')}`;

  // ── Tool catalogs ─────────────────────────────────────────────────────────

  const aiToolByKey = new Map(MOBILE_AI_TOOL_CATALOG.map((t) => [t.key, t]));
  const homeToolByKey = new Map(MOBILE_HOME_TOOL_LINKS.map((t) => [t.key, t]));
  const homeToolsPinnedKeys = ['property-tax', 'sell-hold-rent', 'seller-prep', 'home-timeline'] as const;
  const homeToolsPageHref = `/dashboard/home-tools${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`;

  const climateHeadline = weatherInsight
    ? String(weatherInsight).split(/[.!?]/)[0]
    : 'Weather risk monitored';

  const aiToolTiles = [
    {
      title: 'Repair vs Replace',
      subtitle: monthlySavings > 0 ? `${formatCurrency(monthlySavings)}+ save` : 'Smart fix decisions',
      icon: React.createElement(resolveToolIcon('ai', 'replace-repair'), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'replace-repair'), { className: 'h-5 w-5' }),
      artworkSrc: aiToolByKey.get('replace-repair')?.artworkSrc,
      href: buildAiToolHref(propertyId, '/dashboard/replace-repair'),
      tone: 'neutral' as const,
      badgeLabel: '',
    },
    {
      title: 'Coverage Intelligence',
      subtitle:
        totalCoverageGaps > 0 && worstCoverageRoom
          ? `${totalCoverageGaps} unprotected in ${worstCoverageRoom.name}`
          : totalCoverageGaps > 0
          ? `${totalCoverageGaps} unprotected item${totalCoverageGaps === 1 ? '' : 's'}`
          : 'No gaps detected',
      icon: React.createElement(resolveToolIcon('ai', 'coverage-intelligence'), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'coverage-intelligence'), { className: 'h-5 w-5' }),
      artworkSrc: aiToolByKey.get('coverage-intelligence')?.artworkSrc,
      href: buildAiToolHref(propertyId, '/dashboard/coverage-intelligence'),
      tone: 'neutral' as const,
      badgeLabel: '',
    },
    {
      title: 'Climate Risk',
      subtitle: climateHeadline,
      icon: React.createElement(resolveToolIcon('ai', 'climate'), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'climate'), { className: 'h-5 w-5' }),
      artworkSrc: aiToolByKey.get('climate')?.artworkSrc,
      href: buildAiToolHref(propertyId, '/dashboard/climate'),
      tone: 'neutral' as const,
      badgeLabel: '',
    },
    {
      title: 'Home Equity',
      subtitle: homeEquityDollars > 0 ? `Equity: ${formatCurrency(homeEquityDollars)}` : 'Track equity growth',
      icon: React.createElement(resolveToolIcon('ai', 'appreciation'), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'appreciation'), { className: 'h-5 w-5' }),
      artworkSrc: aiToolByKey.get('appreciation')?.artworkSrc,
      href: buildAiToolHref(propertyId, '/dashboard/appreciation'),
      tone: 'neutral' as const,
      badgeLabel: '',
    },
  ];

  const homeToolTiles = homeToolsPinnedKeys
    .map((key) => homeToolByKey.get(key))
    .filter((t): t is (typeof MOBILE_HOME_TOOL_LINKS)[number] => Boolean(t))
    .map((t) => ({
      title: t.name,
      subtitle: t.description || 'Open tool',
      icon: React.createElement(t.icon, { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(t.icon, { className: 'h-5 w-5' }),
      href: buildPropertyAwareHref(propertyId, t.hrefSuffix, t.navTarget),
      tone: 'neutral' as const,
      badgeLabel: '',
    }));

  // ── Greeting summary line ─────────────────────────────────────────────────

  const timeOfDay = getTimeOfDay();
  const statusText = isStable ? 'Home is stable' : `${urgentActionCount + overdueCount} item${urgentActionCount + overdueCount > 1 ? 's' : ''} need attention`;
  const savingsText = monthlySavings * 12 > 0 ? `${formatCurrencyCompact(monthlySavings * 12)} savings` : null;
  const priorityText = urgentActionCount > 0 ? `${urgentActionCount} priority` : null;
  const greetingSubline = [priorityText, savingsText].filter(Boolean).join(' • ');

  // ── Primary action ────────────────────────────────────────────────────────

  let primaryAction: { title: string; subtitle: string; ctaLabel: string; href: string } | null = null;
  const topUrgentAction = topActions[0];
  if (topUrgentAction) {
    primaryAction = {
      title: topUrgentAction.title,
      subtitle: topUrgentAction.description || 'Best balance of cost, confidence and impact.',
      ctaLabel: 'Review now',
      href: actionsHref,
    };
  } else if (seasonalRemaining > 0 && seasonalChecklist) {
    primaryAction = {
      title: `${seasonalChecklist.season} prep needs attention`,
      subtitle: `${seasonalRemaining} task${seasonalRemaining > 1 ? 's' : ''} remaining this season.`,
      ctaLabel: 'Review checklist',
      href: `/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId || '')}`,
    };
  } else if (recommendedAction) {
    primaryAction = {
      title: recommendedAction.title,
      subtitle: 'Best balance of confidence + prevention.',
      ctaLabel: 'Review now',
      href: recommendedAction.href || actionsHref,
    };
  }

  const primaryActionEmoji = primaryAction ? getPrimaryActionEmoji(primaryAction.title) : '🏠';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="md:hidden">
      <MobilePageContainer className="space-y-5 pt-2">

        {/* ── 1. COMPACT HEADER ──────────────────────────────────────── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="no-brand-style flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
                <LayoutGrid className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
              </div>
              <span className="text-[15px] font-bold text-[hsl(var(--mobile-text-primary))]">ContractToCozy</span>
            </Link>

            <Link
              href="/dashboard/notifications"
              aria-label="Open notifications"
              className="no-brand-style flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"
            >
              <Bell className="h-[18px] w-[18px]" />
            </Link>
          </div>

          {/* Compact pill property selector */}
          {properties.length > 0 ? (
            <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
              <SelectTrigger className="h-9 w-fit max-w-[260px] min-w-[140px] rounded-full border border-slate-200 bg-white pl-2.5 pr-2 text-[13px] font-medium text-slate-700 shadow-none focus:ring-1 focus:ring-[hsl(var(--mobile-brand-strong))]/30">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Home className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                  <SelectValue placeholder="Select property" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id} className="text-sm">
                    {property.name || property.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </section>

        {!propertyId ? (
          <EmptyStateCard
            title="No property selected"
            description="Choose a property to load your home intelligence dashboard."
            action={
              <Link
                href="/dashboard/properties"
                className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
              >
                View Properties
              </Link>
            }
          />
        ) : (
          <>
            {/* ── 2. GREETING — bare text, no card ──────────────────── */}
            <section>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="mb-0 text-[1.75rem] font-bold leading-[1.1] text-[hsl(var(--mobile-text-primary))]">
                    Good {timeOfDay}, {userFirstName}
                  </h2>

                  {/* Status + priority + savings line */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[hsl(var(--mobile-text-secondary))]">
                    <span
                      className={cn(
                        'inline-block h-2 w-2 flex-shrink-0 rounded-full',
                        isStable ? 'bg-emerald-500' : 'bg-amber-500'
                      )}
                    />
                    <span>{statusText}</span>
                    {greetingSubline ? (
                      <>
                        <span className="text-slate-300">•</span>
                        <span>{greetingSubline}</span>
                      </>
                    ) : null}
                  </div>

                  {/* Tiny verification chips */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-[3px] text-[11px] text-slate-500">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Verified
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-[3px] text-[11px] text-slate-500">
                      <Info className="h-3 w-3 text-slate-400" />
                      {confidenceLabel}
                    </span>
                    <span className="rounded-full border border-slate-200 px-2 py-[3px] text-[11px] text-slate-500">
                      {signalCount} signals
                    </span>
                  </div>
                </div>

                {/* AI sparkle button */}
                <button
                  type="button"
                  aria-label="AI insights"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 transition-transform active:scale-95"
                >
                  <Sparkles className="h-4 w-4 text-teal-600" />
                </button>
              </div>
            </section>

            {/* ── 3. PRIMARY ACTION CARD ─────────────────────────────── */}
            {primaryAction ? (
              <section>
                <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.07)]">
                  <div className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--mobile-brand-strong))]">
                        Top Priority
                      </p>
                      <h3 className="mb-0 text-[1.125rem] font-bold leading-snug text-[hsl(var(--mobile-text-primary))]">
                        {primaryAction.title}
                      </h3>
                      <p className="mb-0 mt-1 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
                        {primaryAction.subtitle}
                      </p>
                    </div>
                    {/* Illustration */}
                    <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-[2rem]">
                      {primaryActionEmoji}
                    </div>
                  </div>
                  <Link
                    href={primaryAction.href}
                    className="no-brand-style flex min-h-[52px] w-full items-center justify-between bg-[hsl(var(--mobile-brand-strong))] px-5 text-[15px] font-semibold text-white transition-opacity active:opacity-90"
                  >
                    {primaryAction.ctaLabel}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              </section>
            ) : null}

            {/* ── 4. AT A GLANCE — 4-column KPI grid ────────────────── */}
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="mb-0 text-[15px] font-semibold text-[hsl(var(--mobile-text-primary))]">
                  At a glance
                </h3>
                <span className="text-[11px] text-[hsl(var(--mobile-text-muted))]">Updated just now</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {/* Health */}
                <Link href={healthScoreHref} className="no-brand-style block">
                  <div className="rounded-2xl border border-slate-100 bg-white p-2.5 text-center">
                    <Heart className="mx-auto mb-1.5 h-4 w-4 text-rose-400" />
                    <p className="mb-0 text-[17px] font-bold leading-none text-slate-900">
                      {homeScore > 0 ? homeScore : '—'}
                    </p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500">Health</p>
                    <p className="mb-0 text-[11px] text-slate-400">{getScoreLabel(homeScore)}</p>
                  </div>
                </Link>

                {/* Savings */}
                <Link href={buildPropertyAwareHref(propertyId, 'tools/home-savings', 'tool:home-savings')} className="no-brand-style block">
                  <div className="rounded-2xl border border-slate-100 bg-white p-2.5 text-center">
                    <DollarSign className="mx-auto mb-1.5 h-4 w-4 text-emerald-400" />
                    <p className="mb-0 text-[17px] font-bold leading-none text-slate-900">
                      {formatCurrencyCompact(monthlySavings * 12)}
                    </p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500">Savings</p>
                    <p className="mb-0 text-[11px] text-slate-400">Opp.</p>
                  </div>
                </Link>

                {/* Risk */}
                <Link href={riskRadarHref} className="no-brand-style block">
                  <div className="rounded-2xl border border-slate-100 bg-white p-2.5 text-center">
                    <ShieldAlert className="mx-auto mb-1.5 h-4 w-4 text-amber-400" />
                    <p className="mb-0 text-[17px] font-bold leading-none text-slate-900">
                      {formatCurrencyCompact(riskExposure)}
                    </p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500">Risk</p>
                    <p className="mb-0 text-[11px] text-slate-400">
                      {riskExposure > 0 ? 'Unhedged' : 'Protected'}
                    </p>
                  </div>
                </Link>

                {/* Actions */}
                <Link href={actionsHref} className="no-brand-style block">
                  <div className="rounded-2xl border border-slate-100 bg-white p-2.5 text-center">
                    <Zap
                      className={cn(
                        'mx-auto mb-1.5 h-4 w-4',
                        urgentActionCount > 0 ? 'text-teal-500' : 'text-slate-300'
                      )}
                    />
                    <p
                      className={cn(
                        'mb-0 text-[17px] font-bold leading-none',
                        urgentActionCount > 0 ? 'text-teal-600' : 'text-slate-900'
                      )}
                    >
                      {urgentActionCount}
                    </p>
                    <p className="mb-0 mt-1 text-[11px] text-slate-500">Actions</p>
                    <p
                      className={cn(
                        'mb-0 text-[11px]',
                        urgentActionCount > 0 ? 'text-teal-500' : 'text-slate-400'
                      )}
                    >
                      {urgentActionCount > 0 ? 'Open' : 'Clear'}
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* ── 5. WHAT'S NEXT — contextual list rows ──────────────── */}
            {seasonalRemaining > 0 && seasonalChecklist ? (
              <section>
                <h3 className="mb-2.5 text-[15px] font-semibold text-[hsl(var(--mobile-text-primary))]">
                  What&apos;s next
                </h3>

                <Link
                  href={`/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`}
                  className="no-brand-style flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <Leaf className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-0 text-[13px] font-semibold leading-none text-teal-600">
                      {seasonalChecklist.season} checklist
                    </p>
                    <p className="mb-0 mt-0.5 text-[11px] text-slate-500">
                      {seasonalRemaining} task{seasonalRemaining > 1 ? 's' : ''} remaining
                    </p>
                    <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{
                          width: `${Math.round(
                            ((Number(seasonalChecklist.tasksCompleted) || 0) /
                              Math.max(Number(seasonalChecklist.totalTasks) || 1, 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-[11px] text-slate-400">
                    {Number(seasonalChecklist.tasksCompleted) || 0}/{Number(seasonalChecklist.totalTasks) || 0}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                </Link>
              </section>
            ) : null}

            {/* ── 6. COLLAPSIBLE SECTION ROWS ────────────────────────── */}
            <section className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white">

              {/* Rooms */}
              {rooms.length > 0 ? (
                <CollapsibleRow
                  icon={<LayoutGrid className="h-4 w-4 text-slate-500" />}
                  title="Rooms"
                  badge={totalCoverageGaps > 0 ? `${totalCoverageGaps} gap${totalCoverageGaps > 1 ? 's' : ''}` : `${rooms.length} room${rooms.length > 1 ? 's' : ''}`}
                >
                  <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                    {previewRooms.map((room) => {
                      const stats = roomInsightsQuery.data?.[room.id];
                      return (
                        <Link
                          key={room.id}
                          href={roomsHref}
                          className="no-brand-style min-w-[120px] flex-shrink-0 snap-start rounded-2xl border border-slate-100 bg-slate-50 p-3"
                        >
                          <p className="mb-1 text-xl leading-none">{roomEmoji(room.name)}</p>
                          <p className="mb-0 truncate text-[13px] font-semibold text-slate-800">{room.name}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-0.5">
                              <Package className="h-3 w-3" />
                              {stats?.itemCount ?? 0}
                            </span>
                            {(stats?.coverageGapsCount ?? 0) > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-rose-500">
                                <AlertCircle className="h-3 w-3" />
                                {stats?.coverageGapsCount}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <Link
                    href={roomsHref}
                    className="no-brand-style mt-1 flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-slate-50 text-[13px] font-semibold text-[hsl(var(--mobile-brand-strong))]"
                  >
                    View all rooms
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </CollapsibleRow>
              ) : null}

              {/* Financial */}
              <CollapsibleRow
                icon={<Wallet className="h-4 w-4 text-slate-500" />}
                title="Financial"
                badge={monthlySavings > 0 ? `${formatCurrencyCompact(monthlySavings * 12)}/yr` : undefined}
              >
                <div className="space-y-2">
                  <MetricRow label="Monthly savings" value={formatCurrency(monthlySavings)} />
                  <MetricRow label="Annual savings" value={formatCurrency(savingsQuery.data?.potentialAnnualSavings)} />
                  <MetricRow label="Risk exposure" value={formatCurrency(riskExposure)} />
                </div>
                <Link
                  href={buildPropertyAwareHref(propertyId, 'tools/home-savings', 'tool:home-savings')}
                  className="no-brand-style mt-2 flex min-h-[44px] items-center justify-center rounded-xl bg-slate-50 text-[13px] font-semibold text-slate-700"
                >
                  Open Financial Tools
                </Link>
                <MoneyImpactTrackerCard
                  annualExposure={financialSummaryQuery.data?.financialExposureTotal || 0}
                  annualSavings={savingsQuery.data?.potentialAnnualSavings || 0}
                  monthlySavings={monthlySavings}
                  weeklyFinancialDelta={snapshotsQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null}
                  financialTrend={(snapshotsQuery.data?.scores?.FINANCIAL?.trend || []).map((p) => p.score)}
                />
              </CollapsibleRow>

              {/* AI Tools */}
              <CollapsibleRow
                icon={<Sparkles className="h-4 w-4 text-slate-500" />}
                title="AI Tools"
                badge="4 tools"
              >
                <QuickActionGrid className="gap-2">
                  {aiToolTiles.map((tile) => (
                    <QuickActionTile key={tile.title} {...tile} variant="compact" />
                  ))}
                </QuickActionGrid>
              </CollapsibleRow>

              {/* Home Tools */}
              <CollapsibleRow
                icon={<Shield className="h-4 w-4 text-slate-500" />}
                title="Home Tools"
                badge="4 tools"
              >
                <QuickActionGrid className="gap-2">
                  {homeToolTiles.map((tile) => (
                    <QuickActionTile key={tile.title} {...tile} variant="compact" />
                  ))}
                </QuickActionGrid>
                <Link
                  href={homeToolsPageHref}
                  className="no-brand-style mt-2 flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-slate-50 text-[13px] font-semibold text-[hsl(var(--mobile-brand-strong))]"
                >
                  View all tools
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </CollapsibleRow>

              {/* Home Event Radar — only when active */}
              {radarActiveCount > 0 ? (
                <CollapsibleRow
                  icon={<TrendingUp className="h-4 w-4 text-slate-500" />}
                  title="Home Radar"
                  badge={radarNewCount > 0 ? `${radarNewCount} new` : `${radarActiveCount} events`}
                >
                  <Link
                    href={radarHref}
                    className="no-brand-style flex min-h-[44px] items-center justify-center rounded-xl bg-slate-50 text-[13px] font-semibold text-slate-700"
                  >
                    Open Radar
                  </Link>
                </CollapsibleRow>
              ) : null}

              {/* What's New — local updates */}
              {localUpdates.length > 0 ? (
                <CollapsibleRow
                  icon={<Sparkles className="h-4 w-4 text-slate-500" />}
                  title="What's New"
                  badge={`${localUpdates.length} new`}
                >
                  <div className="space-y-2">
                    {localUpdates.slice(0, 3).map((update) => (
                      <PreviewListRow
                        key={update.id}
                        title={update.title}
                        subtitle={update.shortDescription}
                        href={resolveLocalUpdateHref(update.ctaUrl)}
                        onClick={() => trackLocalUpdateProgress(update)}
                      />
                    ))}
                  </div>
                </CollapsibleRow>
              ) : null}
            </section>

          </>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <section className="py-1">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <p className="mb-0 mt-3 text-center text-[11px] text-slate-400">
            Home intelligence · status · action · insight
          </p>
        </section>

      </MobilePageContainer>
    </div>
  );
}
