"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Gauge,
  Home,
  Info,
  Loader2,
  ShieldCheck,
  Wind,
  Wrench,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { navigateBackWithDashboardFallback } from "@/lib/navigation/backNavigation";

// ── Pure helpers ──────────────────────────────────────────────────────────────

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDisplayFactorName(factorName: string | undefined): string {
  const factor = String(factorName || "");
  if (factor === "Age Factor") return "Property Age (Year Built)";
  if (factor === "Systems Factor") return "Major Systems Health";
  if (factor === "Usage/Wear Factor") return "Occupancy & Wear";
  return factor || "Health insight";
}

const REQUIRED_ACTION_STATUSES = [
  "Needs attention",
  "Needs Review",
  "Needs Inspection",
  "Missing Data",
  "Needs Warranty",
];
const IN_PROGRESS_STATUSES = ["Action Pending"];
const WATCH_STATUSES = ["Aging", "Incomplete", "Partial", "Average", "Standard", "High Density"];
const POSITIVE_STATUSES = ["Excellent", "Good", "Modern", "Optimal", "Complete", "Low Density"];

type InsightImpact = "positive" | "negative" | "neutral";

function getInsightImpact(status: string | undefined): InsightImpact {
  const s = String(status || "");
  if (REQUIRED_ACTION_STATUSES.includes(s)) return "negative";
  if (IN_PROGRESS_STATUSES.includes(s) || WATCH_STATUSES.includes(s)) return "neutral";
  if (POSITIVE_STATUSES.includes(s)) return "positive";
  return "neutral";
}

function getUserFriendlyStatus(status: string | undefined): string {
  const map: Record<string, string> = {
    Modern: "Up to date",
    "Needs Review": "Review needed",
    "Needs Inspection": "Inspect soon",
    "Needs attention": "Action needed",
    "Needs Warranty": "Warranty needed",
    "Missing Data": "Data missing",
    "High Density": "High usage",
    "Low Density": "Light usage",
    "Action Pending": "In progress",
    Partial: "Partial",
    Incomplete: "Incomplete",
    Average: "Average",
    Standard: "Standard",
    Excellent: "Excellent",
    Good: "Good",
    Complete: "Complete",
    Aging: "Aging",
  };
  return map[String(status || "")] || String(status || "Unknown");
}

function getFactorDescription(factorName: string | undefined, condition: string | undefined): string {
  const factor = getDisplayFactorName(factorName);
  const cond = String(condition || "");
  const map: Record<string, Record<string, string>> = {
    "Property Age (Year Built)": {
      Excellent: "Recently built home — strong age signal",
      Good: "Home age is within a typical maintenance window",
      "Needs Review": "Older home based on year built — review recommended",
      "Needs attention": "Older home age is increasing maintenance risk",
      "Action Pending": "Age-related review is already in progress",
      "Missing Data": "Year built is missing — add it to improve score accuracy",
    },
    "Water Heater Age": {
      "Needs Review": "Approaching end of typical lifespan — review recommended",
      "Needs attention": "Past typical lifespan — replacement evaluation recommended",
      Aging: "Getting older — monitor for performance issues",
      Modern: "Recently installed — no action needed",
    },
    "Roof Age": {
      Aging: "Mid-life — inspect after next major storm",
      "Needs Review": "Past typical replacement window — inspection recommended",
      "Needs attention": "Past replacement window — inspection recommended",
      Modern: "Recently replaced — no action needed",
    },
    "HVAC Age": {
      Aging: "Aging system — schedule annual maintenance",
      "Needs Review": "Nearing end of service life — start planning replacement",
      "Needs attention": "Past typical service life — plan replacement",
      Modern: "Recently serviced — maintain current schedule",
    },
    "Occupancy & Wear": {
      "High Density":
        "More occupants for your home's size means faster wear on fixtures and systems",
      Average: "Occupancy is in a normal range — standard maintenance schedule applies",
      "Low Density": "Light occupancy — lower day-to-day wear on fixtures and systems",
    },
    "Major Systems Health": {
      Modern: "Heating, cooling, and water systems are up to date",
      Mixed: "Some major systems may need attention",
      Aging: "Major systems are showing age — schedule a review",
      Good: "Major systems are in good condition",
      Standard: "Major systems are functioning at a standard level",
    },
    "Safety Factor": {
      Complete: "Safety systems up to date",
      Incomplete: "Some safety items need attention",
      "Needs Review": "Safety review recommended",
    },
    "Documents Factor": {
      Complete: "Property documents are up to date",
      Incomplete: "Some documents are missing",
      "Missing Data": "Property documentation needed",
    },
  };
  return map[factor]?.[cond] ?? `${cond || "Status unavailable"} — review recommended`;
}

