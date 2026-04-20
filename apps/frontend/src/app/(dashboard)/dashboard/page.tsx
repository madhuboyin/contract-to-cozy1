// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import {
  CalendarClock,
  Gauge,
  Landmark,
  PiggyBank,
  Shield,
  ShieldAlert,
  Sprout,
  TrendingUp,
  Zap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Box
} from 'lucide-react';
import { Booking, ChecklistItem, Warranty, InsurancePolicy, LocalUpdate } from '@/types'; 
import { ScoredProperty } from './types'; 
import { differenceInDays, formatDistanceToNowStrict, isPast, parseISO } from 'date-fns'; 

// NEW IMPORTS FOR SCORECARDS AND LAYOUT
import { DashboardShell } from '@/components/DashboardShell';
import { PropertyHealthScoreCard } from './components/PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './components/PropertyRiskScoreCard'; 
import { FinancialEfficiencyScoreCard } from './components/FinancialEfficiencyScoreCard'; 
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { SeasonalBanner } from '@/components/seasonal/SeasonalBanner';
import { SeasonalWidget } from '@/components/seasonal/SeasonalWidget';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';
import { WelcomeSection } from '@/components/WelcomeSection';
import AhaHero from './components/AhaHero';
import { RoomsSnapshotSection } from './components/RoomsSnapshotSection';
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import CoverageIntelligenceToolCard from './components/CoverageIntelligenceToolCard';
import RiskPremiumOptimizerToolCard from './components/RiskPremiumOptimizerToolCard';
import DoNothingSimulatorToolCard from './components/DoNothingSimulatorToolCard';
import HomeSavingsCheckToolCard from './components/HomeSavingsCheckToolCard';
import MorningHomePulseCard from './components/MorningHomePulseCard';
import { HomeScoreReportCard } from './components/HomeScoreReportCard';
import { ShareVaultButton } from './components/ShareVaultButton';
import PriorityAlertBanner from '@/components/dashboard/PriorityAlertBanner';
import { motion, useReducedMotion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import MobileDashboardHome from './components/MobileDashboardHome';
import MobileHomeBuyerDashboard from './components/MobileHomeBuyerDashboard';
import { useCelebration } from '@/hooks/useCelebration';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { getHomeSavingsSummary } from '@/lib/api/homeSavingsApi';
import { useQuery } from '@tanstack/react-query';
import { HeroValueStrip, ValueStripTile } from './components/HeroValueStrip';
import { RecommendedMove, SignatureRecommendationCard } from './components/SignatureRecommendationCard';
import CommandCenterTemplate from './components/CommandCenterTemplate';
import SupportingActionCard from './components/SupportingActionCard';
import DashboardRouteState from './components/DashboardRouteState';
import { MagicCaptureSheet } from '@/components/orchestration/MagicCaptureSheet';
import { WinCard } from '@/components/shared/WinCard';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { Button } from '@/components/ui/button';
import {
  appendGuidanceContinuityToHref,
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import { track } from '@/lib/analytics/events';

import { listIncidents } from './properties/[id]/incidents/incidentsApi';
import { listInventoryItems } from './inventory/inventoryApi';
import { IncidentDTO } from '@/types/incidents.types';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 
const DASHBOARD_AHA_SEEN_PREFIX = 'dashboardAhaSeen';
const DASHBOARD_AHA_VIEWED_PREFIX = 'dashboardAhaViewed';
const DASHBOARD_AHA_CELEBRATED_PREFIX = 'dashboardAhaCelebrated';

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUsdFromCents(value: number): string {
  return formatUsd(value / 100);
}

function formatSignedPoints(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.05) return 'No change';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

function formatSeasonLabel(rawSeason: string | null | undefined): string | null {
  if (!rawSeason) return null;
  return rawSeason
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
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
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useAuth();
  const { toast } = useToast();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isReturningVisitor, setIsReturningVisitor] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const hasGuidanceContext = hasGuidanceContinuityContext(guidanceContext);
  
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
  const { celebration, celebrate, dismiss } = useCelebration(
    `dashboard-aha-${user?.id ?? 'anon'}-${selectedPropertyId ?? 'none'}`
  );
  const { data: homeownerSegment } = useHomeownerSegment();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user, effectiveSelectedPropertyId]);

  useEffect(() => {
    if (!userLoading && user) {
      fetchDashboardData();
    }
  }, [userLoading, user, fetchDashboardData]);

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

  if (userLoading || data.isLoading || !redirectChecked) {
    return <DashboardRouteState state="loading" title="Preparing your command center" description="Syncing your latest home intelligence..." />;
  }

  if (data.error) {
    return <DashboardRouteState state="error" title="Could not load dashboard" description={data.error} />;
  }

  if (showWelcomeScreen && user) return <WelcomeModal userFirstName={user.firstName} />;

  // ── Derived display values ───────────────────────────────────────────────
  const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const healthScore = selectedProperty?.healthScore?.totalScore ?? null;
  const roundedHealthScore = healthScore !== null ? Math.round(healthScore) : null;
  const healthScoreColor =
    roundedHealthScore === null ? '#94a3b8'
    : roundedHealthScore >= 80 ? '#0d9488'
    : roundedHealthScore >= 60 ? '#f59e0b'
    : '#ef4444';
  const homeStatusLabel =
    healthScore === null ? 'Building your profile'
    : healthScore >= 80 ? 'Well protected'
    : healthScore >= 60 ? 'Needs attention'
    : 'Needs focus';

  const RING_CIRCUMFERENCE = 238.76;
  const scoreArc = roundedHealthScore !== null ? (roundedHealthScore / 100) * RING_CIRCUMFERENCE : 0;

  const valueTiles: ValueStripTile[] = [];
  if (roundedHealthScore !== null) {
    valueTiles.push({
      id: 'health',
      label: 'Home Health',
      value: `${roundedHealthScore}`,
      delta: roundedHealthScore >= 80 ? 'Great' : roundedHealthScore >= 60 ? 'Fair' : 'Low',
      icon: Gauge,
      tone: roundedHealthScore >= 80 ? 'teal' : roundedHealthScore >= 60 ? 'amber' : 'red',
      href: effectiveSelectedPropertyId ? `/dashboard/properties/${effectiveSelectedPropertyId}` : undefined,
    });
  }
  if (riskExposureGap > 0) {
    valueTiles.push({ id: 'risk', label: 'Risk Exposure', value: formatUsd(riskExposureGap), delta: null, icon: ShieldAlert, tone: 'amber' });
  }
  if (annualSavingsPotential > 0) {
    valueTiles.push({ id: 'savings', label: 'Savings Found', value: `${formatUsd(annualSavingsPotential)}/yr`, delta: null, icon: PiggyBank, tone: 'teal', href: '/dashboard/savings' });
  }
  valueTiles.push({
    id: 'vault',
    label: 'Vault Items',
    value: `${data.inventoryCount}`,
    delta: data.inventoryCount < 3 ? 'Add more' : null,
    icon: Box,
    tone: data.inventoryCount < 3 ? 'amber' : 'slate',
    href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/vault'),
  });
  if (overdueMaintenanceCount > 0) {
    valueTiles.push({ id: 'overdue', label: 'Overdue Tasks', value: `${overdueMaintenanceCount}`, delta: 'Needs action', icon: CalendarClock, tone: 'red', href: '/dashboard/maintenance?filter=overdue' });
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

      <div className="max-w-[1500px] mx-auto px-6 xl:px-10 w-full pb-16">

        {/* ── Hero Section ── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-white via-slate-50/60 to-teal-50/30 border border-slate-200/60 shadow-sm p-8 lg:p-10"
        >
          <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-teal-100/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px] gap-8 lg:gap-12 items-start">
            {/* Left: Command Section */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-600 font-semibold">
                  Command Center · {isReturningVisitor ? 'Welcome Back' : 'Get Started'}
                </p>
                <h1 className="mt-2 text-[2rem] font-semibold text-slate-900 tracking-tight leading-tight">
                  Good {timeOfDay}, {user?.firstName || 'there'}.
                </h1>
                <p className="mt-1.5 text-[0.9375rem] text-slate-500 leading-relaxed max-w-[540px]">
                  {selectedProperty?.healthScore?.totalScore && selectedProperty.healthScore.totalScore > 80
                    ? "Your home is well protected. Here's what to focus on today."
                    : "We've analyzed your home. Here's the highest-impact move."}
                </p>
              </div>

              <WinCard
                title="Highest Value Move"
                value={heroNarrative.title}
                description={heroNarrative.subtitle}
                actionLabel={heroNarrative.ctaLabel}
                onAction={() => router.push(ahaCtaHref)}
                isUrgent={data.activeIncidents.length > 0 || overdueMaintenanceCount > 0}
                trust={{
                  confidenceLabel: "Verified",
                  freshnessLabel: "Updated just now",
                  sourceLabel: "CtC Intelligence Engine",
                  rationale: "Ranked by financial upside, risk prevention, and data confidence."
                }}
              />

              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setIsScannerOpen(true)}
                  className="h-12 px-7 rounded-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all duration-150"
                >
                  <Zap className="mr-2 h-4 w-4 fill-current text-brand-200" />
                  Magic Scan
                  <ArrowRight className="ml-3 h-4 w-4 opacity-60" />
                </Button>
                {heroNarrative.etaLabel && (
                  <span className="text-xs text-slate-400 font-medium">{heroNarrative.etaLabel}</span>
                )}
              </div>
            </div>

            {/* Right: Home Intelligence Panel */}
            <div className="hidden lg:flex flex-col gap-3">
              <div className="rounded-2xl bg-white/80 border border-slate-200/60 shadow-sm p-6 flex flex-col items-center gap-4">
                <div className="relative">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 96 96" aria-hidden="true">
                    <circle cx="48" cy="48" r="38" fill="none" stroke="#f1f5f9" strokeWidth="7" />
                    <circle
                      cx="48" cy="48" r="38"
                      fill="none"
                      stroke={healthScoreColor}
                      strokeWidth="7"
                      strokeDasharray={`${scoreArc} ${RING_CIRCUMFERENCE}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[1.625rem] font-bold text-slate-900 leading-none">
                      {roundedHealthScore ?? '--'}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400 mt-1">
                      HomeScore
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">{homeStatusLabel}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Based on 12+ signals</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 border border-slate-200/60 shadow-sm p-5">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-3">
                  Intelligence Signals
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-xs text-slate-600">Confidence: High</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0" />
                    <span className="text-xs text-slate-600">Updated moments ago</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-xs text-slate-600">Source: Coverage + Home Data</span>
                  </div>
                  {data.activeIncidents.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-xs text-amber-600 font-medium">
                        {data.activeIncidents.length} active incident{data.activeIncidents.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {overdueMaintenanceCount > 0 && (
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      <span className="text-xs text-red-600 font-medium">
                        {overdueMaintenanceCount} overdue task{overdueMaintenanceCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Home At A Glance Strip ── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
          className="mt-5"
        >
          <HeroValueStrip
            tiles={valueTiles}
            momentumLabel={annualSavingsPotential > 0 ? `${formatUsd(annualSavingsPotential)} found` : null}
          />
        </motion.div>

        {/* ── Signature Recommendations ── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.15 }}
          className="mt-8"
        >
          <SignatureRecommendationCard propertyLabel="Your Home" moves={[]} summary="Analyzing latest data..." />
        </motion.div>

        {/* ── Rooms Snapshot ── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.2 }}
          className="mt-8"
        >
          <RoomsSnapshotSection propertyId={effectiveSelectedPropertyId} />
        </motion.div>
      </div>

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </>
  );
}
