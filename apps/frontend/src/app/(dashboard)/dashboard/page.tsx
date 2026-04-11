// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User, ChecklistItem, Warranty, InsurancePolicy, LocalUpdate } from '@/types'; 
import { ScoredProperty } from './types'; 
import { differenceInDays, isPast, parseISO } from 'date-fns'; 

// NEW IMPORTS FOR SCORECARDS AND LAYOUT
import { DashboardShell } from '@/components/DashboardShell';
import { PropertyHealthScoreCard } from './components/PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './components/PropertyRiskScoreCard'; 
import { FinancialEfficiencyScoreCard } from './components/FinancialEfficiencyScoreCard'; 
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { TrendingUp } from 'lucide-react';
import { ShieldAlert } from 'lucide-react';
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
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import MobileDashboardHome from './components/MobileDashboardHome';
import MobileHomeBuyerDashboard from './components/MobileHomeBuyerDashboard';
import { useCelebration } from '@/hooks/useCelebration';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import {
  appendGuidanceContinuityToHref,
  extractGuidanceContinuityContext,
  hasGuidanceContinuityContext,
} from '@/features/guidance/utils/guidanceContinuity';


const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 
const DASHBOARD_AHA_SEEN_PREFIX = 'dashboardAhaSeen';
const DASHBOARD_AHA_VIEWED_PREFIX = 'dashboardAhaViewed';
const DASHBOARD_AHA_CELEBRATED_PREFIX = 'dashboardAhaCelebrated';

const DEFAULT_LOCAL_UPDATES: LocalUpdate[] = [
  {
    id: 'demo-local-update-daily-pulse',
    title: 'Morning Home Pulse refreshed',
    shortDescription: 'New weather + maintenance signals are ready for your review.',
    category: 'MAINTENANCE',
    sourceName: 'ContractToCozy',
    isSponsored: false,
    ctaText: 'Open pulse',
    ctaUrl: '/dashboard/daily-snapshot',
  },
  {
    id: 'demo-local-update-maintenance-plan',
    title: 'Maintenance forecast updated',
    shortDescription: 'See your highest-impact preventive task for this week.',
    category: 'MAINTENANCE',
    sourceName: 'ContractToCozy',
    isSponsored: false,
    ctaText: 'Review forecast',
    ctaUrl: '/dashboard/maintenance',
  },
  {
    id: 'demo-local-update-insurance',
    title: 'Annual insurance savings check',
    shortDescription: 'Run a quick annual premium check to spot coverage and deductible optimization.',
    category: 'INSURANCE',
    sourceName: 'ContractToCozy',
    isSponsored: false,
    ctaText: 'Review now',
    ctaUrl: '/dashboard/insurance',
  },
];

function withLocalUpdatesFallback(updates?: LocalUpdate[] | null): LocalUpdate[] {
  if (Array.isArray(updates) && updates.length > 0) return updates;
  return DEFAULT_LOCAL_UPDATES;
}

// --- START PHASE 1: DATA CONSOLIDATION TYPES ---

export interface UrgentActionItem {
    id: string;
    type: 'MAINTENANCE_OVERDUE' | 'MAINTENANCE_UNSCHEDULED' | 'RENEWAL_EXPIRED' | 'RENEWAL_UPCOMING' | 'HEALTH_INSIGHT';
    title: string;
    description: string;
    dueDate?: Date;
    daysUntilDue?: number;
    propertyId: string;
}

// FIX 1: Add 'urgentActions' field to the DashboardData interface
interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[];
    checklist: { id: string, items: ChecklistItem[] } | null; 
    urgentActions: UrgentActionItem[];
    isLoading: boolean;
    error: string | null;
}

// Helper to consolidate data into a single, actionable list
const consolidateUrgentActions = (
    properties: ScoredProperty[],
    checklistItems: ChecklistItem[],
    warranties: Warranty[],
    insurancePolicies: InsurancePolicy[]
): UrgentActionItem[] => {
    const actions: UrgentActionItem[] = [];
    const today = new Date();
    const ninetyDays = 90;

    // 1. Process Health Score Insights (Critical items only)
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
    
    // 2. Process Maintenance Checklist (Overdue/Unscheduled Tasks)
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
        
        // Check for Unscheduled Tasks (Tasks that are active, recurring, but have no due date)
        if (item.isRecurring && !item.nextDueDate) {
             actions.push({
                id: item.id,
                type: 'MAINTENANCE_UNSCHEDULED',
                title: `UNSCHEDULED: ${item.title}`,
                description: `Recurring task needs scheduling/due date set.`,
                propertyId: item.propertyId || 'N/A',
            });
        }
    });

    // 3. Process Renewals (Expired/Upcoming Warranties and Insurance)
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

    // Sort: Critical (Expired/Overdue) first, then by urgency (daysUntilDue)
    return actions.sort((a, b) => {
        if (a.daysUntilDue === undefined) return 1;
        if (b.daysUntilDue === undefined) return -1;
        return a.daysUntilDue - b.daysUntilDue;
    });
};

