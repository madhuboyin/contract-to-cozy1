'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  ChevronRight,
  FileText,
  Flame,
  LayoutGrid,
  Package,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { getDailySnapshot } from '@/lib/api/dailySnapshotApi';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { getRoomInsights, listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EmptyStateCard,
  ExpandableSummaryCard,
  IconBadge,
  MetricRow,
  MobilePageContainer,
  PreviewListRow,
  QuickActionGrid,
  QuickActionTile,
  StatusChip,
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

function scoreChipTone(score: number): 'good' | 'elevated' | 'needsAction' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'elevated';
  return 'needsAction';
}

function riskChipTone(score: number): 'good' | 'elevated' | 'needsAction' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'elevated';
  return 'needsAction';
}

function roomEmoji(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes('kitchen')) return '🍽️';
  if (normalized.includes('bed')) return '🛏️';
  if (normalized.includes('bath')) return '🛁';
  if (normalized.includes('garage')) return '🚗';
  if (normalized.includes('office')) return '💻';
  if (normalized.includes('living')) return '🛋️';
  return '🏠';
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

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
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
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
      }).catch((error) => {
        console.warn('[mobile-dashboard] local update guidance hook failed:', error);
      });
    },
    [guidanceContext, hasGuidanceContext, propertyId, resolveLocalUpdateHref]
  );

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

  // --- Derived scalars ---
  const homeScore = Math.round(homeScoreQuery.data?.homeScore ?? 0);
  const healthScore = Math.round(selectedProperty?.healthScore?.totalScore ?? 0);
  const riskScore = Math.round(riskSummaryQuery.data?.riskScore ?? 0);
  const financialScore = Math.round(financialSummaryQuery.data?.financialEfficiencyScore ?? 0);
  const riskExposure = Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0);
  const confidenceLabel = homeScore >= 80 ? 'High confidence' : homeScore >= 60 ? 'Medium confidence' : 'Confidence building';
  const urgentActionCount = orchestrationQuery.data?.pendingActionCount ?? 0;
  const topActions = (orchestrationQuery.data?.actions ?? []).slice(0, 2);
  const overdueCount = maintenanceStatsQuery.data?.overdue ?? 0;
  const weatherInsight = dailySnapshotQuery.data?.payload?.weatherInsight?.headline;
  const recommendedAction = homeScoreQuery.data?.nextBestAction;
  const monthlySavings = savingsQuery.data?.potentialMonthlySavings ?? 0;
  const homeEquityDollars = Number(homeEquityQuery.data?.totalEquityWithMaintenanceCents || 0) / 100;

  const seasonalChecklist = seasonalQuery.data;
  const seasonalItems = seasonalChecklist?.items ?? [];
  const seasonalRemaining = Math.max(
    0,
    Number(seasonalChecklist?.totalTasks ?? 0) - Number(seasonalChecklist?.tasksCompleted ?? 0)
  );
  const seasonalPreview = seasonalItems
    .filter((item: { status?: string }) => String(item.status || '').toUpperCase() !== 'ADDED')
    .slice(0, 3);

  const rooms = roomsQuery.data ?? [];
  const previewRooms = rooms.slice(0, 6);
  const previewRoomIds = React.useMemo(() => previewRooms.map((room) => room.id), [previewRooms]);
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
    (sum, stats) => sum + Number(stats.coverageGapsCount || 0),
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

  // --- Hrefs ---
  const roomsHref = buildPropertyAwareHref(propertyId, 'rooms', 'rooms');
  const dailySnapshotHref = `/dashboard/daily-snapshot?propertyId=${encodeURIComponent(propertyId || '')}`;
  const riskRadarHref = buildPropertyAwareDashboardHref(propertyId, '/dashboard/risk-radar');
  const radarHref = buildAiToolHref(propertyId, '/dashboard/home-event-radar');

  // --- AI Tool tiles ---
  const aiToolByKey = new Map(MOBILE_AI_TOOL_CATALOG.map((tool) => [tool.key, tool]));
  const homeToolByKey = new Map(MOBILE_HOME_TOOL_LINKS.map((tool) => [tool.key, tool]));
  const homeToolsPinnedKeys = ['property-tax', 'sell-hold-rent', 'seller-prep', 'home-timeline'] as const;
  const homeToolsPageHref = `/dashboard/home-tools${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`;
  const homeToolTiles = homeToolsPinnedKeys
    .map((key) => homeToolByKey.get(key))
    .filter((tool): tool is (typeof MOBILE_HOME_TOOL_LINKS)[number] => Boolean(tool))
    .map((tool) => ({
      title: tool.name,
      subtitle: tool.description || 'Open tool',
      icon: React.createElement(tool.icon, { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(tool.icon, { className: 'h-5 w-5' }),
      href: buildPropertyAwareHref(propertyId, tool.hrefSuffix, tool.navTarget),
      tone: 'neutral' as const,
      badgeLabel: '',
    }));

  const climateHeadline = weatherInsight
    ? String(weatherInsight).split(/[.!?]/)[0]
    : riskScore >= 80 ? 'Low weather risk' : 'Weather risk monitored';

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
          ? `${totalCoverageGaps} unprotected item${totalCoverageGaps === 1 ? '' : 's'} in ${worstCoverageRoom.name}`
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
      subtitle: climateHeadline || 'Weather risk monitored',
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

  // --- AI Brief Strip values ---
  const timeOfDay = getTimeOfDay();
  const homeStatusLabel =
    urgentActionCount === 0 && overdueCount === 0
      ? 'Home stable'
      : urgentActionCount > 0
        ? `${urgentActionCount} action${urgentActionCount > 1 ? 's' : ''} need attention`
        : 'Tasks need attention';
  const savingsPartLabel = monthlySavings * 12 > 0 ? `${formatCurrency(monthlySavings * 12)} savings found` : null;
  const actionPartLabel = urgentActionCount > 0 ? `${urgentActionCount} priority action${urgentActionCount > 1 ? 's' : ''}` : null;
  const briefSummary = [homeStatusLabel, actionPartLabel, savingsPartLabel].filter(Boolean).join(' • ');
  const signalCount = Math.max(
    6,
    [homeScore > 0, healthScore > 0, riskScore > 0, financialScore > 0, Boolean(weatherInsight), Boolean(dailySnapshotQuery.data)].filter(Boolean).length * 2
  );
  const verificationLine = `Verified • ${confidenceLabel} • ${signalCount} signals`;

  // --- Primary action derivation ---
  let primaryAction: { title: string; subtitle: string; ctaLabel: string; href: string } | null = null;
  const topUrgentAction = topActions[0];
  if (topUrgentAction) {
    primaryAction = {
      title: topUrgentAction.title,
      subtitle:
        topUrgentAction.description ||
        `${urgentActionCount} priority item${urgentActionCount > 1 ? 's' : ''} need your attention`,
      ctaLabel: 'Review action',
      href: `/dashboard/actions?propertyId=${encodeURIComponent(propertyId || '')}`,
    };
  } else if (seasonalRemaining > 0 && seasonalChecklist) {
    primaryAction = {
      title: `${seasonalChecklist.season} prep needs attention`,
      subtitle: `${seasonalRemaining} task${seasonalRemaining > 1 ? 's' : ''} remaining this season`,
      ctaLabel: 'Review checklist',
      href: `/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId || '')}`,
    };
  } else if (recommendedAction) {
    primaryAction = {
      title: recommendedAction.title,
      subtitle: 'Recommended based on your home profile',
      ctaLabel: 'Review now',
      href: recommendedAction.href || `/dashboard/actions?propertyId=${encodeURIComponent(propertyId || '')}`,
    };
  }

  return (
    <div className="md:hidden">
      <MobilePageContainer className="space-y-5 pt-2">

        {/* ── SECTION 1: COMPACT SMART HEADER ─────────────────────── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="no-brand-style flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
                <LayoutGrid className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
              </div>
              <div className="leading-none">
                <p className="mb-0 text-[15px] font-bold text-[hsl(var(--mobile-text-primary))]">ContractToCozy</p>
                <p className="mb-0 mt-0.5 text-[10px] text-[hsl(var(--mobile-text-muted))]">Home intelligence</p>
              </div>
            </Link>
            <Link
              href="/dashboard/notifications"
              aria-label="Open notifications"
              className="no-brand-style flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))] shadow-sm"
            >
              <Bell className="h-[18px] w-[18px]" />
            </Link>
          </div>

          {properties.length > 0 ? (
            <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
              <SelectTrigger className="h-10 rounded-xl border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[13px] font-medium text-[hsl(var(--mobile-text-primary))] shadow-none focus:ring-[hsl(var(--mobile-brand-strong))]/40">
                <SelectValue placeholder="Select property" />
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
            description="Choose a property to load your mobile home intelligence dashboard."
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
            {/* ── SECTION 2: AI BRIEF STRIP ──────────────────────────── */}
            <section>
              <div className="rounded-[22px] border border-[hsl(var(--mobile-brand-border))]/50 bg-gradient-to-br from-[hsl(var(--mobile-brand-soft))] via-white to-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]" />
                  <span className="text-[11px] font-medium text-[hsl(var(--mobile-brand-strong))]">AI Summary</span>
                </div>
                <h2 className="mb-0 text-[1.25rem] font-semibold leading-[1.2] text-[hsl(var(--mobile-text-primary))]">
                  Good {timeOfDay}, {userFirstName}
                </h2>
                <p className="mb-0 mt-1.5 text-sm leading-snug text-[hsl(var(--mobile-text-secondary))]">
                  {briefSummary}
                </p>
                <div className="mt-3 border-t border-[hsl(var(--mobile-brand-border))]/40 pt-2.5">
                  <p className="mb-0 text-[11px] text-[hsl(var(--mobile-text-muted))]">{verificationLine}</p>
                </div>
              </div>
            </section>

            {/* ── SECTION 3: PRIMARY ACTION CARD ─────────────────────── */}
            {primaryAction ? (
              <section>
                <Link
                  href={primaryAction.href}
                  className="no-brand-style block rounded-[22px] border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_2px_16px_rgba(15,23,42,0.06)] transition-transform active:scale-[0.99]"
                >
                  <p className="mb-1.5 text-[11px] font-semibold tracking-normal text-[hsl(var(--mobile-brand-strong))]">
                    Best next move
                  </p>
                  <h3 className="mb-0 text-[1rem] font-semibold leading-snug text-[hsl(var(--mobile-text-primary))]">
                    {primaryAction.title}
                  </h3>
                  <p className="mb-0 mt-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
                    {primaryAction.subtitle}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[hsl(var(--mobile-border-subtle))] pt-2.5">
                    <span className="text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
                      {primaryAction.ctaLabel}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
                  </div>
                </Link>
              </section>
            ) : null}

            {/* ── SECTION 4: KPI HORIZONTAL RAIL ─────────────────────── */}
            <section>
              <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-0.5 no-scrollbar">
                {/* Health */}
                <div className="min-w-[92px] flex-shrink-0 snap-start rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3">
                  <p className="mb-0 text-[11px] text-[hsl(var(--mobile-text-muted))]">Health</p>
                  <p className={cn(
                    'mb-0 mt-1 text-[1.25rem] font-semibold leading-none',
                    homeScore >= 80 ? 'text-emerald-700' : homeScore >= 60 ? 'text-amber-700' : 'text-rose-700'
                  )}>
                    {homeScore > 0 ? homeScore : '—'}
                  </p>
                  <p className="mb-0 mt-1 text-[10px] text-[hsl(var(--mobile-text-muted))]">/ 100</p>
                </div>

                {/* Savings */}
                <div className={cn(
                  'min-w-[92px] flex-shrink-0 snap-start rounded-2xl border p-3',
                  monthlySavings > 0 ? 'border-emerald-200/90 bg-emerald-50/80' : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
                )}>
                  <p className={cn('mb-0 text-[11px]', monthlySavings > 0 ? 'text-emerald-700' : 'text-[hsl(var(--mobile-text-muted))]')}>Savings</p>
                  <p className={cn('mb-0 mt-1 text-[1.25rem] font-semibold leading-none', monthlySavings > 0 ? 'text-emerald-900' : 'text-[hsl(var(--mobile-text-primary))]')}>
                    {monthlySavings > 0 ? formatCurrency(monthlySavings * 12) : '—'}
                  </p>
                  <p className={cn('mb-0 mt-1 text-[10px]', monthlySavings > 0 ? 'text-emerald-600' : 'text-[hsl(var(--mobile-text-muted))]')}>/yr found</p>
                </div>

                {/* Risk */}
                <div className={cn(
                  'min-w-[92px] flex-shrink-0 snap-start rounded-2xl border p-3',
                  riskExposure > 5000 ? 'border-rose-200/90 bg-rose-50/80' : riskExposure > 0 ? 'border-amber-200/90 bg-amber-50/85' : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
                )}>
                  <p className={cn('mb-0 text-[11px]', riskExposure > 5000 ? 'text-rose-700' : riskExposure > 0 ? 'text-amber-700' : 'text-[hsl(var(--mobile-text-muted))]')}>Risk</p>
                  <p className={cn(
                    'mb-0 mt-1 text-[1.25rem] font-semibold leading-none',
                    riskExposure > 5000 ? 'text-rose-900' : riskExposure > 0 ? 'text-amber-900' : 'text-[hsl(var(--mobile-text-primary))]'
                  )}>
                    {riskExposure > 0 ? formatCurrency(riskExposure) : 'None'}
                  </p>
                  <p className={cn('mb-0 mt-1 text-[10px]', riskExposure > 0 ? (riskExposure > 5000 ? 'text-rose-600' : 'text-amber-600') : 'text-[hsl(var(--mobile-text-muted))]')}>exposure</p>
                </div>

                {/* Actions */}
                <div className={cn(
                  'min-w-[92px] flex-shrink-0 snap-start rounded-2xl border p-3',
                  urgentActionCount > 0 ? 'border-amber-200/90 bg-amber-50/85' : 'border-[hsl(var(--mobile-border-subtle))] bg-white'
                )}>
                  <p className={cn('mb-0 text-[11px]', urgentActionCount > 0 ? 'text-amber-700' : 'text-[hsl(var(--mobile-text-muted))]')}>Actions</p>
                  <p className={cn('mb-0 mt-1 text-[1.25rem] font-semibold leading-none', urgentActionCount > 0 ? 'text-amber-900' : 'text-[hsl(var(--mobile-text-primary))]')}>
                    {urgentActionCount}
                  </p>
                  <p className={cn('mb-0 mt-1 text-[10px]', urgentActionCount > 0 ? 'text-amber-600' : 'text-[hsl(var(--mobile-text-muted))]')}>
                    {urgentActionCount === 1 ? 'open' : 'open'}
                  </p>
                </div>
              </div>
            </section>

            {/* ── SECTION 5: QUICK NAV GRID ───────────────────────────── */}
            <section>
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    label: 'Rooms',
                    Icon: LayoutGrid,
                    href: buildPropertyAwareHref(propertyId, 'rooms', 'rooms'),
                  },
                  {
                    label: 'Vault',
                    Icon: Wallet,
                    href: buildPropertyAwareHref(propertyId, 'vault', 'vault'),
                  },
                  {
                    label: 'Fix',
                    Icon: Wrench,
                    href: buildAiToolHref(propertyId, '/dashboard/fix'),
                  },
                  {
                    label: 'Reports',
                    Icon: FileText,
                    href: dailySnapshotHref,
                  },
                ].map(({ label, Icon, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="no-brand-style flex flex-col items-center gap-1.5 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-1 py-3 text-center shadow-sm transition-transform active:scale-95"
                  >
                    <Icon className="h-5 w-5 text-[hsl(var(--mobile-text-secondary))]" />
                    <span className="text-[10px] font-medium leading-none text-[hsl(var(--mobile-text-secondary))]">
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* ── SECTION 6: DYNAMIC MODULES ─────────────────────────── */}

            {/* Seasonal Tasks — shown if tasks remain */}
            {seasonalRemaining > 0 && seasonalChecklist ? (
              <ExpandableSummaryCard
                title="Seasonal Tasks"
                summary={`${seasonalChecklist.season} · ${seasonalRemaining} task${seasonalRemaining > 1 ? 's' : ''} remaining`}
                metric={`${seasonalRemaining} left`}
              >
                <div className="space-y-2.5">
                  {seasonalPreview.length > 0 ? (
                    seasonalPreview.map((task: { id: string; title: string }) => (
                      <PreviewListRow
                        key={task.id}
                        title={task.title}
                        subtitle="Seasonal recommendation"
                        icon={
                          <IconBadge tone="info">
                            <Flame className="h-4 w-4" />
                          </IconBadge>
                        }
                      />
                    ))
                  ) : (
                    <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">No pending tasks this season.</p>
                  )}
                  <Link
                    href={`/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`}
                    className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Review Tasks
                  </Link>
                </div>
              </ExpandableSummaryCard>
            ) : null}

            {/* Rooms — shown if rooms exist */}
            {rooms.length > 0 ? (
              <ExpandableSummaryCard
                title="Rooms"
                summary={`${rooms.length} room${rooms.length > 1 ? 's' : ''} · ${totalCoverageGaps > 0 ? `${totalCoverageGaps} coverage gap${totalCoverageGaps > 1 ? 's' : ''}` : 'coverage up to date'}`}
                metric={totalCoverageGaps > 0 ? `${totalCoverageGaps} gaps` : 'Protected'}
              >
                <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                  {previewRooms.map((room) => {
                    const stats = roomInsightsQuery.data?.[room.id];
                    return (
                      <Link
                        key={room.id}
                        href={roomsHref}
                        className="no-brand-style min-w-[130px] flex-shrink-0 snap-start rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3"
                      >
                        <p className="mb-1 text-2xl leading-none">{roomEmoji(room.name)}</p>
                        <p className="mb-0 truncate text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                          {room.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          <span className="inline-flex items-center gap-0.5">
                            <Package className="h-3 w-3" />
                            {stats?.itemCount ?? 0}
                          </span>
                          {(stats?.coverageGapsCount ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-rose-600">
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
                  className="no-brand-style mt-1 flex min-h-[44px] items-center justify-center gap-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
                >
                  View all rooms
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </ExpandableSummaryCard>
            ) : null}

            {/* Home Event Radar — shown if active events */}
            {radarActiveCount > 0 ? (
              <ExpandableSummaryCard
                title="Home Event Radar"
                summary={`${radarActiveCount} active event${radarActiveCount > 1 ? 's' : ''} matched to your home`}
                metric={radarNewCount > 0 ? `${radarNewCount} new` : 'Active'}
              >
                <Link
                  href={radarHref}
                  className="no-brand-style flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                >
                  Open Radar
                </Link>
              </ExpandableSummaryCard>
            ) : null}

            {/* ── SECTION 7: SECONDARY EXPANDABLE MODULES ────────────── */}

            {/* Property Intelligence */}
            <ExpandableSummaryCard
              title="Property Intelligence"
              summary={`HomeScore ${homeScore > 0 ? homeScore : '—'}/100 · ${confidenceLabel}`}
              metric={homeScore > 0 ? `${homeScore}/100` : '—'}
            >
              <div className="space-y-2.5">
                <MetricRow
                  label="Health"
                  value={`${healthScore}/100`}
                  trend={
                    <StatusChip tone={scoreChipTone(healthScore)}>
                      {healthScore >= 80 ? 'Good' : healthScore >= 60 ? 'Elevated' : 'Needs work'}
                    </StatusChip>
                  }
                />
                <MetricRow
                  label="Risk"
                  value={`${riskScore}/100`}
                  trend={
                    <StatusChip tone={riskChipTone(riskScore)}>
                      {riskScore >= 80 ? 'Protected' : riskScore >= 60 ? 'Elevated' : 'High risk'}
                    </StatusChip>
                  }
                />
                <MetricRow
                  label="Financial"
                  value={`${financialScore}/100`}
                  trend={
                    <StatusChip tone={scoreChipTone(financialScore)}>
                      {financialScore >= 80 ? 'Strong' : financialScore >= 60 ? 'Stable' : 'Needs work'}
                    </StatusChip>
                  }
                />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href={dailySnapshotHref}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-xs font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Daily Snapshot
                  </Link>
                  <Link
                    href={riskRadarHref}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-xs font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Risk Radar
                  </Link>
                </div>
              </div>
            </ExpandableSummaryCard>

            {/* Action Center */}
            <ExpandableSummaryCard
              title="Action Center"
              summary={
                urgentActionCount > 0
                  ? `${urgentActionCount} priority item${urgentActionCount > 1 ? 's' : ''} queued`
                  : 'No high-priority items'
              }
              metric={`${urgentActionCount} open`}
            >
              <div className="space-y-2.5">
                {topActions.length > 0 ? (
                  topActions.map((action) => (
                    <PreviewListRow
                      key={`action-${action.actionKey}`}
                      title={action.title}
                      subtitle={action.description || 'Prioritized action'}
                      icon={
                        <IconBadge tone="danger">
                          <Shield className="h-4 w-4" />
                        </IconBadge>
                      }
                    />
                  ))
                ) : (
                  <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                    You are caught up. No urgent action needed now.
                  </p>
                )}
                <Link
                  href={`/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
                  className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] text-sm font-semibold text-white"
                >
                  Go to Action Center
                </Link>
              </div>
            </ExpandableSummaryCard>

            {/* Financial Insights */}
            <ExpandableSummaryCard
              title="Financial Insights"
              summary={
                monthlySavings > 0
                  ? `${formatCurrency(monthlySavings)}/mo in savings opportunities`
                  : 'High-value money signals'
              }
              metric={monthlySavings > 0 ? formatCurrency(monthlySavings * 12) : '—'}
            >
              <div className="space-y-2.5">
                <MetricRow
                  label="Annual exposure"
                  value={formatCurrency(financialSummaryQuery.data?.financialExposureTotal)}
                />
                <MetricRow
                  label="Monthly savings"
                  value={formatCurrency(monthlySavings)}
                  trend={
                    monthlySavings > 0 ? (
                      <span className="text-emerald-600">Opportunity</span>
                    ) : (
                      <span className="text-[hsl(var(--mobile-text-muted))]">No signal</span>
                    )
                  }
                />
                <MetricRow
                  label="Annual savings"
                  value={formatCurrency(savingsQuery.data?.potentialAnnualSavings)}
                />
                <Link
                  href={buildPropertyAwareHref(propertyId, 'tools/home-savings', 'tool:home-savings')}
                  className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                >
                  Open Financial Tools
                </Link>
              </div>
              <MoneyImpactTrackerCard
                annualExposure={financialSummaryQuery.data?.financialExposureTotal || 0}
                annualSavings={savingsQuery.data?.potentialAnnualSavings || 0}
                monthlySavings={monthlySavings}
                weeklyFinancialDelta={snapshotsQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null}
                financialTrend={(snapshotsQuery.data?.scores?.FINANCIAL?.trend || []).map((point) => point.score)}
              />
            </ExpandableSummaryCard>

            {/* AI Tools */}
            <ExpandableSummaryCard
              title="AI Tools"
              summary="Smart insights powered by home data"
              metric="4 tools"
            >
              <QuickActionGrid className="gap-2.5">
                {aiToolTiles.map((tile) => (
                  <QuickActionTile key={tile.title} {...tile} variant="compact" />
                ))}
              </QuickActionGrid>
            </ExpandableSummaryCard>

            {/* Home Tools */}
            <ExpandableSummaryCard
              title="Home Tools"
              summary="Ownership planning at a glance"
              metric="4 tools"
            >
              <QuickActionGrid className="gap-2.5">
                {homeToolTiles.map((tile) => (
                  <QuickActionTile key={tile.title} {...tile} variant="compact" />
                ))}
              </QuickActionGrid>
              <Link
                href={homeToolsPageHref}
                className="no-brand-style mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
              >
                View all tools
                <ChevronRight className="h-4 w-4" />
              </Link>
            </ExpandableSummaryCard>

            {/* What's New — local updates */}
            {localUpdates.length > 0 ? (
              <ExpandableSummaryCard
                title="What's New"
                summary={`${localUpdates.length} update${localUpdates.length > 1 ? 's' : ''} available`}
                metric={`${localUpdates.length} new`}
              >
                <div className="space-y-2">
                  {localUpdates.slice(0, 3).map((update) => (
                    <PreviewListRow
                      key={update.id}
                      title={update.title}
                      subtitle={update.shortDescription}
                      href={resolveLocalUpdateHref(update.ctaUrl)}
                      onClick={() => trackLocalUpdateProgress(update)}
                      icon={<Sparkles className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />}
                    />
                  ))}
                </div>
              </ExpandableSummaryCard>
            ) : null}
          </>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <section className="py-2">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(var(--mobile-border-subtle))] to-transparent" />
          <p className="mb-0 mt-3 text-center text-xs text-[hsl(var(--mobile-text-muted))]">
            Home intelligence centered on status, change, and action.
          </p>
          <div className="mt-2 flex items-center justify-center gap-3 text-[hsl(var(--mobile-text-muted))]">
            <TrendingUp className="h-4 w-4" />
            <Shield className="h-4 w-4" />
            <Wallet className="h-4 w-4" />
          </div>
        </section>

      </MobilePageContainer>
    </div>
  );
}
