// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Plus, Search, X } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import TimelineClient from './TimelineClient';
import {
  addHomeEventEvidence,
  confirmHomeEvent,
  correctHomeEvent,
  createHomeEvent,
  exportHomeEvents,
  getHomeEvent,
  getHomeEventAnnualRecap,
  listHomeEvents,
  setHomeEventVisibility,
  type HomeEvent,
  type HomeEventDatePrecision,
  TimelineProjectionEntry,
  HomeEventType,
} from './homeEventsApi';
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
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import { api } from '@/lib/api/client';
import { listClaims } from '../claims/claimsApi';
import { listEligiblePropertyBriefDocuments } from '../property-brief/propertyBriefApi';

type Mode = 'LIST' | 'VISUAL';

type EvidenceChoice = { id: string; label: string; detail?: string; entityType?: string };

function dateControlType(precision: HomeEventDatePrecision) {
  if (precision === 'MONTH') return 'month';
  if (precision === 'YEAR') return 'number';
  return 'date';
}

function dateControlValue(iso: string, precision: HomeEventDatePrecision) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (precision === 'YEAR') return String(date.getUTCFullYear());
  if (precision === 'MONTH') return date.toISOString().slice(0, 7);
  return date.toISOString().slice(0, 10);
}

function dateControlToIso(value: string, precision: HomeEventDatePrecision) {
  if (precision === 'YEAR') return new Date(`${value}-01-01T12:00:00.000Z`).toISOString();
  if (precision === 'MONTH') return new Date(`${value}-01T12:00:00.000Z`).toISOString();
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatEventDate(event: any) {
  const date = new Date(event.occurredAt);
  if (Number.isNaN(date.getTime())) return event.occurredAt;

  switch (event.datePrecision) {
    case 'MONTH':
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    case 'YEAR':
      return String(date.getFullYear());
    case 'RANGE':
      return event.dateRangeStart && event.dateRangeEnd
        ? `${formatDate(event.dateRangeStart)} – ${formatDate(event.dateRangeEnd)}`
        : `Around ${formatDate(event.occurredAt)}`;
    case 'UNKNOWN':
      return 'Date unknown';
    default:
      return formatDate(event.occurredAt);
  }
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

function toTimelineEvent(entry: TimelineProjectionEntry): HomeEvent {
  const signalKey = entry.signalKey ?? undefined;
  const derivedImportance =
    entry.kind === 'SIGNAL' && (signalKey === 'RISK_SPIKE' || signalKey === 'COST_ANOMALY' || signalKey === 'COVERAGE_GAP')
      ? 'HIGHLIGHT'
      : 'NORMAL';

  return {
    id: entry.id,
    propertyId: '',
    type: (entry.eventType as HomeEventType) ?? 'MILESTONE',
    subtype: entry.kind === 'SIGNAL' ? signalKey ?? null : entry.eventType,
    importance: derivedImportance,
    visibility: 'HOUSEHOLD', // a synthetic projection entry, never marked private
    occurredAt: entry.occurredAt,
    title: entry.title,
    summary:
      entry.summary ??
      (entry.kind === 'SIGNAL' ? 'Derived from shared signal context.' : null),
    amount: (entry.payloadJson?.amount as string | null) ?? null,
    valueDelta: (entry.payloadJson?.valueDelta as string | null) ?? null,
    documents: [],
    endAt: null,
    dateRangeStart: null,
    dateRangeEnd: null,
    currency: null,
    groupKey: null,
    createdAt: entry.occurredAt,
    updatedAt: entry.occurredAt,
    parentEventId: (entry.payloadJson?.parentEventId as string | null) ?? null,
    groupType: (entry.payloadJson?.groupType as string | null) ?? null,
    revision: (entry.payloadJson?.revision as number | undefined) ?? 1,
    correctionReason: (entry.payloadJson?.correctionReason as string | null) ?? null,
    meta: {
      timelineProjectionKind: entry.kind,
      sourceModel: entry.sourceModel,
      signalKey: entry.signalKey,
      ...((entry.payloadJson?.meta as Record<string, unknown> | null) ?? {}),
      synthetic: entry.payloadJson?.synthetic === true,
    },
    datePrecision: (entry.payloadJson?.datePrecision as HomeEventDatePrecision) ?? 'EXACT_DATE',
    observationKind: (entry.payloadJson?.observationKind as HomeEvent['observationKind']) ?? (
      entry.kind === 'SIGNAL' ? 'INFERRED' : 'SYSTEM_GENERATED'
    ),
    verificationStatus: (entry.payloadJson?.verificationStatus as HomeEvent['verificationStatus']) ?? (
      entry.kind === 'SIGNAL' ? 'PENDING_CONFIRMATION' : 'UNVERIFIED'
    ),
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
                <span>{formatEventDate(e)}</span>
                {e.type && <Badge>{formatEnumLabel(e.type)}</Badge>}
                {e.importance === 'HIGHLIGHT' && <Badge>Highlight</Badge>}
                {e.subtype && e.subtype !== e.type && (
                  <Badge>{formatEnumLabel(e.subtype)}</Badge>
                )}
                {e.observationKind && <Badge>{formatEnumLabel(e.observationKind)}</Badge>}
                {e.verificationStatus && <Badge>{formatEnumLabel(e.verificationStatus)}</Badge>}
                {e.datePrecision && e.datePrecision !== 'EXACT_DATE' && (
                  <Badge>{formatEnumLabel(e.datePrecision)}</Badge>
                )}
              </div>

              {e.summary ? (
                <div className="mt-2 text-sm text-muted-foreground">{e.summary}</div>
              ) : null}

              {Array.isArray(e.documents) && e.documents.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.documents.slice(0, 6).map((d: any) => (
                    <Badge key={d.id}>
                      {formatEnumLabel(d.kind) || 'Doc'}: {d.document?.name || 'Attachment'}
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
        </div>
      </div>
    </RevealIn>
  );
}

function ReplaySummaryCard({ events }: { events: any[] }) {
  const yearRange = useMemo(() => {
    if (events.length === 0) return null;
    const years = events.map((e) => new Date(e.occurredAt).getFullYear());
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [events]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      if (e.type) counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [events]);

  const financialTotal = useMemo(() => {
    let total = 0;
    for (const e of events) {
      const n = parseFloat(e.amount ?? '');
      if (!isNaN(n)) total += n;
    }
    return total > 0 ? total : null;
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
      <div className="font-semibold text-primary mb-2">Your home&apos;s story — complete</div>
      <div className="space-y-1 text-muted-foreground">
        <div>
          {events.length} event{events.length !== 1 ? 's' : ''} across{' '}
          {yearRange ? (yearRange.min === yearRange.max ? String(yearRange.min) : `${yearRange.min}–${yearRange.max}`) : ''}
        </div>
        {typeCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {typeCounts.map(([type, count]) => (
              <span key={type} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                {iconForType(type)} {formatEnumLabel(type)} × {count}
              </span>
            ))}
          </div>
        )}
        {financialTotal != null && (
          <div className="mt-1">
            Total logged spend: ${financialTotal.toLocaleString()}
          </div>
        )}
      </div>
    </div>
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
    const n = Math.max(0, Math.min(replayIndex, chronological.length));
    return chronological.slice(0, n);
  }, [replayOn, replayIndex, chronological]);

  // Timer: advance replay
  useEffect(() => {
    if (!replayOn) return;
    if (!replayRunning) return;

    if (replayIndex >= chronological.length) {
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
  const replayDone = replayOn && !replayRunning && replayIndex >= chronological.length && chronological.length > 0;

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

              <div ref={endRef} />
            </div>
          </div>
        </div>
      ))}

      {replayDone && (
        <div className="pt-2">
          <ReplaySummaryCard events={chronological} />
        </div>
      )}
    </div>
  );
}

const LOG_EVENT_TYPES: { value: HomeEventType; label: string }[] = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'IMPROVEMENT', label: 'Improvement' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'CLAIM', label: 'Claim' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'VALUE_UPDATE', label: 'Value Update' },
  { value: 'MILESTONE', label: 'Milestone' },
  { value: 'NOTE', label: 'Note' },
  { value: 'OTHER', label: 'Other' },
];

export default function Page() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const queryClient = useQueryClient();
  const backHref = useMemo(
    () => resolveDashboardBackHref(searchParams.get('backTo'), `/dashboard/properties/${propertyId}`),
    [propertyId, searchParams]
  );

  // Replay state
  const [replayOn, setReplayOn] = useState(false);
  const [replayRunning, setReplayRunning] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeedMs, setReplaySpeedMs] = useState(650);

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

  // Filter state
  const [type, setType] = useState<string>('');
  const [limit, setLimit] = useState<number>(80);
  const [search, setSearch] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Log event form state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<HomeEventType>('MAINTENANCE');
  const [logTitle, setLogTitle] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logAmount, setLogAmount] = useState('');
  const [logSummary, setLogSummary] = useState('');
  const [logDatePrecision, setLogDatePrecision] = useState<HomeEventDatePrecision>('EXACT_DATE');
  const [logParentEventId, setLogParentEventId] = useState('');
  const [logPrivate, setLogPrivate] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<HomeEvent | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctedTitle, setCorrectedTitle] = useState('');
  const [correctedDate, setCorrectedDate] = useState('');
  const [correctedPrecision, setCorrectedPrecision] = useState<HomeEventDatePrecision>('EXACT_DATE');
  const [evidenceType, setEvidenceType] = useState<'DOCUMENT' | 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'INSPECTION' | 'CLAIM' | 'REPAIR_RECORD' | 'USER_ATTESTATION' | 'DOMAIN_RECORD'>('USER_ATTESTATION');
  const [evidenceEntityId, setEvidenceEntityId] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [timelineActionError, setTimelineActionError] = useState<string | null>(null);
  const [annualRecap, setAnnualRecap] = useState<any>(null);
  const openedDeepLinkRef = useRef<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const queryKey = useMemo(
    () => ['homeEvents', propertyId, type || 'ALL', limit, fromDate, toDate],
    [propertyId, type, limit, fromDate, toDate]
  );

  const { data: timelineData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    enabled: !!propertyId,
    queryFn: async () => {
      const res: any = await listHomeEvents(propertyId, {
        type: type || undefined,
        limit,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      const payload = res?.data ?? res;
      const inner = payload?.data ?? payload;
      const timelineEntries = inner?.timelineEntries ?? [];
      if (Array.isArray(timelineEntries) && timelineEntries.length > 0) {
        return {
          events: timelineEntries.map((entry: TimelineProjectionEntry) => toTimelineEvent(entry)),
          context: inner?.context as PropertyContextEnvelope | undefined,
        };
      }
      const ev = inner?.events ?? [];
      return {
        events: Array.isArray(ev) ? ev : [],
        context: inner?.context as PropertyContextEnvelope | undefined,
      };
    },
  });

  const events = timelineData?.events ?? [];
  const timelineContext = timelineData?.context;

  // Client-side keyword search
  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e: any) =>
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.summary ?? '').toLowerCase().includes(q)
    );
  }, [events, search]);

  const activeEventQuery = useQuery({
    queryKey: ['homeEvent', propertyId, activeEvent?.id],
    queryFn: () => getHomeEvent(propertyId, activeEvent!.id),
    enabled: Boolean(activeEvent?.id),
  });
  const evidenceDocumentsQuery = useQuery({
    queryKey: ['timeline-evidence-documents', propertyId],
    queryFn: () => listEligiblePropertyBriefDocuments(propertyId),
    enabled: Boolean(activeEvent),
  });
  const evidenceClaimsQuery = useQuery({
    queryKey: ['timeline-evidence-claims', propertyId],
    queryFn: () => listClaims(propertyId),
    enabled: Boolean(activeEvent),
  });
  const evidenceInspectionsQuery = useQuery({
    queryKey: ['timeline-evidence-inspections', propertyId],
    queryFn: () => api.listInspectionReports(propertyId),
    enabled: Boolean(activeEvent),
  });
  const evidenceProjectsQuery = useQuery({
    queryKey: ['timeline-evidence-projects', propertyId],
    queryFn: () => api.listProjects(propertyId),
    enabled: Boolean(activeEvent),
  });
  const evidenceMaintenanceQuery = useQuery({
    queryKey: ['timeline-evidence-maintenance', propertyId],
    queryFn: async () => {
      const response = await api.getMaintenanceTasks(propertyId, { includeCompleted: true });
      return response.success ? response.data : [];
    },
    enabled: Boolean(activeEvent),
  });
  const evidenceChoices = useMemo<EvidenceChoice[]>(() => {
    if (evidenceType === 'DOCUMENT' || evidenceType === 'PHOTO' || evidenceType === 'RECEIPT' || evidenceType === 'INVOICE') {
      return (evidenceDocumentsQuery.data ?? []).map((item) => ({ id: item.id, label: item.name, detail: formatEnumLabel(item.type) }));
    }
    if (evidenceType === 'CLAIM') {
      return (evidenceClaimsQuery.data ?? []).map((item) => ({ id: item.id, label: item.title, detail: formatEnumLabel(item.status), entityType: 'Claim' }));
    }
    if (evidenceType === 'INSPECTION') {
      return (evidenceInspectionsQuery.data ?? []).map((item) => ({ id: item.id, label: `${formatEnumLabel(item.reportType)} inspection`, detail: formatDate(item.inspectionDate), entityType: 'InspectionReport' }));
    }
    if (evidenceType === 'REPAIR_RECORD') {
      return [
        ...(evidenceProjectsQuery.data ?? []).map((item) => ({ id: item.id, label: item.name, detail: `Project · ${formatEnumLabel(item.status)}`, entityType: 'ProjectRecord' })),
        ...(evidenceMaintenanceQuery.data ?? []).map((item) => ({ id: item.id, label: item.title, detail: `Maintenance · ${formatEnumLabel(item.status)}`, entityType: 'PropertyMaintenanceTask' })),
      ];
    }
    return [];
  }, [
    evidenceType,
    evidenceDocumentsQuery.data,
    evidenceClaimsQuery.data,
    evidenceInspectionsQuery.data,
    evidenceProjectsQuery.data,
    evidenceMaintenanceQuery.data,
  ]);

  function openEvent(event: HomeEvent) {
    setActiveEvent(event);
    setCorrectedTitle(event.title);
    setCorrectedDate(dateControlValue(event.occurredAt, event.datePrecision));
    setCorrectedPrecision(event.datePrecision);
    setCorrectionReason('');
    setTimelineActionError(null);
  }

  useEffect(() => {
    const eventId = searchParams.get('eventId');
    if (!eventId || openedDeepLinkRef.current === eventId) return;
    const event = events.find((item) => item.id === eventId && item.meta?.synthetic !== true);
    if (!event) return;
    openedDeepLinkRef.current = eventId;
    openEvent(event);
  }, [events, searchParams]);

  async function refreshTimeline() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['homeEvents', propertyId] }),
      activeEvent?.id
        ? queryClient.invalidateQueries({ queryKey: ['homeEvent', propertyId, activeEvent.id] })
        : Promise.resolve(),
    ]);
  }

  function downloadJson(filename: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleLogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!logTitle.trim() || !logDate) return;
    setLogSubmitting(true);
    setLogError(null);
    try {
      await createHomeEvent(propertyId, {
        type: logType,
        title: logTitle.trim(),
        occurredAt: dateControlToIso(logDate, logDatePrecision),
        summary: logSummary.trim() || null,
        amount: logAmount ? parseFloat(logAmount) : null,
        datePrecision: logDatePrecision,
        parentEventId: logParentEventId || null,
        groupType: logParentEventId ? 'HOME_HISTORY_STORY' : null,
        visibility: logPrivate ? 'PRIVATE' : undefined,
      });
      setLogTitle('');
      setLogDate('');
      setLogAmount('');
      setLogDatePrecision('EXACT_DATE');
      setLogParentEventId('');
      setLogSummary('');
      setLogPrivate(false);
      setShowLogForm(false);
      queryClient.invalidateQueries({ queryKey: ['homeEvents', propertyId] });
      refetch();
    } catch {
      setLogError('Failed to save event. Please try again.');
    } finally {
      setLogSubmitting(false);
    }
  }

  const replayProgress = replayOn ? `${Math.min(replayIndex, events.length)}/${events.length}` : null;
  const hasCustomLimit = limit !== 80;
  const hasActiveSearch = Boolean(search.trim());
  const hasDateFilter = Boolean(fromDate) || Boolean(toDate);
  const hasFiltersApplied = Boolean(type) || hasActiveSearch || hasDateFilter || hasCustomLimit || mode === 'VISUAL' || replayOn;
  const typeLabel = type ? formatEnumLabel(type) : 'All event types';

  const isSearchEmpty = filteredEvents.length === 0 && events.length > 0;

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
          <PropertyContextStatusNotice context={timelineContext} title="Timeline context" />
          <ResultHeroCard
            eyebrow="Property History"
            title={mode === 'VISUAL' ? 'Visual Timeline' : 'Event Timeline'}
            value={`${filteredEvents.length}${hasActiveSearch ? ` of ${events.length}` : ''} event${filteredEvents.length !== 1 ? 's' : ''}`}
            status={<StatusChip tone={isFetching ? 'info' : 'good'}>{isFetching ? 'Refreshing' : 'Synced'}</StatusChip>}
            summary={
              replayOn
                ? `Story playback ${replayRunning ? 'running' : 'paused'}${replayProgress ? ` • ${replayProgress}` : ''}`
                : 'Story playback is off'
            }
            highlights={[
              typeLabel,
              `Mode: ${mode === 'VISUAL' ? 'Visual history' : 'List view'}`,
              hasCustomLimit ? `Showing up to ${limit} events` : 'Showing default event volume',
            ]}
          />
        </>
      }
      filters={
        <MobileFilterStack
          search={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Mode toggle */}
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

              {/* Refresh */}
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? 'Refreshing…' : 'Refresh'}
              </button>

              {/* Log event button */}
              <button
                type="button"
                className={clsx(
                  'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium',
                  showLogForm
                    ? 'border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]'
                    : 'bg-[hsl(var(--mobile-brand-strong))] text-white'
                )}
                onClick={() => setShowLogForm((v) => !v)}
              >
                {showLogForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showLogForm ? 'Cancel' : 'Log Event'}
              </button>
            </div>
          }
          primaryFilters={
            <>
              {/* Keyword search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--mobile-text-muted))]" />
                <input
                  type="search"
                  placeholder="Search events…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white pl-8 pr-3 text-sm"
                />
              </div>

              {/* Event type filter */}
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

              {/* Date range */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">From</label>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || today}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">To</label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    max={today}
                    onChange={(e) => setToDate(e.target.value)}
                    className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                  />
                </div>
              </div>

              {/* Limit — preset select */}
              <select
                className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={25}>Last 25 events</option>
                <option value={50}>Last 50 events</option>
                <option value={80}>Last 80 events</option>
                <option value={150}>Last 150 events</option>
                <option value={200}>All events (up to 200)</option>
              </select>
            </>
          }
          secondaryLabel="Story playback controls"
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
                  Story playback: {replayOn ? 'On' : 'Off'}
                </button>

                {replayOn ? (
                  <ActionPriorityRow
                    primaryAction={
                      <button
                        type="button"
                        className="min-h-[40px] rounded-lg bg-[hsl(var(--mobile-brand-strong))] px-3 text-sm font-semibold text-white"
                        onClick={() => setReplayRunning((v) => !v)}
                      >
                        {replayRunning ? 'Pause Story' : 'Resume Story'}
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
                          title="Story playback speed"
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
              {hasActiveSearch && (
                <StatusChip tone="elevated">Search: &ldquo;{search}&rdquo;</StatusChip>
              )}
              {fromDate && <StatusChip tone="elevated">From {formatDate(fromDate)}</StatusChip>}
              {toDate && <StatusChip tone="elevated">To {formatDate(toDate)}</StatusChip>}
              <StatusChip tone={hasCustomLimit ? 'elevated' : 'info'}>
                {hasCustomLimit ? `Limit ${limit}` : 'Default limit'}
              </StatusChip>
              <StatusChip tone={mode === 'VISUAL' ? 'protected' : 'good'}>
                {mode === 'VISUAL' ? 'Visual mode' : 'List mode'}
              </StatusChip>
              {replayOn ? <StatusChip tone={replayRunning ? 'protected' : 'elevated'}>Story active</StatusChip> : null}
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
                  setSearch('');
                  setFromDate('');
                  setToDate('');
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
      {/* Log event form */}
      {showLogForm && (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
            Log a home event
          </div>
          <form onSubmit={handleLogSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={logType}
                  onChange={(e) => setLogType(e.target.value as HomeEventType)}
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                  disabled={logSubmitting}
                >
                  {LOG_EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type={dateControlType(logDatePrecision)}
                  value={logDate}
                  max={logDatePrecision === 'YEAR' ? new Date().getFullYear() : logDatePrecision === 'MONTH' ? today.slice(0, 7) : today}
                  min={logDatePrecision === 'YEAR' ? 1600 : undefined}
                  onChange={(e) => setLogDate(e.target.value)}
                  required
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                  disabled={logSubmitting}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">Date precision</label>
                <select
                  value={logDatePrecision}
                  onChange={(event) => {
                    const next = event.target.value as HomeEventDatePrecision;
                    const anchor = logDate
                      ? dateControlToIso(logDate, logDatePrecision)
                      : new Date().toISOString();
                    setLogDatePrecision(next);
                    setLogDate(dateControlValue(anchor, next));
                  }}
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                >
                  <option value="EXACT_DATE">Exact date</option>
                  <option value="MONTH">Month known</option>
                  <option value="YEAR">Year known</option>
                  <option value="UNKNOWN">Date uncertain</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">Part of a larger story (optional)</label>
                <select
                  value={logParentEventId}
                  onChange={(event) => setLogParentEventId(event.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                >
                  <option value="">Standalone event</option>
                  {events.filter((event) => !event.parentEventId && event.meta?.synthetic !== true).map((event) => (
                    <option key={event.id} value={event.id}>{event.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Replaced water heater anode rod"
                value={logTitle}
                onChange={(e) => setLogTitle(e.target.value)}
                required
                className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                disabled={logSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">
                  Cost (optional)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[hsl(var(--mobile-text-muted))]">$</span>
                  <input
                    type="number"
                    placeholder="0"
                    min={0}
                    step="0.01"
                    value={logAmount}
                    onChange={(e) => setLogAmount(e.target.value)}
                    className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white pl-6 pr-3 text-sm"
                    disabled={logSubmitting}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[hsl(var(--mobile-text-muted))]">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="Brief details…"
                  value={logSummary}
                  onChange={(e) => setLogSummary(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm"
                  disabled={logSubmitting}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
              <input
                type="checkbox"
                checked={logPrivate}
                onChange={(e) => setLogPrivate(e.target.checked)}
                disabled={logSubmitting}
                className="h-4 w-4 rounded border-[hsl(var(--mobile-border-subtle))]"
              />
              Keep this private — never included in anything shared outside your household
            </label>

            {logError && (
              <p className="text-xs text-red-600">{logError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={logSubmitting || !logTitle.trim() || !logDate}
                className="min-h-[40px] rounded-lg bg-[hsl(var(--mobile-brand-strong))] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {logSubmitting ? 'Saving…' : 'Save event'}
              </button>
              <button
                type="button"
                onClick={() => { setShowLogForm(false); setLogError(null); }}
                className="min-h-[40px] rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
                disabled={logSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {filteredEvents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4">
          <button
            type="button"
            disabled={selectedEventIds.length === 0}
            onClick={async () => {
              try {
                setTimelineActionError(null);
                const payload = await exportHomeEvents(propertyId, selectedEventIds);
                downloadJson(`home-timeline-${today}.json`, payload);
              } catch { setTimelineActionError('The selected timeline events could not be exported.'); }
            }}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Export selected ({selectedEventIds.length})
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                setTimelineActionError(null);
                const payload = await getHomeEventAnnualRecap(propertyId, new Date().getFullYear());
                setAnnualRecap(payload);
              } catch { setTimelineActionError('The annual recap could not be prepared.'); }
            }}
            className="rounded-lg border px-3 py-2 text-sm font-medium"
          >
            Prepare {new Date().getFullYear()} recap
          </button>
          {annualRecap && (
            <button type="button" onClick={() => downloadJson(`home-recap-${new Date().getFullYear()}.json`, annualRecap)} className="rounded-lg border px-3 py-2 text-sm font-medium">
              Download recap
            </button>
          )}
          {timelineActionError && <p className="w-full text-xs text-rose-700">{timelineActionError}</p>}
        </div>
      )}

      {activeEvent && (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Event history and evidence</p>
              <h2 className="mt-1 font-semibold text-slate-950">{activeEventQuery.data?.title ?? activeEvent.title}</h2>
              <p className="mt-1 text-xs text-slate-600">Revision {activeEventQuery.data?.revision ?? activeEvent.revision ?? 1} · {formatEnumLabel(activeEventQuery.data?.verificationStatus ?? activeEvent.verificationStatus)}</p>
            </div>
            <button type="button" onClick={() => setActiveEvent(null)} className="rounded-lg border bg-white p-2" aria-label="Close event review"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form className="space-y-2 rounded-xl bg-white p-3" onSubmit={async (event) => {
              event.preventDefault();
              try {
                setTimelineActionError(null);
                const corrected = await correctHomeEvent(propertyId, activeEvent.id, {
                  title: correctedTitle.trim(), occurredAt: dateControlToIso(correctedDate, correctedPrecision),
                  datePrecision: correctedPrecision, correctionReason: correctionReason.trim(),
                });
                openEvent(corrected);
                await refreshTimeline();
              } catch { setTimelineActionError('The correction could not be saved.'); }
            }}>
              <p className="text-sm font-semibold">Create a traceable correction</p>
              <input value={correctedTitle} onChange={(event) => setCorrectedTitle(event.target.value)} className="min-h-[40px] w-full rounded-lg border px-3 text-sm" aria-label="Corrected title" />
              <div className="grid grid-cols-2 gap-2">
                <input type={dateControlType(correctedPrecision)} min={correctedPrecision === 'YEAR' ? 1600 : undefined} max={correctedPrecision === 'YEAR' ? new Date().getFullYear() : correctedPrecision === 'MONTH' ? today.slice(0, 7) : today} value={correctedDate} onChange={(event) => setCorrectedDate(event.target.value)} className="min-h-[40px] rounded-lg border px-3 text-sm" aria-label="Corrected date" />
                <select value={correctedPrecision} onChange={(event) => {
                  const next = event.target.value as HomeEventDatePrecision;
                  const anchor = correctedDate ? dateControlToIso(correctedDate, correctedPrecision) : activeEvent.occurredAt;
                  setCorrectedPrecision(next);
                  setCorrectedDate(dateControlValue(anchor, next));
                }} className="min-h-[40px] rounded-lg border px-3 text-sm" aria-label="Corrected date precision">
                  <option value="EXACT_DATE">Exact date</option><option value="MONTH">Month</option><option value="YEAR">Year</option><option value="UNKNOWN">Unknown</option>
                </select>
              </div>
              <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Why is this correction needed?" className="min-h-[76px] w-full rounded-lg border p-3 text-sm" required minLength={3} />
              <button type="submit" className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white">Save correction</button>
            </form>
            <div className="space-y-3 rounded-xl bg-white p-3">
              <p className="text-sm font-semibold">Confirm or add evidence</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={async () => { await confirmHomeEvent(propertyId, activeEvent.id, 'HOMEOWNER_CONFIRMED', 'Confirmed by homeowner in Timeline review.'); await refreshTimeline(); }} className="rounded-lg border px-3 py-2 text-xs font-semibold">Confirm event</button>
                <button type="button" onClick={async () => { await confirmHomeEvent(propertyId, activeEvent.id, 'DISPUTED', 'Disputed by homeowner in Timeline review.'); await refreshTimeline(); }} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Mark disputed</button>
                {(() => {
                  const event = activeEvent;
                  const currentVisibility = activeEventQuery.data?.visibility ?? event.visibility;
                  async function applyVisibility(next: 'PRIVATE' | 'HOUSEHOLD' | 'RESALE_PACK') {
                    try {
                      setTimelineActionError(null);
                      await setHomeEventVisibility(propertyId, event.id, next);
                      await refreshTimeline();
                      queryClient.invalidateQueries({ queryKey: ['homeEvent', propertyId, event.id] });
                    } catch { setTimelineActionError('The visibility change could not be saved.'); }
                  }
                  const options: { value: 'PRIVATE' | 'HOUSEHOLD' | 'RESALE_PACK'; label: string }[] = [
                    { value: 'PRIVATE', label: 'Private' },
                    { value: 'HOUSEHOLD', label: 'Household' },
                    { value: 'RESALE_PACK', label: 'Include in buyer/resale packages' },
                  ];
                  return (
                    <>
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={currentVisibility === option.value}
                          onClick={() => applyVisibility(option.value)}
                          className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                            currentVisibility === option.value ? 'border-sky-600 bg-sky-50 text-sky-700' : ''
                          }`}
                        >
                          {option.value === 'PRIVATE' && <Lock className="h-3 w-3" />}
                          {option.label}
                        </button>
                      ))}
                    </>
                  );
                })()}
              </div>
              <p className="text-[11px] text-[hsl(var(--mobile-text-muted))]">
                Private events are never included in a Property Brief or any other share sent outside your household.
                Only events marked "Include in buyer/resale packages" appear in a Property Brief for a prospective
                buyer or listing agent — Household-visible events don't automatically carry over to that audience.
              </p>
              <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as typeof evidenceType)} className="min-h-[40px] w-full rounded-lg border px-3 text-sm">
                <option value="USER_ATTESTATION">Homeowner attestation</option><option value="DOCUMENT">Vault document</option><option value="RECEIPT">Receipt</option><option value="INVOICE">Invoice</option><option value="INSPECTION">Inspection</option><option value="CLAIM">Claim</option><option value="REPAIR_RECORD">Repair record</option>
              </select>
              {evidenceType !== 'USER_ATTESTATION' && (
                <select value={evidenceEntityId} onChange={(event) => setEvidenceEntityId(event.target.value)} className="min-h-[40px] w-full rounded-lg border px-3 text-sm">
                  <option value="">Select a linked record</option>
                  {evidenceChoices.map((choice) => <option key={`${evidenceType}:${choice.id}`} value={choice.id}>{choice.label}{choice.detail ? ` · ${choice.detail}` : ''}</option>)}
                </select>
              )}
              <textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Evidence note" className="min-h-[70px] w-full rounded-lg border p-3 text-sm" />
              <button type="button" onClick={async () => {
                try {
                  setTimelineActionError(null);
                  await addHomeEventEvidence(propertyId, activeEvent.id, {
                    evidenceType,
                    ...(['DOCUMENT', 'PHOTO', 'RECEIPT', 'INVOICE'].includes(evidenceType)
                      ? { documentId: evidenceEntityId }
                      : evidenceType !== 'USER_ATTESTATION'
                        ? { sourceEntityType: evidenceChoices.find((choice) => choice.id === evidenceEntityId)?.entityType ?? evidenceType, sourceEntityId: evidenceEntityId }
                        : {}),
                    note: evidenceNote || null,
                  });
                  setEvidenceEntityId(''); setEvidenceNote(''); await refreshTimeline();
                } catch { setTimelineActionError('The evidence link could not be saved.'); }
              }} disabled={evidenceType !== 'USER_ATTESTATION' && !evidenceEntityId} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Add evidence</button>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
          Loading timeline…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load timeline.
          <div className="mt-2 text-xs text-rose-600">{(error as any)?.message ?? 'Unknown error'}</div>
        </div>
      ) : isSearchEmpty ? (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
          No events match &ldquo;{search}&rdquo;.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setSearch('')}
          >
            Clear search
          </button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
          No timeline events yet.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setShowLogForm(true)}
          >
            Log your first event
          </button>{' '}
          to start building your home story.
        </div>
      ) : mode === 'LIST' ? (
        <TimelineClient
          events={filteredEvents}
          isLoading={isLoading}
          error={error}
          isFetching={isFetching}
          onRefresh={() => refetch()}
          hideHeader
          hideFilters
          onSelectEvent={openEvent}
          selectedEventIds={selectedEventIds}
          onToggleSelected={(eventId) => setSelectedEventIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId])}
        />
      ) : (
        <TimelineVisual
          events={filteredEvents}
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
