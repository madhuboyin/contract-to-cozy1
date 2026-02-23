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

const MilestoneCelebration = dynamic(
  () => import("@/components/ui/MilestoneCelebration").then((m) => m.MilestoneCelebration),
  { ssr: false },
);

interface FinancialEfficiencyScoreCardProps {
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

function getFinancialTone(score: number) {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
  if (score >= 60) return "bg-teal-50/30 border-teal-200/50";
  return "bg-amber-50/30 border-amber-200/50";
}

function getFinancialPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#14b8a6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getFinancialLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-500" };
  return { label: "Poor", color: "text-red-500" };
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
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

  // Celebrate the first time a savings-worthy score loads
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
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Financial
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view financial score.</div>
      </div>
    );
  }

  if (isLoading || summary.status === "QUEUED") {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Financial
            </span>
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

  return (
    <div className={`${CARD_SHELL} ${getFinancialTone(score)}`}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <DollarSign className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
            Financial
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
            value={score}
            text={`${score}`}
            strokeWidth={8}
            styles={buildStyles({
              textSize: "28px",
              textColor: "#111827",
              pathColor: getFinancialPathColor(score),
              trailColor: "#e5e7eb",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            FINANCIAL
          </p>
          <p className={`text-sm font-bold ${status.color}`}>{status.label}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-emerald-200/50 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Annual Cost
          </span>
          <span className="text-xs font-bold text-gray-700">{formatCurrency(annualCost)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Potential Savings
          </span>
          <span className="text-xs font-bold text-emerald-600">$220-$760</span>
        </div>
      </div>
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </div>
  );
};
