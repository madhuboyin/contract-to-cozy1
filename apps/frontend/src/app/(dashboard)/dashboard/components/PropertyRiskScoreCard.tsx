"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HelpCircle, Loader2, Shield } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { api } from "@/lib/api/client";
import { PrimaryRiskSummary, RiskSummaryStatus } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PropertyRiskScoreCardProps {
  propertyId?: string;
}

const CARD_BASE = "h-full rounded-xl border p-4 flex flex-col gap-3";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getRiskTone(score: number) {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/60";
  if (score >= 60) return "bg-amber-50/30 border-amber-200/60";
  return "bg-rose-50/25 border-rose-200/55";
}

function getRiskAccent(score: number): string {
  if (score < 60) return "border-l-4 border-l-rose-300";
  if (score < 80) return "border-l-4 border-l-amber-400";
  return "";
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

function buildRiskInsight(score: number, exposure: number): string {
  const formatted = formatCurrency(exposure);
  if (score >= 80) return `Exposure appears contained with ${formatted} currently modeled at risk.`;
  if (score >= 60) return `Some exposure pressure is emerging with ${formatted} modeled at risk.`;
  return `Modeled exposure is elevated at ${formatted} and deserves near-term mitigation review.`;
}

function getRiskPriority(score: number) {
  if (score < 60) {
    return {
      label: "Needs Focus",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (score < 80) {
    return {
      label: "Watch",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Stable",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function buildRiskMeaning(score: number): string {
  if (score >= 80) return "How this reads: protection currently offsets most modeled downside.";
  if (score >= 60) return "How this reads: some gaps may increase impact if an event occurs.";
  return "How this reads: coverage and exposure are out of balance and may need adjustment.";
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
      <div className={`${CARD_BASE} bg-white border-gray-200`}>
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
      <div className={`${CARD_BASE} bg-white border-gray-200`}>
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
  const displayValue = Math.max(riskScore, 8);
  const exposure = Math.max(0, Math.round(summary.financialExposureTotal || 0));
  const riskStatus = getRiskStatus(riskScore);
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? null
  );
  const insight = buildRiskInsight(riskScore, exposure);
  const meaning = buildRiskMeaning(riskScore);
  const priority = getRiskPriority(riskScore);

  return (
    <div
      className={`${CARD_BASE} ${getRiskTone(riskScore)} ${getRiskAccent(riskScore)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Risk Exposure
            </span>
          </div>
          <p className="line-clamp-2 text-[11px] text-gray-600">{meaning}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${priority.className}`}
          >
            {priority.label}
          </span>
          <span className="whitespace-nowrap text-[11px] text-gray-400">{weeklyChange}</span>
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
              strokeLinecap: "butt",
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

      {/* Contextual insight line */}
      <p className="text-[11px] leading-snug text-gray-600">{insight}</p>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-rose-200/50 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Exposure
          </span>
          <span className="text-xs font-bold text-rose-700">{formatCurrency(exposure)}</span>
        </div>
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="How risk exposure is calculated"
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-600 hover:underline"
              >
                <HelpCircle className="h-3 w-3" />
                How is this calculated?
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed">
              Exposure combines each asset&apos;s estimated cost, risk probability, and current coverage.
              Higher uncovered cost and likelihood increase total risk exposure.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Link
          href={reportLink}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          Open risk details
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
