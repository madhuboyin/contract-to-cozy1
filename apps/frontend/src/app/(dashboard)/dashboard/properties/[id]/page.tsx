// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property } from "@/types"; // Base Property type
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Edit, Zap, Shield, FileText, ArrowLeft, Home, Calendar, Ruler, DollarSign, Wrench, Settings, ShieldAlert, ArrowRight, TrendingUp } from "lucide-react"; 
import { toast } from "@/components/ui/use-toast";
import { FileDown } from "lucide-react";
import ReportsClient from "./reports/ReportsClient";
import ClaimsClient from "./claims/ClaimsClient";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import IncidentsClient from "./incidents/IncidentsClient";


// --- START INLINED INTERFACES AND COMPONENTS FOR HEALTH INSIGHTS ---

interface HealthScoreResult {
  totalScore: number;
  baseScore: number;
  unlockedScore: number;
  maxPotentialScore: number;
  maxBaseScore: number;
  maxExtraScore: number;
  insights: { 
    factor: string; 
    status: string; 
    score: number;
    details?: string[]; // ADD THIS LINE
  }[];
  ctaNeeded: boolean;
}
// Using an intersection type to define the expected structure of the fetched property
type ScoredProperty = Property & { healthScore?: HealthScoreResult };

const HIGH_PRIORITY_STATUSES = ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

/**
 * Helper function to render a button based on the insight factor/status
 * UPDATED: Added appliance warranty redirect logic (Fix 1)
 */
const renderContextualButton = (insight: any, propertyId: string) => {
    
  let buttonLabel = '';
  let category = ''; // Must be a ServiceCategory enum value (e.g., INSPECTION, PLUMBING)
  let isUrgent = false;

  // 1. Actions related to scheduling professionals (Inspection, Review, Attention)
  if (insight.status.includes('Inspection') || 
  insight.status.includes('Review') || 
  insight.status.includes('Attention')) {
  
      // Map to valid ENUMs for Provider Search
      if (insight.factor.includes('Age Factor') || insight.factor.includes('Roof')) {
          category = 'INSPECTION'; 
      } else if (insight.factor.includes('HVAC')) {
          category = 'HVAC';
      } else if (insight.factor.includes('Water Heater')) {
          category = 'PLUMBING'; 
      } else if (insight.factor.includes('Exterior') || insight.factor.includes('Drainage')) {
          category = 'HANDYMAN'; 
      } else {
          category = 'INSPECTION';
      }

      // Determine the action label based on status
      if (insight.status.includes('Inspection')) {
          buttonLabel = "Schedule Inspection";
          isUrgent = true;
      } else if (insight.status.includes('Review')) {
          buttonLabel = "Schedule Comprehensive Assessment";
          isUrgent = false;
      } else if (insight.status.includes('Attention')) {
          buttonLabel = "Book Repair Service";
          isUrgent = true;
      }

      // FIXED: Use Next.js object-based routing for reliable parameter passing
      const providerSearchLink = {
          pathname: '/dashboard/providers',
          query: {
              category: category,
              insightFactor: insight.factor,
              propertyId: propertyId
          }
      };

      return (
          <Button 
              size="sm" 
              variant={isUrgent ? 'destructive' : 'default'} 
              asChild 
              className="w-full sm:w-auto"
          >
              <Link href={providerSearchLink}>
                  {buttonLabel} <Wrench className="ml-2 h-4 w-4" />
              </Link>
          </Button>
      );
  }
  
  // FIX 1: Appliance warranty actions - redirect to warranties page
  // Check factor name since count is in factor, not status
  if (insight.factor.includes('Appliances') && insight.status === 'Needs Warranty') {
      return (
          <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
              <Link href={`/dashboard/warranties?propertyId=${propertyId}`}>
                  Manage Appliance Warranties <Shield className="ml-2 h-4 w-4" />
              </Link>
          </Button>
      );
  }

  // 2. Actions related to updating missing data (Safety, Documents)
  if (insight.factor.includes('Safety') || 
      insight.factor.includes('Documents') || 
      insight.status.includes('Missing Data')) {
      
      return (
          <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
              <Link href={`/dashboard/properties/${propertyId}/edit`}>
                  Update Profile Data <Settings className="ml-2 h-4 w-4" />
              </Link>
          </Button>
      );
  }

  // 3. Default action (catch-all)
  return (
      <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
           <Link href={`/dashboard/maintenance?propertyId=${propertyId}`}>
              View Maintenance <ArrowRight className="ml-2 h-4 w-4" />
           </Link>
      </Button>
  );
};


