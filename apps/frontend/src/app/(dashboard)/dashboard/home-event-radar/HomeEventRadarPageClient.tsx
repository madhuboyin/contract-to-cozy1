'use client';

// apps/frontend/src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx
// Home Event Radar — mobile-first feed + detail sheet

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  CloudLightning,
  Radio,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wind,
  Zap,
} from 'lucide-react';
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
import { RadarNotificationPreferencesCard } from '@/components/features/homeEventRadar/RadarNotificationPreferences';
import RelatedTools from '@/components/tools/RelatedTools';
import { track } from '@/lib/analytics/events';
import type {
  Property,
  RadarCategoryCoverage,
  RadarCanonicalFeedItem,
  RadarOverview,
  RadarSourceFamily,
  RadarUserState,
} from '@/types';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { ScrollFadeX } from '@/components/ui/ScrollFadeX';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';
import {
  formatRadarLastCheck,
  getRadarEmptyStateCopy,
  getRadarReadinessPresentation,
  isRadarFamilyFilterAvailable,
  RADAR_COVERAGE_LABELS,
  RADAR_FAMILY_LABELS,
  RADAR_MONITORING_PRESENTATION,
} from '@/features/homeEventRadar/radarAvailabilityCopy';
import {
  canonicalizeRadarDeepLinkQuery,
  parseRadarDeepLinkState,
  patchRadarDeepLinkQuery,
  type RadarView,
} from '@/features/homeEventRadar/radarDeepLinks';

// ---------------------------------------------------------------------------
// Filter chip type
// ---------------------------------------------------------------------------

type FilterKey = 'all' | RadarSourceFamily;
type FilterOption = { key: FilterKey; label: string; disabled?: boolean; status?: string };

const TIMING_GROUPS = [
  { key: 'now', label: 'Needs attention' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'recently_ended', label: 'Recently ended' },
] as const;

const VIEW_OPTIONS: Array<{ key: RadarView; label: string }> = [
  { key: 'all', label: 'Any time' },
  ...TIMING_GROUPS,
];

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
// Benefit-led introduction and monitoring summary
// ---------------------------------------------------------------------------

