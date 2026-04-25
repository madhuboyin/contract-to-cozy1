'use client';

/**
 * AppShell audit, 2026-04-25:
 * 1. Root authenticated layout is apps/frontend/src/app/(dashboard)/layout.tsx.
 * 2. The desktop left nav is rendered once there as PersistentSidebarNav, not per page.
 * 3. Target dashboard pages share that layout: Today, My Home, Protect, Save, Fix/Resolution Center, Vault, Home Lab, and Community; Knowledge currently lives at /knowledge outside the dashboard route group.
 * 4. ResolutionCenterClient rendered its own right rail inline; that duplicate rail is replaced by this shared RightSidebar.
 * 5. Existing data sources reused here are React Query caches for property health, score snapshots, orchestration summary, active incidents, bookings, and property resolutions.
 */

import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  Plus,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import type { Booking, OrchestratedActionDTO, Property } from '@/types';
import type { IncidentDTO } from '@/types/incidents.types';
import { listIncidents } from '@/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi';

type HealthTone = 'good' | 'fair' | 'poor';

type Trend = {
  delta: number;
  direction: 'up' | 'down' | 'flat';
} | null;

type NextTask = {
  name: string;
  date: string | null;
} | null;

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;
const HIGH_RISK_LEVELS = new Set(['CRITICAL', 'HIGH']);
const COVERAGE_CATEGORY_KEYWORDS = ['COVERAGE', 'INSURANCE', 'WARRANTY', 'POLICY'];

function getPropertyIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(PROPERTY_ID_IN_PATH);
  return match?.[1];
}

