"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { BadgeStatus, StatusBadge } from "@/components/ui/StatusBadge";

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
  "score-card score-card-status-tinted score-card-status-teal score-card-status-animate flex h-full flex-col gap-3 rounded-xl p-4 shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const META_VALUE = "text-[13px] font-medium text-foreground";
const DESCRIPTION_CLASS =
  "text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.4rem] mb-3";

function getHealthLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-emerald-600" };
  if (score >= 60) return { label: "Good", color: "text-teal-600" };
  if (score >= 40) return { label: "Fair", color: "text-amber-600" };
  return { label: "Poor", color: "text-red-600" };
}

function getHealthPriority(score: number, maintenanceCount: number): { status: BadgeStatus; customLabel?: string } {
  if (maintenanceCount >= 2 || score < 60) {
    return { status: "action", customLabel: "Needs focus" };
  }
  if (maintenanceCount === 1) {
    return { status: "watch" };
  }
  if (score >= 80) {
    return { status: "excellent" };
  }
  return { status: "good" };
}

function buildHealthMeaning(score: number): string {
  if (score >= 80) return "Major systems are operating in a healthy range.";
  if (score >= 60) return "Core systems are mostly healthy, with a few watch items.";
  return "Deferred upkeep may be increasing strain across key systems.";
}

function formatWeeklyDelta(delta: number | null) {
  if (delta === null || Math.abs(delta) < 0.05) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
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
      <div className={cn(CARD_BASE, "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Activity className={HEADER_ICON} />
            <span className={TITLE_CLASS}>Health</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">Select a property to view health score.</div>
      </div>
    );
  }

  const healthScore = Math.max(0, Math.round(property.healthScore?.totalScore || 0));
  const healthDetails = getHealthLabel(healthScore);
  const maintenanceCount =
    property.healthScore?.insights.filter((insight) => HIGH_PRIORITY_STATUSES.includes(insight.status)).length || 0;
  const weeklyChange = formatWeeklyDelta(snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null);
  const description = buildHealthMeaning(healthScore);
  const badge = getHealthPriority(healthScore, maintenanceCount);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className={HEADER_ICON} />
          <span className={TITLE_CLASS}>Health</span>
        </div>
        <StatusBadge status={badge.status} customLabel={badge.customLabel} />
      </div>

      <div className="flex justify-center">
        <ScoreRing
          value={healthScore}
          maxValue={100}
          size={88}
          strokeWidth={6}
          ringPadding={5}
          colorScheme="teal"
          label={String(healthScore)}
          labelFontSize={22}
          labelFontWeight={600}
          ariaLabel={`Health: ${healthScore} out of 100, ${healthDetails.label}`}
        />
      </div>

      <div className={cn("text-center text-[20px] font-bold leading-none", healthDetails.color)}>
        {healthDetails.label}
      </div>
      <p className="text-center text-[11px] text-muted-foreground whitespace-nowrap">Systems mostly healthy</p>

      <div className="h-px bg-border/80" />

      <p className={DESCRIPTION_CLASS}>{description}</p>

      <div className="conf-spacer h-5 mb-3" aria-hidden="true" />

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <div>
          <span className={SUPPORT_LABEL}>Maintenance</span>
          <div className={cn(META_VALUE, maintenanceCount > 0 ? "text-amber-600" : "text-foreground")}>
            {maintenanceCount > 0 ? `${maintenanceCount} required` : "None pending"}
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
        href={`/dashboard/properties/${property.id}/health-score`}
        className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        Open health details
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
