"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { HomeScoreConfidence } from "@/types";

interface HomeScoreReportCardProps {
  propertyId?: string;
}

const CARD_SHELL =
  "rounded-xl border p-4 flex flex-col gap-3";

function getTone(scoreBand?: string) {
  if (scoreBand === "EXCELLENT") return "bg-emerald-50/30 border-emerald-200/50";
  if (scoreBand === "GOOD") return "bg-teal-50/30 border-teal-200/50";
  if (scoreBand === "FAIR") return "bg-amber-50/30 border-amber-200/50";
  return "bg-red-50/30 border-red-200/50";
}

function getLabel(scoreBand?: string) {
  if (scoreBand === "EXCELLENT") return "Excellent";
  if (scoreBand === "GOOD") return "Good";
  if (scoreBand === "FAIR") return "Fair";
  return "Needs Attention";
}

function getScoreColor(scoreBand?: string) {
  if (scoreBand === "EXCELLENT") return "text-emerald-600";
  if (scoreBand === "GOOD") return "text-teal-600";
  if (scoreBand === "FAIR") return "text-amber-500";
  return "text-red-500";
}

function getConfidenceWidth(confidence: HomeScoreConfidence) {
  if (confidence === "HIGH") return "w-full";
  if (confidence === "MEDIUM") return "w-2/3";
  return "w-1/3";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export function HomeScoreReportCard({ propertyId }: HomeScoreReportCardProps) {
  const reportLink = propertyId
    ? `/dashboard/properties/${propertyId}/home-score`
    : "/dashboard/properties";

  const reportQuery = useQuery({
    queryKey: ["home-score-report", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getHomeScoreReport(propertyId, 26);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  if (!propertyId) {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              HomeScore
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view scores.</div>
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className={`${CARD_SHELL} bg-white border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
              HomeScore
            </span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading score...
        </div>
      </div>
    );
  }

  const report = reportQuery.data;
  const score = Math.round(report?.homeScore ?? 0);
  const scoreBand = report?.scoreBand;
  const scoreLabel = getLabel(scoreBand);
  const scoreColor = getScoreColor(scoreBand);
  const weeklyChange = formatWeeklyDelta(report?.deltaFromPreviousWeek ?? null);
  const confidence = report?.confidence ?? "LOW";
  const reasonsCount = report?.topReasonsScoreNotHigher?.length ?? 0;
  const elevatedAssetsLabel =
    reasonsCount > 0 ? `${reasonsCount} driving risk` : "None flagged";

  return (
    <div className={`${CARD_SHELL} ${getTone(scoreBand)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
            HomeScore
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="whitespace-nowrap text-xs text-gray-400">{weeklyChange}</span>
          <Link href={reportLink} className="inline-flex">
            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-end gap-1">
          <span className={`text-4xl font-display font-bold ${scoreColor}`}>{score}</span>
          <span className="mb-1 text-sm text-gray-400">/100</span>
        </div>
        <span className="text-sm text-gray-500">{scoreLabel}</span>
        <div className="mt-1">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-gray-400 uppercase tracking-wider">Confidence</span>
            <span className="font-semibold text-gray-600">{confidence}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full bg-amber-400 ${getConfidenceWidth(confidence)}`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-amber-200/50 pt-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Elevated assets
        </span>
        <span className="text-xs font-bold text-amber-600">{elevatedAssetsLabel}</span>
      </div>
    </div>
  );
}
