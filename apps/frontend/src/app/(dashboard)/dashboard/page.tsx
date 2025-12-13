// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Loader2, DollarSign } from 'lucide-react';
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
import { Zap } from 'lucide-react'; 
// FIX: Update import path for AIClimateRiskCard to the shared components directory
import { AIClimateRiskCard } from '@/components/AIClimateRiskCard';

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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const [redirectChecked, setRedirectChecked] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  
  const [data, setData] = useState<DashboardData>({
    bookings: [],
    properties: [],
    checklist: null,
    urgentActions: [], 
    isLoading: true,
    error: null,
  });
  
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();

  // --- DATA FETCHING LOGIC (unchanged) ---
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    
    setData(prev => ({ ...prev, isLoading: true }));
    
    try {
      const [bookingsRes, propertiesRes, checklistRes, warrantiesRes, policiesRes] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        api.getChecklist(),
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
        healthScore: (p as any).healthScore || { 
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

      if (scoredProperties.length > 0 && !selectedPropertyId) {
        setSelectedPropertyId(scoredProperties[0].id);
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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
        {/* Welcome message */}
        <PageHeaderHeading>Welcome, {user.firstName}! Property Intelligence Dashboard</PageHeaderHeading>
      </PageHeader>
      
      {/* --- Property Selection Row --- */}
      {selectedProperty && (
          <div className="flex items-center space-x-3 mb-6"> 
              {!isMultiProperty ? (
                  // Scenario 1: Single Property
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

      {/* ========================================= */}
      {/* AI FEATURES SECTION */}
      {/* ========================================= */}
      <section className="mb-8">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-purple-200">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">AI-Powered Features</h2>
          <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-semibold">
            NEW
          </span>
        </div>

        {/* AI Cards Grid - MODIFIED to 5 columns (lg:grid-cols-5) to fit all AI features in one row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Emergency Troubleshooter */}
          <Link href="/dashboard/emergency">
            <div className="relative bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              {/* Sparkle indicator */}
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              
              {/* Icon */}
              <div className="p-3 bg-red-100 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              
              {/* Content */}
              <h3 className="text-lg font-bold text-red-900 mb-1">
                Emergency Troubleshooter
              </h3>
              <p className="text-red-700 text-sm">
                AI guidance for home emergencies
              </p>
            </div>
          </Link>

          {/* Document Intelligence */}
          <Link href="/dashboard/documents">
            <div className="relative bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              
              <div className="p-3 bg-purple-100 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
                <FileText className="h-7 w-7 text-purple-600" />
              </div>
              
              <h3 className="text-lg font-bold text-purple-900 mb-1">
                Document Vault
              </h3>
              <p className="text-purple-700 text-sm">
                Smart document analysis
              </p>
            </div>
          </Link>
          
          {/* Appliance Oracle */}
          <Link href="/dashboard/oracle">
            <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              
              <div className="p-3 bg-purple-100 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
                <Zap className="h-7 w-7 text-purple-600" />
              </div>
              
              <h3 className="text-lg font-bold text-purple-900 mb-1">
                Appliance Oracle
              </h3>
              <p className="text-purple-700 text-sm">
                Predict failures & replacements
              </p>
            </div>
          </Link>

          {/* Budget Forecaster */}
          <Link href="/dashboard/budget">
            <div className="relative bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
                <DollarSign className="h-7 w-7 text-blue-600" />
              </div>
              
              <h3 className="text-lg font-bold text-blue-900 mb-1">
                Budget Forecaster
              </h3>
              <p className="text-blue-700 text-sm">
                12-month maintenance predictions
              </p>
            </div>
          </Link>

          {/* AI CLIMATE RISK PREDICTOR (Live Scorecard) - Now in the AI Grid */}
          {selectedPropertyId && (
            <AIClimateRiskCard className="h-full" />
          )}

        </div>
      </section>
      {/* ========================================= */}
      {/* END AI FEATURES SECTION */}
      {/* ========================================= */}

      {/* Scorecards Grid (Existing Non-AI Scores) */}
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

        return (
          <ExistingOwnerDashboard 
            userFirstName={user.firstName}
            bookings={data.bookings}
            properties={filteredProperties} // Pass only selected property
            checklistItems={filteredChecklistItems} // Pass the newly filtered list
            selectedPropertyId={selectedPropertyId}
            consolidatedActionCount={filteredUrgentActions.length} // Pass filtered count
          />
        );
      })()}
    </DashboardShell>
  );
}