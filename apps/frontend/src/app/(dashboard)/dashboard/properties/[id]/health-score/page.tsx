"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, ArrowLeft, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const REQUIRED_ACTION_STATUSES = ["Needs Attention", "Needs Review", "Needs Inspection", "Missing Data", "Needs Warranty"];
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
  return { level: "Needs Attention", color: "text-red-600", progressColor: "bg-red-500" };
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
  { key: "negative", title: "Needs Attention", tone: "danger" as const },
  { key: "neutral", title: "Monitor Closely", tone: "elevated" as const },
  { key: "positive", title: "Healthy Signals", tone: "good" as const },
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
  const healthDetails = getHealthDetails(latestScore);
  const changes = buildHealthChangeItems(series, sortedInsights);

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="md:hidden">
        <MobileToolWorkspace
          intro={
            <div className="space-y-2">
              <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <MobilePageIntro
                eyebrow="Property Score"
                title="Property Health Report"
                subtitle={`Track weekly health movement for ${property?.name || "this property"}.`}
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
              title="Health Score"
              value={`${latestScore.toFixed(0)}/${scoreMax}`}
              status={<StatusChip tone={healthTone(healthDetails.level)}>{healthDetails.level}</StatusChip>}
              summary="Transparent 0-100 score with full factor-level derivation."
            />
          }
          footer={<BottomSafeAreaReserve size="chatAware" />}
        >
          <ReadOnlySummaryBlock
            title="Snapshot"
            items={[
              { label: "Week delta", value: <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} /> },
              {
                label: "Base factors",
                value: baseScore !== null ? `${baseScore.toFixed(1)}/${maxBaseScore}` : "Missing inputs",
              },
              {
                label: "Extended factors",
                value: unlockedScore !== null ? `${unlockedScore.toFixed(1)}/${maxExtraScore}` : "Missing inputs",
              },
              { label: "Potential ceiling", value: `${potentialScore.toFixed(0)}/100`, emphasize: true },
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
                {focusInsights.map((insight, idx) => {
                  const detailsSummary = getInsightDetailsSummary(insight);
                  const scoreValue = (asNumber(insight.score) ?? 0).toFixed(1);
                  return (
                    <CompactEntityRow
                      key={`${insight.factor || "insight"}-${idx}`}
                      title={insight.factor || "Health insight"}
                      subtitle={`${insight.status || "Status unavailable"} • ${scoreValue} pts${detailsSummary ? ` • ${detailsSummary}` : ""}`}
                      status={<StatusChip tone={getInsightTone(insight.status)}>{getInsightChipLabel(insight.status)}</StatusChip>}
                    />
                  );
                })}
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
            <div className="space-y-2">
              {changes.map((change, idx) => (
                <CompactEntityRow
                  key={`${change.title}-${idx}`}
                  title={change.title}
                  subtitle={change.detail}
                  status={
                    <StatusChip tone={change.impact === "positive" ? "good" : change.impact === "negative" ? "danger" : "info"}>
                      {change.impact === "positive" ? "Positive" : change.impact === "negative" ? "Negative" : "Neutral"}
                    </StatusChip>
                  }
                />
              ))}
            </div>
          </ScenarioInputCard>

          <ScenarioInputCard
            title="How Score Is Derived"
            subtitle="Health score is always shown on a 0-100 scale."
          >
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Base profile factors (up to {maxBaseScore} pts): Age, Structure, Systems, Usage/Wear, and Size.</p>
              <p>Extended factors (up to {maxExtraScore} pts): HVAC, Water Heater, Roof, Safety, Exterior, Documents, and Appliances.</p>
              <p>
                Current composition: Base {baseScore !== null ? baseScore.toFixed(1) : "0.0"} + Extended{" "}
                {unlockedScore !== null ? unlockedScore.toFixed(1) : "0.0"} = {latestScore.toFixed(1)} / 100
                {" "}
                (potential ceiling {potentialScore.toFixed(0)} / 100).
              </p>
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                        <StatusChip tone={group.tone}>{groupInsights.length}</StatusChip>
                      </div>
                      {groupInsights.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No factors in this category.</p>
                      ) : (
                        groupInsights.map((insight, idx) => (
                          <CompactEntityRow
                            key={`${group.title}-${insight.factor || "insight"}-${idx}`}
                            title={insight.factor || "Health insight"}
                            subtitle={`${insight.status || "Status unavailable"} • ${(asNumber(insight.score) ?? 0).toFixed(1)} pts${getInsightDetailsSummary(insight) ? ` • ${getInsightDetailsSummary(insight)}` : ""}`}
                            status={<StatusChip tone={getInsightTone(insight.status)}>{getInsightChipLabel(insight.status)}</StatusChip>}
                          />
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
        <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Property Health Report
        </PageHeaderHeading>
        <p className="text-muted-foreground text-sm md:text-base">
          Track weekly movement and full factor-level derivation for {property?.name || "this property"}.
        </p>
      </PageHeader>

      <div className="hidden md:grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 border-2 border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-extrabold flex items-baseline">
              <span className={healthDetails.color}>{latestScore.toFixed(0)}</span>
              <span className="text-xl font-semibold text-muted-foreground ml-1">/{scoreMax}</span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">Status: {healthDetails.level}</div>
            <div className="mt-2">
              <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Base: {baseScore !== null ? baseScore.toFixed(1) : "0.0"}/{maxBaseScore} • Extended:{" "}
              {unlockedScore !== null ? unlockedScore.toFixed(1) : "0.0"}/{maxExtraScore}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Potential ceiling: {potentialScore.toFixed(0)}/100</div>
            <div className="mt-3">
              <Progress value={percentage} className="h-2" indicatorClassName={healthDetails.progressColor} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
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
                  Add property profile fields and service records to unlock full health derivation:
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
                {focusInsights.map((insight, idx) => (
                  <div key={`${insight.factor || "insight"}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{insight.factor || "Health insight"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(insight.status || "Status unavailable")} • {(asNumber(insight.score) ?? 0).toFixed(1)} pts
                        {getInsightDetailsSummary(insight) ? ` • ${getInsightDetailsSummary(insight)}` : ""}
                      </p>
                    </div>
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
                ))}
              </div>
            )}
            <div className="mt-4">
              <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`}>
                <Button variant="outline" size="sm">View maintenance actions</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 hidden md:grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">How Score Is Calculated</CardTitle>
            <CardDescription>Transparent base + extended factor model on a fixed 0-100 scale.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Base profile factors (up to {maxBaseScore} pts): Age, Structure, Systems, Usage/Wear, and Size.</p>
            <p>Extended factors (up to {maxExtraScore} pts): HVAC, Water Heater, Roof, Safety, Exterior, Documents, and Appliances.</p>
            <p>
              Current: Base {baseScore !== null ? baseScore.toFixed(1) : "0.0"} + Extended{" "}
              {unlockedScore !== null ? unlockedScore.toFixed(1) : "0.0"} = {latestScore.toFixed(1)} / 100.
            </p>
            <p>Potential ceiling: {potentialScore.toFixed(0)} / 100.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
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
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                        <StatusChip tone={group.tone}>{groupInsights.length}</StatusChip>
                      </div>
                      {groupInsights.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No factors in this category.</p>
                      ) : (
                        groupInsights.map((insight, idx) => (
                          <div key={`${group.title}-${insight.factor || "insight"}-${idx}`} className="rounded-lg border border-black/10 px-3 py-2">
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
                              {(insight.status || "Status unavailable")} • {(asNumber(insight.score) ?? 0).toFixed(1)} pts
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

      <div className="mt-8 hidden md:grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-medium">Score Trend</CardTitle>
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
          <CardContent>
            <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Changes Impacting Score</CardTitle>
            <CardDescription>What moved the score since the previous weekly snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {changes.map((change, idx) => (
              <div key={`${change.title}-${idx}`} className="rounded-lg border border-black/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{change.title}</p>
                  <Badge
                    variant={
                      change.impact === "positive"
                        ? "success"
                        : change.impact === "negative"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {change.impact === "positive" ? "Positive" : change.impact === "negative" ? "Negative" : "Neutral"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{change.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
