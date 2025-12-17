// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx
"use client";

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
import { ArrowLeft, TrendingUp, AlertCircle } from "lucide-react";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";

// Proper TypeScript types
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-prep", propertyId],
    queryFn: async () => {
      if (!propertyId) throw new Error("Property ID missing");

      const [overviewRes, comparablesRes, reportRes] = await Promise.all([
        api.getSellerPrepOverview(propertyId),
        api.getSellerPrepComparables(propertyId),
        api.getSellerPrepReport(propertyId),
      ]);

      // Comprehensive response validation
      if (!overviewRes.success) {
        throw new Error(overviewRes.message || 'Failed to load overview');
      }
      if (!comparablesRes.success) {
        throw new Error(comparablesRes.message || 'Failed to load comparables');
      }
      if (!reportRes.success) {
        throw new Error(reportRes.message || 'Failed to load report');
      }

      // Type-safe data extraction
      const overview = overviewRes.data as SellerPrepOverviewData;
      const comparables = comparablesRes.data as ComparableHome[];
      const report = reportRes.data as ReadinessReport;

      return {
        overview,
        comparables,
        report,
      };
    },
    enabled: !!propertyId,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
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
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-blue-600 hover:text-blue-700 mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="gap-3">
      {/* Back */}
      <Link
        href={`/dashboard/properties/${propertyId}`}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Property
      </Link>

      {/* Header */}
      <PageHeader className="pt-2 pb-3">
        <PageHeaderHeading className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-600" />
          Home Sale Preparation
        </PageHeaderHeading>
        <PageHeaderDescription>
          ROI-focused checklist and readiness insights to maximize sale value
        </PageHeaderDescription>
      </PageHeader>

      {/* Content */}
      <SellerPrepOverview
        overview={data.overview}
        comparables={data.comparables}
        report={data.report}
      />
    </DashboardShell>
  );
}