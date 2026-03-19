'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  ExternalLink,
  MapPin,
  Radar,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  EmptyStateCard,
  MetricRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import type {
  NeighborhoodConfidenceBand,
  NeighborhoodEventCard,
  NeighborhoodEventDetailDTO,
  NeighborhoodEventType,
  NeighborhoodImpactCategory,
  NeighborhoodImpactDirection,
  NeighborhoodOverallEffect,
} from '@/types';
import {
  getNeighborhoodRadarEvents,
  getNeighborhoodRadarEventDetail,
  getNeighborhoodRadarSummary,
  getNeighborhoodRadarTrends,
} from './neighborhoodRadarApi';

// ============================================================================
// DISPLAY CONSTANTS
// ============================================================================

const EVENT_TYPE_LABEL: Record<NeighborhoodEventType, string> = {
  TRANSIT_PROJECT: 'Transit Project',
  HIGHWAY_PROJECT: 'Highway Project',
  COMMERCIAL_DEVELOPMENT: 'Commercial Development',
  RESIDENTIAL_DEVELOPMENT: 'Residential Development',
  INDUSTRIAL_PROJECT: 'Industrial Project',
  WAREHOUSE_PROJECT: 'Warehouse Project',
  ZONING_CHANGE: 'Zoning Change',
  SCHOOL_RATING_CHANGE: 'School Rating Change',
  SCHOOL_BOUNDARY_CHANGE: 'School Boundary Change',
  FLOOD_MAP_UPDATE: 'Flood Map Update',
  UTILITY_INFRASTRUCTURE: 'Utility Infrastructure',
  PARK_DEVELOPMENT: 'Park Development',
  LARGE_CONSTRUCTION: 'Large Construction',
};

const IMPACT_CATEGORY_LABEL: Record<NeighborhoodImpactCategory, string> = {
  PROPERTY_VALUE: 'Property Value',
  RENTAL_DEMAND: 'Rental Demand',
  TRAFFIC: 'Traffic',
  NOISE: 'Noise',
  AMENITIES: 'Amenities',
  INSURANCE_RISK: 'Insurance Risk',
  DEVELOPMENT_PRESSURE: 'Development Pressure',
  LIVING_EXPERIENCE: 'Living Experience',
};

const DEMOGRAPHIC_SEGMENT_LABEL: Record<string, string> = {
  YOUNG_PROFESSIONALS: 'Young professionals',
  FAMILIES_WITH_CHILDREN: 'Families with children',
  AFFLUENT_BUYERS: 'Affluent buyers',
  RETIREES: 'Retirees',
  STUDENTS: 'Students',
  RENTERS: 'Renters',
};

type EffectTone = 'good' | 'elevated' | 'danger' | 'info';

const EFFECT_TONE: Record<NeighborhoodOverallEffect, EffectTone> = {
  HIGHLY_POSITIVE: 'good',
  MODERATELY_POSITIVE: 'good',
  MIXED: 'elevated',
  NEUTRAL: 'info',
  MODERATELY_NEGATIVE: 'danger',
  HIGHLY_NEGATIVE: 'danger',
};

const EFFECT_LABEL: Record<NeighborhoodOverallEffect, string> = {
  HIGHLY_POSITIVE: 'Positive',
  MODERATELY_POSITIVE: 'Positive',
  MIXED: 'Mixed',
  NEUTRAL: 'Neutral',
  MODERATELY_NEGATIVE: 'Negative',
  HIGHLY_NEGATIVE: 'Negative',
};

type FilterEffect = 'ALL' | 'POSITIVE' | 'NEGATIVE' | 'MIXED';

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Very close';
  return `${miles.toFixed(1)} mi away`;
}

// ============================================================================
// SKELETON
// ============================================================================

function RadarSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-28 rounded-[22px] bg-gray-100" />
      <div className="h-8 w-2/3 rounded-full bg-gray-100" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 rounded-[22px] bg-gray-100" />
      ))}
    </div>
  );
}

// ============================================================================
// OVERALL EFFECT BADGE
// ============================================================================

function EffectBadge({ effect }: { effect: NeighborhoodOverallEffect }) {
  return (
    <StatusChip tone={EFFECT_TONE[effect]}>{EFFECT_LABEL[effect]}</StatusChip>
  );
}

// ============================================================================
// CONFIDENCE LABEL — subtle inline text, not a flashy badge
// ============================================================================

const CONFIDENCE_LABEL: Record<NeighborhoodConfidenceBand, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  PRELIMINARY: 'Preliminary signal',
};

