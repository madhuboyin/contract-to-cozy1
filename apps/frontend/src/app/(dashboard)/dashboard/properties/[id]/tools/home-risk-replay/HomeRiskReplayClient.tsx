'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarRange,
  Clock3,
  History,
  Home,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type { Property } from '@/types';
import { cn } from '@/lib/utils';
import {
  CompactEntityRow,
  EmptyStateCard,
  IconBadge,
  MobileActionRow,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  MobileFilterSurface,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ReplayDetailSheet } from '@/components/features/homeRiskReplay/ReplayDetailSheet';
import { ReplayTimelineItem } from '@/components/features/homeRiskReplay/ReplayTimelineItem';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import {
  formatDriverCode,
  formatReplayDate,
  formatReplayDateRange,
  formatWindowType,
} from '@/components/features/homeRiskReplay/ReplayUtils';
import type {
  HomeRiskReplayDetail,
  HomeRiskReplayRunSummary,
  HomeRiskReplayTimelineEvent,
  HomeRiskReplayWindowType,
} from '@/components/features/homeRiskReplay/types';
import {
  generateHomeRiskReplay,
  getHomeRiskReplayDetail,
  type HomeRiskReplayLaunchSurface,
  listHomeRiskReplayRuns,
  trackHomeRiskReplayEvent,
} from './homeRiskReplayApi';
import TrustStrip from '../../components/route-templates/TrustStrip';
import {
  buildEventLocationNote,
  buildHomeRiskReplayGuardrail,
  buildHomeRiskReplayValidationErrors,
  getHomeRiskReplayUserMessage,
} from './homeRiskReplayUi';

type WindowOption = {
  key: HomeRiskReplayWindowType;
  label: string;
  description: string;
};

const WINDOW_OPTIONS: WindowOption[] = [
  {
    key: 'since_built',
    label: 'Since built',
    description: 'Replay the property story from the home’s build year when available.',
  },
  {
    key: 'last_5_years',
    label: 'Last 5 years',
    description: 'A shorter lookback for recent exposure patterns.',
  },
  {
    key: 'custom_range',
    label: 'Custom range',
    description: 'Choose exact dates for a focused historical replay.',
  },
];

function isWindowType(value: string | null): value is HomeRiskReplayWindowType {
  return value === 'since_built' || value === 'last_5_years' || value === 'custom_range';
}

function normalizeLaunchSurface(value: string | null): HomeRiskReplayLaunchSurface {
  switch (value) {
    case 'home_tools':
    case 'property_hub':
    case 'property_summary':
    case 'roof_page':
    case 'plumbing_page':
    case 'electrical_page':
    case 'insights_strip':
    case 'system_detail':
      return value;
    default:
      return 'unknown';
  }
}

function bucketTotalEvents(value: number): '0' | '1' | '2_5' | '6_10' | '10_plus' {
  if (value <= 0) return '0';
  if (value === 1) return '1';
  if (value <= 5) return '2_5';
  if (value <= 10) return '6_10';
  return '10_plus';
}

function bucketImpactEvents(value: number): '0' | '1' | '2_5' | '6_plus' {
  if (value <= 0) return '0';
  if (value === 1) return '1';
  if (value <= 5) return '2_5';
  return '6_plus';
}

function classifyReplayError(error: unknown): 'network' | 'validation' | 'unauthorized' | 'unknown' {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number | string }).status)
    : NaN;
  const payloadCode = typeof error === 'object' && error !== null
    ? String(((error as { payload?: { error?: { code?: string } } }).payload?.error?.code ?? '')).toUpperCase()
    : '';

  if (status === 401 || payloadCode === 'AUTH_REQUIRED' || payloadCode === 'INVALID_TOKEN') return 'unauthorized';
  if (status === 400 || payloadCode === 'VALIDATION_ERROR') return 'validation';
  if (status === 0 || status === 502 || status === 503 || payloadCode === 'NETWORK_ERROR') return 'network';
  return 'unknown';
}

