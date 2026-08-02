'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Eye,
  List,
  Map,
  MapPin,
  X,
} from 'lucide-react';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  MissingFactPrompt,
  PropertyIntelligenceJourneyLinks,
  SourceCoverageSummary,
  TruthStateBadge,
  WhyThisMatters,
} from '@/components/property-intelligence/PropertyIntelligencePrimitives';
import {
  type AroundYourHomeItem,
  getAroundYourHome,
  updateAroundYourHomeInteraction,
} from './aroundYourHomeApi';

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return 'not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function lifecycleTone(status: AroundYourHomeItem['observation']['lifecycleStatus']) {
  if (status === 'ACTIVE' || status === 'APPROVED') return 'good' as const;
  if (status === 'PROPOSED') return 'elevated' as const;
  if (status === 'CANCELLED' || status === 'STALE') return 'danger' as const;
  return 'info' as const;
}

function ObservationCard({
  item,
  propertyId,
}: {
  item: AroundYourHomeItem;
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const interaction = useMutation({
    mutationFn: (action: 'FOLLOW' | 'DISMISS' | 'NOT_RELEVANT' | 'MARK_SEEN') =>
      updateAroundYourHomeInteraction(propertyId, item.propertyMatchId, { action }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['around-your-home', propertyId] }),
  });
  const title = item.observation.facts.title
    ?? humanize(item.observation.observationType);
  const summary = item.observation.facts.summary
    ?? item.observation.facts.description
    ?? 'The source did not provide a public summary.';

  return (
    <MobileCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={lifecycleTone(item.observation.lifecycleStatus)}>
              {humanize(item.observation.lifecycleStatus)}
            </StatusChip>
            {item.interaction.disposition === 'FOLLOWING' ? (
              <StatusChip tone="info">Following</StatusChip>
            ) : null}
            {item.interaction.hasMaterialUpdate ? (
              <StatusChip tone="elevated">Material source update</StatusChip>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-700">{summary}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-950">Source fact and geography</p>
          <p className="mt-1 text-slate-600">
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            {item.geography.matchedGeography} · {humanize(item.geography.precision)}
          </p>
          {item.geography.distanceMiles != null ? (
            <p className="mt-1 text-slate-600">
              {item.geography.distanceMiles.toFixed(1)} miles from the sourced point
            </p>
          ) : (
            <p className="mt-1 text-slate-600">No exact point distance is available.</p>
          )}
          <p className="mt-1 text-slate-600">
            Effective {formatDate(item.observation.effectiveFrom)}
            {item.observation.effectiveTo ? `–${formatDate(item.observation.effectiveTo)}` : ''}
          </p>
        </div>
        <div className="space-y-2">
          <TruthStateBadge
            state={item.possibleRelevance.relevance === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED'}
          />
          <WhyThisMatters boundary={item.possibleRelevance.boundary}>
            {item.possibleRelevance.explanation}
          </WhyThisMatters>
        </div>
      </div>

      <MissingFactPrompt
        propertyId={propertyId}
        facts={item.possibleRelevance.missingFacts}
        benefit="More property context can refine possible relevance. It does not create a value, demand, insurance, or household-impact prediction."
      />

      {item.possibleRelevance.safetyTier === 'MATERIAL_FINANCIAL' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <p className="font-semibold">Review before financial or insurance decisions</p>
          <p>This source observation is context only. Confirm applicability with the relevant authority, insurer, appraiser, or qualified professional before acting.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-600">
          <p>{item.source.provider} · revision {item.observation.revision}</p>
          <p>Published {formatDate(item.source.publishedAt)} · checked {formatDate(item.source.lastCheckedAt)}</p>
          {item.source.url ? (
            <a
              href={item.source.url}
              target="_blank"
              rel="noreferrer"
              className="no-brand-style mt-1 inline-flex items-center font-medium text-slate-700 underline hover:text-slate-950"
            >
              Open exact source <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="mt-1">The provider supplied no public record URL.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={item.interaction.disposition === 'FOLLOWING' ? 'default' : 'outline'}
            onClick={() => interaction.mutate('FOLLOW')}
            disabled={interaction.isPending}
          >
            <Bell className="mr-1 h-3.5 w-3.5" /> Follow
          </Button>
          <Button size="sm" variant="outline" onClick={() => interaction.mutate('MARK_SEEN')} disabled={interaction.isPending}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Mark seen
          </Button>
          <Button size="sm" variant="outline" onClick={() => interaction.mutate('NOT_RELEVANT')} disabled={interaction.isPending}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Not relevant
          </Button>
          <Button size="sm" variant="ghost" onClick={() => interaction.mutate('DISMISS')} disabled={interaction.isPending}>
            <X className="mr-1 h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      </div>
    </MobileCard>
  );
}

function CoordinateMap({
  items,
  property,
  unplottedCount,
  precisionNote,
}: {
  items: AroundYourHomeItem[];
  property: { latitude: number | null; longitude: number | null };
  unplottedCount: number;
  precisionNote: string;
}) {
  const points = items.flatMap((item, index) =>
    item.geography.point ? [{ item, index, ...item.geography.point }] : []);
  const coordinates = [
    ...points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    ...(property.latitude != null && property.longitude != null
      ? [{ latitude: property.latitude, longitude: property.longitude }]
      : []),
  ];
  if (coordinates.length === 0) {
    return (
      <EmptyStateCard
        title="No exact points to plot"
        description="Available records use area-level geography. They remain in the list with their actual ZIP, county, state, or polygon label."
      />
    );
  }
  const lats = coordinates.map((point) => point.latitude);
  const lons = coordinates.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const x = (longitude: number) =>
    maxLon === minLon ? 50 : 8 + ((longitude - minLon) / (maxLon - minLon)) * 84;
  const y = (latitude: number) =>
    maxLat === minLat ? 50 : 92 - ((latitude - minLat) / (maxLat - minLat)) * 84;

  return (
    <MobileCard className="space-y-3">
      <div className="relative aspect-[16/8] overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:32px_32px]">
        {property.latitude != null && property.longitude != null ? (
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 px-2 py-1 text-[10px] font-semibold text-white shadow"
            style={{ left: `${x(property.longitude)}%`, top: `${y(property.latitude)}%` }}
          >
            Home
          </span>
        ) : null}
        {points.map((point) => (
          <span
            key={point.item.propertyMatchId}
            title={point.item.observation.facts.title ?? point.item.observation.observationType}
            className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs font-semibold text-white shadow"
            style={{ left: `${x(point.longitude)}%`, top: `${y(point.latitude)}%` }}
          >
            {point.index + 1}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-600">{precisionNote}</p>
      {unplottedCount > 0 ? (
        <p className="text-xs text-slate-600">
          {unplottedCount} area-level {unplottedCount === 1 ? 'record is' : 'records are'} shown only in the list.
        </p>
      ) : null}
      <div className="space-y-1 text-xs text-slate-700">
        {points.map((point) => (
          <p key={point.item.propertyMatchId}>
            {point.index + 1}. {point.item.observation.facts.title ?? humanize(point.item.observation.observationType)}
            {' · '}{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
          </p>
        ))}
      </div>
    </MobileCard>
  );
}

export default function NeighborhoodChangeRadarClient({
  propertyId: explicitPropertyId,
}: {
  propertyId?: string;
} = {}) {
  const params = useParams<{ id: string }>();
  const propertyId = explicitPropertyId ?? params.id;
  const [view, setView] = React.useState<'LIST' | 'MAP'>('LIST');
  const query = useQuery({
    queryKey: ['around-your-home', propertyId],
    queryFn: () => getAroundYourHome(propertyId),
    enabled: Boolean(propertyId),
  });

  return (
    <MobilePageContainer className="space-y-6">
      <HomeToolHeader
        toolId="neighborhood-change-radar"
        propertyId={propertyId}
        backHref={`/dashboard/properties/${propertyId}`}
        backLabel="Back to property"
        showBackLink
      />

      <MobileCard className="border-indigo-200 bg-indigo-50/50">
        <h1 className="text-xl font-semibold text-slate-950">Around Your Home</h1>
        <p className="mt-1 text-sm text-slate-700">
          Follow factual planning, infrastructure, land-use, flood-map, and school updates from reviewed sources.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Possible relevance is shown separately. This view does not predict property value, demand,
          insurance cost, or household impact.
        </p>
      </MobileCard>

      {query.isLoading ? (
        <EmptyStateCard title="Checking reviewed local sources" description="Loading source coverage and matched records." />
      ) : query.isError || !query.data ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Around Your Home is unavailable</AlertTitle>
          <AlertDescription>
            Reviewed source coverage could not be loaded. This is not an all-clear.
            <Button className="ml-2" size="sm" variant="outline" onClick={() => query.refetch()}>Try again</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <MobileSection>
            <MobileSectionHeader title="Source coverage" subtitle="Only reviewed providers and QA-reviewed geographies can appear here." />
            <SourceCoverageSummary
              state={query.data.coverage.state}
              comprehensive={query.data.coverage.comprehensive}
              sources={query.data.coverage.sources}
              limitations={query.data.coverage.limitations}
            />
          </MobileSection>

          {query.data.property.latitude == null || query.data.property.longitude == null ? (
            <MissingFactPrompt
              propertyId={propertyId}
              facts={['property coordinates']}
              benefit="A verified property location allows exact point and polygon matching. Without it, only honest area-level context can be shown."
            />
          ) : null}

          <MobileSection>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <MobileSectionHeader
                title="Local source records"
                subtitle="Followed updates first, then new and active records; completed or dismissed records remain available."
              />
              <div className="flex gap-2">
                <Button size="sm" variant={view === 'LIST' ? 'default' : 'outline'} onClick={() => setView('LIST')}>
                  <List className="mr-1 h-4 w-4" /> List
                </Button>
                <Button size="sm" variant={view === 'MAP' ? 'default' : 'outline'} onClick={() => setView('MAP')}>
                  <Map className="mr-1 h-4 w-4" /> Map
                </Button>
              </div>
            </div>
            {view === 'MAP' ? (
              <CoordinateMap
                items={query.data.map.points}
                property={query.data.property}
                unplottedCount={query.data.map.unplottedCount}
                precisionNote={query.data.map.precisionNote}
              />
            ) : query.data.items.length > 0 ? (
              <div className="space-y-4">
                {query.data.items.map((item) => (
                  <ObservationCard key={item.propertyMatchId} item={item} propertyId={propertyId} />
                ))}
              </div>
            ) : (
              <EmptyStateCard
                title="No matched local-change records"
                description="No reviewed source records are currently linked to this property. Coverage may be unavailable or incomplete, so this is not an all-clear."
              />
            )}
          </MobileSection>

          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertTitle>Interpretation boundary</AlertTitle>
            <AlertDescription>{query.data.interpretationBoundary}</AlertDescription>
          </Alert>
        </>
      )}
      <PropertyIntelligenceJourneyLinks propertyId={propertyId} current="SOURCE_VIEW" />
    </MobilePageContainer>
  );
}
