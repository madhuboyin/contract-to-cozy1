"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { HomeScoreConfidence } from "@/types";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { BadgeStatus, StatusBadge } from "@/components/ui/StatusBadge";

interface HomeScoreReportCardProps {
  propertyId?: string;
}

const CARD_BASE =
  "score-card score-card-status-tinted score-card-status-amber score-card-status-animate flex flex-col gap-3 rounded-xl p-4 shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const META_VALUE = "text-[13px] font-medium text-foreground";

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
  return "text-red-600";
}

function getConfidencePct(confidence: HomeScoreConfidence) {
  if (confidence === "HIGH") return 100;
  if (confidence === "MEDIUM") return 66;
  return 33;
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

function buildHomeScorePriority(
  reasonsCount: number,
  scoreBand: NormalizedScoreBand,
): { status: BadgeStatus; customLabel?: string } {
  if (scoreBand === "EXCELLENT") {
    return { status: "excellent" };
  }
  if (scoreBand === "GOOD") {
    return { status: "good" };
  }
  if (scoreBand === "FAIR") {
    return { status: "watch" };
  }
  if (scoreBand === "NEEDS_ATTENTION" || reasonsCount >= 2) {
    return { status: "action", customLabel: "Needs focus" };
  }
  return { status: "action" };
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
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
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">Select a property to view scores.</div>
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading score...
        </div>
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>HomeScore</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">
          HomeScore is temporarily unavailable. You can still open full details.
        </div>
        <Link
          href={reportLink}
          className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
        >
          Open HomeScore details
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
    );
  }

  const report = reportQuery.data;
  const score = Math.max(0, Math.round(report?.homeScore ?? 0));
  const scoreBand = normalizeScoreBand(report?.scoreBand ?? null);
  const scoreLabel = getLabel(scoreBand);
  const scoreColor = getScoreColor(scoreBand);
  const weeklyChange = formatWeeklyDelta(report?.deltaFromPreviousWeek ?? null);
  const confidence = report?.confidence ?? "LOW";
  const confidencePct = getConfidencePct(confidence);
  const reasonsCount = report?.topReasonsScoreNotHigher?.length ?? 0;
  const reasonPreview = (report?.topReasonsScoreNotHigher ?? [])
    .map((reason) => toReasonLine(reason))
    .filter(Boolean)
    .slice(0, 2);
  const insight = buildHomeScoreInsight(reasonsCount, scoreBand);
  const meaning = buildHomeScoreMeaning(scoreBand);
  const badge = buildHomeScorePriority(reasonsCount, scoreBand);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className={HEADER_ICON} />
          <span className={TITLE_CLASS}>HomeScore</span>
        </div>
        <StatusBadge status={badge.status} customLabel={badge.customLabel} />
      </div>

      <div className="flex items-center gap-3">
        <ScoreRing
          value={score}
          maxValue={100}
          size={72}
          strokeWidth={5}
          colorScheme="amber"
          label={String(score)}
          labelFontWeight={500}
          ariaLabel={`HomeScore: ${score} out of 100, ${scoreLabel}`}
        />
        <div className="min-w-0">
          <div className={cn("text-[22px] font-semibold leading-none", scoreColor)}>{scoreLabel}</div>
          <div className="mt-1 text-sm leading-snug text-muted-foreground">
            {meaning}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</div>
        <div className="h-1 overflow-hidden rounded bg-border">
          <div
            className={cn("h-full rounded transition-all duration-700", getConfidenceFillColor(confidence))}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{insight}</p>

      {reasonPreview.length > 0 ? (
        <details>
          <summary className="cursor-pointer select-none list-none text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            Top drivers
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-border pl-2.5">
            {reasonPreview.map((reason) => (
              <li key={reason} className="text-[10px] leading-relaxed text-muted-foreground">
                {reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          <span className={SUPPORT_LABEL}>Elevated assets</span>
          <div className={cn(META_VALUE, reasonsCount > 0 ? "text-amber-600" : "text-foreground")}>
            {reasonsCount > 0 ? `${reasonsCount} driving risk` : "None flagged"}
          </div>
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
        className="group inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        Open home score details
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
