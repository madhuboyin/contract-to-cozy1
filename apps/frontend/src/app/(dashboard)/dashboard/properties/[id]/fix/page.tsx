'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Wrench,
  Search,
  CalendarClock,
  AlertCircle,
  ArrowRight,
  Zap,
  Scale,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Settings,
  Clock,
  Radio,
  Briefcase,
  Activity,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSafeAreaReserve } from '@/components/mobile/dashboard/MobilePrimitives';
import { WinCard } from '@/components/shared/WinCard';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { ResolutionCase, ResolutionCenterPayload } from '@/types';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import {
  resolveUrgentActionHref,
  UrgentActionItem,
} from '@/lib/dashboard/urgentActions';
import { filterResolutionActions } from '@/lib/dashboard/resolutionCenterViewModel';
import { filterResolutionCases } from '@/lib/dashboard/resolutionCases';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import type { GuidanceJourneyDTO } from '@/lib/api/guidanceApi';

// Extracts the real status string from HEALTH_INSIGHT descriptions like
// "Status: Needs Inspection. Requires resolution."
function parseInsightStatus(description: string): string {
  const match = description.match(/^Status:\s*(.+?)\./);
  return match ? match[1].trim() : '';
}

function getActionIcon(action: UrgentActionItem) {
  switch (action.type) {
    case 'INCIDENT':
      return <AlertCircle className="h-5 w-5 text-rose-600" />;
    case 'HEALTH_INSIGHT':
      return <Activity className="h-5 w-5 text-teal-600" />;
    case 'MAINTENANCE_OVERDUE':
      return <Wrench className="h-5 w-5 text-orange-600" />;
    case 'RENEWAL_EXPIRED':
      return <Shield className="h-5 w-5 text-rose-600" />;
    case 'RENEWAL_UPCOMING':
      return <Shield className="h-5 w-5 text-amber-600" />;
    case 'COVERAGE_GAP':
      return <Shield className="h-5 w-5 text-orange-600" />;
    case 'COVERAGE_PARTIAL':
      return <Shield className="h-5 w-5 text-blue-600" />;
    default:
      return <Wrench className="h-5 w-5 text-slate-500" />;
  }
}

function getActionIconBg(action: UrgentActionItem): string {
  switch (action.type) {
    case 'INCIDENT':
      return 'bg-rose-50 border border-rose-100';
    case 'HEALTH_INSIGHT':
      return 'bg-teal-50 border border-teal-100';
    case 'MAINTENANCE_OVERDUE':
      return 'bg-orange-50 border border-orange-100';
    case 'RENEWAL_EXPIRED':
      return 'bg-rose-50 border border-rose-100';
    case 'RENEWAL_UPCOMING':
      return 'bg-amber-50 border border-amber-100';
    case 'COVERAGE_GAP':
      return 'bg-orange-50 border border-orange-100';
    case 'COVERAGE_PARTIAL':
      return 'bg-blue-50 border border-blue-100';
    default:
      return 'bg-slate-50 border border-slate-100';
  }
}

// Returns the chip label and tone, using the real insight status for HEALTH_INSIGHT
// instead of a single "Needs Review" fallback for all items.
function getActionStatus(action: UrgentActionItem): { label: string; tone: 'danger' | 'warning' | 'neutral' } {
  switch (action.type) {
    case 'INCIDENT':
      return { label: action.severity === 'CRITICAL' ? 'Critical' : 'Live Alert', tone: 'danger' };
    case 'HEALTH_INSIGHT': {
      const status = parseInsightStatus(action.description);
      switch (status) {
        case 'Needs attention': return { label: 'Urgent Review', tone: 'danger' };
        case 'Needs Inspection': return { label: 'Needs Inspection', tone: 'warning' };
        case 'Needs Warranty':   return { label: 'Needs Warranty', tone: 'warning' };
        case 'Missing Data':     return { label: 'Missing Data', tone: 'neutral' };
        default:                 return { label: 'Needs Review', tone: 'warning' };
      }
    }
    case 'MAINTENANCE_OVERDUE':
      return { label: 'Overdue', tone: 'danger' };
    case 'RENEWAL_EXPIRED':
      return { label: 'Expired', tone: 'danger' };
    case 'RENEWAL_UPCOMING':
      return { label: 'Expiring Soon', tone: 'warning' };
    case 'COVERAGE_GAP':
      return { label: 'No Coverage', tone: 'warning' };
    case 'COVERAGE_PARTIAL':
      return { label: 'Partial Coverage', tone: 'neutral' };
    default:
      return { label: 'Action Required', tone: 'neutral' };
  }
}

