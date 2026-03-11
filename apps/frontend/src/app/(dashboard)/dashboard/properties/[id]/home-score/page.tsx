"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ChevronRight,
  FileDown,
  FileText,
  Gauge,
  Hammer,
  Home,
  Link2,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  Share2,
  TrendingUp,
  Wrench,
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
  HomeScoreSystemHealthRow,
  HomeScoreTimelineEvent,
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

function formatConstantLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function confidenceBadgeClass(confidence: string) {
  if (confidence === "HIGH") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (confidence === "MEDIUM") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
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

function provenanceBadgeClass(provenance: string) {
  if (provenance === "VERIFIED" || provenance === "DOCUMENT_BACKED" || provenance === "PUBLIC_RECORD") {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  if (provenance === "INFERRED") return "bg-sky-100 text-sky-700 border-sky-200";
  if (provenance === "MISSING") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function gradeBadgeClass(grade: string) {
  if (grade === "A" || grade === "B") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (grade === "C") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
}

function systemStatusBadgeClass(status: string) {
  if (status === "Stable") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "High risk") return "bg-rose-100 text-rose-700 border-rose-200";
  if (status === "Pending data") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function normalizeSystemStatus(raw: string, grade: string, verification: string, projectedRiskHorizonMonths: number | null) {
  if (verification === "MISSING") return "Pending data";
  if (verification === "USER_REPORTED" || verification === "INFERRED") return "Needs verification";
  if (grade === "F" || (projectedRiskHorizonMonths !== null && projectedRiskHorizonMonths <= 12)) return "High risk";
  if (grade === "D") return "Needs inspection";
  if (grade === "C") return "Aging";
  if (grade === "B") return "Monitor";
  if (raw.toLowerCase().includes("inspect")) return "Needs inspection";
  return "Stable";
}

function systemStatusHeadline(status: string, grade: string, serviceWindow: string | null) {
  const serviceWindowLower = (serviceWindow || "").toLowerCase();
  if (serviceWindowLower.includes("at or beyond expected service life") || status === "High risk") return "Service life exceeded";
  if (status === "Needs inspection") return "Needs inspection";
  if (status === "Needs verification") return "Needs verification";
  if (status === "Pending data") return "Pending data";
  if (status === "Aging") return "Aging system";
  if (status === "Monitor") return "Monitor condition";
  if (grade === "A") return "Strong condition";
  return "Stable";
}

function gradeToneTextClass(grade: string) {
  if (grade === "A" || grade === "B") return "text-emerald-700";
  if (grade === "C") return "text-amber-700";
  return "text-rose-700";
}

function getLifecycleProgress(ageYears: number | null, serviceWindow: string | null) {
  if (ageYears === null || !serviceWindow) return null;
  const lower = serviceWindow.toLowerCase();
  if (lower.includes("at or beyond expected service life")) return 100;
  const remainingMatch = lower.match(/(\d+)\s+years?\s+remaining/);
  if (!remainingMatch) return null;
  const remainingYears = Number.parseInt(remainingMatch[1], 10);
  if (!Number.isFinite(remainingYears) || remainingYears < 0) return null;
  const totalYears = ageYears + remainingYears;
  if (totalYears <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((ageYears / totalYears) * 100)));
}

function lifecycleBarClass(progress: number | null) {
  if (progress === null) return "bg-slate-300";
  if (progress >= 90) return "bg-rose-400";
  if (progress >= 70) return "bg-amber-400";
  return "bg-emerald-400";
}

function systemRowSeverity(status: string, projectedRiskHorizonMonths: number | null) {
  if (status === "High risk" || (projectedRiskHorizonMonths !== null && projectedRiskHorizonMonths <= 6)) return "HIGH";
  if (
    ["Aging", "Needs inspection", "Needs verification"].includes(status) ||
    (projectedRiskHorizonMonths !== null && projectedRiskHorizonMonths <= 24)
  ) {
    return "MEDIUM";
  }
  return "LOW";
}

function systemRowSurfaceClass(severity: "HIGH" | "MEDIUM" | "LOW") {
  if (severity === "HIGH") return "bg-rose-50/35 hover:bg-rose-50/55";
  if (severity === "MEDIUM") return "bg-amber-50/25 hover:bg-amber-50/45";
  return "hover:bg-slate-50/60";
}

function systemAccentClass(severity: "HIGH" | "MEDIUM" | "LOW") {
  if (severity === "HIGH") return "border-rose-300";
  if (severity === "MEDIUM") return "border-amber-300";
  return "border-slate-200";
}

function verificationPillClass(provenance: string) {
  if (provenance === "VERIFIED" || provenance === "DOCUMENT_BACKED" || provenance === "PUBLIC_RECORD") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (provenance === "INFERRED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (provenance === "MISSING") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function riskHorizonPresentation(projectedRiskHorizonMonths: number | null) {
  if (!projectedRiskHorizonMonths) {
    return {
      value: "N/A",
      detail: "No horizon available",
      tone: "text-slate-600",
    };
  }
  if (projectedRiskHorizonMonths <= 6) {
    return {
      value: `${projectedRiskHorizonMonths} months`,
      detail: "Near-term window",
      tone: "text-rose-700",
    };
  }
  if (projectedRiskHorizonMonths <= 24) {
    return {
      value: `${projectedRiskHorizonMonths} months`,
      detail: "Watch window",
      tone: "text-amber-700",
    };
  }
  return {
    value: `${projectedRiskHorizonMonths} months`,
    detail: "Longer horizon",
    tone: "text-slate-700",
  };
}

function shortenSystemAction(nextAction: string) {
  const cleaned = nextAction.replace(/\.$/, "").trim();
  const inspectionMatch = cleaned.match(/(?:prioritize\s+)?inspection\s+for\s+(.+)/i);
  if (inspectionMatch?.[1]) {
    return `Inspect ${inspectionMatch[1]}`;
  }
  const upkeepMatch = cleaned.match(/continue\s+scheduled\s+upkeep\s+for\s+(.+)/i);
  if (upkeepMatch?.[1]) {
    return `Continue ${upkeepMatch[1]} upkeep`;
  }
  const verifyMatch = cleaned.match(/verify\s+(.+)/i);
  if (verifyMatch?.[1]) {
    return `Verify ${verifyMatch[1]}`;
  }
  return cleaned;
}

function systemHealthIcon(key: HomeScoreSystemHealthRow["key"]) {
  switch (key) {
    case "ROOF":
      return Home;
    case "SAFETY_SYSTEMS":
      return Shield;
    default:
      return Wrench;
  }
}

function formatPropertyType(value?: string | null) {
  if (!value) return null;
  return formatConstantLabel(value);
}

function benchmarkDeltaLabel(thisScore: number, benchmarkScore: number) {
  const delta = Math.round((thisScore - benchmarkScore) * 10) / 10;
  if (delta === 0) return "At benchmark";
  return `${delta > 0 ? "+" : ""}${delta} vs benchmark`;
}

function reportStatusBadgeClass(status: "Current" | "Refresh recommended" | "Limited coverage" | "Updating") {
  if (status === "Current") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "Updating") return "bg-sky-100 text-sky-700 border-sky-200";
  if (status === "Limited coverage") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function formatTimelineEventDate(event: HomeScoreTimelineEvent) {
  if (event.datePrecision === "YEAR") return event.year ? String(event.year) : "Year unavailable";
  return formatDate(event.occurredAt);
}

function timelineEventYearAnchor(event: HomeScoreTimelineEvent) {
  if (event.year) return String(event.year);
  if (!event.occurredAt) return null;
  const occurredDate = new Date(event.occurredAt);
  if (Number.isNaN(occurredDate.getTime())) return null;
  return String(occurredDate.getFullYear());
}

function timelineNodeClass(provenance: HomeScoreTimelineEvent["provenance"]) {
  if (provenance === "VERIFIED" || provenance === "DOCUMENT_BACKED" || provenance === "PUBLIC_RECORD") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (provenance === "INFERRED") return "border-sky-300 bg-sky-50 text-sky-700";
  if (provenance === "MISSING") return "border-slate-300 bg-slate-100 text-slate-500";
  return "border-slate-300 bg-white text-slate-600";
}

function resolveTimelineEventIcon(event: HomeScoreTimelineEvent) {
  const haystack = `${event.eventType} ${event.title} ${event.summary || ""}`.toLowerCase();

  if (haystack.includes("constructed") || haystack.includes("built")) return Home;
  if (haystack.includes("inspection") || haystack.includes("verification")) return ClipboardCheck;
  if (haystack.includes("insurance") || haystack.includes("warranty")) return Shield;
  if (haystack.includes("permit") || haystack.includes("document") || haystack.includes("public record")) return FileText;
  if (haystack.includes("remodel") || haystack.includes("improvement") || haystack.includes("upgrade")) return Hammer;
  if (haystack.includes("appliance") || haystack.includes("purchase")) return Package;
  if (haystack.includes("claim") || haystack.includes("incident")) return AlertTriangle;
  if (
    haystack.includes("roof") ||
    haystack.includes("hvac") ||
    haystack.includes("water heater") ||
    haystack.includes("plumbing") ||
    haystack.includes("electrical") ||
    haystack.includes("service") ||
    haystack.includes("maintenance") ||
    haystack.includes("repair")
  ) {
    return Wrench;
  }
  return null;
}

function timelineEventTimestamp(event: HomeScoreTimelineEvent) {
  if (event.datePrecision === "YEAR" && typeof event.year === "number") {
    return Date.UTC(event.year, 0, 1);
  }
  if (event.occurredAt) {
    const parsed = new Date(event.occurredAt).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function canonicalPurchaseTimelineKey(event: HomeScoreTimelineEvent) {
  if (event.eventType?.toUpperCase() !== "PURCHASE") return null;
  if (!/^purchased:\s*/i.test(event.title || "")) return null;

  const normalized = String(event.title || "")
    .toLowerCase()
    .replace(/^purchased:\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return null;

  if (/dish\s*washer/.test(normalized)) return "appliance:DISHWASHER";
  if (/refrigerator|fridge|freezer/.test(normalized)) return "appliance:REFRIGERATOR";
  if (/washer|dryer|laundry|washing\s*machine/.test(normalized)) return "appliance:WASHER_DRYER";
  if (/microwave|hood|vent/.test(normalized)) return "appliance:MICROWAVE_HOOD";
  if (/oven|range|stove|cooktop/.test(normalized)) return "appliance:OVEN_RANGE";
  if (/water\s*softener|softener/.test(normalized)) return "appliance:WATER_SOFTENER";

  return `purchase:${normalized}`;
}

function dedupePurchaseTimelineEvents(events: HomeScoreTimelineEvent[]) {
  const passthrough: HomeScoreTimelineEvent[] = [];
  const grouped = new Map<string, HomeScoreTimelineEvent[]>();

  events.forEach((event) => {
    const key = canonicalPurchaseTimelineKey(event);
    if (!key) {
      passthrough.push(event);
      return;
    }
    const bucket = grouped.get(key) || [];
    bucket.push(event);
    grouped.set(key, bucket);
  });

  const collapsed = Array.from(grouped.values()).map((group) => {
    if (group.length === 1) return group[0];

    const sorted = [...group].sort((a, b) => timelineEventTimestamp(a) - timelineEventTimestamp(b));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const preferred = sorted.find((event) => event.verified) || first;
    const firstLabel = formatTimelineEventDate(first);
    const lastLabel = formatTimelineEventDate(last);
    const rangeLabel = firstLabel === lastLabel ? firstLabel : `${firstLabel} to ${lastLabel}`;
    const consolidatedSummary = `Consolidated ${group.length} similar purchase entries (${rangeLabel}).`;

    return {
      ...preferred,
      id: `dedup-${first.id}`,
      occurredAt: first.occurredAt,
      year: first.year,
      datePrecision: first.datePrecision,
      summary: [preferred.summary, consolidatedSummary].filter(Boolean).join(" "),
    };
  });

  return [...passthrough, ...collapsed].sort((a, b) => timelineEventTimestamp(a) - timelineEventTimestamp(b));
}

function SectionCard(props: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  defaultOpen?: boolean;
  onToggle?: (sectionId: string, open: boolean) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { id, title, subtitle, icon, defaultOpen = true, onToggle, action, children } = props;

  return (
    <details
      open={defaultOpen}
      className="group border border-slate-200/90 bg-white"
      onToggle={(event) => {
        const details = event.currentTarget;
        onToggle?.(id, details.open);
      }}
    >
      <summary className="list-none cursor-pointer px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={id} className="text-base font-semibold tracking-tight text-slate-950">
              {icon ? <span className="mr-2">{icon}</span> : null}
              {title}
            </h2>
            {subtitle ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {action}
            <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-200/80 px-6 py-5">{children}</div>
    </details>
  );
}

function ScoreRing({ score, inverse = false }: { score: number; inverse?: boolean }) {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 64;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalized / 100) * circumference;
  const trackStroke = inverse ? "rgba(255,255,255,0.18)" : "#cbd5e1";
  const valueStroke = inverse ? "rgba(255,255,255,0.98)" : "#0f172a";
  const valueClass = inverse ? "text-white" : "text-slate-950";
  const labelClass = inverse ? "text-slate-200" : "text-slate-500";

  return (
    <div className="relative h-44 w-44">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke={trackStroke} strokeWidth={stroke} />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={valueStroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cx("text-5xl font-semibold leading-none tracking-tight tabular-nums", valueClass)}>{normalized}</div>
        <div className={cx("mt-1 text-[11px] font-medium uppercase tracking-[0.1em]", labelClass)}>/100</div>
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
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
    trackEvent("SHARE_CARD_VIEWED", "share-card", {
      homeScore: report.homeScore,
      grade: report.executiveSummary?.grade,
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
  const timelineEvents = useMemo(
    () => dedupePurchaseTimelineEvents(report?.timeline?.events || []),
    [report?.timeline?.events]
  );
  const tieredTimeline = useMemo(() => {
    const tierOneKeywords = [
      "roof",
      "hvac",
      "water heater",
      "plumbing",
      "electrical",
      "inspection",
      "claim",
      "permit",
      "insurance",
      "warranty",
      "remodel",
      "constructed",
      "verification",
    ];

    const isTierOne = (event: (typeof timelineEvents)[number]) => {
      const type = event.eventType?.toUpperCase();
      if (["REPAIR", "MAINTENANCE", "CLAIM", "IMPROVEMENT", "INSPECTION", "MILESTONE"].includes(type)) {
        return true;
      }
      const haystack = `${event.title} ${event.summary || ""}`.toLowerCase();
      return tierOneKeywords.some((keyword) => haystack.includes(keyword));
    };

    const tierOne: typeof timelineEvents = [];
    const tierTwo: typeof timelineEvents = [];
    timelineEvents.forEach((event) => {
      if (isTierOne(event)) {
        tierOne.push(event);
      } else {
        tierTwo.push(event);
      }
    });

    const groupedTierTwo = tierTwo.reduce<Record<string, typeof timelineEvents>>((acc, event) => {
      const title = event.title.toLowerCase();
      const isAppliancePurchase =
        event.eventType?.toUpperCase() === "PURCHASE" &&
        /(dish\s*washer|refrigerator|fridge|washer|dryer|laundry|microwave|oven|range|stove|cooktop|water\s*softener|freezer)/.test(
          title
        );
      const key = isAppliancePurchase || title.includes("appliance")
        ? "Appliance additions"
        : title.includes("document") || title.includes("upload")
          ? "Document uploads"
          : "Supporting events";
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});

    return { tierOne, tierTwo, groupedTierTwo };
  }, [timelineEvents]);
  const tierOneTimelineRows = useMemo(() => {
    let previousYearAnchor: string | null = null;
    return tieredTimeline.tierOne.map((event) => {
      const yearAnchor = timelineEventYearAnchor(event);
      const showYearAnchor = Boolean(yearAnchor && yearAnchor !== previousYearAnchor);
      if (yearAnchor) {
        previousYearAnchor = yearAnchor;
      }
      return {
        event,
        yearAnchor,
        showYearAnchor,
        dateLabel: formatTimelineEventDate(event),
        icon: resolveTimelineEventIcon(event),
      };
    });
  }, [tieredTimeline.tierOne]);
  const supportingTimelineSummary = useMemo(
    () =>
      Object.entries(tieredTimeline.groupedTierTwo)
        .map(([label, events]) => `${label} (${events.length})`)
        .join(" • "),
    [tieredTimeline.groupedTierTwo]
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
  const financialExposure: HomeScoreFinancialExposure = report.financialExposure;
  const benchmarkItems: HomeScoreBenchmarkItem[] = report.benchmarks?.sources || [];
  const improvementActions: HomeScoreImprovementAction[] = report.improvementPlan?.actions || [];
  const availableBenchmarkItems = benchmarkItems.filter((item) => item.available);
  const unavailableBenchmarkCount = benchmarkItems.length - availableBenchmarkItems.length;
  const allBenchmarksUnavailable = benchmarkItems.length === 0 || availableBenchmarkItems.length === 0;

  const rankedNegativeDrivers = drivers
    .filter((driver) => driver.scoreImpact < 0)
    .sort((a, b) => Math.abs(b.scoreImpact) - Math.abs(a.scoreImpact));
  const rankedPositiveDrivers = drivers
    .filter((driver) => driver.scoreImpact > 0)
    .sort((a, b) => Math.abs(b.scoreImpact) - Math.abs(a.scoreImpact));

  const radarInsight = radar?.weakestArea
    ? `${radar.weakestArea} is currently the primary limitation on your HomeScore. Improving this axis should produce the clearest report-level uplift.`
    : "Radar insights will become sharper as additional verified records are added.";
  const driversInsight =
    rankedNegativeDrivers.length > 0
      ? `Most score drag is concentrated in ${rankedNegativeDrivers
          .slice(0, 2)
          .map((driver) => driver.title.toLowerCase())
          .join(" and ")}.`
      : "Current drivers are mostly neutral or positive, with limited downward pressure on score.";
  const systemHealthInsight = (() => {
    const rows = report.systemHealth || [];
    const urgentCount = rows.filter((row) => (row.projectedRiskHorizonMonths ?? 999) <= 12).length;
    const agingCount = rows.filter((row) => ["C", "D", "F"].includes(row.grade)).length;
    if (urgentCount > 0) {
      return `${urgentCount} system${urgentCount > 1 ? "s are" : " is"} in a near-term risk window. Prioritize inspection and verification for those lines first.`;
    }
    if (agingCount > 0) {
      return `${agingCount} system${agingCount > 1 ? "s are" : " is"} aging into higher-risk service windows.`;
    }
    return "Most major systems are currently stable with no immediate high-risk horizon.";
  })();
  const financialInsight = (() => {
    const topLines = [...(financialExposure.lines || [])]
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 2)
      .map((line) => line.label);
    if (topLines.length === 0) {
      return "Exposure lines will become more precise as additional system and cost evidence is added.";
    }
    return `${topLines.join(" and ")} currently account for the largest share of projected exposure. Addressing one top line first may materially reduce 3-year risk.`;
  })();
  const verificationInsight = (() => {
    const trust = report.trustAndVerification;
    if (!trust) return "Confidence interpretation is not available yet.";
    if (trust.userReportedPct >= 45) {
      return "Coverage is broad, but trust is still limited by a heavy user-reported mix. Adding invoices, reports, and inspection records will improve verification quality.";
    }
    if (trust.verifiedPct >= 55) {
      return "Verification quality is strong. Continue adding document-backed records to maintain high trust confidence.";
    }
    return "Verification is mixed across sources. Prioritize one documentation action to improve report trustworthiness.";
  })();
  const improvementInsight =
    "Start with one verification action and one risk-reduction action for the fastest trust and score uplift.";
  const reportStatus = (() => {
    const generatedIso = meta?.generatedDate || report.generatedAt || null;
    const generatedDate = generatedIso ? new Date(generatedIso) : null;
    const hasGeneratedDate = Boolean(generatedDate && !Number.isNaN(generatedDate.getTime()));
    const staleMs = 1000 * 60 * 60 * 24 * 90;
    const isStale = hasGeneratedDate
      ? Date.now() - (generatedDate as Date).getTime() > staleMs
      : true;
    const confidenceLevel = meta?.confidenceLevel || report.trustAndVerification?.confidenceLevel || report.confidence || "MEDIUM";
    const dataCoveragePct = meta?.dataCoveragePercentage ?? report.trustAndVerification?.dataCoveragePct ?? 0;

    const status: "Current" | "Refresh recommended" | "Limited coverage" | "Updating" =
      refreshMutation.isPending || reportQuery.isFetching
        ? "Updating"
        : dataCoveragePct < 55
          ? "Limited coverage"
          : !hasGeneratedDate || isStale || confidenceLevel === "LOW"
            ? "Refresh recommended"
            : confidenceLevel === "MEDIUM" && dataCoveragePct < 70
              ? "Refresh recommended"
              : "Current";

    return status;
  })();
  const verificationSummary = (meta?.verificationStatusSummary || "In progress").replace(/^Verification status:\s*/i, "");
  const verificationSummaryTone =
    (report.trustAndVerification?.verifiedPct ?? 0) >= 55
      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
      : (report.trustAndVerification?.verifiedPct ?? 0) >= 35
        ? "border-amber-200 bg-amber-100 text-amber-700"
        : "border-rose-200 bg-rose-100 text-rose-700";

  const copyShareLink = async () => {
    trackEvent("SHARE_ACTION_CLICKED", "share-card", { action: "copy_link" });
    try {
      const shareUrl = `${window.location.origin}/dashboard/properties/${propertyId}/home-score`;
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      trackEvent("SHARE_LINK_COPIED", "share-card", { destination: "clipboard" });
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch (error) {
      setCopyState("error");
      trackEvent("SHARE_LINK_COPIED", "share-card", { destination: "clipboard", status: "failed" });
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  const onSectionToggle = (sectionId: string, open: boolean) => {
    trackEvent(open ? "SECTION_EXPANDED" : "SECTION_COLLAPSED", sectionId);
  };

  return (
    <DashboardShell className="pb-8 print:bg-white">
      <div className="space-y-5">
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

        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Report Header</p>
            <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-slate-950">
              {meta?.reportTitle || "Contract-to-Cozy Certified HomeScore Report"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              {meta?.propertyAddress || `${propertyQuery.data?.address || ""}, ${propertyQuery.data?.city || ""}`}
            </p>
          </div>
          <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Report ID", value: meta?.reportId || "Pending" },
              { label: "Generated", value: formatDate(meta?.generatedDate) },
              { label: "Prepared For", value: meta?.preparedFor || "Property Owner" },
              { label: "Data Coverage", value: `${meta?.dataCoveragePercentage ?? report.trustAndVerification?.dataCoveragePct ?? 0}%` },
              { label: "Property Type", value: formatPropertyType(meta?.propertyType) || formatPropertyType(propertyQuery.data?.propertyType) || "Not available" },
              { label: "Year Built", value: meta?.yearBuilt || propertyQuery.data?.yearBuilt || "Not available" },
            ].map((item) => (
              <div key={item.label} className="border-t border-slate-200 px-6 py-3 sm:[&:nth-child(odd)]:border-r lg:[&:not(:nth-child(3n))]:border-r">
                <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={reportStatusBadgeClass(reportStatus)}>
                Report status: {reportStatus}
              </Badge>
              <Badge variant="outline" className={confidenceBadgeClass(meta?.confidenceLevel || report.confidence)}>
                Confidence: {formatConstantLabel(meta?.confidenceLevel || report.confidence)}
              </Badge>
              <Badge variant="outline" className={verificationSummaryTone}>
                Verification: {verificationSummary}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">Version {meta?.reportVersion || "2.0"}</Badge>
            </div>
          </div>
        </section>

        <Card className="border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 text-slate-50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">📊 Executive Summary</CardTitle>
            <CardDescription className="text-sm text-slate-300">
              Overall home health, financial exposure, and verification confidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[210px,1fr]">
            <div className="flex flex-col items-center gap-3">
              <ScoreRing score={executive?.homeScore ?? report.homeScore} inverse />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cx("bg-white/10 text-white border-white/20", gradeBadgeClass(executive?.grade || "F"))}>
                  Grade {executive?.grade || "-"}
                </Badge>
                <Badge className="bg-white/10 text-white border-white/20">{formatConstantLabel(executive?.ratingTier || "")}</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-300">Money at Risk (3 years)</p>
                  <p className="mt-1 text-[2rem] font-semibold leading-none text-white">
                    {formatCurrency(executive?.moneyAtRiskHeadline ?? financialExposure?.headlineMoneyAtRisk)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">Estimated repair exposure</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-300">Confidence</p>
                  <p className="mt-1 text-xl font-semibold leading-none text-white">{formatConstantLabel(executive?.confidenceLevel || report.confidence)}</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-300">Value Protection</p>
                  <p className="mt-1 text-xl font-semibold leading-none text-white">{executive?.valueProtectionScore ?? report.homeScore}/100</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-slate-300">Weekly Delta</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xl font-semibold leading-none text-white">
                    <TrendingUp className="h-4 w-4" />
                    {report.deltaFromPreviousWeek === null ? "No change" : `${report.deltaFromPreviousWeek > 0 ? "+" : ""}${report.deltaFromPreviousWeek.toFixed(1)}`}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-100">HomeScore trend</p>
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
                {trendPoints.length > 1 ? (
                  <div className="rounded-lg border border-white/10 bg-white px-2 py-1 text-slate-900">
                    <ScoreTrendChart points={trendPoints} ariaLabel="HomeScore trend" />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/25 bg-white/5 p-3 text-sm text-slate-200">
                    Weekly score snapshots will appear as more report cycles are collected. As your home data evolves, trend and improvement history will become visible here.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">HomeScore Snapshot</p>
              <p className="mt-1.5 text-sm text-slate-600">{meta?.propertyAddress || propertyQuery.data?.address}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className={gradeBadgeClass(executive?.grade || "F")}>
                  HomeScore: {executive?.homeScore ?? report.homeScore}/100
                </Badge>
                <Badge variant="outline" className={gradeBadgeClass(executive?.grade || "F")}>
                  Grade: {executive?.grade || "-"}
                </Badge>
                <Badge variant="outline" className={urgencyBadgeClass(financialExposure.headlineMoneyAtRisk > 15000 ? "HIGH" : financialExposure.headlineMoneyAtRisk > 8000 ? "MEDIUM" : "LOW")}>
                  Money at Risk: {formatCurrency(financialExposure.headlineMoneyAtRisk)}
                </Badge>
                <Badge variant="outline" className={confidenceBadgeClass(report.trustAndVerification?.confidenceLevel || report.confidence)}>
                  Confidence: {formatConstantLabel(report.trustAndVerification?.confidenceLevel || report.confidence)}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
                  Coverage: {report.trustAndVerification?.dataCoveragePct ?? meta?.dataCoveragePercentage ?? 0}%
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
                  Generated: {formatDate(meta?.generatedDate || report.generatedAt)}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  trackEvent("SHARE_ACTION_CLICKED", "share-card", { action: "open_reports" });
                  router.push(`/dashboard/properties/${propertyId}/reports`);
                }}
              >
                <Share2 className="mr-2 h-4 w-4" /> Share report
              </Button>
              <Button variant="outline" size="sm" onClick={copyShareLink}>
                <Copy className="mr-2 h-4 w-4" />
                {copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed" : "Copy share link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  trackEvent("PDF_EXPORT_CLICKED", "share-card", { action: "export" });
                  router.push(`/dashboard/properties/${propertyId}/reports`);
                }}
              >
                <FileDown className="mr-2 h-4 w-4" /> Download PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  trackEvent("PDF_EXPORT_CLICKED", "share-card", { action: "print" });
                  window.print();
                }}
              >
                <Link2 className="mr-2 h-4 w-4" /> Print
              </Button>
            </div>
          </div>
        </section>

        <SectionCard
          id="home-protection-radar"
          title="Home Protection Radar"
          icon="🛡"
          subtitle="Signature view across maintenance, insurance, safety, financial, and weather resilience."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-5 lg:grid-cols-[360px,1fr]">
            <RadarChart axes={radar?.axes || []} />
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{radarInsight}</p>
                <p className="mt-1">
                  {radar?.strongestArea
                    ? `${radar.strongestArea} is currently your strongest protection area.`
                    : "Strongest-area confidence will improve with more verified evidence."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(radar?.axes || []).map((axis) => (
                  <div key={axis.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-900">{axis.label}</p>
                      <Badge variant="outline" className={confidenceBadgeClass(axis.confidence)}>
                        Confidence: {formatConstantLabel(axis.confidence)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{axis.score}</p>
                    <p className="text-xs text-slate-600">{axis.estimated ? "Estimated from partial inputs" : "Measured from verified inputs"}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
          icon="⚠"
          subtitle="Ranked contributors with explicit score impact and financial relevance."
          onToggle={onSectionToggle}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{driversInsight}</p>
              <p className="mt-1">Top drivers below combine score impact, financial exposure, and data confidence.</p>
            </div>
            {drivers.length > 0 ? (
              <div className="space-y-4">
                {rankedNegativeDrivers.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Top negative drivers</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {rankedNegativeDrivers.map((driver) => (
                        <div key={driver.id} className="border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{driver.title}</p>
                            <Badge variant="outline" className="border-rose-200 bg-rose-100 text-rose-700">
                              Score impact: {driver.scoreImpact} pts
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{driver.explanation}</p>
                          <div className="mt-3 grid gap-2 text-xs text-slate-600">
                            <p><span className="font-medium text-slate-900">Financial impact:</span> {formatCurrency(driver.financialImpact)}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={confidenceBadgeClass(driver.confidence)}>
                                Confidence: {formatConstantLabel(driver.confidence)}
                              </Badge>
                              <Badge variant="outline" className={provenanceBadgeClass(driver.provenance)}>
                                Source: {formatConstantLabel(driver.provenance)}
                              </Badge>
                            </div>
                          </div>
                          {driver.actionHref ? (
                            <Link
                              href={driver.actionHref}
                              className="mt-3 inline-flex items-center text-sm text-slate-900 hover:underline"
                              onClick={() => trackEvent("IMPROVEMENT_ACTION_CLICKED", "score-drivers", { driverId: driver.id })}
                            >
                              Take action <ChevronRight className="ml-1 h-3 w-3" />
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {rankedPositiveDrivers.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Positive contributors</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {rankedPositiveDrivers.slice(0, 3).map((driver) => (
                        <div key={driver.id} className="border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{driver.title}</p>
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-700">
                              Score impact: +{driver.scoreImpact} pts
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{driver.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600">No score driver details available yet.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          id="home-timeline"
          title="Home Timeline"
          icon="🕒"
          subtitle="CARFAX-style chronology of property milestones, maintenance, and verification events."
          onToggle={onSectionToggle}
        >
          {timelineEvents.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                Tier 1 property-level events are shown first. Lower-signal events are grouped to keep chronology scannable without losing history.
              </div>
              <ol className="space-y-0">
                {tierOneTimelineRows.map(({ event, dateLabel, icon: EventIcon, showYearAnchor, yearAnchor }, index) => {
                  const hasSupportingCluster = tieredTimeline.tierTwo.length > 0;
                  const isLastVisibleEvent = index === tierOneTimelineRows.length - 1 && !hasSupportingCluster;
                  const showSpine = !isLastVisibleEvent;

                  return (
                  <li
                    key={event.id}
                    className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pb-6 last:pb-0 print:break-inside-avoid"
                  >
                    <div className="relative flex justify-center">
                      {showSpine ? <span aria-hidden className="absolute top-6 bottom-[-1.65rem] w-px bg-slate-200" /> : null}
                      <span
                        className={cx(
                          "relative z-10 mt-1 flex h-5 w-5 items-center justify-center rounded-full border",
                          timelineNodeClass(event.provenance)
                        )}
                        aria-hidden
                      >
                        {EventIcon ? (
                          <EventIcon className="h-3 w-3" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </span>
                    </div>
                    <div
                      className={cx("min-w-0 pb-5", !isLastVisibleEvent && "border-b border-slate-200/70")}
                      onClick={() => trackEvent("TIMELINE_INTERACTION", "home-timeline", { eventId: event.id })}
                    >
                      {showYearAnchor ? (
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{yearAnchor}</p>
                      ) : null}
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-5 text-slate-900">{event.title}</p>
                          {event.summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{event.summary}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs md:justify-end">
                          <Badge variant="outline" className={cx("text-[11px] font-medium", provenanceBadgeClass(event.provenance))}>
                            {formatConstantLabel(event.provenance)}
                          </Badge>
                          <span className="text-xs text-slate-500">{dateLabel}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                )})}
              </ol>
              {tieredTimeline.tierTwo.length > 0 ? (
                <div className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pt-1 print:break-inside-avoid">
                  <div className="relative flex justify-center">
                    <span className="relative z-10 mt-1 h-4 w-4 rounded-full border border-dashed border-slate-300 bg-slate-100" aria-hidden />
                  </div>
                  <details
                    className="group rounded-lg border border-slate-200/80 bg-slate-50/70"
                    onToggle={(event) =>
                      trackEvent("TIMELINE_GROUP_EXPANDED", "home-timeline", {
                        open: event.currentTarget.open,
                        groups: Object.keys(tieredTimeline.groupedTierTwo),
                      })
                    }
                  >
                    <summary className="list-none cursor-pointer px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            Supporting timeline events ({tieredTimeline.tierTwo.length})
                          </p>
                          {supportingTimelineSummary ? (
                            <p className="mt-1 text-xs text-slate-600">{supportingTimelineSummary}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                      </div>
                    </summary>
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="space-y-3">
                        {Object.entries(tieredTimeline.groupedTierTwo).map(([groupLabel, events]) => (
                          <div key={groupLabel} className="rounded-md border border-slate-200/70 bg-white px-3 py-2.5">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                              {groupLabel} ({events.length})
                            </p>
                            <ul className="mt-2 space-y-2">
                              {events.map((event) => (
                                <li key={event.id} className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                  <span className="min-w-0 truncate">{event.title}</span>
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="outline" className={cx("text-[10px] font-medium", provenanceBadgeClass(event.provenance))}>
                                      {formatConstantLabel(event.provenance)}
                                    </Badge>
                                    <span className="text-slate-500">{formatTimelineEventDate(event)}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
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
          icon="🔧"
          subtitle="Per-system grades, verification status, and next recommended actions."
          onToggle={onSectionToggle}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {systemHealthInsight}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <th className="py-2.5 pr-4">System</th>
                    <th className="py-2.5 pr-4">Health Status</th>
                    <th className="py-2.5 pr-4">Age / Lifecycle</th>
                    <th className="py-2.5 pr-4">Verification</th>
                    <th className="py-2.5 pr-4">Next Action</th>
                    <th className="py-2.5">Risk Horizon</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.systemHealth || []).map((row) => {
                    const normalizedStatus = normalizeSystemStatus(
                      row.statusLabel,
                      row.grade,
                      row.verification,
                      row.projectedRiskHorizonMonths
                    );
                    const statusHeadline = systemStatusHeadline(normalizedStatus, row.grade, row.serviceWindow);
                    const lifecycleProgress = getLifecycleProgress(row.ageYears, row.serviceWindow);
                    const severity = systemRowSeverity(normalizedStatus, row.projectedRiskHorizonMonths);
                    const shortAction = shortenSystemAction(row.nextRecommendedAction);
                    const horizon = riskHorizonPresentation(row.projectedRiskHorizonMonths);
                    const SystemIcon = systemHealthIcon(row.key);

                    return (
                      <tr key={row.key} className={cx("align-top border-b border-slate-100 transition-colors", systemRowSurfaceClass(severity))}>
                        <td className="py-3.5 pr-4">
                          <div className={cx("border-l-2 pl-3", systemAccentClass(severity))}>
                            <div className="flex items-center gap-2">
                              <SystemIcon className="h-4 w-4 text-slate-500" aria-hidden />
                              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                            </div>
                            {row.isPlaceholder ? <p className="mt-1 text-xs text-slate-500">Pending system data</p> : null}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className={cx("text-sm font-semibold", gradeToneTextClass(row.grade))}>
                            {row.grade} • {statusHeadline}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{normalizedStatus}</p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="text-sm font-medium text-slate-900">{row.ageYears === null ? "Unknown age" : `${row.ageYears} years`}</p>
                          {lifecycleProgress !== null ? (
                            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lifecycleProgress}>
                              <div
                                className={cx("h-1.5 rounded-full", lifecycleBarClass(lifecycleProgress))}
                                style={{ width: `${Math.max(8, lifecycleProgress)}%` }}
                              />
                            </div>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-500">{row.serviceWindow || "Service window unavailable"}</p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", verificationPillClass(row.verification))}>
                            {formatConstantLabel(row.verification)}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="text-sm font-medium text-slate-900" title={row.nextRecommendedAction}>
                            {shortAction}
                          </p>
                        </td>
                        <td className="py-3.5">
                          <p className={cx("text-sm font-semibold", horizon.tone)}>{horizon.value}</p>
                          <p className="mt-1 text-xs text-slate-500">{horizon.detail}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="financial-exposure"
          title="Financial Exposure Forecast"
          icon="💰"
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
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Money at Risk (3 years)</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{formatCurrency(financialExposure.headlineMoneyAtRisk)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Estimated exposure range: {formatCurrency(financialExposure.confidenceRangeLow)} - {formatCurrency(financialExposure.confidenceRangeHigh)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {financialInsight}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardDescription>12 months</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon12Months)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardDescription>3 years</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon3Years)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-2">
                    <CardDescription>5 years</CardDescription>
                    <CardTitle className="text-lg">{formatCurrency(financialExposure.horizon5Years)}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <div className="space-y-2">
                {(financialExposure.lines || []).map((line) => (
                  <div key={line.id} className="border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{line.label}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={urgencyBadgeClass(line.urgency)}>
                          Risk: {formatConstantLabel(line.urgency)}
                        </Badge>
                        <Badge variant="outline" className={confidenceBadgeClass(line.confidence)}>
                          Confidence: {formatConstantLabel(line.confidence)}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{formatCurrency(line.exposure)}</p>
                    <p className="text-xs text-slate-500">Source: {formatConstantLabel(line.provenance)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">What reduces this risk?</p>
              <ul className="mt-3 space-y-3">
                {(financialExposure.whatReducesRisk || []).map((item, index) => (
                  <li key={`${item.title}-${index}`} className="border border-slate-200 bg-white p-3">
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
          icon="✔"
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {verificationInsight}
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Confidence score</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{report.trustAndVerification?.confidenceScore}/100</p>
                <p className="mt-1 text-sm text-slate-600">{report.trustAndVerification?.explanation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(report.trustAndVerification?.badgeTaxonomy || []).map((badge) => (
                    <Badge key={badge} variant="outline" className={provenanceBadgeClass(badge)}>
                      {formatConstantLabel(badge)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Verification opportunities</p>
                <ul className="mt-3 space-y-2">
                  {(report.verificationOpportunities || []).slice(0, 5).map((opportunity) => (
                    <li key={opportunity.id} className="flex items-start justify-between gap-2 border border-slate-200 bg-white p-3">
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
              <div key={check.id} className="border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {check.status === "PASS" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <p className="text-sm font-semibold text-slate-900">{check.title}</p>
                  </div>
                  <Badge variant="outline" className={statusBadgeClass(check.status)}>
                    Integrity: {formatConstantLabel(check.status)}
                  </Badge>
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
          icon="📈"
          subtitle="How this home compares against available peer and market benchmark sources."
          onToggle={onSectionToggle}
        >
          {allBenchmarksUnavailable ? (
            <div className="border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-900">Benchmark data is not available yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Benchmark data will appear as comparable score snapshots become available. This report remains valid for direct property risk and trust analysis.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {availableBenchmarkItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50"
                  onClick={() => trackEvent("BENCHMARK_INTERACTION", "benchmark-comparison", { source: item.key, available: item.available })}
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{item.score}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {benchmarkDeltaLabel(report.benchmarks.thisHomeScore, item.score)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Sample size: {item.sampleSize ?? "Not available"}</p>
                </button>
              ))}
            </div>
          )}
          {unavailableBenchmarkCount > 0 && !allBenchmarksUnavailable ? (
            <p className="mt-3 text-xs text-slate-500">
              {unavailableBenchmarkCount} benchmark source{unavailableBenchmarkCount > 1 ? "s are" : " is"} still warming up.
            </p>
          ) : null}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">Interpretation:</span>{" "}
              {report.benchmarks?.interpretation || "Benchmark interpretation will populate as more comparable sources become available."}
            </p>
            <p className="mt-1">Percentile: {report.benchmarks?.percentile ? `${report.benchmarks.percentile}th` : "Not available yet"}</p>
          </div>
        </SectionCard>

        <SectionCard
          id="improvement-plan"
          title="Score Improvement Plan"
          icon="🚀"
          subtitle="Top actions to raise HomeScore, reduce exposure, and increase confidence quality."
          onToggle={onSectionToggle}
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {improvementInsight}
              </div>
              {improvementActions.length > 0 ? (
                improvementActions.map((action, index) => {
                  const labels = [
                    action.effort === "LOW" ? "Quick win" : null,
                    action.projectedPointGain >= 4 ? "High impact" : null,
                    action.estimatedConfidenceGain === "HIGH" ? "Trust boost" : null,
                    action.projectedRiskReduction >= 1500 ? "Risk reduction" : null,
                    action.urgency === "HIGH" ? "High priority" : null,
                    action.effort === "LOW" ? "Low effort" : action.effort === "MEDIUM" ? "Medium effort" : null,
                  ].filter(Boolean).slice(0, 3) as string[];

                  return (
                  <div key={action.id} className="border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                      <Badge variant="outline" className={urgencyBadgeClass(action.urgency)}>
                        Priority: {formatConstantLabel(action.urgency)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {labels.map((label) => (
                        <Badge key={`${action.id}-${label}`} variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
                          {label}
                        </Badge>
                      ))}
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
                        <p className="font-medium text-slate-900">{formatConstantLabel(action.estimatedConfidenceGain)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Rank #{index + 1} · Effort: {formatConstantLabel(action.effort)}
                    </p>
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
                )})
              ) : (
                <p className="text-sm text-slate-600">No improvement actions are available yet.</p>
              )}
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Potential New Score</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{report.improvementPlan?.potentialNewScore ?? report.homeScore}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Potential Money At Risk Reduction</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">
                  {formatCurrency(report.improvementPlan?.potentialMoneyAtRiskReduction)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                These projections reflect the action stack above. Completing the top-ranked two actions usually delivers the fastest combined score and risk outcome.
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
            <p className="text-slate-800">
              HomeScore combines property condition modeling, maintenance lifecycle analysis, financial exposure forecasting, documentation verification, and available public property signals.
            </p>
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
                    <Badge variant="outline" className={source.status === "AVAILABLE" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : source.status === "PARTIAL" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                      Source status: {formatConstantLabel(source.status)}
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
        </div>
      </div>
    </DashboardShell>
  );
}
