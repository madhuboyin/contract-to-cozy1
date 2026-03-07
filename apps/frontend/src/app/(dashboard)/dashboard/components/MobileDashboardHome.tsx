'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CircleUserRound,
  Flame,
  LayoutGrid,
  Shield,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { getDailySnapshot } from '@/lib/api/dailySnapshotApi';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { listInventoryRooms } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CompactInsightStrip,
  EmptyStateCard,
  ExpandableSummaryCard,
  HeroSummaryCard,
  IconBadge,
  MetricRow,
  MobileHorizontalScroller,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  PreviewListRow,
  QuickActionGrid,
  QuickActionTile,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { AI_TOOL_ARTWORK } from '@/components/mobile/dashboard/aiToolArtwork';
import { MoneyImpactTrackerCard } from '@/components/mobile/dashboard/MoneyImpactTrackerCard';
import type { ScoredProperty } from '../types';

type MobileDashboardHomeProps = {
  userFirstName: string;
  properties: ScoredProperty[];
  selectedPropertyId: string | undefined;
  onPropertyChange: (propertyId: string) => void;
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
  if (!propertyId) return toolHref;
  const separator = toolHref.includes('?') ? '&' : '?';
  return `${toolHref}${separator}propertyId=${encodeURIComponent(propertyId)}`;
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

export default function MobileDashboardHome({
  userFirstName,
  properties,
  selectedPropertyId,
  onPropertyChange,
}: MobileDashboardHomeProps) {
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const propertyId = selectedProperty?.id;

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

  const homeScore = Math.round(homeScoreQuery.data?.homeScore ?? 0);
  const healthScore = Math.round(selectedProperty?.healthScore?.totalScore ?? 0);
  const riskScore = Math.round(riskSummaryQuery.data?.riskScore ?? 0);
  const financialScore = Math.round(financialSummaryQuery.data?.financialEfficiencyScore ?? 0);
  const riskExposure = Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0);
  const urgentActionCount = orchestrationQuery.data?.pendingActionCount ?? 0;
  const topActions = (orchestrationQuery.data?.actions ?? []).slice(0, 2);
  const overdueCount = maintenanceStatsQuery.data?.overdue ?? 0;

  const weatherInsight = dailySnapshotQuery.data?.payload?.weatherInsight?.headline;
  const recommendedAction = homeScoreQuery.data?.nextBestAction;

  const heroSignals = [
    weatherInsight || 'No severe weather alert right now',
    riskExposure > 0
      ? `${formatCurrency(riskExposure)} exposure detected`
      : 'No major exposure flagged',
    urgentActionCount > 0
      ? `${urgentActionCount} pending action${urgentActionCount > 1 ? 's' : ''}`
      : 'No urgent actions pending',
  ];

  const riskDelta = snapshotsQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? null;
  const homeDelta = homeScoreQuery.data?.deltaFromPreviousWeek ?? null;
  const monthlySavings = savingsQuery.data?.potentialMonthlySavings ?? 0;
  const sinceLastVisitItems = [
    riskDelta !== null
      ? {
          label: `Risk ${riskDelta > 0 ? '+' : ''}${riskDelta.toFixed(1)}`,
          tone: riskDelta > 0 ? ('elevated' as const) : ('good' as const),
        }
      : null,
    weatherInsight
      ? {
          label: weatherInsight,
          tone: /freeze|storm|flood|risk|alert/i.test(weatherInsight)
            ? ('danger' as const)
            : ('info' as const),
        }
      : null,
    homeDelta !== null
      ? {
          label: `HomeScore ${homeDelta > 0 ? '+' : ''}${Math.round(homeDelta)}`,
          tone: homeDelta >= 0 ? ('good' as const) : ('elevated' as const),
        }
      : monthlySavings > 0
        ? {
            label: `Savings found ${formatCurrency(monthlySavings)}/mo`,
            tone: 'good' as const,
          }
        : null,
  ].filter(Boolean) as Array<{ label: string; tone?: 'good' | 'elevated' | 'danger' | 'info' }>;

  const seasonalChecklist = seasonalQuery.data;
  const seasonalItems = seasonalChecklist?.items ?? [];
  const seasonalRemaining = Math.max(
    0,
    Number(seasonalChecklist?.totalTasks ?? 0) - Number(seasonalChecklist?.tasksCompleted ?? 0)
  );
  const seasonalPreview = seasonalItems
    .filter((item: { status?: string }) => String(item.status || '').toUpperCase() !== 'ADDED')
    .slice(0, 2);

  const rooms = roomsQuery.data ?? [];
  const roomsHref = buildPropertyAwareHref(propertyId, 'rooms', 'rooms');
  const dailySnapshotHref = `/dashboard/daily-snapshot?propertyId=${encodeURIComponent(propertyId || '')}`;
  const riskRadarHref = `/dashboard/risk-radar?propertyId=${encodeURIComponent(propertyId || '')}`;

  const aiToolTiles = [
    {
      title: 'Repair vs Replace',
      subtitle: monthlySavings > 0 ? `Save ${formatCurrency(monthlySavings)}` : 'Smart fix decisions',
      icon: '🛠️',
      trailingIcon: '🔧',
      artworkSrc: AI_TOOL_ARTWORK['repair-vs-replace'],
      href: buildAiToolHref(propertyId, '/dashboard/replace-repair'),
      tone: 'neutral' as const,
    },
    {
      title: 'Risk Optimizer',
      subtitle:
        riskScore > 0 ? `${Math.max(0, Math.round((100 - riskScore) / 20))} risks detected` : 'Optimize premium strategy',
      icon: '📉',
      trailingIcon: '🛡️',
      artworkSrc: AI_TOOL_ARTWORK['risk-optimizer'],
      href: buildAiToolHref(propertyId, '/dashboard/risk-premium-optimizer'),
      tone: 'neutral' as const,
    },
    {
      title: 'Coverage Intelligence',
      subtitle: riskExposure > 0 ? `Protect ${formatCurrency(riskExposure)}` : 'Maximize protection',
      icon: '🧾',
      trailingIcon: '✅',
      artworkSrc: AI_TOOL_ARTWORK['coverage-intelligence'],
      href: buildAiToolHref(propertyId, '/dashboard/coverage-intelligence'),
      tone: 'neutral' as const,
    },
    {
      title: 'View All',
      subtitle: 'Explore all tools',
      icon: '🧰',
      trailingIcon: '›',
      artworkSrc: AI_TOOL_ARTWORK['view-all'],
      href: buildAiToolHref(propertyId, '/dashboard/ai-tools'),
      tone: 'brand' as const,
    },
  ];

  return (
    <div className="md:hidden">
      <MobilePageContainer className="mobile-stack-sections">
        <MobileSection className="pt-1">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="no-brand-style flex items-center gap-2">
              <IconBadge tone="brand">
                <LayoutGrid className="h-4 w-4" />
              </IconBadge>
              <div>
                <p className="mb-0 text-lg font-semibold text-[hsl(var(--mobile-text-primary))]">ContractToCozy</p>
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">Home intelligence</p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/notifications"
                aria-label="Open notifications"
                className="no-brand-style inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]"
              >
                <Bell className="h-5 w-5" />
              </Link>
              <Link
                href="/dashboard/profile"
                aria-label="Open profile"
                className="no-brand-style inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]"
              >
                <CircleUserRound className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {properties.length > 0 ? (
            <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
              <SelectTrigger className="h-11 rounded-xl border-[hsl(var(--mobile-border-subtle))] bg-white text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
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
        </MobileSection>

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
            <MobileSection>
              <HeroSummaryCard
                eyebrow="Your Home Today"
                title={`Good ${new Date().getHours() < 12 ? 'Morning' : 'Evening'}, ${userFirstName}`}
                metric={`HomeScore ${homeScore}/100`}
                status={
                  <StatusChip tone={scoreChipTone(homeScore)}>
                    {homeScore >= 80 ? 'Good' : homeScore >= 60 ? 'Elevated' : 'Needs Action'}
                  </StatusChip>
                }
                signals={heroSignals}
                ctaLabel={recommendedAction?.title || 'Recommended Today'}
                ctaHref={recommendedAction?.href || `/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
              />
            </MobileSection>

            <MobileSection>
              <MobileSectionHeader title="Since Last Visit" />
              <CompactInsightStrip
                href={dailySnapshotHref}
                items={
                  sinceLastVisitItems.length
                    ? sinceLastVisitItems
                    : [{ label: 'No major changes detected', tone: 'info' }]
                }
              />
            </MobileSection>

            <MobileSection>
              <MobileSectionHeader
                title="AI Tools"
                subtitle="Smart insights for your home"
                action={
                  <Link href={buildAiToolHref(propertyId, '/dashboard/ai-tools')} className="no-brand-style text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
                    View all
                  </Link>
                }
              />
              <QuickActionGrid>
                {aiToolTiles.map((tile) => (
                  <QuickActionTile key={tile.title} {...tile} />
                ))}
              </QuickActionGrid>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Attention Today"
                subtitle="Urgency unified into one focus block"
                action={
                  <StatusChip tone={urgentActionCount > 0 || overdueCount > 0 ? 'needsAction' : 'good'}>
                    {urgentActionCount + overdueCount} items
                  </StatusChip>
                }
              >
                <MetricRow
                  label="Urgent actions"
                  value={`${urgentActionCount}`}
                  trend={
                    urgentActionCount > 0 ? (
                      <span className="inline-flex items-center text-rose-600">
                        <Flame className="mr-1 h-3.5 w-3.5" />
                        High
                      </span>
                    ) : (
                      <span className="text-emerald-600">Clear</span>
                    )
                  }
                />
                <MetricRow
                  label="Overdue tasks"
                  value={`${overdueCount}`}
                  trend={overdueCount > 0 ? <span className="text-amber-600">Elevated</span> : <span className="text-emerald-600">On track</span>}
                />
                <MetricRow
                  label="Money at risk"
                  value={formatCurrency(riskExposure)}
                  trend={riskExposure > 0 ? <span className="text-rose-600">Exposure</span> : <span className="text-emerald-600">Protected</span>}
                />
                {topActions.length > 0 ? (
                  <div className="pt-1">
                    {topActions.map((action) => (
                      <PreviewListRow
                        key={action.actionKey}
                        title={action.title}
                        subtitle={action.description || 'Needs review'}
                        icon={
                          <IconBadge tone="warning">
                            <Wrench className="h-4 w-4" />
                          </IconBadge>
                        }
                      />
                    ))}
                  </div>
                ) : null}
                <Link
                  href={`/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
                  className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                >
                  Review Actions
                </Link>
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Property Intelligence"
                subtitle="Glanceable score summary"
                action={
                  <Link href={riskRadarHref} className="no-brand-style text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
                    Risk Radar
                  </Link>
                }
              >
                <MetricRow
                  label="HomeScore"
                  value={`${homeScore}/100`}
                  trend={<StatusChip tone={scoreChipTone(homeScore)}>{homeScore >= 80 ? 'Good' : homeScore >= 60 ? 'Elevated' : 'Needs Action'}</StatusChip>}
                />
                <MetricRow
                  label="Health"
                  value={`${healthScore}/100`}
                  trend={<StatusChip tone={scoreChipTone(healthScore)}>{healthScore >= 80 ? 'Good' : healthScore >= 60 ? 'Elevated' : 'At Risk'}</StatusChip>}
                />
                <MetricRow
                  label="Risk"
                  value={`${riskScore}/100`}
                  trend={<StatusChip tone={riskChipTone(riskScore)}>{riskScore >= 80 ? 'Protected' : riskScore >= 60 ? 'Elevated' : 'At Risk'}</StatusChip>}
                />
                <MetricRow
                  label="Financial"
                  value={`${financialScore}/100`}
                  trend={<StatusChip tone={scoreChipTone(financialScore)}>{financialScore >= 80 ? 'Strong' : financialScore >= 60 ? 'Stable' : 'Needs Work'}</StatusChip>}
                />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link
                    href={dailySnapshotHref}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-xs font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Daily Snapshot
                  </Link>
                  <Link
                    href={riskRadarHref}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-xs font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Open Risk Radar
                  </Link>
                </div>
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <ExpandableSummaryCard
                title="Seasonal Tasks"
                summary={
                  seasonalChecklist
                    ? `${seasonalChecklist.season} tasks for ${seasonalChecklist.year}`
                    : 'Seasonal checklist unavailable'
                }
                metric={`${seasonalRemaining} remaining`}
              >
                {seasonalChecklist ? (
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
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                        No pending tasks for this season.
                      </p>
                    )}
                    <Link
                      href={`/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`}
                      className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                    >
                      Review Tasks
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                    Seasonal checklist will appear once generated.
                  </p>
                )}
              </ExpandableSummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Rooms Snapshot"
                subtitle="Room-level coverage at a glance"
                action={
                  <Link href={roomsHref} className="no-brand-style text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
                    View all
                  </Link>
                }
              >
                {rooms.length > 0 ? (
                  <MobileHorizontalScroller>
                    {rooms.slice(0, 6).map((room) => (
                      <Link
                        key={room.id}
                        href={roomsHref}
                        className="no-brand-style min-w-[162px] snap-start rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3"
                      >
                        <p className="mb-1 text-2xl leading-none">{roomEmoji(room.name)}</p>
                        <p className="mb-0 truncate text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                          {room.name}
                        </p>
                        <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
                          Floor {room.floorLevel ?? 0}
                        </p>
                      </Link>
                    ))}
                  </MobileHorizontalScroller>
                ) : (
                  <EmptyStateCard
                    title="No rooms yet"
                    description="Add your first room to start room-level tracking."
                    action={
                      <Link
                        href={buildPropertyAwareHref(propertyId, 'inventory/rooms', 'inventory-rooms')}
                        className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                      >
                        Add Rooms
                      </Link>
                    }
                  />
                )}
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Financial Insights"
                subtitle="High-value money signals"
                action={
                  <IconBadge tone="positive">
                    <Wallet className="h-4 w-4" />
                  </IconBadge>
                }
              >
                <MetricRow
                  label="Annual ownership exposure"
                  value={formatCurrency(financialSummaryQuery.data?.financialExposureTotal)}
                />
                <MetricRow
                  label="Potential monthly savings"
                  value={formatCurrency(monthlySavings)}
                  trend={monthlySavings > 0 ? <span className="text-emerald-600">Opportunity</span> : <span className="text-gray-500">No signal</span>}
                />
                <MetricRow
                  label="Potential annual savings"
                  value={formatCurrency(savingsQuery.data?.potentialAnnualSavings)}
                />
                <Link
                  href={buildPropertyAwareHref(propertyId, 'tools/home-savings', 'tool:home-savings')}
                  className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                >
                  Open Financial Tools
                </Link>
              </SummaryCard>
              <MoneyImpactTrackerCard
                annualExposure={financialSummaryQuery.data?.financialExposureTotal || 0}
                annualSavings={savingsQuery.data?.potentialAnnualSavings || 0}
                monthlySavings={monthlySavings}
                weeklyFinancialDelta={snapshotsQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null}
                financialTrend={(snapshotsQuery.data?.scores?.FINANCIAL?.trend || []).map((point) => point.score)}
              />
            </MobileSection>

            <MobileSection>
              <ExpandableSummaryCard
                title="Action Center"
                summary={
                  urgentActionCount > 0
                    ? `${urgentActionCount} priority items queued`
                    : 'No high-priority items queued'
                }
                metric={`${urgentActionCount} open`}
              >
                <div className="space-y-2.5">
                  {topActions.length > 0 ? (
                    topActions.map((action) => (
                      <PreviewListRow
                        key={`action-preview-${action.actionKey}`}
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
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Go to Action Center
                  </Link>
                </div>
              </ExpandableSummaryCard>
            </MobileSection>
          </>
        )}

        <MobileSection className="pt-1">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(var(--mobile-border-subtle))] to-transparent" />
          <p className="mb-0 text-center text-xs text-[hsl(var(--mobile-text-muted))]">
            Home intelligence centered on status, change, and action.
          </p>
          <div className="flex items-center justify-center gap-3 text-[hsl(var(--mobile-text-muted))]">
            <TrendingUp className="h-4 w-4" />
            <Shield className="h-4 w-4" />
            <Wallet className="h-4 w-4" />
          </div>
        </MobileSection>
      </MobilePageContainer>
    </div>
  );
}