const CONFIDENCE_COLOR: Record<NeighborhoodConfidenceBand, string> = {
  HIGH: 'text-emerald-700',
  MEDIUM: 'text-slate-500',
  PRELIMINARY: 'text-amber-600',
};

function ConfidenceLabel({
  band,
  isStale,
}: {
  band: NeighborhoodConfidenceBand;
  isStale: boolean;
}) {
  if (isStale) {
    return (
      <span className="text-[11px] text-amber-600">Older signal</span>
    );
  }
  if (band === 'HIGH') return null; // High confidence needs no label — it's the default expectation
  return (
    <span className={cn('text-[11px]', CONFIDENCE_COLOR[band])}>
      {CONFIDENCE_LABEL[band]}
    </span>
  );
}

// ============================================================================
// FILTER TABS
// ============================================================================

function FilterTabs({
  value,
  onChange,
}: {
  value: FilterEffect;
  onChange: (v: FilterEffect) => void;
}) {
  const tabs: { key: FilterEffect; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'POSITIVE', label: 'Positive' },
    { key: 'NEGATIVE', label: 'Negative' },
    { key: 'MIXED', label: 'Mixed' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === tab.key
              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// IMPACT ROW
// ============================================================================

function ImpactRow({
  direction,
  text,
}: {
  direction: NeighborhoodImpactDirection;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {direction === 'POSITIVE' ? (
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : direction === 'NEGATIVE' ? (
        <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
      ) : (
        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      )}
      <p className="mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
        {text}
      </p>
    </div>
  );
}

// ============================================================================
// EVENT CARD
// ============================================================================

function NeighborhoodEventCardView({
  event,
  onClick,
}: {
  event: NeighborhoodEventCard;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left"
      aria-label={`View details for ${event.title}`}
    >
      <MobileCard
        variant="standard"
        className="space-y-2.5 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-base font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
              {event.title}
            </p>
          </div>
          <div className="shrink-0">
            <EffectBadge effect={event.overallEffect} />
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusChip tone="info">{EVENT_TYPE_LABEL[event.eventType]}</StatusChip>
          <span className="flex items-center gap-1 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {formatDistance(event.distanceMiles)}
          </span>
          {event.announcedDate && (
            <span className="text-[12px] text-[hsl(var(--mobile-text-muted))]">
              Announced {formatDate(event.announcedDate)}
            </span>
          )}
          <ConfidenceLabel band={event.confidenceBand} isStale={event.isStale} />
        </div>

        {/* Short explanation */}
        <p className="mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
          {event.shortExplanation}
        </p>

        {/* Impacts */}
        {(event.topPositives.length > 0 || event.topNegatives.length > 0) && (
          <div className="space-y-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-2.5">
            {event.topPositives.slice(0, 2).map((imp) => (
              <ImpactRow key={imp.category} direction="POSITIVE" text={imp.description} />
            ))}
            {event.topNegatives.slice(0, 2).map((imp) => (
              <ImpactRow key={imp.category} direction="NEGATIVE" text={imp.description} />
            ))}
          </div>
        )}

        {/* Demographic signal */}
        {event.demographicSignals.length > 0 && (
          <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-muted))]">
            Neighborhood shift: {event.demographicSignals[0].description}
          </p>
        )}

        {/* View details CTA */}
        <div className="flex items-center justify-end gap-1 text-[13px] font-medium text-[hsl(var(--mobile-brand-strong))]">
          View details
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </MobileCard>
    </button>
  );
}

// ============================================================================
// EVENT DETAIL SHEET
// ============================================================================

