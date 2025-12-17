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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, TrendingUp } from "lucide-react";

import SellerPrepOverview from "@/components/seller-prep/SellerPrepOverview";

// Types matching SellerPrepOverview component
interface ROIFix {
  item: string;
  roiPercent: number;
  estimatedCost?: number;
}

interface ComparableSale {
  address: string;
  soldPrice: number;
  soldDate: string;
  distanceMiles?: number;
}

interface CurbAppealResult {
  score: number;
  summary: string;
  recommendations: string[];
}

interface StagingTip {
  room: string;
  suggestion: string;
}

interface AgentQuestion {
  category: string;
  questions: string[];
}

export default function SellerPrepPage() {
  const params = useParams();
  const propertyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["seller-prep", propertyId],
    queryFn: async () => {
      if (!propertyId) throw new Error("Property ID missing");

      const [
        roi,
        comparables,
        curbAppeal,
        staging,
        agentGuide,
      ] = await Promise.all([
        api.getSellerPrepROI(propertyId),
        api.getSellerPrepComparables(propertyId),
        api.getSellerPrepCurbAppeal(propertyId),
        api.getSellerPrepStaging(propertyId),
        api.getSellerPrepAgentGuide(),
      ]);

      // Check all responses for success before accessing data
      if (!roi.success || !comparables.success || !curbAppeal.success || !staging.success || !agentGuide.success) {
        const errorMessage = 
          !roi.success ? roi.message :
          !comparables.success ? comparables.message :
          !curbAppeal.success ? curbAppeal.message :
          !staging.success ? staging.message :
          agentGuide.message;
        throw new Error(errorMessage || 'Failed to load seller prep data');
      }

      return {
        roi: roi.data as ROIFix[],
        comparables: comparables.data as ComparableSale[],
        curbAppeal: curbAppeal.data as CurbAppealResult,
        staging: staging.data as StagingTip[],
        agentGuide: agentGuide.data as AgentQuestion[],
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
      {/* Back Navigation */}
      <div>
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Property
        </Link>
      </div>

      {/* Header */}
      <PageHeader className="pt-2 pb-3">
        <PageHeaderHeading className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-600" />
          Home Sale Preparation
        </PageHeaderHeading>
        <PageHeaderDescription>
          Smart, ROI-driven recommendations to maximize your home’s sale price.
        </PageHeaderDescription>
      </PageHeader>

      {/* Main Content */}
      <SellerPrepOverview
        roi={data.roi}
        comparables={data.comparables}
        curbAppeal={data.curbAppeal}
        staging={data.staging}
        agentGuide={data.agentGuide}
      />

      {/* Footer CTA (intentional soft CTA) */}
      <div className="flex justify-end pt-4">
        <Button variant="outline" disabled>
          Seller Report PDF (Coming Soon)
        </Button>
      </div>
    </DashboardShell>
  );
}
