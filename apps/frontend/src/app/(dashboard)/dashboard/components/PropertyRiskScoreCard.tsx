"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HelpCircle, Loader2, Shield } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { api } from "@/lib/api/client";
import { PrimaryRiskSummary, RiskSummaryStatus } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PropertyRiskScoreCardProps {
  propertyId?: string;
}

const CARD_BASE =
  "flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-gray-400";
const TITLE_CLASS = "truncate whitespace-nowrap text-sm font-semibold text-gray-900";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500";
const META_VALUE = "text-sm font-semibold text-gray-900";
const BADGE_BASE = "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getRiskStatus(score: number) {
  if (score >= 80) return { label: "Low Risk", color: "text-emerald-600" };
  if (score >= 60) return { label: "Elevated", color: "text-amber-600" };
  return { label: "High Risk", color: "text-rose-700" };
}

function getRiskPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#d97706";
  return "#e11d48";
}

function buildRiskInsight(score: number, exposure: number): string {
  const formatted = formatCurrency(exposure);
  if (score >= 80) return `Exposure is contained at ${formatted}.`;
  if (score >= 60) return `Exposure is trending elevated at ${formatted}.`;
  return `Exposure is elevated at ${formatted} and needs near-term mitigation.`;
}

function getRiskPriority(score: number) {
  if (score < 60) {
    return {
      label: "Needs Focus",
      className: "border-rose-200/80 bg-rose-50/70 text-rose-700",
    };
  }
  if (score < 80) {
    return {
      label: "Watch",
      className: "border-amber-200/80 bg-amber-50/70 text-amber-700",
    };
  }
  return {
    label: "Stable",
    className: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
  };
}

function buildRiskMeaning(score: number): string {
  if (score >= 80) return "Coverage and exposure are currently in balance.";
  if (score >= 60) return "A few gaps could increase downside in an event.";
  return "Coverage and exposure are out of balance.";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

function weeklyDeltaClass(weeklyChange: string) {
  if (weeklyChange === "No change") return "text-gray-500";
  if (weeklyChange.startsWith("-")) return "text-rose-700";
  return "text-emerald-700";
}

function weeklyDeltaLabel(weeklyChange: string) {
  if (weeklyChange === "No change") return "No change";
  return `${weeklyChange} pts`;
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
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Risk Exposure</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view risk.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Risk Exposure</span>
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
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Risk Exposure</span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">{meaning}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className={cn(BADGE_BASE, priority.className)}>{priority.label}</span>
          {weeklyChange !== "No change" ? (
            <span className={cn("text-[11px] font-medium", weeklyDeltaClass(weeklyChange))}>
              {weeklyDeltaLabel(weeklyChange)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-[78px] w-[78px] sm:h-[84px] sm:w-[84px]">
          <CircularProgressbar
            value={displayValue}
            text={`${riskScore}`}
            strokeWidth={7}
            styles={buildStyles({
              textSize: "30px",
              textColor: "#0f172a",
              pathColor: getRiskPathColor(riskScore),
              trailColor: "#e2e8f0",
              strokeLinecap: "butt",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="space-y-1">
          <p className={SUPPORT_LABEL}>Protection Score</p>
          <p className={cn("text-sm font-semibold", riskStatus.color)}>{riskStatus.label}</p>
          <p className="text-xs text-gray-500">Risk profile</p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-600">{insight}</p>

      <div className="mt-auto space-y-2.5 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Exposure</span>
          <span className={cn(META_VALUE, riskScore < 60 ? "text-rose-700" : "text-gray-900")}>
            {formatCurrency(exposure)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Weekly Change</span>
          <span className={cn(META_VALUE, weeklyDeltaClass(weeklyChange))}>
            {weeklyDeltaLabel(weeklyChange)}
          </span>
        </div>

        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="How risk exposure is calculated"
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 transition-colors hover:text-gray-800"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                How this is calculated
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
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900"
        >
          Open risk details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
