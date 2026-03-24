"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { HomeScoreConfidence } from "@/types";

interface HomeScoreReportCardProps {
  propertyId?: string;
}

const CARD_BASE = "h-full rounded-xl border p-4 flex flex-col gap-3";

function getTone(scoreBand?: string) {
  if (scoreBand === "EXCELLENT") return "bg-emerald-50/30 border-emerald-200/60";
  if (scoreBand === "GOOD") return "bg-teal-50/30 border-teal-200/60";
  if (scoreBand === "FAIR") return "bg-amber-50/30 border-amber-200/60";
  return "bg-rose-50/25 border-rose-200/55";
}

function getAccent(scoreBand?: string): string {
  if (scoreBand === "NEEDS ATTENTION") return "border-l-4 border-l-rose-300";
  if (scoreBand === "FAIR") return "border-l-4 border-l-amber-400";
  return "";
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

function buildHomeScoreInsight(reasonsCount: number, scoreBand?: string): string {
  if (scoreBand === "EXCELLENT") return "Overall home fundamentals look stable this week.";
  if (scoreBand === "GOOD") return "The home is in a solid range with a few optimization opportunities.";
  if (scoreBand === "FAIR") return "A few systems are pulling this score down and are worth reviewing soon.";
  if (reasonsCount <= 1) return "One key pressure point is currently weighing on overall home readiness.";
  return `${reasonsCount} pressure points are lowering overall home readiness.`;
}

function buildHomeScoreMeaning(scoreBand?: string): string {
  if (scoreBand === "EXCELLENT") return "How this reads: your home profile is broadly resilient right now.";
  if (scoreBand === "GOOD") return "How this reads: core systems are healthy with moderate watch items.";
  if (scoreBand === "FAIR") return "How this reads: quality is mixed and may need near-term upkeep.";
  return "How this reads: unresolved issues are creating meaningful drag on readiness.";
}

function buildHomeScorePriority(reasonsCount: number, scoreBand?: string) {
  if (scoreBand === "NEEDS ATTENTION" || reasonsCount >= 2) {
    return {
      label: "Needs Focus",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (scoreBand === "FAIR") {
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
      <div className={`${CARD_BASE} bg-white border-gray-200`}>
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
      <div className={`${CARD_BASE} bg-white border-gray-200`}>
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
  const insight = buildHomeScoreInsight(reasonsCount, scoreBand);
  const meaning = buildHomeScoreMeaning(scoreBand);
  const priority = buildHomeScorePriority(reasonsCount, scoreBand);

  return (
    <div className={`${CARD_BASE} ${getTone(scoreBand)} ${getAccent(scoreBand)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">
            HomeScore
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

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-1">
          <span className={`text-4xl font-display font-bold ${scoreColor}`}>{score}</span>
          <span className="mb-1 text-sm text-gray-400">/100</span>
        </div>
        <span className={`text-sm font-semibold ${scoreColor}`}>{scoreLabel}</span>
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

      {/* Contextual insight line */}
      <p className="text-[11px] leading-snug text-gray-600">{insight}</p>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-amber-200/50 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Elevated assets
          </span>
          <span
            className={`text-xs font-bold ${
              reasonsCount > 0 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {reasonsCount > 0 ? `${reasonsCount} driving risk` : "None flagged"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Weekly Change
          </span>
          <span className="text-xs font-medium text-gray-400">
            {weeklyChange === "No change" ? "— No change" : weeklyChange}
          </span>
        </div>
        <Link
          href={reportLink}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          Open HomeScore details
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