/**
 * Displays a filtered list of Health Score insights with proactive maintenance recommendations.
 * UPDATED: Softer messaging to match dashboard MaintenanceNudgeCard
 * Inlined component for properties/[id]/page.tsx
 */
function HealthInsightList({ property }: { property: ScoredProperty }) {
  if (!property.healthScore) {
      return null;
  }

  // Filter for insights that match the high-priority statuses
  const criticalInsights = property.healthScore.insights.filter(i => 
      HIGH_PRIORITY_STATUSES.includes(i.status)
  );
  console.log('🔍 INSIGHTS DATA:', JSON.stringify(criticalInsights, null, 2));
  if (criticalInsights.length === 0) {
      return null;
  }

  return (
      <Card className="border-2 border-blue-500 bg-blue-50 shadow-lg">
          <CardContent className="p-4 sm:p-6">
              <h2 className="text-xl font-extrabold text-blue-800 mb-4 flex items-center">
                  <Shield className="h-6 w-6 mr-2 flex-shrink-0 text-blue-600" /> 
                  Proactive Maintenance Recommended ({criticalInsights.length} Items)
              </h2>
              <p className="text-sm text-blue-700 mb-4">
                  These maintenance actions will directly increase your Health Score and reduce risk.
              </p>
              
              <ul className="space-y-3">
                  {criticalInsights.map((insight, index) => (
                      <li key={index} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded-lg shadow-sm border border-blue-100">
                          <div className="flex-1 pr-4 mb-2 sm:mb-0">
                              <p className="font-semibold text-gray-800">
                                  {insight.factor}
                              </p>
                              <p className="text-sm text-blue-600 font-medium mt-1">
                                  Status: **{insight.status}**
                              </p>
                              {insight.details && insight.details.length > 0 && (
                                <ul className="text-xs text-gray-600 mt-2 ml-4 list-disc space-y-1">
                                    {insight.details.map((detail, idx) => (
                                        <li key={idx}>{detail}</li>
                                    ))}
                                </ul>
                              )}
                          </div>
                          
                          {/* Contextual Action Button */}
                          {renderContextualButton(insight, property.id)}
                      </li>
                  ))}
              </ul>
          </CardContent>
      </Card>
  );
}

// --- END INLINED INTERFACES AND COMPONENTS FOR HEALTH INSIGHTS ---

// NEW: Compact Selling Prep Banner Component
const SellingPrepBanner = ({ propertyId }: { propertyId: string }) => (
  <div className="w-full bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-500 rounded-lg px-4 py-3 mb-4">
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          <TrendingUp className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading text-base font-semibold text-gray-900 truncate">
            Ready to sell? Get your AI-powered preparation plan
          </p>
          <p className="font-body text-xs text-gray-600 hidden sm:block">
            Personalized timeline • Value impact analysis • Market comparables
          </p>
        </div>
      </div>
      <div className="flex-shrink-0">
        <Link href={`/dashboard/properties/${propertyId}/seller-prep`} passHref>
          <Button size="sm" className="font-semibold">
            Start Now
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  </div>
);


