"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HelpCircle, Loader2, Shield } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { api } from "@/lib/api/client";
import { PrimaryRiskSummary, RiskSummaryStatus } from "@/types";

interface PropertyRiskScoreCardProps {
  propertyId?: string;
}

const CARD_SHELL = "rounded-xl border p-4 flex flex-col gap-3";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getRiskTone(score: number) {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
  if (score >= 60) return "bg-amber-50/30 border-amber-200/50";
  return "bg-red-50/30 border-red-200/50";
}

function getRiskStatus(score: number) {
  if (score >= 80) return { label: "Low Risk", color: "text-emerald-600" };
  if (score >= 60) return { label: "Elevated", color: "text-amber-600" };
  return { label: "High Risk", color: "text-red-600" };
}

function getRiskPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export function PropertyRiskScoreCard({ propertyId }: PropertyRiskScoreCardProps) {
  const FALLBACK_SUMMARY: PrimaryRiskSummary = {
    propertyId: propertyId || "",
    propertyName: null,
    riskScore: 0,
    financialExposureTotal: 0,
    lastCalculatedAt: null,
    status: "NO_PROPERTY" as RiskSummaryStatus,
  };

  const summaryQuery = useQuery({
    queryKey: ["primary-risk-summary", propertyId],
    queryFn: async () => {
      if (!propertyId) return FALLBACK_SUMMARY;
      const reportOrStatus = await api.getRiskReportSummary(propertyId);
      if (typeof reportOrStatus === "string") {
        return {
          ...FALLBACK_SUMMARY,
          propertyId,
          status: reportOrStatus as RiskSummaryStatus,
        };
      }
      return {
        propertyId: reportOrStatus.propertyId,
        propertyName: null,
        riskScore: reportOrStatus.riskScore,
        financialExposureTotal:
          typeof reportOrStatus.financialExposureTotal === "number"
            ? reportOrStatus.financialExposureTotal
            : Number(reportOrStatus.financialExposureTotal || 0),
        lastCalculatedAt: reportOrStatus.lastCalculatedAt,
        status: "CALCULATED" as RiskSummaryStatus,
      };
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot", propertyId, "RISK"],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getPropertyScoreSnapshots(propertyId, 16);
    },
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });

  const summary = summaryQuery.data || FALLBACK_SUMMARY;
  const isLoading = summaryQuery.isLoading;
  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/risk-assessment`
    : "/dashboard/properties";

  if (!propertyId || summary.status === "NO_PROPERTY") {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Risk Exposure
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view risk.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Risk Exposure
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading risk...
        </div>
      </div>
    );
  }

  const riskScore = Math.max(0, Math.round(summary.riskScore || 0));
  const displayValue = riskScore === 0 ? 3 : riskScore;
  const exposure = Math.max(0, Math.round(summary.financialExposureTotal || 0));
  const riskStatus = getRiskStatus(riskScore);
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? null
  );

  return (
    <div className={`${CARD_SHELL} ${getRiskTone(riskScore)}`}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Shield className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
            Risk Exposure
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="whitespace-nowrap text-xs text-gray-400">{weeklyChange}</span>
          <Link href={reportLink} className="inline-flex">
            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="h-[88px] w-[88px]">
          <CircularProgressbar
            value={displayValue}
            text={`${riskScore}`}
            strokeWidth={8}
            styles={buildStyles({
              textSize: "28px",
              textColor: "#111827",
              pathColor: getRiskPathColor(riskScore),
              trailColor: "#e5e7eb",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            PROTECTION SCORE
          </p>
          <p className={`text-sm font-bold ${riskStatus.color}`}>{riskStatus.label}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-red-200/50 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Exposure
          </span>
          <span className="text-xs font-bold text-red-600">{formatCurrency(exposure)}</span>
        </div>
        <button className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-600 hover:underline">
          <HelpCircle className="h-3 w-3" />
          How is this calculated?
        </button>
      </div>
    </div>
  );
}
