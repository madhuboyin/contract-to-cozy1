"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, ArrowLeft, ArrowRight, BarChart2, Calendar, CheckCircle2, ChevronDown, ClipboardList, Clock3, FileText, Flag, Flame, Gauge, Home, Info, Loader2, ShieldCheck, TrendingDown, TrendingUp, Wind, Wrench } from "lucide-react";
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
import { buildHealthInsightResolutionHref } from '@/lib/navigation/healthInsightRouting';
const REQUIRED_ACTION_STATUSES = ["Needs attention", "Needs Review", "Needs Inspection", "Missing Data", "Needs Warranty"];
const IN_PROGRESS_STATUSES = ["Action Pending"];
const WATCH_STATUSES = ["Aging", "Incomplete", "Partial", "Average", "Standard", "High Density"];
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
  if (score >= 85) return { level: "Excellent", color: "text-green-600", progressColor: "bg-green-500", grade: "A", gradeBg: "bg-green-100 text-green-700" };
  if (score >= 70) return { level: "Good", color: "text-blue-600", progressColor: "bg-blue-500", grade: "B", gradeBg: "bg-blue-100 text-blue-700" };
  if (score >= 50) return { level: "Fair", color: "text-yellow-600", progressColor: "bg-yellow-500", grade: "C", gradeBg: "bg-amber-100 text-amber-700" };
  return { level: "Needs attention", color: "text-red-600", progressColor: "bg-red-500", grade: "D", gradeBg: "bg-red-100 text-red-700" };
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

function getInsightChipLabel(insight: HealthInsight): string {
  const status = String(insight.status || "");
  if (status === "Missing Data") return "data missing";
  if (REQUIRED_ACTION_STATUSES.includes(status)) return "needs attention";
  if (IN_PROGRESS_STATUSES.includes(status)) return "in progress";
  if (WATCH_STATUSES.includes(status)) return "monitor";
  if (POSITIVE_STATUSES.includes(status)) return "healthy";
  return status.toLowerCase() || "review";
}

function getInsightDetailsSummary(insight: HealthInsight): string | null {
  if (!insight.details?.length) return null;
  const visible = insight.details.slice(0, 2);
  const remaining = insight.details.length - visible.length;
  return remaining > 0 ? `${visible.join(" • ")} • +${remaining} more` : visible.join(" • ");
}

function isApplianceInsight(factorName: string | undefined): boolean {
  return String(factorName || "").toLowerCase().includes("appliance");
}

function getDisplayFactorName(factorName: string | undefined): string {
  const factor = String(factorName || "");
  if (factor === "Age Factor") return "Property Age (Year Built)";
  if (factor === "Systems Factor") return "Major Systems Health";
  if (factor === "Usage/Wear Factor") return "Occupancy & Wear";
  return factor || "Health insight";
}

function getChipFactorName(factorName: string | undefined): string {
  const factor = String(factorName || "");
  if (factor === "Age Factor" || factor === "Property Age (Year Built)") return "Year Built";
  if (factor === "Systems Factor" || factor === "Major Systems Health") return "Major Systems";
  if (factor === "Usage/Wear Factor" || factor === "Property Usage Pattern" || factor === "Occupancy & Wear") return "Occupancy";
  return getDisplayFactorName(factorName);
}

function getInsightKey(factorName: string | undefined): string {
  return getDisplayFactorName(factorName).toLowerCase();
}

