// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listHomeEvents, HomeEvent, TimelineProjectionEntry } from './homeEventsApi';
import { EmptyStateCard } from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../components/route-templates/DetailTemplate';
import TableToMobileCards from '../components/route-templates/TableToMobileCards';

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
  if (!importance) return null;
  return importance === 'HIGHLIGHT' ? 'High Priority' : importance;
}

function toHomeEventFromTimelineEntry(entry: TimelineProjectionEntry): HomeEvent {
  const signalKey = entry.signalKey ?? undefined;
  const summaryPrefix = entry.kind === 'SIGNAL' && signalKey ? `${signalKey.replace(/_/g, ' ')}: ` : '';
  const derivedImportance: HomeEvent['importance'] =
    entry.kind === 'SIGNAL' && (signalKey === 'RISK_SPIKE' || signalKey === 'COST_ANOMALY' || signalKey === 'COVERAGE_GAP')
      ? 'HIGHLIGHT'
      : 'NORMAL';

  return {
    id: entry.id,
    propertyId: '',
    type: (entry.eventType as HomeEvent['type']) ?? 'MILESTONE',
    subtype: entry.kind === 'SIGNAL' ? signalKey ?? null : entry.eventType,
    importance: derivedImportance,
    occurredAt: entry.occurredAt,
    endAt: null,
    title: entry.title,
    summary: entry.summary ? `${summaryPrefix}${entry.summary}` : entry.kind === 'SIGNAL' ? 'Derived from shared signals.' : null,
    amount: null,
    currency: null,
    valueDelta: null,
    meta: {
      timelineProjectionKind: entry.kind,
      sourceModel: entry.sourceModel,
      signalKey: entry.signalKey,
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
    <TableToMobileCards
      rows={events}
      getRowKey={(event) => event.id}
      title={(event) => (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden>{iconForType(event.type)}</span>
          <span>{event.title}</span>
        </span>
      )}
      subtitle={(event) => formatDate(event.occurredAt)}
      columns={[
        {
          key: 'classification',
          label: 'Classification',
          render: (event) => (
            <div className="flex flex-wrap gap-1.5">
              {event.type ? <Badge>{event.type}</Badge> : null}
              {shortImportanceLabel(event.importance) ? <Badge>{shortImportanceLabel(event.importance)}</Badge> : null}
              {event.subtype ? <Badge>{event.subtype}</Badge> : null}
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
                  {doc.kind || 'DOC'}: {doc.document?.name || 'Attachment'}
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
          sourceLabel: 'Home events API + timeline projections + attached document metadata',
          rationale: 'Events are grouped in one sequence to reduce report hunting and preserve decision context.',
        }}
      >
        {filters}
        {body}
      </DetailTemplate>
    )
  );
}
