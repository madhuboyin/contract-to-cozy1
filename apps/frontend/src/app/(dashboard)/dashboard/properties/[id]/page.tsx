// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { Property, PropertyDashboardBootstrap } from "@/types"; // Base Property type
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
  History,
  Ruler,
  DollarSign,
  Wrench,
  Settings,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  MapPin,
  Sparkles,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { FileDown } from "lucide-react";
import { ClipboardCheck } from "lucide-react";
import IncidentsClient from "./incidents/IncidentsClient";
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
  BottomSafeAreaReserve,
  CompactEntityRow,
  ExpandableSummaryCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageIntro,
  MobileSectionHeader,
  StatusChip,
} from "@/components/mobile/dashboard/MobilePrimitives";
import { buildHomeRiskReplayHref } from '@/lib/routes/homeRiskReplay';
import { buildServicePriceRadarHref } from '@/lib/routes/servicePriceRadar';
import { SmartContextToolsSection } from './components/SmartContextToolsSection';
import PlantAdvisorDashboardCard from './components/PlantAdvisorDashboardCard';
import { GuidanceResumeBanner } from '@/components/guidance/GuidanceResumeBanner';
import PropertyHubTemplate from './components/PropertyHubTemplate';
import { HomeScoreReportCard } from '../../components/HomeScoreReportCard';
import { DigitalTwinPreview } from './components/DigitalTwinPreview';



import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';
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

const HIGH_PRIORITY_STATUSES = ['Needs attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'];

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
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
        <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
          <Link
            href={buildServicePriceRadarHref({
              propertyId,
              launchSurface: 'maintenance_card',
              serviceCategory: category,
              serviceLabelRaw: insight.factor,
            })}
          >
            Check quote
          </Link>
        </Button>
      </div>
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
 * Displays a filtered list of Health score insights with proactive maintenance recommendations.
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
          These maintenance actions will directly increase your Health score and reduce risk.
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

const formatEnumLabel = (value: string | null | undefined, fallback = "—") =>
  value
    ? value
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : fallback;

function openCozyChat() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cozy-chat-open"));
}

const HeroMetaPill = ({ label }: { label: string }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700">
    {label}
  </span>
);

const PropertyHeroCard = ({ property }: { property: Property }) => {
  const propertyTypeLabel = formatEnumLabel(property.propertyType, "Home");
  const heroLocation = [property.city, property.state].filter(Boolean).join(", ");
  const heroMeta = [
    property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : null,
    property.yearBuilt ? `Built ${property.yearBuilt}` : null,
    property.bedrooms != null || property.bathrooms != null
      ? `${property.bedrooms ?? "—"} bd · ${property.bathrooms ?? "—"} ba`
      : null,
  ].filter(Boolean) as string[];

  return (
    <MobileCard
      variant="hero"
      className="space-y-3 border-slate-200/90 bg-[linear-gradient(145deg,#ffffff,#eef7ff)] shadow-[0_20px_48px_-30px_rgba(15,23,42,0.45)] md:hidden"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
          <Home className="h-5 w-5" />
        </div>
        <StatusChip tone={property.isPrimary ? "good" : "info"}>
          {property.isPrimary ? "Primary" : propertyTypeLabel}
        </StatusChip>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-slate-900">
          {property.name || "My Home"}
        </h2>
        <p className="flex items-center gap-1.5 text-[0.95rem] font-medium text-slate-800">
          <MapPin className="h-4 w-4 text-slate-500" />
          {heroLocation || "Location unavailable"}
        </p>
        <p className="line-clamp-2 text-sm text-slate-600">
          {property.address}, {property.city}, {property.state} {property.zipCode}
        </p>
      </div>

      {heroMeta.length ? (
        <div className="flex flex-wrap gap-2">
          {heroMeta.map((meta) => (
            <HeroMetaPill key={meta} label={meta} />
          ))}
        </div>
      ) : null}
    </MobileCard>
  );
};

