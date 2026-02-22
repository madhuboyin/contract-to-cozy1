// apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Shield,
  Home,
  ArrowRight,
  CircleHelp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { PrimaryRiskSummary, RiskSummaryStatus } from "@/types";
import ScoreGauge from "@/components/ui/ScoreGauge";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const getRiskDetails = (score: number) => {
  if (score >= 80) return { level: "Low Risk", color: "text-emerald-600" };
  if (score >= 60) return { level: "Elevated", color: "text-amber-600" };
  if (score >= 40) return { level: "High Risk", color: "text-red-500" };
  return { level: "High Risk", color: "text-red-600" };
};

const getRiskCardTone = (score: number) => {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
  if (score >= 60) return "bg-amber-50/30 border-amber-200/50";
  return "bg-red-50/30 border-red-200/50";
};

interface PropertyRiskScoreCardProps {
  propertyId?: string;
}

export const PropertyRiskScoreCard: React.FC<PropertyRiskScoreCardProps> = ({
  propertyId,
}) => {
  const router = useRouter();
  const [showHow, setShowHow] = React.useState(false);
  const enabled = !!propertyId;

  const FALLBACK_SUMMARY: PrimaryRiskSummary = {
    propertyId: propertyId || "",
    propertyName: null,
    riskScore: 0,
    financialExposureTotal: 0,
    lastCalculatedAt: null,
    status: "NO_PROPERTY" as RiskSummaryStatus,
  };

  const riskQuery = useQuery({
    queryKey: ["primary-risk-summary", propertyId],
    queryFn: async () => {
      if (!propertyId) {
        return FALLBACK_SUMMARY;
      }

      const reportOrStatus = await api.getRiskReportSummary(propertyId);

      if (typeof reportOrStatus === "string") {
        return {
          propertyId,
          propertyName: null,
          riskScore: 0,
          financialExposureTotal: 0,
          lastCalculatedAt: null,
          status: reportOrStatus as RiskSummaryStatus,
        } as PrimaryRiskSummary;
      }

      const report = reportOrStatus;
      return {
        propertyId: report.propertyId,
        propertyName: null,
        riskScore: report.riskScore,
        financialExposureTotal:
          typeof report.financialExposureTotal === "number"
            ? report.financialExposureTotal
            : parseFloat(String(report.financialExposureTotal || 0)) || 0,
        lastCalculatedAt: report.lastCalculatedAt,
        status: "CALCULATED" as RiskSummaryStatus,
      } as PrimaryRiskSummary;
    },
    retry: (failureCount, error: any) =>
      error?.message?.includes("No property") || error?.message?.includes("5000")
        ? false
        : failureCount < 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchInterval: (query) => {
      const currentStatus = (query.state.data as PrimaryRiskSummary)?.status;
      return currentStatus === "QUEUED" ? 10000 : false;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled,
  });

  const riskSnapshotQuery = useQuery({
    queryKey: ["property-score-snapshot", propertyId, "RISK"],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getPropertyScoreSnapshots(propertyId, 16);
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  const summary = riskQuery.data || FALLBACK_SUMMARY;
  const isInitialLoading = riskQuery.isLoading && !summary.lastCalculatedAt;

  const riskScore = summary.riskScore || 0;
  const exposure = summary.financialExposureTotal || 0;
  const { level, color } = getRiskDetails(riskScore);
  const protectionLabel = riskScore === 0 && exposure > 0 ? "High Risk" : level;
  const riskDelta = riskSnapshotQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? 0;
  const reportLink = `/dashboard/properties/${propertyId}/risk-assessment`;
  const changeBadgeClass =
    riskDelta > 0
      ? "bg-red-100 text-red-700"
      : riskDelta < 0
      ? "bg-emerald-100 text-emerald-700"
      : "bg-gray-100 text-gray-500";
  const changeLabel =
    riskDelta > 0
      ? `+${riskDelta.toFixed(1)}`
      : riskDelta < 0
      ? `${riskDelta.toFixed(1)}`
      : "No change";

  if (!propertyId || summary.status === "NO_PROPERTY") {
    return (
      <Card className="flex h-full flex-col border-2 border-dashed border-gray-300">
        <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
          <Shield className="mb-2 h-8 w-8 text-gray-400" />
          <p className="mb-3 text-center text-sm text-gray-500">Select a property</p>
          <Link href="/dashboard/properties" passHref>
            <Button variant="secondary" size="sm" className="text-xs">
              Manage Properties
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isInitialLoading || summary.status === "QUEUED") {
    return (
      <Card className="flex h-full flex-col border border-gray-200">
        <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-center text-sm text-gray-500">
            {summary.status === "QUEUED" ? "Calculating..." : "Loading..."}
          </p>
          <p className="mt-1 text-xs text-gray-400">Please wait</p>
        </CardContent>
      </Card>
    );
  }

  if (summary.status === "MISSING_DATA") {
    return (
      <Card className="flex h-full flex-col border-2 border-gray-300">
        <CardContent className="flex flex-1 flex-col items-center justify-center p-4">
          <Home className="mb-2 h-8 w-8 text-gray-400" />
          <p className="mb-1 text-center text-sm font-semibold text-gray-700">
            More Details Needed
          </p>
          <p className="mb-3 text-center text-xs text-gray-500">
            Complete property info
          </p>
          <Link href={reportLink} passHref>
            <Button variant="secondary" size="sm" className="text-xs">
              Update Details
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`h-full border p-0 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${getRiskCardTone(
        riskScore
      )}`}
      onClick={() => router.push(reportLink)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(reportLink);
        }
      }}
    >
      <CardContent className="flex h-full flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-600" />
            <h3 className="text-base font-semibold text-gray-900">Risk Exposure</h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${changeBadgeClass}`}
            >
              {changeLabel}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </div>
        </div>

        <div className="my-3 flex flex-col items-center gap-1.5">
          <ScoreGauge
            value={riskScore}
            label="Protection Score"
            sublabel={protectionLabel}
            size="summary"
            strokeWidth={7}
            animate
            showLabel={false}
            showSublabel={false}
            minVisualValue={5}
            pathColorOverride={riskScore < 20 ? "#ef4444" : undefined}
            trailColorOverride={riskScore < 20 ? "#fecaca" : undefined}
            tooltipText="Your overall risk assessment score across all monitored categories. 0/100 indicates high exposure and weak protection coverage."
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            PROTECTION SCORE
          </span>
          <span className={`text-sm font-bold ${color}`}>{protectionLabel}</span>
        </div>

        <div className="mt-auto border-t border-gray-100 pt-2 text-center">
          <span className="text-xs text-gray-400">EXPOSURE</span>
          <span className="ml-2 text-xs font-semibold text-red-600">
            {formatCurrency(exposure)}
          </span>
        </div>

        <div className="mt-2 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowHow((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <CircleHelp className="h-3 w-3" />
            How is this calculated?
          </button>
          {showHow ? (
            <p className="mt-1.5 text-xs text-gray-600">
              This combines overdue maintenance, active hazards, coverage gaps,
              and local risk factors. Lower protection scores indicate higher risk.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
