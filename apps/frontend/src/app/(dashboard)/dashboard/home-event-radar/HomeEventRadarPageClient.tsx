'use client';

// apps/frontend/src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx
// Home Event Radar — mobile-first feed + detail sheet

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Filter, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import {
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  EmptyStateCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { RadarFeedItem } from '@/components/features/homeEventRadar/RadarFeedItem';
import { RadarFeedSkeleton } from '@/components/features/homeEventRadar/RadarFeedSkeleton';
import { RadarDetailSheet } from '@/components/features/homeEventRadar/RadarDetailSheet';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { track } from '@/lib/analytics/events';
import type {
  Property,
  RadarCategoryCoverage,
  RadarCanonicalFeedItem,
  RadarMonitoringState,
  RadarOverview,
  RadarSourceFamily,
  RadarUserState,
} from '@/types';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { ScrollFadeX } from '@/components/ui/ScrollFadeX';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';
import {
  formatRadarLastCheck,
  getRadarEmptyStateCopy,
  isRadarFamilyFilterAvailable,
  RADAR_COVERAGE_LABELS,
  RADAR_FAMILY_LABELS,
  RADAR_MONITORING_PRESENTATION,
} from '@/features/homeEventRadar/radarAvailabilityCopy';

// ---------------------------------------------------------------------------
// Filter chip type
// ---------------------------------------------------------------------------

type FilterKey = 'all' | RadarSourceFamily;
type FilterOption = { key: FilterKey; label: string; disabled?: boolean; status?: string };

const TIMING_GROUPS = [
  { key: 'now', label: 'Now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'recently_ended', label: 'Recently Ended' },
] as const;

function radarFilterOptions(coverage: RadarCategoryCoverage[]): FilterOption[] {
  return [
    { key: 'all', label: 'All' },
    ...coverage.map((category) => ({
      key: category.family,
      label: RADAR_FAMILY_LABELS[category.family],
      disabled: !isRadarFamilyFilterAvailable(category.status),
      status: RADAR_COVERAGE_LABELS[category.status],
    })),
  ];
}

// ---------------------------------------------------------------------------
// Compact intro hero
// ---------------------------------------------------------------------------

function RadarHero({ propertyAddress }: { propertyAddress?: string }) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))]',
        'bg-[linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff)]',
        'p-4'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-white">
          <Radio className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
        </div>
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-medium tracking-normal text-[hsl(var(--mobile-text-muted))]">
            Home tool
          </p>
          <h1 className="mb-0 text-base font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            Home Event Radar
          </h1>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            Events that may affect your property — matched to your specific home.
          </p>
          {propertyAddress && (
            <p className={cn('mb-0 mt-1.5 text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}>
              Selected property: {propertyAddress}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function compactPropertyAddress(property: Property | null | undefined): string {
  if (!property) return '';
  const locality = [property.city, property.state].filter(Boolean).join(', ');
  return [property.address, locality].filter(Boolean).join(' · ');
}

function RadarDesktopSidebar({
  propertyAddress,
  totalCount,
  newCount,
  dismissedCount,
  activeFilter,
  monitoringState,
  lastSuccessfulCheckAt,
}: {
  propertyAddress?: string;
  totalCount: number;
  newCount: number;
  dismissedCount: number;
  activeFilter: FilterKey;
  monitoringState?: RadarMonitoringState;
  lastSuccessfulCheckAt?: string | null;
}) {
  const activeFilterLabel =
    activeFilter === 'all' ? 'All' : RADAR_FAMILY_LABELS[activeFilter];
  const monitoring = monitoringState
    ? RADAR_MONITORING_PRESENTATION[monitoringState]
    : null;

  return (
    <aside className="hidden space-y-4 lg:block lg:sticky lg:top-4">
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={cn('mb-0 text-[11px] font-medium tracking-normal text-[hsl(var(--mobile-text-muted))]')}>
              Selected property
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {monitoring?.title ?? 'Loading monitoring status'}
            </p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              {propertyAddress || 'Events are matched against the selected property and available home details.'}
            </p>
            {monitoring ? (
              <p className="mb-0 mt-2 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]">
                {monitoring.label} · {formatRadarLastCheck(lastSuccessfulCheckAt ?? null)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Events in view</p>
            <p className="mb-0 mt-1 text-xl font-semibold text-[hsl(var(--mobile-text-primary))]">{totalCount}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>New</p>
            <p className="mb-0 mt-1 text-xl font-semibold text-[hsl(var(--mobile-text-primary))]">{newCount}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Dismissed</p>
            <p className="mb-0 mt-1 text-xl font-semibold text-[hsl(var(--mobile-text-primary))]">{dismissedCount}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Filter</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">{activeFilterLabel}</p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(160deg,#ffffff,hsl(var(--mobile-brand-soft)))] p-5'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-white text-[hsl(var(--mobile-brand-strong))]">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">How radar works</p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              Radar reports events only from configured sources that currently cover this property.
            </p>
            <p className={cn('mb-0 mt-3 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
              Event severity reflects the signal itself. Impact reflects what it may mean for this specific property.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

function FilterChips({
  active,
  options,
  onChange,
}: {
  active: FilterKey;
  options: FilterOption[];
  onChange: (k: FilterKey) => void;
}) {
  return (
    <ScrollFadeX fromColor="from-white">
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar pb-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-pressed={active === opt.key}
          aria-disabled={opt.disabled || undefined}
          disabled={opt.disabled}
          title={opt.disabled && opt.status ? `${opt.label}: ${opt.status}` : undefined}
          onClick={() => onChange(opt.key)}
          className={cn(
            'snap-start shrink-0 inline-flex items-center rounded-full border px-3 py-1.5 transition-colors',
            MOBILE_TYPE_TOKENS.chip,
            active === opt.key
              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))] font-semibold'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
            opt.disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {opt.label}{opt.disabled ? ' · unavailable' : ''}
        </button>
      ))}
    </div>
    </ScrollFadeX>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function RadarEmptyState({
  filtered = false,
  propertyId,
  monitoringState,
  feedState,
}: {
  filtered?: boolean;
  propertyId: string;
  monitoringState?: RadarMonitoringState;
  feedState?: Parameters<typeof getRadarEmptyStateCopy>[0]['feedState'];
}) {
  const copy = getRadarEmptyStateCopy({ filtered, monitoringState, feedState });

  return (
    <EmptyStateCard
      title={copy.title}
      description={copy.description}
      action={
        filtered ? undefined : (
          <Link
            href={`/dashboard/properties/${encodeURIComponent(propertyId)}/incidents`}
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
          >
            View Incidents
          </Link>
        )
      }
    />
  );
}

function RadarMonitoringNotice({
  overview,
  isLoading,
  isError,
  onRetry,
}: {
  overview?: RadarOverview;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <MobileSection>
        <div className={cn(MOBILE_CARD_RADIUS, 'h-24 animate-pulse bg-[hsl(var(--mobile-bg-muted))]')} />
      </MobileSection>
    );
  }
  if (isError || !overview) {
    return (
      <MobileSection>
        <div className={cn(MOBILE_CARD_RADIUS, 'border border-amber-200 bg-amber-50 p-4')}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="mb-0 text-sm font-semibold text-amber-950">Monitoring status unavailable</p>
              <p className={cn('mb-0 mt-1 text-amber-900', MOBILE_TYPE_TOKENS.caption)}>
                Radar could not verify current source coverage. Event results must not be treated as an all-clear.
              </p>
              <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold text-amber-950 underline">
                Retry status
              </button>
            </div>
          </div>
        </div>
      </MobileSection>
    );
  }

  const presentation = RADAR_MONITORING_PRESENTATION[overview.monitoringState];
  const toneClass = {
    positive: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-rose-200 bg-rose-50 text-rose-950',
    neutral: 'border-slate-200 bg-slate-50 text-slate-900',
  }[presentation.tone];

  return (
    <MobileSection>
      <div className={cn(MOBILE_CARD_RADIUS, 'border p-4', toneClass)}>
        <div className="flex items-start gap-3">
          {overview.monitoringState === 'ACTIVE' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="mb-0 text-sm font-semibold">{presentation.title}</p>
              <span className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[10px] font-semibold">
                {presentation.label}
              </span>
            </div>
            <p className={cn('mb-0 mt-1 opacity-80', MOBILE_TYPE_TOKENS.caption)}>
              {presentation.description}
            </p>
            <p className="mb-0 mt-2 text-xs font-medium">
              {formatRadarLastCheck(overview.lastSuccessfulCheckAt)}
            </p>
          </div>
        </div>
      </div>
    </MobileSection>
  );
}

function RadarCoverageNotice({ coverage }: { coverage: RadarCategoryCoverage[] }) {
  if (!coverage.length) return null;
  return (
    <MobileSection>
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4'
        )}
      >
        <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
          Current source availability
        </p>
        <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
          Availability is evaluated for this property. Unavailable or delayed sources are not evidence that no event exists.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {coverage.map((source) => (
            <div
              key={source.family}
              className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                  {RADAR_FAMILY_LABELS[source.family]}
                </p>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[hsl(var(--mobile-text-secondary))]">
                  {RADAR_COVERAGE_LABELS[source.status]}
                </span>
              </div>
              <p className="mb-0 mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">{source.detail}</p>
              {source.dataFreshThrough ? (
                <p className="mb-0 mt-1 text-[10px] text-[hsl(var(--mobile-text-muted))]">
                  Data fresh through {new Date(source.dataFreshThrough).toLocaleString()}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </MobileSection>
  );
}

// ---------------------------------------------------------------------------
// Dismissed banner — let user re-show dismissed items
// ---------------------------------------------------------------------------

function DismissedNotice({
  count,
  showing,
  onShow,
}: {
  count: number;
  showing: boolean;
  onShow: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onShow}
      className={cn(
        'w-full text-left rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3.5 py-2.5',
        MOBILE_TYPE_TOKENS.caption,
        'text-[hsl(var(--mobile-text-secondary))]'
      )}
    >
      {showing
        ? 'Hide dismissed events'
        : `${count} dismissed event${count > 1 ? 's' : ''} — tap to show`}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Analytics helpers (mirrors ServicePriceRadar pattern)
// ---------------------------------------------------------------------------

type RadarLaunchSurface =
  | 'home_tools'
  | 'property_hub'
  | 'property_summary'
  | 'dashboard_card'
  | 'roof_page'
  | 'plumbing_page'
  | 'electrical_page'
  | 'activity_feed'
  | 'unknown';

function normalizeLaunchSurface(value: string | null): RadarLaunchSurface {
  const valid: RadarLaunchSurface[] = [
    'home_tools', 'property_hub', 'property_summary', 'dashboard_card',
    'roof_page', 'plumbing_page', 'electrical_page', 'activity_feed',
  ];
  return (valid as string[]).includes(value ?? '') ? (value as RadarLaunchSurface) : 'unknown';
}

function deviceContext(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop';
}

function eventCountBucket(n: number): '0' | '1' | '2_5' | '6_10' | '10_plus' {
  if (n === 0) return '0';
  if (n === 1) return '1';
  if (n <= 5) return '2_5';
  if (n <= 10) return '6_10';
  return '10_plus';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type HomeEventRadarPageClientProps = {
  propertyId?: string;
};

export default function HomeEventRadarPageClient({ propertyId: propertyIdOverride }: HomeEventRadarPageClientProps) {
  const searchParams = useSearchParams();
  const toolLaunchContext = useToolLaunchContext();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const rawPropertyId = propertyIdOverride ?? selectedPropertyId ?? searchParams.get('propertyId') ?? undefined;
  const propertyId = (rawPropertyId && rawPropertyId !== 'undefined') ? rawPropertyId : undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ??
    toolLaunchContext?.resolved.prefill.journeyId ??
    null;
  const launchSurface = normalizeLaunchSurface(searchParams.get('launchSurface'));

  React.useEffect(() => {
    if (!propertyIdOverride) return;
    if (selectedPropertyId !== propertyIdOverride) {
      setSelectedPropertyId(propertyIdOverride);
    }
  }, [propertyIdOverride, selectedPropertyId, setSelectedPropertyId]);

  React.useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'home-event-radar', propertyId, entryPoint: launchSurface ?? 'direct' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const guidanceBackHref =
    propertyId && guidanceJourneyId
      ? buildGuidanceOverviewHref({
          propertyId,
          journeyId: guidanceJourneyId,
          stepKey: guidanceStepKey,
          inventoryItemId: toolLaunchContext?.resolved.prefill.itemId ??
            toolLaunchContext?.resolved.prefill.entityId ??
            searchParams.get('itemId') ??
            searchParams.get('sourceEntityId'),
          issueType: searchParams.get('issueType'),
        })
      : null;

  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [selectedItem, setSelectedItem] = React.useState<RadarCanonicalFeedItem | null>(null);
  const [showDismissed, setShowDismissed] = React.useState(false);

  // Local override map: matchId → state (for optimistic UI without refetch)
  const [stateOverrides, setStateOverrides] = React.useState<Record<string, RadarUserState>>({});

  // Analytics: fire-once guards
  const openedRef = React.useRef<string | null>(null);
  const feedViewedRef = React.useRef<string | null>(null);

  // Shared tracking helper
  const trackRadarEvent = React.useCallback(
    (event: string, section?: string, metadata?: Record<string, unknown>) => {
      if (!propertyId) return;
      void api.trackHomeEventRadarEvent(propertyId, {
        event,
        section,
        metadata: {
          tool_name: 'home_event_radar',
          property_id: propertyId,
          launch_surface: launchSurface,
          ...metadata,
        },
      }).catch(() => undefined);
    },
    [propertyId, launchSurface],
  );

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  const overviewQuery = useQuery({
    queryKey: ['radar-overview', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getRadarOverview(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 2 * 60 * 1000,
  });

  const feedQuery = useInfiniteQuery({
    queryKey: ['radar-events', propertyId, filter, showDismissed],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!propertyId) return null;
      return api.getRadarEvents(propertyId, {
        limit: 50,
        sourceFamily: filter === 'all' ? undefined : [filter],
        state: showDismissed ? undefined : ['new', 'seen', 'saved', 'acted_on'],
        cursor: pageParam,
      });
    },
    getNextPageParam: (lastPage) =>
      lastPage?.pageInfo.hasNextPage ? (lastPage.pageInfo.endCursor ?? undefined) : undefined,
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const propertyQuery = useQuery({
    queryKey: ['home-event-radar-property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to load property context.');
      }
      return response.data;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const allItems: RadarCanonicalFeedItem[] = React.useMemo(
    () => (feedQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? []).map((item) => ({
      ...item,
      userState: stateOverrides[item.propertyMatchId] ?? item.userState,
    })),
    [feedQuery.data, stateOverrides],
  );

  const visibleItems = allItems;

  const dismissedCount = React.useMemo(
    () => filter === 'all'
      ? (overviewQuery.data?.counts.dismissed ?? 0)
      : 0,
    [filter, overviewQuery.data?.counts.dismissed]
  );
  const feedSummary = feedQuery.data?.pages[0] ?? null;
  const totalCount = feedSummary?.totalCount ?? 0;
  const filterOptions = React.useMemo(
    () => radarFilterOptions(overviewQuery.data?.coverage ?? []),
    [overviewQuery.data?.coverage],
  );
  const propertyAddress = compactPropertyAddress(propertyQuery.data);

  React.useEffect(() => {
    if (filter === 'all') return;
    const selected = filterOptions.find((option) => option.key === filter);
    if (selected?.disabled) setFilter('all');
  }, [filter, filterOptions]);

  // -------------------------------------------------------------------------
  // Analytics: OPENED (once per propertyId+surface session)
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    if (!propertyId) return;
    const sessionKey = `${propertyId}|${launchSurface}`;
    if (openedRef.current === sessionKey) return;
    openedRef.current = sessionKey;
    trackRadarEvent('OPENED', 'page', {
      launch_surface: launchSurface,
      has_property_context: true,
      device_context: deviceContext(),
    });
  }, [propertyId, launchSurface, trackRadarEvent]);

  // Analytics: FEED_VIEWED (once per successful feed load)
  React.useEffect(() => {
    if (!propertyId || feedQuery.isLoading || feedQuery.isError) return;
    const sessionKey = `${propertyId}|${feedQuery.dataUpdatedAt}`;
    if (feedViewedRef.current === sessionKey) return;
    feedViewedRef.current = sessionKey;
    const count = feedSummary?.totalCount ?? 0;
    trackRadarEvent('FEED_VIEWED', 'feed', {
      feed_state: feedSummary?.feedState ?? (count > 0 ? 'HAS_EVENTS' : 'UNKNOWN'),
      event_count_bucket: eventCountBucket(count),
      monitoring_state: overviewQuery.data?.monitoringState,
    });
  }, [
    propertyId,
    feedQuery.isLoading,
    feedQuery.isError,
    feedQuery.dataUpdatedAt,
    feedSummary,
    overviewQuery.data?.monitoringState,
    trackRadarEvent,
  ]);

  // Analytics: FEED_ERROR
  React.useEffect(() => {
    if (!propertyId || !feedQuery.isError) return;
    trackRadarEvent('ERROR', 'feed', {
      stage: 'feed',
      error_type: 'network',
    });
  }, [propertyId, feedQuery.isError, trackRadarEvent]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleItemClick(item: RadarCanonicalFeedItem) {
    // Optimistically mark as seen
    if (item.userState === 'new') {
      setStateOverrides((prev) => ({ ...prev, [item.propertyMatchId]: 'seen' }));
    }
    setSelectedItem({
      ...item,
      userState: item.userState === 'new' ? 'seen' : item.userState,
    });
  }

  function handleSheetClose() {
    setSelectedItem(null);
  }

  function handleStateChange(matchId: string, state: RadarUserState) {
    setStateOverrides((prev) => ({ ...prev, [matchId]: state }));
    // Also update the selected item if it's still open
    setSelectedItem((prev) => (prev?.propertyMatchId === matchId ? { ...prev, userState: state } : prev));
    if (propertyId) {
      track('action_completed', { tool: 'home-event-radar', actionType: `state_${state}`, propertyId });
    }
  }

  function handleFilterChange(key: FilterKey) {
    setFilter(key);
    setShowDismissed(false);
    if (key !== 'all') {
      trackRadarEvent('FILTER_APPLIED', 'feed', { filter_key: key });
    }
  }

  // -------------------------------------------------------------------------
  // No property selected
  // -------------------------------------------------------------------------

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-2xl lg:px-8 lg:pb-10">
        <MobileSection>
          <Link
            href="/dashboard"
            className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </MobileSection>
        <EmptyStateCard
          title="Select a property"
          description="Home Event Radar requires a selected property to show matched events."
          action={
            <Link
              href="/dashboard/properties"
              className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
            >
              Open Properties
            </Link>
          }
        />
      </MobilePageContainer>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  const newCount = filter === 'all'
    ? (overviewQuery.data?.counts.new ?? 0)
    : allItems.filter((item) => item.userState === 'new').length;

  return (
    <MobilePageContainer className="space-y-5 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">

      <MobileSection className="lg:space-y-4">
        <Link
          href={
            guidanceBackHref ??
            (propertyId ? `/dashboard?propertyId=${encodeURIComponent(propertyId)}` : '/dashboard')
          }
          className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
        >
          <ArrowLeft className="h-4 w-4" /> {guidanceBackHref ? 'Back to guidance' : 'Back to Dashboard'}
        </Link>
      </MobileSection>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <MobileSection className="lg:hidden">
            <RadarHero propertyAddress={propertyAddress || undefined} />
          </MobileSection>

          <HomeToolHeader
            toolId="home-event-radar"
            propertyId={propertyId}
            monitoringAddress={propertyAddress || undefined}
          />

          <PropertyContextStatusNotice
            context={overviewQuery.data?.propertyContext}
            title="Event matching context"
          />
          <RadarMonitoringNotice
            overview={overviewQuery.data ?? undefined}
            isLoading={overviewQuery.isLoading}
            isError={overviewQuery.isError}
            onRetry={() => void overviewQuery.refetch()}
          />
          <RadarCoverageNotice coverage={overviewQuery.data?.coverage ?? []} />

          <MobileSection className="space-y-3 lg:space-y-4">
            <div className="lg:hidden">
              <FilterChips active={filter} options={filterOptions} onChange={handleFilterChange} />
            </div>
            <div className="hidden lg:block">
              <div
                className={cn(
                  MOBILE_CARD_RADIUS,
                  'border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">Filter events</p>
                    <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                      Narrow the feed to the signal types most relevant to your home.
                    </p>
                  </div>
                  <div className="min-w-0">
                    <FilterChips active={filter} options={filterOptions} onChange={handleFilterChange} />
                  </div>
                </div>
              </div>
            </div>
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader
              title="Events"
              subtitle={newCount > 0 ? `${newCount} new` : undefined}
            />

            {feedQuery.isLoading ? (
              <RadarFeedSkeleton count={4} />
            ) : feedQuery.isError ? (
              <EmptyStateCard
                title="Unable to load events"
                description="There was a problem loading your event feed. Pull to refresh or try again."
                action={
                  <button
                    type="button"
                    onClick={() => feedQuery.refetch()}
                    className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
                  >
                    Retry
                  </button>
                }
              />
            ) : visibleItems.length === 0 ? (
              <>
                <RadarEmptyState
                  filtered={filter !== 'all'}
                  propertyId={propertyId}
                  monitoringState={overviewQuery.data?.monitoringState}
                  feedState={feedSummary?.feedState}
                />
                <DismissedNotice
                  count={dismissedCount}
                  showing={showDismissed}
                  onShow={() => setShowDismissed((value) => !value)}
                />
              </>
            ) : (
              <div className="space-y-5">
                {TIMING_GROUPS.map((group) => {
                  const items = visibleItems.filter((item) => item.matchLifecycleStatus === group.key);
                  if (items.length === 0) return null;
                  return (
                    <section key={group.key} aria-labelledby={`radar-${group.key}`}>
                      <h3
                        id={`radar-${group.key}`}
                        className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-muted))]"
                      >
                        {group.label}
                      </h3>
                      <div className="space-y-3 lg:space-y-4">
                        {items.map((item) => (
                          <RadarFeedItem
                            key={item.propertyMatchId}
                            item={item}
                            onClick={handleItemClick}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                {feedQuery.hasNextPage ? (
                  <button
                    type="button"
                    onClick={() => void feedQuery.fetchNextPage()}
                    disabled={feedQuery.isFetchingNextPage}
                    className="no-brand-style inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))] disabled:opacity-60"
                  >
                    {feedQuery.isFetchingNextPage
                      ? 'Loading more events…'
                      : `Load more events (${allItems.length} of ${totalCount})`}
                  </button>
                ) : null}
                <DismissedNotice
                  count={dismissedCount}
                  showing={showDismissed}
                  onShow={() => setShowDismissed((v) => !v)}
                />
              </div>
            )}
          </MobileSection>

          <MobileSection>
            <div className="flex items-center justify-center gap-2 pb-2 text-xs text-[hsl(var(--mobile-text-muted))] lg:justify-start">
              <Radio className="h-3.5 w-3.5" />
              Events are matched from configured sources to your property location and home details
            </div>
          </MobileSection>
        </div>

        <RadarDesktopSidebar
          propertyAddress={propertyAddress || undefined}
          totalCount={totalCount}
          newCount={newCount}
          dismissedCount={dismissedCount}
          activeFilter={filter}
          monitoringState={overviewQuery.data?.monitoringState}
          lastSuccessfulCheckAt={overviewQuery.data?.lastSuccessfulCheckAt}
        />
      </div>

      {guidanceJourneyId ? (
        <MobileSection>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            Save, dismiss, or mark an event acted on to complete this guidance step automatically.
          </div>
        </MobileSection>
      ) : null}

      {/* Detail sheet */}
      {propertyId && (
        <RadarDetailSheet
          item={selectedItem}
          propertyId={propertyId}
          onClose={handleSheetClose}
          onStateChange={handleStateChange}
          guidanceJourneyId={guidanceJourneyId}
          guidanceStepKey={guidanceStepKey}
          guidanceSignalIntentFamily={searchParams.get('guidanceSignalIntentFamily')}
        />
      )}

    </MobilePageContainer>
  );
}