function formatSignedPoints(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0";
  const abs = Math.abs(value).toFixed(1);
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function getInsightStatusExplanation(factorName: string | undefined, statusValue: string | undefined): string {
  const status = String(statusValue || "");
  if (REQUIRED_ACTION_STATUSES.includes(status)) {
    const factor = getDisplayFactorName(factorName);
    const contextMap: Record<string, string> = {
      'Water Heater Age': 'Aging water heaters are a leading cause of home water damage — early inspection limits repair costs.',
      'HVAC Age': 'An HVAC system past its service life runs less efficiently and is more prone to mid-season failure.',
      'Property Age (Year Built)': 'Older homes tend to accumulate deferred maintenance — a professional inspection helps prioritize what to address.',
      'Roof Age': 'Roof issues can escalate into interior water damage quickly — early assessment reduces long-term cost.',
      'Safety Factor': 'Functional safety systems are the first line of defense against fire and carbon monoxide risk.',
      'Documents Factor': 'Complete records make it easier to sell, insure, and maintain your home.',
      'Major Systems Health': 'Aging major systems increase the risk of unexpected failures — a service review helps catch issues early.',
      'Occupancy & Wear': 'Higher usage accelerates wear on fixtures and systems — more frequent maintenance checks are recommended.',
    };
    return contextMap[factor] ?? 'Resolving this factor can improve your score and reduce long-term maintenance risk.';
  }
  if (IN_PROGRESS_STATUSES.includes(status)) {
    return "Work is already underway on this factor. Its contribution should improve once the task is completed.";
  }
  if (WATCH_STATUSES.includes(status)) {
    const factor = getDisplayFactorName(factorName);
    const watchMap: Record<string, string> = {
      'Water Heater Age': 'Your water heater is still working but getting up there in age — a quick annual check helps you spot early issues before they become expensive.',
      'HVAC Age': 'Your HVAC is running but older systems work harder to keep up — a seasonal tune-up now is cheaper than an emergency repair later.',
      'Property Age (Year Built)': 'Older homes develop quirks over time — periodic walkthroughs help you stay ahead of small issues before they add up.',
      'Roof Age': 'Your roof is within its expected lifespan but worth watching — noting any curling shingles or soft spots after storms helps you stay ahead of leaks.',
      'Safety Factor': 'Your safety devices are in place but could use some attention — testing smoke and CO detectors twice a year keeps your home protected.',
      'Documents Factor': 'Your documentation is partially there — filling in the gaps makes this factor stronger and helps if you ever sell or make a claim.',
      'Major Systems Health': 'Your major systems are running but some are showing age — logging service visits as they happen helps you track what\'s been done and what\'s coming up.',
      'Occupancy & Wear': 'Your home sees active daily use — staying current on routine maintenance keeps wear from piling up over time.',
      'Structure Factor': 'Your structural elements look okay but warrant a closer look — a periodic inspection every few years is a smart habit for any home.',
      'Roof Condition': 'Your roof is intact but showing some wear — keeping an eye on it after storms helps you catch issues early.',
    };
    return watchMap[factor] ?? 'This area is in decent shape but worth keeping an eye on — periodic checks help you stay ahead of anything that might come up.';
  }
  if (POSITIVE_STATUSES.includes(status)) {
    const factor = getDisplayFactorName(factorName);
    const positiveMap: Record<string, string> = {
      'Water Heater Age': 'Your water heater is relatively new — it\'s a reliable, low-maintenance part of your home right now.',
      'HVAC Age': 'Your HVAC system is in its prime years — efficient, reliable, and with plenty of service life ahead.',
      'Property Age (Year Built)': 'Your home\'s age is working in its favor — newer construction typically means fewer deferred maintenance surprises.',
      'Roof Age': 'Your roof has plenty of life left — no immediate concerns, just keep up the occasional inspection.',
      'Safety Factor': 'Your safety devices are up to date — your home and household are well-protected.',
      'Documents Factor': 'Your home has solid documentation on file — this helps with insurance, resale value, and future planning.',
      'Major Systems Health': 'Your heating, cooling, and water systems are in good shape — well-maintained systems are one of the strongest signs of a well-cared-for home.',
      'Occupancy & Wear': 'Your home\'s size is well-matched to your household — lower wear means fixtures and systems last longer and cost less to maintain.',
      'Structure Factor': 'Your home\'s structural elements are in good condition — a solid foundation protects everything built on top of it.',
      'Roof Condition': 'Your roof is in good condition — it\'s doing its job keeping weather out and protecting your home.',
    };
    return positiveMap[factor] ?? 'This area is in great shape — keep doing what you\'re doing and it should stay that way.';
  }
  return "This factor is under review. Add more property records to unlock a more precise score explanation.";
}

function getFactorEvidenceHint(factorName: string | undefined): string {
  const factor = getDisplayFactorName(factorName);
  const hints: Record<string, string> = {
    'Water Heater Age': 'No recent service records found for this factor. Adding an inspection or service record improves score transparency.',
    'HVAC Age': 'No recent service records found for this factor. Adding an inspection or service record improves score transparency.',
    'Property Age (Year Built)': 'Confirm your home\'s year built in property details to improve score accuracy.',
    'Roof Age': 'No recent inspection report found for this factor. Adding one improves score transparency.',
    'Safety Factor': 'Log your safety device checks or upload an inspection record to provide scoring evidence.',
    'Documents Factor': 'Upload inspection reports, warranties, or service records in the Vault to unlock full factor scoring.',
    'Occupancy & Wear': 'Update your household occupancy count in your property profile.',
    'Major Systems Health': 'Add service records for your HVAC, water heater, or plumbing to improve this factor.',
    'Structure Factor': 'Upload a structural inspection report or recent contractor assessment to unlock evidence.',
    'Roof Condition': 'Add a recent roof inspection report or contractor notes to improve this factor.',
  };
  return hints[factor] ?? 'Add relevant service records or property details to improve score transparency.';
}

function getFactorCTALink(
  factorName: string | undefined,
  propertyId: string
): { label: string; href: string } | null {
  const factor = getDisplayFactorName(factorName);
  const docsHref = `/dashboard/documents?propertyId=${propertyId}`;
  const editHref = `/dashboard/properties/${propertyId}/edit`;

  const map: Record<string, { label: string; href: string }> = {
    'Water Heater Age': { label: 'Add service record', href: docsHref },
    'HVAC Age': { label: 'Add service record', href: docsHref },
    'Roof Age': { label: 'Add inspection report', href: docsHref },
    'Roof Condition': { label: 'Add inspection report', href: docsHref },
    'Safety Factor': { label: 'Log safety checks', href: docsHref },
    'Documents Factor': { label: 'Upload to Vault', href: docsHref },
    'Structure Factor': { label: 'Add inspection report', href: docsHref },
    'Major Systems Health': { label: 'Add service record', href: docsHref },
    'Property Age (Year Built)': { label: 'Update property details', href: editHref },
    'Occupancy & Wear': { label: 'Update property profile', href: editHref },
  };
  return map[factor] ?? null;
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
  const factor = getDisplayFactorName(factorName);
  const cond = String(condition || "");
  const map: Record<string, Record<string, string>> = {
    'Property Age (Year Built)': {
      'Excellent': 'Recently built home — strong age signal',
      'Good': 'Home age is within a typical maintenance window',
      'Needs Review': 'Older home based on year built — review recommended',
      'Needs attention': 'Older home age is increasing maintenance risk — priority review recommended',
      'Action Pending': 'Age-related review is already in progress',
      'Missing Data': 'Year built is missing — add it to improve score accuracy',
    },
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
    'Occupancy & Wear': {
      'High Density': 'More occupants for your home\'s size means faster wear on fixtures and systems — more frequent maintenance checks are recommended',
      'Average': 'Occupancy is in a normal range for this home — standard maintenance schedule applies',
      'Low Density': 'Light occupancy for this home\'s size — lower day-to-day wear on fixtures and systems',
    },
    'Major Systems Health': {
      'Modern': 'Heating, cooling, and water systems are up to date — strong positive signal',
      'Mixed': 'Some major systems may need attention — review heating, cooling, and water heater',
      'Aging': 'Major systems are showing age — schedule a review of heating, cooling, and water heater',
      'Good': 'Major systems are in good condition',
      'Standard': 'Major systems are functioning at a standard level',
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

function getFactorActionHint(factorName: string | undefined, statusValue: string | undefined): string | null {
  const factor = getDisplayFactorName(factorName);
  const status = String(statusValue || "");
  const impact = getInsightImpact(statusValue);
  if (impact !== "negative") return null;
  const hints: Record<string, Partial<Record<string, string>>> = {
    'Water Heater Age': {
      'Needs Review': 'Schedule a water heater inspection — most cost $75–150.',
      'Needs attention': 'Get replacement quotes — water heaters typically run $900–2,000 installed.',
      'Needs Inspection': 'Book a plumbing inspection to assess the unit.',
    },
    'HVAC Age': {
      'Needs Review': 'Schedule HVAC servicing — annual tune-ups typically run $80–150.',
      'Needs Inspection': 'Have a technician assess the system before next season.',
      'Needs attention': 'Start planning HVAC replacement — systems typically cost $5,000–12,000 installed.',
    },
    'Property Age (Year Built)': {
      'Needs Review': 'Consider a general home inspection to surface age-related items — typically $300–500.',
      'Needs attention': 'Schedule a comprehensive inspection to identify and prioritize risks.',
    },
    'Roof Age': {
      'Needs Review': 'Get a roof inspection — many contractors offer free assessments.',
      'Needs attention': 'Get 2–3 replacement quotes — costs typically range $8,000–20,000.',
    },
    'Safety Factor': {
      'Incomplete': 'Check smoke and CO detectors, fire extinguisher, and security system.',
      'Needs Review': 'Confirm all safety devices are functional and within service date.',
    },
    'Documents Factor': {
      'Incomplete': 'Upload service records and inspection reports to improve your score.',
      'Missing Data': 'Add property documents in the Vault to unlock full factor scoring.',
    },
  };
  return hints[factor]?.[status] ?? null;
}

function getUserFriendlyStatus(status: string | undefined): string {
  const s = String(status || "");
  const map: Record<string, string> = {
    "Modern": "Up to date",
    "Needs Review": "Review needed",
    "Needs Inspection": "Inspect soon",
    "Needs attention": "Action needed",
    "Needs Warranty": "Warranty needed",
    "Missing Data": "Data missing",
    "High Density": "High usage",
    "Low Density": "Light usage",
    "Action Pending": "In progress",
    "Partial": "Partial",
    "Incomplete": "Incomplete",
    "Average": "Average",
    "Standard": "Standard",
    "Excellent": "Excellent",
    "Good": "Good",
    "Complete": "Complete",
  };
  return map[s] || s;
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
  { key: "neutral", title: "Track these systems", tone: "elevated" as const },
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
  const latestPoint = series?.latest ?? null;
  const previousPoint = series?.previous ?? null;

  if (!latestPoint) {
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

  const delta = series?.deltaFromPreviousWeek ?? null;
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

  const latestRequired = getRequiredActions(latestPoint);
  const previousRequired = getRequiredActions(previousPoint);
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

  const latestPriorityCount = getSnapshotInsights(latestPoint).filter((insight) =>
    REQUIRED_ACTION_STATUSES.includes(String(insight.status || ""))
  ).length;
  const previousPriorityCount = getSnapshotInsights(previousPoint).filter((insight) =>
    REQUIRED_ACTION_STATUSES.includes(String(insight.status || ""))
  ).length;
  if (previousPoint) {
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

  const topNegativeDragScore = asNumber(topNegative?.score) ?? 0;
  if (topNegative && Math.abs(topNegativeDragScore) >= 0.1) {
    changes.push({
      title: "Top current drag",
      detail: `${topNegative.factor || "Health factor"} is marked "${topNegative.status || "Review"}" and currently contributes ${topNegativeDragScore.toFixed(1)} points.`,
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
  const searchParams = useSearchParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const focusedFactor = searchParams.get('focus')?.toLowerCase() ?? null;
  
  // 🔑 NEW: Extract view parameter for trends highlighting
  const viewParam = searchParams.get('view');
  const shouldFocusTrends = viewParam === 'trends';
  
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

  useEffect(() => {
    if (!focusedFactor) return;
    const el = document.querySelector<HTMLElement>(`[data-insight-key="${focusedFactor}"]`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    }
  }, [focusedFactor]);

  useEffect(() => {
    if (!shouldFocusTrends) return;
    const timer = setTimeout(() => {
      const trendsElement = document.getElementById('score-trend-section');
      if (trendsElement) {
        trendsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [shouldFocusTrends]);

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
  const focusedInsight = focusedFactor
    ? sortedInsights.find(
        (insight) =>
          getInsightKey(insight.factor) === focusedFactor ||
          insight.factor?.toLowerCase() === focusedFactor
      ) ?? null
    : null;
  const focusedInsightActionHref =
    focusedInsight && propertyId
      ? buildHealthInsightResolutionHref({
          propertyId,
          factor: focusedInsight.factor,
          status: focusedInsight.status,
        })
      : null;
  const negativeInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "negative");
  const neutralInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "neutral");
  const positiveInsights = sortedInsights.filter((insight) => getInsightImpact(insight.status) === "positive");
  const topNegativeInsight = negativeInsights[0];
  const topPositiveInsight = positiveInsights[0];
  const healthDetails = getHealthDetails(latestScore);
  const scoreRingColor = { Excellent: "#16a34a", Good: "#2563eb", Fair: "#d97706", "Needs attention": "#dc2626" }[healthDetails.level] ?? "#d97706";
  const scoreStatusDot = { Excellent: "bg-green-500", Good: "bg-blue-500", Fair: "bg-amber-500", "Needs attention": "bg-red-500" }[healthDetails.level] ?? "bg-amber-500";
  const changes = buildHealthChangeItems(series, sortedInsights);
  const allChangesNeutral = changes.every((c) => c.impact === "neutral");

  const previousInsights = getSnapshotInsights(series?.previous);
  const hasPreviousSnapshot = !!series?.previous;
  const previousNegativeCount = previousInsights.filter((i) => getInsightImpact(i.status) === "negative").length;
  const previousNeutralCount = previousInsights.filter((i) => getInsightImpact(i.status) === "neutral").length;
  const previousPositiveCount = previousInsights.filter((i) => getInsightImpact(i.status) === "positive").length;
  const negDelta = hasPreviousSnapshot ? negativeInsights.length - previousNegativeCount : null;
  const neutralDelta = hasPreviousSnapshot ? neutralInsights.length - previousNeutralCount : null;
  const positiveDelta = hasPreviousSnapshot ? positiveInsights.length - previousPositiveCount : null;

  // Derived values for premium redesign summary tiles
  const trendPoints = series?.trend || [];
  const bestScore = trendPoints.length > 0 ? Math.max(...trendPoints.map((p) => p.score)) : latestScore;
  const firstTrendScore = trendPoints.length > 0 ? trendPoints[0].score : latestScore;
  const lastTrendScore = trendPoints.length > 0 ? trendPoints[trendPoints.length - 1].score : latestScore;
  const trendDiff = lastTrendScore - firstTrendScore;
  const trendLabel = Math.abs(trendDiff) < 1 ? "Flat" : trendDiff > 0 ? "Rising" : "Declining";
  const hasMeaningfulTrend = trendPoints.length >= 4;
  const hasNoScoreMovement = Math.abs(trendDiff) < 1;
  const activeTrendLabel = trendPoints.length === 0
    ? "No data"
    : trendPoints.length < trendWeeks
    ? `${trendPoints.length} wk${trendPoints.length === 1 ? "" : "s"}`
    : trendWeeks === 26 ? "6 Months" : "1 Year";
  const trendSubtitle = !hasMeaningfulTrend
    ? "Trend will appear once a few weekly snapshots are collected."
    : trendPoints.length < 26
    ? `Showing ${trendPoints.length} week${trendPoints.length === 1 ? "" : "s"} of available data.`
    : `Weekly snapshots for the last ${trendWeeks === 26 ? "6 months" : "1 year"}.`;
  const wowDelta = series?.deltaFromPreviousWeek ?? null;
  const scoreStabilityLabel = wowDelta === null || Math.abs(wowDelta) < 1 ? "Stable" : wowDelta > 0 ? "Improving" : "Declining";
  const stabilitySubtext = wowDelta === null || Math.abs(wowDelta) < 0.05 ? "vs last week" : `${wowDelta > 0 ? "+" : ""}${wowDelta.toFixed(1)} pts`;
  const dataFilled = sortedInsights.filter((i) => String(i.status || "") !== "Missing Data").length;
  const confidencePct = sortedInsights.length > 0 ? Math.min(100, Math.round((dataFilled / sortedInsights.length) * 100)) : 0;
  const confidenceLabel = confidencePct >= 80 ? "High" : confidencePct >= 50 ? "Medium" : "Low";
  const footerInsight =
    wowDelta === null
      ? "Your health score is being tracked — weekly snapshots will appear as data builds."
      : Math.abs(wowDelta) < 0.05
      ? "Your health score is stable and no significant changes were detected."
      : wowDelta > 0
      ? `Your health score improved by ${wowDelta.toFixed(1)} points this week.`
      : `Your health score declined by ${Math.abs(wowDelta).toFixed(1)} points this week.`;

  // Change card metrics
  const latestPriorityCountForMetric = snapshotInsights.filter((i) => REQUIRED_ACTION_STATUSES.includes(String(i.status || ""))).length;
  const prevPriorityCountForMetric = previousInsights.filter((i) => REQUIRED_ACTION_STATUSES.includes(String(i.status || ""))).length;
  const latestReqForMetric = getRequiredActions(series?.latest);
  const prevReqForMetric = getRequiredActions(series?.previous);
  const deltaReq = latestReqForMetric !== null && prevReqForMetric !== null ? latestReqForMetric - prevReqForMetric : null;
  const deltaPriorityMetric = hasPreviousSnapshot ? latestPriorityCountForMetric - prevPriorityCountForMetric : null;

  function getChangeMetric(title: string): { value: string; color: string } | null {
    const t = title.toLowerCase();
    if (t.includes("week-over-week")) {
      const v = wowDelta;
      if (v === null) return null;
      return {
        value: Math.abs(v) < 0.05 ? "— 0.0" : `${v > 0 ? "+" : "—"} ${Math.abs(v).toFixed(1)}`,
        color: v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-blue-500",
      };
    }
    if (t.includes("maintenance")) {
      if (deltaReq === null) return null;
      return {
        value: `${deltaReq === 0 ? "— " : deltaReq > 0 ? "+ " : "— "}${Math.abs(deltaReq)}`,
        color: deltaReq > 0 ? "text-red-500" : deltaReq < 0 ? "text-emerald-600" : "text-amber-500",
      };
    }
    if (t.includes("risky")) {
      if (deltaPriorityMetric === null) return null;
      return {
        value: `${deltaPriorityMetric === 0 ? "— " : deltaPriorityMetric > 0 ? "+ " : "— "}${Math.abs(deltaPriorityMetric)}`,
        color: deltaPriorityMetric > 0 ? "text-red-500" : deltaPriorityMetric < 0 ? "text-emerald-600" : "text-blue-500",
      };
    }
    if (t.includes("drag")) {
      const drag = asNumber(topNegativeInsight?.score) ?? 0;
      return { value: `— ${Math.abs(drag).toFixed(1)}`, color: "text-red-500" };
    }
    return null;
  }

  function getChangeCardIcon(title: string) {
    const t = title.toLowerCase();
    if (t.includes("week-over-week")) return BarChart2;
    if (t.includes("maintenance")) return ClipboardList;
    if (t.includes("risky")) return Flag;
    if (t.includes("drag") || t.includes("decline")) return TrendingDown;
    return Activity;
  }

  const renderFocusInsightAccordionRow = (insight: HealthInsight, idx: number, useStatusChip: boolean, isFocused = false) => {
    const scoreValue = asNumber(insight.score) ?? 0;
    const detailLines = insight.details?.length ? insight.details.slice(0, 6) : [];
    const displayFactorName = getDisplayFactorName(insight.factor);
    const factorCTA = getFactorCTALink(insight.factor, propertyId);
    const impact = getInsightImpact(insight.status);
    const statusBadge = useStatusChip || impact === "neutral" ? (
      <StatusChip tone={getInsightTone(insight.status)}>{getInsightChipLabel(insight)}</StatusChip>
    ) : (
      <Badge variant={impact === "negative" ? "destructive" : "success"}>
        {getInsightChipLabel(insight)}
      </Badge>
    );

    return (
      <details
        key={`${insight.factor || "insight"}-${idx}`}
        className={`rounded-lg border border-black/10 bg-white border-l-[3px] ${getInsightLeftBorderColor(insight.status)}${isFocused ? ' ring-2 ring-teal-400 ring-offset-1' : ''}`}
        data-insight-key={getInsightKey(insight.factor)}
        open={isFocused || undefined}
      >
        <summary className="list-none cursor-pointer px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {getInsightFactorIcon(insight.factor, insight.status)}
              <div>
                <p className="text-sm font-medium">{displayFactorName}</p>
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
            {impact === "negative" && scoreValue > 0 && (
              <span> Resolving this could unlock additional points.</span>
            )}
          </p>
          <p>{getInsightStatusExplanation(insight.factor, insight.status)}</p>
          {getFactorActionHint(insight.factor, insight.status) && (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-slate-600">
              {getFactorActionHint(insight.factor, insight.status)}
            </p>
          )}
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
            <div className="space-y-1">
              <p>{getFactorEvidenceHint(insight.factor)}</p>
              {factorCTA && (
                <Link
                  href={factorCTA.href}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {factorCTA.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}
          {isApplianceInsight(insight.factor) && getInsightImpact(insight.status) !== "positive" && (
            <Link
              href={`/dashboard/properties/${propertyId}/status-board?category=APPLIANCE`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              View appliances on status board
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          <Link
            href={`/dashboard/properties/${propertyId}/home-score`}
            className="inline-flex items-center gap-1 font-medium text-teal-600 hover:underline"
          >
            See full system history
            <ArrowRight className="h-3 w-3" />
          </Link>
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
                title="Property Health Score"
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
            title="Health Factors"
            subtitle={
              usingSnapshotInsights
                ? "All health factors from the latest weekly snapshot, grouped by impact."
                : "Health factors from your current property profile while weekly history builds."
            }
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button asChild>
                    <Link href={focusedInsightActionHref ?? `/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`}>
                      {focusedInsightActionHref ? 'Review issue options' : 'View maintenance actions'}
                    </Link>
                  </Button>
                }
                secondaryActions={
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/properties/${propertyId}/home-score`}>Full Report</Link>
                  </Button>
                }
              />
            }
          >
            {sortedInsights.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>No factor details are available yet for this property.</p>
                <p>
                  Add property profile fields and documentation to unlock a complete health breakdown:{" "}
                  <Link href={`/dashboard/properties/${propertyId}/edit`} className="underline">Edit property details</Link>
                  {" "}or{" "}
                  <Link href={`/dashboard/documents?propertyId=${propertyId}`} className="underline">upload documents</Link>.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {LEDGER_GROUPS.map((group) => {
                  const groupInsights = getLedgerInsights(group.key, negativeInsights, neutralInsights, positiveInsights);
                  if (groupInsights.length === 0) return null;
                  return (
                    <div key={group.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.title}</p>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                          group.tone === 'danger' ? 'bg-red-100 text-red-600' :
                          group.tone === 'elevated' ? 'bg-amber-100 text-amber-700' :
                          'bg-teal-100 text-teal-700'
                        }`}>{groupInsights.length}</span>
                      </div>
                      {groupInsights.map((insight, idx) =>
                        renderFocusInsightAccordionRow(insight, idx, false,
                          getInsightKey(insight.factor) === focusedFactor || insight.factor?.toLowerCase() === focusedFactor)
                      )}
                    </div>
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
            <div
              id="score-trend-section"
              className={`transition-all duration-300 ${
                shouldFocusTrends ? 'ring-2 ring-teal-400 rounded-lg shadow-lg p-2 -m-2' : ''
              }`}
            >
              <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
            </div>
          </ScenarioInputCard>

          <ScenarioInputCard title="Changes Impacting Score" subtitle="What moved the score since the previous weekly snapshot.">
            {!hasPreviousSnapshot ? (
              <p className="text-sm text-slate-400 italic">Changes will appear here after two weekly snapshots are recorded.</p>
            ) : allChangesNeutral ? (
              <p className="text-sm text-gray-500">No significant changes since last week — your score is stable.</p>
            ) : (
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
            )}
          </ScenarioInputCard>

        </MobileToolWorkspace>
      </div>

      <PageHeader className="hidden md:block pt-4 pb-4 md:pt-8 md:pb-8">
        <Button variant="link" className="p-0 h-auto mb-2 text-sm text-muted-foreground" onClick={() => navigateBackWithDashboardFallback(router)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Property Health Score
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
              <div
                className="relative"
                role="img"
                aria-label={`Property Health Score: ${latestScore.toFixed(0)} out of 100, ${healthDetails.level}`}
              >
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
                <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                  <div className="flex items-end gap-0.5 leading-none">
                    <span className={`text-[36px] font-black tabular-nums leading-none tracking-tight ${healthDetails.color}`}>{latestScore.toFixed(0)}</span>
                    <span className="text-[10px] font-semibold text-slate-400 mb-1 ml-0.5">/100</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${scoreStatusDot}`} />
                    <span className="text-[10px] font-semibold text-slate-500 tracking-normal">{healthDetails.level}</span>
                    <span className={`text-[9px] font-bold px-1 py-px rounded ${healthDetails.gradeBg}`}>{healthDetails.grade}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center mt-1">
                {wowDelta !== null && Math.abs(wowDelta) < 0.05 ? (
                  <span className="text-[10px] text-slate-400 font-medium">No change this week</span>
                ) : (
                  <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} />
                )}
              </div>
              {/* Score range strip */}
              <div className="w-full mt-3 px-1">
                <div className="relative h-1.5 w-full">
                  <div className="absolute inset-0 flex rounded-full overflow-hidden">
                    <div className="h-full bg-red-200" style={{ width: "50%" }} />
                    <div className="h-full bg-amber-200" style={{ width: "20%" }} />
                    <div className="h-full bg-blue-200" style={{ width: "15%" }} />
                    <div className="h-full bg-green-200" style={{ width: "15%" }} />
                  </div>
                  <div
                    className="absolute top-0 h-full w-0.5 bg-slate-700 rounded-full"
                    style={{ left: `${latestScore}%`, transform: "translateX(-50%)" }}
                  />
                </div>
                <div className="flex text-[8px] text-slate-400 mt-1">
                  <span style={{ width: "50%" }}>Poor</span>
                  <span style={{ width: "20%" }}>Fair</span>
                  <span style={{ width: "15%" }}>Good</span>
                  <span className="text-right" style={{ width: "15%" }}>Excellent</span>
                </div>
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
                <div className="flex flex-col justify-between flex-1 gap-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-[10px] bg-red-50 border border-red-100/60 px-2 pt-2 pb-2 text-center">
                      <p className="text-2xl font-black text-red-600 tabular-nums leading-none">{negativeInsights.length}</p>
                      <p className="text-[10px] font-semibold text-red-500/90 mt-1 leading-tight">Needs attention</p>
                      <p className="text-[8px] text-red-400/70 mt-0.5 leading-tight">requires action</p>
                      {negDelta !== null && negDelta !== 0 && (
                        <p className="text-[9px] font-medium tabular-nums mt-0.5 text-red-500">{negDelta > 0 ? `↑ ${negDelta}` : `↓ ${Math.abs(negDelta)}`}</p>
                      )}
                    </div>
                    <div className="rounded-[10px] bg-amber-50 border border-amber-100/60 px-2 pt-2 pb-2 text-center">
                      <p className="text-2xl font-black text-amber-500 tabular-nums leading-none">{neutralInsights.length}</p>
                      <p className="text-[10px] font-semibold text-amber-600/90 mt-1 leading-tight">Track these systems</p>
                      <p className="text-[8px] text-amber-500/70 mt-0.5 leading-tight">watch, no action yet</p>
                      {neutralDelta !== null && neutralDelta !== 0 && (
                        <p className="text-[9px] font-medium tabular-nums mt-0.5 text-amber-600">{neutralDelta > 0 ? `↑ ${neutralDelta}` : `↓ ${Math.abs(neutralDelta)}`}</p>
                      )}
                    </div>
                    <div className="rounded-[10px] bg-emerald-50 border border-emerald-100/60 px-2 pt-2 pb-2 text-center">
                      <p className="text-2xl font-black text-emerald-600 tabular-nums leading-none">{positiveInsights.length}</p>
                      <p className="text-[10px] font-semibold text-emerald-600/90 mt-1 leading-tight">Healthy signals</p>
                      <p className="text-[8px] text-emerald-500/70 mt-0.5 leading-tight">working for you</p>
                      {positiveDelta !== null && positiveDelta !== 0 && (
                        <p className="text-[9px] font-medium tabular-nums mt-0.5 text-emerald-600">{positiveDelta > 0 ? `↑ ${positiveDelta}` : `↓ ${Math.abs(positiveDelta)}`}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 mt-auto">
                    <div className="flex items-center gap-2 rounded-lg bg-red-50/50 border border-red-100/50 px-2.5 py-1.5">
                      <span className="h-[6px] w-[6px] rounded-full bg-red-400/80 shrink-0" />
                      <span className="text-[10px] font-bold text-red-600 shrink-0 w-[78px] tracking-normal">Biggest risk</span>
                      <span className="text-[11px] font-medium text-slate-700 truncate flex-1">{topNegativeInsight ? getDisplayFactorName(topNegativeInsight.factor) : "None currently"}</span>
                      {topNegativeInsight && (
                        <span className="text-[9px] text-slate-400 shrink-0 ml-auto">{getUserFriendlyStatus(topNegativeInsight.status)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-teal-50/50 border border-teal-100/50 px-2.5 py-1.5">
                      <span className="h-[6px] w-[6px] rounded-full bg-teal-400/80 shrink-0" />
                      <span className="text-[10px] font-bold text-teal-600 shrink-0 whitespace-nowrap tracking-normal">Best performing</span>
                      <span className="text-[11px] font-medium text-slate-700 truncate flex-1">{topPositiveInsight ? getDisplayFactorName(topPositiveInsight.factor) : "Building signal"}</span>
                      {topPositiveInsight && (
                        <span className="text-[9px] text-slate-400 shrink-0 ml-auto">{getUserFriendlyStatus(topPositiveInsight.status)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Card 3: Next Steps ── */}
          <div className="rounded-2xl border border-slate-200/50 bg-slate-50/80 shadow-[0_1px_4px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] font-bold tracking-normal text-slate-400/80">Next Steps</p>
              {negativeInsights.length > 0 && (
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                  {negativeInsights.length} item{negativeInsights.length > 1 ? "s" : ""} need{negativeInsights.length === 1 ? "s" : ""} attention
                  {negativeInsights[0] ? ` — resolving ${getDisplayFactorName(negativeInsights[0].factor)} could improve your score` : ""}.
                </p>
              )}
            </div>
            {negativeInsights.length > 0 && (
              <div className="px-3 pb-2 space-y-1">
                {negativeInsights.slice(0, 3).map((insight, idx) => (
                  <div key={`next-step-${idx}`} className="rounded-lg bg-white border border-red-100/60 px-2.5 py-1.5 flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-700 leading-tight">{getDisplayFactorName(insight.factor)}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{getFactorDescription(insight.factor, insight.status)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-3 pb-3 space-y-2 mt-auto">
              <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`} className="block">
                <div className="rounded-xl bg-teal-800 hover:bg-teal-700 active:scale-[0.99] transition-all px-3 py-2 cursor-pointer flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-white tracking-normal">View maintenance actions</p>
                  {negativeInsights.length > 0 && (
                    <span className="shrink-0 text-[9px] font-bold bg-red-500/90 text-white px-1.5 py-0.5 rounded-full tabular-nums">
                      {negativeInsights.length}
                    </span>
                  )}
                </div>
              </Link>
              <Link href={`/dashboard/properties/${propertyId}/home-score`} className="block">
                <div className="rounded-xl border border-teal-200/60 bg-teal-50/60 hover:bg-teal-50 active:scale-[0.99] transition-all px-3 py-2 cursor-pointer flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-teal-700">View Full Home Score Report</p>
                  <ArrowRight className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                </div>
              </Link>
              <Link href={`/dashboard/properties/${propertyId}/edit`} className="block">
                <div className="rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 active:scale-[0.99] transition-all px-3 py-2 cursor-pointer">
                  <p className="text-[12px] font-medium text-slate-600">Edit property details</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* ===== PREMIUM HEALTH SCORE REPORT SECTION ===== */}
        <div className="mt-8 space-y-4">

          {/* Row 2: Two-column — Trend (65%) + Changes Rail (35%) */}
          <div className="grid gap-4 lg:grid-cols-[65fr_35fr]">

            {/* Left: Health Score Trend Card */}
            <div
              id="score-trend-section"
              className={`rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col transition-all duration-300 hover:shadow-[0_6px_28px_rgba(0,0,0,0.10)] hover:-translate-y-px ${
                shouldFocusTrends ? "ring-2 ring-teal-400 shadow-lg" : ""
              }`}
            >
              {/* Card header */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-100/80">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-blue-50 border border-blue-100/60 p-2.5 shrink-0">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900">Health score Trend</h4>
                      <p className="text-sm text-slate-500 mt-0.5">{trendSubtitle}</p>
                    </div>
                  </div>
                  {/* Premium segmented control */}
                  <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 gap-1 shrink-0">
                    <button
                      onClick={() => setTrendWeeks(26)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                        trendWeeks === 26
                          ? "bg-teal-700 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-100/80"
                      }`}
                    >
                      {trendWeeks === 26 ? activeTrendLabel : "6 Months"}
                    </button>
                    <button
                      onClick={() => setTrendWeeks(52)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                        trendWeeks === 52
                          ? "bg-teal-700 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-100/80"
                      }`}
                    >
                      {trendWeeks === 52 ? activeTrendLabel : "1 Year"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart area */}
              <div className="px-6 pt-4 pb-2">
                {hasMeaningfulTrend ? (
                  <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                    <div className="rounded-full bg-slate-100 p-4">
                      <TrendingUp className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-600">Score trend building</p>
                    <p className="text-xs text-slate-400 max-w-[220px]">Weekly snapshots will appear here as history builds. Check back next week.</p>
                  </div>
                )}
              </div>

              {/* Bottom summary tiles and footer — only shown when meaningful trend exists */}
              {hasMeaningfulTrend && (
                <>
                  <div className="px-6 pb-4">
                    {hasNoScoreMovement ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-1.5 shrink-0 mt-0.5">
                            <Activity className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">Score stability</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{scoreStabilityLabel}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{stabilitySubtext}</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-teal-50 border border-teal-100 p-1.5 shrink-0 mt-0.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">Score confidence</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{confidenceLabel}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{confidencePct}% confidence</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-1.5 shrink-0 mt-0.5">
                            <Activity className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">Score stability</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{scoreStabilityLabel}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{stabilitySubtext}</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-blue-50 border border-blue-100 p-1.5 shrink-0 mt-0.5">
                            <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">{trendWeeks === 26 ? "6-month" : "1-year"} trend</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{trendLabel}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{trendDiff > 0 ? `+${trendDiff.toFixed(1)} pts` : trendDiff < 0 ? `${trendDiff.toFixed(1)} pts` : "no change"}</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-violet-50 border border-violet-100 p-1.5 shrink-0 mt-0.5">
                            <Calendar className="h-3.5 w-3.5 text-violet-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">Best score this period</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{bestScore.toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{bestScore > latestScore ? `↑ ${(bestScore - latestScore).toFixed(0)} above current` : "at current score"}</p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 flex items-start gap-2.5">
                          <div className="rounded-lg bg-teal-50 border border-teal-100 p-1.5 shrink-0 mt-0.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-slate-400 leading-tight">Score confidence</p>
                            <p className="text-sm font-bold text-slate-800 mt-0.5">{confidenceLabel}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{confidencePct}% confidence</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mx-6 mb-5 rounded-xl border border-emerald-100/80 bg-emerald-50/60 px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-800 font-medium">{footerInsight}</p>
                  </div>
                </>
              )}
            </div>

            {/* Right: Changes Impacting Score Rail */}
            <div className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
              <div className="px-5 pt-4 pb-3 border-b border-slate-100/80">
                <h4 className="text-lg font-semibold text-slate-900">Changes Impacting Score</h4>
                <p className="text-sm text-slate-500 mt-0.5">What moved the score since the previous weekly snapshot.</p>
              </div>

              <div className="px-4 py-3">
                {!hasPreviousSnapshot ? (
                  <p className="text-sm text-slate-400 italic py-2">Changes will appear here after two weekly snapshots are recorded.</p>
                ) : allChangesNeutral ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-3">
                    <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <p className="text-sm text-slate-500">No material changes since last week — your score is stable.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {changes.map((change, idx) => {
                      const metric = getChangeMetric(change.title);
                      const ChangeIcon = getChangeCardIcon(change.title);
                      const isDragCard = change.title.toLowerCase().includes("drag");
                      const isNegative = change.impact === "negative";
                      const isPositive = change.impact === "positive";

                      return (
                        <div
                          key={`${change.title}-${idx}`}
                          className={`rounded-xl border px-3 py-2.5 transition-all duration-200 hover:shadow-sm hover:-translate-y-px ${
                            isDragCard && isNegative
                              ? "border-red-200/80 bg-red-50/40"
                              : "border-slate-200/70 bg-white hover:bg-slate-50/60"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`rounded-full p-1.5 shrink-0 mt-0.5 ${
                                isNegative
                                  ? "bg-red-100/80 text-red-600"
                                  : isPositive
                                  ? "bg-emerald-100/80 text-emerald-600"
                                  : "bg-slate-100/80 text-slate-500"
                              }`}
                            >
                              <ChangeIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-800 leading-snug">{change.title}</p>
                                {isDragCard && isNegative && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 shrink-0">
                                    <TrendingDown className="h-2.5 w-2.5" /> Declined
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{change.detail}</p>
                            </div>
                            {metric && (
                              <div className={`shrink-0 text-sm font-bold tabular-nums ${metric.color}`}>
                                {metric.value}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Health Factors — grouped by impact */}
          <div className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100/80">
              <h4 className="text-lg font-semibold text-slate-900">Health Factors</h4>
              <p className="text-sm text-slate-500 mt-0.5">
                {usingSnapshotInsights
                  ? "All health factors from the latest weekly snapshot, grouped by impact."
                  : "Health factors from your current property profile while weekly history builds."}
              </p>
            </div>
            <div className="px-6 py-5">
              {sortedInsights.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No factor details are available yet for this property.</p>
                  <p>
                    Add property profile fields and service records to unlock full health summary:{" "}
                    <Link href={`/dashboard/properties/${propertyId}/edit`} className="underline">Edit property details</Link>{" "}
                    or{" "}
                    <Link href={`/dashboard/documents?propertyId=${propertyId}`} className="underline">upload documents</Link>.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {LEDGER_GROUPS.map((group) => {
                    const groupInsights = getLedgerInsights(group.key, negativeInsights, neutralInsights, positiveInsights);
                    if (groupInsights.length === 0) return null;
                    return (
                      <div key={group.key} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.title}</p>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                            group.tone === 'danger' ? 'bg-red-100 text-red-600' :
                            group.tone === 'elevated' ? 'bg-amber-100 text-amber-700' :
                            'bg-teal-100 text-teal-700'
                          }`}>{groupInsights.length}</span>
                        </div>
                        {groupInsights.map((insight, idx) =>
                          renderFocusInsightAccordionRow(insight, idx, false,
                            getInsightKey(insight.factor) === focusedFactor || insight.factor?.toLowerCase() === focusedFactor)
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-5">
                <Link href={`/dashboard/properties/${propertyId}/?tab=maintenance&view=insights`}>
                  <Button variant="outline" size="sm">View maintenance actions</Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Phase 8: Bridge CTA — Want the full picture? */}
          <div className="rounded-2xl border border-teal-200/50 bg-gradient-to-br from-teal-50/60 via-white to-white shadow-[0_2px_12px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-6 py-5 flex items-center gap-5">
              <div className="rounded-xl bg-teal-100 border border-teal-200/60 p-3 shrink-0">
                <FileText className="h-6 w-6 text-teal-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-semibold text-slate-900">Want the full picture?</h4>
                <p className="text-sm text-slate-500 mt-0.5 leading-snug">
                  The Home Score Report includes your property timeline, benchmark comparison, system health details, and a personalised improvement plan.
                </p>
              </div>
              <Link href={`/dashboard/properties/${propertyId}/home-score`} className="shrink-0">
                <Button className="bg-teal-700 hover:bg-teal-600 text-white whitespace-nowrap">
                  View Full Home Score Report <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
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
          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link
              href={`/dashboard/properties/${propertyId}/home-score`}
              onClick={() => setShowScoreModal(false)}
              className="text-sm text-teal-600 font-medium hover:underline flex items-center gap-1"
            >
              View full Home Score Report — timeline, benchmarks &amp; improvement plan
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