function deviceContext(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

function compactPropertyLabel(property: Property | null | undefined): string {
  if (!property) return 'Property unavailable';
  return property.name?.trim() || property.address;
}

function compactPropertyLocation(property: Property | null | undefined): string {
  if (!property) return '';
  return [property.city, property.state, property.zipCode].filter(Boolean).join(', ').replace(', ,', ', ');
}

function buildPropertyContextNote(property: Property | null | undefined): string {
  if (!property) return 'Replay uses the selected property and any available system context.';

  const notes: string[] = [];
  if (property.yearBuilt) notes.push(`Built ${property.yearBuilt}`);
  if (property.roofReplacementYear) notes.push(`Roof updated ${property.roofReplacementYear}`);
  if (property.hvacInstallYear) notes.push(`HVAC context from ${property.hvacInstallYear}`);
  if (property.hasDrainageIssues) notes.push('Drainage issues on record');
  if (property.hasSumpPumpBackup === false) notes.push('No sump backup recorded');

  if (notes.length === 0) {
    return 'Replay uses location history and any available home system details.';
  }

  return notes.slice(0, 3).join(' • ');
}

function runStatusTone(status: HomeRiskReplayRunSummary['status']): 'good' | 'elevated' | 'danger' | 'info' {
  if (status === 'completed') return 'good';
  if (status === 'failed') return 'danger';
  if (status === 'pending') return 'elevated';
  return 'info';
}

function historyButtonLabel(run: HomeRiskReplayRunSummary, activeRunId: string | null): string {
  if (run.id === activeRunId) return 'Loaded';
  if (run.status === 'failed') return 'Review';
  return 'Open';
}

function ReplayIntroCard({
  property,
}: {
  property: Property | null | undefined;
}) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))]',
        'bg-[linear-gradient(150deg,#ffffff,hsl(var(--mobile-brand-soft)))] px-4 py-4',
      )}
    >
      <div className="flex items-start gap-3">
        <IconBadge tone="brand">
          <History className="h-4 w-4" />
        </IconBadge>
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Home Tool
          </p>
          <h1 className="mb-0 mt-1 text-[1.1rem] font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            Home Risk Replay
          </h1>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            See what your home has already been through.
          </p>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            Replay historical weather and stress events that may have affected this property.
          </p>
          {property ? (
            <p className={cn('mb-0 mt-2 text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}>
              {compactPropertyLabel(property)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PropertyContextStrip({
  property,
  isLoading,
}: {
  property: Property | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <MobileCard variant="compact" className="animate-pulse">
        <div className="h-3 w-28 rounded-full bg-slate-200" />
        <div className="mt-2 h-4 w-48 rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-40 rounded-full bg-slate-100" />
      </MobileCard>
    );
  }

  return (
    <CompactEntityRow
      leading={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-primary))]">
          <Home className="h-4 w-4" />
        </span>
      }
      title={compactPropertyLabel(property)}
      subtitle={compactPropertyLocation(property)}
      meta="Replaying this property"
      className="bg-[hsl(var(--mobile-card-bg))]"
    />
  );
}

function WindowPicker({
  value,
  onChange,
}: {
  value: HomeRiskReplayWindowType;
  onChange: (value: HomeRiskReplayWindowType) => void;
}) {
  return (
    <div className="space-y-2">
      {WINDOW_OPTIONS.map((option) => {
        const isActive = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            role="radio"
            aria-checked={isActive}
            className={cn(
              'w-full rounded-2xl border px-3.5 py-3 text-left transition-colors',
              isActive
                ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]'
                : 'border-[hsl(var(--mobile-border-subtle))] bg-white hover:bg-[hsl(var(--mobile-bg-muted))]'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                  {option.label}
                </p>
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                  {option.description}
                </p>
              </div>
              {isActive ? <StatusChip tone="info">Selected</StatusChip> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SummaryCard({
  replay,
  activeRunSummary,
}: {
  replay: HomeRiskReplayDetail;
  activeRunSummary: HomeRiskReplayRunSummary | null;
}) {
  const totalEvents = Math.max(0, Number(replay.totalEvents ?? 0));
  const highImpactEvents = Math.max(0, Number(replay.highImpactEvents ?? 0));
  const moderateImpactEvents = Math.max(0, Number(replay.moderateImpactEvents ?? 0));
  const topDrivers = replay.summaryJson?.topDrivers ?? [];
  const guardrail = buildHomeRiskReplayGuardrail(replay);
  const summaryText = replay.status === 'failed'
    ? 'This replay did not finish successfully. You can review prior runs or try a fresh run.'
    : totalEvents === 0
    ? 'We found no significant historical events for this property in the selected period.'
    : replay.summaryText || replay.summaryJson?.timelineSummary || 'Replay results are ready for review.';

  return (
    <MobileCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
            Replay summary
          </p>
          <h2 className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>
            {formatWindowType(replay.windowType)}
          </h2>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            {formatReplayDateRange(replay.windowStart, replay.windowEnd)}
            {activeRunSummary?.createdAt ? ` • Generated ${formatReplayDate(activeRunSummary.createdAt)}` : ''}
          </p>
        </div>
        <StatusChip tone={replay.status === 'completed' ? 'good' : replay.status === 'failed' ? 'danger' : 'elevated'}>
          {replay.status}
        </StatusChip>
      </div>

      <MobileKpiStrip className="sm:grid-cols-3">
        <MobileKpiTile
          label="Total events"
          value={totalEvents}
          hint="Matched historical events"
        />
        <MobileKpiTile
          label="High impact"
          value={highImpactEvents}
          hint="Strong stress signals"
          tone={highImpactEvents > 0 ? 'danger' : 'neutral'}
        />
        <MobileKpiTile
          label="Moderate impact"
          value={moderateImpactEvents}
          hint="Worth reviewing"
          tone={moderateImpactEvents > 0 ? 'warning' : 'neutral'}
        />
      </MobileKpiStrip>

      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))] p-4'
        )}
      >
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            {summaryText}
          </p>
        </div>
      </div>

      {guardrail ? (
        <div
          className={cn(
            MOBILE_CARD_RADIUS,
            'border px-4 py-3',
            guardrail.tone === 'good'
              ? 'border-emerald-200 bg-emerald-50/70'
              : 'border-slate-200 bg-slate-50'
          )}
        >
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
            {guardrail.title}
          </p>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            {guardrail.description}
          </p>
        </div>
      ) : null}

      {topDrivers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {topDrivers.map((driver) => (
            <StatusChip key={driver} tone="info">
              {formatDriverCode(driver)}
            </StatusChip>
          ))}
        </div>
      ) : null}

      {replay.summaryJson?.notes?.[0] ? (
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          {replay.summaryJson.notes[0]}
        </p>
      ) : null}
    </MobileCard>
  );
}

function TimelineSection({
  replay,
  onOpenEvent,
}: {
  replay: HomeRiskReplayDetail;
  onOpenEvent: (event: HomeRiskReplayTimelineEvent, index: number) => void;
}) {
  if (replay.totalEvents === 0) {
    return (
      <EmptyStateCard
        title="No significant events found in this window"
        description="We found no significant historical events for this property in the selected period. You can still try a longer window if you want broader context."
      />
    );
  }

  return (
    <div className="space-y-4">
      {replay.timelineEvents.map((event, index) => (
        <ReplayTimelineItem
          key={event.id}
          event={event}
          isLast={index === replay.timelineEvents.length - 1}
          onOpen={(nextEvent) => onOpenEvent(nextEvent, index)}
        />
      ))}
    </div>
  );
}

function HistorySection({
  runs,
  activeRunId,
  onSelect,
  isLoading,
}: {
  runs: HomeRiskReplayRunSummary[];
  activeRunId: string | null;
  onSelect: (run: HomeRiskReplayRunSummary, index: number) => void;
  isLoading: boolean;
}) {
  if (isLoading && runs.length === 0) {
    return (
      <MobileCard className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      </MobileCard>
    );
  }

  if (runs.length === 0) {
    return (
      <EmptyStateCard
        title="No prior replays yet"
        description="Generate your first replay above. Older runs will collect here for quick comparison."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {runs.map((run, index) => (
        <button
          key={run.id}
          type="button"
          onClick={() => onSelect(run, index)}
          className={cn(
            'w-full rounded-2xl border px-3.5 py-3 text-left transition-colors',
            run.id === activeRunId
              ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]'
              : 'border-[hsl(var(--mobile-border-subtle))] bg-white hover:bg-[hsl(var(--mobile-bg-muted))]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                {formatWindowType(run.windowType)}
              </p>
          <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
            {formatReplayDate(run.createdAt)} • {formatReplayDateRange(run.windowStart, run.windowEnd)}
          </p>
            </div>
            <StatusChip tone={runStatusTone(run.status)}>
              {historyButtonLabel(run, activeRunId)}
            </StatusChip>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <StatusChip tone="info">{run.totalEvents} events</StatusChip>
            <StatusChip tone={run.highImpactEvents > 0 ? 'danger' : 'good'}>
              {run.highImpactEvents} high impact
            </StatusChip>
            <StatusChip tone={run.moderateImpactEvents > 0 ? 'elevated' : 'info'}>
              {run.moderateImpactEvents} moderate
            </StatusChip>
          </div>

          {run.summaryText ? (
            <p className={cn('mb-0 mt-2 line-clamp-2 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              {run.summaryText}
            </p>
          ) : run.status === 'failed' ? (
            <p className={cn('mb-0 mt-2 line-clamp-2 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              This replay did not finish successfully. Open it to retry or review the saved state.
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export default function HomeRiskReplayClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const queryClient = useQueryClient();
  const launchSurface = normalizeLaunchSurface(searchParams.get('launchSurface'));
  const prefilledWindowType = searchParams.get('windowType');
  const contextualFocus = searchParams.get('focus');
  const openedScreenKeyRef = React.useRef<string | null>(null);
  const viewedRunIdsRef = React.useRef<Set<string>>(new Set());
  const emptyViewedRunIdsRef = React.useRef<Set<string>>(new Set());
  const trackedDetailErrorsRef = React.useRef<Set<string>>(new Set());
  const trackedHistoryErrorsRef = React.useRef<Set<string>>(new Set());
  const trackedOpenErrorsRef = React.useRef<Set<string>>(new Set());

  const [windowType, setWindowType] = React.useState<HomeRiskReplayWindowType>(() => {
    return isWindowType(prefilledWindowType) ? prefilledWindowType : 'since_built';
  });
  const [windowStart, setWindowStart] = React.useState('');
  const [windowEnd, setWindowEnd] = React.useState('');
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = React.useState<HomeRiskReplayTimelineEvent | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const historyQuery = useQuery({
    queryKey: ['home-risk-replay-runs', propertyId],
    queryFn: async () => listHomeRiskReplayRuns(propertyId),
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });

  const activeRunId = selectedRunId ?? historyQuery.data?.[0]?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ['home-risk-replay-detail', propertyId, activeRunId],
    queryFn: async () => {
      if (!activeRunId) return null;
      return getHomeRiskReplayDetail(propertyId, activeRunId);
    },
    enabled: !!propertyId && !!activeRunId,
    staleTime: 60 * 1000,
  });

  const trackReplayEvent = React.useCallback((
    event: string,
    section?: string,
    metadata?: Record<string, unknown>,
  ) => {
    if (!propertyId) return;
    trackHomeRiskReplayEvent(propertyId, {
      event,
      section,
      metadata: {
        tool_name: 'home_risk_replay',
        property_id: propertyId,
        launch_surface: launchSurface,
        contextual_focus_present: Boolean(contextualFocus),
        ...metadata,
      },
    }).catch(() => undefined);
  }, [contextualFocus, launchSurface, propertyId]);

  const generateMutation = useMutation({
    mutationFn: async (options: { forceRegenerate?: boolean }) => generateHomeRiskReplay(propertyId, {
      windowType,
      windowStart: windowType === 'custom_range' ? new Date(`${windowStart}T00:00:00.000Z`).toISOString() : null,
      windowEnd: windowType === 'custom_range' ? new Date(`${windowEnd}T23:59:59.999Z`).toISOString() : null,
      forceRegenerate: options.forceRegenerate ?? false,
    }),
    onSuccess: async ({ replay }) => {
      setSelectedRunId(replay.id);
      setSelectedEvent(null);
      queryClient.setQueryData(['home-risk-replay-detail', propertyId, replay.id], replay);
      await queryClient.invalidateQueries({ queryKey: ['home-risk-replay-runs', propertyId] });
    },
    onError: (error) => {
      trackReplayEvent('ERROR', 'controls', {
        stage: 'generate',
        error_type: classifyReplayError(error),
        window_type: windowType,
      });
    },
  });

  const currentReplay = detailQuery.data ?? null;
  const activeRunSummary = React.useMemo(() => {
    if (!activeRunId) return null;
    return historyQuery.data?.find((run) => run.id === activeRunId) ?? null;
  }, [activeRunId, historyQuery.data]);
  const property = propertyQuery.data;

  React.useEffect(() => {
    const requestedRunId = searchParams.get('runId');
    if (requestedRunId) {
      setSelectedRunId((current) => (current === requestedRunId ? current : requestedRunId));
    }

    const requestedWindowType = searchParams.get('windowType');
    if (isWindowType(requestedWindowType)) {
      setWindowType((current) => (current === requestedWindowType ? current : requestedWindowType));
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (!historyQuery.data) return;
    if (!selectedRunId) return;
    if (historyQuery.data.some((run) => run.id === selectedRunId)) return;

    setSelectedRunId(historyQuery.data[0]?.id ?? null);
  }, [historyQuery.data, selectedRunId]);

  React.useEffect(() => {
    if (!propertyId || propertyQuery.isLoading) return;

    const openKey = `${propertyId}:${launchSurface}:${prefilledWindowType ?? 'none'}`;
    if (openedScreenKeyRef.current === openKey) return;

    openedScreenKeyRef.current = openKey;
    trackReplayEvent('OPENED', 'page', {
      has_property_context: Boolean(property),
      prefilled_window_type: isWindowType(prefilledWindowType) ? prefilledWindowType : null,
      device_context: deviceContext(),
    });
  }, [launchSurface, prefilledWindowType, property, propertyId, propertyQuery.isLoading, trackReplayEvent]);

  React.useEffect(() => {
    if (!propertyQuery.isError) return;

    const errorKey = `${propertyId}:open`;
    if (trackedOpenErrorsRef.current.has(errorKey)) return;

    trackedOpenErrorsRef.current.add(errorKey);
    trackReplayEvent('ERROR', 'page', {
      stage: 'open',
      error_type: classifyReplayError(propertyQuery.error),
      window_type: windowType,
    });
  }, [propertyId, propertyQuery.error, propertyQuery.isError, trackReplayEvent, windowType]);

  React.useEffect(() => {
    if (!historyQuery.isError) return;

    const errorKey = `${propertyId}:history`;
    if (trackedHistoryErrorsRef.current.has(errorKey)) return;

    trackedHistoryErrorsRef.current.add(errorKey);
    trackReplayEvent('ERROR', 'history', {
      stage: 'history',
      error_type: classifyReplayError(historyQuery.error),
      window_type: windowType,
    });
  }, [historyQuery.error, historyQuery.isError, propertyId, trackReplayEvent, windowType]);

  React.useEffect(() => {
    if (!detailQuery.isError || !activeRunId) return;

    const errorKey = `${propertyId}:${activeRunId}`;
    if (trackedDetailErrorsRef.current.has(errorKey)) return;

    trackedDetailErrorsRef.current.add(errorKey);
    trackReplayEvent('ERROR', 'detail', {
      stage: 'detail',
      error_type: classifyReplayError(detailQuery.error),
      replay_run_id: activeRunId,
      window_type: activeRunSummary?.windowType ?? windowType,
    });
  }, [activeRunId, activeRunSummary?.windowType, detailQuery.error, detailQuery.isError, propertyId, trackReplayEvent, windowType]);

  React.useEffect(() => {
    if (!currentReplay) return;
    if (viewedRunIdsRef.current.has(currentReplay.id)) return;

    viewedRunIdsRef.current.add(currentReplay.id);
    trackReplayEvent('VIEWED', 'summary', {
      replay_run_id: currentReplay.id,
      window_type: currentReplay.windowType,
      total_events_bucket: bucketTotalEvents(currentReplay.totalEvents),
      high_impact_events_bucket: bucketImpactEvents(currentReplay.highImpactEvents),
      moderate_impact_events_bucket: bucketImpactEvents(currentReplay.moderateImpactEvents),
      has_events: currentReplay.totalEvents > 0,
      has_high_impact_events: currentReplay.highImpactEvents > 0,
      engine_version: currentReplay.engineVersion ?? null,
    });

    if (currentReplay.totalEvents === 0 && !emptyViewedRunIdsRef.current.has(currentReplay.id)) {
      emptyViewedRunIdsRef.current.add(currentReplay.id);
      trackReplayEvent('EMPTY_VIEWED', 'timeline', {
        replay_run_id: currentReplay.id,
        window_type: currentReplay.windowType,
      });
    }
  }, [currentReplay, trackReplayEvent]);

  function validateInputs(): boolean {
    const errors = buildHomeRiskReplayValidationErrors({
      windowType,
      windowStart,
      windowEnd,
    });

    const nextError = errors.windowStart || errors.windowEnd || null;
    setFormError(nextError);
    return !nextError;
  }

  function handleGenerate(forceRegenerate = false) {
    if (!validateInputs()) return;
    trackReplayEvent('GENERATION_STARTED', 'controls', {
      window_type: windowType,
      custom_range_used: windowType === 'custom_range',
    });
    generateMutation.mutate({ forceRegenerate });
  }

  function handleSelectHistoryRun(run: HomeRiskReplayRunSummary, index: number) {
    if (run.id !== activeRunId) {
      trackReplayEvent('HISTORY_ITEM_OPENED', 'history', {
        replay_run_id: run.id,
        window_type: run.windowType,
        total_events_bucket: bucketTotalEvents(run.totalEvents),
        high_impact_events_bucket: bucketImpactEvents(run.highImpactEvents),
        source_list_position: index + 1,
      });
    }

    setSelectedRunId(run.id);
  }

  function handleOpenTimelineEvent(event: HomeRiskReplayTimelineEvent, index: number) {
    trackReplayEvent('EVENT_OPENED', 'timeline', {
      replay_run_id: currentReplay?.id ?? activeRunId,
      replay_event_match_id: event.id,
      risk_event_id: event.homeRiskEventId,
      event_type: event.eventType,
      severity: event.severity,
      impact_level: event.impactLevel,
      opened_from: 'timeline',
      event_position: index + 1,
    });
    setSelectedEvent(event);
  }

  const propertyMissing = !propertyQuery.isLoading && !property;
  const generationErrorMessage = generateMutation.isError
    ? getHomeRiskReplayUserMessage(generateMutation.error, 'generate')
    : null;
  const historyErrorMessage = historyQuery.isError
    ? getHomeRiskReplayUserMessage(historyQuery.error, 'history')
    : null;
  const detailErrorMessage = detailQuery.isError
    ? getHomeRiskReplayUserMessage(detailQuery.error, 'detail')
    : null;
  const propertyErrorMessage = propertyQuery.isError
    ? getHomeRiskReplayUserMessage(propertyQuery.error, 'open')
    : null;
  const noPropertyContextMessage = propertyQuery.isLoading
    ? 'Loading the property context used for this replay.'
    : propertyErrorMessage || 'Home Risk Replay needs a property context before it can build a historical stress timeline.';
  const replayMethodNote = currentReplay && currentReplay.totalEvents > 0
    ? buildEventLocationNote({
        impactFactorsJson: currentReplay.timelineEvents?.[0]?.impactFactorsJson ?? null,
      })
    : null;

  return (
    <MobilePageContainer className="space-y-5 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      <div className="space-y-5 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5 lg:space-y-0">
        <div className="lg:col-span-2 lg:hidden">
          <ReplayIntroCard property={property} />
        </div>

        <div className="lg:col-span-2 lg:hidden">
          <PropertyContextStrip property={property} isLoading={propertyQuery.isLoading} />
        </div>

        <div className="lg:col-span-2">
          <HomeToolHeader
            toolId="home-risk-replay"
            propertyId={propertyId}
          />
        </div>

        <div className="lg:col-span-2">
          <TrustStrip
            variant="footnote"
            confidenceLabel={currentReplay ? `${currentReplay.totalEvents} matched events in selected window` : 'Confidence improves after first replay run'}
            freshnessLabel={activeRunSummary?.createdAt ? `Latest run ${formatReplayDate(activeRunSummary.createdAt)}` : 'Run replay to refresh'}
            sourceLabel="Historical weather/risk events + property location + recorded home details"
          />
        </div>

        <div className="space-y-5 lg:col-start-1">
          <MobileSection>
            <MobileSectionHeader
              title="Replay controls"
              subtitle="Choose how far back to look, then generate or reload a replay."
            />
            <MobileFilterSurface>
              <div role="radiogroup" aria-label="Replay window">
                <WindowPicker value={windowType} onChange={(nextValue) => {
                  setWindowType(nextValue);
                  setFormError(null);
                }} />
              </div>

              {windowType === 'custom_range' ? (
                <div
                  className="grid gap-3 sm:grid-cols-2"
                  aria-describedby={formError ? 'home-risk-replay-form-error' : undefined}
                >
                  <label htmlFor="home-risk-replay-start" className="space-y-1.5">
                    <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>Start date</span>
                    <Input
                      id="home-risk-replay-start"
                      type="date"
                      value={windowStart}
                      aria-invalid={Boolean(formError)}
                      aria-describedby={formError ? 'home-risk-replay-form-error' : undefined}
                      onChange={(event) => setWindowStart(event.target.value)}
                    />
                  </label>
                  <label htmlFor="home-risk-replay-end" className="space-y-1.5">
                    <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>End date</span>
                    <Input
                      id="home-risk-replay-end"
                      type="date"
                      value={windowEnd}
                      aria-invalid={Boolean(formError)}
                      aria-describedby={formError ? 'home-risk-replay-form-error' : undefined}
                      onChange={(event) => setWindowEnd(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {formError ? (
                <p id="home-risk-replay-form-error" className="mb-0 text-sm text-rose-600" role="alert">
                  {formError}
                </p>
              ) : (
                <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                  {windowType === 'since_built'
                    ? property?.yearBuilt
                      ? `Starts from ${property.yearBuilt} using the property year built as a reference point.`
                      : 'Uses a safe fallback lookback when year built is missing.'
                    : windowType === 'last_5_years'
                    ? 'A compact view for recent stress history.'
                    : 'Custom windows keep the replay focused and easier to scan.'}
                </p>
              )}

              <MobileActionRow className="pt-1">
                <Button
                  type="button"
                  className="min-h-[46px] flex-1"
                  disabled={generateMutation.isPending || propertyMissing}
                  aria-busy={generateMutation.isPending}
                  onClick={() => handleGenerate(false)}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {generateMutation.isPending ? 'Generating replay...' : 'Replay history'}
                </Button>

                {currentReplay ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[46px]"
                    disabled={generateMutation.isPending || propertyMissing}
                    onClick={() => handleGenerate(true)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Fresh run
                  </Button>
                ) : null}
              </MobileActionRow>
              {generateMutation.isPending ? (
                <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)} role="status" aria-live="polite">
                  Building a replay from historical events and the details already recorded for this property.
                </p>
              ) : null}
            </MobileFilterSurface>
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader
              title="Prior replay runs"
              subtitle="Open an earlier replay when you want to compare windows or rerun history."
            />
            {historyQuery.isError ? (
              <Alert variant="destructive" className="mb-3">
                <AlertTitle>Could not load replay history</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{historyErrorMessage}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => historyQuery.refetch()}>
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {!historyQuery.isError ? (
              <HistorySection
                runs={historyQuery.data ?? []}
                activeRunId={activeRunId}
                onSelect={handleSelectHistoryRun}
                isLoading={historyQuery.isLoading}
              />
            ) : null}
          </MobileSection>
        </div>

        <div className="space-y-5 lg:col-start-2">
          {propertyMissing ? (
            <EmptyStateCard
              title="Property not available"
              description={noPropertyContextMessage}
            />
          ) : null}

          {generateMutation.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Replay generation failed</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{generationErrorMessage}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => handleGenerate(false)}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {!currentReplay && !detailQuery.isLoading && !propertyMissing ? (
            <EmptyStateCard
              title={historyQuery.data?.length ? 'Choose a replay to review' : 'Generate your first replay'}
              description={historyQuery.data?.length
                ? 'Your prior replay runs are ready below. Open one, or generate a new window above.'
                : 'Home Risk Replay builds a calm historical timeline from matched risk events and the details already recorded for this property.'}
              action={
                historyQuery.data?.length ? undefined : (
                  <Button type="button" onClick={() => handleGenerate(false)} disabled={generateMutation.isPending || propertyQuery.isLoading}>
                    <CalendarRange className="h-4 w-4" />
                    Generate replay
                  </Button>
                )
              }
            />
          ) : null}

          {detailQuery.isLoading && activeRunId ? (
            <MobileCard className="space-y-4 animate-pulse" aria-hidden="true">
              <div className="h-3 w-28 rounded-full bg-slate-200" />
              <div className="h-5 w-52 rounded-full bg-slate-200" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="h-20 rounded-2xl bg-slate-100" />
              </div>
              <div className="h-24 rounded-2xl bg-slate-100" />
            </MobileCard>
          ) : null}

          {detailQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load replay detail</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{detailErrorMessage}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => detailQuery.refetch()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {currentReplay ? (
            <MobileSection>
              <MobileSectionHeader
                title="Replay summary"
                subtitle="A compact read on the historical stress signals we found for this property."
                action={
                  <StatusChip tone="info">
                    <Clock3 className="mr-1 h-3.5 w-3.5" />
                    {currentReplay.engineVersion || 'MVP engine'}
                  </StatusChip>
                }
              />
              <SummaryCard replay={currentReplay} activeRunSummary={activeRunSummary} />
              {replayMethodNote ? (
                <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                  {replayMethodNote}
                </p>
              ) : null}
            </MobileSection>
          ) : null}

          {currentReplay ? (
            <MobileSection>
              <MobileSectionHeader
                title="Historical timeline"
                subtitle="Newest events first, with explainable property notes and details on tap."
                action={
                  <StatusChip tone="good">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    {currentReplay.totalEvents} matched
                  </StatusChip>
                }
              />
              <TimelineSection replay={currentReplay} onOpenEvent={handleOpenTimelineEvent} />
            </MobileSection>
          ) : null}
        </div>
      </div>

      <p className={cn('mb-0 text-center text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
        This replay is based on historical events matched to your property location and recorded home details.
      </p>

      <ReplayDetailSheet
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </MobilePageContainer>
  );
}
