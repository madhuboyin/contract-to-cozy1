"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { api } from "@/lib/api/client";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import { cn } from "@/lib/utils";

interface PropertyHealthScoreCardProps {
  property?: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = [
  "Needs Attention",
  "Needs Review",
  "Needs Inspection",
  "Missing Data",
];

const CARD_BASE =
  "flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-gray-400";
const TITLE_CLASS = "truncate whitespace-nowrap text-sm font-semibold text-gray-900";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500";
const META_VALUE = "text-sm font-semibold text-gray-900";
const BADGE_BASE = "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium";

function getHealthPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#0d9488";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function getHealthLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-600" };
  return { label: "Poor", color: "text-rose-600" };
}

function getHealthPriority(score: number, maintenanceCount: number) {
  if (maintenanceCount >= 2 || score < 60) {
    return {
      label: "Needs Focus",
      className: "border-amber-200/80 bg-amber-50/70 text-amber-700",
    };
  }
  if (maintenanceCount === 1) {
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

function buildHealthMeaning(score: number): string {
  if (score >= 80) return "Major systems are operating in a healthy range.";
  if (score >= 60) return "Core systems are mostly healthy, with a few watch items.";
  return "Deferred upkeep may be increasing strain across key systems.";
}

function buildHealthInsight(score: number, maintenanceCount: number): string {
  if (maintenanceCount > 1) return `${maintenanceCount} maintenance items are pending.`;
  if (maintenanceCount === 1) return "1 maintenance item is pending.";
  if (score >= 80) return "Most systems are in stable condition.";
  if (score >= 60) return "A few areas are worth seasonal review.";
  return "Multiple systems need near-term attention.";
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

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot", property?.id ?? "none", "HEALTH"],
    queryFn: async () => {
      if (!property?.id) return null;
      return api.getPropertyScoreSnapshots(property.id, 16);
    },
    enabled: !!property?.id,
    staleTime: 10 * 60 * 1000,
  });

  if (!property) {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Health</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view health score.</div>
      </div>
    );
  }

  const healthScore = Math.max(0, Math.round(property.healthScore?.totalScore || 0));
  const healthDetails = getHealthLabel(healthScore);
  const maintenanceCount =
    property.healthScore?.insights.filter((insight) =>
      HIGH_PRIORITY_STATUSES.includes(insight.status)
    ).length || 0;
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null
  );
  const insight = buildHealthInsight(healthScore, maintenanceCount);
  const meaning = buildHealthMeaning(healthScore);
  const priority = getHealthPriority(healthScore, maintenanceCount);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Health</span>
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
            value={healthScore}
            text={`${healthScore}`}
            strokeWidth={7}
            styles={buildStyles({
              textSize: "30px",
              textColor: "#0f172a",
              pathColor: getHealthPathColor(healthScore),
              trailColor: "#e2e8f0",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="space-y-1">
          <p className={SUPPORT_LABEL}>Health</p>
          <p className={cn("text-sm font-semibold", healthDetails.color)}>{healthDetails.label}</p>
          <p className="text-xs text-gray-500">System score</p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-600">{insight}</p>

      <div className="mt-auto space-y-2.5 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Maintenance</span>
          <span
            className={cn(
              META_VALUE,
              maintenanceCount > 0 ? "text-amber-700" : "text-gray-900",
            )}
          >
            {maintenanceCount > 0 ? `${maintenanceCount} required` : "None pending"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Weekly Change</span>
          <span className={cn(META_VALUE, weeklyDeltaClass(weeklyChange))}>
            {weeklyDeltaLabel(weeklyChange)}
          </span>
        </div>
        <Link
          href={`/dashboard/properties/${property.id}/health-score`}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900"
        >
          Open health details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
