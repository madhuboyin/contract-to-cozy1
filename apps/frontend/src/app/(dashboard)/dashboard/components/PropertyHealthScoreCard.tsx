"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { ScoredProperty } from "@/app/(dashboard)/dashboard/types";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { BadgeStatus, StatusBadge } from "@/components/ui/StatusBadge";
import { buildPropertyAwareDashboardHref } from "@/lib/routes/dashboardPropertyAwareHref";

interface PropertyHealthScoreCardProps {
  property?: ScoredProperty;
}

const HIGH_PRIORITY_STATUSES = [
  "Needs attention",
  "Needs Review",
  "Needs Inspection",
  "Missing Data",
];

const CARD_BASE =
  "score-card score-card-status-tinted score-card-status-teal score-card-status-animate flex h-full flex-col gap-[0.6rem] rounded-xl px-[0.9rem] py-[0.85rem] shadow-sm";
const HEADER_ICON = "h-4 w-4 flex-shrink-0 text-muted-foreground";
const TITLE_CLASS = "truncate whitespace-nowrap text-xs font-medium text-muted-foreground";
const SUPPORT_LABEL = "mb-[2px] block text-[9px] font-medium tracking-normal text-muted-foreground";
const META_VALUE = "text-[12px] font-medium text-foreground";
const DESCRIPTION_CLASS =
  "text-[11.5px] text-muted-foreground leading-[1.55] line-clamp-2 min-h-[2.3rem]";

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
            <span className={TITLE_CLASS}>Property Health</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">Select a property to view health score.</div>
      </div>
    );
  }

  const healthScore = Math.max(0, Math.round(property.healthScore?.totalScore || 0));
  const healthDetails = getHealthLabel(healthScore);
  const allInsights = property.healthScore?.insights ?? [];
  const maintenanceCount =
    allInsights.filter((insight) => HIGH_PRIORITY_STATUSES.includes(insight.status)).length;
  const trackedInsights = allInsights.filter((insight) => insight.status !== "Missing Data");
  const healthyCount = trackedInsights.filter((insight) => !HIGH_PRIORITY_STATUSES.includes(insight.status)).length;
  const trackedCount = trackedInsights.length;
  const weeklyChange = formatWeeklyDelta(snapshotQuery.data?.scores?.HEALTH?.deltaFromPreviousWeek ?? null);
  const description = buildHealthMeaning(healthScore);
  const badge = getHealthPriority(healthScore, maintenanceCount);

  return (
    <div className={CARD_BASE}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className={HEADER_ICON} />
          <span className={TITLE_CLASS}>Property Health</span>
        </div>
        <StatusBadge status={badge.status} customLabel={badge.customLabel} />
      </div>

      <div className="flex items-center gap-3">
        <ScoreRing
          value={healthScore}
          maxValue={100}
          size={64}
          strokeWidth={5}
          ringPadding={3.5}
          colorScheme="teal"
          label={String(healthScore)}
          labelFontSize={14}
          labelFontWeight={600}
          labelY={37}
          ariaLabel={`Property Health Score: ${healthScore} out of 100, ${healthDetails.label}`}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div className={cn("text-[20px] font-bold leading-none", healthDetails.color)}>
            {healthDetails.label}
          </div>
          <p className="mt-[3px] whitespace-nowrap text-[11px] text-muted-foreground">
            {trackedCount > 0 ? `${healthyCount} of ${trackedCount} systems healthy` : "Major systems tracked"}
          </p>
        </div>
      </div>

      <div className="h-[0.5px] bg-border/80" />

      <p className={DESCRIPTION_CLASS}>{description}</p>

      <div className="h-[15px]" aria-hidden="true" />

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
        <div>
          <span className={SUPPORT_LABEL}>Required maintenance</span>
          <div className={cn(META_VALUE, maintenanceCount > 0 ? "text-amber-600" : "text-foreground")}>
            {maintenanceCount > 0 ? `${maintenanceCount} required` : "None"}
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
        href={
          maintenanceCount > 0
            ? `/dashboard/properties/${property.id}/fix?filter=maintenance&priority=high`
            : weeklyChange !== "No change"
            ? buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score?view=trends')
            : buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score')
        }
        className="group mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
      >
        {maintenanceCount > 0
          ? 'Address maintenance needs'
          : weeklyChange !== "No change"
          ? 'See how your score changed'
          : 'View system breakdown'
        }
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
