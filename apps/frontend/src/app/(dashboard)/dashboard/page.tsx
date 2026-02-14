// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2, DollarSign, ChevronLeft } from 'lucide-react';
import { Booking, Property, User, ChecklistItem, Warranty, InsurancePolicy } from '@/types'; 
import { ScoredProperty } from './types'; 
import { differenceInDays, isPast, parseISO } from 'date-fns'; 

// NEW IMPORTS FOR SCORECARDS AND LAYOUT
import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader, PageHeaderHeading } from '@/components/page-header';
import { PropertyHealthScoreCard } from './components/PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './components/PropertyRiskScoreCard'; 
import { FinancialEfficiencyScoreCard } from './components/FinancialEfficiencyScoreCard'; 
import { MyPropertiesCard } from './components/MyPropertiesCard'; 
// NEW IMPORTS FOR PROPERTY SELECTION
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { WelcomeModal } from './components/WelcomeModal';

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';
import { AlertTriangle } from 'lucide-react';
import { FileText } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Zap } from 'lucide-react'; // Reverted: Removed CloudRain import
import { Cloud } from 'lucide-react';
import { Home } from 'lucide-react';
import { TrendingUp } from 'lucide-react';
import { Camera } from 'lucide-react';
import { Scale } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { SeasonalBanner } from '@/components/seasonal/SeasonalBanner';
import { SeasonalWidget } from '@/components/seasonal/SeasonalWidget';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';
import { WelcomeSection } from '@/components/WelcomeSection';
import { RoomsSnapshotSection } from './components/RoomsSnapshotSection';


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
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [orchestrationSummary, setOrchestrationSummary] = useState<{
    pendingActionCount: number;
  } | null>(null);
  
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
  
  // Carousel ref and scroll function
  const carouselRef = useRef<HTMLDivElement>(null);
  
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return;
    
    const scrollAmount = 300; // pixels to scroll
    const currentScroll = carouselRef.current.scrollLeft;
    const newScroll = direction === 'left' 
      ? currentScroll - scrollAmount 
      : currentScroll + scrollAmount;
    
    carouselRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth'
    });
  };

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
        
        {/* PROPERTY INTELLIGENCE SCORES - IMMEDIATELY BELOW WELCOME */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Property Intelligence Scores</h2>
            <p className="text-sm text-gray-500">Real-time health, risk, and financial analysis</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6 mb-8">
          {selectedProperty && (
            <PropertyHealthScoreCard property={selectedProperty} />
          )}
          <PropertyRiskScoreCard propertyId={selectedPropertyId} />
          <FinancialEfficiencyScoreCard propertyId={selectedPropertyId} />
        </div>

        {/* ROOMS SNAPSHOT */}
        <RoomsSnapshotSection propertyId={selectedPropertyId} />

        {/* HORIZONTAL SEPARATOR */}
        <div className="w-full border-t border-gray-200 mb-8" />

          {/* 3. AI CARDS CAROUSEL */}
          <section className="mb-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">AI-Powered Tools</h2>
                <p className="text-sm text-gray-500">Smart automation for your property</p>
              </div>
            </div>

            {/* FUNCTIONAL SCROLL BUTTONS */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => scrollCarousel('left')}
                className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
                aria-label="Scroll Left"
              >
                <ChevronLeft className="w-4 h-4" /> 
              </button>
              <button 
                onClick={() => scrollCarousel('right')}
                className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
                aria-label="Scroll Right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CAROUSEL CONTAINER: Linked with carouselRef */}
          <div 
            ref={carouselRef}
            className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth"
          >
            {/* AI CARDS (Remains same as your previous working version) */}
            {[
              { href: 'emergency', icon: AlertTriangle, color: 'text-red-600', title: 'Emergency Help', desc: 'Instant AI guidance' },
              { href: 'documents', icon: FileText, color: 'text-purple-600', title: 'Document Vault', desc: 'Smart analysis' },
              { href: 'oracle', icon: Zap, color: 'text-purple-600', title: 'Appliance Oracle', desc: 'Predict failures' },
              { href: 'budget', icon: DollarSign, color: 'text-blue-600', title: 'Budget Planner', desc: '12-month predictions' },
              { href: 'climate', icon: Cloud, color: 'text-sky-600', title: 'Climate Risk', desc: 'Risk analysis' },
              { href: 'modifications', icon: Home, color: 'text-indigo-600', title: 'Home Upgrades', desc: 'AI recommendations' },
              { href: 'appreciation', icon: TrendingUp, color: 'text-green-600', title: 'Value Tracker', desc: 'Track market trends' },
              { href: 'energy', icon: Zap, color: 'text-yellow-600', title: 'Energy Audit', desc: 'Energy-saving tips' },
              { href: 'visual-inspector', icon: Camera, color: 'text-purple-600', title: 'Visual Inspector', desc: 'AI image analysis' },
              { href: 'tax-appeal', icon: Scale, color: 'text-blue-700', title: 'Tax Appeals', desc: 'AI appeal analysis' },
            ].map((card, idx) => (
              <Link 
                key={idx} 
                href={`/dashboard/${card.href}?propertyId=${selectedPropertyId}`}
                className="snap-start min-w-[280px] md:min-w-[calc(25%-12px)] flex-shrink-0"
              >
                <div className="flex items-start p-5 bg-white border border-gray-200 rounded-xl hover:border-teal-500 hover:shadow-lg transition-all cursor-pointer h-full">
                  <div className="flex-shrink-0 mr-4">
                    <card.icon className={`h-10 w-10 ${card.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 leading-tight mb-1">{card.title}</h3>
                    <p className="text-xs text-gray-500">{card.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <DashboardShell className="pt-0 md:pt-0">
      {/* ========================================= */}
      {/* SEASONAL MAINTENANCE BANNER - EXISTING_OWNER ONLY */}
      {/* ========================================= */}
      {homeownerSegment === 'EXISTING_OWNER' && selectedPropertyId && (
        <SeasonalBanner propertyId={selectedPropertyId} />
      )}

      {homeownerSegment === 'EXISTING_OWNER' && selectedPropertyId && (
        <SeasonalWidget propertyId={selectedPropertyId} />
      )}

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
          <ExistingOwnerDashboard
            bookings={data.bookings}
            properties={filteredProperties} // Pass only selected property
            checklistItems={filteredChecklistItems} // Pass the newly filtered list
            selectedPropertyId={selectedPropertyId}
          />
        );
      })()}
      </DashboardShell>
    </>
  );
}
