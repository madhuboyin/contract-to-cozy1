// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listHomeEvents, HomeEvent, TimelineProjectionEntry } from './homeEventsApi';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { EmptyStateCard } from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../components/route-templates/DetailTemplate';
import TableToMobileCards from '../components/route-templates/TableToMobileCards';
import {
  DatePrecisionLabel,
  PropertyIntelligenceJourneyLinks,
  TruthStateBadge,
} from '@/components/property-intelligence/PropertyIntelligencePrimitives';

// Optional: if you have shared UI components already, feel free to swap these out.
// Keeping it plain + drop-in.
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function iconForType(type?: string) {
  switch (type) {
    case 'PURCHASE': return '🛒';
    case 'REPAIR': return '🛠️';
    case 'MAINTENANCE': return '🧰';
    case 'IMPROVEMENT': return '✨';
    case 'CLAIM': return '🧾';
    case 'INSPECTION': return '🔎';
    case 'VALUE_UPDATE': return '📈';
    case 'DOCUMENT': return '📄';
    default: return '•';
  }
}

function shortImportanceLabel(importance: HomeEvent['importance'] | null | undefined) {
  if (!importance || importance === 'NORMAL' || importance === 'LOW') return null;
  return importance === 'HIGHLIGHT' ? 'Highlight' : null;
}

function formatHomeEventDate(event: HomeEvent) {
  const date = new Date(event.occurredAt);
  if (Number.isNaN(date.getTime())) return event.occurredAt;
  if (event.datePrecision === 'MONTH') {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }
  if (event.datePrecision === 'YEAR') return String(date.getFullYear());
  if (event.datePrecision === 'RANGE') {
    return event.dateRangeStart && event.dateRangeEnd
      ? `${formatDate(event.dateRangeStart)} – ${formatDate(event.dateRangeEnd)}`
      : `Around ${formatDate(event.occurredAt)}`;
  }
  if (event.datePrecision === 'UNKNOWN') return 'Date unknown';
  return formatDate(event.occurredAt);
}

function groupEventsByYear(events: HomeEvent[]): Array<{ year: number; events: HomeEvent[] }> {
  const map = new Map<number, HomeEvent[]>();
  for (const e of events) {
    const y = new Date(e.occurredAt).getFullYear();
    map.set(y, [...(map.get(y) ?? []), e]);
  }
  const years = Array.from(map.keys()).sort((a, b) => b - a);
  return years.map((y) => ({ year: y, events: map.get(y) ?? [] }));
}

function toHomeEventFromTimelineEntry(entry: TimelineProjectionEntry): HomeEvent {
  return {
    id: entry.id,
    propertyId: '',
    type: (entry.eventType as HomeEvent['type']) ?? 'MILESTONE',
    subtype: null, // never expose raw signal keys or internal codes as visible badges
    importance: 'NORMAL',
    occurredAt: entry.occurredAt,
    endAt: null,
    datePrecision: (entry.payloadJson?.datePrecision as HomeEvent['datePrecision']) ?? 'EXACT_DATE',
    dateRangeStart: null,
    dateRangeEnd: null,
    observationKind: (entry.payloadJson?.observationKind as HomeEvent['observationKind'])
      ?? (entry.kind === 'SIGNAL' ? 'INFERRED' : 'SYSTEM_GENERATED'),
    verificationStatus: (entry.payloadJson?.verificationStatus as HomeEvent['verificationStatus'])
      ?? (entry.kind === 'SIGNAL' ? 'PENDING_CONFIRMATION' : 'UNVERIFIED'),
    title: entry.title,
    summary: entry.summary ?? null,
    amount: null,
    currency: null,
    valueDelta: null,
    meta: {
      timelineProjectionKind: entry.kind,
      sourceModel: entry.sourceModel,
      signalKey: entry.signalKey,
      ...((entry.payloadJson?.meta as Record<string, unknown> | null) ?? {}),
      synthetic: entry.payloadJson?.synthetic === true,
    },
    groupKey: null,
    createdAt: entry.occurredAt,
    updatedAt: entry.occurredAt,
    documents: [],
  };
}

