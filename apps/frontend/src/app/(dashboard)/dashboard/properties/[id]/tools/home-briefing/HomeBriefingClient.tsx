'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Check,
  ExternalLink,
  FileText,
  RefreshCw,
  Settings2,
  Share2,
  ThumbsDown,
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
  PropertyIntelligenceJourneyLinks,
  SourceCoverageSummary,
} from '@/components/property-intelligence/PropertyIntelligencePrimitives';
import {
  createHomeBriefingShare,
  generateHomeBriefing,
  getHomeBriefing,
  type HomeBriefingCadence,
  type HomeBriefingChannel,
  type HomeBriefingItem,
  type HomeBriefingTopic,
  openHomeBriefing,
  recordHomeBriefingOutcome,
  updateHomeBriefingPreferences,
} from './homeBriefingApi';

const CADENCES: HomeBriefingCadence[] = ['IMMEDIATE', 'WEEKLY', 'MONTHLY', 'IMPORTANT_ONLY'];
const CHANNELS: HomeBriefingChannel[] = ['IN_APP', 'EMAIL', 'PUSH'];
const TOPICS: HomeBriefingTopic[] = [
  'HOME_ACTION',
  'HOME_HISTORY',
  'LOCAL_CHANGE',
  'HAZARD',
  'PROPERTY_FACT',
  'SOURCE_HEALTH',
  'OTHER',
];

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return 'not available';
  return new Date(value).toLocaleString();
}

function itemTone(materiality: HomeBriefingItem['materiality']) {
  if (materiality === 'URGENT') return 'danger' as const;
  if (materiality === 'IMPORTANT') return 'elevated' as const;
  if (materiality === 'MEANINGFUL') return 'good' as const;
  return 'info' as const;
}

