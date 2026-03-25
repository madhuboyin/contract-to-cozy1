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
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';


const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped'; 

const DEFAULT_LOCAL_UPDATES: LocalUpdate[] = [
  {
    id: 'demo-local-update-verizon',
    title: 'Verizon Fios owner offer',
    shortDescription: 'Check current fiber pricing and owner discounts available in your area.',
    category: 'INTERNET',
    sourceName: 'Verizon Fios',
    isSponsored: true,
    ctaText: 'View offer',
    ctaUrl: 'https://www.verizon.com/home/fios/',
  },
  {
    id: 'demo-local-update-tmobile',
    title: 'T-Mobile 5G Home promotion',
    shortDescription: 'Compare 5G home internet promotions against your current monthly bill.',
    category: 'INTERNET',
    sourceName: 'T-Mobile',
    isSponsored: true,
    ctaText: 'Compare plans',
    ctaUrl: 'https://www.t-mobile.com/home-internet',
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const { toast } = useToast();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  
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
    if (!selectedPropertyId) {
      setLocalUpdates(withLocalUpdatesFallback([]));
      return;
    }

    api
      .getLocalUpdates(selectedPropertyId)
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
  }, [selectedPropertyId]);

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

  const userSegment = homeownerSegment ?? user.segment;
  const isHomeBuyerSegment = userSegment === 'HOME_BUYER';
  const isOwnerSegment = !isHomeBuyerSegment;
  const checklistItems = (data.checklist?.items || []) as ChecklistItem[];
  
  // Derived property values using the context state
  const properties = data.properties;
  const selectedProperty = properties.find(p => p.id === selectedPropertyId); 
  const sectionMotion = (index: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: index * 0.08 },
  });
  
  if (isHomeBuyerSegment) {
    if (isMobileViewport) {
      return (
        <MobileHomeBuyerDashboard
          userFirstName={user.firstName}
          properties={data.properties}
          selectedPropertyId={selectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
          bookings={data.bookings}
          checklistItems={checklistItems}
          localUpdates={localUpdates}
        />
      );
    }

    return (
      <HomeBuyerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties}
        checklistItems={checklistItems}
      />
    );
  }

  if (isOwnerSegment && isMobileViewport) {
    return (
      <MobileDashboardHome
        userFirstName={user.firstName}
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onPropertyChange={setSelectedPropertyId}
        localUpdates={localUpdates}
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
        {isOwnerSegment && selectedPropertyId && (
          <motion.div {...sectionMotion(0)}>
            <PriorityAlertBanner propertyId={selectedPropertyId} />
          </motion.div>
        )}

        {/* MORNING HOME PULSE */}
        {isOwnerSegment && selectedPropertyId && (
          <motion.section className="mb-5 md:mb-6" {...sectionMotion(1)}>
            <MorningHomePulseCard propertyId={selectedPropertyId} />
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
                  window.open(update.ctaUrl, '_blank', 'noopener,noreferrer');
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
          {selectedPropertyId && (
            <ShareVaultButton
              propertyId={selectedPropertyId}
              propertyAddress={selectedProperty?.address}
            />
          )}
        </motion.div>
        <motion.div
          className="mb-8 rounded-2xl border border-gray-200/80 bg-gray-50/60 p-3 sm:p-4"
          {...sectionMotion(2)}
        >
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
            <HomeScoreReportCard propertyId={selectedPropertyId} />
            <PropertyHealthScoreCard property={selectedProperty} />
            <PropertyRiskScoreCard propertyId={selectedPropertyId} />
            <FinancialEfficiencyScoreCard propertyId={selectedPropertyId} />
          </div>
        </motion.div>

        <motion.div {...sectionMotion(3)}>
          <GuidanceInlinePanel
            propertyId={selectedPropertyId}
            title="Deterministic Next Steps"
            subtitle="Complete decision, coverage, and pricing steps in order before execution actions."
            limit={3}
          />
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
              <HomeSavingsCheckToolCard propertyId={selectedPropertyId || ''} />
              <CoverageIntelligenceToolCard propertyId={selectedPropertyId || ''} />
              <RiskPremiumOptimizerToolCard propertyId={selectedPropertyId || ''} />
              <DoNothingSimulatorToolCard propertyId={selectedPropertyId || ''} />
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
        const filteredChecklistItems = selectedPropertyId
            ? checklistItems.filter(item => item.propertyId === selectedPropertyId)
            : []; 

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
