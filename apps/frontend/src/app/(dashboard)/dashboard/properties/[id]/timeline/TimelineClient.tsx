// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listHomeEvents } from './homeEventsApi';

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

export default function TimelineClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [type, setType] = useState<string>(''); // empty = all
  const [limit, setLimit] = useState<number>(80);

  const queryKey = useMemo(() => ['homeEvents', propertyId, type || 'ALL', limit], [propertyId, type, limit]);

  const { data: events = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    enabled: !!propertyId,
    queryFn: async () => {
      const res: any = await listHomeEvents(propertyId, {
        type: type || undefined,
        limit,
      });

      // Support multiple shapes:
      // 1) AxiosResponse -> res.data = { success, data: { events } }
      // 2) Wrapper-unwrapped -> res = { success, data: { events } }
      // 3) Fully unwrapped -> res = { events }
      const payload = res?.data ?? res;
      const inner = payload?.data ?? payload;
      const events = inner?.events ?? [];

      return Array.isArray(events) ? events : [];
    },
  });
  
  console.log('🎌 TimelineClient data:', events);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Home Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Your home’s story — purchases, repairs, claims, improvements, and key documents.
          </p>
        </div>

        <button
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <div className="text-sm text-muted-foreground">Filter:</div>

        <select
          className="rounded-md border px-2 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
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
          />
        </div>

        <div className="ml-auto text-xs text-muted-foreground">
          {isFetching ? 'Updating…' : `${events.length} event(s)`}
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading timeline…</div>
      ) : error ? (
        <div className="rounded-lg border p-4 text-sm">
          Failed to load timeline.
          <div className="mt-2 text-xs text-muted-foreground">
            {(error as any)?.message ?? 'Unknown error'}
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No timeline events yet. Create an item, add an expense, upload a document, or open a claim — and your story will appear here.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e: any) => (
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
                      {e.documents.slice(0, 6).map((d: any) => (
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
              {e?.meta?.semantic ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  Semantic: {e.meta.semantic.promoted ? 'promoted' : 'not promoted'}
                  {e.meta.semantic.confidence != null ? ` · conf=${e.meta.semantic.confidence}` : ''}
                  {e.meta.semantic.reason ? ` · ${e.meta.semantic.reason}` : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
