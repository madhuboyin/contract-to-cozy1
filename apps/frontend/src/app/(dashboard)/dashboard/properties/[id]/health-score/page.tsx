"use client";

import React, { useMemo, useState } from "react";
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

const HIGH_PRIORITY_STATUSES = ["Needs Attention", "Needs Review", "Needs Inspection", "Missing Data"];

type HealthInsight = {
  factor?: string;
  status?: string;
  score?: number;
  details?: string[];
};

const getHealthDetails = (score: number) => {
  if (score >= 85) return { level: "Excellent", color: "text-green-600", progressColor: "bg-green-500" };
  if (score >= 70) return { level: "Good", color: "text-blue-600", progressColor: "bg-blue-500" };
  if (score >= 50) return { level: "Fair", color: "text-yellow-600", progressColor: "bg-yellow-500" };
  return { level: "Needs Attention", color: "text-red-600", progressColor: "bg-red-500" };
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getInsights(point: PropertyScoreTrendPoint | null | undefined): HealthInsight[] {
  const raw = point?.snapshot?.insights;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is HealthInsight => typeof item === "object" && item !== null);
}

function getRequiredActions(point: PropertyScoreTrendPoint | null | undefined): number | null {
  const raw = point?.snapshot?.requiredActions;
  return asNumber(raw);
}

function buildHealthChangeItems(series: PropertyScoreSeries | undefined) {
  const changes: Array<{ title: string; detail: string; impact: "positive" | "negative" | "neutral" }> = [];
  if (!series?.latest) {
    return [
      {
        title: "Waiting for history",
        detail: "Weekly snapshots are still being collected for this property.",
        impact: "neutral" as const,
      },
    ];
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

  const latestPriorityCount = getInsights(series.latest).filter((insight) =>
    HIGH_PRIORITY_STATUSES.includes(String(insight.status || ""))
  ).length;
  const previousPriorityCount = getInsights(series.previous).filter((insight) =>
    HIGH_PRIORITY_STATUSES.includes(String(insight.status || ""))
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
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const snapshotQuery = useQuery({
    queryKey: ["property-score-snapshot-health", propertyId, trendWeeks],
    queryFn: () => api.getPropertyScoreSnapshots(propertyId, trendWeeks),
    enabled: !!propertyId,
    staleTime: 10 * 60 * 1000,
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
  const latestScore = series?.latest?.score ?? 0;
  const scoreMax = series?.latest?.scoreMax ?? 100;
  const percentage = Math.min(100, Math.max(0, (latestScore / Math.max(scoreMax || 100, 1)) * 100));
  const latestInsights = getInsights(series?.latest);
  const healthDetails = getHealthDetails(latestScore);
  const changes = useMemo(() => buildHealthChangeItems(series), [series]);

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <PageHeader className="pt-4 pb-4 md:pt-8 md:pb-8">
        <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Property Health Report
        </PageHeaderHeading>
        <p className="text-muted-foreground text-sm md:text-base">
          Track weekly health score movement and the top changes driving it for {property?.name || "this property"}.
        </p>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-3">
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
            <div className="mt-3">
              <Progress value={percentage} className="h-2" indicatorClassName={healthDetails.progressColor} />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Current Health Focus</CardTitle>
            <CardDescription>Top insights from the latest weekly health snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            {latestInsights.length === 0 ? (
              <p className="text-sm text-muted-foreground">No insight details available yet for this property.</p>
            ) : (
              <div className="space-y-2">
                {latestInsights.slice(0, 5).map((insight, idx) => (
                  <div key={`${insight.factor || "insight"}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{insight.factor || "Health insight"}</p>
                      <p className="text-xs text-muted-foreground">{insight.status || "Status unavailable"}</p>
                    </div>
                    <Badge variant={HIGH_PRIORITY_STATUSES.includes(String(insight.status || "")) ? "destructive" : "secondary"}>
                      {HIGH_PRIORITY_STATUSES.includes(String(insight.status || "")) ? "Action needed" : "Stable"}
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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
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

