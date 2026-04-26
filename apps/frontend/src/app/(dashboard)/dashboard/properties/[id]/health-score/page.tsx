"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, ArrowLeft, ChevronDown, Clock3, FileText, Flame, Gauge, Home, Loader2, ShieldCheck, Wind, Wrench } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScoreDeltaIndicator, ScoreTrendChart } from "@/components/scores/ScoreTrendChart";
import { PropertyScoreSeries, PropertyScoreTrendPoint } from "@/types";
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from "@/components/mobile/dashboard/MobilePrimitives";

import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';
const REQUIRED_ACTION_STATUSES = ["Needs attention", "Needs Review", "Needs Inspection", "Missing Data", "Needs Warranty"];
const IN_PROGRESS_STATUSES = ["Action Pending"];
const WATCH_STATUSES = ["Aging", "Incomplete", "Partial", "Average", "Standard"];
const POSITIVE_STATUSES = ["Excellent", "Good", "Modern", "Optimal", "Complete", "Low Density"];
const INSIGHT_IMPACT_ORDER = { negative: 0, neutral: 1, positive: 2 } as const;

type HealthInsight = {
  factor?: string;
  status?: string;
  score?: number;
  details?: string[];
};

type InsightImpact = "positive" | "negative" | "neutral";

type PropertyHealthScoreSnapshot = {
  totalScore?: unknown;
  baseScore?: unknown;
  unlockedScore?: unknown;
  maxPotentialScore?: unknown;
  maxBaseScore?: unknown;
  maxExtraScore?: unknown;
  insights?: unknown[];
};

type PropertyWithHealth = {
  name?: string | null;
  healthScore?: PropertyHealthScoreSnapshot;
} | null;

const getHealthDetails = (score: number) => {
  if (score >= 85) return { level: "Excellent", color: "text-green-600", progressColor: "bg-green-500" };
  if (score >= 70) return { level: "Good", color: "text-blue-600", progressColor: "bg-blue-500" };
  if (score >= 50) return { level: "Fair", color: "text-yellow-600", progressColor: "bg-yellow-500" };
  return { level: "Needs attention", color: "text-red-600", progressColor: "bg-red-500" };
};

function healthTone(level: string): "good" | "info" | "elevated" | "danger" {
  if (level === "Excellent") return "good";
  if (level === "Good") return "info";
  if (level === "Fair") return "elevated";
  return "danger";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeInsight(item: unknown): HealthInsight | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const factor = typeof raw.factor === "string" ? raw.factor : "Health insight";
  const status = typeof raw.status === "string" ? raw.status : "Status unavailable";
  const score = asNumber(raw.score) ?? 0;
  const rawDetails = Array.isArray(raw.details) ? raw.details : [];
  const details = rawDetails
    .map((detail) => (typeof detail === "string" ? detail.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
  return {
    factor,
    status,
    score,
    details: details.length ? details : undefined,
  };
}

function getSnapshotInsights(point: PropertyScoreTrendPoint | null | undefined): HealthInsight[] {
  const raw = point?.snapshot?.insights;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeInsight).filter((item): item is HealthInsight => item !== null);
}

function getPropertyInsights(property: PropertyWithHealth): HealthInsight[] {
  const raw = property?.healthScore?.insights;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeInsight).filter((item): item is HealthInsight => item !== null);
}

function getRequiredActions(point: PropertyScoreTrendPoint | null | undefined): number | null {
  const raw = point?.snapshot?.requiredActions;
  return asNumber(raw);
}

function getInsightImpact(statusValue: string | undefined): InsightImpact {
  const status = String(statusValue || "");
  if (REQUIRED_ACTION_STATUSES.includes(status)) return "negative";
  if (IN_PROGRESS_STATUSES.includes(status) || WATCH_STATUSES.includes(status)) return "neutral";
  if (POSITIVE_STATUSES.includes(status)) return "positive";
  return "neutral";
}

function getInsightTone(statusValue: string | undefined): "good" | "info" | "elevated" | "danger" {
  const status = String(statusValue || "");
  if (REQUIRED_ACTION_STATUSES.includes(status)) return "danger";
  if (IN_PROGRESS_STATUSES.includes(status)) return "info";
  if (WATCH_STATUSES.includes(status)) return "elevated";
  if (POSITIVE_STATUSES.includes(status)) return "good";
  return "info";
}

function getInsightChipLabel(statusValue: string | undefined): string {
  const status = String(statusValue || "");
  if (REQUIRED_ACTION_STATUSES.includes(status)) return "Needs attention";
  if (IN_PROGRESS_STATUSES.includes(status)) return "Work in progress";
  if (WATCH_STATUSES.includes(status)) return "Watchlist";
  if (POSITIVE_STATUSES.includes(status)) return "Healthy signal";
  return "Review signal";
}

