"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { api } from "@/lib/api/client";
import { AssetRiskDetail, PrimaryRiskSummary, RiskSummaryStatus } from "@/types";
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
  "score-card score-card-status-tinted score-card-status-red score-card-status-animate flex h-full flex-col gap-[0.6rem] rounded-xl px-[0.9rem] py-[0.85rem] shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "mb-[2px] block text-[9px] font-medium tracking-normal text-muted-foreground";
const META_VALUE = "text-[12px] font-medium text-foreground";
const DESCRIPTION_CLASS =
  "text-[11.5px] text-muted-foreground leading-[1.55] line-clamp-2 min-h-[2.3rem]";
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

  // Navigate to risk assessment with exposure focus
  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/risk-assessment${totalExposure > 0 ? '?focus=exposure' : ''}`
    : "/dashboard/properties";

  const exposureHeadline = totalExposure === 0 ? "$0 gap" : formatCurrency(totalExposure);
  const exposureTone = totalExposure === 0 ? "text-teal-600" : "text-red-600";
  const coveragePct = Math.round(coverageRatio * 100);
  const coverageLabel = `${coveragePct}%`;
  const description =
    weeklyChange === "No change"
      ? meaning
      : `${meaning} Weekly change: ${weeklyDeltaLabel(weeklyChange)}.`;

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
          size={64}
          strokeWidth={5}
          ringPadding={3.5}
          colorScheme={totalExposure > 0 ? "red" : "teal"}
          label={coverageLabel}
          subLabel="covered"
          labelFontSize={12}
          labelFontWeight={600}
          labelY={30}
          subLabelY={43}
          subLabelFontSize={9}
          subLabelOpacity={0.6}
          ariaLabel={`Risk Exposure coverage: ${Math.round(coverageRatio * 100)}% covered, ${formatCurrency(
            totalExposure,
          )} gap`}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div className={cn("text-[20px] font-bold leading-none", exposureTone)}>{exposureHeadline}</div>
          <p className="mt-[3px] whitespace-nowrap text-[11px] text-muted-foreground">Unprotected</p>
        </div>
      </div>

      <div className="h-[0.5px] bg-border/80" />

      <p className={DESCRIPTION_CLASS}>{description}</p>

      <div className="h-[15px]" aria-hidden="true" />

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
        <div>
          <span className={SUPPORT_LABEL}>Covered</span>
          <div className={cn(META_VALUE, "text-teal-600")}>{formatCurrency(Math.round(coveredAmount))}</div>
        </div>
        <div>
          <span className={SUPPORT_LABEL}>Gap</span>
          <div className={cn(META_VALUE, totalExposure > 0 ? "text-red-600" : "text-teal-600")}>
            {formatCurrency(totalExposure)}
          </div>
        </div>
      </div>

      <Link
        href={
          totalExposure > 0 
            ? `${reportLink}${weeklyChange !== "No change" ? '&view=trends' : ''}`
            : weeklyChange !== "No change"
            ? `${reportLink}?view=trends`
            : reportLink
        }
        className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        {totalExposure > 0 
          ? 'Review exposure details' 
          : weeklyChange !== "No change"
          ? 'View risk trends'
          : 'Open risk details'
        }
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
