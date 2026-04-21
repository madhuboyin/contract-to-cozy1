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
  const hasCompletionState =
    Boolean(selectedProperty) &&
    scopedUrgentActions.length === 0 &&
    data.activeIncidents.length === 0 &&
    overdueMaintenanceCount === 0;

  useEffect(() => {
    if (!data.isLoading && hasCompletionState) {
      celebrate('success');
    }
  }, [data.isLoading, hasCompletionState, celebrate]);

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

  const primaryActionHero = (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-brand-600 font-bold">
            Command Center · {isReturningVisitor ? 'Welcome Back' : 'Get Started'}
          </span>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName || 'there'}.
          </h1>
          <p className="text-slate-500 mt-1">Your home is {selectedProperty?.healthScore?.totalScore && selectedProperty.healthScore.totalScore > 80 ? 'highly protected' : 'needs focus'} today.</p>
        </div>
        
        <Button onClick={() => setIsScannerOpen(true)} className="h-14 px-6 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white shadow-lg active:scale-95 transition-all group">
          <Zap className="mr-2 h-5 w-5 fill-current text-brand-200" />
          <span className="text-base font-bold">Magic Scan</span>
          <ArrowRight className="ml-4 h-4 w-4 opacity-50" />
        </Button>
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
        className="border-2 border-brand-100 shadow-xl shadow-brand-50/50"
      />

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
    </div>
  );

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

      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <CommandCenterTemplate
          primaryAction={primaryActionHero}
          confidenceLabel="Verified"
          freshnessLabel="Updated today"
          sourceLabel="Home Intelligence Engine"
          secondaryModules={
            <div className="space-y-12">
               <HeroValueStrip tiles={[]} momentumLabel={null} /> 
               <SignatureRecommendationCard propertyLabel="Your Home" moves={[]} summary="Analyzing latest data..." />
               <RoomsSnapshotSection propertyId={effectiveSelectedPropertyId} />
            </div>
          }
        />
      </div>

      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </>
  );
}
