"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import { api } from "@/lib/api/client";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";

interface PropertyHealthScoreCardProps {
  property?: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = [
  "Needs Attention",
  "Needs Review",
  "Needs Inspection",
  "Missing Data",
];

const CARD_BASE = "h-full rounded-xl border p-4 flex flex-col gap-3";

function getHealthTone(score: number) {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/60";
  if (score >= 60) return "bg-teal-50/30 border-teal-200/60";
  return "bg-amber-50/30 border-amber-200/60";
}

function getHealthAccent(score: number, maintenanceCount: number): string {
  if (maintenanceCount > 0 || score < 60) return "border-l-4 border-l-amber-400";
  return "";
}

function getHealthPathColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#14b8a6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getHealthLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-500" };
  return { label: "Poor", color: "text-red-500" };
}

function getHealthPriority(score: number, maintenanceCount: number) {
  if (maintenanceCount >= 2 || score < 60) {
    return {
      label: "Needs Focus",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (maintenanceCount === 1) {
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

function buildHealthMeaning(score: number): string {
  if (score >= 80) return "How this reads: major systems appear to be in healthy operating shape.";
  if (score >= 60) return "How this reads: core systems are mostly healthy with a few maintenance watch points.";
  return "How this reads: deferred upkeep may be building risk across key systems.";
}

function buildHealthInsight(score: number, maintenanceCount: number): string {
  if (maintenanceCount > 1)
    return `${maintenanceCount} maintenance items pending — address to improve score`;
  if (maintenanceCount === 1)
    return "1 maintenance item pending — address to improve score";
  if (score >= 80) return "Most systems are in good condition";
  if (score >= 60) return "A few areas worth monitoring this season";
  return "Multiple systems need attention";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
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
      <div className={`${CARD_BASE} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Health
            </span>
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
    <div
      className={`${CARD_BASE} ${getHealthTone(healthScore)} ${getHealthAccent(healthScore, maintenanceCount)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              Health
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
            value={healthScore}
            text={`${healthScore}`}
            strokeWidth={8}
            styles={buildStyles({
              textSize: "28px",
              textColor: "#111827",
              pathColor: getHealthPathColor(healthScore),
              trailColor: "#e5e7eb",
              pathTransitionDuration: 0.6,
            })}
          />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            HEALTH
          </p>
          <p className={`text-sm font-bold ${healthDetails.color}`}>{healthDetails.label}</p>
        </div>
      </div>

      {/* Contextual insight line */}
      <p className="text-[11px] leading-snug text-gray-600">{insight}</p>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-teal-200/50 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Maintenance
          </span>
          <span
            className={`text-xs font-bold ${
              maintenanceCount > 0 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {maintenanceCount > 0 ? `${maintenanceCount} Required` : "None pending"}
          </span>
        </div>
        <Link
          href={`/dashboard/properties/${property.id}/health-score`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          Open health details
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
