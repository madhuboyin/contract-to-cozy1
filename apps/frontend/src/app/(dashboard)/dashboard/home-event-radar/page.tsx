'use client';

// apps/frontend/src/app/(dashboard)/dashboard/home-event-radar/page.tsx
// Home Event Radar — mobile-first feed + detail sheet

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Filter, Radio } from 'lucide-react';
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
import type { Property, RadarFeedItem as RadarFeedItemType, RadarUserState } from '@/types';

// ---------------------------------------------------------------------------
// Filter chip type
// ---------------------------------------------------------------------------

type FilterKey = 'all' | 'weather' | 'insurance' | 'utility' | 'tax';

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'weather', label: 'Weather' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'utility', label: 'Utility' },
  { key: 'tax', label: 'Tax' },
];

const FILTER_TO_TYPES: Record<FilterKey, string[] | null> = {
  all: null,
  weather: ['hail', 'freeze', 'heat_wave', 'wind', 'heavy_rain', 'flood_risk', 'air_quality', 'wildfire_smoke', 'power_surge_risk', 'nearby_construction', 'weather'],
  insurance: ['insurance_market'],
  utility: ['utility_outage', 'utility_rate_change'],
  tax: ['tax_reassessment', 'tax_rate_change'],
};

function matchesFilter(item: RadarFeedItemType, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  const types = FILTER_TO_TYPES[filter];
  if (!types) return true;
  return types.includes(item.eventType);
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
          <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Home Tool
          </p>
          <h1 className="mb-0 text-base font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            Home Event Radar
          </h1>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            Events that may affect your property — matched to your specific home.
          </p>
          {propertyAddress && (
            <p className={cn('mb-0 mt-1.5 text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}>
              Monitoring: {propertyAddress}
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
}: {
  propertyAddress?: string;
  totalCount: number;
  newCount: number;
  dismissedCount: number;
  activeFilter: FilterKey;
}) {
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.key === activeFilter)?.label ?? 'All';

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
            <p className={cn('mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]')}>
              Monitoring
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Current property context
            </p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              {propertyAddress || 'Events are matched against the selected property and available home details.'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Matched events</p>
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
              Home Event Radar monitors recent weather, insurance, utility, and tax signals that may matter to this home.
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
  onChange,
}: {
  active: FilterKey;
  onChange: (k: FilterKey) => void;
}) {
  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar pb-0.5">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-pressed={active === opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'snap-start shrink-0 inline-flex items-center rounded-full border px-3 py-1.5 transition-colors',
            MOBILE_TYPE_TOKENS.chip,
            active === opt.key
              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))] font-semibold'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function RadarEmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <EmptyStateCard
      title={filtered ? 'No events in this category' : 'No events detected'}
      description={
        filtered
          ? 'Try switching to "All" to see all matched events for your property.'
          : 'Home Event Radar monitors weather, insurance market shifts, utility outages, and tax signals. Events matched to your property will appear here.'
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Dismissed banner — let user re-show dismissed items
// ---------------------------------------------------------------------------

function DismissedNotice({
  count,
  onShow,
}: {
  count: number;
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
      {count} dismissed event{count > 1 ? 's' : ''} — tap to show
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
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
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

export default function HomeEventRadarPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId ?? searchParams.get('propertyId') ?? undefined;

  const launchSurface = normalizeLaunchSurface(searchParams.get('launchSurface'));

  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [selectedItem, setSelectedItem] = React.useState<RadarFeedItemType | null>(null);
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

  const feedQuery = useQuery({
    queryKey: ['radar-feed', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getRadarFeed(propertyId, { limit: 50 });
    },
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

  const allItems: RadarFeedItemType[] = React.useMemo(() => {
    return (feedQuery.data?.items ?? []).map((item) => ({
      ...item,
      state: stateOverrides[item.propertyRadarMatchId] ?? item.state,
    }));
  }, [feedQuery.data, stateOverrides]);

  const visibleItems = React.useMemo(() => {
    return allItems
      .filter((item) => {
        if (item.state === 'dismissed' && !showDismissed) return false;
        return matchesFilter(item, filter);
      });
  }, [allItems, filter, showDismissed]);

  const dismissedCount = React.useMemo(
    () => allItems.filter((i) => i.state === 'dismissed' && matchesFilter(i, filter)).length,
    [allItems, filter]
  );
  const totalCount = allItems.length;
  const propertyAddress = compactPropertyAddress(propertyQuery.data);

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
    const count = feedQuery.data?.items?.length ?? 0;
    trackRadarEvent('FEED_VIEWED', 'feed', {
      feed_state: count > 0 ? 'has_events' : 'empty',
      event_count_bucket: eventCountBucket(count),
    });
  }, [propertyId, feedQuery.isLoading, feedQuery.isError, feedQuery.dataUpdatedAt, feedQuery.data, trackRadarEvent]);

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

  function handleItemClick(item: RadarFeedItemType) {
    // Optimistically mark as seen
    if (item.state === 'new') {
      setStateOverrides((prev) => ({ ...prev, [item.propertyRadarMatchId]: 'seen' }));
    }
    setSelectedItem(item);
  }

  function handleSheetClose() {
    setSelectedItem(null);
  }

  function handleStateChange(matchId: string, state: RadarUserState) {
    setStateOverrides((prev) => ({ ...prev, [matchId]: state }));
    // Also update the selected item if it's still open
    setSelectedItem((prev) => (prev?.propertyRadarMatchId === matchId ? { ...prev, state } : prev));
  }

  function handleFilterChange(key: FilterKey) {
    setFilter(key);
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

  const newCount = allItems.filter((i) => i.state === 'new').length;

  return (
    <MobilePageContainer className="space-y-5 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">

      <MobileSection className="lg:space-y-4">
        <Link
          href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`}
          className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </MobileSection>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <MobileSection>
            <RadarHero propertyAddress={propertyAddress || undefined} />
          </MobileSection>

          <MobileSection className="space-y-3 lg:space-y-4">
            <div className="lg:hidden">
              <FilterChips active={filter} onChange={handleFilterChange} />
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
                    <FilterChips active={filter} onChange={handleFilterChange} />
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
                <RadarEmptyState filtered={filter !== 'all'} />
                <DismissedNotice count={dismissedCount} onShow={() => setShowDismissed(true)} />
              </>
            ) : (
              <div className="space-y-3 lg:space-y-4">
                {visibleItems.map((item) => (
                  <RadarFeedItem
                    key={item.propertyRadarMatchId}
                    item={item}
                    onClick={handleItemClick}
                  />
                ))}
                <DismissedNotice
                  count={dismissedCount}
                  onShow={() => setShowDismissed((v) => !v)}
                />
              </div>
            )}
          </MobileSection>

          <MobileSection>
            <div className="flex items-center justify-center gap-2 pb-2 text-xs text-[hsl(var(--mobile-text-muted))] lg:justify-start">
              <Radio className="h-3.5 w-3.5" />
              Events are matched to your property location and home details
            </div>
          </MobileSection>
        </div>

        <RadarDesktopSidebar
          propertyAddress={propertyAddress || undefined}
          totalCount={totalCount}
          newCount={newCount}
          dismissedCount={dismissedCount}
          activeFilter={filter}
        />
      </div>

      {/* Detail sheet */}
      {propertyId && (
        <RadarDetailSheet
          item={selectedItem}
          propertyId={propertyId}
          onClose={handleSheetClose}
          onStateChange={handleStateChange}
        />
      )}

    </MobilePageContainer>
  );
}
