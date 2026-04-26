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
import { Booking, HomeBuyerTask, HomeBuyerChecklist, Warranty, InsurancePolicy, LocalUpdate } from '@/types';
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
import { ConfidenceBadge as PremiumConfidenceBadge, MetricTile, PageHero, SmartCTA, TrustMetaRow } from '@/components/system/PremiumPrimitives';
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

function resolvePriorityAlertSavings(
  incident: IncidentDTO | undefined,
  fallbackAnnualSavings: number,
): number {
  const incidentDetails = incident?.details && typeof incident.details === 'object'
    ? (incident.details as Record<string, unknown>)
    : null;

  const candidateValues = [
    incidentDetails?.potentialSavingsUsd,
    incidentDetails?.estimatedSavingsUsd,
    incidentDetails?.recommendedSavingsUsd,
    fallbackAnnualSavings,
  ];

  for (const value of candidateValues) {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return Math.round(numericValue);
    }
  }

  return 0;
}

function buildTopCardActionMeta(
  actionMetaLabel: string,
  actionMetaValue: string,
  actionMetaSupportingText: string,
): {
  actionMetaLabel: string;
  actionMetaValue: string;
  actionMetaSupportingText: string;
  compactActionLayout: true;
} {
  return {
    actionMetaLabel,
    actionMetaValue,
    actionMetaSupportingText,
    compactActionLayout: true,
  };
}

function buildHealthInsightActionMeta(factorTitle: string) {
  return buildTopCardActionMeta(
    'Review in Health Score',
    factorTitle,
    'Check Current Health Focus and the factor ledger for what needs attention.',
  );
}

function buildIncidentActionMeta(incidentTitle: string, potentialSavings: number) {
  if (potentialSavings > 0) {
    return buildTopCardActionMeta(
      'Potential savings',
      formatUsd(potentialSavings),
      `Open ${incidentTitle} details to review the risk summary and recommended actions.`,
    );
  }

  return buildTopCardActionMeta(
    'Open incident detail',
    incidentTitle,
    'Review the risk summary, timeline, and next recommended actions.',
  );
}

function buildSavingsActionMeta(amount: number) {
  return buildTopCardActionMeta(
    'Verified annual savings',
    `${formatUsd(amount)}/yr`,
    'Open Home Savings to review matched opportunities and compare next steps.',
  );
}

function buildVaultActionMeta() {
  return buildTopCardActionMeta(
    'Start in Home Vault',
    'Add your first record',
    'Upload a receipt, appliance, or service document to unlock fuller guidance.',
  );
}

function buildMaintenanceActionMeta(overdueCount: number) {
  return buildTopCardActionMeta(
    'Review in Fix',
    `${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`,
    'Open the priority actions list to see what is overdue and what to do next.',
  );
}

function buildDefaultActionMeta() {
  return buildTopCardActionMeta(
    'Open Health Score',
    'Review your score drivers',
    'Check current health focus and recent changes affecting the property score.',
  );
}

function isRateLimitedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number | string }).status;
  return status === 429 || error.message.toLowerCase().includes('too many requests');
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
    checklist: HomeBuyerChecklist | null;
    urgentActions: UrgentActionItem[];
    inventoryCount: number;
    activeIncidents: IncidentDTO[];
    isLoading: boolean;
    error: string | null;
}

type ChecklistEntry = {
    id: string;
    status: string;
    nextDueDate?: string | null;
    title: string;
    description?: string | null;
    propertyId?: string | null;
};

