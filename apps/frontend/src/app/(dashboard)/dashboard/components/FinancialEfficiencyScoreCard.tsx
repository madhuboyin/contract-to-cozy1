"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, DollarSign, Loader2 } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import dynamic from "next/dynamic";
import { api } from "@/lib/api/client";
import { FinancialReportSummary, FinancialSummaryStatus } from "@/types";
import { useCelebration } from "@/hooks/useCelebration";
import { cn } from "@/lib/utils";

const MilestoneCelebration = dynamic(
  () => import("@/components/ui/MilestoneCelebration").then((m) => m.MilestoneCelebration),
  { ssr: false },
);

interface FinancialEfficiencyScoreCardProps {
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

function getFinancialPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0d9488";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function getFinancialLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-600" };
  return { label: "Poor", color: "text-rose-600" };
}

function buildFinancialInsight(score: number, annualCost: number): string {
  if (score >= 80) return "Ownership costs are trending efficiently.";
  if (score >= 60) return `Annual cost is ${formatCurrency(annualCost)} with optimization headroom.`;
  return "Cost pressure is elevated and needs near-term tuning.";
}

function getFinancialPriority(score: number) {
  if (score < 60) {
    return {
      label: "Needs Focus",
      className: "border-amber-200/80 bg-amber-50/70 text-amber-700",
    };
  }
  if (score < 80) {
    return {
      label: "Watch",
      className: "border-teal-200/80 bg-teal-50/70 text-teal-700",
    };
  }
  return {
    label: "Stable",
    className: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
  };
}

function buildFinancialMeaning(score: number): string {
  if (score >= 80) return "Spend is aligned with healthy ownership economics.";
  if (score >= 60) return "Costs are manageable with room to optimize.";
  return "Current spending may compress cash flexibility.";
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

export const FinancialEfficiencyScoreCard: React.FC<
  FinancialEfficiencyScoreCardProps
> = ({ propertyId }) => {
  const FALLBACK_SUMMARY: FinancialReportSummary = {
    propertyId: propertyId || "",
    financialEfficiencyScore: 0,
    financialExposureTotal: 0,
    lastCalculatedAt: null,
    status: "NO_PROPERTY" as FinancialSummaryStatus,
  };

  const summaryQuery = useQuery({
    queryKey: ["financial-efficiency-summary", propertyId],
    queryFn: async () => {
      if (!propertyId) return FALLBACK_SUMMARY;
      return api.getFinancialReportSummary(propertyId);
    },
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });

  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot", propertyId, "FINANCIAL"],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getPropertyScoreSnapshots(propertyId, 16);
    },
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
  });

  const summary = summaryQuery.data || FALLBACK_SUMMARY;
  const isLoading = summaryQuery.isLoading;

  const { celebration, celebrate, dismiss } = useCelebration(`financial-${propertyId ?? "none"}`);

  const score = Math.max(0, Math.round(summary.financialEfficiencyScore || 0));

  useEffect(() => {
    if (
      !isLoading &&
      score >= 60 &&
      summary.status !== "QUEUED" &&
      summary.status !== "NO_PROPERTY"
    ) {
      celebrate("savings");
    }
  }, [isLoading, score, summary.status, celebrate]);

  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/financial-efficiency`
    : "/dashboard/properties";

  if (!propertyId || summary.status === "NO_PROPERTY") {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Financial</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view financial score.</div>
      </div>
    );
  }

  if (isLoading || summary.status === "QUEUED") {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Financial</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading financials...
        </div>
      </div>
    );
  }

  const annualCost = Math.max(0, Math.round(summary.financialExposureTotal || 0));
  const status = getFinancialLabel(score);
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null
  );
  const insight = buildFinancialInsight(score, annualCost);
  const meaning = buildFinancialMeaning(score);
  const priority = getFinancialPriority(score);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Financial</span>
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
            value={score}
            text={`${score}`}
            strokeWidth={7}
            styles={buildStyles({
              textSize: "30px",
              textColor: "#0f172a",
              pathColor: getFinancialPathColor(score),
              trailColor: "#e2e8f0",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="space-y-1">
          <p className={SUPPORT_LABEL}>Financial</p>
          <p className={cn("text-sm font-semibold", status.color)}>{status.label}</p>
          <p className="text-xs text-gray-500">Efficiency score</p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-600">{insight}</p>

      <div className="mt-auto space-y-2.5 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Annual Cost</span>
          <span className={META_VALUE}>{formatCurrency(annualCost)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Weekly Change</span>
          <span className={cn(META_VALUE, weeklyDeltaClass(weeklyChange))}>
            {weeklyDeltaLabel(weeklyChange)}
          </span>
        </div>
        <Link
          href={reportLink}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900"
        >
          Open financial details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </div>
  );
};