// Returns High/Medium/Low differentiated by both type AND insight status so that
// not every health insight shows identical "Medium" — avoids the all-same-impact problem.
function getImpactLevel(action: UrgentActionItem): { label: string; dotColor: string } {
  switch (action.type) {
    case 'INCIDENT':
    case 'RENEWAL_EXPIRED':
      return { label: 'High', dotColor: 'bg-rose-500' };
    case 'MAINTENANCE_OVERDUE':
    case 'COVERAGE_GAP':
      return { label: 'High', dotColor: 'bg-orange-500' };
    case 'HEALTH_INSIGHT': {
      const status = parseInsightStatus(action.description);
      if (status === 'Needs attention') return { label: 'High',   dotColor: 'bg-rose-500' };
      if (status === 'Needs Inspection') return { label: 'High',  dotColor: 'bg-orange-500' };
      if (status === 'Needs Warranty')   return { label: 'Low',   dotColor: 'bg-emerald-400' };
      if (status === 'Missing Data')     return { label: 'Low',   dotColor: 'bg-slate-400' };
      return                                    { label: 'Medium', dotColor: 'bg-amber-400' };
    }
    case 'RENEWAL_UPCOMING':
    case 'COVERAGE_PARTIAL':
      return { label: 'Medium', dotColor: 'bg-amber-400' };
    default:
      return { label: 'Low', dotColor: 'bg-emerald-400' };
  }
}

// Rank badge color follows severity (impact), not position, so the visual hierarchy
// matches urgency — critical items read red/orange regardless of their rank number.
function getRankBadgeColor(impact: { dotColor: string }): string {
  if (impact.dotColor === 'bg-rose-500')   return 'bg-rose-500';
  if (impact.dotColor === 'bg-orange-500') return 'bg-orange-500';
  if (impact.dotColor === 'bg-amber-400')  return 'bg-amber-400';
  if (impact.dotColor === 'bg-blue-400')   return 'bg-blue-400';
  return 'bg-slate-400';
}

// Converts raw "Status: X. Requires resolution." database text into short,
// actionable consumer copy based on the insight factor and status.
function formatActionDescription(action: UrgentActionItem): string {
  if (action.type !== 'HEALTH_INSIGHT') return action.description;
  const status = parseInsightStatus(action.description);
  const title = action.title;
  switch (status) {
    case 'Needs attention':
      return `${title} requires urgent attention. Addressing this now prevents safety concerns and costly repairs.`;
    case 'Needs Inspection':
      return `${title} is due for a professional inspection. Regular checks catch issues early and extend system life.`;
    case 'Needs Warranty':
      return `${title} lacks warranty coverage. Adding protection shields you from unexpected repair costs.`;
    case 'Missing Data':
      return `We need more details about your ${title.toLowerCase()} to provide accurate health and cost insights.`;
    default:
      return `${title} has been flagged for review. Resolving this improves your home's overall health score.`;
  }
}

function getActionCta(action: UrgentActionItem): string {
  switch (action.type) {
    case 'INCIDENT':             return 'View Incident';
    case 'HEALTH_INSIGHT':       return 'Review Options';
    case 'MAINTENANCE_OVERDUE':  return 'Schedule Now';
    case 'RENEWAL_EXPIRED':      return 'Renew Now';
    case 'RENEWAL_UPCOMING':     return 'Compare Plans';
    case 'COVERAGE_GAP':         return 'Add Coverage';
    case 'COVERAGE_PARTIAL':     return 'Complete Coverage';
    default:                     return 'Take Action';
  }
}

function getCaseIcon(caseItem: ResolutionCase) {
  switch (caseItem.kind) {
    case 'incident':
      return <AlertCircle className="h-5 w-5 text-rose-600" />;
    case 'coverage_gap':
    case 'renewal':
      return <Shield className="h-5 w-5 text-orange-600" />;
    case 'repair_replace':
      return <Scale className="h-5 w-5 text-indigo-600" />;
    case 'health_insight':
      return <Activity className="h-5 w-5 text-teal-600" />;
    default:
      return <Wrench className="h-5 w-5 text-orange-600" />;
  }
}