// --- END PHASE 1: DATA CONSOLIDATION TYPES ---

const formatAddress = (property: Property) => {
  return `${property.address}, ${property.city}, ${property.state}`;
}

function resolveUrgentActionHref(action: UrgentActionItem, propertyId?: string): string {
  const fallbackPropertyId = propertyId || undefined;
  const actionPropertyId =
    action.propertyId && action.propertyId !== 'N/A' ? action.propertyId : fallbackPropertyId;

  const propertyQuery = actionPropertyId ? `?propertyId=${encodeURIComponent(actionPropertyId)}` : '';

  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `/dashboard/maintenance${propertyQuery ? `${propertyQuery}&filter=overdue` : '?filter=overdue'}`;
  }
  if (action.type === 'MAINTENANCE_UNSCHEDULED') {
    return `/dashboard/maintenance${propertyQuery ? `${propertyQuery}&filter=unscheduled` : '?filter=unscheduled'}`;
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
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Resolve Overdue Item';
  if (action.type === 'MAINTENANCE_UNSCHEDULED') return 'Schedule In 90 Seconds';
  if (action.type === 'RENEWAL_EXPIRED') return 'Restore Coverage Now';
  if (action.type === 'RENEWAL_UPCOMING') return 'Lock Renewal Savings';
  return 'Run 2-Minute Risk Check';
}

function urgentActionEtaLabel(action?: UrgentActionItem): string {
  if (!action) return 'ETA 2 min';
  if (action.type === 'HEALTH_INSIGHT') return 'ETA 2-3 min';
  if (action.type === 'MAINTENANCE_UNSCHEDULED') return 'ETA 90 sec';
  return 'ETA 2 min';
}

function urgentActionImpactLabel(action?: UrgentActionItem): string {
  if (!action) return 'Highest-value move this week';
  if (action.daysUntilDue !== undefined && action.daysUntilDue < 0) {
    return `Overdue by ${Math.abs(action.daysUntilDue)} day${Math.abs(action.daysUntilDue) === 1 ? '' : 's'}`;
  }
  if (action.type === 'RENEWAL_UPCOMING' && action.daysUntilDue !== undefined) {
    return `Expires in ${Math.max(0, action.daysUntilDue)} days`;
  }
  if (action.type === 'HEALTH_INSIGHT') return 'Potential downside reduced early';
  return 'Priority move for this week';
}

function cleanUrgentActionTitle(action?: UrgentActionItem): string {
  if (!action) return 'Priority home signal';
  return action.title
    .replace(/^OVERDUE:\s*/i, '')
    .replace(/^UNSCHEDULED:\s*/i, '')
    .replace(/^EXPIRED:\s*/i, '')
    .replace(/^UPCOMING:\s*/i, '')
    .trim();
}

function urgentActionHeroTitle(
  action: UrgentActionItem | undefined,
  userFirstName: string,
  isReturningVisitor: boolean
): string {
  if (!action) {
    return isReturningVisitor
      ? `Welcome back, ${userFirstName}. Your highest-value home move is ready.`
      : `${userFirstName}, start with one move that delivers immediate value.`;
  }

  if (action.type === 'MAINTENANCE_OVERDUE') {
    return `${userFirstName}, prevent a bigger repair bill with one 2-minute move today.`;
  }
  if (action.type === 'RENEWAL_EXPIRED') {
    return `${userFirstName}, coverage risk is active. Resolve one move now.`;
  }
  if (action.type === 'RENEWAL_UPCOMING') {
    return `${userFirstName}, your best renewal window is open right now.`;
  }
  if (action.type === 'MAINTENANCE_UNSCHEDULED') {
    return `${userFirstName}, one quick schedule decision protects this month’s momentum.`;
  }

  return `${userFirstName}, one high-impact move can protect up to $420 this month.`;
}

