// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Settings } from "lucide-react";
import {
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
} from "@/components/mobile/dashboard/MobilePrimitives";
import HomeToolHeader from "@/components/tools/HomeToolHeader";
import { PropertyContextCapturePanel } from "@/components/property-context/PropertyContextCapturePanel";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";
import { SellerPrepIntakeForm } from "@/components/seller-prep/SellerPrepIntakeForm";
import { SellerPrepDisclaimer } from "@/components/seller-prep/SellerPrepDisclaimer";
import { useMilestones } from "@/hooks/useMilestones";
import { CapabilityDiscoveryAnchor } from "@/features/tools/CapabilityDiscoveryAnchor";
import { useToolLaunchContext } from "@/features/tools/ToolLaunchContextBoundary";
import { sellerPrepSourceLineage } from "@/features/tools/sellerPrepLaunchContext";
// Note: this page used to mount its own seller-prep-scoped FeedbackWidget
// here. That's superseded by the app-wide FeedbackWidget now mounted once
// in app/(dashboard)/layout.tsx — kept here would double-mount it on this page.

interface SellerPrepItem {
  id: string;
  title: string;
  priority: string;
  roiRange: string;
  costBucket: string;
  status: string;
}

interface SellerPrepOverviewData {
  saleIntentConfirmed: boolean;
  items: SellerPrepItem[];
  completionPercent: number;
  preferences?: any;
  personalizedSummary?: string;
}

interface ComparableHome {
  address: string;
  soldPrice: number | null;
  soldDate: string | null;
  sqft?: number;
  beds?: number;
  baths?: number;
  similarityReason: string;
}

interface ReadinessReport {
  summary: string;
  highlights?: string[];
  risks?: string[];
  disclaimers?: string[];
}