// NEW: Compact Selling Prep Banner Component
const SellingPrepBanner = ({ propertyId }: { propertyId: string }) => (
  <>
    <MobileCard className="space-y-3.5 border-emerald-200/80 bg-[linear-gradient(145deg,#ecfdf5,#eef6ff)] shadow-[0_16px_36px_-28px_rgba(16,185,129,0.45)] md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1.08rem] font-semibold text-slate-900">Ready to sell?</p>
          <p className="mt-1 text-sm text-slate-600">
            AI prep plan with timeline, value impact, and nearby comps.
          </p>
        </div>
        <StatusChip tone="good">Cozy Insight</StatusChip>
      </div>
      <Link href={`/dashboard/properties/${propertyId}/seller-prep`}>
        <Button className="w-full min-h-[44px] bg-emerald-700 hover:bg-emerald-800">
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

// UPDATED: PropertyOverview as the Executive Summary
const PropertyOverview = ({ property }: { property: Property }) => {
  const propertyTypeLabel = formatEnumLabel(property.propertyType);
  const occupancyLabel =
    property.bedrooms != null || property.bathrooms != null
      ? `${property.bedrooms ?? "—"} bd · ${property.bathrooms ?? "—"} ba`
      : "—";

  return (
    <div className="space-y-6">
      {/* 1. HomeScore Hero */}
      <HomeScoreReportCard propertyId={property.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Digital Twin Preview (Span 2) */}
        <div className="lg:col-span-2">
          <DigitalTwinPreview propertyId={property.id} />
        </div>

        {/* 3. Property Snapshot / Settings */}
        <div className="space-y-4">
          <MobileCard className="bg-white border-2 border-slate-50 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Home className="h-4 w-4 text-brand-600" />
                Property Snapshot
              </h4>
              <Link href={`/dashboard/properties/${property.id}/edit`}>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px] font-bold text-slate-500 hover:bg-slate-50 hover:text-brand-600">
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </Link>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">Type</span>
                <span className="text-sm font-bold text-slate-900">{propertyTypeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">Size</span>
                <span className="text-sm font-bold text-slate-900">{property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">Built</span>
                <span className="text-sm font-bold text-slate-900">{property.yearBuilt ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">Layout</span>
                <span className="text-sm font-bold text-slate-900">{occupancyLabel}</span>
              </div>
            </div>
          </MobileCard>
          
          {/* Legacy Plant Advisor */}
          <PlantAdvisorDashboardCard propertyId={property.id} />
        </div>
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

const PROPERTY_HUB_TABS = [
  'overview',
  'maintenance',
  'incidents',
  'risk-protection',
  'financial-efficiency',
] as const;

type PropertyHubTab = (typeof PROPERTY_HUB_TABS)[number];

function resolvePropertyHubTab(rawValue: string | null): PropertyHubTab {
  if (rawValue && PROPERTY_HUB_TABS.includes(rawValue as PropertyHubTab)) {
    return rawValue as PropertyHubTab;
  }
  return 'overview';
}

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : (params as any).id;
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialTab = resolvePropertyHubTab(searchParams.get('tab'));
  const [activeTab, setActiveTab] = useState<PropertyHubTab>(initialTab);
  const [nudgeFieldKey, setNudgeFieldKey] = useState<string | null>(null);
  const [nudgeFieldValue, setNudgeFieldValue] = useState('');
  const [isSavingNudge, setIsSavingNudge] = useState(false);
  const askCozyDockVisible = !nudgeFieldKey;
  const tabTriggerClassName =
    "flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-slate-600 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:shadow-none";

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
    const nextTab = resolvePropertyHubTab(searchParams.get('tab'));
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, searchParams]);

  const handleTabChange = (nextTabValue: string) => {
    const nextTab = resolvePropertyHubTab(nextTabValue);
    setActiveTab(nextTab);

    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextTab === 'overview') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

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
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const scoredProperty = property as ScoredProperty;

  if (!property) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        <MobilePageIntro
          eyebrow="Property Hub"
          title="Property Not Found"
          subtitle="The requested property could not be loaded or does not exist."
        />
        <Button variant="outline" asChild>
          <Link href="/dashboard/properties">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Properties
          </Link>
        </Button>
      </div>
    );
  }

  const propertyHubTitle = property.name || property.address || "My Home";
  const propertyHubSubtitle = [
    property.address,
    [property.city, property.state].filter(Boolean).join(", "),
    property.zipCode,
  ]
    .filter(Boolean)
    .join(" • ");
  const propertyTypeLabel = formatEnumLabel(property.propertyType, "Home");
  const onboardingIncomplete = Boolean(onboardingStatus && onboardingStatus.status !== "COMPLETED");
  const criticalInsightCount =
    scoredProperty.healthScore?.insights?.filter((insight) =>
      HIGH_PRIORITY_STATUSES.includes(insight.status)
    ).length ?? 0;
  const propertyHubMeta = [
    property.isPrimary ? "Primary home" : propertyTypeLabel,
    property.yearBuilt ? `Built ${property.yearBuilt}` : null,
    property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : null,
  ].filter(Boolean) as string[];
  const tabPanelClassName = askCozyDockVisible
    ? "mt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-0"
    : "mt-4";
  const propertyHubPath = `/dashboard/properties/${property.id}`;
  const withBackToPropertyHub = (href: string) => {
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}backTo=${encodeURIComponent(propertyHubPath)}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 lg:px-8">
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

      <div className="space-y-3">
        <Button
          variant="ghost"
          className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground"
          onClick={() => navigateBackWithDashboardFallback(router)}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
      </div>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full" id="home-snapshot">
        <PropertyHubTemplate
          title={propertyHubTitle}
          context={propertyHubSubtitle || "Property operations cockpit"}
          statusLabel={onboardingIncomplete ? "Setup in progress" : "Operational"}
          meta={propertyHubMeta}
          primaryAction={
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-0 text-xs font-semibold tracking-normal text-slate-500">
                Next Best Action
              </p>
              <p className="mt-1 mb-0 text-sm text-slate-700">
                {onboardingIncomplete
                  ? "Complete setup to unlock accurate recommendations and risk guidance."
                  : criticalInsightCount > 0
                    ? `${criticalInsightCount} priority maintenance signal${criticalInsightCount === 1 ? "" : "s"} needs action.`
                    : "Open your status board for the daily operational snapshot."}
              </p>
              <div className="mt-3">
                {onboardingIncomplete ? (
                  <Button asChild className="min-h-[44px] w-full sm:w-auto">
                    <Link href={`/dashboard/properties/${property.id}/onboarding`}>
                      Continue Setup
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : criticalInsightCount > 0 ? (
                  <Button
                    type="button"
                    onClick={() => handleTabChange("maintenance")}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Review Maintenance Priorities
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button asChild className="min-h-[44px] w-full sm:w-auto">
                    <Link href={withBackToPropertyHub(`/dashboard/properties/${property.id}/status-board`)}>
                      Open Status Board
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          }
          supportingAction={
            <Button variant="outline" className="min-h-[44px] w-full justify-start gap-2" asChild>
              <Link href={withBackToPropertyHub(`/dashboard/home-tools?propertyId=${property.id}`)}>
                <Wrench className="h-4 w-4" />
                Open Home tools
              </Link>
            </Button>
          }
          utilityAction={
            <Button
              variant="outline"
              className="min-h-[44px] w-full justify-start gap-2"
              type="button"
              onClick={openCozyChat}
            >
              <Sparkles className="h-4 w-4" />
              Ask Cozy
            </Button>
          }
          tabs={
            <MobileFilterSurface className="border-slate-200/80 bg-white/95 p-2.5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)] md:border-0 md:bg-transparent md:p-0 md:shadow-none">
              <div className="md:hidden px-1">
                <p className="text-xs tracking-normal text-slate-500">Core Sections</p>
              </div>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none md:hidden" />
                <div className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />

                <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
                  <TabsList className="inline-flex w-max [&>*]:snap-start rounded-full border border-slate-200 bg-slate-50/80 p-1 md:border-transparent md:bg-transparent">
                    <TabsTrigger value="overview" className={tabTriggerClassName}>
                      <Home className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Overview</span>
                      <span className="sm:hidden">Info</span>
                    </TabsTrigger>

                    <TabsTrigger value="maintenance" className={tabTriggerClassName}>
                      <Zap className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Maintenance Plan</span>
                      <span className="sm:hidden">Maint.</span>
                    </TabsTrigger>

                    <TabsTrigger value="incidents" className={tabTriggerClassName}>
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Incidents</span>
                      <span className="sm:hidden">Alerts</span>
                    </TabsTrigger>

                    <TabsTrigger value="risk-protection" className={tabTriggerClassName}>
                      <Shield className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Risk & Protection</span>
                      <span className="sm:hidden">Risk</span>
                    </TabsTrigger>

                    <TabsTrigger value="financial-efficiency" className={tabTriggerClassName}>
                      <DollarSign className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Financial Efficiency</span>
                      <span className="sm:hidden">Finance</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </MobileFilterSurface>
          }
          secondaryNav={
            <MobileFilterSurface className="border-slate-200/80 bg-white p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold tracking-normal text-slate-500">
                More Sections
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={withBackToPropertyHub(`/dashboard/properties/${property.id}/rooms`)}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <Home className="h-3.5 w-3.5" />
                  Rooms
                </Link>
                <Link
                  href={withBackToPropertyHub(`/dashboard/properties/${property.id}/timeline`)}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Timeline
                </Link>
                <Link
                  href={withBackToPropertyHub(`/dashboard/properties/${property.id}/status-board`)}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <History className="h-3.5 w-3.5" />
                  Status Board
                </Link>
                <Link
                  href={`/dashboard/properties/${property.id}/reports`}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Reports
                </Link>
                <Link
                  href={`/dashboard/properties/${property.id}/claims`}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Claims
                </Link>
                <Link
                  href={`/dashboard/properties/${property.id}/edit`}
                  className="no-brand-style inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Documents & Edit
                </Link>
              </div>
            </MobileFilterSurface>
          }
        >
          <GuidanceResumeBanner propertyId={property.id} />

          {onboardingStatus && onboardingStatus.status !== "COMPLETED" ? (
            <SetupChecklistPanel propertyId={property.id} status={onboardingStatus} />
          ) : null}

          <TabsContent value="overview" className={tabPanelClassName}>
            <PropertyOverview property={property} />
          </TabsContent>

          <TabsContent value="maintenance" className={tabPanelClassName}>
            <MaintenancePlanTab property={scoredProperty} />
          </TabsContent>

          <TabsContent value="incidents" className={tabPanelClassName}>
            <IncidentsClient />
          </TabsContent>

          <TabsContent value="risk-protection" className={tabPanelClassName}>
            <RiskProtectionTab propertyId={property.id} />
          </TabsContent>

          <TabsContent value="financial-efficiency" className={tabPanelClassName}>
            <FinancialEfficiencyTab propertyId={property.id} />
          </TabsContent>
        </PropertyHubTemplate>
      </Tabs>

      <section aria-label="Exploratory context" className="space-y-3.5 sm:space-y-4">
        <SmartContextToolsSection propertyId={property.id} />
      </section>

      <SellingPrepBanner propertyId={property.id} />

      {askCozyDockVisible && (
        <div
          data-chat-collision-zone="true"
          className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 md:hidden"
        >
          <button
            type="button"
            onClick={openCozyChat}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(20,184,166,0.22),transparent_45%),linear-gradient(120deg,#0f172a,#111827)] px-4 py-3 text-left text-white shadow-[0_22px_48px_-30px_rgba(15,23,42,0.95)]"
            aria-label="Ask Cozy about this property"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-medium">Ask Cozy about this home</span>
            </span>
            <ChevronRight className="h-5 w-5 text-white/80" />
          </button>
        </div>
      )}

      <div className="md:hidden">
        <BottomSafeAreaReserve size={askCozyDockVisible ? "floatingAction" : "chatAware"} />
      </div>

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
    </div>
  );
}
