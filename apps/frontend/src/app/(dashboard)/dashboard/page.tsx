// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { ChevronDown, ChevronUp, ClipboardList, Loader2, ShieldAlert, TrendingUp } from 'lucide-react';
import { Booking, ChecklistItem, Warranty, InsurancePolicy, LocalUpdate } from '@/types';
import { ScoredProperty } from './types'; 
import { differenceInDays, isPast, parseISO } from 'date-fns'; 

// NEW IMPORTS FOR SCORECARDS AND LAYOUT
import { DashboardShell } from '@/components/DashboardShell';
import { ActionCenter } from '@/components/orchestration/ActionCenter';
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
import { RoomsSnapshotSection } from './components/RoomsSnapshotSection';
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import MorningHomePulseCard from './components/MorningHomePulseCard';
import { HomeScoreReportCard } from './components/HomeScoreReportCard';
import { ShareVaultButton } from './components/ShareVaultButton';


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

export default function DashboardPage() {
  const { user, loading: userLoading } = useAuth();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [showAllDecisionTools, setShowAllDecisionTools] = useState(false);
  const [orchestrationSummary, setOrchestrationSummary] = useState<{
    pendingActionCount: number;
  } | null>(null);
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
  const decisionTools = selectedPropertyId
    ? [
        {
          title: 'Home Savings Check',
          description: 'Find recurring bill savings opportunities.',
          href: `/dashboard/properties/${selectedPropertyId}/tools/home-savings`,
        },
        {
          title: 'Coverage Intelligence',
          description: 'Assess insurance and warranty fit.',
          href: `/dashboard/properties/${selectedPropertyId}/tools/coverage-intelligence`,
        },
        {
          title: 'Risk-to-Premium Optimizer',
          description: 'Lower premium pressure without increasing risk.',
          href: `/dashboard/properties/${selectedPropertyId}/tools/risk-premium-optimizer`,
        },
        {
          title: 'Do-Nothing Simulator',
          description: 'See the downside of delayed action.',
          href: `/dashboard/properties/${selectedPropertyId}/tools/do-nothing`,
        },
      ]
    : [];
  const visibleDecisionTools = showAllDecisionTools ? decisionTools : decisionTools.slice(0, 2);
  
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
      {selectedProperty && properties.length > 0 && (
        <WelcomeSection
          userName={user?.firstName || 'there'}
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          onPropertyChange={setSelectedPropertyId}
        />
      )}

      <DashboardShell className="pt-0 md:pt-0">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            {selectedPropertyId && <MorningHomePulseCard propertyId={selectedPropertyId} />}

            {localUpdates.length > 0 && (
              <LocalUpdatesCarousel
                updates={localUpdates}
                variant="ticker"
                onDismiss={async (id) => {
                  setLocalUpdates((prev) => prev.filter((u) => u.id !== id));
                  await api.dismissLocalUpdate(id);
                }}
                onCtaClick={(id) => {
                  const update = localUpdates.find((u) => u.id === id);
                  if (update?.ctaUrl) {
                    window.open(update.ctaUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
              />
            )}

            {selectedPropertyId && (
              <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm md:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Action Center</h2>
                      <p className="text-sm text-slate-600">
                        Your most important tasks right now.
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/actions?propertyId=${selectedPropertyId}`}
                    className="inline-flex min-h-[40px] w-fit items-center whitespace-nowrap text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
                  >
                    View all actions
                  </Link>
                </div>

                <ActionCenter propertyId={selectedPropertyId} maxItems={5} />
              </section>
            )}

            <RoomsSnapshotSection propertyId={selectedPropertyId} />

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Property Intelligence Scores</h2>
                    <p className="text-sm text-slate-600">Weekly health, risk, and financial trendline.</p>
                  </div>
                </div>
                {selectedPropertyId && (
                  <ShareVaultButton
                    propertyId={selectedPropertyId}
                    propertyAddress={selectedProperty?.address}
                  />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HomeScoreReportCard propertyId={selectedPropertyId} />
                {selectedProperty && <PropertyHealthScoreCard property={selectedProperty} />}
                <PropertyRiskScoreCard propertyId={selectedPropertyId} />
                <FinancialEfficiencyScoreCard propertyId={selectedPropertyId} />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:col-span-4">
            {homeownerSegment === 'EXISTING_OWNER' && selectedPropertyId && (
              <>
                <SeasonalBanner propertyId={selectedPropertyId} />
                <SeasonalWidget propertyId={selectedPropertyId} />
              </>
            )}

            {selectedPropertyId && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-lg bg-teal-100 p-2">
                    <ShieldAlert className="h-5 w-5 text-teal-700" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Decision Tools</h2>
                    <p className="text-sm text-slate-600">Compact shortcuts to the highest-impact analyses.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {visibleDecisionTools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="flex items-start justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-white"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{tool.title}</p>
                        <p className="text-xs text-slate-600">{tool.description}</p>
                      </div>
                      <span className="ml-3 text-xs font-semibold text-teal-700">Open</span>
                    </Link>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAllDecisionTools((prev) => !prev)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  {showAllDecisionTools ? 'Show fewer tools' : 'Show all tools'}
                  {showAllDecisionTools ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                <div className="mt-1 text-xs text-slate-500">
                  {orchestrationSummary?.pendingActionCount
                    ? `${orchestrationSummary.pendingActionCount} pending orchestrated actions detected.`
                    : 'No pending orchestrated actions right now.'}
                </div>
              </section>
            )}
          </aside>
        </div>

        {(() => {
          const filteredProperties = selectedProperty ? [selectedProperty] : [];

          return (
            <ExistingOwnerDashboard
              properties={filteredProperties}
              selectedPropertyId={selectedPropertyId}
            />
          );
        })()}
      </DashboardShell>
    </>
  );
}
