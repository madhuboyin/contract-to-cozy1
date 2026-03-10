"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileDown,
  Gauge,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScoreTrendChart } from "@/components/scores/ScoreTrendChart";
import { api } from "@/lib/api/client";
import {
  HomeScoreBenchmarkItem,
  HomeScoreDriver,
  HomeScoreFinancialExposure,
  HomeScoreImprovementAction,
  HomeScoreRadarAxis,
  HomeScoreReport,
} from "@/types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCurrency(amount: number | null | undefined) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso?: string | null) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function confidenceBadgeClass(confidence: string) {
  if (confidence === "HIGH") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (confidence === "MEDIUM") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusBadgeClass(status: string) {
  if (status === "PASS") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "WARN") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "FAIL") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function urgencyBadgeClass(urgency: string) {
  if (urgency === "HIGH") return "bg-rose-100 text-rose-700 border-rose-200";
  if (urgency === "MEDIUM") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function benchmarkDeltaLabel(thisScore: number, benchmarkScore: number) {
  const delta = Math.round((thisScore - benchmarkScore) * 10) / 10;
  if (delta === 0) return "At benchmark";
  return `${delta > 0 ? "+" : ""}${delta} vs benchmark`;
}

function SectionCard(props: {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  onToggle?: (sectionId: string, open: boolean) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { id, title, subtitle, defaultOpen = true, onToggle, action, children } = props;

  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-slate-200 bg-white shadow-sm"
      onToggle={(event) => {
        const details = event.currentTarget;
        onToggle?.(id, details.open);
      }}
    >
      <summary className="list-none cursor-pointer px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={id} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {action}
            <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-90" />
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-100 px-6 py-5">{children}</div>
    </details>
  );
}

function ScoreRing({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 68;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative h-44 w-44">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="#0f172a"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold tracking-tight text-slate-950">{normalized}</div>
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">out of 100</div>
      </div>
    </div>
  );
}

function RadarChart({ axes }: { axes: HomeScoreRadarAxis[] }) {
  const size = 320;
  const center = size / 2;
  const radius = 110;
  const total = Math.max(axes.length, 1);

  const pointFor = (index: number, valuePct: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = radius * (valuePct / 100);
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  };

  const axisFor = (index: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };

  const polygons = [25, 50, 75, 100].map((level) =>
    axes
      .map((_, index) => {
        const p = pointFor(index, level);
        return `${p.x},${p.y}`;
      })
      .join(" ")
  );

  const dataPoints = axes
    .map((axis, index) => {
      const p = pointFor(index, axis.score);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[320px] w-[320px]">
        {polygons.map((poly, index) => (
          <polygon
            key={`grid-${index}`}
            points={poly}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={index === polygons.length - 1 ? 1.5 : 1}
          />
        ))}

        {axes.map((axis, index) => {
          const end = axisFor(index);
          return (
            <line
              key={`axis-${axis.key}`}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          );
        })}

        <polygon points={dataPoints} fill="rgba(15,23,42,0.14)" stroke="#0f172a" strokeWidth={2.5} />

        {axes.map((axis, index) => {
          const p = pointFor(index, axis.score);
          const labelPos = axisFor(index);
          return (
            <g key={`point-${axis.key}`}>
              <circle cx={p.x} cy={p.y} r={4.5} fill="#0f172a" />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor={labelPos.x < center - 8 ? "end" : labelPos.x > center + 8 ? "start" : "middle"}
                dominantBaseline={labelPos.y < center - 8 ? "auto" : "hanging"}
                fontSize="12"
                fill="#334155"
              >
                {axis.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function HomeScoreReportPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const [weeks, setWeeks] = useState<26 | 52>(26);
  const viewedRef = useRef<string | null>(null);

  const trackEvent = useCallback((event: string, section?: string, metadata?: Record<string, unknown>) => {
    if (!propertyId) return;
    api.trackHomeScoreEvent(propertyId, { event, section, metadata }).catch(() => undefined);
  }, [propertyId]);

  const propertyQuery = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const response = await api.getProperty(propertyId);
      return response.success ? response.data : null;
    },
    enabled: !!propertyId,
  });

  const reportQuery = useQuery({
    queryKey: ["home-score-report-page-v2", propertyId, weeks],
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
      trackEvent("REPORT_REFRESHED", "header", { weeks });
      await queryClient.invalidateQueries({ queryKey: ["home-score-report"] });
      await queryClient.invalidateQueries({ queryKey: ["home-score-report-page-v2", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["property-score-snapshot", propertyId] });
    },
  });

  const report = reportQuery.data as HomeScoreReport | null;

  useEffect(() => {
    if (!report) return;
    const key = `${report.propertyId}:${report.generatedAt}`;
    if (viewedRef.current === key) return;
    viewedRef.current = key;
    trackEvent("REPORT_VIEWED", "report", {
      homeScore: report.homeScore,
      confidence: report.confidence,
      coveragePct: report.trustAndVerification?.dataCoveragePct,
    });
  }, [report, trackEvent]);

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
        <div className="h-64 rounded-xl border border-slate-200 bg-white flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      </DashboardShell>
    );
  }

  if (!report) {
    return (
      <DashboardShell>
        <Card className="border-rose-200 bg-rose-50">
          <CardHeader>
            <CardTitle className="text-rose-700">Unable to load HomeScore report</CardTitle>
            <CardDescription className="text-rose-600">
              We could not generate the report for this property right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => reportQuery.refetch()}>Try again</Button>
            <Button variant="outline" onClick={() => router.back()}>
              Back
            </Button>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const meta = report.reportMeta;
  const executive = report.executiveSummary;
  const radar = report.radar;
  const drivers: HomeScoreDriver[] = report.scoreDrivers || [];
  const timelineEvents = report.timeline?.events || [];
  const financialExposure: HomeScoreFinancialExposure = report.financialExposure;
  const benchmarkItems: HomeScoreBenchmarkItem[] = report.benchmarks?.sources || [];
  const improvementActions: HomeScoreImprovementAction[] = report.improvementPlan?.actions || [];

  const onSectionToggle = (sectionId: string, open: boolean) => {
    trackEvent(open ? "SECTION_EXPANDED" : "SECTION_COLLAPSED", sectionId);
  };

  return (
    <DashboardShell className="pb-8 print:bg-white">
      <div className="space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Button variant="ghost" className="px-0 text-slate-600" onClick={() => router.back()}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                trackEvent("SHARE_EXPORT_INITIATED", "header", { action: "open_reports" });
                router.push(`/dashboard/properties/${propertyId}/reports`);
              }}
            >
              <FileDown className="mr-2 h-4 w-4" /> Export / Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                trackEvent("SHARE_EXPORT_INITIATED", "header", { action: "print" });
                window.print();
              }}
            >
              Print
            </Button>
            <Button size="sm" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate()}>
              {refreshMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-4">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Report Header</div>
              <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">
                {meta?.reportTitle || "Contract-to-Cozy Certified HomeScore Report"}
              </CardTitle>
              <CardDescription className="text-sm text-slate-600">
                {meta?.propertyAddress || `${propertyQuery.data?.address || ""}, ${propertyQuery.data?.city || ""}`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Report ID</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{meta?.reportId || "Pending"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Generated</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{formatDate(meta?.generatedDate)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Prepared For</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{meta?.preparedFor || "Property Owner"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Data Coverage</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{meta?.dataCoveragePercentage ?? report.trustAndVerification?.dataCoveragePct}%</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className={confidenceBadgeClass(meta?.confidenceLevel || report.confidence)}>
                Confidence: {meta?.confidenceLevel || report.confidence}
              </Badge>
              <Badge variant="outline">Verification: {meta?.verificationStatusSummary || "In progress"}</Badge>
              <Badge variant="outline">Version {meta?.reportVersion || "2.0"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 text-slate-50">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Executive Summary</CardTitle>
            <CardDescription className="text-slate-300">
              Overall home health, financial exposure, and verification confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[220px,1fr]">
            <div className="flex flex-col items-center gap-3">
              <ScoreRing score={executive?.homeScore ?? report.homeScore} />
              <div className="flex items-center gap-2">
                <Badge className="bg-white/15 text-white border-white/20">Grade {executive?.grade || "-"}</Badge>
                <Badge className="bg-white/15 text-white border-white/20">{(executive?.ratingTier || "").replace("_", " ")}</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Confidence</p>
                  <p className="mt-1 text-lg font-semibold">{executive?.confidenceLevel || report.confidence}</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Value Protection</p>
                  <p className="mt-1 text-lg font-semibold">{executive?.valueProtectionScore ?? report.homeScore}/100</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Money At Risk (3y)</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(executive?.moneyAtRiskHeadline ?? financialExposure?.headlineMoneyAtRisk)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Weekly Delta</p>
                  <p className="mt-1 text-lg font-semibold inline-flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    {report.deltaFromPreviousWeek === null ? "No change" : `${report.deltaFromPreviousWeek > 0 ? "+" : ""}${report.deltaFromPreviousWeek.toFixed(1)}`}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Score trend</p>
                  <div className="flex items-center gap-2 print:hidden">
                    <Button
                      size="sm"
                      variant={weeks === 26 ? "default" : "outline"}
                      className={weeks === 26 ? "bg-white text-slate-900 hover:bg-white/90" : "border-white/30 bg-transparent text-white hover:bg-white/10"}
                      onClick={() => {
                        setWeeks(26);
                        trackEvent("TIMELINE_INTERACTION", "executive-summary", { window: "26w" });
                      }}
                    >
                      6M
                    </Button>
                    <Button
                      size="sm"
                      variant={weeks === 52 ? "default" : "outline"}
                      className={weeks === 52 ? "bg-white text-slate-900 hover:bg-white/90" : "border-white/30 bg-transparent text-white hover:bg-white/10"}
                      onClick={() => {
                        setWeeks(52);
                        trackEvent("TIMELINE_INTERACTION", "executive-summary", { window: "52w" });
                      }}
                    >
                      1Y
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white px-2 py-1 text-slate-900">
                  <ScoreTrendChart points={trendPoints} ariaLabel="HomeScore trend" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <SectionCard
          id="home-protection-radar"
          title="Home Protection Radar"
          subtitle="Signature view across maintenance, insurance, safety, financial, and weather resilience."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-5 lg:grid-cols-[360px,1fr]">
            <RadarChart axes={radar?.axes || []} />
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {(radar?.axes || []).map((axis) => (
                  <div key={axis.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900">{axis.label}</p>
                      <Badge variant="outline" className={confidenceBadgeClass(axis.confidence)}>
                        {axis.confidence}
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{axis.score}</p>
                    <p className="text-xs text-slate-600">{axis.estimated ? "Estimated from partial inputs" : "Measured from verified inputs"}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Weakest area:</span> {radar?.weakestArea || "N/A"}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Strongest area:</span> {radar?.strongestArea || "N/A"}
                </p>
                <p className="mt-3 text-sm text-slate-600">{radar?.explanation}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="score-drivers"
          title="Score Drivers / Top Risk Drivers"
          subtitle="Ranked contributors with explicit score impact and financial relevance."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drivers.length > 0 ? (
              drivers.map((driver) => (
                <Card key={driver.id} className="border-slate-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold text-slate-900">{driver.title}</CardTitle>
                      <Badge variant="outline" className={driver.scoreImpact < 0 ? "text-rose-700 border-rose-200" : "text-emerald-700 border-emerald-200"}>
                        {driver.scoreImpact > 0 ? "+" : ""}{driver.scoreImpact}
                      </Badge>
                    </div>
                    <CardDescription>{driver.explanation}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-600">
                    <p>Financial impact: {formatCurrency(driver.financialImpact)}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={confidenceBadgeClass(driver.confidence)}>{driver.confidence}</Badge>
                      <Badge variant="outline">{driver.provenance.replace("_", " ")}</Badge>
                    </div>
                    {driver.actionHref ? (
                      <Link
                        href={driver.actionHref}
                        className="inline-flex items-center text-sm text-slate-900 hover:underline"
                        onClick={() => trackEvent("IMPROVEMENT_ACTION_CLICKED", "score-drivers", { driverId: driver.id })}
                      >
                        Take action <ChevronRight className="ml-1 h-3 w-3" />
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-sm text-slate-600">No score driver details available yet.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          id="home-timeline"
          title="Home Timeline"
          subtitle="CARFAX-style chronology of property milestones, maintenance, and verification events."
          onToggle={onSectionToggle}
        >
          {timelineEvents.length > 0 ? (
            <ol className="space-y-3">
              {timelineEvents.map((event) => (
                <li
                  key={event.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  onClick={() => trackEvent("TIMELINE_INTERACTION", "home-timeline", { eventId: event.id })}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{event.provenance.replace("_", " ")}</Badge>
                      <Badge variant="outline">{event.datePrecision === "YEAR" ? event.year : formatDate(event.occurredAt)}</Badge>
                    </div>
                  </div>
                  {event.summary ? <p className="mt-2 text-sm text-slate-600">{event.summary}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-900">{report.timeline?.emptyState?.title || "No timeline events yet"}</p>
              <p className="mt-1 text-sm text-slate-600">{report.timeline?.emptyState?.detail || "Add service records to improve timeline confidence."}</p>
              {report.timeline?.emptyState?.ctaHref ? (
                <Link
                  href={report.timeline.emptyState.ctaHref}
                  className="mt-3 inline-flex items-center text-sm text-slate-900 hover:underline"
                  onClick={() => trackEvent("TIMELINE_INTERACTION", "home-timeline", { action: "empty_state_cta" })}
                >
                  {report.timeline.emptyState.ctaLabel || "Open timeline"}
                </Link>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard
          id="major-system-health"
          title="Major System Health"
          subtitle="Per-system grades, verification status, and next recommended actions."
          onToggle={onSectionToggle}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">System</th>
                  <th className="py-2 pr-3">Grade</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Age / Window</th>
                  <th className="py-2 pr-3">Verification</th>
                  <th className="py-2 pr-3">Next Action</th>
                  <th className="py-2">Risk Horizon</th>
                </tr>
              </thead>
              <tbody>
                {(report.systemHealth || []).map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3 font-medium text-slate-900">{row.label}</td>
                    <td className="py-3 pr-3">
                      <Badge variant="outline">{row.grade}</Badge>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{row.statusLabel}</td>
                    <td className="py-3 pr-3 text-slate-700">
                      {row.ageYears === null ? "Unknown age" : `${row.ageYears} years`}<br />
                      <span className="text-xs text-slate-500">{row.serviceWindow || "-"}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant="outline">{row.verification.replace("_", " ")}</Badge>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{row.nextRecommendedAction}</td>
                    <td className="py-3 text-slate-700">
                      {row.projectedRiskHorizonMonths ? `${row.projectedRiskHorizonMonths} months` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          id="financial-exposure"
          title="Financial Exposure Forecast"
          subtitle="Money at Risk across 12 months, 3 years, and 5 years with prioritized exposure lines."
          onToggle={onSectionToggle}
          action={
            <Button
              variant="outline"
              size="sm"
              asChild
              className="print:hidden"
            >
              <Link
                href={`/dashboard/properties/${propertyId}/tools/do-nothing`}
                onClick={() => trackEvent("SCORE_SIMULATION_ACTION_CLICKED", "financial-exposure", { tool: "do-nothing" })}
              >
                Run simulation
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardDescription>12 months</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon12Months)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardDescription>3 years</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon3Years)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardDescription>5 years</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon5Years)}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Headline Money At Risk</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(financialExposure.headlineMoneyAtRisk)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Confidence range: {formatCurrency(financialExposure.confidenceRangeLow)} - {formatCurrency(financialExposure.confidenceRangeHigh)}
                </p>
              </div>
              <div className="space-y-2">
                {(financialExposure.lines || []).map((line) => (
                  <div key={line.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{line.label}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={urgencyBadgeClass(line.urgency)}>{line.urgency}</Badge>
                        <Badge variant="outline" className={confidenceBadgeClass(line.confidence)}>{line.confidence}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{formatCurrency(line.exposure)}</p>
                    <p className="text-xs text-slate-500">{line.provenance.replace("_", " ")}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">What reduces this risk?</p>
              <ul className="mt-3 space-y-3">
                {(financialExposure.whatReducesRisk || []).map((item, index) => (
                  <li key={`${item.title}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="verification-confidence"
          title="Verification + Data Confidence"
          subtitle="Source quality, coverage percentages, and confidence indicators across the report."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <div className="space-y-3">
              {[
                { label: "Data Coverage", value: report.trustAndVerification?.dataCoveragePct },
                { label: "Verified", value: report.trustAndVerification?.verifiedPct },
                { label: "Estimated", value: report.trustAndVerification?.estimatedPct },
                { label: "User Reported", value: report.trustAndVerification?.userReportedPct },
                { label: "Public Record", value: report.trustAndVerification?.publicRecordPct },
                { label: "Document-backed", value: report.trustAndVerification?.documentBackedPct },
              ].map((metric) => (
                <div key={metric.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{metric.label}</span>
                    <span>{metric.value ?? 0}%</span>
                  </div>
                  <Progress value={metric.value ?? 0} className="h-2" />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Confidence score</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{report.trustAndVerification?.confidenceScore}/100</p>
                <p className="mt-1 text-sm text-slate-600">{report.trustAndVerification?.explanation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(report.trustAndVerification?.badgeTaxonomy || []).map((badge) => (
                    <Badge key={badge} variant="outline">{badge.replace("_", " ")}</Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Verification opportunities</p>
                <ul className="mt-3 space-y-2">
                  {(report.verificationOpportunities || []).slice(0, 5).map((opportunity) => (
                    <li key={opportunity.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{opportunity.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{opportunity.detail}</p>
                      </div>
                      {opportunity.href ? (
                        <Link
                          href={opportunity.href}
                          className="text-xs text-slate-900 hover:underline"
                          onClick={() => trackEvent("VERIFICATION_CTA_CLICKED", "verification-confidence", { id: opportunity.id })}
                        >
                          Verify
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="integrity-checks"
          title="Report Integrity Checks"
          subtitle="Consistency checks across timeline, documentation, safety, and profile completeness."
          onToggle={onSectionToggle}
        >
          <div className="space-y-3">
            {(report.integrityChecks || []).map((check) => (
              <div key={check.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {check.status === "PASS" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <p className="text-sm font-semibold text-slate-900">{check.title}</p>
                  </div>
                  <Badge variant="outline" className={statusBadgeClass(check.status)}>{check.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{check.detail}</p>
                {check.remediation ? <p className="mt-1 text-xs text-slate-500">{check.remediation}</p> : null}
                {check.actionHref ? (
                  <Link
                    href={check.actionHref}
                    className="mt-2 inline-flex text-xs text-slate-900 hover:underline"
                    onClick={() => trackEvent("IMPROVEMENT_ACTION_CLICKED", "integrity-checks", { id: check.id })}
                  >
                    Resolve
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          id="benchmark-comparison"
          title="Benchmark Comparison"
          subtitle="How this home compares against available peer and market benchmark sources."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {benchmarkItems.length > 0 ? (
              benchmarkItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cx(
                    "rounded-xl border p-4 text-left transition",
                    item.available ? "border-slate-200 bg-white hover:bg-slate-50" : "border-dashed border-slate-300 bg-slate-50"
                  )}
                  onClick={() => trackEvent("BENCHMARK_INTERACTION", "benchmark-comparison", { source: item.key, available: item.available })}
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{item.available ? item.score : "N/A"}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.available
                      ? benchmarkDeltaLabel(report.benchmarks.thisHomeScore, item.score)
                      : "Awaiting sufficient source data"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Sample size: {item.sampleSize ?? "N/A"}</p>
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-600">No benchmark sources available yet.</p>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">Interpretation:</span> {report.benchmarks?.interpretation}
            </p>
            <p className="mt-1">Percentile: {report.benchmarks?.percentile ? `${report.benchmarks.percentile}th` : "Not available yet"}</p>
          </div>
        </SectionCard>

        <SectionCard
          id="improvement-plan"
          title="Score Improvement Plan"
          subtitle="Top actions to raise HomeScore, reduce exposure, and increase confidence quality."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
            <div className="space-y-3">
              {improvementActions.length > 0 ? (
                improvementActions.map((action) => (
                  <div key={action.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                      <Badge variant="outline" className={urgencyBadgeClass(action.urgency)}>{action.urgency}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <div>
                        <p className="text-slate-500">Point gain</p>
                        <p className="font-medium text-slate-900">+{action.projectedPointGain}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Risk reduction</p>
                        <p className="font-medium text-slate-900">{formatCurrency(action.projectedRiskReduction)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Cost</p>
                        <p className="font-medium text-slate-900">{formatCurrency(action.estimatedCostToImprove)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Confidence gain</p>
                        <p className="font-medium text-slate-900">{action.estimatedConfidenceGain}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Effort: {action.effort}</p>
                    {action.actionHref ? (
                      <Link
                        href={action.actionHref}
                        className="mt-2 inline-flex items-center text-xs text-slate-900 hover:underline"
                        onClick={() => trackEvent("IMPROVEMENT_ACTION_CLICKED", "improvement-plan", { actionId: action.id })}
                      >
                        Start action
                      </Link>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No improvement actions are available yet.</p>
              )}
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Potential New Score</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{report.improvementPlan?.potentialNewScore ?? report.homeScore}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Potential Money At Risk Reduction</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">
                  {formatCurrency(report.improvementPlan?.potentialMoneyAtRiskReduction)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Prioritize one verification action and one risk-reduction action first for the fastest score and trust uplift.
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="methodology-footer"
          title="Report Footer / Methodology"
          subtitle="How HomeScore is computed, what inputs are used, and where estimated values may appear."
          onToggle={onSectionToggle}
          defaultOpen={false}
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p>{report.methodology?.summary}</p>
            <div>
              <p className="mb-1 font-semibold text-slate-900">Inputs used</p>
              <ul className="space-y-1">
                {(report.methodology?.inputsUsed || []).map((input) => (
                  <li key={input} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 text-slate-500" />
                    <span>{input}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-slate-900">Disclosures</p>
              <ul className="space-y-1">
                {(report.methodology?.disclosures || []).map((disclosure) => (
                  <li key={disclosure} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
                    <span>{disclosure}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Data Source Readiness</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(report.methodology?.dataSources || []).map((source) => (
                  <div key={source.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs text-slate-700">{source.label}</span>
                    <Badge variant="outline" className={source.status === "AVAILABLE" ? "text-emerald-700 border-emerald-200" : source.status === "PARTIAL" ? "text-amber-700 border-amber-200" : "text-slate-700 border-slate-200"}>
                      {source.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Intended use: {report.methodology?.intendedUse}
            </p>
          </div>
        </SectionCard>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="h-3.5 w-3.5" />
            HomeScore report optimized for homeowner mode today, with buyer/seller, certification, and share-link workflow support prepared in this architecture.
          </div>
          <div className="mt-2 flex items-center gap-2 text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" />
            Last generated {formatDate(report.generatedAt)}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
