// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import {
  ArrowRight,
  Clock3,
  Database,
  Gauge,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { Booking, ChecklistItem, Warranty, InsurancePolicy, LocalUpdate } from '@/types'; 
import { ScoredProperty } from './types'; 
import { differenceInDays, isPast, parseISO } from 'date-fns';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';
import { WelcomeSection } from '@/components/WelcomeSection';
import { RoomsSnapshotSection } from './components/RoomsSnapshotSection';
import { motion, useReducedMotion } from 'framer-motion';
import MobileDashboardHome from './components/MobileDashboardHome';
import { useCelebration } from '@/hooks/useCelebration';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { useQuery } from '@tanstack/react-query';
import SupportingActionCard from './components/SupportingActionCard';
import DashboardRouteState from './components/DashboardRouteState';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { Button } from '@/components/ui/button';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import { track } from '@/lib/analytics/events';

import { listIncidents } from './properties/[id]/incidents/incidentsApi';
import { listInventoryItems } from './inventory/inventoryApi';
import { IncidentDTO } from '@/types/incidents.types';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 
function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// --- START PHASE 1: DATA CONSOLIDATION TYPES ---

export interface UrgentActionItem {
    id: string;
    type: 'MAINTENANCE_OVERDUE' | 'MAINTENANCE_UNSCHEDULED' | 'RENEWAL_EXPIRED' | 'RENEWAL_UPCOMING' | 'HEALTH_INSIGHT' | 'INCIDENT';
    title: string;
    description: string;
    dueDate?: Date;
    daysUntilDue?: number;
    propertyId: string;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}

interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[];
    checklist: { id: string, items: ChecklistItem[] } | null; 
    urgentActions: UrgentActionItem[];
    inventoryCount: number;
    activeIncidents: IncidentDTO[];
    isLoading: boolean;
    error: string | null;
}

// Helper to consolidate data into a single, actionable list
const consolidateUrgentActions = (
    properties: ScoredProperty[],
    checklistItems: ChecklistItem[],
    warranties: Warranty[],
    insurancePolicies: InsurancePolicy[],
    incidents: IncidentDTO[]
): UrgentActionItem[] => {
    const actions: UrgentActionItem[] = [];
    const today = new Date();
    const ninetyDays = 90;

    // 1. Process Active Incidents (Highest Priority)
    incidents.filter(inc => inc.status !== 'RESOLVED' && inc.status !== 'SUPPRESSED').forEach(inc => {
        actions.push({
            id: inc.id,
            type: 'INCIDENT',
            title: inc.title,
            description: inc.summary || 'Critical home event detected.',
            propertyId: inc.propertyId,
            severity: inc.severity || 'WARNING',
        });
    });

    // 2. Process Health Score Insights (Critical items only)
    const CRITICAL_INSIGHT_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];
    
    properties.forEach(p => {
        p.healthScore?.insights
            .filter(i => CRITICAL_INSIGHT_STATUSES.includes(i.status))
            .forEach((i, index) => {
                actions.push({
                    id: `${p.id}-INSIGHT-${index}`,
                    type: 'HEALTH_INSIGHT',
                    title: i.factor,
                    description: `Status: ${i.status}. Requires resolution.`,
                    propertyId: p.id,
                });
            });
    });
    
    // 3. Process Maintenance Checklist (Overdue/Unscheduled Tasks)
    checklistItems.forEach(item => {
        // Skip completed or cancelled items
        if (item.status === 'COMPLETED' || item.status === 'NOT_NEEDED') return;
        
        // Check for Overdue
        if (item.nextDueDate && isPast(parseISO(item.nextDueDate))) {
            const dueDate = parseISO(item.nextDueDate);
            actions.push({
                id: item.id,
                type: 'MAINTENANCE_OVERDUE',
                title: `OVERDUE: ${item.title}`,
                description: item.description || `Overdue by ${differenceInDays(today, dueDate)} days.`,
                dueDate,
                daysUntilDue: differenceInDays(dueDate, today),
                propertyId: item.propertyId || 'N/A',
            });
        }
    });

    // 4. Process Renewals (Expired/Upcoming Warranties and Insurance)
    const renewals: (Warranty | InsurancePolicy)[] = [...warranties, ...insurancePolicies];
    
    renewals.forEach(item => {
        if (!item.expiryDate) return;
        
        const dueDate = parseISO(item.expiryDate);
        const days = differenceInDays(dueDate, today);
        const itemType = ('providerName' in item) ? 'Warranty' : 'Insurance';
        const title = `${itemType} Renewal: ${'providerName' in item ? item.providerName : item.carrierName}`;

        if (isPast(dueDate)) {
            // Expired (Critical)
            actions.push({
                id: item.id,
                type: 'RENEWAL_EXPIRED',
                title: `EXPIRED: ${title}`,
                description: `Policy expired ${Math.abs(days)} days ago. Immediate action required.`,
                dueDate,
                daysUntilDue: days,
                propertyId: item.propertyId || 'N/A',
            });
        } else if (days <= ninetyDays) {
            // Upcoming (Warning)
            actions.push({
                id: item.id,
                type: 'RENEWAL_UPCOMING',
                title: `UPCOMING: ${title}`,
                description: `Expires in ${days} days.`,
                dueDate,
                daysUntilDue: days,
                propertyId: item.propertyId || 'N/A',
            });
        }
    });

    // Sort: Incidents (Highest Priority) > Health > Urgent maintenance > Urgency (daysUntilDue)
    return actions.sort((a, b) => {
        if (a.type === 'INCIDENT' && b.type !== 'INCIDENT') return -1;
        if (b.type === 'INCIDENT' && a.type !== 'INCIDENT') return 1;
        if (a.daysUntilDue === undefined) return 1;
        if (b.daysUntilDue === undefined) return -1;
        return a.daysUntilDue - b.daysUntilDue;
    });
};

