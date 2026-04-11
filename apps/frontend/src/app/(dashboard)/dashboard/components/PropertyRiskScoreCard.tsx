"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, HelpCircle, Loader2, Shield } from "lucide-react";
import { api } from "@/lib/api/client";
import { AssetRiskDetail, PrimaryRiskSummary, RiskSummaryStatus } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { BadgeStatus, StatusBadge } from "@/components/ui/StatusBadge";

interface PropertyRiskScoreCardProps {
  propertyId?: string;
}

type RiskSummaryCardModel = PrimaryRiskSummary & {
  details: AssetRiskDetail[];
};

const CARD_BASE =
  "score-card flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground";
const META_VALUE = "text-sm font-semibold text-foreground";
const EXPOSURE_CRITICAL_THRESHOLD = 10_000;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function clampCoverageFactor(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function buildCoverageMetrics(details: AssetRiskDetail[], totalExposure: number) {
  const totalAssetValue = details.reduce((sum, detail) => {
    return sum + Math.max(0, Number(detail.replacementCost || 0));
  }, 0);

  const coveredAmount = details.reduce((sum, detail) => {
    const replacementCost = Math.max(0, Number(detail.replacementCost || 0));
    return sum + replacementCost * clampCoverageFactor(Number(detail.coverageFactor || 0));
  }, 0);

  const coverageRatio =
    totalExposure === 0
      ? 1
      : totalAssetValue > 0
        ? Math.min(Math.max(coveredAmount / totalAssetValue, 0), 1)
        : 0;

  return { totalAssetValue, coveredAmount, coverageRatio };
}

function getExposureBadge(totalExposure: number): { status: BadgeStatus; label: string } {
  if (totalExposure <= 0) {
    return { status: "excellent", label: "Protected" };
  }
  if (totalExposure >= EXPOSURE_CRITICAL_THRESHOLD) {
    return { status: "critical", label: "High risk" };
  }
  return { status: "action", label: "Needs focus" };
}

function buildRiskMeaning(coverageRatio: number, totalExposure: number): string {
  if (totalExposure <= 0) return "Coverage and exposure are currently in balance.";
  if (coverageRatio >= 0.7) return "Most of your estimated exposure is currently covered.";
  if (coverageRatio >= 0.3) return "Some exposure is covered, but there is still a material gap.";
  return "Most of your estimated exposure is currently unprotected.";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

function weeklyDeltaClass(weeklyChange: string) {
  if (weeklyChange === "No change") return "text-muted-foreground";
  if (weeklyChange.startsWith("-")) return "text-red-600";
  return "text-emerald-600";
}

function weeklyDeltaLabel(weeklyChange: string) {
  if (weeklyChange === "No change") return "No change";
  return `${weeklyChange} pts`;
}

export function PropertyRiskScoreCard({ propertyId }: PropertyRiskScoreCardProps) {
  const FALLBACK_SUMMARY: RiskSummaryCardModel = {
    propertyId: propertyId || "",
    propertyName: null,
    riskScore: 0,
    financialExposureTotal: 0,
    lastCalculatedAt: null,
    status: "NO_PROPERTY" as RiskSummaryStatus,
    details: [],
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
        details: Array.isArray(reportOrStatus.details) ? reportOrStatus.details : [],
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
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Risk Exposure</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">Select a property to view risk.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Risk Exposure</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading risk...
        </div>
      </div>
    );
  }

  const totalExposure = Math.max(0, Math.round(summary.financialExposureTotal || 0));
  const { coveredAmount, coverageRatio } = buildCoverageMetrics(
    summary.details ?? [],
    totalExposure,
  );
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.RISK?.deltaFromPreviousWeek ?? null,
  );
  const meaning = buildRiskMeaning(coverageRatio, totalExposure);
  const badge = getExposureBadge(totalExposure);

  const exposureHeadline = totalExposure === 0 ? "$0 gap" : formatCurrency(totalExposure);
  const exposureTone = totalExposure === 0 ? "text-teal-600" : "text-red-600";
  const coveragePct = Math.round(coverageRatio * 100);
  const coverageLabel = `${coveragePct}%`;

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Shield className={HEADER_ICON} />
          <span className={TITLE_CLASS}>Risk Exposure</span>
        </div>
        <StatusBadge status={badge.status} customLabel={badge.label} />
      </div>

      <div className="flex items-center gap-3">
        <ScoreRing
          value={coverageRatio * 100}
          maxValue={100}
          size={72}
          strokeWidth={6}
          colorScheme="auto"
          label={coverageLabel}
          ariaLabel={`Risk Exposure coverage: ${Math.round(coverageRatio * 100)}% covered, ${formatCurrency(
            totalExposure,
          )} gap`}
        />
        <div>
          <div className={cn("text-xl font-semibold", exposureTone)}>{exposureHeadline}</div>
          <div className="text-xs text-muted-foreground">
            {totalExposure === 0 ? "Fully protected" : "Unprotected exposure"}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{meaning}</p>

      <div className="mt-auto border-t border-border pt-3">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            <span className={SUPPORT_LABEL}>Covered</span>
            <div className={META_VALUE}>{formatCurrency(Math.round(coveredAmount))}</div>
          </div>
          <div>
            <span className={SUPPORT_LABEL}>Gap</span>
            <div className={cn(META_VALUE, totalExposure > 0 ? "text-red-600" : "text-teal-600")}>
              {formatCurrency(totalExposure)}
            </div>
          </div>
          <div>
            <span className={SUPPORT_LABEL}>Weekly change</span>
            <div className={cn(META_VALUE, weeklyDeltaClass(weeklyChange))}>
              {weeklyDeltaLabel(weeklyChange)}
            </div>
          </div>
        </div>
      </div>

      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How risk exposure is calculated"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How this is calculated
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-[280px] text-[11px] leading-relaxed">
            Exposure combines each asset&apos;s estimated cost, risk probability, and coverage status.
            Coverage ratio uses covered value over total asset value.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Link
        href={reportLink}
        className="group inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        Open risk details
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
