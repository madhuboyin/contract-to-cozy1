// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User, ChecklistItem, Warranty, InsurancePolicy } from '@/types'; 
import { ScoredProperty } from './types'; 
import { differenceInDays, isPast, parseISO } from 'date-fns'; // [NEW IMPORT]

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
// [NEW IMPORT]
import { usePropertyContext } from '@/lib/property/PropertyContext';
// [NEW IMPORT]
import { WelcomeModal } from './components/WelcomeModal'; // <-- NEW IMPORT
// END NEW IMPORTS

import { HomeBuyerDashboard } from './components/HomeBuyerDashboard';
import { ExistingOwnerDashboard } from './components/ExistingOwnerDashboard';

// DEPRECATE: This local storage key is no longer used for forced redirect logic.
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


// Helper to format the address for display
const formatAddress = (property: Property) => {
    return `${property.address}, ${property.city}, ${property.state}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const [redirectChecked, setRedirectChecked] = useState(false);
  // [MODIFICATION] Removed unused shouldRedirect state
  // const [shouldRedirect, setShouldRedirect] = useState(false); 
  // [NEW STATE] To control the soft redirect overlay
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    urgentActions: [], // Initialize new field
    isLoading: true,
    error: null,
  });
  
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();


  // HIGHEST PRIORITY: Check initial state and determine if soft redirect is needed
  useEffect(() => {
    const checkRedirect = async () => {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║           ONBOARDING CHECK - Soft Redirect             ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      
      if (userLoading) {
        console.log('⏸️ User still loading, waiting...');
        return;
      }

      if (!user) {
        console.log('❌ No user, skipping check');
        setRedirectChecked(true);
        return;
      }

      if (redirectChecked) {
        console.log('✅ Already checked initial state');
        return;
      }

      console.log('👤 User:', user.firstName);
      console.log('👤 User segment:', user.segment);

      // Only EXISTING_OWNER needs this check
      if (user.segment !== 'EXISTING_OWNER') {
        console.log('✋ Not EXISTING_OWNER, no soft redirect needed');
        setRedirectChecked(true);
        return;
      }

      // [MODIFICATION] REMOVE CHECK FOR PROPERTY_SETUP_SKIPPED_KEY
      // The flow is now intentionally blocked until setup starts.
      // We still rely on the banner for existing users who might have skipped before.

      // User has NOT skipped - check properties
      console.log('🔍 Checking property count...');
      try {
        const propertiesRes = await api.getProperties();
        const propertyCount = propertiesRes.success ? propertiesRes.data.properties.length : 0;
        
        console.log('🏠 Property count:', propertyCount);

        if (propertyCount === 0) {
          console.log('');
          console.log('🚀 SOFT REDIRECT TRIGGERED: Show WelcomeModal!');
          
          // [MODIFICATION] Set new state to display the Welcome Modal/Overlay
          setShowWelcomeScreen(true);
          setRedirectChecked(true); // Treat this as the end of the redirect check
          setData(prev => ({ ...prev, isLoading: false })); // Stop loading spinner in main render
        } else {
          console.log('✋ User has', propertyCount, 'properties, proceed to load dashboard data');
          setRedirectChecked(true);
        }
      } catch (error) {
        console.error('❌ Error checking properties:', error);
        setRedirectChecked(true);
        setData(prev => ({ ...prev, error: 'Failed to check property status.', isLoading: false }));
      }
    };

    checkRedirect();
  }, [user, userLoading, redirectChecked, router]);

  // Load dashboard data ONLY if not showing the welcome screen and redirect check completes
  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      console.log('DEBUG: User not logged in, halting fetch.');
      setData(prev => ({ ...prev, isLoading: false, error: 'User not logged in.' }));
      return;
    }

    try {
      console.log('📊 Loading dashboard data...');
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      // FIX 2: Fetching Checklist, Warranties, and Insurance Policies via direct API client calls
      const [
        bookingsRes, 
        propertiesRes, 
        checklistRes,
        warrantiesRes, 
        insuranceRes
      ] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        api.getChecklist(), // Use cleaner API call
        api.listWarranties(),
        api.listInsurancePolicies(),
      ]);
      
      const properties = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];
      const checklistItems = (checklistRes.success && checklistRes.data.items) || [];
      const warranties = (warrantiesRes.success && warrantiesRes.data.warranties) || [];
      const insurancePolicies = (insuranceRes.success && insuranceRes.data.policies) || [];
      
      // FIX 3: Consolidate data to generate the urgent action list
      const urgentActions = consolidateUrgentActions(
        properties, 
        checklistItems, 
        warranties, 
        insurancePolicies
      );


      let fetchedChecklist = null;
      if (checklistRes.success && checklistRes.data) {
          fetchedChecklist = checklistRes.data;
      }
      
      console.log('✅ Dashboard data loaded');

      const defaultPropId = properties.find(p => p.isPrimary)?.id || properties[0]?.id;
      
      setData({
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: properties,
        checklist: fetchedChecklist as DashboardData['checklist'], 
        urgentActions: urgentActions, // Assign the new consolidated data
        isLoading: false,
        error: null,
      });
      
      setSelectedPropertyId(defaultPropId);

    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: error.message || 'An unexpected error occurred.' }));
    }
  }, [user, setSelectedPropertyId]); // Added fetchDashboardData to useCallback

  useEffect(() => {
    // [MODIFICATION] Only fetch data if the user has properties (i.e., Welcome Screen is not showing)
    if (user && !userLoading && redirectChecked && !showWelcomeScreen) {
      console.log('📊 Redirect check complete, fetching dashboard data...');
      fetchDashboardData();
    }
  }, [user, userLoading, redirectChecked, showWelcomeScreen, fetchDashboardData]); // Dependency update


  // --- CONDITIONAL RENDERING FOR LOADING AND MODAL ---
  
  if (userLoading || !redirectChecked || data.isLoading) {
    // [MODIFICATION] Added a check to show a dedicated loading message while property count is being checked.
    const loadingMessage = showWelcomeScreen ? 'Preparing welcome screen...' : 'Loading your personalized dashboard...';
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="ml-3 text-lg text-gray-600">{loadingMessage}</p>
      </div>
    );
  }

  // [NEW RENDER CHECK] Display the Welcome Modal if triggered
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
  console.log('🔍 Selected property:', selectedProperty);
  const isMultiProperty = properties.length > 1;

  console.log('🎨 Rendering dashboard for', userSegment);
  
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
    <DashboardShell>
      <PageHeader className="pt-2 pb-2 gap-1">
        {/* FIX 1: Welcome message moved to the top and personalized */}
        <PageHeaderHeading>Welcome, {user.firstName}! Property Intelligence Dashboard</PageHeaderHeading>
      </PageHeader>
      
      {/* --- Property Selection Row --- */}
      {selectedProperty && (
          <div className="flex items-center space-x-3 mb-4"> 
              {!isMultiProperty ? (
                  // Scenario 1: Single Property - Show simplified address as standard paragraph text
                  <p className="text-lg font-medium text-gray-700">
                      {selectedProperty.name || 'Your Home'}: {formatAddress(selectedProperty)}
                  </p>
              ) : (
                  // Scenario 2: Multiple Properties - Show Dropdown
                  <div className="flex items-center space-x-2">
                      <Select 
                          value={selectedPropertyId} 
                          onValueChange={setSelectedPropertyId}
                      >
                          <SelectTrigger className="w-[300px] text-lg font-medium">
                              <SelectValue placeholder="Select a property" />
                          </SelectTrigger>
                          <SelectContent>
                              {properties.map((property) => (
                                  <SelectItem key={property.id} value={property.id}>
                                      {property.name ? `${property.name} - ${formatAddress(property)}` : formatAddress(property)}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
              )}
              <Link href="/dashboard/properties" className="text-sm text-blue-500 hover:underline">
                  {isMultiProperty ? 'Manage Properties' : 'View Details'}
              </Link>
          </div>
      )}
      {/* --- END Property Selection Row --- */}

      {/* Scorecards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        
        {/* 1. Property Health Score: Uses selectedPropertyId */}
        {selectedProperty ? (
          <div className="md:col-span-1">
            <PropertyHealthScoreCard property={selectedProperty} /> 
          </div>
        ) : (
           <div className="md:col-span-1">
            <PropertyHealthScoreCard property={{} as ScoredProperty} />
           </div>
        )}
        
        {/* 2. Risk Assessment Score: Uses selectedPropertyId */}
        <div className="md:col-span-1">
            <PropertyRiskScoreCard propertyId={selectedPropertyId} />
        </div>
        
        {/* 3. Financial Efficiency Score: Uses selectedPropertyId */}
        <div className="md:col-span-1">
            <FinancialEfficiencyScoreCard propertyId={selectedPropertyId} />
        </div>
        
      </div>
      
      {/* ExistingOwnerDashboard renders the rest of the layout below the scorecards */}
      <ExistingOwnerDashboard 
        userFirstName={user.firstName}
        bookings={data.bookings}
        properties={data.properties}
        checklistItems={checklistItems}
        selectedPropertyId={selectedPropertyId} // Pass selected ID from context state
      />
    </DashboardShell>
  );
}