function urgentActionHeroSubtitle(action?: UrgentActionItem): string {
  if (!action) {
    return 'We ranked your queue by urgency, confidence, and outcome so the first click delivers visible progress.';
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return 'An overdue maintenance risk moved into the critical window and now carries avoidable cost exposure.';
  }
  if (action.type === 'RENEWAL_EXPIRED') {
    return 'Your renewal status indicates an active gap that should be closed before exploring lower-priority work.';
  }
  if (action.type === 'RENEWAL_UPCOMING') {
    return 'Renewal timing favors action now while lower-friction and better-rate options are still available.';
  }
  if (action.type === 'MAINTENANCE_UNSCHEDULED') {
    return 'A recurring task lost schedule anchoring and can now drift into higher-risk territory.';
  }
  return 'We detected one insight with strong confidence and direct downstream effect on risk and cost.';
}

function urgentActionBriefLabel(isReturningVisitor: boolean): string {
  return isReturningVisitor ? 'Do Now Vs Wait' : 'First-Click Advantage';
}

function urgentActionBriefValue(action: UrgentActionItem | undefined, userFirstName: string): string {
  if (!action) {
    return `Good to see you, ${userFirstName}.`;
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return 'Act now to avoid a compounding repair window.';
  }
  if (action.type === 'RENEWAL_EXPIRED') {
    return 'Act now to restore protection and stability.';
  }
  if (action.type === 'RENEWAL_UPCOMING') {
    return 'Act now while better renewal options are open.';
  }
  if (action.type === 'MAINTENANCE_UNSCHEDULED') {
    return 'Act now to re-anchor this recurring risk.';
  }
  return 'Act now to convert this signal into measurable progress.';
}

function urgentActionBriefDetail(action?: UrgentActionItem): string {
  if (!action) {
    return 'This brief is intentionally ranked so your first click creates momentum before you scroll.';
  }
  if (action.type === 'MAINTENANCE_OVERDUE') {
    return 'Completing this first prevents downstream failures and protects HomeScore consistency.';
  }
  if (action.type === 'RENEWAL_EXPIRED') {
    return 'Closing the gap first reduces downside exposure and clarifies your next best optimization step.';
  }
  if (action.type === 'RENEWAL_UPCOMING') {
    return 'Using this renewal window first keeps optionality high and makes price comparisons easier.';
  }
  if (action.type === 'MAINTENANCE_UNSCHEDULED') {
    return 'Reinstating schedule clarity now helps your monthly planning stay predictable.';
  }
  return 'Addressing this signal first keeps your dashboard aligned to impact instead of activity.';
}

function urgentActionDoNowLabel(action?: UrgentActionItem): string {
  if (!action) return 'Capture the quick-win path and protect this week’s momentum.';
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Cut failure risk and avoid avoidable repair escalation.';
  if (action.type === 'RENEWAL_EXPIRED') return 'Reinstate coverage and reduce downside exposure immediately.';
  if (action.type === 'RENEWAL_UPCOMING') return 'Compare options early and lock better-rate leverage.';
  if (action.type === 'MAINTENANCE_UNSCHEDULED') return 'Restore calendar control and prevent silent slippage.';
  return 'Resolve the signal early and preserve upside potential.';
}

function urgentActionWaitRiskLabel(action?: UrgentActionItem): string {
  if (!action) return 'Priority context can stale and lower your confidence advantage.';
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Repair cost and disruption risk typically increase with delay.';
  if (action.type === 'RENEWAL_EXPIRED') return 'Unprotected intervals can increase financial downside.';
  if (action.type === 'RENEWAL_UPCOMING') return 'Fewer options and potential premium pressure near expiry.';
  if (action.type === 'MAINTENANCE_UNSCHEDULED') return 'Task drift can compound into a higher-friction fix later.';
  return 'Signal quality drops as conditions change and issues compound.';
}