function getInsightStatusExplanation(status: string | undefined): string {
  const s = String(status || "");
  if (REQUIRED_ACTION_STATUSES.includes(s)) {
    return "This factor needs action. Resolving the recommended maintenance can improve your overall health score.";
  }
  if (IN_PROGRESS_STATUSES.includes(s)) {
    return "Work is already underway on this factor. Its contribution should improve once the task is completed.";
  }
  if (WATCH_STATUSES.includes(s)) {
    return "This factor is stable but should be monitored. Keeping records and periodic checks helps protect your score.";
  }
  if (POSITIVE_STATUSES.includes(s)) {
    return "This factor is currently a health strength and is helping hold up your overall score.";
  }
  return "This factor is under review. Add more property records to unlock a more precise score explanation.";
}

function getFactorActionHint(factorName: string | undefined, status: string | undefined): string | null {
  const factor = getDisplayFactorName(factorName);
  const s = String(status || "");
  const impact = getInsightImpact(status);
  if (impact !== "negative") return null;
  const hints: Record<string, Partial<Record<string, string>>> = {
    "Water Heater Age": {
      "Needs Review": "Schedule a water heater inspection — most cost $75–150.",
      "Needs attention": "Get replacement quotes — water heaters typically run $900–2,000 installed.",
      "Needs Inspection": "Book a plumbing inspection to assess the unit.",
    },
    "HVAC Age": {
      "Needs Review": "Schedule HVAC servicing — annual tune-ups typically run $80–150.",
      "Needs Inspection": "Have a technician assess the system before next season.",
      "Needs attention": "Start planning HVAC replacement — systems typically cost $5,000–12,000 installed.",
    },
    "Property Age (Year Built)": {
      "Needs Review": "Consider a general home inspection to surface age-related items — typically $300–500.",
      "Needs attention": "Schedule a comprehensive inspection to identify and prioritize risks.",
    },
    "Roof Age": {
      "Needs Review": "Get a roof inspection — many contractors offer free assessments.",
      "Needs attention": "Get 2–3 replacement quotes — costs typically range $8,000–20,000.",
    },
    "Safety Factor": {
      Incomplete: "Check smoke and CO detectors, fire extinguisher, and security system.",
      "Needs Review": "Confirm all safety devices are functional and within service date.",
    },
    "Documents Factor": {
      Incomplete: "Upload service records and inspection reports to improve your score.",
      "Missing Data": "Add property documents in the Vault to unlock full factor scoring.",
    },
  };
  return hints[factor]?.[s] ?? null;
}

function getFactorIcon(factorName: string | undefined) {
  const factor = String(factorName || "").toLowerCase();
  if (factor.includes("water heater") || factor.includes("boiler")) return Flame;
  if (factor.includes("hvac") || factor.includes("air") || factor.includes("vent")) return Wind;
  if (factor.includes("document") || factor.includes("record")) return FileText;
  if (factor.includes("age")) return Clock3;
  if (factor.includes("usage") || factor.includes("wear") || factor.includes("density")) return Gauge;
  if (factor.includes("safety") || factor.includes("warranty")) return ShieldCheck;
  if (factor.includes("system") || factor.includes("appliance")) return Wrench;
  if (factor.includes("structure") || factor.includes("roof") || factor.includes("exterior")) return Home;
  return Activity;
}

