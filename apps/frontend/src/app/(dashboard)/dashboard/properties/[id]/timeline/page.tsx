// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import TimelineClient from './TimelineClient';
import { listHomeEvents, TimelineProjectionEntry } from './homeEventsApi';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  MobileFilterStack,
  MobilePageIntro,
  MobileToolWorkspace,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { resolveDashboardBackHref } from '@/lib/navigation/backNavigation';

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

function toTimelineEvent(entry: TimelineProjectionEntry) {
  const signalKey = entry.signalKey ?? undefined;
  const derivedImportance =
    entry.kind === 'SIGNAL' && (signalKey === 'RISK_SPIKE' || signalKey === 'COST_ANOMALY' || signalKey === 'COVERAGE_GAP')
      ? 'HIGHLIGHT'
      : 'NORMAL';

  return {
    id: entry.id,
    type: entry.eventType ?? 'MILESTONE',
    subtype: entry.kind === 'SIGNAL' ? signalKey ?? null : entry.eventType,
    importance: derivedImportance,
    occurredAt: entry.occurredAt,
    title: entry.title,
    summary:
      entry.summary ??
      (entry.kind === 'SIGNAL' ? 'Derived from shared signal context.' : null),
    amount: null,
    valueDelta: null,
    documents: [],
    meta: {
      timelineProjectionKind: entry.kind,
      sourceModel: entry.sourceModel,
      signalKey: entry.signalKey,
    },
  };
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
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [enabled]);

  const offset = highlight ? 12 : 8;

  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0px)' : `translateY(${offset}px)`,
        transition: highlight
          ? 'opacity 520ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)'
          : 'opacity 420ms ease, transform 420ms ease',
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
function TimelineEventRow({
  e,
  replayOn,
}: {
  e: any;
  replayOn: boolean;
}) {
  const highlight = e.importance === 'HIGHLIGHT';

  // ✅ Hook is now inside a component (legal)
  const glow = useOneShotGlow(replayOn && highlight);

  return (
    <RevealIn enabled={replayOn} highlight={highlight}>
      <div className="relative">
        {/* node */}
        <div
          className={clsx(
            'absolute -left-12 top-5 flex h-8 w-8 items-center justify-center rounded-full border bg-background transition-all duration-300',
            highlight && 'ring-2 ring-primary/30'
          )}
          style={{
            boxShadow: glow ? '0 0 0 6px rgba(99,102,241,0.12)' : undefined,
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
              {g.events.map((e: any) => (
                <TimelineEventRow key={e.id} e={e} replayOn={replayOn} />
              ))}

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
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const backHref = useMemo(
    () => resolveDashboardBackHref(searchParams.get('backTo'), `/dashboard/properties/${propertyId}`),
    [propertyId, searchParams]
  );

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
      const timelineEntries = inner?.timelineEntries ?? [];
      if (Array.isArray(timelineEntries) && timelineEntries.length > 0) {
        return timelineEntries.map((entry: TimelineProjectionEntry) => toTimelineEvent(entry));
      }
      const ev = inner?.events ?? [];
      return Array.isArray(ev) ? ev : [];
    },
  });

  const replayProgress = replayOn ? `${Math.min(replayIndex, events.length)}/${events.length}` : null;
  const hasCustomLimit = limit !== 80;
  const hasFiltersApplied = Boolean(type) || hasCustomLimit || mode === 'VISUAL' || replayOn;
  const typeLabel = type ? formatEnumLabel(type) : 'All event types';

  return (
    <MobileToolWorkspace
      className="space-y-6 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <MobilePageIntro
          className="lg:hidden"
          title="Home Timeline"
          subtitle="Your home's story of repairs, claims, improvements, and key documents."
          action={(
            <Link
              href={backHref}
              className="no-brand-style inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          )}
        />
      }
      summary={
        <>
          <HomeToolHeader
            toolId="home-timeline"
            propertyId={propertyId}
            backHref={backHref}
            backLabel="Back to property"
            showBackLink
          />
          <ResultHeroCard
            eyebrow="Property History"
            title={mode === 'VISUAL' ? 'Visual Timeline' : 'Event Timeline'}
            value={`${events.length} events`}
            status={<StatusChip tone={isFetching ? 'info' : 'good'}>{isFetching ? 'Refreshing' : 'Synced'}</StatusChip>}
            summary={
              replayOn
                ? `Replay ${replayRunning ? 'running' : 'paused'}${replayProgress ? ` • ${replayProgress}` : ''}`
                : 'Replay is off'
            }
            highlights={[
              typeLabel,
              `Mode: ${mode === 'VISUAL' ? 'Visual replay' : 'List view'}`,
              hasCustomLimit ? `Showing up to ${limit} events` : 'Showing default event volume',
            ]}
          />
        </>
      }
      filters={
        <MobileFilterStack
          search={
            <div className="flex items-center gap-2">
              <div className="inline-flex min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-1">
                <button
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-sm',
                    mode === 'LIST'
                      ? 'bg-white font-medium text-[hsl(var(--mobile-text-primary))]'
                      : 'text-[hsl(var(--mobile-text-secondary))]'
                  )}
                  onClick={() => setMode('LIST')}
                >
                  List
                </button>
                <button
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-sm',
                    mode === 'VISUAL'
                      ? 'bg-white font-medium text-[hsl(var(--mobile-text-primary))]'
                      : 'text-[hsl(var(--mobile-text-secondary))]'
                  )}
                  onClick={() => setMode('VISUAL')}
                >
                  Visual
                </button>
              </div>
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          }
          primaryFilters={
            <>
              <select
                className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">All event types</option>
                <option value="PURCHASE">Purchase</option>
                <option value="REPAIR">Repair</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="IMPROVEMENT">Improvement</option>
                <option value="CLAIM">Claim</option>
                <option value="INSPECTION">Inspection</option>
                <option value="DOCUMENT">Document</option>
                <option value="VALUE_UPDATE">Value update</option>
                <option value="MILESTONE">Milestone</option>
                <option value="NOTE">Note</option>
                <option value="OTHER">Other</option>
              </select>
              <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2">
                <span className="text-sm text-[hsl(var(--mobile-text-secondary))]">Limit</span>
                <input
                  className="w-20 rounded-md border border-[hsl(var(--mobile-border-subtle))] px-2 py-1.5 text-sm"
                  type="number"
                  min={10}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </div>
            </>
          }
          secondaryLabel="Replay controls"
          secondaryFilters={
            mode === 'VISUAL' ? (
              <>
                <button
                  type="button"
                  className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-left text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                  onClick={() => {
                    const next = !replayOn;
                    setReplayOn(next);
                    if (!next) {
                      resetReplay();
                    } else {
                      setReplayIndex(1);
                      setReplayRunning(true);
                    }
                  }}
                >
                  Replay: {replayOn ? 'On' : 'Off'}
                </button>

                {replayOn ? (
                  <ActionPriorityRow
                    primaryAction={
                      <button
                        type="button"
                        className="min-h-[40px] rounded-lg bg-[hsl(var(--mobile-brand-strong))] px-3 text-sm font-semibold text-white"
                        onClick={() => setReplayRunning((v) => !v)}
                      >
                        {replayRunning ? 'Pause Replay' : 'Resume Replay'}
                      </button>
                    }
                    secondaryActions={
                      <>
                        <button
                          type="button"
                          className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                          onClick={() => {
                            setReplayIndex(1);
                            setReplayRunning(true);
                          }}
                        >
                          Restart
                        </button>
                        <select
                          className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                          value={replaySpeedMs}
                          onChange={(e) => setReplaySpeedMs(Number(e.target.value))}
                          title="Replay speed"
                        >
                          <option value={950}>Slow</option>
                          <option value={650}>Calm</option>
                          <option value={380}>Fast</option>
                        </select>
                      </>
                    }
                  />
                ) : null}
              </>
            ) : undefined
          }
          chips={
            <>
              <StatusChip tone={type ? 'protected' : 'info'}>{typeLabel}</StatusChip>
              <StatusChip tone={hasCustomLimit ? 'elevated' : 'info'}>Limit {limit}</StatusChip>
              <StatusChip tone={mode === 'VISUAL' ? 'protected' : 'good'}>
                {mode === 'VISUAL' ? 'Visual mode' : 'List mode'}
              </StatusChip>
              {replayOn ? <StatusChip tone={replayRunning ? 'protected' : 'elevated'}>Replay active</StatusChip> : null}
            </>
          }
          actions={
            hasFiltersApplied ? (
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                onClick={() => {
                  setType('');
                  setLimit(80);
                  setMode('LIST');
                  setReplayOn(false);
                  resetReplay();
                }}
              >
                Reset view
              </button>
            ) : undefined
          }
        />
      }
    >
      {isLoading ? (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
          Loading timeline…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load timeline.
          <div className="mt-2 text-xs text-rose-600">{(error as any)?.message ?? 'Unknown error'}</div>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
          No timeline events yet. Add expenses, documents, claims, or maintenance events to build your home story.
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
      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
