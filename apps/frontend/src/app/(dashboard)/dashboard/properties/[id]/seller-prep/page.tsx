// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import {
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
} from "@/components/mobile/dashboard/MobilePrimitives";
import HomeToolHeader from "@/components/tools/HomeToolHeader";
import { PropertyContextCapturePanel } from "@/components/property-context/PropertyContextCapturePanel";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";
import { SellerPrepDisclaimer } from "@/components/seller-prep/SellerPrepDisclaimer";
import { CapabilityDiscoveryAnchor } from "@/features/tools/CapabilityDiscoveryAnchor";
// Note: this page used to mount its own seller-prep-scoped FeedbackWidget
// here. That's superseded by the app-wide FeedbackWidget now mounted once
// in app/(dashboard)/layout.tsx — kept here would double-mount it on this page.

interface SellerPrepOverviewData {
  saleIntentConfirmed: boolean;
  preferences?: any;
  interviews?: any[];
  budget?: {
    totalBudget: number;
    spentAmount: number;
    remainingTasks: Array<{ title: string; estimatedCost: number }>;
  };
  value?: {
    completedImprovements: Array<{ title: string; roiRange: string; estimatedCost: number }>;
    remainingImprovements: Array<{ title: string; roiRange: string; estimatedCost: number; priority: string }>;
    completedValueIncrease: { minValue: number; maxValue: number };
    potentialValueIncrease: { minValue: number; maxValue: number };
  };
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

export default function SellerPrepPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');
  const [contextReady, setContextReady] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-prep", propertyId],
    queryFn: async () => {
      if (!propertyId) throw new Error("Property ID missing");

      const [overviewRes, comparablesRes] = await Promise.all([
        api.getSellerPrepOverview(propertyId),
        api.getSellerPrepComparables(propertyId),
      ]);

      if (!overviewRes.success) {
        throw new Error(overviewRes.message || 'Failed to load overview');
      }
      if (!comparablesRes.success) {
        throw new Error(comparablesRes.message || 'Failed to load comparables');
      }

      return {
        overview: overviewRes.data as SellerPrepOverviewData,
        comparables: comparablesRes.data as ComparableHome[],
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