function getInsightDetailsSummary(insight: HealthInsight): string | null {
  if (!insight.details?.length) return null;
  const visible = insight.details.slice(0, 2);
  const remaining = insight.details.length - visible.length;
  return remaining > 0 ? `${visible.join(" • ")} • +${remaining} more` : visible.join(" • ");
}

function formatSignedPoints(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0";
  const abs = Math.abs(value).toFixed(1);
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function getInsightStatusExplanation(statusValue: string | undefined): string {
  const status = String(statusValue || "");
  if (REQUIRED_ACTION_STATUSES.includes(status)) {
    return "This factor needs action. Resolving the recommended maintenance can improve this score contribution.";
  }
  if (IN_PROGRESS_STATUSES.includes(status)) {
    return "Work is already underway on this factor. Its contribution should improve once the task is completed.";
  }
  if (WATCH_STATUSES.includes(status)) {
    return "This factor is stable but should be monitored. Keeping records and periodic checks helps protect this score.";
  }
  if (POSITIVE_STATUSES.includes(status)) {
    return "This factor is currently a health strength and is helping hold up your overall score.";
  }
  return "This factor is under review. Add more property records to unlock a more precise score explanation.";
}

function getInsightIconClasses(statusValue: string | undefined): { container: string; icon: string } {
  const impact = getInsightImpact(statusValue);
  if (impact === "negative") {
    return {
      container: "border-red-200 bg-red-50",
      icon: "text-red-600",
    };
  }
  if (impact === "positive") {
    return {
      container: "border-emerald-200 bg-emerald-50",
      icon: "text-emerald-600",
    };
  }
  return {
    container: "border-amber-200 bg-amber-50",
    icon: "text-amber-700",
  };
}

function getInsightFactorIcon(factorValue: string | undefined, statusValue: string | undefined) {
  const factor = String(factorValue || "").toLowerCase();
  const iconClasses = getInsightIconClasses(statusValue);
  let Icon = Activity;

  if (factor.includes("water heater") || factor.includes("boiler")) {
    Icon = Flame;
  } else if (factor.includes("hvac") || factor.includes("air") || factor.includes("vent")) {
    Icon = Wind;
  } else if (factor.includes("document") || factor.includes("record")) {
    Icon = FileText;
  } else if (factor.includes("age")) {
    Icon = Clock3;
  } else if (factor.includes("usage") || factor.includes("wear") || factor.includes("density")) {
    Icon = Gauge;
  } else if (factor.includes("safety") || factor.includes("warranty")) {
    Icon = ShieldCheck;
  } else if (factor.includes("system") || factor.includes("appliance")) {
    Icon = Wrench;
  } else if (factor.includes("structure") || factor.includes("roof") || factor.includes("exterior")) {
    Icon = Home;
  }

  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${iconClasses.container}`}>
      <Icon className={`h-4 w-4 ${iconClasses.icon}`} aria-hidden="true" />
    </span>
  );
}

function getFactorDescription(factorName: string | undefined, condition: string | undefined): string {
  const factor = String(factorName || "");
  const cond = String(condition || "");
  const map: Record<string, Record<string, string>> = {
    'Water Heater Age': {
      'Needs Review': 'Approaching end of typical lifespan — review recommended',
      'Needs attention': 'Past typical lifespan — replacement evaluation recommended',
      'Aging': 'Getting older — monitor for performance issues',
      'Modern': 'Recently installed — no action needed',
    },
    'Roof Age': {
      'Aging': 'Mid-life — inspect after next major storm',
      'Needs Review': 'Past typical replacement window — inspection recommended',
      'Needs attention': 'Past replacement window — inspection recommended',
      'Modern': 'Recently replaced — no action needed',
    },
    'HVAC Age': {
      'Aging': 'Aging system — schedule annual maintenance',
      'Needs Review': 'Nearing end of service life — start planning replacement',
      'Needs attention': 'Past typical service life — plan replacement',
      'Modern': 'Recently serviced — maintain current schedule',
    },
    'Usage/Wear Factor': {
      'High Density': 'High usage pattern — more frequent maintenance recommended',
      'Average': 'Normal usage — standard maintenance schedule applies',
      'Low Density': 'Light usage — lower wear risk',
    },
    'Systems Factor': {
      'Modern': 'All major systems up to date — strong positive signal',
      'Mixed': 'Some systems may need attention',
      'Aging': 'Systems showing age — review recommended',
      'Good': 'Systems in good condition',
    },
    'Structure Factor': {
      'Good': 'Structural elements in good condition',
      'Excellent': 'Structural elements in excellent condition',
      'Fair': 'Minor structural items to monitor',
      'Needs Review': 'Structural review recommended',
    },
    'Roof Condition': {
      'Good': 'Roof in good condition',
      'Aging': 'Roof showing wear — inspection recommended',
      'Needs Review': 'Roof inspection recommended',
    },
    'Safety Factor': {
      'Complete': 'Safety systems up to date',
      'Incomplete': 'Some safety items need attention',
      'Needs Review': 'Safety review recommended',
    },
    'Documents Factor': {
      'Complete': 'Property documents are up to date',
      'Incomplete': 'Some documents are missing',
      'Missing Data': 'Property documentation needed',
    },
  };
  return map[factor]?.[cond] ?? `${cond || 'Status unavailable'} — review recommended`;
}

function getInsightLeftBorderColor(statusValue: string | undefined): string {
  const impact = getInsightImpact(statusValue);
  if (impact === "negative") return "border-l-red-400";
  if (impact === "positive") return "border-l-teal-400";
  return "border-l-amber-400";
}

function sortInsightsForDisplay(insights: HealthInsight[]): HealthInsight[] {
  return [...insights].sort((a, b) => {
    const impactA = INSIGHT_IMPACT_ORDER[getInsightImpact(a.status)];
    const impactB = INSIGHT_IMPACT_ORDER[getInsightImpact(b.status)];
    if (impactA !== impactB) return impactA - impactB;
    const scoreA = asNumber(a.score) ?? 0;
    const scoreB = asNumber(b.score) ?? 0;
    if (impactA === INSIGHT_IMPACT_ORDER.positive) return scoreB - scoreA;
    return scoreA - scoreB;
  });
}

const LEDGER_GROUPS: Array<{
  key: "negative" | "neutral" | "positive";
  title: string;
  tone: "good" | "elevated" | "danger";
}> = [
  { key: "negative", title: "Needs attention", tone: "danger" as const },
  { key: "neutral", title: "Monitor closely", tone: "elevated" as const },
  { key: "positive", title: "Healthy signals", tone: "good" as const },
];

function getLedgerInsights(
  groupKey: "negative" | "neutral" | "positive",
  negativeInsights: HealthInsight[],
  neutralInsights: HealthInsight[],
  positiveInsights: HealthInsight[]
) {
  if (groupKey === "negative") return negativeInsights;
  if (groupKey === "neutral") return neutralInsights;
  return positiveInsights;
}

function buildHealthChangeItems(series: PropertyScoreSeries | undefined, latestInsights: HealthInsight[]) {
  const changes: Array<{ title: string; detail: string; impact: "positive" | "negative" | "neutral" }> = [];

  if (!series?.latest) {
    const requiredCount = latestInsights.filter((insight) => REQUIRED_ACTION_STATUSES.includes(String(insight.status || ""))).length;
    const inProgressCount = latestInsights.filter((insight) => IN_PROGRESS_STATUSES.includes(String(insight.status || ""))).length;
    const missingDataCount = latestInsights.filter((insight) => String(insight.status || "") === "Missing Data").length;

    if (requiredCount > 0) {
      changes.push({
        title: "Current required actions",
        detail: `${requiredCount} factor${requiredCount === 1 ? "" : "s"} currently need action to improve health score.`,
        impact: "negative",
      });
    }

    if (inProgressCount > 0) {
      changes.push({
        title: "Actions already in progress",
        detail: `${inProgressCount} factor${inProgressCount === 1 ? "" : "s"} already have active work underway.`,
        impact: "positive",
      });
    }

    if (missingDataCount > 0) {
      changes.push({
        title: "Missing profile data",
        detail: `${missingDataCount} factor${missingDataCount === 1 ? "" : "s"} need profile details before they can be fully scored.`,
        impact: "negative",
      });
    }

    if (changes.length === 0) {
      changes.push({
        title: "Waiting for weekly history",
        detail: "Weekly snapshots are still being collected. Current factors below show exactly how this score is derived today.",
        impact: "neutral",
      });
    }

    return changes.slice(0, 4);
  }

  const delta = series.deltaFromPreviousWeek;
  if (delta !== null) {
    changes.push({
      title: "Week-over-week score",
      detail:
        delta > 0
          ? `Health score improved by ${delta.toFixed(1)} points compared to last week.`
          : delta < 0
          ? `Health score dropped by ${Math.abs(delta).toFixed(1)} points compared to last week.`
          : "Health score was flat compared to last week.",
      impact: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
    });
  }

  const latestRequired = getRequiredActions(series.latest);
  const previousRequired = getRequiredActions(series.previous);
  if (latestRequired !== null && previousRequired !== null) {
    const deltaRequired = latestRequired - previousRequired;
    changes.push({
      title: "Required maintenance actions",
      detail:
        deltaRequired < 0
          ? `${Math.abs(deltaRequired)} high-priority actions were resolved since last snapshot.`
          : deltaRequired > 0
          ? `${deltaRequired} additional high-priority actions were detected this week.`
          : "High-priority action count stayed the same week over week.",
      impact: deltaRequired < 0 ? "positive" : deltaRequired > 0 ? "negative" : "neutral",
    });
  }

  const latestPriorityCount = getSnapshotInsights(series.latest).filter((insight) =>
    REQUIRED_ACTION_STATUSES.includes(String(insight.status || ""))
  ).length;
  const previousPriorityCount = getSnapshotInsights(series.previous).filter((insight) =>
    REQUIRED_ACTION_STATUSES.includes(String(insight.status || ""))
  ).length;
  if (series.previous) {
    const deltaPriority = latestPriorityCount - previousPriorityCount;
    changes.push({
      title: "Risky insight signals",
      detail:
        deltaPriority < 0
          ? `Flagged health insights decreased by ${Math.abs(deltaPriority)}.`
          : deltaPriority > 0
          ? `Flagged health insights increased by ${deltaPriority}.`
          : "Flagged health insights stayed unchanged.",
      impact: deltaPriority < 0 ? "positive" : deltaPriority > 0 ? "negative" : "neutral",
    });
  }

  const topNegative = latestInsights
    .filter((insight) => getInsightImpact(insight.status) === "negative")
    .sort((a, b) => (asNumber(a.score) ?? 0) - (asNumber(b.score) ?? 0))[0];

  if (topNegative) {
    changes.push({
      title: "Top current drag",
      detail: `${topNegative.factor || "Health factor"} is marked "${topNegative.status || "Review"}" and currently contributes ${(asNumber(topNegative.score) ?? 0).toFixed(1)} points.`,
      impact: "negative",
    });
  }

  if (changes.length === 0) {
    changes.push({
      title: "No material drivers captured",
      detail: "No significant weekly movement was captured in health score drivers.",
      impact: "neutral",
    });
  }

  return changes.slice(0, 4);
}

export default function PropertyHealthDetailPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const [trendWeeks, setTrendWeeks] = useState<26 | 52>(26);
  const [showScoreModal, setShowScoreModal] = useState(false);

  const { data: property, isLoading: isLoadingProperty } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      try {
        const response = await api.getProperty(propertyId);
        return response.success ? response.data : null;
      } catch {
        return null;
      }
    },
    enabled: !!propertyId,
  });

  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot-health", propertyId, trendWeeks],
    queryFn: async () => {
      try {
        return await api.getPropertyScoreSnapshots(propertyId, trendWeeks);
      } catch {
        return null;
      }
    },
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (isLoadingProperty || !propertyId) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  const series = snapshotQuery.data?.scores?.HEALTH;
  const propertyHealth = (property as PropertyWithHealth)?.healthScore;
  const latestScore = clampScore(series?.latest?.score ?? asNumber(propertyHealth?.totalScore) ?? 0);
  const scoreMax = 100;
  const percentage = latestScore;
  const potentialScore = clampScore(asNumber(propertyHealth?.maxPotentialScore) ?? series?.latest?.scoreMax ?? 100);
  const baseScore = asNumber(propertyHealth?.baseScore);
  const unlockedScore = asNumber(propertyHealth?.unlockedScore);
  const maxBaseScore = asNumber(propertyHealth?.maxBaseScore) ?? 55;
  const maxExtraScore = asNumber(propertyHealth?.maxExtraScore) ?? 45;
  const snapshotInsights = getSnapshotInsights(series?.latest);
  const propertyInsights = getPropertyInsights(property as PropertyWithHealth);
  const latestInsights = snapshotInsights.length > 0 ? snapshotInsights : propertyInsights;
  const usingSnapshotInsights = snapshotInsights.length > 0;
  const sortedInsights = sortInsightsForDisplay(latestInsights);
  const focusInsights = sortedInsights.slice(0, 5);
  const negativeInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "negative");
  const neutralInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "neutral");
  const positiveInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "positive");
  const topNegativeInsight = negativeInsights[0];
  const topPositiveInsight = positiveInsights[0];
  const healthDetails = getHealthDetails(latestScore);
  const scoreRingColor = { Excellent: "#16a34a", Good: "#2563eb", Fair: "#d97706", "Needs attention": "#dc2626" }[healthDetails.level] ?? "#d97706";
  const scoreStatusDot = { Excellent: "bg-green-500", Good: "bg-blue-500", Fair: "bg-amber-500", "Needs attention": "bg-red-500" }[healthDetails.level] ?? "bg-amber-500";
  const changes = buildHealthChangeItems(series, sortedInsights);

  const previousInsights = getSnapshotInsights(series?.previous);
  const hasPreviousSnapshot = !!series?.previous;
  const previousNegativeCount = previousInsights.filter((i) => getInsightImpact(i.status) === "negative").length;
  const previousNeutralCount = previousInsights.filter((i) => getInsightImpact(i.status) === "neutral").length;
  const previousPositiveCount = previousInsights.filter((i) => getInsightImpact(i.status) === "positive").length;
  const negDelta = hasPreviousSnapshot ? negativeInsights.length - previousNegativeCount : null;
  const neutralDelta = hasPreviousSnapshot ? neutralInsights.length - previousNeutralCount : null;
  const positiveDelta = hasPreviousSnapshot ? positiveInsights.length - previousPositiveCount : null;

  const renderFocusInsightAccordionRow = (insight: HealthInsight, idx: number, useStatusChip: boolean) => {
    const scoreValue = asNumber(insight.score) ?? 0;
    const detailLines = insight.details?.length ? insight.details.slice(0, 6) : [];
    const statusBadge = useStatusChip ? (
      <StatusChip tone={getInsightTone(insight.status)}>{getInsightChipLabel(insight.status)}</StatusChip>
    ) : (
      <Badge
        variant={
          getInsightImpact(insight.status) === "negative"
            ? "destructive"
            : getInsightImpact(insight.status) === "positive"
            ? "success"
            : "secondary"
        }
      >
        {getInsightChipLabel(insight.status)}
      </Badge>
    );

    return (
      <details key={`${insight.factor || "insight"}-${idx}`} className={`rounded-lg border border-black/10 bg-white border-l-[3px] ${getInsightLeftBorderColor(insight.status)}`}>
        <summary className="list-none cursor-pointer px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {getInsightFactorIcon(insight.factor, insight.status)}
              <div>
                <p className="text-sm font-medium">{insight.factor || "Health insight"}</p>
                <p className="text-xs text-muted-foreground">{getFactorDescription(insight.factor, insight.status)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statusBadge}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </summary>
        <div className="border-t border-black/10 px-3 py-2 space-y-2 text-xs text-muted-foreground">
          <p>
            This factor currently contributes{" "}
            <span className="font-semibold text-foreground">{formatSignedPoints(scoreValue)} points</span> to your overall Health score (0-100).
          </p>
          <p>{getInsightStatusExplanation(insight.status)}</p>
          {detailLines.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">How this was scored</p>
              <ul className="list-disc pl-4 space-y-1">
                {detailLines.map((detail, detailIdx) => (
                  <li key={`${insight.factor || "insight"}-detail-${detailIdx}`}>{detail}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No additional scoring evidence is available yet. Add profile details and service records to improve transparency.</p>
          )}
        </div>
      </details>
    );
  };

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="md:hidden">
        <MobileToolWorkspace
          intro={
            <div className="space-y-2">
              <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <MobilePageIntro
                eyebrow="Property Score"
                title="Property Health Report"
                subtitle={`Weekly health summary for ${property?.name || "this property"} — what changed, what needs attention, and what's working.`}
                action={
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
                    <Activity className="h-5 w-5" />
                  </div>
                }
              />
            </div>
          }
          summary={
            <ResultHeroCard
              title="Health score"
              value={`${latestScore.toFixed(0)}/${scoreMax}`}
              status={<StatusChip tone={healthTone(healthDetails.level)}>{healthDetails.level}</StatusChip>}
              summary={`${latestScore.toFixed(0)} / ${scoreMax} · ${healthDetails.level}`}
            />
          }
          footer={<BottomSafeAreaReserve size="chatAware" />}
        >
          <ReadOnlySummaryBlock
            title="Snapshot"
            items={[
              { label: "Week delta", value: <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} /> },
              { label: "Status", value: healthDetails.level },
            ]}
            columns={2}
          />

          <ScenarioInputCard
            title="Current Health Focus"
            subtitle={
              usingSnapshotInsights
                ? "Top actionable and in-progress factors from the latest weekly snapshot."
                : "Showing latest health factors from your current property profile while weekly history builds."
            }
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button asChild>
                    <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`}>View maintenance actions</Link>
                  </Button>
                }
              />
            }
          >
            {focusInsights.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>No factor details are available yet for this property.</p>
                <p>
                  Add property profile fields and documentation to unlock a complete health breakdown:
                  {" "}
                  <Link href={`/dashboard/properties/${propertyId}/edit`} className="underline">Edit property details</Link>
                  {" "}
                  or
                  {" "}
                  <Link href={`/dashboard/documents?propertyId=${propertyId}`} className="underline">upload documents</Link>.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {focusInsights.map((insight, idx) => renderFocusInsightAccordionRow(insight, idx, true))}
              </div>
            )}
          </ScenarioInputCard>

          <ScenarioInputCard
            title="Score Trend"
            subtitle="Weekly snapshots for the last 6 months or 1 year."
            actions={
              <ActionPriorityRow
                secondaryActions={
                  <>
                    <Button size="sm" variant={trendWeeks === 26 ? "default" : "outline"} onClick={() => setTrendWeeks(26)}>
                      6 Months
                    </Button>
                    <Button size="sm" variant={trendWeeks === 52 ? "default" : "outline"} onClick={() => setTrendWeeks(52)}>
                      1 Year
                    </Button>
                  </>
                }
              />
            }
          >
            <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
          </ScenarioInputCard>

          <ScenarioInputCard title="Changes Impacting Score" subtitle="What moved the score since the previous weekly snapshot.">
            {changes.every((c) => c.impact === "neutral") && (
              <p className="text-sm text-gray-500 mb-2">No significant changes since last week.</p>
            )}
            <div className="space-y-2">
              {changes.map((change, idx) => (
                <CompactEntityRow
                  key={`${change.title}-${idx}`}
                  title={change.title}
                  subtitle={change.detail}
                  status={
                    change.impact !== "neutral" ? (
                      <StatusChip tone={change.impact === "positive" ? "good" : "danger"}>
                        {change.impact === "positive" ? "↑ Improved" : "↓ Declined"}
                      </StatusChip>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </ScenarioInputCard>

          <ScenarioInputCard
            title="Health Factor Ledger"
            subtitle="Full factor-by-factor contributions grouped by impact."
          >
            {sortedInsights.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Ledger details are not available yet.</p>
                <p>Complete property profile fields and upload service records to unlock full factor attribution.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {LEDGER_GROUPS.map((group) => {
                  const groupInsights = getLedgerInsights(group.key, negativeInsights, neutralInsights, positiveInsights);
                  return (
                    <div key={group.title} className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {group.title}
                          <span className={`ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            group.tone === 'danger' ? 'bg-red-100 text-red-600' :
                            group.tone === 'elevated' ? 'bg-amber-100 text-amber-700' :
                            'bg-teal-100 text-teal-700'
                          }`}>{groupInsights.length}</span>
                        </p>
                      </div>
                      {groupInsights.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No factors in this category.</p>
                      ) : (
                        groupInsights.map((insight, idx) => (
                          <div key={`${group.title}-${insight.factor || "insight"}-${idx}`} className={`border-l-[3px] ${getInsightLeftBorderColor(insight.status)} pl-2`}>
                            <CompactEntityRow
                              title={insight.factor || "Health insight"}
                              subtitle={getFactorDescription(insight.factor, insight.status)}
                              status={<StatusChip tone={getInsightTone(insight.status)}>{getInsightChipLabel(insight.status)}</StatusChip>}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScenarioInputCard>
        </MobileToolWorkspace>
      </div>

      <PageHeader className="hidden md:block pt-4 pb-4 md:pt-8 md:pb-8">
        <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Property Health Report
        </PageHeaderHeading>
        <p className="text-muted-foreground text-sm md:text-base">
          Weekly health summary for {property?.name || "this property"} — what changed, what needs attention, and what&apos;s working.
        </p>
      </PageHeader>

      <div className="hidden md:block">
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_2fr_1fr]">

          {/* ── Card 1: Health score ── */}
          <div className="rounded-2xl border border-slate-200/50 bg-gradient-to-br from-white via-white to-slate-50/60 shadow-[0_1px_4px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
            <div className="px-4 pt-3 pb-0">
              <p className="text-[10px] font-bold tracking-normal text-slate-400/80">Health score</p>
            </div>
            <div className="flex flex-col items-center justify-center flex-1 px-4 py-2">
              <div className="relative">
                <svg width="110" height="110" className="-rotate-90" aria-hidden="true">
                  <circle cx="55" cy="55" r="46" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                  <circle
                    cx="55" cy="55" r="46"
                    fill="none"
                    stroke={scoreRingColor}
                    strokeWidth="6"
                    strokeDasharray={`${(2 * Math.PI * 46).toFixed(2)} ${(2 * Math.PI * 46).toFixed(2)}`}
                    strokeDashoffset={(2 * Math.PI * 46 * (1 - latestScore / 100)).toFixed(2)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="flex items-end gap-0.5 leading-none">
                    <span className={`text-[36px] font-black tabular-nums leading-none tracking-tight ${healthDetails.color}`}>{latestScore.toFixed(0)}</span>
                    <span className="text-[10px] font-semibold text-slate-400 mb-1 ml-0.5">/100</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${scoreStatusDot}`} />
                    <span className="text-[10px] font-semibold text-slate-500 tracking-normal">{healthDetails.level}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center mt-1">
                <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} />
              </div>
            </div>
            <div className="px-4 py-2 border-t border-slate-100/80 bg-slate-50/60">
              <button
                onClick={() => setShowScoreModal(true)}
                className="text-[11px] font-semibold text-teal-600 hover:text-teal-500 transition-colors"
              >
                How is this calculated? →
              </button>
            </div>
          </div>

          {/* ── Card 2: Health Snapshot (primary surface) ── */}
          <div className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
            <div className="px-4 pt-3 pb-2 flex items-start justify-between border-b border-slate-100/80">
              <div>
                <p className="text-[13px] font-semibold text-slate-900 tracking-normal">Health Snapshot</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                  {usingSnapshotInsights ? "Latest weekly snapshot" : "From current property profile"}
                </p>
              </div>
              <span className="text-[9px] font-bold tracking-normal bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0 ml-3">
                {usingSnapshotInsights ? "Weekly" : "Live"}
              </span>
            </div>
            <div className="px-4 py-3 flex-1">
              {sortedInsights.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-6 text-center space-y-1.5">
                  <p className="text-sm font-medium text-slate-500">No signals available yet</p>
                  <p className="text-xs text-slate-400">
                    <Link href={`/dashboard/properties/${propertyId}/edit`} className="text-teal-600 hover:underline">Add property details</Link>
                    {" "}to unlock your full health breakdown.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[10px] bg-red-50 border border-red-100/60 p-2 text-center">
                      <p className="text-2xl font-black text-red-600 tabular-nums leading-none">{negativeInsights.length}</p>
                      <p className="text-[10px] font-semibold text-red-500/90 mt-1 leading-tight tracking-normal">Needs attention</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums">
                        {negDelta === null ? "First check" : negDelta === 0 ? "No change" : negDelta > 0 ? `↑ ${negDelta} more` : `↓ ${Math.abs(negDelta)} fewer`}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-amber-50 border border-amber-100/60 p-2 text-center">
                      <p className="text-2xl font-black text-amber-500 tabular-nums leading-none">{neutralInsights.length}</p>
                      <p className="text-[10px] font-semibold text-amber-600/90 mt-1 leading-tight tracking-normal">Monitor closely</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums">
                        {neutralDelta === null ? "First check" : neutralDelta === 0 ? "No change" : neutralDelta > 0 ? `↑ ${neutralDelta} more` : `↓ ${Math.abs(neutralDelta)} fewer`}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-emerald-50 border border-emerald-100/60 p-2 text-center">
                      <p className="text-2xl font-black text-emerald-600 tabular-nums leading-none">{positiveInsights.length}</p>
                      <p className="text-[10px] font-semibold text-emerald-600/90 mt-1 leading-tight tracking-normal">Healthy signals</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 tabular-nums">
                        {positiveDelta === null ? "First check" : positiveDelta === 0 ? "No change" : positiveDelta > 0 ? `↑ ${positiveDelta} more` : `↓ ${Math.abs(positiveDelta)} fewer`}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-100/50 px-2.5 py-1.5">
                      <span className="h-[6px] w-[6px] rounded-full bg-red-400/80 shrink-0" />
                      <span className="text-[10px] font-bold text-red-600 shrink-0 w-[78px] tracking-normal">Biggest risk</span>
                      <span className="text-[11px] font-medium text-slate-700 truncate flex-1">{topNegativeInsight?.factor || "None currently"}</span>
                      {topNegativeInsight && (
                        <span className="text-[9px] text-slate-400 shrink-0 ml-auto">{topNegativeInsight.status}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-teal-50/50 border border-teal-100/50 px-2.5 py-1.5">
                      <span className="h-[6px] w-[6px] rounded-full bg-teal-400/80 shrink-0" />
                      <span className="text-[10px] font-bold text-teal-600 shrink-0 w-[78px] tracking-normal">Best performing</span>
                      <span className="text-[11px] font-medium text-slate-700 truncate flex-1">{topPositiveInsight?.factor || "Building signal"}</span>
                      {topPositiveInsight && (
                        <span className="text-[9px] text-slate-400 shrink-0 ml-auto">{topPositiveInsight.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Card 3: Next Steps ── */}
          <div className="rounded-2xl border border-slate-200/50 bg-slate-50/80 shadow-[0_1px_4px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
            <div className="px-4 pt-3 pb-0">
              <p className="text-[10px] font-bold tracking-normal text-slate-400/80">Next Steps</p>
            </div>
            <div className="px-3 py-3 flex-1 space-y-2">
              <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`} className="block">
                <div className="rounded-xl bg-teal-800 hover:bg-teal-700 active:scale-[0.99] transition-all px-3 py-2.5 cursor-pointer group">
                  <p className="text-[12px] font-semibold text-white tracking-normal">View maintenance actions</p>
                  <p className="text-[10px] text-teal-200/80 mt-0.5 group-hover:text-teal-100/80 transition-colors">
                    {negativeInsights.length > 0
                      ? `${negativeInsights.length} item${negativeInsights.length > 1 ? "s" : ""} need attention`
                      : "All clear — check for opportunities"}
                  </p>
                </div>
              </Link>
              <Link href={`/dashboard/properties/${propertyId}/edit`} className="block">
                <div className="rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all px-3 py-2 cursor-pointer">
                  <p className="text-[12px] font-medium text-slate-600">Edit property details</p>
                </div>
              </Link>
            </div>
            <div className="px-4 pt-2 pb-2.5 border-t border-slate-200/70">
              <p className="text-[9px] font-semibold tracking-normal text-slate-400/80">
                {sortedInsights.length > 0 ? `${sortedInsights.length} factors tracked` : "Awaiting data"}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                {usingSnapshotInsights ? "Latest weekly snapshot" : "Current property profile"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg md:text-xl font-semibold">Overall Health Gauge: {healthDetails.level}</h3>
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Needs attention (0)</span>
              <span>Excellent (100)</span>
            </div>
            <Progress value={percentage} className="h-4" indicatorClassName={healthDetails.progressColor} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">Health score Trend</CardTitle>
                    <CardDescription>Weekly snapshots for the last 6 months or 1 year.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={trendWeeks === 26 ? "default" : "outline"} onClick={() => setTrendWeeks(26)}>
                      6 Months
                    </Button>
                    <Button size="sm" variant={trendWeeks === 52 ? "default" : "outline"} onClick={() => setTrendWeeks(52)}>
                      1 Year
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
                <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Changes Impacting Score</CardTitle>
                <CardDescription>What moved the score since the previous weekly snapshot.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {changes.every((c) => c.impact === "neutral") && (
                  <p className="text-sm text-gray-500 mb-2">No significant changes since last week.</p>
                )}
                {changes.map((change, idx) => (
                  <div key={`${change.title}-${idx}`} className="rounded-lg border border-black/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{change.title}</p>
                      {change.impact !== "neutral" && (
                        <Badge variant={change.impact === "positive" ? "success" : "destructive"}>
                          {change.impact === "positive" ? "↑ Improved" : "↓ Declined"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{change.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Current Health Focus</CardTitle>
              <CardDescription>
                {usingSnapshotInsights
                  ? "Top actionable and in-progress factors from the latest weekly snapshot."
                  : "Showing latest profile-driven health factors while weekly snapshot history is still building."}
              </CardDescription>
            </CardHeader>
            <CardContent>
                {focusInsights.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No factor details are available yet for this property.</p>
                  <p>
                    Add property profile fields and service records to unlock full health summary:
                    {" "}
                    <Link href={`/dashboard/properties/${propertyId}/edit`} className="underline">Edit property details</Link>
                    {" "}
                    or
                    {" "}
                    <Link href={`/dashboard/documents?propertyId=${propertyId}`} className="underline">upload documents</Link>.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {focusInsights.map((insight, idx) => renderFocusInsightAccordionRow(insight, idx, false))}
                </div>
              )}
              <div className="mt-4">
                <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`}>
                  <Button variant="outline" size="sm">View maintenance actions</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Health Factor Ledger</CardTitle>
                <CardDescription>Full factor-by-factor contributions grouped by negative, watch, and positive impact.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sortedInsights.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-black/10 px-3 py-3 text-sm text-muted-foreground">
                    No factor-level ledger is available yet. Complete property profile fields and upload service documents to unlock this section.
                  </div>
                ) : (
                  <>
                    {LEDGER_GROUPS.map((group) => {
                      const groupInsights = getLedgerInsights(group.key, negativeInsights, neutralInsights, positiveInsights);
                      return (
                        <div key={group.title} className="space-y-2">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground">
                              {group.title}
                              <span className={`ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                                group.tone === 'danger' ? 'bg-red-100 text-red-600' :
                                group.tone === 'elevated' ? 'bg-amber-100 text-amber-700' :
                                'bg-teal-100 text-teal-700'
                              }`}>{groupInsights.length}</span>
                            </p>
                          </div>
                          {groupInsights.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No factors in this category.</p>
                          ) : (
                            groupInsights.map((insight, idx) => (
                              <div key={`${group.title}-${insight.factor || "insight"}-${idx}`} className={`rounded-lg border border-black/10 border-l-[3px] ${getInsightLeftBorderColor(insight.status)} px-3 py-2`}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">{insight.factor || "Health insight"}</p>
                                  <Badge
                                    variant={
                                      getInsightImpact(insight.status) === "negative"
                                        ? "destructive"
                                        : getInsightImpact(insight.status) === "positive"
                                        ? "success"
                                        : "secondary"
                                    }
                                  >
                                    {getInsightChipLabel(insight.status)}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {getFactorDescription(insight.factor, insight.status)}
                                  {getInsightDetailsSummary(insight) ? ` • ${getInsightDetailsSummary(insight)}` : ""}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Dialog open={showScoreModal} onOpenChange={setShowScoreModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How your health score is calculated</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your home health score combines two groups of signals, rated on a 0–100 scale. Base factors (age, structure, systems, usage, and size) contribute up to {maxBaseScore} points. Extended factors like your HVAC, water heater, roof, and appliances contribute up to {maxExtraScore} additional points.
          </p>
          <p className="text-sm text-gray-500 mt-3">
            Your current score: {baseScore !== null ? baseScore.toFixed(1) : "0.0"} (base) + {unlockedScore !== null ? unlockedScore.toFixed(1) : "0.0"} (extended) = {latestScore.toFixed(1)} / 100
          </p>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
