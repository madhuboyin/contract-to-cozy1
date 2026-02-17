"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gauge, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeader, PageHeaderHeading } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api/client";
import { ScoreDeltaIndicator, ScoreTrendChart } from "@/components/scores/ScoreTrendChart";
import { HomeScoreComponent, HomeScoreReason } from "@/types";

function bandLabel(band?: string) {
  if (band === "EXCELLENT") return "Excellent";
  if (band === "GOOD") return "Good";
  if (band === "FAIR") return "Fair";
  return "Needs Attention";
}

function bandStyle(band?: string) {
  if (band === "EXCELLENT") return "text-green-600";
  if (band === "GOOD") return "text-blue-600";
  if (band === "FAIR") return "text-yellow-600";
  return "text-red-600";
}

function componentBadge(component: HomeScoreComponent["key"]) {
  if (component === "HEALTH") return "secondary";
  if (component === "RISK") return "destructive";
  return "success";
}

function reasonBadge(impact: HomeScoreReason["impact"]) {
  if (impact === "POSITIVE") return "success";
  if (impact === "NEGATIVE") return "destructive";
  return "secondary";
}

export default function HomeScoreReportPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const [weeks, setWeeks] = useState<26 | 52>(26);

  const propertyQuery = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const reportQuery = useQuery({
    queryKey: ["home-score-report-page", propertyId, weeks],
    queryFn: async () => {
      if (!propertyId) return null;
      return api.getHomeScoreReport(propertyId, weeks);
    },
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!propertyId) return null;
      return api.refreshHomeScoreReport(propertyId, weeks);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["home-score-report"] });
      await queryClient.invalidateQueries({ queryKey: ["home-score-report-page", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["primary-risk-summary", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["financial-efficiency-summary", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["property-score-snapshot", propertyId] });
    },
  });

  const report = reportQuery.data;
  const trendPoints = useMemo(
    () =>
      (report?.trend || []).map((point) => ({
        weekStart: point.weekStart,
        score: point.homeScore,
        scoreMax: 100,
        scoreBand: null,
        computedAt: point.weekStart,
        snapshot: {
          health: point.healthScore,
          risk: point.riskScore,
          financial: point.financialScore,
        },
      })),
    [report?.trend]
  );

  if (!propertyId || propertyQuery.isLoading || reportQuery.isLoading) {
    return (
      <DashboardShell>
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  if (!report) {
    return (
      <DashboardShell>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Unable to load HomeScore report</h2>
          <p className="text-sm text-red-600 mt-1">
            We could not generate the HomeScore report for this property right now.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => reportQuery.refetch()}>Try again</Button>
            <Button variant="outline" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const score = Math.round(report.homeScore);

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <PageHeader className="pt-4 pb-4 md:pt-8 md:pb-8">
        <Button
          variant="link"
          className="p-0 h-auto mb-2 text-sm text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <Gauge className="h-6 w-6 md:h-8 md:w-8 text-primary" /> HomeScore Report
        </PageHeaderHeading>
        <p className="text-muted-foreground text-sm md:text-base max-w-3xl">
          A consolidated trust view of health, risk, and financial posture for{" "}
          {propertyQuery.data?.name || "this property"}, with confidence and top improvement drivers.
        </p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-2 border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">HomeScore</CardTitle>
            <CardDescription>Composite confidence-weighted score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-extrabold ${bandStyle(report.scoreBand)}`}>{score}</span>
              <span className="text-xl text-muted-foreground">/100</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Badge variant="outline">{bandLabel(report.scoreBand)}</Badge>
              <Badge variant="secondary">Confidence: {report.confidence}</Badge>
            </div>
            <div className="mt-3">
              <ScoreDeltaIndicator delta={report.deltaFromPreviousWeek} />
            </div>
            <div className="mt-4">
              <Progress value={score} className="h-2" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="rounded border px-2 py-1">
                <p className="font-semibold text-foreground">{report.verificationLadder.userStated}</p>
                <p>User-stated</p>
              </div>
              <div className="rounded border px-2 py-1">
                <p className="font-semibold text-foreground">{report.verificationLadder.inferred}</p>
                <p>Inferred</p>
              </div>
              <div className="rounded border px-2 py-1">
                <p className="font-semibold text-foreground">{report.verificationLadder.systemComputed}</p>
                <p>System</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-medium">Top reasons score is not higher</CardTitle>
                <CardDescription>Actionable contributors ranked by impact and confidence.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate()}
                >
                  {refreshMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.topReasonsScoreNotHigher.map((reason) => (
              <div key={reason.id} className="rounded-lg border border-black/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <p className="text-sm font-medium">{reason.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={componentBadge(reason.component) as any}>{reason.component}</Badge>
                    <Badge variant={reasonBadge(reason.impact) as any}>{reason.impact.toLowerCase()}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{reason.detail}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Confidence: {reason.confidence}</span>
                  {reason.actionHref ? (
                    <Link href={reason.actionHref} className="text-primary hover:underline">
                      Resolve
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-medium">HomeScore Trend</CardTitle>
                <CardDescription>Weekly HomeScore trend across health, risk, and financial factors.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={weeks === 26 ? "default" : "outline"} onClick={() => setWeeks(26)}>
                  6 Months
                </Button>
                <Button size="sm" variant={weeks === 52 ? "default" : "outline"} onClick={() => setWeeks(52)}>
                  1 Year
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart points={trendPoints} ariaLabel="HomeScore trend" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">What changed since last week</CardTitle>
            <CardDescription>Delta drivers pulled from weekly score snapshots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.whatChangedSinceLastWeek.map((change) => (
              <div key={change.id} className="rounded-lg border border-black/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{change.title}</p>
                  <Badge variant={reasonBadge(change.impact) as any}>{change.impact.toLowerCase()}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{change.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Factor Breakdown</CardTitle>
            <CardDescription>Each component includes source provenance and confidence level.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {report.components.map((component) => (
              <div key={component.key} className="rounded-lg border border-black/10 px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{component.label}</p>
                  <Badge variant={componentBadge(component.key) as any}>{component.score.toFixed(0)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{component.sourceSummary}</p>
                <p className="text-xs mt-2">Confidence: {component.confidence}</p>
                <p className="text-xs text-muted-foreground">
                  Provenance: {component.provenance.replace('_', ' ').toLowerCase()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Next best action</CardTitle>
            <CardDescription>Highest-leverage move to improve trust and score quality.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.nextBestAction ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{report.nextBestAction.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{report.nextBestAction.detail}</p>
                    {report.nextBestAction.href ? (
                      <Link href={report.nextBestAction.href} className="text-xs text-primary hover:underline mt-2 inline-block">
                        Take action
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No immediate action required.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