// Helper to consolidate data into a single, actionable list
const consolidateUrgentActions = (
    properties: ScoredProperty[],
    checklistItems: ChecklistEntry[],
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

    // 2. Process Health score Insights (Critical items only)
    const CRITICAL_INSIGHT_STATUSES = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];
    
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

  if (action.type === 'INCIDENT' && actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}/incidents/${action.id}`;
  }
  if (action.type === 'HEALTH_INSIGHT' && actionPropertyId) {
    return `/dashboard/properties/${actionPropertyId}/health-score`;
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
  const lastKnownPropertiesRef = React.useRef<ScoredProperty[]>([]);
  
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
    
    setData(prev => ({ ...prev, isLoading: true, error: null }));
    setRedirectChecked(false);
    
    try {
      let scoredProperties = lastKnownPropertiesRef.current;
      let propertyLoadRateLimited = false;

      try {
        const propertiesRes = await api.getProperties();
        const properties = propertiesRes.success ? propertiesRes.data.properties : [];
        scoredProperties = properties.map(p => ({
          ...p,
          healthScore: (p as unknown as ScoredProperty).healthScore || {
            totalScore: 0,
            insights: [],
          },
        })) as ScoredProperty[];
        lastKnownPropertiesRef.current = scoredProperties;
      } catch (error) {
        if (isRateLimitedError(error)) {
          propertyLoadRateLimited = true;
        } else if (scoredProperties.length === 0) {
          throw error;
        }
      }

      const propId = selectedPropertyId || scoredProperties[0]?.id;

      const [bookingsRes, checklistRes, warrantiesRes, policiesRes, incidentsRes, inventoryRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
          .catch(() => ({ success: false, data: { bookings: [] } })),
        api.getHomeBuyerChecklist()
          .then(res => (res.success && res.data ? { success: true, data: res.data } : { success: false, data: null }))
          .catch(() => ({ success: false, data: null })),
        api.listWarranties()
          .catch(() => ({ success: false, data: { warranties: [] } })),
        api.listInsurancePolicies()
          .catch(() => ({ success: false, data: { policies: [] } })),
        propId
          ? listIncidents({ propertyId: propId, limit: 10 }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
        propId
          ? listInventoryItems(propId, {}).catch(() => [])
          : Promise.resolve([]),
      ]);
  
      const bookings = bookingsRes.success ? bookingsRes.data.bookings : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
      const activeIncidents = (incidentsRes as any).items || [];
      const inventoryItems = inventoryRes || [];
  
      const urgentActions = consolidateUrgentActions(
        scoredProperties,
        checklist?.tasks || [],
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
        setShowWelcomeScreen(scoredProperties.length === 0 && !skipped && !propertyLoadRateLimited);
      }
  
    } catch (error) {
      console.error('❌ Dashboard: Error fetching data:', error);
      const message =
        isRateLimitedError(error)
          ? 'Too many requests right now. Please wait a minute and refresh.'
          : 'Failed to load dashboard data';
      setData(prev => ({ ...prev, isLoading: false, error: message }));
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

  const safeFirstName = user?.firstName || 'there';
  const selectedProperty = properties.find(p => p.id === effectiveSelectedPropertyId); 
  const scopedUrgentActions = data.urgentActions.filter(
    (action) => action.propertyId === effectiveSelectedPropertyId
  );
  const scopedActiveIncidents = data.activeIncidents.filter(
    (incident) => incident.propertyId === effectiveSelectedPropertyId
  );

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
    const highSeverityIncident =
      scopedActiveIncidents.find((incident) => incident.severity === 'CRITICAL' || incident.severity === 'WARNING') ||
      data.activeIncidents.find((incident) => incident.severity === 'CRITICAL' || incident.severity === 'WARNING');
    if (highSeverityIncident) {
      const potentialSavings = resolvePriorityAlertSavings(highSeverityIncident, annualSavingsPotential);
      return {
        title: `Priority alert: ${highSeverityIncident.title}`,
        subtitle: highSeverityIncident.summary || 'A critical home event requires your review to prevent escalation.',
        ctaLabel: 'Review incident',
        href: `/dashboard/properties/${highSeverityIncident.propertyId}/incidents/${highSeverityIncident.id}`,
        impactLabel: 'Active home risk',
        etaLabel: 'ETA 2 min',
        ...buildIncidentActionMeta(highSeverityIncident.title, potentialSavings),
      };
    }

    // 2. Top health insight
    const topHealthInsight = scopedUrgentActions.find(a => a.type === 'HEALTH_INSIGHT');
    if (topHealthInsight) {
      const impactLabel = 'Top risk signal';
      const etaLabel = 'ETA 2 min';
      return {
        title: `${topHealthInsight.title} needs attention — your top priority this week.`,
        subtitle: null,
        ctaLabel: `Review ${topHealthInsight.title.toLowerCase()}`,
        href: resolveUrgentActionHref(topHealthInsight, effectiveSelectedPropertyId),
        impactLabel,
        etaLabel,
        ...buildHealthInsightActionMeta(topHealthInsight.title),
      };
    }

    // 3. Savings > $200
    if (annualSavingsPotential >= 200) {
      const impactLabel = `${formatUsd(annualSavingsPotential)}/yr potential`;
      const etaLabel = 'ETA 3 min';
      return {
        title: `We found ${formatUsd(annualSavingsPotential)} in potential annual savings.`,
        subtitle: null,
        ctaLabel: 'See your savings',
        href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/home-savings'),
        impactLabel,
        etaLabel,
        ...buildSavingsActionMeta(annualSavingsPotential),
      };
    }

    // 4. Vault Onboarding (Empty state: < 3 items)
    if (data.inventoryCount < 3) {
      const impactLabel = 'Unlock intelligence';
      const etaLabel = 'ETA 90 sec';
      return {
        title: 'Start building your Home Vault for full intelligence.',
        subtitle: null,
        ctaLabel: 'Add your first item',
        href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/vault'),
        impactLabel,
        etaLabel,
        ...buildVaultActionMeta(),
      };
    }

    // 5. Maintenance Overdue
    const primaryOverdueAction = scopedUrgentActions.find((action) => action.type === 'MAINTENANCE_OVERDUE');
    if (overdueMaintenanceCount > 0) {
      const impactLabel = 'Preventative win';
      const etaLabel = 'ETA 2 min';
      return {
        title: `${overdueMaintenanceCount} maintenance task${overdueMaintenanceCount === 1 ? '' : 's'} need${overdueMaintenanceCount === 1 ? 's' : ''} attention.`,
        subtitle: null,
        ctaLabel: 'Fix overdue tasks',
        href: primaryOverdueAction
          ? resolveUrgentActionHref(primaryOverdueAction, effectiveSelectedPropertyId)
          : buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/fix?focus=priority-actions'),
        impactLabel,
        etaLabel,
        ...buildMaintenanceActionMeta(overdueMaintenanceCount),
      };
    }

    // 6. Default: All clear
    const impactLabel = 'HomeScore up to date';
    const etaLabel = 'ETA 1 min';
    return {
      title: 'All systems healthy — schedule your next maintenance check.',
      subtitle: null,
      ctaLabel: 'View full report',
      href: buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/health-score'),
      impactLabel,
      etaLabel,
      ...buildDefaultActionMeta(),
    };
  })();

  if (userLoading || data.isLoading || !redirectChecked) {
    return <DashboardRouteState state="loading" title="Preparing your command center" description="Syncing your latest home intelligence..." />;
  }

  if (data.error) {
    return <DashboardRouteState state="error" title="Could not load dashboard" description={data.error} />;
  }

  if (showWelcomeScreen && user) return <WelcomeModal userFirstName={user.firstName} />;

  const healthScore = selectedProperty?.healthScore?.totalScore ?? 82;
  const healthScoreHref = buildPropertyAwareDashboardHref(effectiveSelectedPropertyId, '/dashboard/health-score');
  const priorityActionsHref = buildPropertyAwareDashboardHref(
    effectiveSelectedPropertyId,
    '/dashboard/fix?focus=priority-actions',
  );
  const protectedValueHref = buildPropertyAwareDashboardHref(
    effectiveSelectedPropertyId,
    '/dashboard/save?focus=annual-savings',
  );
  const primaryActionHero = (
    <div className="space-y-6">
      <PageHero
        eyebrow="Today"
        icon={<Zap className="h-5 w-5" />}
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.firstName || 'there'}.`}
        description={
          data.activeIncidents.length > 0
            ? 'A high-priority home signal changed overnight. One focused action can reduce avoidable cost exposure.'
            : 'Your home profile is synced. We are watching risk, savings, maintenance, and documents so the next move is clear.'
        }
        action={
          <SmartCTA
            onClick={() => setIsScannerOpen(true)}
            title="Refresh all home signals and re-rank your issues"
            className="h-12"
          >
            Run full scan
          </SmartCTA>
        }
        meta={
          <TrustMetaRow
            items={[
              'Verified just now from home signals',
              'Ranked by risk, financial upside, and confidence',
              'High confidence based on 12 signals',
            ]}
          />
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Link href={healthScoreHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Health score"
              value={healthScore}
              hint="Current property signal"
              tone={healthScore >= 80 ? 'success' : 'warning'}
              className="h-full cursor-pointer"
            />
          </Link>
          <Link href={priorityActionsHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Priority actions"
              value={scopedUrgentActions.slice(0, 3).length}
              hint="Top 3 ranked moves"
              tone={scopedUrgentActions.length > 0 ? 'warning' : 'success'}
              className="h-full cursor-pointer"
            />
          </Link>
          <Link href={protectedValueHref} className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2">
            <MetricTile
              label="Annual savings found"
              value={formatUsd(annualSavingsPotential)}
              hint="Verified savings opportunities"
              tone="brand"
              className="h-full cursor-pointer"
            />
          </Link>
        </div>
      </PageHero>

      <WinCard
        title="Highest value move"
        value={heroNarrative.title}
        description={heroNarrative.subtitle ?? 'Chosen because it best balances cost prevention, confidence, and effort.'}
        actionLabel={heroNarrative.ctaLabel}
        actionMetaLabel={heroNarrative.actionMetaLabel}
        actionMetaValue={heroNarrative.actionMetaValue}
        actionMetaSupportingText={heroNarrative.actionMetaSupportingText}
        compactActionLayout={heroNarrative.compactActionLayout}
        onAction={() => router.push(heroNarrative.href)}
        isUrgent={data.activeIncidents.length > 0 || overdueMaintenanceCount > 0}
        trust={{
          confidenceLabel: 'High confidence',
          freshnessLabel: 'Verified from live signals',
          sourceLabel: 'Home signals',
          rationale: 'Ranked by financial upside, risk prevention, and data confidence.'
        }}
        className="border border-teal-200/70 shadow-[var(--ctc-shadow-card)]"
      />
      <PremiumConfidenceBadge label="Calm control: no duplicate actions, one best next move." />

      <MagicCaptureSheet isOpen={isScannerOpen} onOpenChange={setIsScannerOpen} />
    </div>
  );

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <CommandCenterTemplate
          primaryAction={primaryActionHero}
          confidenceLabel="Verified"
          freshnessLabel="Updated today"
          sourceLabel="Home analysis"
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
