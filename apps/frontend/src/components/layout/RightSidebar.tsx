'use client';

/**
 * AppShell audit, 2026-04-25:
 * 1. Root authenticated layout is apps/frontend/src/app/(dashboard)/layout.tsx.
 * 2. The desktop left nav is rendered once there as PersistentSidebarNav, not per page.
 * 3. Target dashboard pages share that layout: Today, My Home, Protect, Save, Fix/Resolution Center, Vault, Home Lab, and Community; Knowledge currently lives at /knowledge outside the dashboard route group.
 * 4. ResolutionCenterClient rendered its own right rail inline; that duplicate rail is replaced by this shared RightSidebar.
 * 5. Attention data comes from the canonical Home Action feed; bookings remain
 * a separate execution-calendar source.
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
import type { Booking, RankedHomeActionDTO } from '@/types';
import { getSidebarActions, getPageAwareSubtitle, type SidebarAction } from '@/lib/sidebar/dynamicSidebarActions';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';

type NextTask = {
  name: string;
  date: string | null;
} | null;

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;
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

function isCoverageAction(action: RankedHomeActionDTO): boolean {
  return (
    action.source.kind === 'COVERAGE' ||
    hasKeyword(action.presentation?.headline, COVERAGE_CATEGORY_KEYWORDS) ||
    hasKeyword(action.whyItMatters, COVERAGE_CATEGORY_KEYWORDS)
  );
}

function isUrgentAction(action: RankedHomeActionDTO): boolean {
  return action.priority === 'NOW' || action.priority === 'SOON';
}

function isHighConfidence(item: any): boolean {
  const level = normalizeUpperText(item?.confidence?.label ?? item?.confidence?.level ?? null);
  if (level === 'HIGH') return true;

  const score =
    typeof item?.confidence?.score === 'number'
      ? (item.confidence.score <= 1 ? item.confidence.score * 100 : item.confidence.score)
      : typeof item?.confidence === 'number'
        ? item.confidence * 100
        : null;

  return typeof score === 'number' && score >= 80;
}

function chooseNextTask(actions: RankedHomeActionDTO[], bookings: Booking[]): NextTask {
  const upcomingBookings = bookings
    .filter((booking) => booking.scheduledDate)
    .map((booking) => ({
      name: booking.service?.name || booking.description || 'Scheduled service',
      date: booking.scheduledDate,
      sortDate: Date.parse(String(booking.scheduledDate)),
    }));

  const upcomingActions = actions
    .filter((action) => action.timing.dueAt)
    .map((action) => ({
      name: action.presentation?.headline || action.recommendedAction,
      date: action.timing.dueAt,
      sortDate: Date.parse(String(action.timing.dueAt)),
    }));

  const next = [...upcomingBookings, ...upcomingActions]
    .filter((task) => Number.isFinite(task.sortDate))
    .sort((a, b) => a.sortDate - b.sortDate)[0];

  return next ? { name: next.name, date: next.date } : null;
}

function useResolvedPropertyId() {
  const pathname = usePathname();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const propertyIdFromPath = getPropertyIdFromPathname(pathname || '');

  const propertiesQuery = useQuery({
    queryKey: ['properties-switcher'],
    queryFn: async () => {
      const res = await api.getProperties();
      return res.success ? res.data.properties : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const properties = propertiesQuery.data ?? [];
  const routeProperty = propertyIdFromPath
    ? properties.find((property) => property.id === propertyIdFromPath)
    : undefined;
  const selectedProperty = selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId)
    : undefined;
  const fallbackProperty = properties.find((property) => property.isPrimary) ?? properties[0];
  const resolvedProperty = routeProperty ?? selectedProperty ?? fallbackProperty;

  React.useEffect(() => {
    if (!propertiesQuery.isSuccess) return;
    const resolvedId = resolvedProperty?.id;
    if (resolvedId !== selectedPropertyId) setSelectedPropertyId(resolvedId);
  }, [propertiesQuery.isSuccess, resolvedProperty?.id, selectedPropertyId, setSelectedPropertyId]);

  return {
    // Wait for the authoritative property list instead of issuing requests for
    // a stale localStorage selection that belongs to an older account/session.
    propertyId: propertiesQuery.isSuccess ? resolvedProperty?.id : undefined,
    isLoading: propertiesQuery.isLoading,
  };
}

function useSidebarData() {
  const { propertyId, isLoading: propertyIdLoading } = useResolvedPropertyId();

  const homeActionsQuery = useQuery({
    queryKey: ['home-actions', propertyId],
    queryFn: () => (propertyId ? api.getHomeActions(propertyId) : Promise.resolve(null as any)),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
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

  const homeSavingsQuery = useQuery({
    queryKey: ['home-savings-summary-sidebar', propertyId],
    queryFn: () => (propertyId ? getHomeSavingsSummary(propertyId) : Promise.resolve(null)),
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    const actions: RankedHomeActionDTO[] = (homeActionsQuery.data as any)?.actions || [];
    const bookings: Booking[] =
      bookingsQuery.data && 'success' in bookingsQuery.data && bookingsQuery.data.success
        ? bookingsQuery.data.data?.bookings ?? []
        : [];
    const activeActions = actions.filter((action) => action.state === 'OPEN' || action.state === 'IN_PROGRESS');

    return {
      propertyId,
      isLoading:
        propertyIdLoading ||
        homeActionsQuery.isLoading ||
        bookingsQuery.isLoading,
      snapshot: {
        atRisk: 0,
        urgentCount: activeActions.filter(isUrgentAction).length,
        highConfidence: activeActions.filter(isHighConfidence).length,
        gapCount: activeActions.filter(isCoverageAction).length,
        nextTask: chooseNextTask(activeActions, bookings),
        savingsOpportunities: (homeSavingsQuery.data?.categories ?? []).filter((c) => c.status === 'FOUND_SAVINGS').length,
      },
    };
  }, [
    propertyId,
    propertyIdLoading,
    homeActionsQuery.data,
    homeActionsQuery.isLoading,
    bookingsQuery.data,
    bookingsQuery.isLoading,
    homeSavingsQuery.data,
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

function PropertyStatusBlock({ urgentCount, highConfidence }: { urgentCount: number; highConfidence: number }) {
  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-4 shadow-[var(--ctc-shadow-card)]">
      <h2 className="mb-3 text-[11px] font-semibold text-slate-400 tracking-normal">Current status</h2>
      <div className="flex flex-col items-center text-center">
        <span className={cn('flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold', urgentCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700')}>
          {urgentCount}
        </span>
        <p className={cn('mt-2 text-sm font-medium', urgentCount > 0 ? 'text-amber-700' : 'text-teal-700')}>
          {urgentCount > 0 ? 'Items need attention' : 'No urgent items'}
        </p>
        <p className="mt-1 max-w-[170px] text-xs leading-4 text-slate-500">
          {highConfidence} item{highConfidence === 1 ? '' : 's'} backed by strong signal confidence.
        </p>
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
      <h2 className="text-[11px] font-semibold text-slate-400 tracking-normal">Intelligence brief</h2>
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

function DynamicActionsBlock({
  propertyId,
  pathname,
  signals,
}: {
  propertyId: string | undefined;
  pathname: string | null;
  signals: {
    urgentCount: number;
    atRisk: number;
    highConfidence: number;
    gapCount: number;
    savingsOpportunities: number;
  };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Get dynamic actions based on current context
  const actions = useMemo(() => {
    return getSidebarActions({
      route: pathname || '/dashboard',
      propertyId,
      signals: {
        urgentCount: signals.urgentCount,
        atRisk: signals.atRisk,
        gapCount: signals.gapCount,
        highConfidence: signals.highConfidence,
        savingsOpportunities: signals.savingsOpportunities,
      },
      missingData: {
        // These would ideally come from property data
        hasInsurance: undefined,
        hasWarranties: undefined,
        hasInventory: undefined,
        hasDocuments: undefined,
        hasFinancingProfile: undefined,
        hasRooms: undefined,
      },
      activeTool: pathname?.includes('/tools/') 
        ? pathname.split('/tools/')[1]?.split('/')[0] 
        : undefined,
    });
  }, [pathname, propertyId, signals]);

  const subtitle = useMemo(() => {
    return getPageAwareSubtitle(pathname || '/dashboard', signals);
  }, [pathname, signals]);

  const handleActionClick = (action: SidebarAction) => {
    if (action.onClickAction === 'refresh-signals') {
      if (propertyId) {
        void queryClient.invalidateQueries({ queryKey: ['home-actions', propertyId] });
        void queryClient.invalidateQueries({ queryKey: ['resolution-bookings', propertyId] });
      }
      toast({ title: 'Scan started', description: 'Refreshing home signals now.' });
    } else if (action.onClickAction === 'mark-resolved') {
      toast({ title: 'Action needed', description: 'Please mark the issue as resolved from the incident page.' });
    } else if (action.onClickAction === 'export-report') {
      toast({ title: 'Export started', description: 'Preparing your report for download.' });
    } else if (action.href) {
      router.push(action.href);
    }
  };

  // Get icon background color based on priority
  const getIconBgClass = (priority?: string) => {
    if (priority === 'high') return 'bg-teal-100 text-teal-700';
    if (priority === 'medium') return 'bg-slate-100 text-slate-600';
    return 'bg-slate-50 text-slate-500';
  };

  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-3 py-3 shadow-[var(--ctc-shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold text-slate-400 tracking-normal">Contextual actions</h2>
        <span className="text-[9px] text-slate-400">{subtitle}</span>
      </div>
      <div className="mt-2">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const isFirstHighPriority = index === 0 && action.priority === 'high';
          
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-xl border-b border-slate-100 py-2 text-left transition-colors last:border-0 hover:bg-slate-50",
                isFirstHighPriority && "bg-teal-50/30"
              )}
            >
              <span className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                getIconBgClass(action.priority)
              )}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="block truncate text-[12px] font-semibold text-slate-800">
                    {action.title}
                  </span>
                  {action.badge && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                      {action.badge}
                    </span>
                  )}
                </div>
                <span className="block truncate text-[11px] text-slate-500">{action.description}</span>
                {action.confidenceLabel && (
                  <span className="mt-0.5 block text-[9px] text-slate-400">
                    {action.confidenceLabel}
                  </span>
                )}
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
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/property-brief`
    : '/dashboard/properties';

  return (
    <button
      type="button"
      onClick={() => {
        window.location.assign(href);
      }}
      className="w-full rounded-[14px] border border-teal-200 bg-white/80 py-2.5 text-[12px] font-semibold text-teal-700 transition-colors hover:bg-teal-50"
    >
      Create property brief →
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
      title: urgent > 0 ? 'A few signals need attention' : 'Your current status is clear',
      detail: data.snapshot.nextTask ? `Next smart move: ${data.snapshot.nextTask.name}.` : 'No time-sensitive task is due right now.',
    };
  }, [data.snapshot, pathname]);
  const RouteIcon = routeInsight.icon;

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200/70 bg-white/70 px-3 py-4 backdrop-blur-xl lg:flex">
      <section className="rounded-[22px] border border-slate-200/80 bg-white/88 p-3 shadow-[var(--ctc-shadow-card)]">
        <p className="mb-2 text-[11px] font-semibold tracking-normal text-slate-400">{routeLabel}</p>
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
          <PropertyStatusBlock
            urgentCount={data.snapshot.urgentCount}
            highConfidence={data.snapshot.highConfidence}
          />
          <ViewReportLink propertyId={data.propertyId} />
          <SnapshotBlock
            urgentCount={data.snapshot.urgentCount}
            atRisk={data.snapshot.atRisk}
            highConfidence={data.snapshot.highConfidence}
            gapCount={data.snapshot.gapCount}
            nextTask={data.snapshot.nextTask}
          />
        </>
      )}
      <DynamicActionsBlock
        propertyId={data.propertyId}
        pathname={pathname}
        signals={data.snapshot}
      />
    </aside>
  );
}
