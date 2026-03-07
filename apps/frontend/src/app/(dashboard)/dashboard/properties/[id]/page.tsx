// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property, PropertyDashboardBootstrap } from "@/types"; // Base Property type
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  Edit,
  Zap,
  Shield,
  FileText,
  ArrowLeft,
  Home,
  Calendar,
  Ruler,
  DollarSign,
  Wrench,
  Settings,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { FileDown } from "lucide-react";
import ReportsClient from "./reports/ReportsClient";
import ClaimsClient from "./claims/ClaimsClient";
import { ClipboardCheck, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import IncidentsClient from "./incidents/IncidentsClient";

import RoomsHubClient from "./rooms/RoomsHubClient";
import HomeToolsRail from './components/HomeToolsRail';
import SetupChecklistPanel from "@/components/onboarding/SetupChecklistPanel";
import NarrativeRevealOverlay from "@/components/narrative/NarrativeRevealOverlay";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MetricRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from "@/components/mobile/dashboard/MobilePrimitives";


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
                  Status: <strong>{insight.status}</strong>
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
  <>
    <MobileCard className="space-y-3 border-emerald-200 bg-[linear-gradient(145deg,#ecfdf5,#eff6ff)] md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Ready to sell?</p>
          <p className="text-xs text-slate-600">
            AI-powered prep plan with timeline, value impact, and market comparables.
          </p>
        </div>
        <StatusChip tone="good">Seller Prep</StatusChip>
      </div>
      <Link href={`/dashboard/properties/${propertyId}/seller-prep`}>
        <Button className="w-full min-h-[44px]">
          <TrendingUp className="mr-2 h-4 w-4" />
          Start Seller Prep
        </Button>
      </Link>
    </MobileCard>

    <div className="hidden md:block w-full bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-500 rounded-lg px-4 py-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-sm sm:text-base font-semibold text-gray-900">
              Ready to sell? Get your AI-powered preparation plan
            </p>
            <p className="font-body text-xs text-gray-600 hidden sm:block">
              Personalized timeline • Value impact analysis • Market comparables
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <Link href={`/dashboard/properties/${propertyId}/seller-prep`}>
            <Button size="sm" className="font-semibold min-h-[44px] w-full sm:w-auto">
              Start Now
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  </>
);

