"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { HomeScoreConfidence } from "@/types";

interface HomeScoreReportCardProps {
  propertyId?: string;
}

const CARD_BASE =
  "flex h-full flex-col gap-3.5 rounded-2xl border border-gray-200/85 bg-white p-4 shadow-sm sm:p-5";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-gray-400";
const TITLE_CLASS = "truncate whitespace-nowrap text-sm font-semibold text-gray-900";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500";
const META_VALUE = "text-sm font-semibold text-gray-900";

const BADGE_BASE = "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium";

type NormalizedScoreBand = "EXCELLENT" | "GOOD" | "FAIR" | "NEEDS_ATTENTION";

function normalizeScoreBand(scoreBand?: string | null): NormalizedScoreBand {
  const normalized = String(scoreBand ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (normalized === "EXCELLENT") return "EXCELLENT";
  if (normalized === "GOOD") return "GOOD";
  if (normalized === "FAIR") return "FAIR";
  return "NEEDS_ATTENTION";
}

function getLabel(scoreBand: NormalizedScoreBand) {
  if (scoreBand === "EXCELLENT") return "Excellent";
  if (scoreBand === "GOOD") return "Good";
  if (scoreBand === "FAIR") return "Fair";
  return "Needs Attention";
}

function getScoreColor(scoreBand: NormalizedScoreBand) {
  if (scoreBand === "EXCELLENT") return "text-emerald-600";
  if (scoreBand === "GOOD") return "text-teal-600";
  if (scoreBand === "FAIR") return "text-amber-600";
  return "text-rose-600";
}

function getConfidenceWidth(confidence: HomeScoreConfidence) {
  if (confidence === "HIGH") return "w-full";
  if (confidence === "MEDIUM") return "w-2/3";
  return "w-1/3";
}

function getConfidenceFillColor(confidence: HomeScoreConfidence) {
  if (confidence === "HIGH") return "bg-emerald-500";
  if (confidence === "MEDIUM") return "bg-amber-500";
  return "bg-slate-400";
}

function buildHomeScoreInsight(reasonsCount: number, scoreBand: NormalizedScoreBand): string {
  if (scoreBand === "EXCELLENT") return "No major pressure points are reducing readiness.";
  if (scoreBand === "GOOD") return "A small set of items is limiting score upside.";
  if (scoreBand === "FAIR") return "A few assets are pulling overall quality down.";
  if (reasonsCount <= 1) return "One issue is currently weighing on readiness.";
  return `${reasonsCount} issues are currently weighing on readiness.`;
}

function toReasonLine(reason: unknown): string {
  if (reason === null || reason === undefined) return "";

  if (typeof reason === "object") {
    const reasonObj = reason as { title?: unknown; detail?: unknown };
    const title = String(reasonObj.title ?? "").trim();
    const detail = String(reasonObj.detail ?? "").trim();
    const combined = [title, detail].filter(Boolean).join(": ");
    if (!combined) return "";
    const normalized = combined.replace(/\s+/g, " ");
    if (normalized.length <= 96) return normalized;
    return `${normalized.slice(0, 95).trimEnd()}…`;
  }

  const normalized = String(reason).trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= 80) return normalized;
  return `${normalized.slice(0, 79).trimEnd()}…`;
}

function buildHomeScoreMeaning(scoreBand: NormalizedScoreBand): string {
  if (scoreBand === "EXCELLENT") return "Home fundamentals look resilient this week.";
  if (scoreBand === "GOOD") return "Core systems are healthy with a few watch items.";
  if (scoreBand === "FAIR") return "Quality is mixed and may need near-term upkeep.";
  return "Unresolved items are creating meaningful drag.";
}

function buildHomeScorePriority(reasonsCount: number, scoreBand: NormalizedScoreBand) {
  if (scoreBand === "NEEDS_ATTENTION" || reasonsCount >= 2) {
    return {
      label: "Needs Focus",
      className: "border-rose-200/80 bg-rose-50/70 text-rose-700",
    };
  }
  if (scoreBand === "FAIR") {
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
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">Select a property to view scores.</div>
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
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

  if (reportQuery.isError) {
    return (
      <div className={cn(CARD_BASE, "border-gray-200")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
        <div className="text-sm text-gray-500">
          HomeScore is temporarily unavailable. You can still open full details.
        </div>
        <Link
          href={reportLink}
          className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 transition-colors hover:text-gray-900"
        >
          Open HomeScore details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
    );
  }

  const report = reportQuery.data;
  const score = Math.round(report?.homeScore ?? 0);
  const scoreBand = normalizeScoreBand(report?.scoreBand ?? null);
  const scoreLabel = getLabel(scoreBand);
  const scoreColor = getScoreColor(scoreBand);
  const weeklyChange = formatWeeklyDelta(report?.deltaFromPreviousWeek ?? null);
  const confidence = report?.confidence ?? "LOW";
  const reasonsCount = report?.topReasonsScoreNotHigher?.length ?? 0;
  const reasonPreview = (report?.topReasonsScoreNotHigher ?? [])
    .map((reason) => toReasonLine(reason))
    .filter(Boolean)
    .slice(0, 2);
  const insight = buildHomeScoreInsight(reasonsCount, scoreBand);
  const meaning = buildHomeScoreMeaning(scoreBand);
  const priority = buildHomeScorePriority(reasonsCount, scoreBand);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">{meaning}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className={cn(BADGE_BASE, priority.className)}>{priority.label}</span>
          <span className={cn("text-[11px] font-medium", weeklyDeltaClass(weeklyChange))}>
            {weeklyDeltaLabel(weeklyChange)}
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-1.5">
          <span className={cn("text-4xl font-display font-semibold tracking-tight", scoreColor)}>
            {score}
          </span>
          <span className="mb-1 text-sm font-medium text-gray-400">/100</span>
        </div>
        <span className={cn("text-sm font-semibold", scoreColor)}>{scoreLabel}</span>
      </div>

      <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={SUPPORT_LABEL}>Confidence</span>
          <span className="text-[11px] font-semibold text-gray-700">{confidence}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200/70">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              getConfidenceWidth(confidence),
              getConfidenceFillColor(confidence),
            )}
          />
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-600">{insight}</p>

      {reasonPreview.length > 0 ? (
        <details>
          <summary className="cursor-pointer select-none list-none text-[10px] font-medium text-gray-500 transition-colors hover:text-gray-700 [&::-webkit-details-marker]:hidden">
            Top drivers
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-gray-200 pl-2.5">
            {reasonPreview.map((reason) => (
              <li key={reason} className="text-[10px] leading-relaxed text-gray-600">
                {reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-auto space-y-2.5 border-t border-gray-200/80 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={SUPPORT_LABEL}>Elevated Assets</span>
          <span className={cn(META_VALUE, reasonsCount > 0 ? "text-amber-700" : "text-gray-900")}>
            {reasonsCount > 0 ? `${reasonsCount} driving risk` : "None flagged"}
          </span>
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
          Open HomeScore details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