function BriefingItemCard({
  item,
  propertyId,
  selected,
  onSelected,
}: {
  item: HomeBriefingItem;
  propertyId: string;
  selected: boolean;
  onSelected: (selected: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const outcome = useMutation({
    mutationFn: (value: 'OPENED' | 'SEEN' | 'ACTED' | 'DISMISSED' | 'NOT_USEFUL') =>
      recordHomeBriefingOutcome(propertyId, item.id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home-briefing', propertyId] }),
  });
  const source = item.sourceLineage.source;

  return (
    <MobileCard className={`space-y-4 ${item.dismissedAt || item.notUsefulAt ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={itemTone(item.materiality)}>{humanize(item.materiality)}</StatusChip>
            <StatusChip tone="info">{humanize(item.topic)}</StatusChip>
            {!item.seenAt ? <StatusChip tone="elevated">Unread</StatusChip> : null}
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{item.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{item.summary}</p>
        </div>
        {item.shareEligible ? (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => onSelected(event.target.checked)}
            />
            Select to share
          </label>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-900">Source lineage</p>
        <p className="mt-1">
          {humanize(item.sourceLineage.changeType)} · revision {item.sourceLineage.sourceRevision}
          {' · '}detected {formatDate(item.sourceLineage.detectedAt)}
        </p>
        <p className="mt-1">
          Canonical change {item.propertyChangeId} · {humanize(item.sourceLineage.sourceType)}
        </p>
        {source ? (
          <>
            <p className="mt-1">
              {source.provider} · checked {formatDate(source.lastVerifiedAt)}
              {' · '}{humanize(source.lifecycleStatus)}
            </p>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="no-brand-style mt-1 inline-flex items-center font-medium text-slate-700 underline hover:text-slate-950"
              >
                Open exact source <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          asChild
          onClick={() => outcome.mutate(
            item.canonicalActionId || item.canonicalEventId ? 'ACTED' : 'OPENED',
          )}
        >
          <Link href={item.primaryDeepLink}>
            Open canonical owner <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => outcome.mutate('SEEN')} disabled={outcome.isPending}>
          <Check className="mr-1 h-3.5 w-3.5" /> Seen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => outcome.mutate('NOT_USEFUL')} disabled={outcome.isPending}>
          <ThumbsDown className="mr-1 h-3.5 w-3.5" /> Not useful
        </Button>
        <Button size="sm" variant="ghost" onClick={() => outcome.mutate('DISMISSED')} disabled={outcome.isPending}>
          <X className="mr-1 h-3.5 w-3.5" /> Dismiss
        </Button>
      </div>
    </MobileCard>
  );
}

export default function HomeBriefingClient({
  propertyId: explicitPropertyId,
}: {
  propertyId?: string;
} = {}) {
  const params = useParams<{ id: string }>();
  const propertyId = explicitPropertyId ?? params.id;
  const queryClient = useQueryClient();
  const [showPreferences, setShowPreferences] = React.useState(false);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const query = useQuery({
    queryKey: ['home-briefing', propertyId],
    queryFn: () => getHomeBriefing(propertyId),
    enabled: Boolean(propertyId),
  });
  const [enabled, setEnabled] = React.useState(true);
  const [cadence, setCadence] = React.useState<HomeBriefingCadence>('WEEKLY');
  const [topics, setTopics] = React.useState<HomeBriefingTopic[]>([]);
  const [channels, setChannels] = React.useState<HomeBriefingChannel[]>(['IN_APP']);

  React.useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.preference.enabled);
    setCadence(query.data.preference.cadence);
    setTopics(query.data.preference.topics);
    setChannels(query.data.preference.channels);
  }, [query.data]);

  React.useEffect(() => {
    if (!query.data?.current || query.data.current.openedAt) return;
    void openHomeBriefing(propertyId, query.data.current.id).then(() =>
      queryClient.invalidateQueries({ queryKey: ['home-briefing', propertyId] }));
  }, [propertyId, query.data?.current?.id, query.data?.current?.openedAt, queryClient]);

  const generate = useMutation({
    mutationFn: () => generateHomeBriefing(propertyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home-briefing', propertyId] }),
  });
  const savePreferences = useMutation({
    mutationFn: () => updateHomeBriefingPreferences(propertyId, {
      enabled,
      cadence,
      topics,
      channels,
    }),
    onSuccess: () => {
      setShowPreferences(false);
      return queryClient.invalidateQueries({ queryKey: ['home-briefing', propertyId] });
    },
  });
  const share = useMutation({
    mutationFn: () => {
      if (!query.data?.current) throw new Error('No briefing is selected.');
      return createHomeBriefingShare(propertyId, query.data.current.id, selectedItems);
    },
    onSuccess: (result) => setShareUrl(result.shareUrl),
  });

  const toggle = <T extends string>(value: T, values: T[], setValues: (next: T[]) => void) =>
    setValues(values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value]);

  return (
    <MobilePageContainer className="space-y-6">
      <HomeToolHeader
        toolId="home-briefing"
        propertyId={propertyId}
        backHref={`/dashboard/properties/${propertyId}`}
        backLabel="Back to property"
        showBackLink
      />

      <MobileCard className="border-indigo-200 bg-indigo-50/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Home Briefing</h1>
            <p className="mt-1 text-sm text-slate-700">
              Meaningful changes since your last delivery, linked back to the canonical source,
              Home Action, or Timeline record.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreferences((value) => !value)}>
              <Settings2 className="mr-1 h-4 w-4" /> Preferences
            </Button>
            <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending || !enabled}>
              <RefreshCw className={`mr-1 h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`} />
              Check changes
            </Button>
          </div>
        </div>
      </MobileCard>

      {showPreferences ? (
        <MobileCard className="space-y-4">
          <MobileSectionHeader title="Delivery preferences" subtitle="Choose cadence, topics, and channels. An empty topic selection includes all topics." />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Home Briefing enabled
          </label>
          <div>
            <p className="text-sm font-medium text-slate-800">Cadence</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CADENCES.map((value) => (
                <Button key={value} size="sm" variant={cadence === value ? 'default' : 'outline'} onClick={() => setCadence(value)}>
                  {humanize(value)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Topics</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOPICS.map((value) => (
                <Button key={value} size="sm" variant={topics.includes(value) ? 'default' : 'outline'} onClick={() => toggle(value, topics, setTopics)}>
                  {humanize(value)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Channels</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHANNELS.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={channels.includes(value) ? 'default' : 'outline'}
                  onClick={() => {
                    if (channels.includes(value) && channels.length === 1) return;
                    toggle(value, channels, setChannels);
                  }}
                >
                  {humanize(value)}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={() => savePreferences.mutate()} disabled={savePreferences.isPending}>
            Save preferences
          </Button>
        </MobileCard>
      ) : null}

      {query.isLoading ? (
        <EmptyStateCard title="Loading Home Briefing" description="Checking your delivery archive and preferences." />
      ) : query.isError || !query.data ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Home Briefing is unavailable</AlertTitle>
          <AlertDescription>We could not load canonical property changes. Try again.</AlertDescription>
        </Alert>
      ) : !query.data.current ? (
        <EmptyStateCard
          title="No briefing delivery yet"
          description="Check for meaningful canonical changes. A delivery may contain zero items when nothing eligible changed."
          action={<Button onClick={() => generate.mutate()}>Check for changes</Button>}
        />
      ) : (
        <>
          <MobileSection>
            <MobileSectionHeader
              title="Current delivery"
              subtitle={`${humanize(query.data.current.cadence)} · ${formatDate(query.data.current.windowStart)} to ${formatDate(query.data.current.windowEnd)}`}
            />
            {query.data.current.items.length > 0 ? (
              <div className="space-y-4">
                {query.data.current.items.map((item) => (
                  <BriefingItemCard
                    key={item.id}
                    item={item}
                    propertyId={propertyId}
                    selected={selectedItems.includes(item.id)}
                    onSelected={(selected) =>
                      setSelectedItems((current) =>
                        selected ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}
                  />
                ))}
              </div>
            ) : (
              <MobileCard className="space-y-3">
                <p className="font-semibold text-slate-950">No material changes in this delivery window</p>
                <p className="text-sm text-slate-700">
                  This is not automatically an all-clear. The source-health snapshot below explains
                  whether coverage was current, degraded, stale, unavailable, or not configured.
                </p>
                {query.data.current.quietReasonCodes.map((reason) => (
                  <StatusChip key={reason} tone="elevated">{humanize(reason)}</StatusChip>
                ))}
              </MobileCard>
            )}
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader title="Source health snapshot" subtitle="Captured with this delivery; coverage is never presented as comprehensive." />
            <SourceCoverageSummary
              state={
                query.data.current.sourceHealthSnapshot.sources.length === 0
                  ? 'NOT_CONFIGURED'
                  : query.data.current.sourceHealthSnapshot.sources.every((source) => source.state === 'CURRENT')
                    ? 'CURRENT'
                    : 'DEGRADED'
              }
              comprehensive={query.data.current.sourceHealthSnapshot.comprehensive}
              sources={query.data.current.sourceHealthSnapshot.sources}
              limitations={query.data.current.sourceHealthSnapshot.scopeLimitations}
              title="Delivery source-health snapshot"
            />
          </MobileSection>

          {selectedItems.length > 0 ? (
            <MobileCard className="space-y-3">
              <p className="font-semibold text-slate-950">Share selected items</p>
              <p className="text-sm text-slate-600">
                Only the {selectedItems.length} explicitly selected share-eligible
                {selectedItems.length === 1 ? ' item' : ' items'} will be included.
              </p>
              <Button onClick={() => share.mutate()} disabled={share.isPending}>
                <Share2 className="mr-1 h-4 w-4" /> Create 7-day link
              </Button>
              {shareUrl ? (
                <p className="break-all rounded-lg bg-slate-50 p-3 text-xs">
                  {typeof window !== 'undefined' ? window.location.origin : ''}{shareUrl}
                </p>
              ) : null}
            </MobileCard>
          ) : null}

          <Alert>
            <FileText className="h-4 w-4" />
            <AlertTitle>Deterministic baseline</AlertTitle>
            <AlertDescription>{query.data.editorialBoundary}</AlertDescription>
          </Alert>

          <MobileSection>
            <MobileSectionHeader title="Delivery archive" subtitle={query.data.archiveBoundary} />
            <MobileCard className="space-y-2">
              {query.data.archive.map((delivery) => (
                <div key={delivery.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-950">{formatDate(delivery.generatedAt)}</p>
                    <p className="text-slate-600">{humanize(delivery.cadence)} · {delivery.itemCount} {delivery.itemCount === 1 ? 'item' : 'items'}</p>
                  </div>
                  <Archive className="h-4 w-4 text-slate-400" />
                </div>
              ))}
            </MobileCard>
          </MobileSection>
        </>
      )}
      <PropertyIntelligenceJourneyLinks propertyId={propertyId} current="BRIEFING" />
    </MobilePageContainer>
  );
}
