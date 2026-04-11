"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, DollarSign, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api/client";
import { FinancialReportSummary, FinancialSummaryStatus } from "@/types";
import { useCelebration } from "@/hooks/useCelebration";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { BadgeStatus, StatusBadge } from "@/components/ui/StatusBadge";

const MilestoneCelebration = dynamic(
  () => import("@/components/ui/MilestoneCelebration").then((m) => m.MilestoneCelebration),
  { ssr: false },
);

interface FinancialEfficiencyScoreCardProps {
  propertyId?: string;
}

const CARD_BASE =
  "score-card score-card-status-tinted score-card-status-teal score-card-status-animate flex h-full flex-col gap-3 rounded-xl p-4 shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const META_VALUE = "text-[13px] font-medium text-foreground";
const DESCRIPTION_CLASS =
  "text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.4rem] mb-3";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getFinancialLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-teal-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-600" };
  return { label: "Poor", color: "text-red-600" };
}

function buildFinancialInsight(score: number, annualCost: number): string {
  if (score >= 80) return "Ownership costs are trending efficiently.";
  if (score >= 60) return `Annual cost is ${formatCurrency(annualCost)} with optimization headroom.`;
  return "Cost pressure is elevated and needs near-term tuning.";
}

function getFinancialPriority(score: number): { status: BadgeStatus; customLabel?: string } {
  if (score < 60) {
    return { status: "action", customLabel: "Needs focus" };
  }
  if (score < 80) {
    return { status: "watch" };
  }
  return { status: "good" };
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

function weeklyDeltaLabel(weeklyChange: string) {
  if (weeklyChange === "No change") return "No change";
  return `${weeklyChange} pts`;
}

export const FinancialEfficiencyScoreCard: React.FC<FinancialEfficiencyScoreCardProps> = ({ propertyId }) => {
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
    if (!isLoading && score >= 60 && summary.status !== "QUEUED" && summary.status !== "NO_PROPERTY") {
      celebrate("savings");
    }
  }, [isLoading, score, summary.status, celebrate]);

  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/financial-efficiency`
    : "/dashboard/properties";

  if (!propertyId || summary.status === "NO_PROPERTY") {
    return (
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Financial</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">Select a property to view financial score.</div>
      </div>
    );
  }

  if (isLoading || summary.status === "QUEUED") {
    return (
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <DollarSign className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Financial</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading financials...
        </div>
      </div>
    );
  }

  const annualCost = Math.max(0, Math.round(summary.financialExposureTotal || 0));
  const status = getFinancialLabel(score);
  const weeklyChange = formatWeeklyDelta(snapshotQuery.data?.scores?.FINANCIAL?.deltaFromPreviousWeek ?? null);
  const description = buildFinancialInsight(score, annualCost);
  const badge = getFinancialPriority(score);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <DollarSign className={HEADER_ICON} />
          <span className={TITLE_CLASS}>Financial</span>
        </div>
        <StatusBadge status={badge.status} customLabel={badge.customLabel} />
      </div>

      <div className="flex justify-center">
        <ScoreRing
          value={score}
          maxValue={100}
          size={88}
          strokeWidth={6}
          ringPadding={5}
          colorScheme="teal"
          label={String(score)}
          labelFontSize={22}
          labelFontWeight={600}
          ariaLabel={`Financial: ${score} out of 100, ${status.label}`}
        />
      </div>

      <div className={cn("text-center text-[20px] font-bold leading-none", status.color)}>{status.label}</div>
      <p className="text-center text-[11px] text-muted-foreground whitespace-nowrap">Spend fully optimized</p>

      <div className="h-px bg-border/80" />

      <p className={DESCRIPTION_CLASS}>{description}</p>

      <div className="conf-spacer h-5 mb-3" aria-hidden="true" />

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          <span className={SUPPORT_LABEL}>Annual cost</span>
          <div className={META_VALUE}>{formatCurrency(annualCost)}</div>
        </div>
        <div>
          <span className={SUPPORT_LABEL}>Weekly change</span>
          <div className={META_VALUE}>
            {weeklyDeltaLabel(weeklyChange)}
          </div>
        </div>
      </div>

      <Link
        href={reportLink}
        className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        Open financial details
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
      <MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} />
    </div>
  );
};
