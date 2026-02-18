// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { DashboardShell } from "@/components/DashboardShell";
import {
  PageHeader,
  PageHeaderHeading,
  PageHeaderDescription,
} from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, AlertCircle, Settings } from "lucide-react";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";
import { SellerPrepIntakeForm } from "@/components/seller-prep/SellerPrepIntakeForm";
import { SellerPrepDisclaimer } from "@/components/seller-prep/SellerPrepDisclaimer";
import { useMilestones } from "@/hooks/useMilestones";
import { FeedbackWidget } from "@/components/seller-prep/FeedbackWidget";

interface SellerPrepItem {
  id: string;
  title: string;
  priority: string;
  roiRange: string;
  costBucket: string;
  status: string;
}

interface SellerPrepOverviewData {
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
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [hasCheckedPreferences, setHasCheckedPreferences] = useState(false);

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
    enabled: !!propertyId,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useMilestones(data?.overview?.completionPercent || 0);

  // Trigger intake form if user has no saved preferences
  useEffect(() => {
    if (data && !hasCheckedPreferences) {
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

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <div className="h-10 w-48 rounded bg-gray-100 animate-pulse" />
          <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-96 rounded-lg bg-gray-100 animate-pulse" />
            <div className="lg:col-span-4 h-64 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error || !data) {
    return (
      <DashboardShell>
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-600">
                Failed to load Seller Preparation insights
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
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="max-w-7xl mx-auto gap-4">
      {/* Intake Form Modal */}
      {propertyId && (
        <SellerPrepIntakeForm
          propertyId={propertyId}
          open={showIntakeForm}
          onComplete={handleIntakeComplete}
          onSkip={() => setShowIntakeForm(false)}
        />
      )}

      {/* Navigation & Header Section */}
      <div className="space-y-2">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="text-xs font-medium text-muted-foreground hover:text-blue-600 inline-flex items-center transition-colors"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to Property
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <PageHeader className="p-0">
            <PageHeaderHeading className="text-2xl flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-green-600" />
              Home Sale Preparation
            </PageHeaderHeading>
            <PageHeaderDescription>
              Personalized action plan to maximize your home's resale value
            </PageHeaderDescription>
          </PageHeader>
          
          <div className="flex items-center gap-2">
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
        </div>
      </div>

      <SellerPrepDisclaimer />

      {/* Main Redesigned Dashboard Content */}
      <SellerPrepOverview
        overview={data.overview}
        comparables={data.comparables}
        report={data.report}
        propertyId={propertyId as string}
      />

      {/* Persistent Feedback Mechanism */}
      {propertyId && (
        <div className="mt-8 border-t pt-6">
          <FeedbackWidget propertyId={propertyId} />
        </div>
      )}
    </DashboardShell>
  );
}