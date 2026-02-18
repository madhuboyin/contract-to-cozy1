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
          <div className="h-10 w-48 animate-pulse rounded bg-slate-200/70" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70 lg:col-span-8" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70 lg:col-span-4" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error || !data) {
    return (
      <DashboardShell>
        <Card className="rounded-2xl border border-red-200/70 bg-red-50/85 p-6 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-600">
                Failed to load Seller Preparation insights
              </p>
              <p className="mt-1 text-sm text-red-700/80">
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
    <DashboardShell className="mx-auto max-w-7xl gap-5 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-6">
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
      <div className="relative overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.6)] dark:border-slate-700/70 dark:bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.12),transparent_40%),radial-gradient(circle_at_88%_14%,rgba(20,184,166,0.12),transparent_40%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.78))]">
        <div className="space-y-3 rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/45">
          <Link
            href={`/dashboard/properties/${propertyId}`}
            className="inline-flex items-center text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            Back to Property
          </Link>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <PageHeader className="p-0">
              <PageHeaderHeading className="flex items-center gap-2 text-2xl text-slate-900 dark:text-slate-100">
                <TrendingUp className="h-6 w-6 text-teal-600 dark:text-teal-300" />
                Home Sale Preparation
              </PageHeaderHeading>
              <PageHeaderDescription className="text-slate-600 dark:text-slate-300">
                Personalized action plan to maximize your home&apos;s resale value
              </PageHeaderDescription>
            </PageHeader>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditPreferences}
                className="h-10 rounded-full border-slate-300/70 bg-white/85 px-4 text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Settings className="mr-2 h-4 w-4" />
                {data.overview.preferences ? "Edit Preferences" : "Setup Plan"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <SellerPrepDisclaimer />
      </div>

      {/* Main Redesigned Dashboard Content */}
      <div className="rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 via-slate-50/72 to-teal-50/45 p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/70 dark:from-slate-900/55 dark:via-slate-900/48 dark:to-slate-900/38">
        <SellerPrepOverview
          overview={data.overview}
          comparables={data.comparables}
          report={data.report}
          propertyId={propertyId as string}
        />
      </div>

      {/* Persistent Feedback Mechanism */}
      {propertyId && (
        <div className="mt-6 border-t border-slate-200/70 pt-6 dark:border-slate-700/70">
          <FeedbackWidget propertyId={propertyId} />
        </div>
      )}
    </DashboardShell>
  );
}