function urgentActionWhyNow(action?: UrgentActionItem): string {
  if (!action) return 'Queue ranked by confidence and urgency.';
  if (action.type === 'HEALTH_INSIGHT') return 'Risk moved to Needs Review after latest signal refresh.';
  if (action.type === 'MAINTENANCE_OVERDUE') return 'Maintenance timing moved past due and now impacts risk.';
  if (action.type === 'MAINTENANCE_UNSCHEDULED') return 'Recurring task lost schedule anchor and needs reassignment.';
  if (action.type === 'RENEWAL_EXPIRED') return 'Renewal date has passed and requires immediate attention.';
  if (action.type === 'RENEWAL_UPCOMING') return 'Renewal window is open now, before option quality narrows.';
  return cleanUrgentActionTitle(action);
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
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const hasGuidanceContext = hasGuidanceContinuityContext(guidanceContext);
  
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    urgentActions: [], 
    isLoading: true,
    error: null,
  });
  
  // Track user type for conditional feature display (HOME_BUYER vs EXISTING_OWNER)
  const [userType, setUserType] = useState<string | null>(null);
  
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const { celebration, celebrate, dismiss } = useCelebration(
    `dashboard-aha-${user?.id ?? 'anon'}-${selectedPropertyId ?? 'none'}`
  );
  const { data: homeownerSegment } = useHomeownerSegment(); // Get user segment for conditional features
  const properties = data.properties;
  const effectiveSelectedPropertyId =
    selectedPropertyId && properties.some((property) => property.id === selectedPropertyId)
      ? selectedPropertyId
      : properties[0]?.id;

  const resolveLocalUpdateHref = useCallback(
    (href: string | null | undefined) => {
      const fallbackHref = href || '/dashboard';
      return appendGuidanceContinuityToHref(fallbackHref, guidanceContext);
    },
    [guidanceContext]
  );

  const trackLocalUpdateGuidanceProgress = useCallback(
    (update: LocalUpdate | null | undefined, resolvedHref: string) => {
      if (
        !update ||
        !effectiveSelectedPropertyId ||
        !hasGuidanceContext ||
        !guidanceContext.guidanceJourneyId ||
        !guidanceContext.guidanceStepKey
      ) {
        return;
      }

      void recordGuidanceToolStatus(effectiveSelectedPropertyId, {
        journeyId: guidanceContext.guidanceJourneyId,
        stepKey: guidanceContext.guidanceStepKey,
        signalIntentFamily: guidanceContext.guidanceSignalIntentFamily ?? undefined,
        sourceToolKey: 'dashboard-local-updates',
        sourceEntityType: 'LOCAL_UPDATE',
        sourceEntityId: update.id,
        status: 'IN_PROGRESS',
        producedData: {
          proofType: 'cta_engagement',
          proofId: update.id,
          ctaKey: 'local_update_open',
          updateTitle: update.title,
          ctaUrl: resolvedHref,
          openedAt: new Date().toISOString(),
        },
      }).catch((error) => {
        console.warn('[dashboard] local update guidance progress hook failed:', error);
      });
    },
    [effectiveSelectedPropertyId, guidanceContext, hasGuidanceContext]
  );
  
  // --- DATA FETCHING LOGIC (unchanged) ---
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    setData(prev => ({ ...prev, isLoading: true }));
    
    try {
      const [bookingsRes, propertiesRes, checklistRes, warrantiesRes, policiesRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        api.getChecklist().then(res => {
          if (res.success && res.data) {
            return { success: true, data: res.data };
          }
          return { success: false, data: null };
        }).catch(() => ({ success: false, data: null })),
        api.listWarranties(),
        api.listInsurancePolicies(),
      ]);
  
      const bookings = bookingsRes.success ? bookingsRes.data.bookings : [];
      const properties = propertiesRes.success ? propertiesRes.data.properties : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
  
      const scoredProperties = properties.map(p => ({
        ...p,
        healthScore: (p as unknown as ScoredProperty).healthScore || {
          totalScore: 0,
          baseScore: 0,
          unlockedScore: 0,
          maxPotentialScore: 100,
          maxBaseScore: 70,
          maxExtraScore: 30,
          insights: [],
          ctaNeeded: false
        },
      })) as ScoredProperty[];
  
      const urgentActions = consolidateUrgentActions(
        scoredProperties,
        checklist?.items || [],
        warranties,
        policies
      );
  
      setData({
        bookings,
        properties: scoredProperties,
        checklist,
        urgentActions,
        isLoading: false,
        error: null,
      });
  
      // Extract user type from first property
      if (scoredProperties.length > 0) {
        const firstProperty = scoredProperties[0] as ScoredProperty & Record<string, unknown>;

        let detectedUserType = null;

        const profile = (firstProperty as Record<string, unknown>).homeownerProfile as Record<string, unknown> | undefined;
        const userProfile = ((firstProperty as Record<string, unknown>).user as Record<string, unknown> | undefined)?.homeownerProfile as Record<string, unknown> | undefined;

        if (profile?.userType) {
          detectedUserType = profile.userType as string;
        } else if (userProfile?.userType) {
          detectedUserType = userProfile.userType as string;
        }

        if (detectedUserType) {
          setUserType(detectedUserType);
        }
      }
  
    } catch (error) {
      console.error('❌ Dashboard: Error fetching data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load dashboard data',
      }));
    }
  }, [user]);
  
  useEffect(() => {
    if (!userLoading && user) {
      fetchDashboardData();
    }
  }, [userLoading, user, fetchDashboardData]);

  useEffect(() => {
    if (effectiveSelectedPropertyId !== selectedPropertyId) {
      setSelectedPropertyId(effectiveSelectedPropertyId);
    }
  }, [effectiveSelectedPropertyId, selectedPropertyId, setSelectedPropertyId]);

  useEffect(() => {
    if (!userLoading && user && !redirectChecked) {
      const checkRedirect = async () => {
        try {
          const propertiesRes = await api.getProperties();
          const hasProperties = propertiesRes.success && propertiesRes.data.properties.length > 0;

          if (!hasProperties) {
            const skipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
            if (!skipped) {
              setShowWelcomeScreen(true);
            }
          }
        } catch (error) {
          console.error('Error checking properties:', error);
        } finally {
          setRedirectChecked(true);
        }
      };
      checkRedirect();
    }
  }, [userLoading, user, redirectChecked]);

  useEffect(() => {
    if (!effectiveSelectedPropertyId) {
      setLocalUpdates(withLocalUpdatesFallback([]));
      return;
    }

    api
      .getLocalUpdates(effectiveSelectedPropertyId)
      .then((res) => {
        if (res.success) {
          setLocalUpdates(withLocalUpdatesFallback(res.data.updates || []));
        } else {
          setLocalUpdates(withLocalUpdatesFallback([]));
        }
      })
      .catch(() => {
        setLocalUpdates(withLocalUpdatesFallback([]));
      });
  }, [effectiveSelectedPropertyId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);

    return () => {
      media.removeEventListener('change', syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    const storageKey = `${DASHBOARD_AHA_SEEN_PREFIX}:${user.id}`;
    const seenBefore = window.localStorage.getItem(storageKey) === '1';
    setIsReturningVisitor(seenBefore);
    window.localStorage.setItem(storageKey, '1');
  }, [user?.id]);

  const trackAhaHeroEvent = useCallback(
    (event: string, metadata?: Record<string, unknown>) => {
      if (!effectiveSelectedPropertyId) return;

      void api
        .trackHomeScoreEvent(effectiveSelectedPropertyId, {
          event,
          section: 'dashboard_aha_hero',
          metadata,
        })
        .catch((error) => {
          console.warn('[dashboard] aha hero analytics event failed:', error);
        });
    },
    [effectiveSelectedPropertyId]
  );

  const safeFirstName = user?.firstName || 'there';
  const userSegment = homeownerSegment ?? user?.segment;
  const isHomeBuyerSegment = userSegment === 'HOME_BUYER';
  const isOwnerSegment = !isHomeBuyerSegment;
  const checklistItems = (data.checklist?.items || []) as ChecklistItem[];
  
  // Derived property values using a validated property selection
  const selectedProperty = properties.find(p => p.id === effectiveSelectedPropertyId); 
  const scopedUrgentActions = data.urgentActions.filter(
    (action) => action.propertyId === effectiveSelectedPropertyId
  );
  const primaryUrgentAction = scopedUrgentActions[0] || data.urgentActions[0];
  const ahaPropertyLabel = selectedProperty?.name || selectedProperty?.address || 'your home';
  const ahaCtaHref = primaryUrgentAction
    ? resolveUrgentActionHref(primaryUrgentAction, effectiveSelectedPropertyId)
    : effectiveSelectedPropertyId
      ? `/dashboard/home-savings?propertyId=${encodeURIComponent(effectiveSelectedPropertyId)}`
      : '/dashboard/home-savings';
  const ahaConfidence = Math.min(
    96,
    74 +
      (primaryUrgentAction ? 10 : 0) +
      (localUpdates.length > 0 ? 8 : 0) +
      ((selectedProperty?.healthScore?.totalScore || 0) > 0 ? 6 : 0)
  );
  const ahaTitle = urgentActionHeroTitle(primaryUrgentAction, safeFirstName, isReturningVisitor);
  const ahaSubtitle = urgentActionHeroSubtitle(primaryUrgentAction);
  const ahaBriefLabel = urgentActionBriefLabel(isReturningVisitor);
  const ahaBriefValue = urgentActionBriefValue(primaryUrgentAction, safeFirstName);
  const ahaBriefDetail = urgentActionBriefDetail(primaryUrgentAction);
  const ahaDoNowLabel = urgentActionDoNowLabel(primaryUrgentAction);
  const ahaWaitRiskLabel = urgentActionWaitRiskLabel(primaryUrgentAction);
  const ahaFeed: string[] = [];
  ahaFeed.push(`Why now: ${urgentActionWhyNow(primaryUrgentAction)}`);
  if (selectedProperty?.healthScore?.totalScore && selectedProperty.healthScore.totalScore > 0) {
    ahaFeed.push(`Current HomeScore: ${Math.round(selectedProperty.healthScore.totalScore)} for ${ahaPropertyLabel}`);
  }
  if (localUpdates[0]?.title) {
    ahaFeed.push(localUpdates[0].title);
  }
  if (ahaFeed.length < 3) {
    ahaFeed.push('Morning Home Pulse refreshed with latest weather and maintenance context.');
  }
  if (ahaFeed.length < 3) {
    ahaFeed.push('Action queue sorted by urgency and homeowner impact.');
  }

  const handleAhaCtaClick = useCallback(() => {
    trackAhaHeroEvent('dashboard_aha_cta_clicked', {
      isReturningVisitor,
      urgentActionType: primaryUrgentAction?.type ?? null,
      urgentActionTitle: primaryUrgentAction?.title ?? null,
      ctaHref: ahaCtaHref,
      propertyId: effectiveSelectedPropertyId ?? null,
    });
  }, [
    ahaCtaHref,
    effectiveSelectedPropertyId,
    isReturningVisitor,
    primaryUrgentAction?.title,
    primaryUrgentAction?.type,
    trackAhaHeroEvent,
  ]);

  useEffect(() => {
    if (
      !user?.id ||
      !effectiveSelectedPropertyId ||
      !redirectChecked ||
      showWelcomeScreen ||
      isMobileViewport
    ) {
      return;
    }

    if (typeof window === 'undefined') return;

    const viewedKey = `${DASHBOARD_AHA_VIEWED_PREFIX}:${user.id}:${effectiveSelectedPropertyId}:${
      isReturningVisitor ? 'returning' : 'first'
    }`;

    if (window.sessionStorage.getItem(viewedKey) === '1') {
      return;
    }

    window.sessionStorage.setItem(viewedKey, '1');

    trackAhaHeroEvent('dashboard_aha_viewed', {
      isReturningVisitor,
      urgentActionType: primaryUrgentAction?.type ?? null,
      urgentActionTitle: primaryUrgentAction?.title ?? null,
      localUpdatesCount: localUpdates.length,
      confidenceScore: ahaConfidence,
    });
  }, [
    ahaConfidence,
    effectiveSelectedPropertyId,
    isMobileViewport,
    isReturningVisitor,
    localUpdates.length,
    primaryUrgentAction?.title,
    primaryUrgentAction?.type,
    redirectChecked,
    showWelcomeScreen,
    trackAhaHeroEvent,
    user?.id,
  ]);

  useEffect(() => {
    if (
      !user?.id ||
      !effectiveSelectedPropertyId ||
      !redirectChecked ||
      showWelcomeScreen ||
      isMobileViewport
    ) {
      return;
    }

    if (typeof window === 'undefined') return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const celebrationKey = `${DASHBOARD_AHA_CELEBRATED_PREFIX}:${user.id}:${todayKey}`;

    if (window.localStorage.getItem(celebrationKey) === '1') {
      return;
    }

    window.localStorage.setItem(celebrationKey, '1');
    celebrate('cozy');

    trackAhaHeroEvent('dashboard_aha_celebrated', {
      isReturningVisitor,
      urgentActionType: primaryUrgentAction?.type ?? null,
      confidenceScore: ahaConfidence,
    });
  }, [
    ahaConfidence,
    celebrate,
    effectiveSelectedPropertyId,
    isMobileViewport,
    isReturningVisitor,
    primaryUrgentAction?.type,
    redirectChecked,
    showWelcomeScreen,
    trackAhaHeroEvent,
    user?.id,
  ]);

  const sectionMotion = (index: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.08 },
  });

  // --- CONDITIONAL RENDERING ---
  const loadingMessage = !redirectChecked
    ? 'Checking your account...'
    : 'Loading your dashboard...';

  if (userLoading || data.isLoading || !redirectChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-3 text-lg text-gray-600">{loadingMessage}</p>
      </div>
    );
  }

  if (showWelcomeScreen && user) {
    return <WelcomeModal userFirstName={user.firstName} />;
  }

  if (!user || data.error) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Error Loading Dashboard</h2>
        <p className="text-muted-foreground">{data.error || 'Please try logging in again.'}</p>
      </div>
    );
  }
  // --- END CONDITIONAL RENDERING ---
  
  if (isHomeBuyerSegment) {
    if (isMobileViewport) {
      return (
        <MobileHomeBuyerDashboard
          userFirstName={user.firstName}
          properties={data.properties}
          selectedPropertyId={effectiveSelectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
          bookings={data.bookings}
          checklistItems={checklistItems}
          localUpdates={localUpdates}
        />
      );
    }

    return (
      <>
        {selectedProperty && (
          <div className="max-w-7xl mx-auto px-4 md:px-6 w-full pt-4 md:pt-5">
            <AhaHero
              propertyLabel={ahaPropertyLabel}
              title={ahaTitle}
              subtitle={ahaSubtitle}
              briefLabel={ahaBriefLabel}
              briefValue={ahaBriefValue}
              briefDetail={ahaBriefDetail}
              doNowLabel={ahaDoNowLabel}
              waitRiskLabel={ahaWaitRiskLabel}
              ctaHref={ahaCtaHref}
              ctaLabel={urgentActionCtaLabel(primaryUrgentAction, isReturningVisitor)}
              onCtaClick={handleAhaCtaClick}
              etaLabel={urgentActionEtaLabel(primaryUrgentAction)}
              impactLabel={urgentActionImpactLabel(primaryUrgentAction)}
              confidenceLabel={`${ahaConfidence}% confidence`}
              feed={ahaFeed}
            />
          </div>
        )}
        <HomeBuyerDashboard 
          userFirstName={user.firstName}
          bookings={data.bookings}
          properties={data.properties}
          checklistItems={checklistItems}
        />
        <MilestoneCelebration
          type={celebration.type}
          isOpen={celebration.isOpen}
          onClose={dismiss}
        />
      </>
    );
  }

  if (isOwnerSegment && isMobileViewport) {
    return (
      <MobileDashboardHome
        userFirstName={user.firstName}
        properties={properties}
        selectedPropertyId={effectiveSelectedPropertyId}
        onPropertyChange={setSelectedPropertyId}
        localUpdates={localUpdates}
      />
    );
  }

  // Existing Owner Dashboard (now incorporates the scorecard grid at the top level)
  return (
    <>
      {selectedProperty && properties.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 w-full pt-5 md:pt-6">
          <AhaHero
            propertyLabel={ahaPropertyLabel}
            title={ahaTitle}
            subtitle={ahaSubtitle}
            briefLabel={ahaBriefLabel}
            briefValue={ahaBriefValue}
            briefDetail={ahaBriefDetail}
            doNowLabel={ahaDoNowLabel}
            waitRiskLabel={ahaWaitRiskLabel}
            ctaHref={ahaCtaHref}
            ctaLabel={urgentActionCtaLabel(primaryUrgentAction, isReturningVisitor)}
            onCtaClick={handleAhaCtaClick}
            etaLabel={urgentActionEtaLabel(primaryUrgentAction)}
            impactLabel={urgentActionImpactLabel(primaryUrgentAction)}
            confidenceLabel={`${ahaConfidence}% confidence`}
            feed={ahaFeed}
          />
        </div>
      )}

      {/* 1. WELCOME SECTION - FULL WIDTH */}
      {selectedProperty && properties.length > 0 && (
        <WelcomeSection
          userName={user?.firstName || 'there'}
          properties={properties}
          selectedPropertyId={effectiveSelectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
          compact
        />
      )}

      {/* 2. CONSTRAINED WIDTH AREA (Aligns with other cards) */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        {isOwnerSegment && effectiveSelectedPropertyId && (
          <motion.div {...sectionMotion(0)}>
            <PriorityAlertBanner propertyId={effectiveSelectedPropertyId} />
          </motion.div>
        )}

        {/* MORNING HOME PULSE */}
        {isOwnerSegment && effectiveSelectedPropertyId && (
          <motion.section className="mb-5 md:mb-6" {...sectionMotion(1)}>
            <MorningHomePulseCard propertyId={effectiveSelectedPropertyId} />
          </motion.section>
        )}

        {/* LOCAL UPDATES TICKER */}
        {isOwnerSegment && localUpdates.length > 0 && (
          <section className="mb-5 md:mb-6">
            <LocalUpdatesCarousel
              updates={localUpdates}
              variant="ticker"
              onDismiss={async (id) => {
                setLocalUpdates((prev) => {
                  const next = prev.filter((u) => u.id !== id);
                  return next.length > 0 ? next : DEFAULT_LOCAL_UPDATES;
                });
                if (!id.startsWith('demo-local-update-')) {
                  await api.dismissLocalUpdate(id);
                }
                const toastRef = toast({
                  title: 'Offer dismissed',
                  description: 'You can manage offers in Settings.',
                });
                window.setTimeout(() => toastRef.dismiss(), 2000);
              }}
              onCtaClick={(id) => {
                const update = localUpdates.find((u) => u.id === id);
                if (update?.ctaUrl) {
                  const resolvedHref = resolveLocalUpdateHref(update.ctaUrl);
                  trackLocalUpdateGuidanceProgress(update, resolvedHref);
                  const isExternal = /^https?:\/\//i.test(resolvedHref);
                  if (isExternal) {
                    window.open(resolvedHref, '_blank', 'noopener,noreferrer');
                  } else {
                    router.push(resolvedHref);
                  }
                }
              }}
            />
          </section>
        )}
        
        {/* PROPERTY INTELLIGENCE SCORES - IMMEDIATELY BELOW WELCOME */}
        <motion.div
          className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between"
          {...sectionMotion(2)}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-2">
              <TrendingUp className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
                Property Intelligence Scores
              </h2>
              <p className="text-sm text-gray-500">Real-time health, risk, and financial analysis</p>
            </div>
          </div>
          {effectiveSelectedPropertyId && (
            <ShareVaultButton
              propertyId={effectiveSelectedPropertyId}
              propertyAddress={selectedProperty?.address}
            />
          )}
        </motion.div>
        <motion.div
          className="mb-8 rounded-2xl border border-gray-200/80 bg-gray-50/60 p-3 sm:p-4"
          {...sectionMotion(2)}
        >
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
            <HomeScoreReportCard propertyId={effectiveSelectedPropertyId} />
            <PropertyHealthScoreCard property={selectedProperty} />
            <PropertyRiskScoreCard propertyId={effectiveSelectedPropertyId} />
            <FinancialEfficiencyScoreCard propertyId={effectiveSelectedPropertyId} />
          </div>
        </motion.div>

        {/* ROOMS SNAPSHOT */}
        <motion.div {...sectionMotion(3)}>
          <RoomsSnapshotSection propertyId={effectiveSelectedPropertyId} />
        </motion.div>

        {/* HORIZONTAL SEPARATOR */}
        <div className="section-divider my-5 md:my-6" />
        
        {/* AI INSURANCE/PREMIUM DECISION TOOLS */}
        <motion.section className="mb-4" {...sectionMotion(6)}>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-2">
              <ShieldAlert className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
                Coverage, Premium & Inaction Intelligence
              </h2>
              <p className="text-sm text-gray-500">
                Educational guidance to compare coverage, premium pressure, and delayed-action downside.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-3 sm:p-4">
            <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
              <HomeSavingsCheckToolCard propertyId={effectiveSelectedPropertyId || ''} />
              <CoverageIntelligenceToolCard propertyId={effectiveSelectedPropertyId || ''} />
              <RiskPremiumOptimizerToolCard propertyId={effectiveSelectedPropertyId || ''} />
              <DoNothingSimulatorToolCard propertyId={effectiveSelectedPropertyId || ''} />
            </div>
          </div>
        </motion.section>
        <div className="section-divider my-5 md:my-6" />
      </div>

      <DashboardShell className="pt-0 md:pt-0">
      {/* Filter data by selected property before passing to child components */}
      {/* This ensures the red banner and other components show data for the currently selected property only */}
      {(() => {
        // Filter properties to only the selected one (for consistency)
        const filteredProperties = selectedProperty ? [selectedProperty] : [];
        
        // FIX: Filter checklist items by selected property ID
        const filteredChecklistItems = effectiveSelectedPropertyId
            ? checklistItems.filter(item => item.propertyId === effectiveSelectedPropertyId)
            : []; 

        return (
          <>
            <ExistingOwnerDashboard
              bookings={data.bookings}
              properties={filteredProperties} // Pass only selected property
              checklistItems={filteredChecklistItems} // Pass the newly filtered list
              selectedPropertyId={effectiveSelectedPropertyId}
            />

            {/* ========================================= */}
            {/* SEASONAL MAINTENANCE BANNER - EXISTING_OWNER ONLY */}
            {/* ========================================= */}
            {homeownerSegment === 'EXISTING_OWNER' && effectiveSelectedPropertyId && (
              <motion.div {...sectionMotion(6)}>
                <SeasonalBanner propertyId={effectiveSelectedPropertyId} />
                <SeasonalWidget propertyId={effectiveSelectedPropertyId} />
              </motion.div>
            )}
          </>
        );
      })()}
      </DashboardShell>
      <MilestoneCelebration
        type={celebration.type}
        isOpen={celebration.isOpen}
        onClose={dismiss}
      />
    </>
  );
}