export type TimelineClientProps = {
  // Controlled mode (provided by parent to avoid double-fetch)
  events?: HomeEvent[];
  isLoading?: boolean;
  error?: unknown;
  isFetching?: boolean;
  onRefresh?: () => void;
  onSelectEvent?: (event: HomeEvent) => void;
  selectedEventIds?: string[];
  onToggleSelected?: (eventId: string) => void;

  // Optional UI controls (useful when embedded)
  hideHeader?: boolean;
  hideFilters?: boolean;
};

export default function TimelineClient(props: TimelineClientProps = {}) {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [type, setType] = useState<string>(''); // empty = all
  const [limit, setLimit] = useState<number>(80);

  const isControlled = props.events !== undefined;

  const queryKey = useMemo(() => ['homeEvents', propertyId, type || 'ALL', limit], [propertyId, type, limit]);

  const query = useQuery({
    queryKey,
    enabled: !!propertyId && !isControlled,
    queryFn: async () => {
      const res = await listHomeEvents(propertyId, {
        type: type || undefined,
        limit,
      });

      const payload = res?.data ?? res;
      const inner = (payload as Record<string, unknown>)?.data ?? payload;
      const timelineEntries = (inner as Record<string, unknown>)?.timelineEntries ?? [];
      if (Array.isArray(timelineEntries) && timelineEntries.length > 0) {
        return (timelineEntries as TimelineProjectionEntry[]).map(toHomeEventFromTimelineEntry);
      }
      const events = (inner as Record<string, unknown>)?.events ?? [];
      return Array.isArray(events) ? (events as HomeEvent[]) : [];
    },
  });

  const events: HomeEvent[] = isControlled ? (props.events ?? []) : (query.data ?? []);
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );
  const isLoading = isControlled ? !!props.isLoading : query.isLoading;
  const error = isControlled ? props.error : query.error;
  const isFetching = isControlled ? !!props.isFetching : query.isFetching;

  const onRefresh = props.onRefresh ?? (() => query.refetch());

  const filters = !props.hideFilters ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <div className="text-sm text-muted-foreground">Filter:</div>

      <select
        className="rounded-md border px-2 py-2 text-sm"
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={isControlled}
      >
        <option value="">All</option>
        <option value="PURCHASE">Purchase</option>
        <option value="REPAIR">Repair</option>
        <option value="MAINTENANCE">Maintenance</option>
        <option value="IMPROVEMENT">Improvement</option>
        <option value="CLAIM">Claim</option>
        <option value="INSPECTION">Inspection</option>
        <option value="DOCUMENT">Document</option>
        <option value="VALUE_UPDATE">Value</option>
        <option value="MILESTONE">Milestone</option>
        <option value="NOTE">Note</option>
        <option value="OTHER">Other</option>
      </select>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Limit</span>
        <input
          className="w-24 rounded-md border px-2 py-2 text-sm"
          type="number"
          min={10}
          max={200}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          disabled={isControlled}
        />
      </div>

      <div className="ml-auto text-xs text-muted-foreground">
        {isFetching ? 'Updating…' : `${events.length} event(s)`}
      </div>

      {isControlled ? (
        <div className="text-xs text-muted-foreground">
          (Filters managed by view mode)
        </div>
      ) : null}
    </div>
  ) : null;

  const body = isLoading ? (
    <EmptyStateCard
      title="Loading timeline"
      description="Fetching your home events now."
    />
  ) : error ? (
    <EmptyStateCard
      title="Failed to load timeline"
      description={error instanceof Error ? error.message : 'Unknown error'}
      action={
        <button
          className="rounded-md border px-3 py-2 text-sm"
          onClick={onRefresh}
          disabled={isFetching}
        >
          Try again
        </button>
      }
    />
  ) : events.length === 0 ? (
    <EmptyStateCard
      title="No timeline events yet"
      description="Create an item, add an expense, upload a document, or open a claim and your story will appear here."
    />
  ) : (
    <div className="space-y-6">
      {groupEventsByYear(events).map(({ year, events: yearEvents }) => (
        <div key={year}>
          <div className="mb-3 flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-500">{year}</div>
            <div className="flex-1 border-t border-slate-200/80" />
            <div className="text-xs text-slate-400">{yearEvents.length} event{yearEvents.length !== 1 ? 's' : ''}</div>
          </div>
          <TableToMobileCards
            rows={yearEvents}
            getRowKey={(event) => event.id}
            title={(event) => (
              <span className={event.parentEventId ? 'inline-flex items-start gap-2 pl-4' : 'inline-flex items-start gap-2'}>
                <span aria-hidden>{iconForType(event.type)}</span>
                <span>
                  <span className="block">{event.title}</span>
                  {event.parentEventId && (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      Milestone in {eventById.get(event.parentEventId)?.title ?? 'grouped home story'}
                    </span>
                  )}
                </span>
              </span>
            )}
            subtitle={(event) => formatHomeEventDate(event)}
            columns={[
              {
                key: 'actions',
                label: 'History controls',
                render: (event) => (
                  <div className="flex flex-wrap gap-2">
                    {event.meta?.synthetic === true ? (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        Inferred from inventory · add a recorded event to confirm it
                      </span>
                    ) : props.onToggleSelected ? (
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => props.onToggleSelected?.(event.id)}
                      >
                        {props.selectedEventIds?.includes(event.id) ? 'Remove from export' : 'Select for export'}
                      </button>
                    ) : null}
                    {event.meta?.synthetic !== true && props.onSelectEvent ? (
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs font-medium"
                        onClick={() => props.onSelectEvent?.(event)}
                      >
                        Review or correct
                      </button>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'classification',
                label: 'Classification',
                render: (event) => (
                  <div className="flex flex-wrap gap-1.5">
                    {event.type ? <Badge>{formatEnumLabel(event.type)}</Badge> : null}
                    {shortImportanceLabel(event.importance) ? <Badge>{shortImportanceLabel(event.importance)}</Badge> : null}
                    {event.subtype && event.subtype !== event.type ? <Badge>{formatEnumLabel(event.subtype)}</Badge> : null}
                    <Badge>{formatEnumLabel(event.observationKind)}</Badge>
                    <TruthStateBadge state={event.verificationStatus} />
                    <DatePrecisionLabel value={event.occurredAt} precision={event.datePrecision} />
                  </div>
                ),
              },
              {
                key: 'summary',
                label: 'Summary',
                render: (event) => event.summary ? (
                  <p className="mb-0 text-sm text-slate-700">{event.summary}</p>
                ) : (
                  <p className="mb-0 text-sm text-slate-500">No additional summary</p>
                ),
              },
              {
                key: 'documents',
                label: 'Documents',
                render: (event) => Array.isArray(event.documents) && event.documents.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {event.documents.slice(0, 4).map((doc) => (
                      <Badge key={doc.id}>
                        {formatEnumLabel(doc.kind) || 'Doc'}: {doc.document?.name || 'Attachment'}
                      </Badge>
                    ))}
                    {event.documents.length > 4 ? <Badge>+{event.documents.length - 4} more</Badge> : null}
                  </div>
                ) : (
                  <p className="mb-0 text-sm text-slate-500">None attached</p>
                ),
              },
              {
                key: 'financial',
                label: 'Financial',
                render: (event) => (
                  <div className="space-y-1">
                    <p className="mb-0 text-sm text-slate-700">
                      Amount: {event.amount != null ? `$${event.amount}` : '—'}
                    </p>
                    <p className="mb-0 text-sm text-slate-700">
                      Delta: {event.valueDelta != null ? `${event.valueDelta}` : '—'}
                    </p>
                  </div>
                ),
              },
            ]}
          />
        </div>
      ))}
    </div>
  );

  return (
    props.hideHeader ? (
      <div className="space-y-4">
        {filters}
        {body}
      </div>
    ) : (
      <DetailTemplate
        title="Home Timeline"
        subtitle="Your home story, organized into a clear event stream you can trust."
        controls={(
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={onRefresh}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
        trust={{
          confidenceLabel: `${events.length} events from linked records and modeled timeline entries`,
          freshnessLabel: isFetching ? 'Refreshing now' : 'Updates when claims, repairs, docs, and value events are added',
          sourceLabel: 'Home events API + timeline projections + attached document details',
          rationale: 'Events are grouped in one sequence to reduce report hunting and preserve decision context.',
        }}
      >
        {filters}
        {body}
        <PropertyIntelligenceJourneyLinks propertyId={propertyId} current="TIMELINE" />
      </DetailTemplate>
    )
  );
}
