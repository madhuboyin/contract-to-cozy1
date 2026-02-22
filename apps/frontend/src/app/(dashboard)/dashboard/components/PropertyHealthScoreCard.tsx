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

const CARD_SHELL = "rounded-xl border p-4 flex flex-col gap-3";

function getHealthTone(score: number) {
  if (score >= 80) return "bg-emerald-50/30 border-emerald-200/50";
  if (score >= 60) return "bg-teal-50/30 border-teal-200/50";
  return "bg-amber-50/30 border-amber-200/50";
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

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export function PropertyHealthScoreCard({ property }: PropertyHealthScoreCardProps) {
  if (!property) {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
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

  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot", property.id, "HEALTH"],
    queryFn: async () => api.getPropertyScoreSnapshots(property.id, 16),
    enabled: !!property.id,
    staleTime: 10 * 60 * 1000,
  });
  const weeklyChange = formatWeeklyDelta(
    snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null
  );

  return (
    <div className={`${CARD_SHELL} ${getHealthTone(healthScore)}`}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
            Health
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="whitespace-nowrap text-xs text-gray-400">{weeklyChange}</span>
          <Link href={`/dashboard/properties/${property.id}/health-score`} className="inline-flex">
            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
          </Link>
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

      <div className="flex items-center justify-between border-t border-teal-200/50 pt-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Maintenance
        </span>
        <span className="text-xs font-bold text-amber-600">
          {maintenanceCount} Required
        </span>
      </div>
    </div>
  );
}
