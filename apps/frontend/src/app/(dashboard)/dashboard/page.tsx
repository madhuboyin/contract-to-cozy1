// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
// NEW IMPORTS FOR PROPERTY SELECTION
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { TrendingUp } from 'lucide-react';
import { ShieldAlert } from 'lucide-react';
import { CircleHelp } from 'lucide-react';
import { SeasonalBanner } from '@/components/seasonal/SeasonalBanner';
import { SeasonalWidget } from '@/components/seasonal/SeasonalWidget';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';
import { WelcomeSection } from '@/components/WelcomeSection';
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


const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 

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

// Helper to check if a checklist item could be asset-driven
function isAssetDrivenForRouting(item: ChecklistItem): boolean {
  if (
    item.serviceCategory === 'ADMIN' ||
    item.serviceCategory === 'FINANCE' ||
    item.serviceCategory === 'INSURANCE' ||
    item.serviceCategory === 'WARRANTY' ||
    item.serviceCategory === 'ATTORNEY'
  ) {
    return false;
  }

  return true;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const { toast } = useToast();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [orchestrationSummary, setOrchestrationSummary] = useState<{
    pendingActionCount: number;
  } | null>(null);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [showRiskHelp, setShowRiskHelp] = useState(false);
  
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
  const { data: homeownerSegment } = useHomeownerSegment(); // Get user segment for conditional features
  
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
  
      if (scoredProperties.length > 0 && !selectedPropertyId) {
        setSelectedPropertyId(scoredProperties[0].id);
      }
      // Phase 2: Fetch orchestration summary for selected property
      const propertyIdForOrchestration =
      selectedPropertyId || scoredProperties[0]?.id;

      if (propertyIdForOrchestration) {
        try {
          const orchestration = await api.getOrchestrationSummary(
            propertyIdForOrchestration
          );
          setOrchestrationSummary(orchestration);
        } catch (e) {
          console.warn('Failed to fetch orchestration summary', e);
          setOrchestrationSummary(null);
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
  }, [user, selectedPropertyId, setSelectedPropertyId]);
  
  useEffect(() => {
    if (!userLoading && user) {
      fetchDashboardData();
    }
  }, [userLoading, user, fetchDashboardData]);

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
    if (!selectedPropertyId || user?.segment !== 'EXISTING_OWNER') {
      setLocalUpdates([]);
      return;
    }

    api
      .getLocalUpdates(selectedPropertyId)
      .then((res) => {
        if (res.success) {
          setLocalUpdates(res.data.updates || []);
        } else {
          setLocalUpdates([]);
        }
      })
      .catch(() => {
        setLocalUpdates([]);
      });
  }, [selectedPropertyId, user?.segment]);

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

  const userSegment = user.segment;
  const checklistItems = (data.checklist?.items || []) as ChecklistItem[];
  
  // Derived property values using the context state
  const properties = data.properties;
  const selectedProperty = properties.find(p => p.id === selectedPropertyId); 
  const isMultiProperty = properties.length > 1;
  const sectionMotion = (index: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.08 },
  });
  
  if (userSegment === 'HOME_BUYER') {
    return (
      <HomeBuyerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties}
        checklistItems={checklistItems}
      />
    );
  }

  // Existing Owner Dashboard (now incorporates the scorecard grid at the top level)
  return (
    <>
      {/* 1. WELCOME SECTION - FULL WIDTH */}
      {selectedProperty && properties.length > 0 && (
        <WelcomeSection
          userName={user?.firstName || 'there'}
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
        />
      )}

      {/* 2. CONSTRAINED WIDTH AREA (Aligns with other cards) */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        {userSegment === 'EXISTING_OWNER' && selectedPropertyId && (
          <motion.div {...sectionMotion(0)}>
            <PriorityAlertBanner propertyId={selectedPropertyId} />
          </motion.div>
        )}

        {/* MORNING HOME PULSE */}
        {userSegment === 'EXISTING_OWNER' && selectedPropertyId && (
          <motion.section className="mb-5 md:mb-6" {...sectionMotion(1)}>
            <MorningHomePulseCard propertyId={selectedPropertyId} />
          </motion.section>
        )}

        {/* LOCAL UPDATES TICKER */}
        {userSegment === 'EXISTING_OWNER' && localUpdates.length > 0 && (
          <section className="mb-5 md:mb-6">
            <LocalUpdatesCarousel
              updates={localUpdates}
              variant="ticker"
              onDismiss={async (id) => {
                setLocalUpdates((prev) => prev.filter((u) => u.id !== id));
                await api.dismissLocalUpdate(id);
                const toastRef = toast({
                  title: 'Offer dismissed',
                  description: 'You can manage offers in Settings.',
                });
                window.setTimeout(() => toastRef.dismiss(), 2000);
              }}
              onCtaClick={(id) => {
                const update = localUpdates.find((u) => u.id === id);
                if (update?.ctaUrl) {
                  window.open(update.ctaUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            />
          </section>
        )}
        
        {/* PROPERTY INTELLIGENCE SCORES - IMMEDIATELY BELOW WELCOME */}
        <motion.div className="flex items-center justify-between gap-3 mb-6" {...sectionMotion(2)}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Property Intelligence Scores</h2>
              <p className="text-sm text-gray-500">Real-time health, risk, and financial analysis</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => setShowRiskHelp((prev) => !prev)}
              >
                <CircleHelp className="h-3.5 w-3.5" />
                Why are there two risk numbers?
              </button>
            </div>
          </div>
          {selectedPropertyId && (
            <ShareVaultButton
              propertyId={selectedPropertyId}
              propertyAddress={selectedProperty?.address}
            />
          )}
        </motion.div>
        {showRiskHelp && (
          <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
            Morning Home Pulse shows <span className="font-semibold">Risk Level</span> (weather + overdue maintenance exposure, lower is better).
            Property Intelligence shows <span className="font-semibold">Protection Score</span> and <span className="font-semibold">Risk Exposure</span> (how protected your home is overall and current dollar exposure).
          </div>
        )}
        <motion.div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-6 mb-8" {...sectionMotion(2)}>
          <HomeScoreReportCard propertyId={selectedPropertyId} />
          {selectedProperty && (
            <PropertyHealthScoreCard property={selectedProperty} />
          )}
          <PropertyRiskScoreCard propertyId={selectedPropertyId} />
          <FinancialEfficiencyScoreCard propertyId={selectedPropertyId} />
        </motion.div>
        <div className="section-divider my-5 md:my-6" />

        {/* ROOMS SNAPSHOT */}
        <motion.div {...sectionMotion(3)}>
          <RoomsSnapshotSection propertyId={selectedPropertyId} />
        </motion.div>

        {/* HORIZONTAL SEPARATOR */}
        <div className="section-divider my-5 md:my-6" />
        
        {/* AI INSURANCE/PREMIUM DECISION TOOLS */}
        <motion.section className="mb-4" {...sectionMotion(6)}>
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-teal-100 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Coverage, Premium & Inaction Intelligence</h2>
              <p className="text-sm text-gray-600">
                Educational guidance to compare coverage, premium pressure, and delayed-action downside.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <HomeSavingsCheckToolCard propertyId={selectedPropertyId || ''} />
            <CoverageIntelligenceToolCard propertyId={selectedPropertyId || ''} />
            <RiskPremiumOptimizerToolCard propertyId={selectedPropertyId || ''} />
            <DoNothingSimulatorToolCard propertyId={selectedPropertyId || ''} />
          </div>
        </motion.section>
        <div className="section-divider my-5 md:my-6" />
      </div>

      <DashboardShell className="pt-0 md:pt-0">
      {/* Filter data by selected property before passing to child components */}
      {/* This ensures the red banner and other components show data for the currently selected property only */}
      {(() => {
        // Filter urgent actions to only those belonging to the selected property
        const filteredUrgentActions = data.urgentActions.filter(
          action => action.propertyId === selectedPropertyId
        );
        
        // Filter properties to only the selected one (for consistency)
        const filteredProperties = selectedProperty ? [selectedProperty] : [];
        
        // FIX: Filter checklist items by selected property ID
        const filteredChecklistItems = selectedPropertyId
            ? checklistItems.filter(item => item.propertyId === selectedPropertyId)
            : []; 

        // Calculate if there are any asset-driven actions
        const hasAssetDrivenActions = filteredChecklistItems.some(item =>
          isAssetDrivenForRouting(item) &&
          item.status === 'PENDING'
        );

        return (
          <>
            <ExistingOwnerDashboard
              bookings={data.bookings}
              properties={filteredProperties} // Pass only selected property
              checklistItems={filteredChecklistItems} // Pass the newly filtered list
              selectedPropertyId={selectedPropertyId}
            />

            {/* ========================================= */}
            {/* SEASONAL MAINTENANCE BANNER - EXISTING_OWNER ONLY */}
            {/* ========================================= */}
            {homeownerSegment === 'EXISTING_OWNER' && selectedPropertyId && (
              <motion.div {...sectionMotion(6)}>
                <SeasonalBanner propertyId={selectedPropertyId} />
                <SeasonalWidget propertyId={selectedPropertyId} />
              </motion.div>
            )}
          </>
        );
      })()}
      </DashboardShell>
    </>
  );
}
