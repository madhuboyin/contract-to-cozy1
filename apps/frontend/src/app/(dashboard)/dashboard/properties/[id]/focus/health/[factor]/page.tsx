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
  ListChecks,
  Loader2,
  ShieldCheck,
  Wind,
  Wrench,
  Zap,
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

function isPropertyAgeFactor(factorName: string | undefined): boolean {
  const f = String(factorName || "").toLowerCase();
  return f.includes("age factor") || f.includes("property age") || f.includes("year built");
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
      "High Density": "More occupants for your home's size means faster wear on fixtures and systems",
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

// ── Age-milestone checklist ───────────────────────────────────────────────────

type AgeTier = "new" | "young" | "mid" | "mature" | "senior";
type ChecklistUrgency = "act" | "review" | "watch";

type AgeChecklistItem = {
  id: string;
  system: string;
  icon: React.ElementType;
  ageNote: string;
  action: string;
  urgency: ChecklistUrgency;
};

function getAgeTier(age: number): AgeTier {
  if (age < 10) return "new";
  if (age < 20) return "young";
  if (age < 35) return "mid";
  if (age < 50) return "mature";
  return "senior";
}

function getAgeTierLabel(tier: AgeTier): string {
  return {
    new: "New home",
    young: "Young home",
    mid: "Mid-life home",
    mature: "Mature home",
    senior: "Classic home",
  }[tier];
}

function getAgeTierColor(tier: AgeTier): string {
  return {
    new: "bg-emerald-100 text-emerald-700 border-emerald-200",
    young: "bg-blue-100 text-blue-700 border-blue-200",
    mid: "bg-amber-100 text-amber-700 border-amber-200",
    mature: "bg-orange-100 text-orange-700 border-orange-200",
    senior: "bg-red-100 text-red-700 border-red-200",
  }[tier];
}

function urgencyLabel(u: ChecklistUrgency): string {
  return { act: "Act now", review: "Review soon", watch: "Monitor" }[u];
}

function urgencyColors(u: ChecklistUrgency): string {
  return {
    act: "bg-red-50 border-red-200 text-red-700",
    review: "bg-amber-50 border-amber-200 text-amber-700",
    watch: "bg-slate-50 border-slate-200 text-slate-600",
  }[u];
}

function getAgeChecklistItems(
  age: number,
  knownSystems: {
    hvacInstallYear?: number | null;
    waterHeaterInstallYear?: number | null;
    roofReplacementYear?: number | null;
    electricalPanelAge?: number | null;
  },
): AgeChecklistItem[] {
  const currentYear = new Date().getFullYear();
  const tier = getAgeTier(age);
  const items: AgeChecklistItem[] = [];

  if (tier === "new") {
    items.push(
      {
        id: "builder-warranty",
        system: "Builder warranty",
        icon: ShieldCheck,
        ageNote: "New homes typically have a 1-year workmanship and 10-year structural warranty.",
        action: "Verify your builder warranty is registered and active before it expires.",
        urgency: "review",
      },
      {
        id: "appliance-registration",
        system: "Appliance warranties",
        icon: Wrench,
        ageNote: "Manufacturer warranties on new appliances run 1–5 years from purchase.",
        action: "Register all appliances with manufacturers to activate warranty coverage.",
        urgency: "act",
      },
      {
        id: "hvac-filter",
        system: "HVAC filter",
        icon: Wind,
        ageNote: "First filter replacement is often missed during new-home move-in.",
        action: "Replace HVAC air filter every 3 months; set a recurring reminder.",
        urgency: "watch",
      },
    );
  }

  if (tier === "young") {
    items.push(
      {
        id: "hvac-service",
        system: "HVAC",
        icon: Wind,
        ageNote: `At ${age} years, your original HVAC system may be approaching its first major service interval.`,
        action: "Schedule a full HVAC inspection and filter/belt/coil service — typically $80–150.",
        urgency: "review",
      },
      {
        id: "roof-mid",
        system: "Roof",
        icon: Home,
        ageNote: "Asphalt shingle roofs hit mid-life around 10–15 years — a good time to check condition.",
        action: "Walk the attic and check for granule loss in gutters. Book an inspection if unsure.",
        urgency: "watch",
      },
      {
        id: "water-heater-anode",
        system: "Water heater",
        icon: Flame,
        ageNote: "Anode rods protect tanks from corrosion and should be inspected every 5 years.",
        action: "Have a plumber check and replace the anode rod if needed — typically $50–100.",
        urgency: "review",
      },
      {
        id: "caulking",
        system: "Seals & weatherstripping",
        icon: Home,
        ageNote: "Caulking and seals around windows, doors, and tubs dry out in the first decade.",
        action: "Inspect and re-caulk any cracked or pulling seals to prevent water intrusion.",
        urgency: "watch",
      },
    );
  }

  if (tier === "mid") {
    const hvacAge = knownSystems.hvacInstallYear ? currentYear - knownSystems.hvacInstallYear : null;
    const hvacUrgency: ChecklistUrgency = hvacAge && hvacAge > 15 ? "act" : "review";
    items.push(
      {
        id: "hvac-replacement",
        system: "HVAC",
        icon: Wind,
        ageNote: hvacAge
          ? `Your HVAC is ${hvacAge} years old. Typical lifespan is 15–20 years.`
          : "HVAC systems have a typical lifespan of 15–20 years — assess your current system's age.",
        action: "Get a service inspection and ask the technician for an honest remaining-life assessment.",
        urgency: hvacUrgency,
      },
      {
        id: "water-heater-replacement",
        system: "Water heater",
        icon: Flame,
        ageNote:
          knownSystems.waterHeaterInstallYear
            ? `Installed ${currentYear - knownSystems.waterHeaterInstallYear} years ago. Tank water heaters last 10–15 years.`
            : "Tank water heaters typically last 10–15 years — check installation date.",
        action: "If over 12 years old, get a plumber assessment and start comparing replacement costs.",
        urgency: "review",
      },
      {
        id: "roof-inspection",
        system: "Roof",
        icon: Home,
        ageNote: knownSystems.roofReplacementYear
          ? `Roof replaced ${currentYear - knownSystems.roofReplacementYear} years ago. Asphalt shingles last 20–30 years.`
          : "At this home age, the roof may be approaching its replacement window.",
        action: "Book a roof inspection — many contractors do this free. Get a written report.",
        urgency: "review",
      },
      {
        id: "polybutylene",
        system: "Plumbing",
        icon: Wrench,
        ageNote: "Homes built 1978–1995 may have polybutylene pipes, which are prone to failure and were subject to class action recalls.",
        action: "Have a plumber identify your pipe material. If polybutylene, budget for re-piping ($4,000–15,000).",
        urgency: "act",
      },
      {
        id: "electrical-panel",
        system: "Electrical panel",
        icon: Zap,
        ageNote: "Breaker panels from this era may have known issues. Older panels can also lack arc-fault protection.",
        action: "Have a licensed electrician inspect the panel and confirm it meets current safety standards.",
        urgency: "review",
      },
    );
  }

  if (tier === "mature") {
    items.push(
      {
        id: "electrical-panel-mature",
        system: "Electrical panel",
        icon: Zap,
        ageNote: "Homes this age may have Federal Pacific or Zinsco panels — both known safety hazards with documented fire risks.",
        action: "Have an electrician identify your panel brand. Federal Pacific and Zinsco panels should be replaced.",
        urgency: "act",
      },
      {
        id: "galvanized-plumbing",
        system: "Plumbing",
        icon: Wrench,
        ageNote: "Galvanized steel pipes common in pre-1980 homes corrode from the inside, reducing water pressure and quality.",
        action: "Have a plumber assess pipe material and corrosion level. Budget for re-piping if galvanized.",
        urgency: "act",
      },
      {
        id: "lead-paint",
        system: "Lead paint",
        icon: AlertTriangle,
        ageNote: "Homes built before 1978 commonly contain lead-based paint, especially on trim, windows, and doors.",
        action: "Test with an EPA-certified lead paint test kit ($30). Critical if children are present or renovations planned.",
        urgency: "act",
      },
      {
        id: "hvac-mature",
        system: "HVAC",
        icon: Wind,
        ageNote:
          knownSystems.hvacInstallYear
            ? `Your HVAC was installed in ${knownSystems.hvacInstallYear} (${currentYear - knownSystems.hvacInstallYear} years ago).`
            : "A mature home has likely had 2 HVAC systems — confirm the current system's age.",
        action: "If the current system is over 12 years old, start getting replacement quotes now before an emergency forces a rushed decision.",
        urgency: "review",
      },
      {
        id: "foundation-mature",
        system: "Foundation",
        icon: Home,
        ageNote: "Settlement cracks are common in homes after 35+ years. Most are cosmetic, but some indicate active movement.",
        action: "Walk the basement or crawlspace. Cracks wider than 1/4 inch or showing displacement need a structural engineer review.",
        urgency: "watch",
      },
      {
        id: "insulation-mature",
        system: "Insulation",
        icon: Home,
        ageNote: "Pre-1980 insulation is often inadequate by today's standards and may include outdated materials.",
        action: "Get an energy audit ($100–400) — it will identify insulation gaps and calculate the ROI on upgrades.",
        urgency: "watch",
      },
      {
        id: "windows-mature",
        system: "Windows & doors",
        icon: Home,
        ageNote: "Original single-pane windows from this era lose significantly more heat than modern double-pane glass.",
        action: "Check for drafts and fogging between panes. An energy audit will quantify the savings from upgrading.",
        urgency: "watch",
      },
    );
  }

  if (tier === "senior") {
    items.push(
      {
        id: "knob-tube",
        system: "Electrical wiring",
        icon: Zap,
        ageNote: "Homes 50+ years old may still have knob-and-tube wiring — a serious fire and insurance hazard.",
        action: "Have a licensed electrician inspect for knob-and-tube wiring. Replace if found before insulating walls.",
        urgency: "act",
      },
      {
        id: "asbestos",
        system: "Asbestos",
        icon: AlertTriangle,
        ageNote: "Pre-1980 construction commonly used asbestos in floor tiles, pipe insulation, ceiling tiles, and joint compound.",
        action: "Test before any renovation that disturbs these materials. Hire a certified asbestos inspector ($250–500).",
        urgency: "act",
      },
      {
        id: "cast-iron-drains",
        system: "Drain pipes",
        icon: Wrench,
        ageNote: "Cast iron drain pipes corrode and crack after 50+ years, causing slow drains and leaks inside walls.",
        action: "Request a drain camera inspection ($150–300). Re-piping cost varies widely by scope ($3,000–20,000).",
        urgency: "review",
      },
      {
        id: "electrical-panel-senior",
        system: "Electrical panel",
        icon: Zap,
        ageNote: "Panels this age are frequently undersized for modern loads and may predate current safety standards.",
        action: "Have an electrician do a full service evaluation. Plan for a panel upgrade ($1,500–4,000) if over 60 amps.",
        urgency: "act",
      },
      {
        id: "structural-senior",
        system: "Structural assessment",
        icon: Home,
        ageNote: "50+ year old homes benefit from a full structural review of foundation, load-bearing walls, and roof framing.",
        action: "Hire a structural engineer for a whole-home assessment ($500–1,500). Invaluable before any major renovation.",
        urgency: "review",
      },
      {
        id: "lead-paint-senior",
        system: "Lead paint",
        icon: AlertTriangle,
        ageNote: "Lead paint is virtually guaranteed in homes this age. Any renovation that disturbs painted surfaces needs certified abatement.",
        action: "Use certified lead-safe contractors for any renovation. Test all surfaces before work begins.",
        urgency: "act",
      },
    );
  }

  return items;
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
  yearBuilt?: number | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
  electricalPanelAge?: number | null;
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

  const prop = property as PropertyWithHealth;
  const raw = prop?.healthScore?.insights ?? [];
  const allInsights = raw.map(normalizeInsight).filter((i): i is HealthInsight => i !== null);

  const insight = allInsights.find(
    (i) =>
      toSlug(getDisplayFactorName(i.factor)) === factorSlug ||
      toSlug(i.factor ?? "") === factorSlug,
  );

  const propertyName = prop?.name || "this property";
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

  // Property age specifics
  const showAgeDetails = insight ? isPropertyAgeFactor(insight.factor) : false;
  const yearBuilt = asNumber(prop?.yearBuilt);
  const currentYear = new Date().getFullYear();
  const propertyAge = yearBuilt ? currentYear - yearBuilt : null;
  const ageTier = propertyAge != null ? getAgeTier(propertyAge) : null;
  const ageChecklistItems = propertyAge != null
    ? getAgeChecklistItems(propertyAge, {
        hvacInstallYear: asNumber(prop?.hvacInstallYear),
        waterHeaterInstallYear: asNumber(prop?.waterHeaterInstallYear),
        roofReplacementYear: asNumber(prop?.roofReplacementYear),
        electricalPanelAge: asNumber(prop?.electricalPanelAge),
      })
    : [];

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
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Health factor</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                    {friendlyStatus}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-snug">{displayName}</h1>
                <p className="text-sm text-slate-600 mt-1">{factorDescription}</p>
              </div>
            </div>
          </div>

          {/* ── Property age details strip — only for age factor ── */}
          {showAgeDetails && (
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              {yearBuilt && propertyAge != null && ageTier ? (
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Year built</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums leading-tight">{yearBuilt}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Property age</p>
                    <p className="text-lg font-black text-slate-900 tabular-nums leading-tight">{propertyAge} years</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Age tier</p>
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border mt-0.5 ${getAgeTierColor(ageTier)}`}>
                      {getAgeTierLabel(ageTier)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-sm text-slate-600">
                    Year built is missing.{" "}
                    <Link href={`/dashboard/properties/${propertyId}/edit`} className="text-teal-600 font-medium hover:underline">
                      Add it to your property profile
                    </Link>{" "}
                    to unlock age-specific guidance.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Score contribution */}
          <div className="px-5 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center gap-3">
            <div className="text-2xl font-black tabular-nums text-slate-800">
              {score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1)}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">pts contributing to health score</p>
              {impact === "negative" && score < 5 && (
                <p className="text-xs text-red-600 mt-0.5">Resolving this could unlock additional points</p>
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested next step</p>
                <p className="text-sm text-slate-700">{actionHint}</p>
              </div>
            )}

            {details.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How this was scored</p>
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

        {/* ── Age-milestone checklist — only for property age factor ── */}
        {showAgeDetails && ageChecklistItems.length > 0 && ageTier && propertyAge != null && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-200">
                <ListChecks className="h-4.5 w-4.5 text-teal-700" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  At {propertyAge} years, review these systems
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Age-specific checklist for a {getAgeTierLabel(ageTier).toLowerCase()} — items most likely to need attention at this stage.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {ageChecklistItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ItemIcon className="h-4 w-4 text-slate-500 shrink-0" />
                        <p className="text-sm font-semibold text-slate-800">{item.system}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${urgencyColors(item.urgency)}`}>
                        {urgencyLabel(item.urgency)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.ageNote}</p>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed border-t border-slate-100 pt-1.5">
                      → {item.action}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-4">
              <p className="text-[10px] text-slate-400">
                Items marked "Act now" are most likely to affect safety or cost significantly if deferred.
              </p>
            </div>
          </div>
        )}

        {/* ── Action panel ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What to do next</p>

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

        <p className="text-xs text-slate-400 text-center px-2">
          {propertyName} · Health factor: {displayName}
        </p>
      </div>
    </DashboardShell>
  );
}