function getCaseIconBg(caseItem: ResolutionCase): string {
  switch (caseItem.kind) {
    case 'incident':
      return 'bg-rose-50 border border-rose-100';
    case 'coverage_gap':
    case 'renewal':
      return 'bg-orange-50 border border-orange-100';
    case 'repair_replace':
      return 'bg-indigo-50 border border-indigo-100';
    case 'health_insight':
      return 'bg-teal-50 border border-teal-100';
    default:
      return 'bg-amber-50 border border-amber-100';
  }
}

function getCaseStatus(caseItem: ResolutionCase): { label: string; tone: 'danger' | 'warning' | 'neutral' | 'positive' } {
  switch (caseItem.status) {
    case 'in_progress':
      return { label: 'In Progress', tone: 'positive' };
    case 'options_ready':
      return { label: 'Options Ready', tone: 'neutral' };
    case 'needs_analysis':
      return { label: 'Needs Analysis', tone: 'warning' };
    case 'resolved':
      return { label: 'Resolved', tone: 'positive' };
    default:
      if (caseItem.priority === 'critical') return { label: 'Critical', tone: 'danger' };
      return { label: 'Detected', tone: 'warning' };
  }
}

function getCaseImpact(caseItem: ResolutionCase): { label: string; dotColor: string } {
  switch (caseItem.priority) {
    case 'critical':
      return { label: 'Critical', dotColor: 'bg-rose-500' };
    case 'high':
      return { label: 'High', dotColor: 'bg-orange-500' };
    case 'medium':
      return { label: 'Medium', dotColor: 'bg-amber-400' };
    default:
      return { label: 'Low', dotColor: 'bg-emerald-400' };
  }
}

function getCaseRankBadgeColor(impact: { dotColor: string }): string {
  if (impact.dotColor === 'bg-rose-500') return 'bg-rose-500';
  if (impact.dotColor === 'bg-orange-500') return 'bg-orange-500';
  if (impact.dotColor === 'bg-amber-400') return 'bg-amber-400';
  return 'bg-emerald-400';
}

function getCaseCta(caseItem: ResolutionCase): string {
  if (caseItem.status === 'in_progress') return 'Track Progress';
  switch (caseItem.kind) {
    case 'incident':
      return 'View Incident';
    case 'coverage_gap':
    case 'renewal':
      return 'Review Coverage';
    case 'repair_replace':
      return 'Review Decision';
    case 'maintenance':
      return 'Schedule Service';
    case 'health_insight':
      return 'Review Options';
    default:
      return 'Open Case';
  }
}

function getCaseWorkflowLabel(caseItem: ResolutionCase): string | null {
  const decisionIds = Array.isArray(caseItem.metadata?.relatedDecisionInsightIds)
    ? caseItem.metadata?.relatedDecisionInsightIds
    : [];
  const executionIds = Array.isArray(caseItem.metadata?.relatedExecutionItemIds)
    ? caseItem.metadata?.relatedExecutionItemIds
    : [];

  if (caseItem.status === 'in_progress' && executionIds.length > 0) {
    return executionIds.length === 1 ? '1 active booking linked' : `${executionIds.length} active bookings linked`;
  }
  if (caseItem.status === 'options_ready' && decisionIds.length > 0) {
    return decisionIds.length === 1 ? '1 recommendation ready' : `${decisionIds.length} recommendations ready`;
  }
  if (caseItem.status === 'needs_analysis') {
    return 'Analysis is the next step';
  }
  return null;
}

function isResumableJourney(journey: GuidanceJourneyDTO): boolean {
  return !['DISMISSED', 'COMPLETED', 'ABORTED', 'ARCHIVED'].includes(journey.status);
}

function compareJourneyPriority(a: GuidanceJourneyDTO, b: GuidanceJourneyDTO): number {
  const statusScore = (journey: GuidanceJourneyDTO) =>
    journey.status === 'ACTIVE' ? 2 : journey.steps?.some((step) => step.status === 'IN_PROGRESS') ? 1 : 0;
  const scoreDiff = statusScore(b) - statusScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  const currentOrderA = a.currentStepOrder ?? Number.MAX_SAFE_INTEGER;
  const currentOrderB = b.currentStepOrder ?? Number.MAX_SAFE_INTEGER;
  if (currentOrderA !== currentOrderB) return currentOrderA - currentOrderB;

  const updatedAtA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const updatedAtB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  return updatedAtB - updatedAtA;
}

