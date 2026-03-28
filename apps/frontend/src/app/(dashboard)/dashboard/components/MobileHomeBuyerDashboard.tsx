'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, CircleUserRound, Home, Sparkles, Truck, FileText, Shield, Wallet } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import type { Booking, ChecklistItem, LocalUpdate } from '@/types';
import type { ScoredProperty } from '../types';
import {
  CompactInsightStrip,
  EmptyStateCard,
  ExpandableSummaryCard,
  HeroSummaryCard,
  IconBadge,
  MetricRow,
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
import { resolveIconByConcept, resolveToolIcon } from '@/lib/icons';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import {
  appendGuidanceContinuityToHref,
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';

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

type MobileHomeBuyerDashboardProps = {
  userFirstName: string;
  properties: ScoredProperty[];
  selectedPropertyId: string | undefined;
  onPropertyChange: (propertyId: string) => void;
  bookings: Booking[];
  checklistItems: ChecklistItem[];
  localUpdates: LocalUpdate[];
};

export default function MobileHomeBuyerDashboard({
  userFirstName,
  properties,
  selectedPropertyId,
  onPropertyChange,
  bookings,
  checklistItems,
  localUpdates,
}: MobileHomeBuyerDashboardProps) {
  const searchParams = useSearchParams();
  const guidanceContext = React.useMemo(
    () => extractGuidanceContinuityContext(searchParams),
    [searchParams]
  );
  const hasGuidanceContext = hasGuidanceContinuityContext(guidanceContext);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const heroProperty = selectedProperty || properties[0];
  const propertyId = selectedProperty?.id || properties[0]?.id;
  const selectedPropertyName = selectedProperty?.name || selectedProperty?.address || 'Primary Property';

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
        console.warn('[mobile-home-buyer] local update guidance hook failed:', error);
      });
    },
    [guidanceContext, hasGuidanceContext, propertyId, resolveLocalUpdateHref]
  );

  const buyerStatsQuery = useQuery({
    queryKey: ['mobile-home-buyer-task-stats'],
    queryFn: async () => {
      const response = await api.getHomeBuyerTaskStats();
      if (!response.success) return null;
      return response.data;
    },
    staleTime: 3 * 60 * 1000,
  });

  const homeScoreQuery = useQuery({
    queryKey: ['mobile-home-buyer-home-score', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getHomeScoreReport(propertyId, 8);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const riskSummaryQuery = useQuery({
    queryKey: ['mobile-home-buyer-risk-summary', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const report = await api.getRiskReportSummary(propertyId);
      if (report === 'QUEUED') return null;
      return report;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const savingsQuery = useQuery({
    queryKey: ['mobile-home-buyer-home-savings', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return getHomeSavingsSummary(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const seasonalQuery = useQuery({
    queryKey: ['mobile-home-buyer-seasonal-checklist', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const result = await seasonalAPI.getCurrentChecklist(propertyId);
      return result?.checklist ?? null;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const stats = buyerStatsQuery.data;
  const progress = Math.round(stats?.progressPercentage ?? 0);
  const pending = stats?.pending ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const completed = stats?.completed ?? 0;
  const total = stats?.total ?? 0;

  const openChecklist = checklistItems
    .filter((item) => item.status === 'PENDING')
    .slice(0, 3);

  const upcomingBooking = [...(bookings || [])]
    .filter((booking) => booking.scheduledDate)
    .sort(
      (a, b) =>
        new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime()
    )[0];

  const heroSignals = [
    `${pending} pending closing task${pending === 1 ? '' : 's'}`,
    `${inProgress} task${inProgress === 1 ? '' : 's'} in progress`,
    upcomingBooking?.service
      ? `Upcoming: ${upcomingBooking.service}`
      : 'No upcoming booked service',
  ];

  const sinceLastVisitItems = [
    { label: `Closing ${progress}%`, tone: progress >= 60 ? ('good' as const) : ('elevated' as const) },
    { label: `${completed}/${total || 0} tasks complete`, tone: 'info' as const },
    upcomingBooking?.service
      ? { label: `Upcoming booking: ${upcomingBooking.service}`, tone: 'info' as const }
      : { label: 'Add first provider booking', tone: 'elevated' as const },
  ];

  const aiToolTiles = [
    {
      title: 'Moving Concierge',
      subtitle: 'Plan your move timeline',
      icon: React.createElement(resolveIconByConcept('tasks', Truck), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveIconByConcept('tasks', Truck), { className: 'h-5 w-5' }),
      artworkSrc: AI_TOOL_ARTWORK['repair-vs-replace'],
      href: buildAiToolHref(propertyId, '/dashboard/moving-concierge'),
      tone: 'neutral' as const,
    },
    {
      title: 'Inspection Intelligence',
      subtitle: 'Extract key issues fast',
      icon: React.createElement(resolveIconByConcept('review', FileText), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveIconByConcept('review', FileText), { className: 'h-5 w-5' }),
      artworkSrc: AI_TOOL_ARTWORK['coverage-intelligence'],
      href: buildAiToolHref(propertyId, '/dashboard/inspection-report'),
      tone: 'neutral' as const,
    },
    {
      title: 'Coverage Intelligence',
      subtitle: 'Review protection early',
      icon: React.createElement(resolveToolIcon('ai', 'coverage-intelligence', Shield), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'coverage-intelligence', Shield), { className: 'h-5 w-5' }),
      artworkSrc: AI_TOOL_ARTWORK['risk-optimizer'],
      href: buildAiToolHref(propertyId, '/dashboard/coverage-intelligence'),
      tone: 'neutral' as const,
    },
    {
      title: 'View All',
      subtitle: 'Explore all tools',
      icon: React.createElement(resolveToolIcon('ai', 'view-all', Sparkles), { className: 'h-5 w-5' }),
      trailingIcon: React.createElement(resolveToolIcon('ai', 'view-all', Sparkles), { className: 'h-5 w-5' }),
      artworkSrc: AI_TOOL_ARTWORK['view-all'],
      href: buildAiToolHref(propertyId, '/dashboard/ai-tools'),
      tone: 'brand' as const,
    },
  ];

  const riskScore = Math.round(riskSummaryQuery.data?.riskScore ?? 0);
  const homeScore = Math.round(homeScoreQuery.data?.homeScore ?? 0);
  const exposure = Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0);
  const seasonalChecklist = seasonalQuery.data;
  const seasonalRemaining = Math.max(
    0,
    Number(seasonalChecklist?.totalTasks ?? 0) - Number(seasonalChecklist?.tasksCompleted ?? 0)
  );

  return (
    <div className="md:hidden">
      <MobilePageContainer className="mobile-stack-sections">
        <MobileSection className="pt-1">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="no-brand-style flex items-center gap-2">
              <IconBadge tone="brand">
                <Home className="h-4 w-4" />
              </IconBadge>
              <div>
                <p className="mb-0 text-lg font-semibold text-[hsl(var(--mobile-text-primary))]">ContractToCozy</p>
                <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">Home journey intelligence</p>
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
            <Select value={selectedPropertyId || properties[0]?.id || ''} onValueChange={onPropertyChange}>
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
            description="Choose a property to load your home-buyer dashboard."
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
                title={`Welcome, ${userFirstName}`}
                metric={`Closing ${progress}%`}
                mediaSrc={heroProperty?.coverPhoto?.fileUrl || undefined}
                mediaAlt={heroProperty?.name || heroProperty?.address || 'Property photo'}
                mediaFallbackSrc="/images/home-cozy-illustration.png"
                status={<StatusChip tone={progress >= 70 ? 'good' : progress >= 40 ? 'elevated' : 'needsAction'}>{progress >= 70 ? 'On Track' : 'Needs Focus'}</StatusChip>}
                signals={heroSignals}
                ctaLabel={pending > 0 ? 'Review Next Task' : 'View Checklist'}
                ctaHref="/dashboard/checklist"
              />
            </MobileSection>

            <MobileSection>
              <MobileSectionHeader title="Since Last Visit" />
              <CompactInsightStrip items={sinceLastVisitItems} />
            </MobileSection>

            {localUpdates.length > 0 ? (
              <MobileSection>
                <ExpandableSummaryCard
                  title="What's New"
                  summary={`${localUpdates.length} local updates`}
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
              </MobileSection>
            ) : null}

            <MobileSection>
              <MobileSectionHeader title="AI Tools" subtitle="Smart guidance for home buyers" />
              <QuickActionGrid>
                {aiToolTiles.map((tile) => (
                  <QuickActionTile key={tile.title} {...tile} />
                ))}
              </QuickActionGrid>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Attention Today"
                subtitle="Priority items for closing momentum"
                action={<StatusChip tone={pending > 0 ? 'needsAction' : 'good'}>{pending} pending</StatusChip>}
              >
                <MetricRow label="Pending tasks" value={`${pending}`} />
                <MetricRow label="In progress tasks" value={`${inProgress}`} />
                <MetricRow
                  label="Upcoming booking"
                  value={
                    upcomingBooking?.scheduledDate
                      ? new Date(upcomingBooking.scheduledDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'None'
                  }
                />
                <div className="space-y-2 pt-1">
                  {openChecklist.map((item) => (
                    <PreviewListRow
                      key={item.id}
                      title={item.title}
                      subtitle="Checklist task"
                      href="/dashboard/checklist"
                      icon={<Truck className="h-4 w-4 text-amber-600" />}
                    />
                  ))}
                </div>
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard title="Property Intelligence" subtitle={selectedPropertyName}>
                <MetricRow label="HomeScore" value={`${homeScore}/100`} />
                <MetricRow label="Risk score" value={`${riskScore}/100`} />
                <MetricRow label="Exposure signal" value={formatCurrency(exposure)} />
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <ExpandableSummaryCard
                title="Seasonal Tasks"
                summary={
                  seasonalChecklist
                    ? `${seasonalChecklist.season} ${seasonalChecklist.year} checklist`
                    : 'No seasonal checklist yet'
                }
                metric={`${seasonalRemaining} left`}
              >
                <div className="space-y-2">
                  {seasonalChecklist?.items?.slice(0, 2).map((task: { id: string; title: string }) => (
                    <PreviewListRow key={task.id} title={task.title} subtitle="Seasonal recommendation" href={`/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`} />
                  ))}
                  <Link
                    href={`/dashboard/seasonal?propertyId=${encodeURIComponent(propertyId)}`}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Review Tasks
                  </Link>
                </div>
              </ExpandableSummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Rooms Snapshot"
                subtitle="Set up room-level tracking early"
                action={<StatusChip tone="info">{properties.length} properties</StatusChip>}
              >
                <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                  Room-level setup improves inspection and maintenance planning once you move in.
                </p>
                <Link
                  href="/dashboard/properties"
                  className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                >
                  Open Properties
                </Link>
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <SummaryCard
                title="Financial Insights"
                subtitle="Savings and exposure preview"
                action={
                  <IconBadge tone="positive">
                    <Wallet className="h-4 w-4" />
                  </IconBadge>
                }
              >
                <MetricRow label="Potential monthly savings" value={formatCurrency(savingsQuery.data?.potentialMonthlySavings || 0)} />
                <MetricRow label="Potential annual savings" value={formatCurrency(savingsQuery.data?.potentialAnnualSavings || 0)} />
                <MetricRow label="Risk exposure signal" value={formatCurrency(exposure)} />
              </SummaryCard>
            </MobileSection>

            <MobileSection>
              <ExpandableSummaryCard
                title="Action Center Preview"
                summary="Closing checklist and bookings"
                metric={`${pending + inProgress} active`}
              >
                <div className="space-y-2">
                  <PreviewListRow
                    title="Checklist"
                    subtitle={`${pending} pending · ${inProgress} in progress`}
                    href="/dashboard/checklist"
                    icon={<FileText className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />}
                  />
                  <PreviewListRow
                    title="Bookings"
                    subtitle={`${bookings.length} total bookings`}
                    href="/dashboard/bookings"
                    icon={<Truck className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />}
                  />
                  <Link
                    href="/dashboard/checklist"
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Continue Closing Plan
                  </Link>
                </div>
              </ExpandableSummaryCard>
            </MobileSection>
          </>
        )}

        <MobileSection className="pt-1">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(var(--mobile-border-subtle))] to-transparent" />
          <p className="mb-0 text-center text-xs text-[hsl(var(--mobile-text-muted))]">
            Calm, glanceable, action-first mobile dashboard.
          </p>
          <div className="flex items-center justify-center gap-3 text-[hsl(var(--mobile-text-muted))]">
            <Sparkles className="h-4 w-4" />
            <Shield className="h-4 w-4" />
            <Wallet className="h-4 w-4" />
          </div>
        </MobileSection>
      </MobilePageContainer>
    </div>
  );
}