// UPDATED: PropertyOverview with Card structure and Phase 2 typography
const PropertyOverview = ({ property }: { property: Property }) => (
  <div className="space-y-3">
    {/* Basic Information Card */}
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-heading text-xl">Basic Information</CardTitle>
        <CardDescription className="font-body text-sm">
          Core property details and location
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {/* Address Section */}
        <div className="space-y-2">
          <h4 className="font-heading text-sm font-medium text-gray-700 flex items-center gap-2">
            <Home className="h-4 w-4 text-blue-600" />
            Address
          </h4>
          <div className="font-body text-base text-gray-900 ml-6">
            <p>{property.address}</p>
            <p className="text-sm text-gray-600">
              {property.city}, {property.state} {property.zipCode}
            </p>
          </div>
        </div>

        {/* Property Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
          {/* Year Built */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Year Built
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.yearBuilt || 'N/A'}
            </p>
          </div>

          {/* Property Size */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Property Size
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : 'N/A'}
            </p>
          </div>

          {/* Property Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500 flex items-center gap-1">
              <Home className="h-3 w-3" />
              Property Type
            </p>
            <p className="font-heading text-lg font-semibold text-gray-900">
              {property.propertyType ? property.propertyType.replace(/_/g, ' ') : 'N/A'}
            </p>
          </div>
        </div>

        {/* Bedrooms & Bathrooms (if available) */}
        {(property.bedrooms || property.bathrooms) && (
          <div className="grid grid-cols-2 gap-4 pt-3 border-t">
            {property.bedrooms && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Bedrooms</p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.bedrooms}
                </p>
              </div>
            )}
            {property.bathrooms && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Bathrooms</p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.bathrooms}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Systems Information Card */}
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="font-heading text-xl">Home Systems</CardTitle>
        <CardDescription className="font-body text-sm">
          Critical system information for maintenance planning
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Heating Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Heating Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.heatingType ? property.heatingType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Cooling Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Cooling Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.coolingType ? property.coolingType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Water Heater Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Water Heater Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.waterHeaterType ? property.waterHeaterType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>

          {/* Roof Type */}
          <div className="space-y-1">
            <p className="font-body text-xs text-gray-500">Roof Type</p>
            <p className="font-heading text-base font-medium text-gray-900">
              {property.roofType ? property.roofType.replace(/_/g, ' ') : 'Not specified'}
            </p>
          </div>
        </div>

        {/* System Ages (if available) */}
        {(property.hvacInstallYear || property.waterHeaterInstallYear || property.roofReplacementYear) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
            {property.hvacInstallYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">HVAC Install Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.hvacInstallYear}
                </p>
              </div>
            )}
            {property.waterHeaterInstallYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Water Heater Install Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.waterHeaterInstallYear}
                </p>
              </div>
            )}
            {property.roofReplacementYear && (
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Roof Replacement Year</p>
                <p className="font-heading text-base font-semibold text-gray-900">
                  {property.roofReplacementYear}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Major Appliances Card */}
    {property.homeAssets && property.homeAssets.length > 0 && (
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="font-heading text-xl">Major Appliances</CardTitle>
          <CardDescription className="font-body text-sm">
            Installed appliances and their ages
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {property.homeAssets.map((asset: any, index: number) => (
              <div key={index} className="space-y-1 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="font-body text-xs text-gray-500 uppercase tracking-wide">
                  {asset.assetType.replace(/_/g, ' ')}
                </p>
                <p className="font-heading text-base font-medium text-gray-900">
                  Installed: {asset.installationYear}
                </p>
                <p className="text-sm text-gray-600">
                  Age: {new Date().getFullYear() - asset.installationYear} years
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}
  </div>
);

// UPDATED: MaintenancePlanTab to accept ScoredProperty and render insights
const MaintenancePlanTab = ({ property }: { property: ScoredProperty }) => {
  // Read search params to check if view=insights is set
  const searchParams = useSearchParams();
  const viewContext = searchParams.get('view');
  const showCriticalInsights = viewContext === 'insights';
  
  return (
    <div className="space-y-6"> {/* Use div here to manage space between sections */}
        
        {/* [NEW] Conditional rendering of the critical insights component */}
        {showCriticalInsights && property.healthScore && (
            <HealthInsightList property={property} />
        )}

        {/* Standard Maintenance Card (Always displayed, possibly below the insights) */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="font-heading text-xl flex items-center gap-2">
              <Zap className="h-5 w-5 text-red-600" />
              {showCriticalInsights ? 'Proactive Maintenance Schedule' : 'Property Maintenance Plan'}
            </CardTitle>
            <CardDescription className="font-body text-sm">
              View and manage all scheduled maintenance tasks for this property
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <p className="font-body text-base text-gray-700">
              This section displays recurring tasks, future appointments, and your long-term maintenance calendar.
            </p>
            <Link href={`/dashboard/maintenance?propertyId=${property.id}`} passHref>
              <Button variant="default">
                <Zap className="mr-2 h-4 w-4" />
                Manage Maintenance Tasks
              </Button>
            </Link>
          </CardContent>
        </Card>
    </div>
  );
};

// UPDATED: RiskProtectionTab with Phase 2 typography and compact spacing
const RiskProtectionTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        Property Risk & Protection Overview
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Access comprehensive risk assessment and financial exposure analysis
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Access the comprehensive risk report to view calculated risk scores, financial exposure,
        and a detailed breakdown of your home's systems and structure health.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/risk-assessment`} passHref>
        <Button variant="default">
          <Shield className="mr-2 h-4 w-4" />
          View Risk & Protection Report
        </Button>
      </Link>
    </CardContent>
  </Card>
);

// NEW: FinancialEfficiencyTab
const FinancialEfficiencyTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-green-600" />
        Financial Efficiency Report
      </CardTitle>
      <CardDescription className="font-body text-sm">
        View a detailed comparison of your annual home expenses against market benchmarks.
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Access the Financial Efficiency Score (FES) report to analyze your annual spending on insurance,
        utilities, and warranties relative to market averages.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/financial-efficiency`} passHref>
        <Button variant="default">
          <DollarSign className="mr-2 h-4 w-4" />
          View Financial Efficiency Report
        </Button>
      </Link>
    </CardContent>
  </Card>
);

// UPDATED: DocumentsTab with Phase 2 typography and compact spacing
const DocumentsTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        Property Documents
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Manage all documents associated with this property
      </CardDescription>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Documents associated with this property will be listed here, including warranties, 
        insurance policies, inspection reports, and more.
      </p>
      <Link href={`/dashboard/documents?propertyId=${propertyId}`} passHref>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          Manage Documents
        </Button>
      </Link>
    </CardContent>
  </Card>
);

const ReportsTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-600" />
        Home Reports (PDF)
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Generate printable/shareable PDFs for insurance, claims, resale, and lender/HOA requests.
      </CardDescription>
    </CardHeader>

    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Create a Home Report Pack including summary, inventory replacement values, maintenance outlook, and coverage snapshot.
      </p>

      <Link href={`/dashboard/properties/${propertyId}/reports`} passHref>
        <Button variant="default">
          <FileText className="mr-2 h-4 w-4" />
          Open Reports
        </Button>
      </Link>
    </CardContent>
  </Card>
);
const ClaimsTab = ({ propertyId }: { propertyId: string }) => (
  <Card>
    <CardHeader className="p-4">
      <CardTitle className="font-heading text-xl flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-amber-600" />
        Claims
      </CardTitle>
      <CardDescription className="font-body text-sm">
        Track insurance/warranty claims with checklist, timeline, and documents.
      </CardDescription>
    </CardHeader>

    <CardContent className="p-4 pt-0 space-y-3">
      <p className="font-body text-base text-gray-700">
        Manage active claims, follow-ups, and required documentation—all tied to this property.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/properties/${propertyId}/claims`} passHref>
          <Button variant="default">
            Open Claims
          </Button>
        </Link>

        <Link href={`/dashboard/properties/${propertyId}/claims?create=1`} passHref>
          <Button variant="outline">
            Create Claim
          </Button>
        </Link>
      </div>
    </CardContent>
  </Card>
);

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  
  // Updated defaultTab logic to include the new 'financial-efficiency' tab
  const defaultTab =
  initialTab &&
  [
    'overview',
    'maintenance',
    'incidents',
    'risk-protection',
    'financial-efficiency',
    'documents',
    'reports',
    'claims',
  ].includes(initialTab)
    ? initialTab
    : 'overview';



  // [MODIFICATION] Assumed that the API returns ScoredProperty data for this endpoint.
  const { data: property, isLoading } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      if (response.success) {
        // Cast the result to ScoredProperty type for safety
        return response.data as ScoredProperty; 
      }
      toast({
        title: "Error",
        description: response.message || "Failed to fetch property details.",
        variant: "destructive",
      });
      return null;
    },
    enabled: !!propertyId,
  });

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </DashboardShell>
    );
  }

  // [MODIFICATION] Cast the result to ScoredProperty
  const scoredProperty = property as ScoredProperty; 


  if (!property) {
    return (
      <DashboardShell>
        <PageHeader>
          <PageHeaderHeading>Property Not Found</PageHeaderHeading>
          <PageHeaderDescription>
            The requested property could not be loaded or does not exist.
          </PageHeaderDescription>
        </PageHeader>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="gap-2">
      {/* UPDATED: Back Navigation - Reduced to mb-2 for tighter spacing */}
      <div className="mb-2">
        <button 
          onClick={() => router.back()}
          className="font-body text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center transition-colors bg-transparent border-none p-0 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </button>
      </div>
      
      {/* UPDATED: PageHeader with Edit button in top-right */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <PageHeader className="pt-2 pb-2 gap-1 flex-1">
          <PageHeaderHeading>{property.name || "My Property"}</PageHeaderHeading>
          <PageHeaderDescription>
            {property.address}, {property.city}
          </PageHeaderDescription>
        </PageHeader>
        
        {/* NEW: Edit button in header */}
        <div className="flex-shrink-0 pt-2">
          <Link href={`/dashboard/properties/${property.id}/edit`} passHref>
            <Button variant="outline" size="sm" className="gap-2">
              <Edit className="h-4 w-4" />
              Edit Details
            </Button>
          </Link>
        </div>
      </div>

      {/* NEW: Compact Selling Prep Banner - Always visible */}
      <SellingPrepBanner propertyId={property.id} />

      {/* UPDATED: Removed space-y-4 wrapper - no container spacing needed */}
      <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Home className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="flex items-center gap-2">
              <Zap className="h-4 w-4" /> Maintenance Plan
            </TabsTrigger>
            <TabsTrigger value="incidents" className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Incidents
            </TabsTrigger>
            <TabsTrigger value="risk-protection" className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Risk & Protection
            </TabsTrigger>
            {/* NEW TRIGGER: Financial Efficiency */}
            <TabsTrigger value="financial-efficiency" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Financial Efficiency
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <FileDown className="h-4 w-4" /> Reports
            </TabsTrigger>
            <TabsTrigger value="claims" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Claims
            </TabsTrigger>

          </TabsList>
          
          {/* UPDATED: Reduced tab content spacing from mt-6 to mt-4 */}
          <TabsContent value="overview" className="mt-4">
            <PropertyOverview property={property} />
          </TabsContent>
          
          <TabsContent value="maintenance" className="mt-4">
            {/* [MODIFICATION] Pass the full (scored) property object */}
            <MaintenancePlanTab property={scoredProperty} /> 
          </TabsContent>
          <TabsContent value="incidents" className="mt-4">
            <IncidentsClient />
          </TabsContent>
          <TabsContent value="risk-protection" className="mt-4">
            <RiskProtectionTab propertyId={property.id} />
          </TabsContent>
          
          {/* NEW CONTENT: Financial Efficiency */}
          <TabsContent value="financial-efficiency" className="mt-4">
            <FinancialEfficiencyTab propertyId={property.id} />
          </TabsContent>
          
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab propertyId={property.id} />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <ReportsTab propertyId={property.id} />
          </TabsContent>
          <TabsContent value="claims" className="mt-4">
            <ClaimsTab propertyId={property.id} />
          </TabsContent>

        </Tabs>
      </DashboardShell>
  );
}