function EventDetailSheet({
  propertyId,
  eventId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['neighborhood-radar-event', propertyId, eventId],
    queryFn: () => getNeighborhoodRadarEventDetail(propertyId, eventId!),
    enabled: open && !!eventId,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">
            {detail ? detail.title : 'Neighborhood Change'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Property-specific impact analysis for this nearby development.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading || !detail ? (
            <div className="space-y-3 p-5">
              <div className="animate-pulse space-y-3">
                <div className="h-16 rounded-2xl bg-gray-100" />
                <div className="h-24 rounded-2xl bg-gray-100" />
                <div className="h-32 rounded-2xl bg-gray-100" />
              </div>
            </div>
          ) : (
            <EventDetailContent detail={detail} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EventDetailContent({ detail }: { detail: NeighborhoodEventDetailDTO }) {
  const positives = detail.allImpacts.filter((i) => i.direction === 'POSITIVE');
  const negatives = detail.allImpacts.filter((i) => i.direction === 'NEGATIVE');

  return (
    <div className="space-y-5 px-5 py-5">
      {/* Overview */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">{EVENT_TYPE_LABEL[detail.eventType]}</StatusChip>
          <EffectBadge effect={detail.overallEffect} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[hsl(var(--mobile-text-secondary))]">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {formatDistance(detail.distanceMiles)}
          </span>
          {detail.city && detail.state && (
            <span>{detail.city}, {detail.state}</span>
          )}
        </div>
        <p className="mb-0 text-sm leading-relaxed text-[hsl(var(--mobile-text-secondary))]">
          {detail.shortExplanation}
        </p>
        {detail.description && (
          <p className="mb-0 text-sm leading-relaxed text-[hsl(var(--mobile-text-secondary))]">
            {detail.description}
          </p>
        )}
      </div>

      {/* Possible positive impacts */}
      {positives.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
            Possible Upside
          </p>
          <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            {positives.map((imp) => (
              <div key={imp.category} className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="mb-0 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                    {IMPACT_CATEGORY_LABEL[imp.category]}
                  </p>
                  <p className="mb-0 text-[13px] leading-snug text-slate-700">
                    {imp.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Possible negative impacts */}
      {negatives.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700">
            Possible Downside
          </p>
          <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
            {negatives.map((imp) => (
              <div key={imp.category} className="flex items-start gap-2">
                <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                <div>
                  <p className="mb-0 text-[11px] font-medium uppercase tracking-wide text-rose-700">
                    {IMPACT_CATEGORY_LABEL[imp.category]}
                  </p>
                  <p className="mb-0 text-[13px] leading-snug text-slate-700">
                    {imp.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demographic signals */}
      {detail.allDemographics.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Neighborhood Evolution
          </p>
          <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
            {detail.allDemographics.map((d) => (
              <div key={d.segment} className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 mt-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden="true" />
                <p className="mb-0 text-[13px] leading-snug text-slate-700">
                  <span className="font-medium">{DEMOGRAPHIC_SEGMENT_LABEL[d.segment] ?? d.segment}:</span>{' '}
                  {d.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {(detail.announcedDate || detail.expectedStartDate || detail.expectedEndDate) && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Timeline
          </p>
          <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3 space-y-1.5">
            {detail.announcedDate && (
              <MetricRow label="Announced" value={formatDate(detail.announcedDate)} />
            )}
            {detail.expectedStartDate && (
              <MetricRow label="Expected start" value={formatDate(detail.expectedStartDate)} />
            )}
            {detail.expectedEndDate && (
              <MetricRow label="Expected completion" value={formatDate(detail.expectedEndDate)} />
            )}
          </div>
        </div>
      )}

      {/* Why CtC flagged this */}
      {detail.whyThisMatters && detail.whyThisMatters.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Why CtC Flagged This
          </p>
          <div className="space-y-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
            {detail.whyThisMatters.map((reason, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--mobile-brand-strong))]"
                  aria-hidden="true"
                />
                <p className="mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
                  {reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source */}
      {(detail.sourceName || detail.sourceUrl) && (
        <div className="space-y-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--mobile-text-muted))]">
            Data Source
          </p>
          {detail.sourceName && (
            <p className="mb-0 text-[13px] text-[hsl(var(--mobile-text-secondary))]">
              {detail.sourceName}
            </p>
          )}
          {detail.sourceUrl && (
            <a
              href={detail.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[hsl(var(--mobile-brand-strong))]"
            >
              View source
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          <p className="mb-0 mt-1.5 text-[11px] text-[hsl(var(--mobile-text-muted))]">
            {detail.confidenceNote
              ? detail.confidenceNote
              : 'Insights are based on publicly available signals and are intended as general guidance only. Always verify with official sources.'}
          </p>
        </div>
      )}

      {/* Show confidence/source note even when there's no named source */}
      {!detail.sourceName && !detail.sourceUrl && (
        <p className="text-[11px] text-[hsl(var(--mobile-text-muted))]">
          {detail.confidenceNote
            ? detail.confidenceNote
            : 'Insights are based on publicly available signals and are intended as general guidance only.'}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// SUMMARY STRIP
// ============================================================================

function SummaryStrip({ propertyId }: { propertyId: string }) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['neighborhood-radar-summary', propertyId],
    queryFn: () => getNeighborhoodRadarSummary(propertyId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-[22px] bg-gray-100" />;
  }

  if (!summary || summary.meaningfulChangeCount === 0) {
    return null;
  }

  return (
    <MobileCard
      variant="hero"
      className="bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Neighborhood Signals
          </p>
          <p className="mb-0 text-[1.3rem] font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            {summary.meaningfulChangeCount} meaningful{' '}
            {summary.meaningfulChangeCount === 1 ? 'change' : 'changes'} detected
          </p>
        </div>
        <div className="shrink-0">
          {summary.overallSentiment && (
            <EffectBadge effect={summary.overallSentiment} />
          )}
        </div>
      </div>

      {summary.topHeadline && (
        <p className="mt-2.5 mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
          {summary.topHeadline}
        </p>
      )}

      {(summary.topPositiveThemes.length > 0 || summary.topNegativeThemes.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.topPositiveThemes.slice(0, 2).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
            >
              <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
              {t}
            </span>
          ))}
          {summary.topNegativeThemes.slice(0, 2).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
            >
              <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
              {t}
            </span>
          ))}
        </div>
      )}

      {summary.lastScanAt && (
        <p className="mt-2.5 mb-0 text-[11px] text-[hsl(var(--mobile-text-muted))]">
          Last updated {formatDate(summary.lastScanAt)}
        </p>
      )}
    </MobileCard>
  );
}

// ============================================================================
// TREND STRIP
// ============================================================================

function TrendStrip({ propertyId }: { propertyId: string }) {
  const { data: trends } = useQuery({
    queryKey: ['neighborhood-radar-trends', propertyId],
    queryFn: () => getNeighborhoodRadarTrends(propertyId),
    staleTime: 10 * 60 * 1000,
  });

  if (!trends || trends.pressureSignals.length === 0) return null;

  return (
    <MobileCard variant="compact" className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
        Neighborhood Trend
      </p>
      <p className="mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
        {trends.narrative}
      </p>
      {trends.pressureSignals.slice(0, 3).map((signal) => (
        <div key={signal} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
          <p className="mb-0 text-[13px] text-[hsl(var(--mobile-text-secondary))]">{signal}</p>
        </div>
      ))}
    </MobileCard>
  );
}

// ============================================================================
// MAIN CLIENT
// ============================================================================

export default function NeighborhoodChangeRadarClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [filterEffect, setFilterEffect] = useState<FilterEffect>('ALL');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ['neighborhood-radar-events', propertyId, filterEffect],
    queryFn: () =>
      getNeighborhoodRadarEvents(propertyId, {
        filterEffect: filterEffect === 'ALL' ? undefined : filterEffect,
        limit: 50,
      }),
    staleTime: 10 * 60 * 1000,
    enabled: !!propertyId,
  });

  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;

  function openDetail(eventId: string) {
    setSelectedEventId(eventId);
    setSheetOpen(true);
  }

  return (
    <MobilePageContainer className="space-y-4 pt-4 lg:max-w-7xl lg:px-8 lg:pb-10">
      {/* Back nav */}
      <div>
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to property
        </Link>
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:space-y-0">
        {/* Page intro — full width on desktop */}
        <div className="lg:col-span-2">
          <MobilePageIntro
            eyebrow="Home Tools"
            title="Neighborhood Change Radar"
            subtitle="Track major external changes near your home and understand how they may affect value, demand, and livability."
           className="lg:hidden"/>
        </div>

        <div className="lg:col-span-2">
          <HomeToolHeader
            toolId="neighborhood-change-radar"
            propertyId={propertyId}
          />
        </div>

        {/* Left column: summary + trend. Tools rail hidden on desktop (header above replaces it). */}
        <div className="space-y-4 lg:space-y-5">
          <SummaryStrip propertyId={propertyId} />

          <div className="lg:hidden">
            <HomeToolsRail propertyId={propertyId} context="neighborhood-change-radar" />
          </div>

          <TrendStrip propertyId={propertyId} />
        </div>

        {/* Right column: event list */}
        <div className="space-y-4 lg:col-start-2">
          <MobileSection>
            <MobileSectionHeader
              title="Nearby Changes"
              subtitle={total > 0 ? `${total} development${total !== 1 ? 's' : ''} detected` : undefined}
            />

            {/* Filters */}
            <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
              <FilterTabs value={filterEffect} onChange={setFilterEffect} />
            </MobileFilterSurface>

            {/* Event list */}
            {eventsQuery.isLoading ? (
              <RadarSkeleton />
            ) : events.length === 0 ? (
              <EmptyStateCard
                title="No major changes detected"
                description="CtC will continue monitoring meaningful external changes near this property."
              />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <NeighborhoodEventCardView
                    key={event.id}
                    event={event}
                    onClick={() => openDetail(event.eventId)}
                  />
                ))}
              </div>
            )}
          </MobileSection>
        </div>
      </div>

      {/* Detail sheet */}
      <EventDetailSheet
        propertyId={propertyId}
        eventId={selectedEventId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </MobilePageContainer>
  );
}
