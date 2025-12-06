// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';
import { Booking, Property, User, ChecklistItem } from '@/types'; 
import { ScoredProperty } from './types'; 

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

interface DashboardData {
    bookings: Booking[];
    properties: ScoredProperty[];
    checklist: { id: string, items: ChecklistItem[] } | null; 
    isLoading: boolean;
    error: string | null;
}

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
  const fetchDashboardData = async () => {
    if (!user) {
      console.log('DEBUG: User not logged in, halting fetch.');
      setData(prev => ({ ...prev, isLoading: false, error: 'User not logged in.' }));
      return;
    }

    try {
      console.log('📊 Loading dashboard data...');
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const CHECKLIST_URL = `${API_URL}/api/checklist`;
      
      const checklistFetchPromise = fetch(CHECKLIST_URL, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        }).then(async (res) => {
            if (!res.ok) {
                throw new Error(`Checklist API returned status ${res.status}.`);
            }
            return res.json();
        });

      const [bookingsRes, propertiesRes, checklistRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        checklistFetchPromise,
      ]);
      
      const newProperties: ScoredProperty[] = propertiesRes.success ? (propertiesRes.data.properties as ScoredProperty[]) : [];

      let fetchedChecklist = null;
      if (typeof checklistRes === 'object' && checklistRes !== null) {
          if (checklistRes.success && checklistRes.data) {
              fetchedChecklist = checklistRes.data;
          } else if (Array.isArray(checklistRes.items)) {
              fetchedChecklist = checklistRes;
          }
      }
      
      console.log('✅ Dashboard data loaded');

      const defaultPropId = newProperties.find(p => p.isPrimary)?.id || newProperties[0]?.id;
      
      setData({
        bookings: bookingsRes.success ? bookingsRes.data.bookings : [],
        properties: newProperties,
        checklist: fetchedChecklist as DashboardData['checklist'], 
        isLoading: false,
        error: null,
      });
      
      setSelectedPropertyId(defaultPropId);

    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false, error: error.message || 'An unexpected error occurred.' }));
    }
  };

  useEffect(() => {
    // [MODIFICATION] Only fetch data if the user has properties (i.e., Welcome Screen is not showing)
    if (user && !userLoading && redirectChecked && !showWelcomeScreen) {
      console.log('📊 Redirect check complete, fetching dashboard data...');
      fetchDashboardData();
    }
  }, [user, userLoading, redirectChecked, showWelcomeScreen]); // Dependency update


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