function getPrimaryCta(
  factorName: string | undefined,
  status: string | undefined,
  propertyId: string,
): { label: string; href: string } {
  const factor = getDisplayFactorName(factorName);
  const s = String(status || "");

  if (String(factorName || "").toLowerCase().includes("appliance")) {
    return {
      label: "View appliance status board",
      href: `/dashboard/properties/${propertyId}/status-board?category=APPLIANCE&condition=ACTION_NEEDED`,
    };
  }
  if (s === "Missing Data" || s === "Incomplete") {
    if (factor.includes("Document")) {
      return {
        label: "Upload property documents",
        href: `/dashboard/documents?propertyId=${propertyId}`,
      };
    }
    return {
      label: "Edit property details",
      href: `/dashboard/properties/${propertyId}/edit`,
    };
  }
  return {
    label: "View maintenance actions",
    href: `/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthInsight = {
  factor?: string;
  status?: string;
  score?: number;
  details?: string[];
};

type PropertyWithHealth = {
  name?: string | null;
  healthScore?: {
    totalScore?: unknown;
    insights?: unknown[];
  };
} | null;

function normalizeInsight(item: unknown): HealthInsight | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const factor = typeof raw.factor === "string" ? raw.factor : undefined;
  const status = typeof raw.status === "string" ? raw.status : undefined;
  const score = asNumber(raw.score) ?? 0;
  const rawDetails = Array.isArray(raw.details) ? raw.details : [];
  const details = rawDetails
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean);
  return { factor, status, score, details: details.length ? details : undefined };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HealthInsightFocusPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const factorSlug = (Array.isArray(params.factor) ? params.factor[0] : params.factor) as string;

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      try {
        const res = await api.getProperty(propertyId);
        return res.success ? res.data : null;
      } catch {
        return null;
      }
    },
    enabled: !!propertyId,
  });

  if (isLoading || !propertyId) {
    return (
      <DashboardShell>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  const raw = (property as PropertyWithHealth)?.healthScore?.insights ?? [];
  const allInsights = raw.map(normalizeInsight).filter((i): i is HealthInsight => i !== null);

  const insight = allInsights.find(
    (i) =>
      toSlug(getDisplayFactorName(i.factor)) === factorSlug ||
      toSlug(i.factor ?? "") === factorSlug,
  );

  const propertyName = (property as PropertyWithHealth)?.name || "this property";
  const displayName = getDisplayFactorName(insight?.factor);
  const status = insight?.status;
  const score = asNumber(insight?.score) ?? 0;
  const impact = getInsightImpact(status);
  const details = insight?.details ?? [];
  const factorDescription = getFactorDescription(insight?.factor, status);
  const statusExplanation = getInsightStatusExplanation(status);
  const actionHint = getFactorActionHint(insight?.factor, status);
  const primaryCta = getPrimaryCta(insight?.factor, status, propertyId);
  const friendlyStatus = getUserFriendlyStatus(status);
  const healthScoreHref = `/dashboard/properties/${propertyId}/health-score`;
  const FactorIcon = getFactorIcon(insight?.factor);

  const impactColors = {
    negative: {
      badge: "bg-red-100 text-red-700 border-red-200",
      icon: "bg-red-50 border-red-200 text-red-600",
      banner: "bg-red-50 border-red-200 text-red-800",
      AlertIcon: AlertTriangle,
    },
    neutral: {
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      icon: "bg-amber-50 border-amber-200 text-amber-600",
      banner: "bg-amber-50 border-amber-200 text-amber-800",
      AlertIcon: Info,
    },
    positive: {
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: "bg-emerald-50 border-emerald-200 text-emerald-600",
      banner: "bg-emerald-50 border-emerald-200 text-emerald-800",
      AlertIcon: CheckCircle2,
    },
  };
  const colors = impactColors[impact];

  if (!insight) {
    return (
      <DashboardShell>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <Button
            variant="ghost"
            className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground"
            onClick={() => navigateBackWithDashboardFallback(router)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <Activity className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-base font-semibold text-slate-700">Factor not found</p>
            <p className="text-sm text-slate-500">
              This health factor is not currently flagged for {propertyName}.
            </p>
            <Link href={healthScoreHref}>
              <Button variant="outline" size="sm" className="mt-2">
                View health report <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 lg:max-w-4xl">

        {/* Back */}
        <Button
          variant="ghost"
          className="min-h-[44px] w-fit px-0 text-sm text-muted-foreground"
          onClick={() => navigateBackWithDashboardFallback(router)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className={`px-5 pt-5 pb-4 border-b ${colors.banner} border-opacity-60`}>
            <div className="flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colors.icon}`}>
                <FactorIcon className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    Health factor
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                    {friendlyStatus}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">
                  {displayName}
                </h1>
                <p className="text-sm text-slate-600 mt-1">{factorDescription}</p>
              </div>
            </div>
          </div>

          {/* Score contribution */}
          <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3">
            <div className="text-2xl font-black tabular-nums text-slate-800">
              {score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1)}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">pts contributing to health score</p>
              {impact === "negative" && score < 5 && (
                <p className="text-xs text-red-600 mt-0.5">
                  Resolving this could unlock additional points
                </p>
              )}
            </div>
          </div>

          {/* Why it matters */}
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-start gap-2.5">
              <colors.AlertIcon className={`h-4 w-4 shrink-0 mt-0.5 ${impact === "negative" ? "text-red-500" : impact === "positive" ? "text-emerald-500" : "text-amber-500"}`} />
              <p className="text-sm text-slate-700 leading-relaxed">{statusExplanation}</p>
            </div>

            {actionHint && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Suggested next step
                </p>
                <p className="text-sm text-slate-700">{actionHint}</p>
              </div>
            )}

            {details.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  How this was scored
                </p>
                <ul className="space-y-1.5">
                  {details.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── Action panel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            What to do next
          </p>

          <Link href={primaryCta.href} className="block">
            <div className="rounded-xl bg-teal-800 hover:bg-teal-700 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <p className="text-sm font-semibold text-white">{primaryCta.label}</p>
              <ArrowRight className="h-4 w-4 text-white/80 shrink-0" />
            </div>
          </Link>

          <Link href={healthScoreHref} className="block">
            <div className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
              <p className="text-sm font-medium text-slate-700">View full health report</p>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
            </div>
          </Link>

          {impact === "negative" && (
            <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`} className="block">
              <div className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
                <p className="text-sm font-medium text-slate-700">View all maintenance actions</p>
                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
              </div>
            </Link>
          )}
        </div>

        {/* Footer context */}
        <p className="text-xs text-slate-400 text-center px-2">
          {propertyName} · Health factor: {displayName}
        </p>
      </div>
    </DashboardShell>
  );
}