export default function SellerPrepPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const launchContext = useToolLaunchContext();
  const sourceLineage = sellerPrepSourceLineage(launchContext);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [hasCheckedPreferences, setHasCheckedPreferences] = useState(false);
  const [contextReady, setContextReady] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["seller-prep", propertyId],
    queryFn: async () => {
      if (!propertyId) throw new Error("Property ID missing");

      const [overviewRes, comparablesRes, reportRes] = await Promise.all([
        api.getSellerPrepOverview(propertyId),
        api.getSellerPrepComparables(propertyId),
        api.getSellerPrepReport(propertyId),
      ]);

      if (!overviewRes.success) {
        throw new Error(overviewRes.message || 'Failed to load overview');
      }
      if (!comparablesRes.success) {
        throw new Error(comparablesRes.message || 'Failed to load comparables');
      }
      if (!reportRes.success) {
        throw new Error(reportRes.message || 'Failed to load report');
      }

      return {
        overview: overviewRes.data as SellerPrepOverviewData,
        comparables: comparablesRes.data as ComparableHome[],
        report: reportRes.data as ReadinessReport,
      };
    },
    enabled: !!propertyId && contextReady,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const queryClient = useQueryClient();
  const confirmSaleIntentMutation = useMutation({
    mutationFn: () => api.updateProperty(propertyId as string, { propertyUse: 'FOR_SALE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-prep", propertyId] });
    },
  });

  useMilestones(data?.overview?.completionPercent || 0);

  // Trigger intake form if user has no saved preferences
  useEffect(() => {
    if (data && data.overview.saleIntentConfirmed && !hasCheckedPreferences) {
      if (!data.overview.preferences) {
        setShowIntakeForm(true);
      }
      setHasCheckedPreferences(true);
    }
  }, [data, hasCheckedPreferences]);

  const handleIntakeComplete = () => {
    setShowIntakeForm(false);
    refetch();
  };

  const handleEditPreferences = () => {
    setShowIntakeForm(true);
  };

  if (!contextReady) {
    return (
      <DashboardShell>
        <MobilePageContainer className="space-y-4 py-6 lg:max-w-3xl lg:px-8 lg:pb-10">
          <div>
            <p className="text-xs text-muted-foreground">Sale Readiness &amp; Handoff</p>
            <h1 className="text-xl font-bold">Prepare a governed sale case</h1>
            <p className="text-sm text-muted-foreground">Confirm the minimum property details used to build this plan.</p>
          </div>
          <PropertyContextCapturePanel
            propertyId={propertyId as string}
            featureKey="SELLER_PREP"
            operationKey="OPEN_PLAN"
            onReady={() => setContextReady(true)}
          />
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  if (isLoading) {
    return (
      <DashboardShell>
        <MobilePageContainer className="space-y-4 py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <div className="h-10 w-48 rounded bg-gray-100 animate-pulse" />
          <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-96 rounded-lg bg-gray-100 animate-pulse" />
            <div className="lg:col-span-4 h-64 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  if (error || !data) {
    return (
      <DashboardShell>
        <MobilePageContainer className="py-6 lg:max-w-7xl lg:px-8 lg:pb-10">
          <MobileCard className="space-y-2.5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-600">
                  Failed to load Sale Readiness
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {error instanceof Error ? error.message : 'An unexpected error occurred'}
                </p>
                <Button
                  variant="link"
                  onClick={() => window.location.reload()}
                  className="p-0 h-auto text-blue-600 mt-2"
                >
                  Try again
                </Button>
              </div>
            </div>
          </MobileCard>
        </MobilePageContainer>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="max-w-7xl mx-auto gap-4">
      <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      {/* Intake Form Modal */}
      {propertyId && (
        <SellerPrepIntakeForm
          propertyId={propertyId}
          open={showIntakeForm}
          onComplete={handleIntakeComplete}
          onSkip={() => setShowIntakeForm(false)}
          sourceLineage={sourceLineage}
        />
      )}

      <PropertyContextCapturePanel
        propertyId={propertyId as string}
        featureKey="SELLER_PREP"
        operationKey="OPEN_PLAN"
        onReady={() => setContextReady(true)}
      />

      {/* Navigation & Header Section */}
      <div className="space-y-2 md:hidden">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="text-xs font-medium text-muted-foreground hover:text-blue-600 inline-flex items-center transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to property
        </Link>

        <MobilePageIntro
          eyebrow="Sale Readiness & Handoff"
          title="Prepare the home and selected records for sale"
          subtitle="Track verified readiness milestones without inferred ROI or value claims."
          action={
            data.overview.saleIntentConfirmed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditPreferences}
                className="min-h-[44px] gap-1.5"
              >
                <Settings className="h-4 w-4" />
                {data.overview.preferences ? "Edit" : "Setup"}
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="hidden md:block space-y-4">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="text-xs font-medium text-muted-foreground hover:text-blue-600 inline-flex items-center transition-colors"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to property
        </Link>

        <HomeToolHeader toolId="seller-prep" propertyId={propertyId as string} />

        {data.overview.saleIntentConfirmed && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditPreferences}
              className="h-9"
            >
              <Settings className="h-4 w-4 mr-2" />
              {data.overview.preferences ? "Edit Preferences" : "Setup Plan"}
            </Button>
          </div>
        )}
      </div>

      <SellerPrepDisclaimer />

      <CapabilityDiscoveryAnchor
        anchor="SELLER_INTENT_ACTIVE"
        propertyId={propertyId as string}
        entityId={propertyId as string}
      />

      {/* Main Redesigned Dashboard Content */}
      {data.overview.saleIntentConfirmed ? (
        <SellerPrepOverview
          overview={data.overview}
          comparables={data.comparables}
          report={data.report}
          propertyId={propertyId as string}
        />
      ) : (
        <Card className="p-6 space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">Confirm you're preparing to sell</h2>
            <p className="text-sm text-muted-foreground">
              This tool only opens once you've confirmed sale intent, so a sale plan
              doesn't get created for a home you're not actually selling. This sets your
              property's "Property use" to "For sale" — you can change it back at any time
              from property settings.
            </p>
          </div>
          <Button
            onClick={() => confirmSaleIntentMutation.mutate()}
            disabled={confirmSaleIntentMutation.isPending}
          >
            {confirmSaleIntentMutation.isPending ? "Confirming…" : "Yes, I'm preparing to sell"}
          </Button>
        </Card>
      )}

      </MobilePageContainer>
    </DashboardShell>
  );
}
