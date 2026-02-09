// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listHomeEvents, HomeEvent } from './homeEventsApi';

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
      const events = (inner as Record<string, unknown>)?.events ?? [];
      return Array.isArray(events) ? (events as HomeEvent[]) : [];
    },
  });

  const events: HomeEvent[] = isControlled ? (props.events ?? []) : (query.data ?? []);
  const isLoading = isControlled ? !!props.isLoading : query.isLoading;
  const error = isControlled ? props.error : query.error;
  const isFetching = isControlled ? !!props.isFetching : query.isFetching;

  const onRefresh = props.onRefresh ?? (() => query.refetch());

  return (
    <div className="space-y-4">
      {/* Header */}
      {!props.hideHeader ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Home Timeline</h1>
            <p className="text-sm text-muted-foreground">
              Your home’s story — purchases, repairs, claims, improvements, and key documents.
            </p>
          </div>

          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={onRefresh}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      ) : null}

      {/* Filters */}
      {!props.hideFilters ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <div className="text-sm text-muted-foreground">Filter:</div>

          <select
            className="rounded-md border px-2 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={isControlled} // parent controls filtering in controlled mode
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
      ) : null}

      {/* Body */}
      {isLoading ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading timeline…</div>
      ) : error ? (
        <div className="rounded-lg border p-4 text-sm">
          Failed to load timeline.
          <div className="mt-2 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No timeline events yet. Create an item, add an expense, upload a document, or open a claim — and your story will appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{iconForType(e.type)}</span>
                    <div className="font-medium truncate">{e.title}</div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(e.occurredAt)}</span>
                    {e.type && <Badge>{e.type}</Badge>}
                    {e.importance && <Badge>{e.importance}</Badge>}
                    {e.subtype && <Badge>{e.subtype}</Badge>}
                  </div>

                  {e.summary ? (
                    <div className="mt-2 text-sm text-muted-foreground">{e.summary}</div>
                  ) : null}

                  {/* Attachments preview */}
                  {Array.isArray(e.documents) && e.documents.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {e.documents.slice(0, 6).map((d) => (
                        <Badge key={d.id}>
                          {d.kind || 'DOC'}: {d.document?.name || 'Attachment'}
                        </Badge>
                      ))}
                      {e.documents.length > 6 ? <Badge>+{e.documents.length - 6} more</Badge> : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {e.amount != null ? <Badge>${e.amount}</Badge> : null}
                  {e.valueDelta != null ? <Badge>Δ {e.valueDelta}</Badge> : null}
                </div>
              </div>

              {/* Semantic promotion debug (optional) */}
              {e?.meta?.semantic && typeof e.meta.semantic === 'object' ? (() => {
                const sem = e.meta.semantic as Record<string, unknown>;
                return (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Semantic: {sem.promoted ? 'promoted' : 'not promoted'}
                    {sem.confidence != null ? ` · conf=${sem.confidence}` : ''}
                    {sem.reason ? ` · ${String(sem.reason)}` : ''}
                  </div>
                );
              })() : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
