// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import TimelineClient from './TimelineClient';
import { listHomeEvents } from './homeEventsApi';

type Mode = 'LIST' | 'VISUAL';

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
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
    case 'MILESTONE': return '🏁';
    default: return '•';
  }
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}
function useOneShotGlow(active: boolean, durationMs = 600) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!active) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), durationMs);
    return () => clearTimeout(t);
  }, [active, durationMs]);

  return on;
}

function RevealIn({
  children,
  enabled,
  highlight,
}: {
  children: React.ReactNode;
  enabled: boolean;
  highlight?: boolean;
}) {

  const [shown, setShown] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShown(true);
      return;
    }
    // Start hidden, then reveal next frame so transition runs
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [enabled]);

  const offset = highlight ? 12 : 8;

  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown
          ? 'translateY(0px)'
          : `translateY(${offset}px)`,
        transition: highlight
          ? 'opacity 520ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)'
          : 'opacity 420ms ease, transform 420ms ease',
        boxShadow:
          shown && highlight
            ? '0 0 0 0 rgba(0,0,0,0)'
            : highlight
            ? '0 6px 20px rgba(0,0,0,0.06)'
            : undefined,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );  
}

function groupByYear(events: any[]) {
  const map = new Map<number, any[]>();
  for (const e of events) {
    const y = new Date(e.occurredAt).getFullYear();
    map.set(y, [...(map.get(y) ?? []), e]);
  }
  const years = Array.from(map.keys()).sort((a, b) => b - a);
  return years.map((y) => ({ year: y, events: map.get(y) ?? [] }));
}

