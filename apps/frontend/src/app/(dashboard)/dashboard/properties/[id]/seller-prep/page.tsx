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
import { ArrowLeft, TrendingUp } from "lucide-react";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";

export default function SellerPrepPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-prep", propertyId],
    queryFn: async () => {
      if (!propertyId) throw new Error("Property ID missing");

      const [overview, comparables, report] = await Promise.all([
        api.getSellerPrepOverview(propertyId),
        api.getSellerPrepComparables(propertyId),
        api.getSellerPrepReport(propertyId),
      ]);

      // Check all responses for success before accessing data
      if (!overview.success || !comparables.success || !report.success) {
        const errorMessage = 
          !overview.success ? overview.message :
          !comparables.success ? comparables.message :
          report.message;
        throw new Error(errorMessage || 'Failed to load seller prep data');
      }

      return {
        overview: overview.data as {
          items: Array<{
            id: string;
            title: string;
            priority: string;
            roiRange: string;
            costBucket: string;
            status: string;
          }>;
          completionPercent: number;
        },
        comparables: comparables.data as any[],
        report: report.data as {
          summary: string;
          highlights?: string[];
          risks?: string[];
        },
      };
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

  if (error || !data) {
    return (
      <DashboardShell>
        <Card className="p-6">
          <p className="text-sm text-red-600">
            Failed to load Seller Preparation insights.
          </p>
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