function RadarHero({ propertyAddress }: { propertyAddress?: string }) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'overflow-hidden border border-[hsl(var(--mobile-brand-border))]',
        'bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.18),transparent_38%),linear-gradient(145deg,hsl(var(--mobile-brand-soft)),#fff_68%)]',
        'p-5 sm:p-7'
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--mobile-brand-border))] bg-white shadow-sm">
          <Radio className="h-5 w-5 text-[hsl(var(--mobile-brand-strong))]" />
        </div>
        <div className="min-w-0">
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--mobile-brand-strong))]">
            Home Event Radar
          </p>
          <h1 className="mb-0 mt-2 max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-[hsl(var(--mobile-text-primary))] sm:text-3xl">
            Know what could affect your home before it becomes a problem.
          </h1>
          <p className="mb-0 mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--mobile-text-secondary))] sm:text-base">
            Radar watches trusted weather, air-quality, disaster, and property sources,
            then explains what each update could mean for this home.
          </p>
          {propertyAddress && (
            <p className="mb-0 mt-4 inline-flex rounded-full border border-[hsl(var(--mobile-brand-border))] bg-white/80 px-3 py-1.5 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]">
              Watching {propertyAddress}
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

const WATCH_CATEGORIES: Array<{
  family: RadarSourceFamily;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { family: 'weather', description: 'Storms, floods, freezes, and other severe conditions', icon: CloudLightning },
  { family: 'air_quality', description: 'Smoke and unhealthy outdoor air near your home', icon: Wind },
  { family: 'disaster', description: 'Official disaster declarations and recovery updates', icon: ShieldAlert },
  { family: 'tax', description: 'Property assessment changes in supported areas', icon: ReceiptText },
  { family: 'utility', description: 'Local power and utility interruptions', icon: Zap },
  { family: 'insurance', description: 'Insurance market changes that could affect coverage', icon: ShieldCheck },
];

function categoryStatus(
  source: RadarCategoryCoverage | undefined,
  overview: RadarOverview | null | undefined,
): { label: string; className: string } {
  if (overview?.readiness?.state === 'MONITORING_NOT_INITIALIZED' || !overview) {
    return { label: 'Checking availability', className: 'text-amber-700 bg-amber-50' };
  }
  if (
    overview.readiness?.state === 'PROPERTY_SETUP_REQUIRED'
    || (!overview.readiness && overview.monitoringState === 'SETUP_NEEDED')
  ) {
    return { label: 'Waiting for home address', className: 'text-amber-700 bg-amber-50' };
  }
  if (!source || source.status === 'disabled') {
    return { label: 'Not available yet', className: 'text-slate-600 bg-slate-100' };
  }
  if (source.status === 'covered') {
    return { label: 'Watching now', className: 'text-emerald-700 bg-emerald-50' };
  }
  if (source.status === 'failed' || source.status === 'stale') {
    return { label: 'Temporarily delayed', className: 'text-rose-700 bg-rose-50' };
  }
  return { label: 'Not available here', className: 'text-slate-600 bg-slate-100' };
}

function RadarWatchlist({
  overview,
  compact = false,
}: {
  overview?: RadarOverview | null;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]',
        compact && 'p-5',
      )}
    >
      <p className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
        What Radar watches
      </p>
      <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
        Availability depends on trusted data offered for this home&apos;s location.
      </p>
      <div className={cn('mt-4 grid gap-2.5', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        {WATCH_CATEGORIES.map((category) => {
          const source = overview?.coverage.find((item) => item.family === category.family);
          const status = categoryStatus(source, overview);
          const Icon = category.icon;
          return (
            <div
              key={category.family}
              className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]/60 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[hsl(var(--mobile-brand-strong))] shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                    {RADAR_FAMILY_LABELS[category.family]}
                  </p>
                  <p className="mb-0 mt-0.5 text-xs leading-relaxed text-[hsl(var(--mobile-text-muted))]">
                    {category.description}
                  </p>
                  <span className={cn('mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold', status.className)}>
                    {status.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    <div
      role="group"
      aria-label="Event category"
      className="flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar pb-0.5"
    >
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
            'snap-start min-h-[44px] shrink-0 inline-flex items-center rounded-full border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mobile-brand-strong))]/60 focus-visible:ring-offset-2',
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

function ViewChips({
  active,
  onChange,
}: {
  active: RadarView;
  onChange: (view: RadarView) => void;
}) {
  return (
    <ScrollFadeX fromColor="from-white">
      <div role="group" aria-label="Event timing" className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={active === option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              'min-h-[44px] shrink-0 rounded-full border px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mobile-brand-strong))]/60 focus-visible:ring-offset-2',
              MOBILE_TYPE_TOKENS.chip,
              active === option.key
                ? 'border-slate-300 bg-slate-900 font-semibold text-white'
                : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
            )}
          >
            {option.label}
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
  overview,
  feedState,
}: {
  filtered?: boolean;
  overview?: RadarOverview | null;
  feedState?: Parameters<typeof getRadarEmptyStateCopy>[0]['feedState'];
}) {
  const monitoringState = overview?.monitoringState;
  const copy = getRadarEmptyStateCopy({ filtered, monitoringState, feedState });
  const isPreparing = overview?.readiness?.state === 'MONITORING_NOT_INITIALIZED';
  const needsAddress = overview?.readiness?.state === 'PROPERTY_SETUP_REQUIRED'
    || (!overview?.readiness && overview?.monitoringState === 'SETUP_NEEDED');

  if (!filtered && (isPreparing || needsAddress)) {
    return (
      <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-border-subtle))] bg-white p-5')}>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
          <div>
            <h3 className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
              What you&apos;ll find here
            </h3>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              When something relevant happens, Radar turns it into a clear, useful home update.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[hsl(var(--mobile-text-secondary))]">
              {[
                'A plain-language summary of what happened',
                'Why it may matter to this specific home',
                'Practical next steps and the official source',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <EmptyStateCard
      titleAsHeading
      title={copy.title}
      description={copy.description}
    />
  );
}

// Location setup only needs city/state/zip, not a trip to the full
// property edit form — save them directly and refresh Radar's readiness.
function InlineLocationForm({ propertyId, property }: { propertyId: string; property?: Property | null }) {
  const queryClient = useQueryClient();
  const [city, setCity] = React.useState(property?.city ?? '');
  const [state, setState] = React.useState(property?.state ?? '');
  const [zipCode, setZipCode] = React.useState(property?.zipCode ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = async () => {
    if (!city.trim() || !state.trim() || !zipCode.trim()) {
      setError('City, state, and ZIP are all needed.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateProperty(propertyId, { city: city.trim(), state: state.trim(), zipCode: zipCode.trim() });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['radar-overview', propertyId] }),
        queryClient.invalidateQueries({ queryKey: ['home-event-radar-property', propertyId] }),
      ]);
    } catch (err) {
      setError('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="h-9 rounded-lg border border-current/20 bg-white/90 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-current"
        />
        <input
          value={state}
          onChange={(e) => setState(e.target.value)}
          placeholder="State"
          maxLength={2}
          className="h-9 rounded-lg border border-current/20 bg-white/90 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-current"
        />
        <input
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          placeholder="ZIP"
          className="h-9 rounded-lg border border-current/20 bg-white/90 px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-current"
        />
      </div>
      {error && <p className="mb-0 text-xs font-medium text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex min-h-[36px] items-center rounded-xl bg-amber-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save location'}
      </button>
    </div>
  );
}

function RadarMonitoringNotice({
  overview,
  property,
  isLoading,
  isError,
  onRetry,
}: {
  overview?: RadarOverview;
  property?: Property | null;
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
        <div role="alert" className={cn(MOBILE_CARD_RADIUS, 'border border-amber-200 bg-amber-50 p-4')}>
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
  const readiness = getRadarReadinessPresentation(overview);
  const isPreparing = overview.readiness?.state === 'MONITORING_NOT_INITIALIZED';
  const toneClass = {
    positive: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-rose-200 bg-rose-50 text-rose-950',
    neutral: 'border-slate-200 bg-slate-50 text-slate-900',
  }[readiness ? 'warning' : presentation.tone];

  return (
    <MobileSection>
      <div role="status" className={cn(MOBILE_CARD_RADIUS, 'border p-4', toneClass)}>
        <div className="flex items-start gap-3">
          {overview.monitoringState === 'ACTIVE' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="mb-0 text-base font-semibold">{readiness?.title ?? presentation.title}</p>
              <span className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[10px] font-semibold">
                {readiness?.label ?? presentation.label}
              </span>
            </div>
            <p className={cn('mb-0 mt-1 opacity-80', MOBILE_TYPE_TOKENS.caption)}>
              {readiness?.description ?? presentation.description}
            </p>
            {isPreparing ? (
              <div className="mt-4 space-y-2" aria-label="Monitoring setup progress">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Home location is ready
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="h-4 w-4 animate-pulse rounded-full border-4 border-amber-600/25 bg-amber-600" />
                  Finding trusted updates available near this address
                </div>
                <p className="mb-0 pl-6 text-xs opacity-75">
                  This page updates automatically. You can leave and come back anytime.
                </p>
              </div>
            ) : readiness?.action === 'edit_property' ? (
              <InlineLocationForm propertyId={overview.propertyId} property={property} />
            ) : (
              <p className="mb-0 mt-2 text-xs font-medium">
                {formatRadarLastCheck(overview.lastSuccessfulCheckAt)}
              </p>
            )}
          </div>
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
        'min-h-[44px] w-full text-left rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mobile-brand-strong))]/60 focus-visible:ring-offset-2',
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = React.useMemo(
    () => parseRadarDeepLinkState(searchParams),
    [searchParams],
  );
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

  const filter: FilterKey = urlState.family;
  const view = urlState.view;
  const [showDismissed, setShowDismissed] = React.useState(false);

  // Local override map: matchId → state (for optimistic UI without refetch)
  const [stateOverrides, setStateOverrides] = React.useState<Record<string, RadarUserState>>({});

  // Analytics: fire-once guards
  const openedRef = React.useRef<string | null>(null);
  const feedViewedRef = React.useRef<string | null>(null);

  const updateUrlState = React.useCallback((
    patch: Parameters<typeof patchRadarDeepLinkQuery>[1],
    mode: 'push' | 'replace' = 'replace',
  ) => {
    const query = patchRadarDeepLinkQuery(searchParams, patch);
    const queryString = query.toString();
    const href = queryString ? `${pathname}?${queryString}` : pathname;
    router[mode](href, { scroll: false });
  }, [pathname, router, searchParams]);

  React.useEffect(() => {
    const canonical = canonicalizeRadarDeepLinkQuery(searchParams);
    if (canonical.toString() === searchParams.toString()) return;
    const canonicalQuery = canonical.toString();
    const href = canonicalQuery ? `${pathname}?${canonicalQuery}` : pathname;
    router.replace(href, { scroll: false });
  }, [pathname, router, searchParams]);

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
    refetchInterval: (query) =>
      query.state.data?.readiness?.state === 'MONITORING_NOT_INITIALIZED'
        ? 15_000
        : false,
    refetchIntervalInBackground: false,
  });

  const feedQuery = useInfiniteQuery({
    queryKey: ['radar-events', propertyId, view, filter, showDismissed],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!propertyId) return null;
      return api.getRadarEvents(propertyId, {
        limit: 50,
        lifecycle: view === 'all' ? undefined : [view],
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

  const linkedDetailQuery = useQuery({
    queryKey: ['radar-event-detail', propertyId, urlState.matchId],
    queryFn: async () => {
      if (!propertyId || !urlState.matchId) throw new Error('No linked Radar event.');
      return api.getRadarEventDetail(propertyId, urlState.matchId);
    },
    enabled: !!propertyId && !!urlState.matchId,
    staleTime: 2 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
  });

  const allItems: RadarCanonicalFeedItem[] = React.useMemo(
    () => (feedQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? []).map((item) => ({
      ...item,
      userState: stateOverrides[item.propertyMatchId] ?? item.userState,
    })),
    [feedQuery.data, stateOverrides],
  );

  const visibleItems = React.useMemo(
    () => showDismissed
      ? allItems
      : allItems.filter((item) => item.userState !== 'dismissed'),
    [allItems, showDismissed],
  );
  const selectedItem = React.useMemo(() => {
    if (!urlState.matchId) return null;
    const summary = allItems.find((item) => item.propertyMatchId === urlState.matchId);
    const item = summary ?? linkedDetailQuery.data ?? null;
    return item ? {
      ...item,
      userState: stateOverrides[item.propertyMatchId] ?? item.userState,
    } : null;
  }, [allItems, linkedDetailQuery.data, stateOverrides, urlState.matchId]);

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
    if (overviewQuery.data && (!selected || selected.disabled)) {
      updateUrlState({ family: 'all' });
    }
  }, [filter, filterOptions, overviewQuery.data, updateUrlState]);

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
    updateUrlState({ matchId: item.propertyMatchId }, 'push');
  }

  function handleSheetClose() {
    updateUrlState({ matchId: null });
  }

  function handleStateChange(matchId: string, state: RadarUserState) {
    setStateOverrides((prev) => ({ ...prev, [matchId]: state }));
    if (propertyId) {
      track('action_completed', { tool: 'home-event-radar', actionType: `state_${state}`, propertyId });
    }
  }

  function handleFilterChange(key: FilterKey) {
    updateUrlState({ family: key });
    setShowDismissed(false);
    if (key !== 'all') {
      trackRadarEvent('FILTER_APPLIED', 'feed', { filter_key: key });
    }
  }

  function handleViewChange(nextView: RadarView) {
    updateUrlState({ view: nextView });
    trackRadarEvent('FILTER_APPLIED', 'feed', { filter_key: `view:${nextView}` });
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
          titleAsHeading
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
  const showEventControls =
    totalCount > 0
    || dismissedCount > 0
    || filter !== 'all'
    || view !== 'all';

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

      <MobileSection>
        <RadarHero propertyAddress={propertyAddress || undefined} />
      </MobileSection>

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <RadarMonitoringNotice
            overview={overviewQuery.data ?? undefined}
            property={propertyQuery.data ?? undefined}
            isLoading={overviewQuery.isLoading}
            isError={overviewQuery.isError}
            onRetry={() => void overviewQuery.refetch()}
          />

          <MobileSection className="lg:hidden">
            <RadarWatchlist overview={overviewQuery.data} />
          </MobileSection>

          {urlState.matchId && linkedDetailQuery.isError && !selectedItem ? (
            <MobileSection>
              <div role="alert" className={cn(MOBILE_CARD_RADIUS, 'border border-amber-200 bg-amber-50 p-4')}>
                <p className="mb-0 text-sm font-semibold text-amber-950">Linked event unavailable</p>
                <p className={cn('mb-0 mt-1 text-amber-900', MOBILE_TYPE_TOKENS.caption)}>
                  This event may have ended, been removed, or belong to a different property.
                  The rest of this property&apos;s Radar remains available.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void linkedDetailQuery.refetch()}
                    className="min-h-[44px] text-xs font-semibold text-amber-950 underline underline-offset-2"
                  >
                    Retry linked event
                  </button>
                  <button
                    type="button"
                    onClick={handleSheetClose}
                    className="min-h-[44px] text-xs font-semibold text-amber-950 underline underline-offset-2"
                  >
                    Clear event selection
                  </button>
                </div>
              </div>
            </MobileSection>
          ) : null}

          <MobileSection>
            <MobileSectionHeader
              title="Your home updates"
              subtitle={newCount > 0 ? `${newCount} new update${newCount === 1 ? '' : 's'}` : undefined}
            />

            {showEventControls ? (
              <div className={cn(MOBILE_CARD_RADIUS, 'mb-4 space-y-3 border border-[hsl(var(--mobile-border-subtle))] bg-white p-4')}>
                <div>
                  <p className="mb-2 text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">When</p>
                  <ViewChips active={view} onChange={handleViewChange} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">Type</p>
                  <FilterChips active={filter} options={filterOptions} onChange={handleFilterChange} />
                </div>
              </div>
            ) : null}

            {feedQuery.isLoading ? (
              <RadarFeedSkeleton count={4} />
            ) : feedQuery.isError ? (
              <EmptyStateCard
                titleAsHeading
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
                  filtered={filter !== 'all' || view !== 'all'}
                  overview={overviewQuery.data}
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
                        {group.key === 'now' ? 'Needs attention now' : group.label}
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
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h2 className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Choose how Radar keeps you informed
                </h2>
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                  Control which updates matter to you and where you receive them.
                </p>
              </div>
            </div>
            <RadarNotificationPreferencesCard propertyId={propertyId} />
          </MobileSection>

          <MobileSection>
            <RelatedTools
              context="home-event-radar"
              currentToolId="home-event-radar"
              propertyId={propertyId}
              title="Explore related home tools"
            />
          </MobileSection>
        </div>

        <aside className="hidden space-y-4 lg:block lg:sticky lg:top-4">
          <RadarWatchlist overview={overviewQuery.data} compact />
          <div className={cn(MOBILE_CARD_RADIUS, 'border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] p-5')}>
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
              <div>
                <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  Built around your home
                </p>
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                  Radar uses this property&apos;s location and home details to prioritize relevant
                  updates and explain why they may matter.
                </p>
              </div>
            </div>
          </div>
        </aside>
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