function resolveUrgentActionHref(action: UrgentActionItem, propertyId?: string): string {
  const fallbackPropertyId = propertyId || undefined;
  const actionPropertyId =
    action.propertyId && action.propertyId !== 'N/A' ? action.propertyId : fallbackPropertyId;

  const propertyQuery = actionPropertyId ? `?propertyId=${encodeURIComponent(actionPropertyId)}` : '';

  if (action.type === 'INCIDENT') {
    return `/dashboard/properties/${actionPropertyId}/incidents/${action.id}`;
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/maintenance${propertyQuery ? `${propertyQuery}&filter=overdue` : '?filter=overdue'}`;
  }
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    return `/dashboard/insurance${propertyQuery}`;
  }
  if (actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}`;
  }
  return '/dashboard/actions';
}

function urgentActionCtaLabel(action?: UrgentActionItem, isReturningVisitor = true): string {
  if (!action) return isReturningVisitor ? 'Take Priority Move' : 'Start First 2-Min Move';
  if (action.type === 'INCIDENT') return 'Review Incident';
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Resolve Overdue Item';
  if (action.type === 'RENEWAL_EXPIRED') return 'Restore Coverage Now';
  if (action.type === 'RENEWAL_UPCOMING') return 'Lock Renewal Savings';
  return 'Run 2-Minute Risk Check';
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [localUpdates] = useState<LocalUpdate[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    urgentActions: [], 
    inventoryCount: 0,
    activeIncidents: [],
    isLoading: true,
    error: null,
  });
  
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const { celebration, dismiss } = useCelebration(
    `dashboard-aha-${user?.id ?? 'anon'}-${selectedPropertyId ?? 'none'}`
  );
  const properties = data.properties;
  const effectiveSelectedPropertyId =
    selectedPropertyId && properties.some((property) => property.id === selectedPropertyId)
      ? selectedPropertyId
      : properties[0]?.id;

  const scoreSnapshotQuery = useQuery({
    queryKey: ['property-score-snapshot', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      return api.getPropertyScoreSnapshots(effectiveSelectedPropertyId, 16);
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 10 * 60 * 1000,
  });

  const riskSummaryQuery = useQuery({
    queryKey: ['risk-report-summary', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      const report = await api.getRiskReportSummary(effectiveSelectedPropertyId);
      return typeof report === 'string' ? null : report;
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
  });

  const seasonalChecklistQuery = useQuery({
    queryKey: ['seasonal-checklist', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      return seasonalAPI.getCurrentChecklist(effectiveSelectedPropertyId);
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const homeSavingsSummaryQuery = useQuery({
    queryKey: ['home-savings-summary', effectiveSelectedPropertyId],
    queryFn: async () => {
      if (!effectiveSelectedPropertyId) return null;
      try {
        return await getHomeSavingsSummary(effectiveSelectedPropertyId);
      } catch {
        return null;
      }
    },
    enabled: Boolean(effectiveSelectedPropertyId),
    staleTime: 5 * 60 * 1000,
  });

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    setData(prev => ({ ...prev, isLoading: true }));
    setRedirectChecked(false);
    
    try {
      const propertiesRes = await api.getProperties();
      const properties = propertiesRes.success ? propertiesRes.data.properties : [];
      const propId = selectedPropertyId || properties[0]?.id;

      const [bookingsRes, checklistRes, warrantiesRes, policiesRes, incidentsRes, inventoryRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getChecklist().then(res => (res.success && res.data ? { success: true, data: res.data } : { success: false, data: null })).catch(() => ({ success: false, data: null })),
        api.listWarranties(),
        api.listInsurancePolicies(),
        propId ? listIncidents({ propertyId: propId, limit: 10 }) : Promise.resolve({ items: [] }),
        propId ? listInventoryItems(propId, {}) : Promise.resolve([]),
      ]);
  
      const bookings = bookingsRes.success ? bookingsRes.data.bookings : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
      const activeIncidents = (incidentsRes as any).items || [];
      const inventoryItems = inventoryRes || [];
  
      const scoredProperties = properties.map(p => ({
        ...p,
        healthScore: (p as unknown as ScoredProperty).healthScore || {
          totalScore: 0,
          insights: [],
        },
      })) as ScoredProperty[];
  
      const urgentActions = consolidateUrgentActions(
        scoredProperties,
        checklist?.items || [],
        warranties,
        policies,
        activeIncidents
      );
  
      setData({
        bookings,
        properties: scoredProperties,
        checklist,
        urgentActions,
        inventoryCount: inventoryItems.length,
        activeIncidents,
        isLoading: false,
        error: null,
      });

      if (typeof window !== 'undefined') {
        const skipped = window.localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
        setShowWelcomeScreen(scoredProperties.length === 0 && !skipped);
      }
  
    } catch (error) {
      console.error('❌ Dashboard: Error fetching data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: 'Failed to load dashboard data' }));
    } finally {
      setRedirectChecked(true);
    }
  }, [user, selectedPropertyId]);
  
  const hasTrackedFirstView = React.useRef(false);
  useEffect(() => {
    if (!userLoading && user && effectiveSelectedPropertyId && !hasTrackedFirstView.current) {
      hasTrackedFirstView.current = true;
      track('dashboard_first_view', { propertyId: effectiveSelectedPropertyId });
    }
  }, [userLoading, user, effectiveSelectedPropertyId]);

  useEffect(() => {
    if (!userLoading && user) {
      fetchDashboardData();
    }
  }, [userLoading, user, fetchDashboardData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  const safeFirstName = user?.firstName || 'there';
  const selectedProperty = properties.find(p => p.id === effectiveSelectedPropertyId); 
  const scopedUrgentActions = data.urgentActions.filter(
    (action) => action.propertyId === effectiveSelectedPropertyId
  );
  const primaryUrgentAction = scopedUrgentActions[0] || data.urgentActions[0];

  const annualSavingsPotential = Math.max(0, Math.round(homeSavingsSummaryQuery.data?.potentialAnnualSavings ?? 0));
  const riskExposureGap = Math.max(0, Math.round(riskSummaryQuery.data?.financialExposureTotal ?? 0));
  const overdueMaintenanceCount = scopedUrgentActions.filter(a => a.type === 'MAINTENANCE_OVERDUE').length;

  const heroNarrative = (() => {
    // 1. Open Urgent Incident
    const highSeverityIncident = data.activeIncidents.find(inc => inc.severity === 'CRITICAL' || inc.severity === 'WARNING');
    if (highSeverityIncident) {
      return {
        title: `Priority Alert: ${highSeverityIncident.title}`,
        subtitle: highSeverityIncident.summary || 'A critical home event requires your review to prevent escalation.',
        ctaLabel: 'Review Incident',
        impactLabel: 'Active Home Risk',
        etaLabel: 'ETA 2 min',
      };
    }

    // 2. Savings > $200
    if (annualSavingsPotential >= 200) {
      return {
        title: `We found ${formatUsd(annualSavingsPotential)} in potential annual savings.`,
        subtitle: 'Our intelligence engine identified recurring costs that could be lowered today.',
        ctaLabel: 'See your savings',
        impactLabel: `${formatUsd(annualSavingsPotential)}/yr potential`,
        etaLabel: 'ETA 3 min',
      };
    }

    // 3. Vault Onboarding (Empty state: < 3 items)
    if (data.inventoryCount < 3) {
      return {
        title: 'Start building your Home Vault for full intelligence.',
        subtitle: 'Adding your first 3 appliances unlocks personalized risk and maintenance tracking.',
        ctaLabel: 'Add your first item',
        impactLabel: 'Unlock intelligence',
        etaLabel: 'ETA 90 sec',
      };
    }

    // 4. Maintenance Overdue
    if (overdueMaintenanceCount > 0) {
      return {
        title: `${overdueMaintenanceCount} maintenance task${overdueMaintenanceCount === 1 ? '' : 's'} need attention.`,
        subtitle: 'Resolving these items now prevents a more expensive repair bill later.',
        ctaLabel: 'Fix overdue tasks',
        impactLabel: 'Preventative win',
        etaLabel: 'ETA 2 min',
      };
    }

    // 5. Default: Home Health
    return {
      title: `Welcome back, ${safeFirstName}. Your home status is updated.`,
      subtitle: 'We’ve analyzed 12+ signals today to rank your highest-impact moves.',
      ctaLabel: 'Review health',
      impactLabel: 'HomeScore up to date',
      etaLabel: 'ETA 1 min',
    };
  })();

  const ahaCtaHref = primaryUrgentAction
    ? resolveUrgentActionHref(primaryUrgentAction, effectiveSelectedPropertyId)
    : buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/vault');

  const homeHealthScore = Math.max(0, Math.round(selectedProperty?.healthScore?.totalScore ?? 0));
  const riskScore = Math.max(0, Math.round(riskSummaryQuery.data?.riskScore ?? 0));
  const confidencePercent = Math.max(72, Math.min(98, riskScore > 0 ? riskScore : 90));
  const trustSignals = [
    { label: 'Confidence', value: `${confidencePercent}% confidence`, icon: ShieldCheck },
    { label: 'Freshness', value: 'Updated moments ago', icon: Clock3 },
    { label: 'Source', value: 'Home details + coverage & risk status', icon: Database },
  ];
  const opportunitySourceCount = [
    annualSavingsPotential > 0,
    overdueMaintenanceCount > 0,
    riskExposureGap > 0,
    data.activeIncidents.length > 0,
  ].filter(Boolean).length;
  const recommendationReason =
    primaryUrgentAction?.description ||
    `Ranked from ${Math.max(3, opportunitySourceCount + 1)} home signals to maximize value this week.`;
  const seasonalTasksRemaining = Math.max(
    0,
    Number((seasonalChecklistQuery.data as any)?.checklist?.totalTasks ?? 0) -
      Number((seasonalChecklistQuery.data as any)?.checklist?.tasksCompleted ?? 0)
  );
  const nextStepLabel = urgentActionCtaLabel(primaryUrgentAction, true);
  const riskTrendDelta = (scoreSnapshotQuery.data as any)?.scores?.RISK?.deltaFromPreviousWeek;
  const scoreDeltaLabel =
    typeof riskTrendDelta === 'number'
      ? `${riskTrendDelta > 0 ? '+' : ''}${riskTrendDelta.toFixed(1)} this week`
      : 'Monitoring weekly score trend';
  const motionVariants = prefersReducedMotion
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };
  const motionTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' as const };

  if (userLoading || data.isLoading || !redirectChecked) {
    return <DashboardRouteState state="loading" title="Preparing your command center" description="Syncing your latest home intelligence..." />;
  }

  if (data.error) {
    return <DashboardRouteState state="error" title="Could not load dashboard" description={data.error} />;
  }

  if (showWelcomeScreen && user) return <WelcomeModal userFirstName={user.firstName} />;

  if (isMobileViewport) {
    return (
      <MobileDashboardHome
        userFirstName={safeFirstName}
        properties={properties}
        selectedPropertyId={effectiveSelectedPropertyId}
        onPropertyChange={setSelectedPropertyId}
        localUpdates={localUpdates}
      />
    );
  }

  return (
    <>
      {selectedProperty && properties.length > 0 && (
        <WelcomeSection
          userName={user?.firstName || 'there'}
          properties={properties}
          selectedPropertyId={effectiveSelectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
          compact
        />
      )}

      <div className="mx-auto w-full max-w-[1500px] px-4 md:px-8 xl:px-10">
        <div className="space-y-6 pb-8 md:space-y-7 md:pb-10">
          <motion.section
            initial="hidden"
            animate="visible"
            variants={motionVariants}
            transition={motionTransition}
            className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]"
          >
            <section className="relative overflow-hidden rounded-[28px] border border-white/75 bg-gradient-to-br from-teal-50/95 via-white to-emerald-50/60 p-6 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_35px_74px_-48px_rgba(15,23,42,0.5)] md:min-h-[236px] md:p-7">
              <div className="absolute inset-y-8 right-8 hidden w-40 rounded-full bg-teal-100/40 blur-3xl lg:block" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Command Center • Welcome Back
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                    Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {safeFirstName}.
                  </h1>
                  <p className="mt-2 text-base text-slate-600 md:text-lg">
                    Your home needs focus today.
                  </p>
                  <p className="mt-2 text-sm text-slate-500 md:text-base">
                    We found meaningful savings and protection opportunities based on your latest home signals.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-full border border-teal-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-teal-700">
                    Highest impact today • Based on {Math.max(3, opportunitySourceCount + 1)} signals
                  </div>
                  <Button
                    onClick={() => setIsScannerOpen(true)}
                    className="group h-13 rounded-2xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-[0_15px_30px_-18px_rgba(13,148,136,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_18px_32px_-16px_rgba(13,148,136,0.85)] active:scale-[0.99]"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Magic Scan
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_24px_48px_-40px_rgba(15,23,42,0.5)] backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Home Intelligence Pulse
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  <Sparkles className="h-3 w-3" />
                  Confidence High
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Home Health</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{homeHealthScore}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Risk Score</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{riskScore}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Savings Potential</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{formatUsd(annualSavingsPotential)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">Seasonal Tasks</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                    {seasonalTasksRemaining > 0 ? `${seasonalTasksRemaining} open` : 'On track'}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                    Recommended Next Step
                  </p>
                  <Gauge className="h-4 w-4 text-teal-600" />
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{nextStepLabel}</p>
                <p className="mt-1 text-xs text-slate-600">{scoreDeltaLabel}</p>
              </div>
            </section>
          </motion.section>

          <motion.section
            initial="hidden"
            animate="visible"
            variants={motionVariants}
            transition={{ ...motionTransition, delay: prefersReducedMotion ? 0 : 0.04 }}
            className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,1fr)]"
          >
            <section className="group relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_28px_60px_-48px_rgba(15,23,42,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_32px_64px_-46px_rgba(15,23,42,0.64)] md:p-6">
              <span className="absolute bottom-6 left-0 top-6 w-1.5 rounded-r-full bg-gradient-to-b from-teal-300 via-teal-500 to-emerald-500" />
              <div className="pl-2 md:pl-3">
                <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  Highest Value Move
                </p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900 md:text-[2.1rem]">
                  {heroNarrative.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                  {heroNarrative.subtitle}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <Button
                    onClick={() => router.push(ahaCtaHref)}
                    className="group h-12 rounded-2xl bg-teal-600 px-6 text-sm font-semibold text-white shadow-[0_14px_28px_-18px_rgba(15,118,110,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-700"
                  >
                    {heroNarrative.ctaLabel || 'Review savings'}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {heroNarrative.impactLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {heroNarrative.etaLabel}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_22px_42px_-36px_rgba(15,23,42,0.5)]">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <p className="mb-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Trust Signals
                </p>
              </div>

              <div className="mt-3.5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {trustSignals.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <div key={tile.label} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2.5">
                      <p className="mb-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                        {tile.label}
                      </p>
                      <p className="mb-0 mt-1 text-xs font-medium text-slate-800">{tile.value}</p>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2.5 border-t border-slate-200/70 pt-2.5 text-xs leading-relaxed text-slate-600">
                Why this recommendation: {recommendationReason}
              </p>
            </section>
          </motion.section>

          <motion.section
            initial="hidden"
            animate="visible"
            variants={motionVariants}
            transition={{ ...motionTransition, delay: prefersReducedMotion ? 0 : 0.08 }}
            className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3"
          >
            <SupportingActionCard
              title={
                riskExposureGap > 0
                  ? `Close ${formatUsd(riskExposureGap)} of your biggest exposure gap`
                  : 'Protect your strongest coverage position'
              }
              detail="Review uncovered items and increase protected coverage where impact is highest."
              href={buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/protect')}
              impact={riskExposureGap > 0 ? 'Highest downside protection opportunity' : 'Direct downside protection'}
              actionLabel="Direct downside protection"
            />
            <SupportingActionCard
              title={
                annualSavingsPotential > 0
                  ? `Capture up to ${formatUsd(annualSavingsPotential)} in recurring savings`
                  : 'Run a recurring cost audit for immediate savings'
              }
              detail="Prioritize recurring cost optimizations with the largest near-term return."
              href={buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/save')}
              impact="Revenue-proof move"
              actionLabel="Review savings levers"
            />
            <SupportingActionCard
              title={
                overdueMaintenanceCount > 0
                  ? `Resolve ${overdueMaintenanceCount} overdue maintenance item${overdueMaintenanceCount > 1 ? 's' : ''}`
                  : `Strengthen your Home Vault with ${Math.max(0, 3 - data.inventoryCount)} more key items`
              }
              detail="Keep your home intelligence current so recommendations stay precise and actionable."
              href={buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/vault')}
              impact={data.inventoryCount < 3 ? 'Retention-proof data foundation' : 'Preventive resilience move'}
              actionLabel="Build confidence layer"
            />
          </motion.section>

          <motion.section
            initial="hidden"
            animate="visible"
            variants={motionVariants}
            transition={{ ...motionTransition, delay: prefersReducedMotion ? 0 : 0.12 }}
            className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]"
          >
            <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[0_22px_42px_-34px_rgba(15,23,42,0.52)] md:p-4">
              <RoomsSnapshotSection propertyId={effectiveSelectedPropertyId} />
            </section>

            <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_22px_42px_-34px_rgba(15,23,42,0.45)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Signal Timeline
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
                Priority moves in queue
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Immediate opportunities and risk items surfaced from your latest home context.
              </p>

              <div className="mt-4 space-y-2.5">
                {(scopedUrgentActions.length ? scopedUrgentActions : data.urgentActions)
                  .slice(0, 3)
                  .map((action) => (
                    <Link
                      key={action.id}
                      href={resolveUrgentActionHref(action, effectiveSelectedPropertyId)}
                      className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="mb-0 text-xs font-semibold text-slate-900">{action.title}</p>
                        <p className="mb-0 mt-1 text-xs text-slate-600 line-clamp-2">{action.description}</p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  ))}

                {(scopedUrgentActions.length ? scopedUrgentActions : data.urgentActions).length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-3">
                    <p className="mb-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Target className="h-3.5 w-3.5" />
                      No critical risks open right now
                    </p>
                    <p className="mb-0 mt-1 text-xs text-emerald-800/90">
                      Continue strengthening retention drivers with quick preventive updates this week.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </motion.section>
        </div>
      </div>

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </>
  );
}
