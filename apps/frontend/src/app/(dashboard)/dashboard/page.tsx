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

// UPDATED: Dashboard Shell and Components
import { DashboardShell } from '@/components/DashboardShell';
import { PropertyHealthScoreCard } from './components/PropertyHealthScoreCard'; 
import { PropertyRiskScoreCard } from './components/PropertyRiskScoreCard'; 
import { FinancialEfficiencyScoreCard } from './components/FinancialEfficiencyScoreCard'; 
import { MyPropertiesCard } from './components/MyPropertiesCard'; 

// PHASE 1: NEW COMPONENT IMPORTS
import { WelcomeSection } from './components/WelcomeSection';
import { SectionHeader } from './components/SectionHeader';
import { ProactiveMaintenanceBanner } from './components/ProactiveMaintenanceBanner';

// Property Selection
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
import { Cloud } from 'lucide-react';
import { Home } from 'lucide-react';
import { TrendingUp } from 'lucide-react';
import { Camera } from 'lucide-react';
import { Scale } from 'lucide-react';
import { Truck } from 'lucide-react';


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
  
  // Track user type for conditional feature display (HOME_BUYER vs EXISTING_OWNER)
  const [userType, setUserType] = useState<string | null>(null);
  
  // FIXED: Removed isLoading from PropertyContext destructuring
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();

  // PHASE 1 OPTIMIZATION: Use useMemo to derive selectedProperty once
  const selectedProperty = useMemo(
    () => data.properties.find(p => p.id === selectedPropertyId),
    [data.properties, selectedPropertyId]
  );

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/signin');
    }
    setRedirectChecked(true);
  }, [user, userLoading, router]);

  // FIXED: Determine user type from user.segment or homeownerProfile
  useEffect(() => {
    if (user && !userType) {
      // Check user.segment first, fallback to homeownerProfile.segment
      const segment = user.segment || user.homeownerProfile?.segment;
      if (segment) {
        setUserType(segment);
      }
    }
  }, [user, userType]);
  
  // FIXED: Comprehensive data fetching using correct API methods
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;

    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));

      const [
        bookingsRes,
        propertiesRes,
        checklistRes,
        warrantiesRes,
        insurancePoliciesRes,
      ] = await Promise.all([
        api.listBookings({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
        api.getProperties(),
        // Fetch checklist directly with fetch to handle both response formats
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/checklist`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
        }).then(r => r.json()).then(data => {
          // Handle both wrapped and unwrapped responses
          if (data.success && data.data) {
            return { success: true, data: data.data };
          } else if (data.id && data.items) {
            return { success: true, data: data };
          }
          return { success: false, data: null };
        }),
        api.listWarranties(),
        api.listInsurancePolicies(),
      ]);

      const bookings = bookingsRes.success ? bookingsRes.data.bookings : [];
      const properties = propertiesRes.success ? propertiesRes.data.properties : [];
      const checklist = checklistRes.success ? checklistRes.data : null;
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = insurancePoliciesRes.success ? insurancePoliciesRes.data.policies : [];

      // Map properties to ScoredProperty type
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
      
      const consolidatedActions = consolidateUrgentActions(
        scoredProperties,
        checklist?.items || [],
        warranties,
        policies
      );

      setData({
        bookings,
        properties: scoredProperties,
        checklist,
        urgentActions: consolidatedActions, 
        isLoading: false,
        error: null,
      });

    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Failed to load dashboard data',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, fetchDashboardData]);

  // Initialize selectedPropertyId from context or default to first property
  useEffect(() => {
    if (data.properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(data.properties[0].id);
    }
  }, [data.properties, selectedPropertyId, setSelectedPropertyId]);

  // Check if user has skipped property setup
  useEffect(() => {
    const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY);
    if (!hasSkipped && data.properties.length === 0 && !data.isLoading) {
      setShowWelcomeScreen(true);
    }
  }, [data.properties, data.isLoading]);

  // Extract checklist items for easier access
  const checklistItems = data.checklist?.items || [];

  // Handle loading states
  if (!redirectChecked || userLoading || data.isLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardShell>
    );
  }

  if (!user) {
    return null;
  }

  // Handle errors
  if (data.error) {
    return (
      <DashboardShell>
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm text-red-800">Error loading dashboard: {data.error}</p>
        </div>
      </DashboardShell>
    );
  }

  // FIXED: Show welcome modal - WelcomeModal only needs userFirstName prop
  if (showWelcomeScreen) {
    return <WelcomeModal userFirstName={user.firstName} />;
  }

  // Calculate action count for ProactiveMaintenanceBanner
  const filteredUrgentActions = selectedPropertyId 
    ? data.urgentActions.filter(action => action.propertyId === selectedPropertyId)
    : [];
  const actionCount = filteredUrgentActions.length;

  return (
    <DashboardShell className="max-w-7xl mx-auto space-y-4">
      
      {/* ========================================= */}
      {/* PHASE 1: NEW WELCOME SECTION */}
      {/* ========================================= */}
      <WelcomeSection userName={user.firstName} />

      {/* ========================================= */}
      {/* PROPERTY SELECTION */}
      {/* ========================================= */}
      <div className="flex items-center space-x-3">
        <Home className="h-5 w-5 text-brand-primary" />
        <Select 
          value={selectedPropertyId || ''} 
          onValueChange={setSelectedPropertyId}
        >
          <SelectTrigger className="w-[280px] bg-white shadow-sm">
            <SelectValue placeholder="Select property" />
          </SelectTrigger>
          <SelectContent>
            {data.properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                <div className="flex items-center space-x-2">
                  {property.isPrimary && <Home className="h-3 w-3 text-brand-primary" />}
                  <span className="font-medium">
                    {property.name ? property.name : formatAddress(property)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ========================================= */}
      {/* PHASE 1: PROACTIVE MAINTENANCE BANNER */}
      {/* FIXED: Only render if selectedPropertyId exists */}
      {/* ========================================= */}
      {selectedProperty && selectedPropertyId && (
        <ProactiveMaintenanceBanner 
          propertyName={selectedProperty.name || 'Main Home'}
          healthScore={selectedProperty.healthScore?.totalScore || 0}
          actionCount={actionCount}
          propertyId={selectedPropertyId}
        />
      )}

      {/* ========================================= */}
      {/* SCORE CARDS SECTION */}
      {/* ========================================= */}
      <div className="space-y-4">
        <SectionHeader 
          icon="📊"
          title="Property Intelligence Scores"
          description="Real-time health, risk, and financial analysis"
        />
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {/* 1. Property Health Score */}
          {selectedProperty ? (
            <div className="md:col-span-1">
              <PropertyHealthScoreCard property={selectedProperty} /> 
            </div>
          ) : (
            <div className="md:col-span-1">
              <PropertyHealthScoreCard property={{} as ScoredProperty} />
            </div>
          )}
          
          {/* 2. Risk Assessment Score */}
          <div className="md:col-span-1">
            <PropertyRiskScoreCard propertyId={selectedPropertyId || ''} />
          </div>
          
          {/* 3. Financial Efficiency Score */}
          <div className="md:col-span-1">
            <FinancialEfficiencyScoreCard propertyId={selectedPropertyId || ''} />
          </div>
        </div>
      </div>

      {/* ========================================= */}
      {/* AI FEATURES SECTION */}
      {/* ========================================= */}
      <section className="space-y-4">
        <SectionHeader 
          icon="✨"
          title="AI-Powered Tools"
          description="Smart automation for your property"
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Emergency Troubleshooter */}
          <Link href={`/dashboard/emergency?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-red-100 rounded-lg w-fit mb-3">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-red-900 mb-1">
                Emergency Troubleshooter
              </h3>
              <p className="text-red-700 text-sm">
                Get 24/7 instant AI help for home issues
              </p>
            </div>
          </Link>

          {/* Document Intelligence */}
          <Link href={`/dashboard/documents?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-3">
                <FileText className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-1">
                Document Intelligence Hub
              </h3>
              <p className="text-blue-700 text-sm">
                AI document search & analysis
              </p>
            </div>
          </Link>

          {/* Weather Impact */}
          <Link href={`/dashboard/weather?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-cyan-100 rounded-lg w-fit mb-3">
                <Cloud className="h-7 w-7 text-cyan-600" />
              </div>
              <h3 className="text-lg font-bold text-cyan-900 mb-1">
                Weather Impact
              </h3>
              <p className="text-cyan-700 text-sm">
                AI weather protection tips
              </p>
            </div>
          </Link>

          {/* Home Modifications - EXISTING_OWNER ONLY */}
          {userType === 'EXISTING_OWNER' && (
            <Link href={`/dashboard/home-modifications?propertyId=${selectedPropertyId || ''}`}>
              <div className="relative bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-5 hover:shadow-xl transition-all">
                <div className="absolute top-3 right-3">
                  <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
                </div>
                <div className="p-3 bg-indigo-100 rounded-lg w-fit mb-3">
                  <Home className="h-7 w-7 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-indigo-900 mb-1">
                  Home Modifications
                </h3>
                <p className="text-indigo-700 text-sm">
                  AI improvement recommendations
                </p>
              </div>
            </Link>
          )}

          {/* Property Appreciation */}
          <Link href={`/dashboard/appreciation?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-green-100 rounded-lg w-fit mb-3">
                <TrendingUp className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-green-900 mb-1">
                Property Appreciation
              </h3>
              <p className="text-green-700 text-sm">
                Track value & market trends
              </p>
            </div>
          </Link>

          {/* Energy Auditor */}
          <Link href={`/dashboard/energy?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg w-fit mb-3">
                <Zap className="h-7 w-7 text-yellow-600" />
              </div>
              <h3 className="text-lg font-bold text-yellow-900 mb-1">
                Energy Auditor
              </h3>
              <p className="text-yellow-700 text-sm">
                AI energy-saving recommendations
              </p>
            </div>
          </Link>

          {/* Visual Inspector */}
          <Link href={`/dashboard/visual-inspector?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-purple-100 rounded-lg w-fit mb-3">
                <Camera className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-purple-900 mb-1">
                Visual Inspector
              </h3>
              <p className="text-purple-700 text-sm">
                AI image analysis & inspection
              </p>
            </div>
          </Link>
 
          {/* Tax Appeal Assistant */}
          <Link href={`/dashboard/tax-appeal?propertyId=${selectedPropertyId || ''}`}>
            <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-5 hover:shadow-xl transition-all">
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
              </div>
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-3">
                <Scale className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-1">
                Tax Appeal Assistant
              </h3>
              <p className="text-blue-700 text-sm">
                AI-powered tax appeal analysis
              </p>
            </div>
          </Link>

          {/* Inspection Report Intelligence - HOME_BUYER ONLY */}
          {userType === 'HOME_BUYER' && (
            <Link href={`/dashboard/inspection-report?propertyId=${selectedPropertyId || ''}`}>
              <div className="relative bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-5 hover:shadow-xl transition-all">
                <div className="absolute top-3 right-3">
                  <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
                </div>
                <div className="p-3 bg-indigo-100 rounded-lg w-fit mb-3">
                  <FileText className="h-7 w-7 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-indigo-900 mb-1">
                  Inspection Report Intelligence
                </h3>
                <p className="text-indigo-700 text-sm">
                  AI analysis, costs & negotiation
                </p>
              </div>
            </Link>
          )}
          
          {/* Moving Concierge - HOME_BUYER ONLY */}
          {userType === 'HOME_BUYER' && (
            <Link href="/dashboard/moving-concierge">
              <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
                <div className="absolute top-3 right-3">
                  <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
                </div>
                
                <div className="p-3 bg-green-100 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
                  <Truck className="h-7 w-7 text-green-600" />
                </div>
                
                <h3 className="text-lg font-bold text-green-900 mb-1">
                  Moving Concierge
                </h3>
                <p className="text-green-700 text-sm mb-2">
                  AI moving timeline & checklist
                </p>
                
                <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                  NEW HOME BUYERS
                </span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* ========================================= */}
      {/* DASHBOARD SECTION - CONDITIONAL BY USER TYPE */}
      {/* ========================================= */}
      {(() => {
        // Filter checklist items by selected property ID
        const filteredChecklistItems = selectedPropertyId
            ? checklistItems.filter(item => item.propertyId === selectedPropertyId)
            : checklistItems; // Don't filter if no property selected
        
        // Filter properties to only the selected one
        const filteredProperties = selectedProperty ? [selectedProperty] : [];

        // CRITICAL FIX: Render different dashboards based on userType
        if (userType === 'HOME_BUYER') {
          return (
            <HomeBuyerDashboard 
              userFirstName={user.firstName}
              bookings={data.bookings}
              properties={data.properties}  // Pass ALL properties for HOME_BUYER
              checklistItems={filteredChecklistItems}
            />
          );
        }

        // Default: EXISTING_OWNER dashboard
        return (
          <ExistingOwnerDashboard 
            userFirstName={user.firstName}
            bookings={data.bookings}
            properties={filteredProperties}
            checklistItems={filteredChecklistItems}
            selectedPropertyId={selectedPropertyId || ''}
            consolidatedActionCount={filteredUrgentActions.length}
          />
        );
      })()}
    </DashboardShell>
  );
}