// UPDATED: PropertyOverview with mobile summary-first structure
const PropertyOverview = ({ property }: { property: Property }) => {
  const propertyTypeLabel = property.propertyType ? property.propertyType.replace(/_/g, " ") : "N/A";
  const heatingTypeLabel = property.heatingType ? property.heatingType.replace(/_/g, " ") : "Not specified";
  const coolingTypeLabel = property.coolingType ? property.coolingType.replace(/_/g, " ") : "Not specified";
  const waterHeaterTypeLabel = property.waterHeaterType ? property.waterHeaterType.replace(/_/g, " ") : "Not specified";
  const roofTypeLabel = property.roofType ? property.roofType.replace(/_/g, " ") : "Not specified";

  return (
    <div className="space-y-3">
      <div className="md:hidden space-y-3">
        <MobileSection>
          <MobileSectionHeader title="Home Snapshot" subtitle="Core property details at a glance" />
          <MobileCard className="space-y-2.5 border-slate-200/80 bg-white">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">Address</p>
              <p className="text-sm font-medium text-slate-900">{property.address}</p>
              <p className="text-xs text-slate-600">
                {property.city}, {property.state} {property.zipCode}
              </p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-2">
              <MetricRow label="Year Built" value={property.yearBuilt || "N/A"} />
              <MetricRow
                label="Property Size"
                value={property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : "N/A"}
              />
              <MetricRow label="Type" value={propertyTypeLabel} />
              {property.bedrooms ? <MetricRow label="Bedrooms" value={property.bedrooms} /> : null}
              {property.bathrooms ? <MetricRow label="Bathrooms" value={property.bathrooms} /> : null}
            </div>
          </MobileCard>
        </MobileSection>

        <MobileSection>
          <MobileSectionHeader title="Systems" subtitle="Critical systems for risk and maintenance planning" />
          <MobileCard className="space-y-2 border-slate-200/80 bg-white">
            <MetricRow label="Heating" value={heatingTypeLabel} />
            <MetricRow label="Cooling" value={coolingTypeLabel} />
            <MetricRow label="Water Heater" value={waterHeaterTypeLabel} />
            <MetricRow label="Roof" value={roofTypeLabel} />
            {property.hvacInstallYear ? (
              <MetricRow label="HVAC Install Year" value={property.hvacInstallYear} />
            ) : null}
            {property.waterHeaterInstallYear ? (
              <MetricRow label="Water Heater Install Year" value={property.waterHeaterInstallYear} />
            ) : null}
            {property.roofReplacementYear ? (
              <MetricRow label="Roof Replacement Year" value={property.roofReplacementYear} />
            ) : null}
          </MobileCard>
        </MobileSection>

        {property.homeAssets && property.homeAssets.length > 0 ? (
          <MobileSection>
            <MobileSectionHeader
              title="Major Appliances"
              subtitle={`${property.homeAssets.length} tracked asset${property.homeAssets.length === 1 ? "" : "s"}`}
            />
            <MobileCard className="space-y-2.5 border-slate-200/80 bg-white">
              {property.homeAssets.slice(0, 6).map((asset: any, index: number) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {asset.assetType.replace(/_/g, " ")}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">Installed: {asset.installationYear}</p>
                  <p className="text-xs text-slate-600">
                    Age: {new Date().getFullYear() - asset.installationYear} years
                  </p>
                </div>
              ))}
            </MobileCard>
          </MobileSection>
        ) : null}
      </div>

      <div className="hidden md:block space-y-3">
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="font-heading text-xl">Basic Information</CardTitle>
            <CardDescription className="font-body text-sm">
              Core property details and location
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Year Built
                </p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.yearBuilt || "N/A"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500 flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  Property Size
                </p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : "N/A"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500 flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  Property Type
                </p>
                <p className="font-heading text-lg font-semibold text-gray-900">
                  {propertyTypeLabel}
                </p>
              </div>
            </div>

            {(property.bedrooms || property.bathrooms) && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                {property.bedrooms ? (
                  <div className="space-y-1">
                    <p className="font-body text-xs text-gray-500">Bedrooms</p>
                    <p className="font-heading text-lg font-semibold text-gray-900">
                      {property.bedrooms}
                    </p>
                  </div>
                ) : null}
                {property.bathrooms ? (
                  <div className="space-y-1">
                    <p className="font-body text-xs text-gray-500">Bathrooms</p>
                    <p className="font-heading text-lg font-semibold text-gray-900">
                      {property.bathrooms}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="font-heading text-xl">Home Systems</CardTitle>
            <CardDescription className="font-body text-sm">
              Critical system information for maintenance planning
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Heating Type</p>
                <p className="font-heading text-base font-medium text-gray-900">{heatingTypeLabel}</p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Cooling Type</p>
                <p className="font-heading text-base font-medium text-gray-900">{coolingTypeLabel}</p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Water Heater Type</p>
                <p className="font-heading text-base font-medium text-gray-900">{waterHeaterTypeLabel}</p>
              </div>

              <div className="space-y-1">
                <p className="font-body text-xs text-gray-500">Roof Type</p>
                <p className="font-heading text-base font-medium text-gray-900">{roofTypeLabel}</p>
              </div>
            </div>

            {(property.hvacInstallYear || property.waterHeaterInstallYear || property.roofReplacementYear) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
                {property.hvacInstallYear ? (
                  <div className="space-y-1">
                    <p className="font-body text-xs text-gray-500">HVAC Install Year</p>
                    <p className="font-heading text-base font-semibold text-gray-900">{property.hvacInstallYear}</p>
                  </div>
                ) : null}
                {property.waterHeaterInstallYear ? (
                  <div className="space-y-1">
                    <p className="font-body text-xs text-gray-500">Water Heater Install Year</p>
                    <p className="font-heading text-base font-semibold text-gray-900">{property.waterHeaterInstallYear}</p>
                  </div>
                ) : null}
                {property.roofReplacementYear ? (
                  <div className="space-y-1">
                    <p className="font-body text-xs text-gray-500">Roof Replacement Year</p>
                    <p className="font-heading text-base font-semibold text-gray-900">{property.roofReplacementYear}</p>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

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
                      {asset.assetType.replace(/_/g, " ")}
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
    </div>
  );
};

// UPDATED: MaintenancePlanTab to accept ScoredProperty and render insights
const MaintenancePlanTab = ({ property }: { property: ScoredProperty }) => {
  // Read search params to check if view=insights is set
  const searchParams = useSearchParams();
  const viewContext = searchParams.get('view');
  const showCriticalInsights = viewContext === 'insights';
  const criticalInsightCount =
    property.healthScore?.insights?.filter((insight) => HIGH_PRIORITY_STATUSES.includes(insight.status)).length || 0;

  return (
    <div className="space-y-4">
      {showCriticalInsights && property.healthScore && (
        <>
          <div className="md:hidden">
            <MobileCard className="space-y-2.5 border-blue-200 bg-blue-50">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-blue-900">Proactive Maintenance Recommended</p>
                <StatusChip tone="needsAction">{criticalInsightCount} items</StatusChip>
              </div>
              <p className="text-xs text-blue-800">
                Critical health insights were detected. Resolve them in maintenance to improve score and reduce risk.
              </p>
              <Link href={`/dashboard/maintenance?propertyId=${property.id}&view=open`}>
                <Button className="w-full min-h-[44px]">
                  <Zap className="mr-2 h-4 w-4" />
                  Open Maintenance Queue
                </Button>
              </Link>
            </MobileCard>
          </div>
          <div className="hidden md:block">
            <HealthInsightList property={property} />
          </div>
        </>
      )}

      <div className="md:hidden">
        <MobileCard className="space-y-3 border-slate-200/80 bg-white">
          <MobileSectionHeader
            title={showCriticalInsights ? "Proactive Maintenance Schedule" : "Property Maintenance Plan"}
            subtitle="View and manage scheduled tasks for this property."
          />
          <p className="text-sm text-slate-700">
            Review recurring tasks, upcoming due dates, and progress in one maintenance queue.
          </p>
          <Link href={`/dashboard/maintenance?propertyId=${property.id}`}>
            <Button className="w-full min-h-[44px]">
              <Zap className="mr-2 h-4 w-4" />
              Manage Maintenance Tasks
            </Button>
          </Link>
        </MobileCard>
      </div>

      <Card className="hidden md:block">
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
          <Link href={`/dashboard/maintenance?propertyId=${property.id}`}>
            <Button variant="default" className="min-h-[44px]">
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
  <>
    <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
      <MobileSectionHeader
        title="Risk & Protection"
        subtitle="Comprehensive risk score, exposure, and protection actions."
      />
      <p className="text-sm text-slate-700">
        Open the risk report to review critical systems, financial exposure, and mitigation priorities.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>
        <Button className="w-full min-h-[44px]">
          <Shield className="mr-2 h-4 w-4" />
          View Risk & Protection Report
        </Button>
      </Link>
    </MobileCard>

    <Card className="hidden md:block">
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
          and a detailed breakdown of your home&apos;s systems and structure health.
        </p>
        <Link href={`/dashboard/properties/${propertyId}/risk-assessment`}>
          <Button variant="default">
            <Shield className="mr-2 h-4 w-4" />
            View Risk & Protection Report
          </Button>
        </Link>
      </CardContent>
    </Card>
  </>
);

// NEW: FinancialEfficiencyTab
const FinancialEfficiencyTab = ({ propertyId }: { propertyId: string }) => (
  <>
    <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
      <MobileSectionHeader
        title="Financial Efficiency"
        subtitle="Compare annual cost against neighborhood benchmarks."
      />
      <p className="text-sm text-slate-700">
        Review insurance, utility, and warranty spend versus market expectations.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/financial-efficiency`}>
        <Button className="w-full min-h-[44px]">
          <DollarSign className="mr-2 h-4 w-4" />
          View Financial Efficiency Report
        </Button>
      </Link>
    </MobileCard>

    <Card className="hidden md:block">
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
        <Link href={`/dashboard/properties/${propertyId}/financial-efficiency`}>
          <Button variant="default">
            <DollarSign className="mr-2 h-4 w-4" />
            View Financial Efficiency Report
          </Button>
        </Link>
      </CardContent>
    </Card>
  </>
);


// UPDATED: DocumentsTab with Phase 2 typography and compact spacing
const DocumentsTab = ({ propertyId }: { propertyId: string }) => (
  <>
    <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
      <MobileSectionHeader title="Property Documents" subtitle="Warranties, insurance, inspections, and more." />
      <p className="text-sm text-slate-700">
        Open the shared document center filtered to this property.
      </p>
      <Link href={`/dashboard/documents?propertyId=${propertyId}`}>
        <Button variant="outline" className="w-full min-h-[44px]">
          <FileText className="mr-2 h-4 w-4" />
          Manage Documents
        </Button>
      </Link>
    </MobileCard>

    <Card className="hidden md:block">
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
        <Link href={`/dashboard/documents?propertyId=${propertyId}`}>
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Manage Documents
          </Button>
        </Link>
      </CardContent>
    </Card>
  </>
);

const ReportsTab = ({ propertyId }: { propertyId: string }) => (
  <>
    <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
      <MobileSectionHeader title="Home Reports (PDF)" subtitle="Generate and share printable report packs." />
      <p className="text-sm text-slate-700">
        Open report generation for insurance, claims, resale, and lender/HOA needs.
      </p>
      <Link href={`/dashboard/properties/${propertyId}/reports`}>
        <Button className="w-full min-h-[44px]">
          <FileText className="mr-2 h-4 w-4" />
          Open Reports
        </Button>
      </Link>
    </MobileCard>

    <Card className="hidden md:block">
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

        <Link href={`/dashboard/properties/${propertyId}/reports`}>
          <Button variant="default">
            <FileText className="mr-2 h-4 w-4" />
            Open Reports
          </Button>
        </Link>
      </CardContent>
    </Card>
  </>
);

const ClaimsTab = ({ propertyId }: { propertyId: string }) => (
  <>
    <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
      <MobileSectionHeader title="Claims" subtitle="Track insurance and warranty claim workflows." />
      <p className="text-sm text-slate-700">
        Manage active claims, follow-ups, checklists, and documents tied to this property.
      </p>
      <div className="flex flex-col gap-2">
        <Link href={`/dashboard/properties/${propertyId}/claims`}>
          <Button className="w-full min-h-[44px]">Open Claims</Button>
        </Link>
        <Link href={`/dashboard/properties/${propertyId}/claims?create=1`}>
          <Button variant="outline" className="w-full min-h-[44px]">Create Claim</Button>
        </Link>
      </div>
    </MobileCard>

    <Card className="hidden md:block">
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
          <Link href={`/dashboard/properties/${propertyId}/claims`}>
            <Button variant="default">
              Open Claims
            </Button>
          </Link>

          <Link href={`/dashboard/properties/${propertyId}/claims?create=1`}>
            <Button variant="outline">
              Create Claim
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  </>
);

const NARRATIVE_NUDGE_CONFIG: Record<
  string,
  { label: string; placeholder: string; min: number; max: number; cast: (raw: string) => number }
> = {
  yearBuilt: {
    label: "Year Built",
    placeholder: "e.g. 1998",
    min: 1800,
    max: new Date().getFullYear(),
    cast: (raw) => Number.parseInt(raw, 10),
  },
  propertySize: {
    label: "Square Footage",
    placeholder: "e.g. 2200",
    min: 300,
    max: 20000,
    cast: (raw) => Number.parseInt(raw, 10),
  },
};

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : (params as any).id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [nudgeFieldKey, setNudgeFieldKey] = useState<string | null>(null);
  const [nudgeFieldValue, setNudgeFieldValue] = useState('');
  const [isSavingNudge, setIsSavingNudge] = useState(false);

  const defaultTab =
    initialTab &&
      [
        'overview',
        'maintenance',
        'timeline',
        'rooms',
        'incidents',
        'risk-protection',
        'financial-efficiency', 
        'cost-growth',
        'documents',
        'reports',
        'claims',
      ].includes(initialTab)
      ? initialTab
      : 'overview';

  const { data: bootstrap, isLoading } = useQuery({
    queryKey: ["property-bootstrap", propertyId],
    queryFn: async () => {
      const response = await api.getPropertyDashboardBootstrap(propertyId);
      if (response.success) {
        return response.data as PropertyDashboardBootstrap;
      }
      toast({
        title: "Error",
        description: response.message || "Failed to fetch property bootstrap.",
        variant: "destructive",
      });
      return null;
    },
    enabled: !!propertyId,
  });

  const property = bootstrap?.property || null;
  const onboardingStatus = bootstrap?.onboarding || null;
  const narrativeRun = bootstrap?.narrativeRun || null;

  const selectedNudgeConfig = useMemo(
    () => (nudgeFieldKey ? NARRATIVE_NUDGE_CONFIG[nudgeFieldKey] : null),
    [nudgeFieldKey]
  );

  useEffect(() => {
    if (!nudgeFieldKey || !property) return;

    if (nudgeFieldKey === 'yearBuilt' && property.yearBuilt) {
      setNudgeFieldValue(String(property.yearBuilt));
      return;
    }

    if (nudgeFieldKey === 'propertySize' && property.propertySize) {
      setNudgeFieldValue(String(property.propertySize));
      return;
    }

    setNudgeFieldValue('');
  }, [nudgeFieldKey, property]);

  const handleNudgeSave = async () => {
    if (!property || !nudgeFieldKey || !selectedNudgeConfig) return;

    const nextValue = selectedNudgeConfig.cast(nudgeFieldValue);
    const isInvalid =
      Number.isNaN(nextValue) ||
      nextValue < selectedNudgeConfig.min ||
      nextValue > selectedNudgeConfig.max;

    if (isInvalid) {
      toast({
        title: "Invalid value",
        description: `Please enter a value between ${selectedNudgeConfig.min} and ${selectedNudgeConfig.max}.`,
        variant: "destructive",
      });
      return;
    }

    setIsSavingNudge(true);
    try {
      await api.updateProperty(property.id, {
        ...(nudgeFieldKey === 'yearBuilt' ? { yearBuilt: nextValue } : {}),
        ...(nudgeFieldKey === 'propertySize' ? { propertySize: nextValue } : {}),
      });

      setNudgeFieldKey(null);
      setNudgeFieldValue('');
      toast({ title: "Details updated", description: "Your home snapshot will refresh now." });

      await queryClient.invalidateQueries({ queryKey: ["property-bootstrap", property.id] });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Could not update the property field.",
        variant: "destructive",
      });
    } finally {
      setIsSavingNudge(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </DashboardShell>
    );
  }

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
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link href="/dashboard/properties">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Properties
            </Link>
          </Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="gap-2">
      {FEATURE_FLAGS.PROPERTY_NARRATIVE_ENGINE && narrativeRun?.status === "ACTIVE" && (
        <NarrativeRevealOverlay
          run={narrativeRun}
          propertyId={property.id}
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ["property-bootstrap", property.id] });
          }}
          onDismiss={() => {
            void queryClient.invalidateQueries({ queryKey: ["property-bootstrap", property.id] });
          }}
          onNudgeClick={(fieldKey) => {
            if (NARRATIVE_NUDGE_CONFIG[fieldKey]) {
              setNudgeFieldKey(fieldKey);
              return;
            }

            router.push(`/dashboard/properties/${property.id}/edit`);
          }}
        />
      )}

      <div className="md:hidden space-y-3">
        <Button
          variant="ghost"
          className="min-h-[44px] px-0 text-sm text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <MobilePageIntro
          eyebrow="Property Hub"
          title={property.name || "My Property"}
          subtitle={`${property.address}, ${property.city}`}
          action={
            <Link href={`/dashboard/properties/${property.id}/edit`}>
              <Button size="sm" variant="outline" className="min-h-[44px] gap-1.5">
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          }
        />
      </div>

      <div className="hidden md:block">
        <div className="mb-2">
          <button
            onClick={() => router.back()}
            className="font-body text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center transition-colors bg-transparent border-none p-0 cursor-pointer min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-3">
          <PageHeader className="pt-2 pb-2 gap-1 flex-1 min-w-0">
            <PageHeaderHeading className="truncate">{property.name || "My Property"}</PageHeaderHeading>
            <PageHeaderDescription className="truncate">
              {property.address}, {property.city}
            </PageHeaderDescription>
          </PageHeader>

          <div className="flex-shrink-0 sm:pt-2">
            <Link href={`/dashboard/properties/${property.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-2 min-h-[44px]">
                <Edit className="h-4 w-4" />
                Edit Details
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <HomeToolsRail propertyId={property.id} />
      </div>

      <SellingPrepBanner propertyId={property.id} />

      {onboardingStatus && onboardingStatus.status !== "COMPLETED" && (
        <SetupChecklistPanel propertyId={property.id} status={onboardingStatus} />
      )}

      <Tabs defaultValue={defaultTab} className="w-full" id="home-snapshot">
        <MobileFilterSurface className="border-slate-200/80 bg-white p-2 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <div className="md:hidden px-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sections</p>
          </div>
          <div className="relative">
          {/* Left fade indicator (mobile only) */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none md:hidden" />
          {/* Right fade indicator (mobile only) */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none md:hidden" />

          <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
            <TabsList className="inline-flex w-max [&>*]:snap-start rounded-xl border border-slate-200 bg-slate-50/80 p-1 md:border-transparent md:bg-transparent">
              <TabsTrigger value="overview" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <Home className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Info</span>
              </TabsTrigger>

              <TabsTrigger value="maintenance" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <Zap className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Maintenance Plan</span>
                <span className="sm:hidden">Maint.</span>
              </TabsTrigger>

              <TabsTrigger
                value="timeline"
                className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]"
                onClick={() => router.push(`/dashboard/properties/${property.id}/timeline`)}
              >
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Timeline</span>
                <span className="sm:hidden">Time</span>
              </TabsTrigger>

              <TabsTrigger value="rooms" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <LayoutGrid className="h-4 w-4 shrink-0" />
                Rooms
              </TabsTrigger>

              <TabsTrigger value="incidents" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Incidents</span>
                <span className="sm:hidden">Alerts</span>
              </TabsTrigger>

              <TabsTrigger value="risk-protection" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <Shield className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Risk & Protection</span>
                <span className="sm:hidden">Risk</span>
              </TabsTrigger>

              <TabsTrigger value="financial-efficiency" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <DollarSign className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Financial Efficiency</span>
                <span className="sm:hidden">Finance</span>
              </TabsTrigger>

              <TabsTrigger value="documents" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <FileText className="h-4 w-4 shrink-0" />
                Docs
              </TabsTrigger>

              <TabsTrigger value="reports" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <FileDown className="h-4 w-4 shrink-0" />
                Reports
              </TabsTrigger>

              <TabsTrigger value="claims" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                <ClipboardCheck className="h-4 w-4 shrink-0" />
                Claims
              </TabsTrigger>

              <TabsTrigger value="status-board" className="flex items-center gap-1.5 whitespace-nowrap min-h-[40px]" onClick={() => router.push(`/dashboard/properties/${property.id}/status-board`)}>
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Status Board</span>
                <span className="sm:hidden">Status</span>
              </TabsTrigger>
            </TabsList>
          </div>
          </div>
        </MobileFilterSurface>

        <TabsContent value="overview" className="mt-4">
          <PropertyOverview property={property} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <MaintenancePlanTab property={scoredProperty} />
        </TabsContent>

        {/* ✅ NEW: Rooms tab content */}
        <TabsContent value="rooms" className="mt-4">
          {/* Render the full Rooms hub directly inside the property page */}
          <RoomsHubClient />
        </TabsContent>

        <TabsContent value="incidents" className="mt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-0">
          <IncidentsClient />
        </TabsContent>

        <TabsContent value="risk-protection" className="mt-4">
          <RiskProtectionTab propertyId={property.id} />
        </TabsContent>

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
        
        <TabsContent value="timeline" className="mt-4">
          <MobileCard className="space-y-3 border-slate-200/80 bg-white md:hidden">
            <MobileSectionHeader
              title="Home Timeline"
              subtitle="Purchases, repairs, claims, improvements, and key documents."
            />
            <Link href={`/dashboard/properties/${property.id}/timeline`}>
              <Button className="w-full min-h-[44px]">Open Timeline</Button>
            </Link>
          </MobileCard>

          <Card className="hidden md:block">
            <CardHeader className="p-4">
              <CardTitle className="font-heading text-xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Home Timeline
              </CardTitle>
              <CardDescription className="font-body text-sm">
                View your home&apos;s story: purchases, repairs, claims, improvements, and key documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Link href={`/dashboard/properties/${property.id}/timeline`}>
                <Button variant="default">Open Timeline</Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Sheet open={Boolean(nudgeFieldKey)} onOpenChange={(open) => !open && setNudgeFieldKey(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selectedNudgeConfig?.label || "Update property detail"}</SheetTitle>
            <SheetDescription>
              Add one field to improve narrative confidence and recommendations.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2">
            <label htmlFor="nudgeFieldInput" className="block text-sm font-medium text-slate-700">
              {selectedNudgeConfig?.label || "Value"}
            </label>
            <input
              id="nudgeFieldInput"
              type="number"
              value={nudgeFieldValue}
              placeholder={selectedNudgeConfig?.placeholder}
              onChange={(event) => setNudgeFieldValue(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNudgeFieldKey(null);
                setNudgeFieldValue('');
              }}
              disabled={isSavingNudge}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleNudgeSave} disabled={isSavingNudge}>
              {isSavingNudge ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DashboardShell>
  );
}