function buildGuidanceOverviewHref(propertyId: string, journey: GuidanceJourneyDTO): string {
  const params = new URLSearchParams();
  params.set('journeyId', journey.id);
  params.set('guidanceJourneyId', journey.id);

  if (journey.currentStepKey) {
    params.set('stepKey', journey.currentStepKey);
    params.set('guidanceStepKey', journey.currentStepKey);
  }

  if (journey.inventoryItemId) {
    params.set('scopeCategory', 'ITEM');
    params.set('itemId', journey.inventoryItemId);
    params.set('inventoryItemId', journey.inventoryItemId);
  } else if (journey.homeAssetId) {
    params.set('scopeCategory', 'ASSET');
    params.set('homeAssetId', journey.homeAssetId);
  } else {
    params.set('scopeCategory', 'PROPERTY');
  }

  if (journey.issueType) params.set('issueType', journey.issueType);

  return `/dashboard/properties/${propertyId}/tools/guidance-overview?${params.toString()}`;
}

export default function ResolutionHubPage() {
  const params = useParams<{ id: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [urgentActions, setUrgentActions] = useState<UrgentActionItem[]>([]);
  const [resolutionCenterData, setResolutionCenterData] = useState<ResolutionCenterPayload>({
    urgentActions: [],
    cases: [],
    decisionInsights: [],
    executionItems: [],
    counts: {
      openCases: 0,
      decisionsReady: 0,
      activeBookings: 0,
      activeIncidents: 0,
    },
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  const filterParam = searchParams.get('filter');
  const focusSection = searchParams.get('focus');
  const expectedCount = searchParams.get('expectedCount');
  const rolloutOverride = searchParams.get('rcv2');
  const resolutionCenterV2Enabled =
    rolloutOverride === '1'
      ? true
      : rolloutOverride === '0'
        ? false
        : process.env.NEXT_PUBLIC_RESOLUTION_CENTER_V2 !== '0';
  const guidance = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resolutionCenterRes = propertyId
        ? await api.getPropertyResolutionCenter(propertyId)
        : { success: true as const, data: null };

      if (!resolutionCenterRes.success) {
        setUrgentActions([]);
        setResolutionCenterData({
          urgentActions: [],
          cases: [],
          decisionInsights: [],
          executionItems: [],
          counts: {
            openCases: 0,
            decisionsReady: 0,
            activeBookings: 0,
            activeIncidents: 0,
          },
        });
        setLoadError('We could not load Fix data right now. Please try again.');
        return;
      }

      const payload = resolutionCenterRes.data;
      if (!payload) {
        setUrgentActions([]);
        setResolutionCenterData({
          urgentActions: [],
          cases: [],
          decisionInsights: [],
          executionItems: [],
          counts: {
            openCases: 0,
            decisionsReady: 0,
            activeBookings: 0,
            activeIncidents: 0,
          },
        });
        setLoadError('We could not load Fix data right now. Please try again.');
        return;
      }

      setUrgentActions(payload.urgentActions);
      setResolutionCenterData(payload);
      setLoadError(null);
    } catch (error) {
      console.error('Failed to load resolution data:', error);
      setLoadError('We could not load Fix data right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredActions = useMemo(
    () => filterResolutionActions(urgentActions, filterParam),
    [urgentActions, filterParam],
  );
  const filteredCases = useMemo(
    () => filterResolutionCases(resolutionCenterData.cases, filterParam),
    [resolutionCenterData.cases, filterParam],
  );
  const displayedOpenCaseCount = resolutionCenterV2Enabled
    ? filteredCases.length
    : filteredActions.length;
  const priorityActionCount = filterParam
    ? displayedOpenCaseCount
    : resolutionCenterV2Enabled
      ? resolutionCenterData.counts.openCases
      : urgentActions.length;

  const countMismatch = useMemo(() => {
    if (!expectedCount) return null;
    const expected = parseInt(expectedCount);
    if (isNaN(expected)) return null;
    if (displayedOpenCaseCount !== expected) {
      return { expected, actual: displayedOpenCaseCount };
    }
    return null;
  }, [displayedOpenCaseCount, expectedCount]);

  const activeJourneyByItemId = useMemo(() => {
    const map = new Map<string, GuidanceJourneyDTO>();
    for (const journey of guidance.journeys) {
      if (!journey.inventoryItemId || !isResumableJourney(journey)) continue;
      const existing = map.get(journey.inventoryItemId);
      if (!existing || compareJourneyPriority(journey, existing) < 0) {
        map.set(journey.inventoryItemId, journey);
      }
    }
    return map;
  }, [guidance.journeys]);

  const resolveDecisionInsightHref = useCallback((kind: string, href: string, itemId?: string) => {
    if (kind !== 'repair_replace' || !propertyId || !itemId) return href;
    const journey = activeJourneyByItemId.get(itemId);
    return journey ? buildGuidanceOverviewHref(propertyId, journey) : href;
  }, [activeJourneyByItemId, propertyId]);

  return (
    <ErrorBoundary
      fallback={
        <div className="mx-auto max-w-7xl p-6 text-center py-20">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <Wrench className="h-8 w-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Resolution Hub Standby</h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-500">
            We&apos;re reconnecting with our service provider network. Please refresh in a few moments.
          </p>
          <Button
            className="mt-8 h-11 rounded-xl bg-brand-600 px-8"
            onClick={() => window.location.reload()}
          >
            Refresh Hub
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:px-8 lg:pb-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-teal-100 bg-teal-50 shadow-sm">
              <Wrench className="h-7 w-7 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Resolution Center</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Something broken or need an upgrade? We&apos;ll help with deciding, finding, and booking.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="hidden shrink-0 items-center gap-2 rounded-xl border-slate-200 h-10 px-4 text-sm font-medium text-slate-600 sm:flex"
          >
            <Settings className="h-4 w-4" />
            Fix Settings
          </Button>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="#priority-actions"
            className="group flex items-center gap-3 rounded-xl border border-amber-100/70 bg-amber-50/40 p-4 transition-colors hover:border-amber-200 hover:bg-amber-50/60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80">
              <Clock className="h-4.5 w-4.5 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold leading-none text-slate-900">{priorityActionCount}</p>
                <p className="text-sm font-medium text-slate-600">Open cases</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Ranked items that still need attention</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </Link>

          <Link
            href="#decision-insights"
            className="group flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100/70">
              <Search className="h-4.5 w-4.5 text-indigo-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold leading-none text-slate-900">{resolutionCenterData.counts.decisionsReady}</p>
                <p className="text-sm font-medium text-slate-600">Decisions ready</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Recommendations waiting for a choice</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </Link>

          <Link
            href={propertyId ? `/dashboard/bookings?propertyId=${propertyId}` : '/dashboard/bookings'}
            className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 transition-colors hover:border-teal-100 hover:bg-slate-50/70"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100/70">
              <Briefcase className="h-4.5 w-4.5 text-teal-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold leading-none text-slate-900">{resolutionCenterData.counts.activeBookings}</p>
                <p className="text-sm font-medium text-slate-600">Active Jobs</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Cases already moving through execution</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </Link>

          <Link
            href={propertyId ? `/dashboard/properties/${propertyId}/incidents` : '/dashboard/incidents'}
            className={cn(
              'group flex items-center gap-3 rounded-xl border p-4 transition-colors',
              resolutionCenterData.counts.activeIncidents > 0
                ? 'border-rose-100/70 bg-rose-50/30 hover:border-rose-200'
                : 'border-slate-100 bg-white hover:border-blue-100 hover:bg-slate-50/70',
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                resolutionCenterData.counts.activeIncidents > 0
                  ? 'bg-rose-100/80'
                  : 'bg-blue-100/70',
              )}
            >
              <Radio
                className={cn(
                  'h-4.5 w-4.5',
                  resolutionCenterData.counts.activeIncidents > 0 ? 'text-rose-700' : 'text-blue-600',
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold leading-none text-slate-900">{resolutionCenterData.counts.activeIncidents}</p>
                <p className="text-sm font-medium text-slate-600">Live incidents</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {resolutionCenterData.counts.activeIncidents > 0 ? 'Signal-driven issues' : 'No active incident'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </Link>
        </div>

        {/* Quick Help Tools — sits above Priority Actions so high-frequency entry points
            are reachable without scrolling past reactive content */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href={
              propertyId
                ? `/dashboard/properties/${propertyId}/inventory?intent=replace-repair`
                : '/dashboard/replace-repair'
            }
            className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 transition-colors hover:border-teal-100 hover:bg-teal-50/20"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100/70">
              <Zap className="h-4 w-4 text-teal-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900">Something&apos;s Broken</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">Troubleshoot repair vs. replace</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-teal-600" />
          </Link>

          <Link
            href={propertyId ? `/dashboard/providers?propertyId=${propertyId}` : '/dashboard/providers'}
            className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 transition-colors hover:border-blue-100 hover:bg-blue-50/20"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100/70">
              <Search className="h-4 w-4 text-blue-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900">Find a Specialist</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">Browse verified service pros</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </Link>

          <Link
            href={propertyId ? `/dashboard/emergency?propertyId=${propertyId}` : '/dashboard/emergency'}
            className="group flex items-center gap-3 rounded-xl border border-red-100/60 bg-white px-3.5 py-3 transition-colors hover:border-red-200 hover:bg-red-50/15"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100/70">
              <AlertCircle className="h-4 w-4 text-red-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900">Emergency Help</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">24/7 urgent response guides</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-red-600" />
          </Link>

          <Link
            href={
              propertyId
                ? `/dashboard/properties/${propertyId}/tools/quote-comparison?from=fix-hub`
                : '/dashboard/quote-comparison'
            }
            className="group flex items-center gap-3 rounded-xl border border-violet-100/60 bg-white px-3.5 py-3 transition-colors hover:border-violet-200 hover:bg-violet-50/15"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100/70">
              <Scale className="h-4 w-4 text-violet-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900">Compare Quotes</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">Review pricing side by side</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-600" />
          </Link>
        </div>

        {/* Open Cases / Legacy Priority Actions */}
        <div
          id="priority-actions"
          className={cn(
            'overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm',
            focusSection === 'priority-actions' && 'scroll-mt-24',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-50 px-6 py-5">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-semibold text-slate-900">
                  {resolutionCenterV2Enabled ? 'Open Cases' : 'Priority Actions'}
                </h2>
                {priorityActionCount > 0 && (
                  <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-white">
                    {priorityActionCount}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {filterParam
                  ? `Filtered to ${filterParam} ${resolutionCenterV2Enabled ? 'cases' : 'actions'}${expectedCount ? ` (expecting ${expectedCount})` : ''}`
                  : resolutionCenterV2Enabled
                    ? 'Each case is connected to the next workflow: analyze, decide, or execute.'
                    : 'These are the ranked items behind the dashboard count.'}
              </p>
            </div>
            <Link
              href={propertyId ? `/dashboard/properties/${propertyId}/fix` : '/dashboard/actions'}
              className="mt-0.5 flex shrink-0 items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-teal-600"
            >
              View all actions
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {countMismatch && (
            <div
              className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
              data-testid="count-mismatch-warning"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h4 className="font-medium text-amber-900">Count Mismatch</h4>
                  <p className="mt-1 text-sm text-amber-700">
                    Expected {countMismatch.expected} {filterParam || 'priority'}{' '}
                    {countMismatch.expected === 1 ? 'action' : 'actions'} but found {countMismatch.actual}.
                    {countMismatch.actual === 0 &&
                      ' The items may have been resolved or the data may have refreshed.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          ) : filteredCases.length > 0 ? (
            resolutionCenterV2Enabled ? (
              <div className="divide-y divide-slate-50">
                {filteredCases.slice(0, 10).map((caseItem, index) => {
                  const impact = getCaseImpact(caseItem);
                  const status = getCaseStatus(caseItem);
                  const rankColor = getCaseRankBadgeColor(impact);
                  const workflowLabel = getCaseWorkflowLabel(caseItem);
                  const badge = caseItem.badges?.[0];

                  return (
                    <div
                      key={caseItem.id}
                      className={cn(
                        'flex items-center gap-4 px-6 py-5 transition-colors hover:bg-slate-50/60',
                        focusSection === 'priority-actions' && 'bg-teal-50/20',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                          rankColor,
                        )}
                      >
                        {index + 1}
                      </div>

                      <div
                        className={cn(
                          'hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                          getCaseIconBg(caseItem),
                        )}
                      >
                        {getCaseIcon(caseItem)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-slate-900">{caseItem.title}</span>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              status.tone === 'danger'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : status.tone === 'warning'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : status.tone === 'positive'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600',
                            )}
                          >
                            {status.label}
                          </span>
                          {badge && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-500">
                              {badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-500">{caseItem.summary}</p>
                        {workflowLabel && (
                          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                            {workflowLabel}
                          </p>
                        )}
                      </div>

                      <div className="hidden shrink-0 text-right lg:block">
                        <p className="mb-1 text-xs text-slate-400">Priority</p>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={cn('h-1.5 w-1.5 rounded-full', impact.dotColor)} />
                          <span className="text-sm font-medium text-slate-700">{impact.label}</span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden shrink-0 items-center gap-1 rounded-xl border-slate-200 text-slate-700 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 sm:flex"
                        onClick={() => router.push(caseItem.href)}
                      >
                        {getCaseCta(caseItem)}
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      <button
                        className="flex shrink-0 items-center sm:hidden"
                        onClick={() => router.push(caseItem.href)}
                      >
                        <ChevronRight className="h-5 w-5 text-slate-300" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredActions.slice(0, 10).map((action, index) => {
                  const impact = getImpactLevel(action);
                  const status = getActionStatus(action);
                  const rankColor = getRankBadgeColor(impact);
                  const description = formatActionDescription(action);
                  return (
                    <div
                      key={action.id}
                      className={cn(
                        'flex items-center gap-4 px-6 py-5 transition-colors hover:bg-slate-50/60',
                        focusSection === 'priority-actions' && 'bg-teal-50/20',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                          rankColor,
                        )}
                      >
                        {index + 1}
                      </div>

                      <div
                        className={cn(
                          'hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
                          getActionIconBg(action),
                        )}
                      >
                        {getActionIcon(action)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold text-slate-900">{action.title}</span>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              status.tone === 'danger'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : status.tone === 'warning'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600',
                            )}
                          >
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-500">{description}</p>
                      </div>

                      <div className="hidden shrink-0 text-right lg:block">
                        <p className="mb-1 text-xs text-slate-400">Impact</p>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={cn('h-1.5 w-1.5 rounded-full', impact.dotColor)} />
                          <span className="text-sm font-medium text-slate-700">{impact.label}</span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden shrink-0 items-center gap-1 rounded-xl border-slate-200 text-slate-700 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 sm:flex"
                        onClick={() =>
                          router.push(
                            resolveUrgentActionHref(action, propertyId || undefined),
                          )
                        }
                      >
                        {getActionCta(action)}
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      <button
                        className="flex shrink-0 items-center sm:hidden"
                        onClick={() =>
                          router.push(
                            resolveUrgentActionHref(action, propertyId || undefined),
                          )
                        }
                      >
                        <ChevronRight className="h-5 w-5 text-slate-300" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : filterParam ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 shadow-sm">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">
                No {filterParam} {resolutionCenterV2Enabled ? 'Cases' : 'Actions'}
              </h4>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                No {filterParam.toLowerCase()} {resolutionCenterV2Enabled ? 'cases' : 'actions'} found for this property.
                Try viewing all {resolutionCenterV2Enabled ? 'cases' : 'actions'} or check back later.
              </p>
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 shadow-sm">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">
                {resolutionCenterV2Enabled ? 'No Open Cases' : 'No Priority Actions'}
              </h4>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                {resolutionCenterV2Enabled
                  ? 'Your home has no open cases right now.'
                  : 'Your home has no urgent repair items right now.'}
              </p>
            </div>
          )}
        </div>

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
            <p className="text-sm font-semibold text-red-700">Some Fix data is unavailable.</p>
            <p className="mt-1 text-sm text-red-700/90">{loadError}</p>
            <Button
              variant="outline"
              className="mt-3 border-red-200 bg-white text-red-700 hover:bg-red-50"
              onClick={() => void fetchData()}
            >
              Retry loading
            </Button>
          </div>
        )}

        {/* Dual Content Panels */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

          {/* Intelligence & Decisions — shows "Your Home is Healthy" only when both
              recommendations AND open cases are empty; avoids the contradiction of
              showing a healthy state alongside unresolved work. */}
          <div id="decision-insights" className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm scroll-mt-24">
            <div className="border-b border-slate-50 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Intelligence & Decisions</h2>
              <p className="mt-1 text-sm text-slate-500">
                Decision support for cases that already have recommendations ready.
              </p>
            </div>
            <div className="space-y-4 p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-slate-400" />
                </div>
              ) : resolutionCenterData.decisionInsights.length > 0 ? (
                resolutionCenterData.decisionInsights.map((insight) => (
                  <WinCard
                    key={insight.id}
                    title={insight.title}
                    value={insight.subject}
                    description={insight.summary}
                    actionLabel={
                      insight.kind === 'coverage_recommendation' ? 'Review Coverage' : 'See Full Estimate'
                    }
                    onAction={() => {
                      router.push(resolveDecisionInsightHref(insight.kind, insight.href, insight.itemId));
                    }}
                    trust={insight.trust}
                  />
                ))
              ) : filteredCases.length > 0 ? (
                // Priority actions exist — avoid contradicting them with a "healthy" message
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 shadow-sm">
                    <Clock className="h-8 w-8 text-amber-500" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Open Cases Above</h4>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                    Your open cases are tracked above. Decision support appears here once a case has
                    coverage analysis, repair guidance, or another recommendation ready.
                  </p>
                  <div className="pt-6">
                    <Button variant="outline" className="h-11 rounded-xl border-slate-200 px-6" asChild>
                      <Link
                        href={
                          propertyId
                            ? `/dashboard/properties/${propertyId}/inventory?intent=replace-repair`
                            : '/dashboard/replace-repair'
                        }
                      >
                        <Zap className="mr-2 h-4 w-4 text-teal-600" />
                        Start Troubleshooter
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                // Truly healthy — no priority actions and no resolutions
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 shadow-sm">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Your Home is Healthy</h4>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                    No active issues detected. Use the troubleshooter if something feels off, or run a
                    seasonal scan.
                  </p>
                  <div className="pt-6">
                    <Button variant="outline" className="h-11 rounded-xl border-slate-200 px-6" asChild>
                      <Link
                        href={
                          propertyId
                            ? `/dashboard/properties/${propertyId}/inventory?intent=replace-repair`
                            : '/dashboard/replace-repair'
                        }
                      >
                        <Zap className="mr-2 h-4 w-4 text-teal-600" />
                        Start Troubleshooter
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Jobs & Bookings */}
          <div id="execution" className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm scroll-mt-24">
            <div className="border-b border-slate-50 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Active Jobs & Bookings</h2>
              <p className="mt-1 text-sm text-slate-500">Cases already moving through booking and service execution.</p>
            </div>
            <div className="space-y-4 p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-slate-400" />
                </div>
              ) : resolutionCenterData.executionItems.length > 0 ? (
                resolutionCenterData.executionItems.map((executionItem) => (
                  <div
                    key={executionItem.id}
                    className="rounded-xl border border-slate-100 border-l-4 border-l-teal-500 p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900">{executionItem.title}</h4>
                        <p className="text-xs text-slate-500">{executionItem.subtitle}</p>
                      </div>
                      <div className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold tracking-normal text-teal-700">
                        {executionItem.statusLabel}
                      </div>
                    </div>
                    <div className="mb-4 flex items-center gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <CalendarClock className="h-4 w-4 text-slate-400" />
                        {executionItem.scheduledLabel || 'TBD'}
                      </div>
                      <div className="font-medium text-slate-900">{executionItem.priceLabel}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-full justify-between rounded-lg text-teal-700 hover:bg-teal-50/50"
                      asChild
                    >
                      <Link href={executionItem.href}>
                        View Resolution Details
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 shadow-sm">
                    <Search className="h-8 w-8 text-slate-300" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">No Active Jobs</h4>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
                    Need a specialist for a project? Browse our directory of verified pros to get started.
                  </p>
                  <div className="pt-6">
                    <Button
                      className="h-11 rounded-xl bg-brand-600 px-6 font-bold text-white hover:bg-brand-700"
                      asChild
                    >
                      <Link
                        href={
                          propertyId
                            ? `/dashboard/providers?propertyId=${propertyId}`
                            : '/dashboard/providers'
                        }
                      >
                        Find a Service Provider
                      </Link>
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" className="h-11 w-full rounded-xl border-slate-200 text-slate-600" asChild>
                <Link
                  href={
                    propertyId ? `/dashboard/bookings?propertyId=${propertyId}` : '/dashboard/bookings'
                  }
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  View All Booking History
                </Link>
              </Button>
            </div>
          </div>

        </div>

        <BottomSafeAreaReserve size="chatAware" />
      </div>
    </ErrorBoundary>
  );
}