function normalizeUpperText(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function hasKeyword(value: string | null | undefined, keywords: string[]): boolean {
  const upper = normalizeUpperText(value);
  return keywords.some((keyword) => upper.includes(keyword));
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampScore(value: unknown): number {
  const numeric = asNumber(value) ?? 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getHealthTone(score: number): HealthTone {
  if (score >= 70) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function getHealthLabel(score: number): 'Good' | 'Fair' | 'Poor' {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function toneClasses(tone: HealthTone) {
  if (tone === 'good') return { text: 'text-teal-600', stroke: '#0d9488' };
  if (tone === 'fair') return { text: 'text-amber-600', stroke: '#d97706' };
  return { text: 'text-red-600', stroke: '#dc2626' };
}

function formatRelativeUpdated(dateLike: string | number | null | undefined): string {
  const timestamp = typeof dateLike === 'number' ? dateLike : Date.parse(String(dateLike || ''));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Updated recently';

  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `Verified ${minutes} minutes ago from live signals`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Verified ${hours} hours ago from live signals`;
  const days = Math.round(hours / 24);
  if (days > 365) return 'Verified recently from home signals';
  return `Verified ${days} days ago from home signals`;
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTaskDate(dateLike: string | null | undefined): string | null {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const dayDelta = Math.round((date.getTime() - Date.now()) / dayMs);
  if (dayDelta === 0) return 'Today';
  if (dayDelta === 1) return 'Tomorrow';
  if (dayDelta > 1 && dayDelta <= 14) return `In ${dayDelta} days`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isCoverageAction(action: OrchestratedActionDTO): boolean {
  return (
    action.coverage?.hasCoverage === false ||
    normalizeUpperText(action.actionKey).startsWith('COVERAGE_GAP::') ||
    hasKeyword(action.category, COVERAGE_CATEGORY_KEYWORDS) ||
    hasKeyword(action.title, ['COVERAGE', 'WARRANTY', 'INSURANCE', 'POLICY', 'GAP']) ||
    hasKeyword(action.description ?? null, ['COVERAGE', 'WARRANTY', 'INSURANCE', 'POLICY', 'GAP'])
  );
}

function isUrgentAction(action: OrchestratedActionDTO): boolean {
  return HIGH_RISK_LEVELS.has(normalizeUpperText(action.riskLevel ?? null)) || action.overdue === true;
}

function isActiveIncident(item: IncidentDTO): boolean {
  return item.status !== 'RESOLVED' && item.status !== 'SUPPRESSED' && item.status !== 'EXPIRED';
}

function isUrgentIncident(item: IncidentDTO): boolean {
  return isActiveIncident(item) && (item.severity === 'CRITICAL' || item.severity === 'WARNING');
}

function isHighConfidence(item: any): boolean {
  const level = normalizeUpperText(item?.confidence?.level ?? null);
  if (level === 'HIGH') return true;

  const score =
    typeof item?.confidence?.score === 'number'
      ? item.confidence.score
      : typeof item?.confidence === 'number'
        ? item.confidence * 100
        : null;

  return typeof score === 'number' && score >= 80;
}

function chooseNextTask(actions: OrchestratedActionDTO[], bookings: Booking[]): NextTask {
  const upcomingBookings = bookings
    .filter((booking) => booking.scheduledDate)
    .map((booking) => ({
      name: booking.service?.name || booking.description || 'Scheduled service',
      date: booking.scheduledDate,
      sortDate: Date.parse(String(booking.scheduledDate)),
    }));

  const upcomingActions = actions
    .filter((action) => action.nextDueDate)
    .map((action) => ({
      name: action.title || 'Home task',
      date: action.nextDueDate ?? null,
      sortDate: Date.parse(String(action.nextDueDate)),
    }));

  const next = [...upcomingBookings, ...upcomingActions]
    .filter((task) => Number.isFinite(task.sortDate))
    .sort((a, b) => a.sortDate - b.sortDate)[0];

  return next ? { name: next.name, date: next.date } : null;
}

function useResolvedPropertyId() {
  const pathname = usePathname();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromPath = getPropertyIdFromPathname(pathname || '');

  const propertiesQuery = useQuery({
    queryKey: ['properties-switcher'],
    queryFn: async () => {
      const res = await api.getProperties();
      return res.success ? res.data.properties : [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !selectedPropertyId && !propertyIdFromPath,
  });

  const fallbackProperty = propertiesQuery.data?.find((property) => property.isPrimary) ?? propertiesQuery.data?.[0];

  return {
    propertyId: selectedPropertyId || propertyIdFromPath || fallbackProperty?.id,
    isLoading: propertiesQuery.isLoading,
  };
}

function useSidebarData() {
  const { propertyId, isLoading: propertyIdLoading } = useResolvedPropertyId();

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const scoreSnapshotQuery = useQuery({
    queryKey: ['property-score-snapshot', propertyId ?? 'none', 'HEALTH'],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getPropertyScoreSnapshots(propertyId, 16);
    },
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });

  const orchestrationQuery = useQuery({
    queryKey: ['orchestration-summary', propertyId],
    queryFn: () => (propertyId ? api.getOrchestrationSummary(propertyId) : Promise.resolve(null as any)),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const incidentsQuery = useQuery({
    queryKey: ['active-incidents', propertyId],
    queryFn: () => (propertyId ? listIncidents({ propertyId, limit: 10 }) : Promise.resolve({ items: [] } as any)),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const resolutionsQuery = useQuery({
    queryKey: ['replace-repair-resolutions', propertyId],
    queryFn: () => (propertyId ? api.getPropertyResolutions(propertyId) : Promise.resolve({ success: true, data: [] } as any)),
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const bookingsQuery = useQuery({
    queryKey: ['resolution-bookings', propertyId],
    queryFn: () =>
      propertyId
        ? api.listBookings({
            propertyId,
            limit: 50,
            sortBy: 'scheduledDate',
            sortOrder: 'desc',
          })
        : Promise.resolve({ success: true, data: { bookings: [], pagination: {} } } as any),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  return useMemo(() => {
    const property = propertyQuery.data as (Property & { healthScore?: { totalScore?: number } }) | null;
    const score = clampScore(scoreSnapshotQuery.data?.scores?.HEALTH?.latest?.score ?? property?.healthScore?.totalScore);
    const delta = scoreSnapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null;
    const trend: Trend =
      typeof delta === 'number' && Math.abs(delta) >= 0.05
        ? { delta, direction: delta > 0 ? 'up' : 'down' }
        : null;
    const actions: OrchestratedActionDTO[] = (orchestrationQuery.data as any)?.actions || [];
    const incidents: IncidentDTO[] = (incidentsQuery.data as any)?.items || [];
    const bookings: Booking[] =
      bookingsQuery.data && 'success' in bookingsQuery.data && bookingsQuery.data.success
        ? bookingsQuery.data.data?.bookings ?? []
        : [];
    const activeActions = actions.filter((action) => action.status !== 'SUPPRESSED');
    const activeIncidents = incidents.filter(isActiveIncident);

    return {
      propertyId,
      isLoading:
        propertyIdLoading ||
        propertyQuery.isLoading ||
        scoreSnapshotQuery.isLoading ||
        orchestrationQuery.isLoading ||
        incidentsQuery.isLoading ||
        resolutionsQuery.isLoading ||
        bookingsQuery.isLoading,
      health: {
        score,
        label: getHealthLabel(score),
        updatedAt:
          scoreSnapshotQuery.data?.scores?.HEALTH?.latest?.computedAt ||
          property?.updatedAt ||
          scoreSnapshotQuery.dataUpdatedAt ||
          propertyQuery.dataUpdatedAt,
        trend,
      },
      snapshot: {
        atRisk: activeActions.reduce((sum, item) => sum + (typeof item.exposure === 'number' ? item.exposure : 0), 0),
        urgentCount: activeActions.filter(isUrgentAction).length + activeIncidents.filter(isUrgentIncident).length,
        highConfidence: activeActions.filter(isHighConfidence).length + activeIncidents.filter(isHighConfidence).length,
        gapCount: activeActions.filter(isCoverageAction).length,
        nextTask: chooseNextTask(activeActions, bookings),
      },
    };
  }, [
    propertyId,
    propertyIdLoading,
    propertyQuery.data,
    propertyQuery.dataUpdatedAt,
    propertyQuery.isLoading,
    scoreSnapshotQuery.data,
    scoreSnapshotQuery.dataUpdatedAt,
    scoreSnapshotQuery.isLoading,
    orchestrationQuery.data,
    orchestrationQuery.isLoading,
    incidentsQuery.data,
    incidentsQuery.isLoading,
    resolutionsQuery.isLoading,
    bookingsQuery.data,
    bookingsQuery.isLoading,
  ]);
}

function BlockSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-2">
      <div className="h-[80px] w-[80px] rounded-full bg-gray-100 mx-auto" />
      <div className="h-3 w-16 bg-gray-100 rounded mx-auto" />
      <div className="h-2 w-24 bg-gray-100 rounded mx-auto mt-1" />
    </div>
  );
}

function HealthScoreBlock({
  score,
  label,
  updatedAt,
  trend,
}: {
  score: number;
  label: string;
  updatedAt: string | number | null | undefined;
  trend: Trend;
}) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const tone = getHealthTone(score);
  const color = toneClasses(tone);
  const trendText = trend ? `${trend.direction === 'up' ? '↑' : '↓'} ${Math.abs(Math.round(trend.delta))} pts this week` : null;

  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-4 shadow-[var(--ctc-shadow-card)]">
      <div className="flex flex-col items-center text-center">
        <svg width="80" height="80" viewBox="0 0 80 80" aria-label={`Home health score ${score}`}>
          <circle cx="40" cy="40" r={radius} stroke="#f3f4f6" strokeWidth="7" fill="none" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke={color.stroke}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (score / 100) * circumference}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="46" textAnchor="middle" className={cn('fill-current text-lg font-semibold', color.text)}>
            {score}
          </text>
        </svg>
        <p className={cn('mt-2 text-sm font-medium', color.text)}>{label}</p>
        <p className="mt-1 max-w-[150px] text-xs leading-4 text-slate-500">{formatRelativeUpdated(updatedAt)}</p>
        {trendText ? (
          <p className={cn('mt-1 text-xs', trend?.direction === 'up' ? 'text-teal-600' : 'text-amber-600')}>
            {trendText}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SnapshotRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span className={cn('min-w-0 text-right text-[12px] font-semibold', className)}>{value}</span>
    </div>
  );
}

function SnapshotBlock({
  urgentCount,
  atRisk,
  highConfidence,
  gapCount,
  nextTask,
}: {
  urgentCount: number;
  atRisk: number;
  highConfidence: number;
  gapCount: number;
  nextTask: NextTask;
}) {
  const nextTaskLabel = nextTask ? `${nextTask.name}${formatTaskDate(nextTask.date) ? ` · ${formatTaskDate(nextTask.date)}` : ''}` : 'None';

  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-3 shadow-[var(--ctc-shadow-card)]">
      <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em]">Intelligence brief</h2>
      <div className="mt-2">
        <SnapshotRow label="Total at risk" value={formatCompactUsd(Math.round(atRisk))} className="text-amber-600" />
        <SnapshotRow
          label="Urgent issues"
          value={urgentCount}
          className={urgentCount > 0 ? 'text-red-600' : 'text-gray-500'}
        />
        <SnapshotRow label="High confidence" value={highConfidence} className="text-gray-700" />
        <SnapshotRow
          label="Coverage gaps"
          value={gapCount === 0 ? 'None' : gapCount}
          className={gapCount === 0 ? 'text-teal-600' : 'text-red-600'}
        />
        <SnapshotRow
          label="Next task"
          value={<span className="block max-w-[104px] truncate">{nextTaskLabel}</span>}
          className="text-gray-700 font-medium"
        />
      </div>
    </section>
  );
}

function QuickActionsBlock({ propertyId }: { propertyId: string | undefined }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const applyPropertyId = (href: string) => {
    if (!propertyId) return href;
    const divider = href.includes('?') ? '&' : '?';
    return `${href}${divider}propertyId=${encodeURIComponent(propertyId)}`;
  };

  const inventoryActionHref = propertyId
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?from=status-board`
    : '/dashboard/inventory?from=status-board';

  const actions = [
    {
      label: 'Run full scan',
      description: 'Refresh home signals',
      icon: BarChart3,
      onClick: () => {
        if (propertyId) {
          void queryClient.invalidateQueries({ queryKey: ['orchestration-summary', propertyId] });
          void queryClient.invalidateQueries({ queryKey: ['active-incidents', propertyId] });
          void queryClient.invalidateQueries({ queryKey: ['replace-repair-resolutions', propertyId] });
          void queryClient.invalidateQueries({ queryKey: ['resolution-bookings', propertyId] });
        }
        toast({ title: 'Scan started', description: 'Refreshing home signals now.' });
      },
    },
    {
      label: 'Add appliance',
      description: 'Track a new home item',
      icon: Plus,
      onClick: () => router.push(inventoryActionHref),
    },
    {
      label: 'Schedule maintenance',
      description: 'Stay ahead of issues',
      icon: CalendarClock,
      onClick: () => router.push(applyPropertyId('/dashboard/maintenance')),
    },
  ];

  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-3 shadow-[var(--ctc-shadow-card)]">
      <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em]">Contextual actions</h2>
      <div className="mt-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="flex w-full cursor-pointer items-center gap-2 rounded-xl border-b border-slate-100 py-2 text-left transition-colors last:border-0 hover:bg-slate-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-slate-800">{action.label}</span>
                <span className="block truncate text-[10px] text-slate-500">{action.description}</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ViewReportLink({ propertyId }: { propertyId: string | undefined }) {
  const href = propertyId
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/health-score`
    : '/dashboard/properties';

  return (
    <button
      type="button"
      onClick={() => {
        window.location.assign(href);
      }}
      className="w-full rounded-[14px] border border-teal-200 bg-white/80 py-2.5 text-[12px] font-semibold text-teal-700 transition-colors hover:bg-teal-50"
    >
      View full report →
    </button>
  );
}

export function RightSidebar() {
  const data = useSidebarData();
  const pathname = usePathname();
  const routeLabel = useMemo(() => {
    if (pathname?.includes('/properties')) return 'Portfolio intelligence';
    if (pathname?.includes('/protect')) return 'Protection intelligence';
    if (pathname?.includes('/save')) return 'Wealth intelligence';
    if (pathname?.includes('/resolution-center')) return 'Resolution intelligence';
    if (pathname?.includes('/vault') || pathname?.includes('/inventory') || pathname?.includes('/documents')) return 'Vault intelligence';
    return 'Today intelligence';
  }, [pathname]);

  const routeInsight = useMemo(() => {
    const urgent = data.snapshot.urgentCount;
    if (pathname?.includes('/protect')) {
      return {
        icon: ShieldCheck,
        title: urgent > 0 ? 'Coverage and incident review recommended' : 'Protection posture is stable',
        detail: urgent > 0 ? `${urgent} protection signal${urgent === 1 ? '' : 's'} need review.` : 'No urgent exposure detected in the current signal set.',
      };
    }
    if (pathname?.includes('/save')) {
      return {
        icon: WalletCards,
        title: data.snapshot.atRisk > 0 ? 'Cost exposure has a clear next move' : 'Savings watch is active',
        detail: `Potential exposure tracked at ${formatCompactUsd(Math.round(data.snapshot.atRisk))}.`,
      };
    }
    if (pathname?.includes('/resolution-center')) {
      return {
        icon: CalendarClock,
        title: urgent > 0 ? 'Priority queue is ready' : 'Resolution queue is calm',
        detail: `${data.snapshot.highConfidence} item${data.snapshot.highConfidence === 1 ? '' : 's'} have strong signal confidence.`,
      };
    }
    return {
      icon: Sparkles,
      title: data.health.score >= 70 ? 'Your home is in controlled range' : 'A few signals need attention',
      detail: data.snapshot.nextTask ? `Next smart move: ${data.snapshot.nextTask.name}.` : 'No time-sensitive task is due right now.',
    };
  }, [data.health.score, data.snapshot, pathname]);
  const RouteIcon = routeInsight.icon;

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200/70 bg-white/70 px-3 py-4 backdrop-blur-xl lg:flex">
      <section className="rounded-[22px] border border-slate-200/80 bg-white/88 p-3 shadow-[var(--ctc-shadow-card)]">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{routeLabel}</p>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200">
            <RouteIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="mb-1 text-[13px] font-semibold leading-4 text-slate-950">{routeInsight.title}</p>
            <p className="mb-0 text-[11px] leading-4 text-slate-600">{routeInsight.detail}</p>
          </div>
        </div>
      </section>
      {data.isLoading ? (
        <>
          <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-4 shadow-[var(--ctc-shadow-card)]">
            <BlockSkeleton />
          </section>
          <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-3 shadow-[var(--ctc-shadow-card)]">
            <BlockSkeleton />
          </section>
        </>
      ) : (
        <>
          <HealthScoreBlock
            score={data.health.score}
            label={data.health.label}
            updatedAt={data.health.updatedAt}
            trend={data.health.trend}
          />
          <SnapshotBlock
            urgentCount={data.snapshot.urgentCount}
            atRisk={data.snapshot.atRisk}
            highConfidence={data.snapshot.highConfidence}
            gapCount={data.snapshot.gapCount}
            nextTask={data.snapshot.nextTask}
          />
        </>
      )}
      <QuickActionsBlock propertyId={data.propertyId} />
      <ViewReportLink propertyId={data.propertyId} />
    </aside>
  );
}