function TimelineVisual({
  events,
  replayOn,
  replayRunning,
  replayIndex,
  setReplayIndex,
  setReplayRunning,
  replaySpeedMs,
}: {
  events: any[];
  replayOn: boolean;
  replayRunning: boolean;
  replayIndex: number;
  setReplayIndex: (n: number) => void;
  setReplayRunning: (v: boolean) => void;
  replaySpeedMs: number;
}) {
  // Replay should reveal from oldest -> newest
  const chronological = useMemo(() => {
    const copy = [...events];
    copy.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    return copy;
  }, [events]);

  const visibleChronological = useMemo(() => {
    if (!replayOn) return chronological;
    // show at least 1 item once replay starts
    const n = Math.max(0, Math.min(replayIndex, chronological.length));
    return chronological.slice(0, n);
  }, [replayOn, replayIndex, chronological]);

  // Timer: advance replay
  useEffect(() => {
    if (!replayOn) return;
    if (!replayRunning) return;

    if (replayIndex >= chronological.length) {
      // stop at the end (MVP)
      setReplayRunning(false);
      return;
    }

    const t = window.setTimeout(() => {
      setReplayIndex(replayIndex + 1);
    }, replaySpeedMs);

    return () => window.clearTimeout(t);
  }, [replayOn, replayRunning, replayIndex, chronological.length, replaySpeedMs, setReplayIndex, setReplayRunning]);

  // Auto-scroll to bottom as events reveal
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!replayOn) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [replayOn, replayIndex]);

  const groups = useMemo(() => groupByYear(visibleChronological), [visibleChronological]);

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.year} className="space-y-4">
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur py-2">
            <div className="text-sm text-muted-foreground">Year</div>
            <div className="text-xl font-semibold">{g.year}</div>
          </div>

          <div className="relative">
            {/* spine */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-6 pl-12">
              {g.events.map((e, index) => {
                const highlight = e.importance === 'HIGHLIGHT';
                const glow = useOneShotGlow(replayOn && highlight);

                return (
                  <RevealIn
                    key={e.id}
                    enabled={replayOn}
                    highlight={e.importance === 'HIGHLIGHT'}
                  >
                    <div className="relative">
                      {/* node */}
                      <div
                        className={clsx(
                          'absolute -left-12 top-5 flex h-8 w-8 items-center justify-center rounded-full border bg-background transition-all duration-300',
                          highlight && 'ring-2 ring-primary/30'
                        )}
                        style={{
                          boxShadow: glow
                            ? '0 0 0 6px rgba(99,102,241,0.12)' // soft indigo halo
                            : undefined,
                          transition: 'box-shadow 600ms ease, transform 300ms ease',
                        }}
                        title={e.type}
                      >
                        <span className="text-base">{iconForType(e.type)}</span>
                      </div>

                      {/* card */}
                      <div className={clsx('rounded-lg border p-4', highlight && 'bg-muted/30')}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{e.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(e.occurredAt)}</span>
                              {e.type && <Badge>{e.type}</Badge>}
                              {e.importance && <Badge>{e.importance}</Badge>}
                              {e.subtype && <Badge>{e.subtype}</Badge>}
                            </div>

                            {e.summary ? (
                              <div className="mt-2 text-sm text-muted-foreground">{e.summary}</div>
                            ) : null}

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

                        {e?.meta?.semantic ? (
                          <div className="mt-3 text-xs text-muted-foreground">
                            Semantic: {e.meta.semantic.promoted ? 'promoted' : 'not promoted'}
                            {e.meta.semantic.confidence != null ? ` · conf=${e.meta.semantic.confidence}` : ''}
                            {e.meta.semantic.reason ? ` · ${e.meta.semantic.reason}` : ''}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </RevealIn>
                );
              })}

              {/* attach ref INSIDE returned JSX */}
              <div ref={endRef} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  // Replay state MUST be declared before any effects that use it
  const [replayOn, setReplayOn] = useState(false);
  const [replayRunning, setReplayRunning] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeedMs, setReplaySpeedMs] = useState(650); // calm default

  function resetReplay() {
    setReplayIndex(0);
    setReplayRunning(false);
  }

  const [mode, setMode] = useState<Mode>('LIST');

  // Load mode preference
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('ctc.timeline.mode');
      if (v === 'LIST' || v === 'VISUAL') setMode(v);
    } catch {}
  }, []);

  // Persist mode preference
  useEffect(() => {
    try {
      window.localStorage.setItem('ctc.timeline.mode', mode);
    } catch {}
  }, [mode]);

  // If leaving VISUAL, turn off replay cleanly
  useEffect(() => {
    if (mode !== 'VISUAL') {
      setReplayOn(false);
      resetReplay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const [type, setType] = useState<string>(''); // filter shared between modes
  const [limit, setLimit] = useState<number>(80);

  const queryKey = useMemo(() => ['homeEvents', propertyId, type || 'ALL', limit], [propertyId, type, limit]);

  const { data: events = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    enabled: !!propertyId,
    queryFn: async () => {
      const res: any = await listHomeEvents(propertyId, { type: type || undefined, limit });
      const payload = res?.data ?? res;
      const inner = payload?.data ?? payload;
      const ev = inner?.events ?? [];
      return Array.isArray(ev) ? ev : [];
    },
  });

  return (
    <div className="p-6 space-y-4">
      {/* Header + Mode toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Home Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Your home’s story — purchases, repairs, claims, improvements, and key documents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-1">
            <button
              className={clsx(
                'px-3 py-1.5 text-sm rounded-md',
                mode === 'LIST' ? 'bg-muted' : 'hover:bg-muted/50'
              )}
              onClick={() => setMode('LIST')}
            >
              List
            </button>
            <button
              className={clsx(
                'px-3 py-1.5 text-sm rounded-md',
                mode === 'VISUAL' ? 'bg-muted' : 'hover:bg-muted/50'
              )}
              onClick={() => setMode('VISUAL')}
            >
              Visual
            </button>
          </div>

          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Replay controls (visual only) */}
      {mode === 'VISUAL' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
            <label className="text-xs text-muted-foreground">Replay</label>
            <button
              className={clsx(
                'px-2 py-1 text-xs rounded-md',
                replayOn ? 'bg-muted' : 'hover:bg-muted/50'
              )}
              onClick={() => {
                const next = !replayOn;
                setReplayOn(next);
                if (!next) {
                  resetReplay();
                } else {
                  // start replay; show first item shortly
                  setReplayIndex(1);
                  setReplayRunning(true);
                }
              }}
            >
              {replayOn ? 'On' : 'Off'}
            </button>
          </div>

          {replayOn ? (
            <>
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setReplayRunning((v) => !v)}
              >
                {replayRunning ? 'Pause' : 'Resume'}
              </button>

              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  setReplayIndex(1);
                  setReplayRunning(true);
                }}
              >
                Restart
              </button>

              <select
                className="rounded-md border px-2 py-2 text-sm"
                value={replaySpeedMs}
                onChange={(e) => setReplaySpeedMs(Number(e.target.value))}
                title="Replay speed"
              >
                <option value={950}>Slow</option>
                <option value={650}>Calm</option>
                <option value={380}>Fast</option>
              </select>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Filters (shared) */}
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
      ) : mode === 'LIST' ? (
        <TimelineClient
          events={events}
          isLoading={isLoading}
          error={error}
          isFetching={isFetching}
          onRefresh={() => refetch()}
          hideHeader
          hideFilters
        />
      ) : (
        <TimelineVisual
          events={events}
          replayOn={replayOn}
          replayRunning={replayRunning}
          replayIndex={replayIndex}
          setReplayIndex={setReplayIndex}
          setReplayRunning={setReplayRunning}
          replaySpeedMs={replaySpeedMs}
        />
      )}
    </div>
  );
}
