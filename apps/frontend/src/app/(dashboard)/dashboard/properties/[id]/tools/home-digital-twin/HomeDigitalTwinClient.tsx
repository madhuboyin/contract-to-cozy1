'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { track } from '@/lib/analytics/events';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Droplets,
  FileCheck,
  Flame,
  Gauge,
  Hammer,
  Home,
  Info,
  Landmark,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  TrendingUp,
  type LucideIcon,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import {
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import HomeToolsRail from '../../components/HomeToolsRail';
import type {
  HomeDigitalTwinDTO,
  HomeTwinComponentDTO,
  HomeTwinComponentType,
  HomeTwinScenarioDTO,
  HomeTwinScenarioDecisionStatus,
  HomeTwinScenarioImpactDTO,
  HomeTwinScenarioRunDTO,
  HomeTwinScenarioType,
  ScenarioSuggestionDTO,
} from '@/types';
import {
  getHomeDigitalTwin,
  initHomeDigitalTwin,
  refreshHomeDigitalTwin,
  getDigitalTwinRecommendations,
  createDigitalTwinScenario,
  computeDigitalTwinScenario,
  updateDigitalTwinScenario,
  recordDigitalTwinScenarioDecision,
  getDigitalTwinScenarioHandoff,
  getDigitalTwinScenarioReadiness,
  compareDigitalTwinScenarios,
  ensureDigitalTwinComparisonOptions,
  deleteDigitalTwinScenario,
  listDigitalTwinScenarioRuns,
} from './homeDigitalTwinApi';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';

// ============================================================================
// DISPLAY CONFIG
// ============================================================================

const COMPONENT_LABEL: Record<HomeTwinComponentType, string> = {
  HVAC: 'HVAC System',
  WATER_HEATER: 'Water Heater',
  ROOF: 'Roof',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical Panel',
  INSULATION: 'Insulation',
  WINDOWS: 'Windows',
  SOLAR: 'Solar',
  APPLIANCE: 'Appliance',
  FLOORING: 'Flooring',
  EXTERIOR: 'Exterior',
  FOUNDATION: 'Foundation',
  OTHER: 'Other',
};

const COMPONENT_ICON: Record<HomeTwinComponentType, LucideIcon> = {
  HVAC: Wind,
  WATER_HEATER: Flame,
  ROOF: Home,
  PLUMBING: Droplets,
  ELECTRICAL: Zap,
  INSULATION: Layers,
  WINDOWS: Square,
  SOLAR: Sun,
  APPLIANCE: Wrench,
  FLOORING: Square,
  EXTERIOR: Building2,
  FOUNDATION: Hammer,
  OTHER: Wrench,
};

const SCENARIO_TYPE_LABEL: Record<HomeTwinScenarioType, string> = {
  MAINTAIN_COMPONENT: 'Maintain',
  REPAIR_COMPONENT: 'Repair',
  REPLACE_COMPONENT: 'Replace Component',
  UPGRADE_COMPONENT: 'Upgrade Component',
  WAIT_MONITOR: 'Wait & Monitor',
  ENERGY_IMPROVEMENT: 'Energy Improvement',
  RESILIENCE_IMPROVEMENT: 'Resilience Improvement',
  ADD_FEATURE: 'Add Feature',
  RENOVATION: 'Renovation',
  REMOVE_FEATURE: 'Remove Feature',
  CUSTOM: 'Custom',
};

const COMPONENT_STATUS_LABEL: Record<string, string> = {
  KNOWN: 'Known',
  ESTIMATED: 'Estimated',
  NEEDS_REVIEW: 'Needs Review',
  RETIRED: 'Retired',
};

const FACT_FIELD_LABEL: Record<string, string> = {
  installYear: 'Install year',
  usefulLifeYears: 'Typical lifespan',
  replacementCostEstimate: 'Replacement cost',
};

const FACT_STATE_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  REPORTED: 'Reported by homeowner',
  DOCUMENT_DERIVED: 'From a document',
  INFERRED: 'System estimate',
  DEFAULT: 'Category default (no home-specific data)',
  CONFLICTED: 'Conflicting sources',
  UNKNOWN: 'Unknown',
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  PROPERTY_PROFILE: 'From your property profile',
  INVENTORY: 'From your inventory',
  DOCUMENT: 'From an uploaded document',
  RISK_ENGINE: 'From risk modeling',
  MANUAL: 'Entered manually',
  SYSTEM_DERIVED: 'Calculated from other data',
  IMPORT: 'Imported',
  OTHER: 'Other source',
};

const FACT_STATE_TONE: Record<string, 'good' | 'elevated' | 'info' | 'danger'> = {
  VERIFIED: 'good',
  REPORTED: 'good',
  DOCUMENT_DERIVED: 'good',
  INFERRED: 'info',
  DEFAULT: 'elevated',
  CONFLICTED: 'danger',
  UNKNOWN: 'elevated',
};

const IMPACT_TYPE_LABEL: Record<string, string> = {
  UPFRONT_COST: 'Upfront Cost',
  ANNUAL_SAVINGS: 'Annual Savings',
  PAYBACK_PERIOD: 'Payback Period',
  PROPERTY_VALUE_CHANGE: 'Property Value Impact',
  RISK_REDUCTION: 'Risk Reduction',
  ENERGY_USE_CHANGE: 'Energy Savings',
  MAINTENANCE_COST_CHANGE: 'Maintenance Savings',
  INSURANCE_IMPACT: 'Insurance Impact',
  EMISSIONS_IMPACT: 'Emissions Reduction',
  COMFORT_IMPACT: 'Comfort Impact',
  CUSTOM: 'Summary',
};

const SCENARIO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  COMPUTED: 'Results Ready',
  FAILED: 'Compute Failed',
  ARCHIVED: 'Archived',
};

const DECISION_STATUS_LABEL: Record<HomeTwinScenarioDecisionStatus, string> = {
  OPEN: 'No decision yet',
  SELECTED: 'Selected',
  DEFERRED: 'Deferred',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

const DECISION_STATUS_TONE: Record<HomeTwinScenarioDecisionStatus, 'good' | 'elevated' | 'danger' | 'info'> = {
  OPEN: 'info',
  SELECTED: 'good',
  DEFERRED: 'elevated',
  REJECTED: 'danger',
  CLOSED: 'good',
};

const ACTIVE_COMPUTATION_WINDOW_MS = 5 * 60 * 1000;

function isActiveScenarioRun(
  run: HomeTwinScenarioDTO['latestRun'] | HomeTwinScenarioRunDTO | null | undefined,
): boolean {
  if (!run || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) return false;
  const startedAt = new Date(run.startedAt).getTime();
  return Number.isFinite(startedAt) && startedAt >= Date.now() - ACTIVE_COMPUTATION_WINDOW_MS;
}

type UrgencyTone = 'danger' | 'elevated' | 'info';

const URGENCY_TONE: Record<'HIGH' | 'MEDIUM' | 'LOW', UrgencyTone> = {
  HIGH: 'danger',
  MEDIUM: 'elevated',
  LOW: 'info',
};

const URGENCY_LABEL: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'Act Soon',
  MEDIUM: 'Worth Planning',
  LOW: 'Consider Later',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatUSD(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatImpactDisplay(impact: HomeTwinScenarioImpactDTO | undefined): string {
  if (!impact) return '—';
  const formatValue = (value: number) => {
    if (impact.unit === 'USD') return formatUSD(value);
    if (impact.unit === 'PERCENT') return `${value}%`;
    return `${value}${impact.unit ? ` ${impact.unit.toLowerCase()}` : ''}`;
  };
  if (impact.valueLow != null && impact.valueHigh != null && impact.valueLow !== impact.valueHigh) {
    return `${formatValue(impact.valueLow)}–${formatValue(impact.valueHigh)}`;
  }
  if (impact.valueNumeric != null) return formatValue(impact.valueNumeric);
  return impact.valueText ?? '—';
}

function ageRatioPct(c: HomeTwinComponentDTO): number | null {
  if (c.estimatedAgeYears == null || c.usefulLifeYears == null || c.usefulLifeYears === 0) {
    return null;
  }
  return Math.round((c.estimatedAgeYears / c.usefulLifeYears) * 100);
}

function componentStatusTone(
  c: HomeTwinComponentDTO,
): 'danger' | 'elevated' | 'good' | 'info' {
  const ratio =
    c.usefulLifeYears && c.estimatedAgeYears
      ? c.estimatedAgeYears / c.usefulLifeYears
      : null;
  if (c.status === 'RETIRED' || (ratio != null && ratio >= 0.85)) return 'danger';
  if (c.status === 'NEEDS_REVIEW' || (ratio != null && ratio >= 0.60)) return 'elevated';
  if (c.status === 'KNOWN' && (ratio == null || ratio < 0.40)) return 'good';
  return 'info';
}

// Buckets an age-derived score into planning-window language. This is not a
// calibrated failure probability — it reflects age relative to a typical
// service-life range, nothing more.
function planningAttentionLabel(score: number | null | undefined): string {
  if (score == null) return 'Unknown';
  if (score < 0.30) return 'Low — well within typical service life';
  if (score < 0.50) return 'Moderate — within typical service life';
  if (score < 0.70) return 'Elevated — approaching typical replacement window';
  return 'High — past typical service life; inspection recommended';
}

function componentPlanningMeta(component: HomeTwinComponentDTO): {
  label: string;
  detail: string;
  toneClassName: string;
  barClassName: string;
} {
  const pct = ageRatioPct(component);
  if (component.status === 'NEEDS_REVIEW') {
    return {
      label: 'Needs fact review',
      detail: 'Confirm home details before relying on this comparison',
      toneClassName: 'text-amber-800',
      barClassName: 'bg-amber-500',
    };
  }
  if (component.status === 'RETIRED' || (pct != null && pct >= 85)) {
    return {
      label: 'Plan now',
      detail: 'At or beyond the typical planning window',
      toneClassName: 'text-rose-700',
      barClassName: 'bg-rose-500',
    };
  }
  if (pct != null && pct >= 60) {
    return {
      label: 'Plan ahead',
      detail: 'Approaching the typical planning window',
      toneClassName: 'text-amber-800',
      barClassName: 'bg-amber-500',
    };
  }
  if (pct != null) {
    return {
      label: 'Monitor',
      detail: 'Within the typical service-life range',
      toneClassName: 'text-emerald-700',
      barClassName: 'bg-emerald-500',
    };
  }
  return {
    label: 'Add details',
    detail: 'More home information will improve this comparison',
    toneClassName: 'text-sky-700',
    barClassName: 'bg-sky-500',
  };
}

function splitDescriptionIntoPoints(description: string): string[] {
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentenceLike = normalized
    .replace(/\s+[—–]\s+/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim().replace(/[.!?]+$/g, ''))
    .filter(Boolean);

  const deduped = Array.from(new Set(sentenceLike));
  if (deduped.length <= 1) return deduped;
  const withoutIntro = deduped.filter((item) => !/^here is what to expect\b/i.test(item));
  return withoutIntro.length > 0 ? withoutIntro : deduped;
}

function descriptionPointMeta(point: string): {
  Icon: typeof Info;
  toneClassName: string;
} {
  const text = point.toLowerCase();

  if (/(permit|code|inspection|building department)/.test(text)) {
    return { Icon: FileCheck, toneClassName: 'text-blue-600' };
  }
  if (/(tax|assessment|monthly)/.test(text)) {
    return { Icon: Landmark, toneClassName: 'text-amber-600' };
  }
  if (/(licensed|license|credential|insured|contractor)/.test(text)) {
    return { Icon: ShieldCheck, toneClassName: 'text-emerald-600' };
  }
  if (/(confirm|review|verify|proceed|next step)/.test(text)) {
    return { Icon: CheckCircle2, toneClassName: 'text-indigo-600' };
  }

  return { Icon: Info, toneClassName: 'text-slate-500' };
}

function DescriptionPointList({ description }: { description: string }) {
  const points = splitDescriptionIntoPoints(description);
  if (points.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Scenario description highlights">
      {points.map((point, idx) => {
        const { Icon, toneClassName } = descriptionPointMeta(point);
        return (
          <li
            key={`${point}-${idx}`}
            className="flex items-start gap-2.5 rounded-lg border border-[hsl(var(--mobile-border-subtle))] px-2.5 py-2"
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClassName)} aria-hidden="true" />
            <span className="text-sm leading-[1.5] text-[hsl(var(--foreground))]">{point}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

function DigitalTwinSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none space-y-3">
      <div className="h-28 rounded-[22px] bg-gray-100" />
      <div className="h-20 rounded-[22px] bg-gray-100" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-16 rounded-[22px] bg-gray-100" />
      ))}
    </div>
  );
}

// ============================================================================
// TWIN STATUS CARD (hero)
// ============================================================================

function TwinStatusCard({
  twin,
  onRefresh,
  isRefreshing,
  onCompare,
}: {
  twin: HomeDigitalTwinDTO;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCompare: (componentId: string) => void;
}) {
  const rankedComponents = [...twin.components].sort((a, b) => {
    const rank = (component: HomeTwinComponentDTO) => {
      const pct = ageRatioPct(component);
      if (component.status === 'RETIRED') return 4;
      if (component.status === 'NEEDS_REVIEW') return 3.5;
      if (pct != null && pct >= 85) return 3;
      if (pct != null && pct >= 60) return 2;
      return 1;
    };
    return rank(b) - rank(a);
  });
  const priorityComponent = rankedComponents[0] ?? null;
  const priorityMeta = priorityComponent ? componentPlanningMeta(priorityComponent) : null;
  const factsToReview = twin.components.filter(
    (component) =>
      component.status === 'NEEDS_REVIEW' ||
      component.projectedFacts?.some((fact) =>
        ['CONFLICTED', 'DEFAULT', 'UNKNOWN'].includes(fact.factState),
      ),
  ).length;
  const modeledExposure = twin.components.reduce(
    (sum, component) => sum + (component.replacementCostEstimate ?? 0),
    0,
  );

  return (
    <section
      aria-labelledby="upgrade-plan-summary"
      className="relative overflow-hidden rounded-[28px] border border-teal-200/70 bg-[linear-gradient(135deg,#073f3b_0%,#0f766e_55%,#155e75_100%)] px-5 py-6 text-white shadow-[0_28px_70px_-40px_rgba(6,78,74,0.85)] sm:px-7 sm:py-7"
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-50 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Your home upgrade plan
          </div>
          <h2 id="upgrade-plan-summary" className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
            {priorityComponent
              ? `${priorityComponent.label ?? COMPONENT_LABEL[priorityComponent.componentType]} is the next system worth reviewing`
              : 'Start building a clearer plan for your home'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-50/85 sm:text-base">
            {priorityMeta?.detail ??
              'Add home systems to compare timing, cost, and tradeoffs with more confidence.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {priorityComponent && (
              <Button
                onClick={() => onCompare(priorityComponent.id)}
                className="gap-2 rounded-xl bg-white text-teal-900 shadow-lg shadow-black/10 hover:bg-teal-50"
              >
                Compare options
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="gap-2 rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {isRefreshing ? 'Updating…' : 'Refresh plan'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-black/10 p-2 backdrop-blur-sm">
          {[
            { label: 'Systems', value: String(twin.components.length), Icon: Activity },
            { label: 'Review', value: String(factsToReview), Icon: FileCheck },
            {
              label: 'Exposure',
              value: modeledExposure > 0 ? formatUSD(modeledExposure) : '—',
              Icon: CircleDollarSign,
            },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-xl bg-white/10 px-3 py-3">
              <Icon className="mb-2 h-4 w-4 text-teal-100" aria-hidden="true" />
              <p className="truncate text-base font-semibold text-white sm:text-lg">{value}</p>
              <p className="text-[11px] font-medium text-teal-50/80">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {(twin.staleReason || twin.needsRecompute) && (
        <div
          role="status"
          className="relative mt-5 flex items-start gap-2 rounded-xl border border-amber-200/30 bg-amber-100/95 px-3 py-2.5 text-amber-950"
        >
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-snug">
            {twin.staleReason ?? 'Your Home Record changed. Refresh the plan before making a decision.'}
          </p>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// COMPONENT CARD
// ============================================================================

function ComponentCard({
  component,
  onClick,
}: {
  component: HomeTwinComponentDTO;
  onClick: () => void;
}) {
  const pct = ageRatioPct(component);
  const ComponentIcon = COMPONENT_ICON[component.componentType] ?? Home;
  const planning = componentPlanningMeta(component);
  const title = component.label ?? COMPONENT_LABEL[component.componentType];

  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      aria-label={`Compare options for ${title}`}
      className="group block w-full rounded-2xl text-left premium-focus"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_14px_38px_-30px_rgba(15,23,42,0.7)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-teal-300 group-hover:shadow-[0_22px_44px_-28px_rgba(15,118,110,0.35)] motion-reduce:transform-none">
        <div className={cn('absolute inset-x-0 top-0 h-1', planning.barClassName)} aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                aria-hidden="true"
              >
                <ComponentIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold leading-tight text-slate-950">{title}</p>
                <p className={cn('mt-1 text-xs font-semibold', planning.toneClassName)}>
                  {planning.label}
                </p>
              </div>
            </div>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
          <div>
            <p className="text-slate-500">Age</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {component.estimatedAgeYears != null ? `~${Math.round(component.estimatedAgeYears)} yrs` : 'Unknown'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Life used</p>
            <p className="mt-0.5 font-semibold text-slate-900">{pct != null ? `${pct}%` : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Replace</p>
            <p className="mt-0.5 truncate font-semibold text-slate-900">
              {formatUSD(component.replacementCostEstimate)}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// COMPONENT DETAIL SHEET
// ============================================================================

function ComponentDetailSheet({
  component,
  open,
  onOpenChange,
  onCompare,
}: {
  component: HomeTwinComponentDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompare: (componentId: string) => void;
}) {
  if (!component) return null;
  const tone = componentStatusTone(component);
  const pct = ageRatioPct(component);
  const dataSourceNote =
    component.metadata &&
    typeof component.metadata === 'object' &&
    'dataSourceNote' in component.metadata
      ? String(component.metadata.dataSourceNote)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">
            {component.label ?? COMPONENT_LABEL[component.componentType]}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Component details for {component.label ?? COMPONENT_LABEL[component.componentType]}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5">
          {/* Status */}
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={tone}>
              {COMPONENT_STATUS_LABEL[component.status] ?? component.status}
            </StatusChip>
            {pct != null && (
              <StatusChip tone="info">{pct}% of lifespan used</StatusChip>
            )}
          </div>

          {/* Age & Lifespan */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
              Age &amp; Lifespan
            </h3>
            <div className="space-y-1 text-sm">
              {component.estimatedAgeYears != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Estimated age: </span>
                  ~{Math.round(component.estimatedAgeYears)} years
                </p>
              )}
              {component.installYear != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Install year: </span>
                  {component.installYear}
                </p>
              )}
              {component.usefulLifeYears != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Typical lifespan: </span>
                  {component.usefulLifeYears} years
                </p>
              )}
              {component.estimatedAgeYears == null && component.installYear == null && (
                <p className="text-[hsl(var(--mobile-text-secondary))]">
                  Age data not available for this component.
                </p>
              )}
            </div>
          </div>

          {/* Planning attention — age-based signal, not a failure probability */}
          {pct != null && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Planning Attention
              </h3>
              <p className="text-sm font-semibold">
                {planningAttentionLabel(pct / 100)}
              </p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                Based on age relative to a typical service-life range for this system. Age alone does not predict
                failure — confirm current condition with an inspection before planning replacement.
              </p>
            </div>
          )}

          {/* Cost estimates */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
              Cost Estimates
            </h3>
            <div className="space-y-1 text-sm">
              {component.replacementCostEstimate != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Replacement: </span>
                  {formatUSD(component.replacementCostEstimate)}
                </p>
              )}
              {component.annualOperatingCostEstimate != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Annual operating: </span>
                  {formatUSD(component.annualOperatingCostEstimate)}/yr
                </p>
              )}
              {component.annualMaintenanceCostEstimate != null && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Annual maintenance: </span>
                  {formatUSD(component.annualMaintenanceCostEstimate)}/yr
                </p>
              )}
              {component.replacementCostEstimate == null &&
                component.annualOperatingCostEstimate == null && (
                  <p className="text-[hsl(var(--mobile-text-secondary))]">
                    Cost data not available.
                  </p>
                )}
            </div>
          </div>

          {/* Data source + confidence */}
          <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5 space-y-1">
            {dataSourceNote && (
              <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                <span className="font-medium text-[hsl(var(--foreground))]">Source: </span>
                {dataSourceNote}
              </p>
            )}
            {component.confidenceScore != null && (
              <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                Data confidence: {formatPct(component.confidenceScore)}. Adding more home details
                improves accuracy.
              </p>
            )}
          </div>

          {/* Per-field lineage — where each individual value came from */}
          {component.projectedFacts.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Data Sources
              </h3>
              <div className="space-y-2">
                {component.projectedFacts.map((fact) => (
                  <div
                    key={fact.id}
                    className="rounded-lg border border-[hsl(var(--mobile-border-subtle))] px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {FACT_FIELD_LABEL[fact.fieldName] ?? fact.fieldName}
                      </span>
                      <StatusChip tone={FACT_STATE_TONE[fact.factState] ?? 'info'}>
                        {FACT_STATE_LABEL[fact.factState] ?? fact.factState}
                      </StatusChip>
                    </div>
                    {fact.sourceField && (
                      <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                        Source field: {fact.sourceField}
                        {fact.sourceRecordType ? ` (${fact.sourceRecordType})` : ''}
                      </p>
                    )}
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      {SOURCE_TYPE_LABEL[fact.sourceType] ?? fact.sourceType}
                      {fact.observedAt ? ` · as of ${formatDate(fact.observedAt)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onCompare(component.id)}
            aria-label={`Compare repair, replace, and upgrade options for ${component.label ?? COMPONENT_LABEL[component.componentType]}`}
          >
            Compare options for this system
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// SUGGESTION CARD
// ============================================================================

function SuggestionCard({
  suggestion,
  onClick,
}: {
  suggestion: ScenarioSuggestionDTO;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View suggestion: ${suggestion.title}`}
      className="block w-full text-left"
    >
      <MobileCard
        variant="standard"
        className="transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <StatusChip tone={URGENCY_TONE[suggestion.urgency]}>
            {URGENCY_LABEL[suggestion.urgency]}
          </StatusChip>
          <StatusChip tone="info">{SCENARIO_TYPE_LABEL[suggestion.scenarioType]}</StatusChip>
        </div>
        <p className="mb-1 text-base font-semibold leading-tight">{suggestion.title}</p>
        <p className="mb-2 line-clamp-2 text-sm leading-[1.45] text-[hsl(var(--mobile-text-secondary))]">
          {suggestion.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
          {suggestion.estimatedUpfrontCost != null && (
            <span>
              <span className="font-normal">Est. upfront: </span>
              <span className="font-medium text-[hsl(var(--foreground))]">
                {formatUSD(suggestion.estimatedUpfrontCost)}
              </span>
            </span>
          )}
        </div>
      </MobileCard>
    </button>
  );
}

// ============================================================================
// SUGGESTION DETAIL SHEET
// ============================================================================

function SuggestionDetailSheet({
  suggestion,
  propertyId,
  open,
  onOpenChange,
  onRunScenario,
  isRunning,
}: {
  suggestion: ScenarioSuggestionDTO | null;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunScenario: (s: ScenarioSuggestionDTO) => void;
  isRunning: boolean;
}) {
  // What's known/missing for THIS decision specifically — not the twin's
  // global completeness score. See HDT-008: different decisions need
  // different evidence, so this is scoped to the one component/type.
  const { data: readiness } = useQuery({
    queryKey: ['home-digital-twin-scenario-readiness', propertyId, suggestion?.componentId, suggestion?.componentType, suggestion?.scenarioType],
    queryFn: () =>
      getDigitalTwinScenarioReadiness(propertyId, {
        scenarioType: suggestion!.scenarioType,
        componentId: suggestion?.componentId ?? undefined,
        componentType: suggestion?.componentType ?? undefined,
      }),
    enabled: open && !!suggestion,
  });

  if (!suggestion) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">{suggestion.title}</SheetTitle>
          <SheetDescription className="sr-only">
            What-if scenario suggestion: {suggestion.title}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5">
          {/* Urgency + type */}
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={URGENCY_TONE[suggestion.urgency]}>
              {URGENCY_LABEL[suggestion.urgency]}
            </StatusChip>
            <StatusChip tone="info">{SCENARIO_TYPE_LABEL[suggestion.scenarioType]}</StatusChip>
          </div>

          {/* What's known/missing for this specific decision */}
          {readiness && readiness.missing.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Before you trust this estimate
              </h3>
              <ul className="space-y-1">
                {readiness.missing.map((m) => (
                  <li key={m.field} className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                    {m.whyItMatters}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
              Why this matters
            </h3>
            <p className="text-sm leading-[1.5]">{suggestion.description}</p>
          </div>

          {/* Reason */}
          {suggestion.reason && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Based on your home data
              </h3>
              <p className="text-sm leading-[1.5] text-[hsl(var(--foreground))]">
                {suggestion.reason}
              </p>
            </div>
          )}

          {/* Estimated cost */}
          {suggestion.estimatedUpfrontCost != null && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Estimated upfront cost
              </h3>
              <p className="text-sm font-semibold">{formatUSD(suggestion.estimatedUpfrontCost)}</p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                Rough estimate — actual cost depends on your home, local market, and contractor.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            This is a suggested scenario based on modeled component data. Running it will create a
            draft &ldquo;what if&rdquo; scenario you can review — nothing is committed or scheduled.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <Button
            className="w-full gap-2"
            onClick={() => onRunScenario(suggestion)}
            disabled={isRunning}
            aria-label={`Run what-if scenario: ${suggestion.title}`}
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isRunning ? 'Creating scenario…' : 'Run What-If Scenario'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// GROUPED SCENARIO COMPARISONS
// ============================================================================

type ScenarioFilter = 'ALL' | 'NEEDS_RESULTS' | 'CALCULATED' | 'SELECTED';

type ScenarioComparisonGroup = {
  key: string;
  label: string;
  componentType: HomeTwinComponentType | null;
  scenarios: HomeTwinScenarioDTO[];
  updatedAt: string;
  computedCount: number;
  selectedCount: number;
  pendingCount: number;
};

const SCENARIO_FILTER_LABEL: Record<ScenarioFilter, string> = {
  ALL: 'All',
  NEEDS_RESULTS: 'Needs results',
  CALCULATED: 'Calculated',
  SELECTED: 'Selected',
};

function scenarioMatchesFilter(scenario: HomeTwinScenarioDTO, filter: ScenarioFilter): boolean {
  if (filter === 'NEEDS_RESULTS') {
    return scenario.status !== 'COMPUTED' || !!scenario.staleAt || isActiveScenarioRun(scenario.latestRun);
  }
  if (filter === 'CALCULATED') return scenario.status === 'COMPUTED' && !scenario.staleAt;
  if (filter === 'SELECTED') return scenario.decisionStatus === 'SELECTED';
  return true;
}

function buildScenarioComparisonGroups(scenarios: HomeTwinScenarioDTO[]): ScenarioComparisonGroup[] {
  const groups = new Map<string, HomeTwinScenarioDTO[]>();
  for (const scenario of scenarios) {
    const key = scenario.componentId ?? 'WHOLE_HOME';
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }

  return Array.from(groups.entries())
    .map(([key, groupedScenarios]) => {
      const sorted = [...groupedScenarios].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      const component = sorted.find((scenario) => scenario.component)?.component ?? null;
      return {
        key,
        label: component?.label ?? (component ? COMPONENT_LABEL[component.componentType] : 'Whole-home plans'),
        componentType: component?.componentType ?? null,
        scenarios: sorted,
        updatedAt: sorted[0]?.updatedAt ?? '',
        computedCount: sorted.filter((scenario) => scenario.status === 'COMPUTED' && !scenario.staleAt).length,
        selectedCount: sorted.filter((scenario) => scenario.decisionStatus === 'SELECTED').length,
        pendingCount: sorted.filter((scenario) => isActiveScenarioRun(scenario.latestRun)).length,
      };
    })
    .sort((a, b) => {
      const aPriority = (a.selectedCount > 0 ? 4 : 0) + (a.pendingCount > 0 ? 2 : 0) +
        (a.scenarios.some((scenario) => scenario.isPinned) ? 1 : 0);
      const bPriority = (b.selectedCount > 0 ? 4 : 0) + (b.pendingCount > 0 ? 2 : 0) +
        (b.scenarios.some((scenario) => scenario.isPinned) ? 1 : 0);
      if (aPriority !== bPriority) return bPriority - aPriority;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

function ScenarioOptionRow({
  scenario,
  onClick,
}: {
  scenario: HomeTwinScenarioDTO;
  onClick: () => void;
}) {
  const statusTone =
    scenario.status === 'COMPUTED'
      ? 'good'
      : scenario.status === 'FAILED'
        ? 'danger'
        : 'info';

  const cost = scenario.impacts.find((i) => i.impactType === 'UPFRONT_COST' && !i.isUserSupplied);
  const savings = scenario.impacts.find((i) => i.impactType === 'ANNUAL_SAVINGS' && !i.isUserSupplied);
  const payback = scenario.impacts.find((i) => i.impactType === 'PAYBACK_PERIOD' && !i.isUserSupplied);
  const activeRun = isActiveScenarioRun(scenario.latestRun);
  const ScenarioIcon =
    scenario.scenarioType === 'WAIT_MONITOR'
      ? Clock3
      : scenario.scenarioType === 'MAINTAIN_COMPONENT' || scenario.scenarioType === 'REPAIR_COMPONENT'
        ? Wrench
        : TrendingUp;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View scenario: ${scenario.name}`}
      className="group block w-full rounded-xl text-left premium-focus"
    >
      <div
        className={cn(
          'rounded-xl border bg-white px-3 py-3 transition-colors group-hover:border-teal-300 group-hover:bg-teal-50/30',
          scenario.decisionStatus === 'SELECTED'
            ? 'border-teal-300 bg-teal-50/40'
            : 'border-slate-200',
        )}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(76px,0.55fr))_32px] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <ScenarioIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-950">{scenario.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusChip tone={statusTone} className="px-2 py-0.5">
                  {activeRun
                    ? scenario.latestRun?.status === 'RUNNING' ? 'Calculating' : 'Queued'
                    : SCENARIO_STATUS_LABEL[scenario.status] ?? scenario.status}
                </StatusChip>
                {scenario.decisionStatus !== 'OPEN' && (
                  <StatusChip tone={DECISION_STATUS_TONE[scenario.decisionStatus]} className="px-2 py-0.5">
                    {DECISION_STATUS_LABEL[scenario.decisionStatus]}
                  </StatusChip>
                )}
                {scenario.isPinned && <span className="text-[11px] font-medium text-teal-700">Pinned</span>}
              </div>
            </div>
          </div>
          {[
            { label: 'Upfront', value: formatImpactDisplay(cost) },
            { label: 'Savings / yr', value: formatImpactDisplay(savings) },
            { label: 'Payback', value: formatImpactDisplay(payback) },
          ].map((metric) => (
            <div key={metric.label} className="min-w-0 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
              <p className="text-[11px] text-slate-500">{metric.label}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-900">{metric.value}</p>
            </div>
          ))}
          <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-700 sm:flex">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  );
}

function ScenarioComparisonGroupCard({
  group,
  filter,
  expanded,
  onToggle,
  onOpenScenario,
}: {
  group: ScenarioComparisonGroup;
  filter: ScenarioFilter;
  expanded: boolean;
  onToggle: () => void;
  onOpenScenario: (scenarioId: string) => void;
}) {
  const visibleScenarios = group.scenarios.filter((scenario) => scenarioMatchesFilter(scenario, filter));
  const GroupIcon = group.componentType ? COMPONENT_ICON[group.componentType] : Home;
  const needsResultsCount = group.scenarios.filter((scenario) => scenarioMatchesFilter(scenario, 'NEEDS_RESULTS')).length;

  return (
    <article
      role="listitem"
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-[0_16px_38px_-32px_rgba(15,23,42,0.75)]',
        expanded ? 'border-teal-300 ring-2 ring-teal-500/10' : 'border-slate-200',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} comparisons for ${group.label}`}
        className="flex w-full items-center gap-3 px-4 py-4 text-left premium-focus"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
          <GroupIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{group.label}</h3>
            {group.selectedCount > 0 && <StatusChip tone="good">Selected</StatusChip>}
            {group.pendingCount > 0 && <StatusChip tone="info">Updating</StatusChip>}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {group.scenarios.length} {group.scenarios.length === 1 ? 'option' : 'options'} ·{' '}
            {group.computedCount} calculated
            {needsResultsCount > 0 ? ` · ${needsResultsCount} need results` : ''}
          </p>
        </div>
        <span className="text-right">
          <span className="block text-[11px] font-medium text-slate-500">Updated</span>
          <span className="block text-xs font-semibold text-slate-700">{formatDate(group.updatedAt)}</span>
        </span>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600">
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/60 p-3">
          {visibleScenarios.length > 0 ? (
            <div className="space-y-2" role="list" aria-label={`${group.label} comparison options`}>
              {visibleScenarios.map((scenario) => (
                <div key={scenario.id} role="listitem">
                  <ScenarioOptionRow
                    scenario={scenario}
                    onClick={() => onOpenScenario(scenario.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-600">
              No options in this group match the selected filter.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

// ============================================================================
// SCENARIO DETAIL SHEET
// ============================================================================

type ScenarioAssumptionField = {
  key: string;
  label: string;
  type?: 'number' | 'date';
  scope?: 'root' | 'assumptions';
  step?: string;
  min?: string;
};

function ScenarioOutcomeSummary({ scenario }: { scenario: HomeTwinScenarioDTO }) {
  const metrics = [
    {
      label: 'Upfront cost',
      impact: scenario.impacts.find((impact) => impact.impactType === 'UPFRONT_COST' && !impact.isUserSupplied),
      Icon: CircleDollarSign,
    },
    {
      label: 'Annual savings',
      impact: scenario.impacts.find((impact) => impact.impactType === 'ANNUAL_SAVINGS' && !impact.isUserSupplied),
      Icon: TrendingUp,
    },
    {
      label: 'Payback',
      impact: scenario.impacts.find((impact) => impact.impactType === 'PAYBACK_PERIOD' && !impact.isUserSupplied),
      Icon: CalendarClock,
    },
  ];
  const hasResults = metrics.some(({ impact }) => impact);

  return (
    <section
      aria-labelledby="scenario-outcome-heading"
      className="shrink-0 overflow-hidden rounded-2xl border border-teal-200/80 bg-[linear-gradient(145deg,#f0fdfa_0%,#ffffff_52%,#eff6ff_100%)] p-4 shadow-[0_18px_42px_-34px_rgba(15,118,110,0.55)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">
            Decision snapshot
          </p>
          <h3 id="scenario-outcome-heading" className="mt-1 text-lg font-semibold text-slate-950">
            {hasResults ? 'What this option could mean' : 'Ready to compare this option'}
          </h3>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-md shadow-teal-900/15">
          <Gauge className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map(({ label, impact, Icon }) => (
          <div key={label} className="rounded-xl border border-white/90 bg-white/80 p-3 shadow-sm">
            <Icon className="mb-2 h-4 w-4 text-teal-700" aria-hidden="true" />
            <p className="text-[11px] font-medium text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-950">
              {formatImpactDisplay(impact)}
            </p>
          </div>
        ))}
      </div>
      {!hasResults && (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Calculate this option to see a home-specific cost range, savings, timing, and the evidence behind them.
        </p>
      )}
    </section>
  );
}

function scenarioAssumptionFields(type: HomeTwinScenarioType): ScenarioAssumptionField[] {
  if (type === 'MAINTAIN_COMPONENT') {
    return [
      { key: 'maintenanceCost', label: 'Maintenance estimate ($)' },
      { key: 'serviceIntervalMonths', label: 'Service interval (months)', step: '1' },
    ];
  }
  if (type === 'REPAIR_COMPONENT') {
    return [
      { key: 'repairCost', label: 'Repair estimate ($)' },
      { key: 'extendedLifeYears', label: 'Expected planning extension (years)', step: '0.5' },
    ];
  }
  if (type === 'REPLACE_COMPONENT' || type === 'UPGRADE_COMPONENT') {
    return [
      { key: 'replacementCost', label: 'Project estimate ($)' },
      { key: 'newUsefulLifeYears', label: 'Expected lifespan (years)', step: '1' },
      { key: 'annualSavings', label: 'Expected annual savings ($)' },
      { key: 'efficiencyGainPercent', label: 'Efficiency improvement (%)' },
      { key: 'decisionDate', label: 'Planned decision date', type: 'date' },
      { key: 'energyPriceEscalationPercent', label: 'Energy-price change per year (%)', min: '-20' },
      { key: 'incentiveAmount', label: 'Expected incentive ($)' },
      { key: 'financingAprPercent', label: 'Financing APR (%)' },
      { key: 'financingTermMonths', label: 'Financing term (months)', step: '1' },
      { key: 'downPayment', label: 'Down payment ($)' },
    ];
  }
  if (type === 'WAIT_MONITOR') {
    return [{ key: 'reviewMonths', label: 'Review again in (months)', scope: 'root', step: '1' }];
  }
  if (type === 'ENERGY_IMPROVEMENT') {
    return [
      { key: 'upfrontCost', label: 'Project estimate ($)', scope: 'root' },
      { key: 'energySavingsPerYear', label: 'Expected annual energy savings ($)', scope: 'root' },
      { key: 'carbonOffsetTonsCO2PerYear', label: 'Annual carbon reduction (tons)', scope: 'root', step: '0.1' },
    ];
  }
  if (type === 'RESILIENCE_IMPROVEMENT') {
    return [
      { key: 'upfrontCost', label: 'Project estimate ($)', scope: 'root' },
      { key: 'riskReductionPercent', label: 'Expected risk reduction (%)', scope: 'root' },
      { key: 'estimatedInsuranceSavingsPerYear', label: 'Expected insurance savings ($/year)', scope: 'root' },
    ];
  }
  return [
    { key: 'upfrontCost', label: 'Project estimate ($)', scope: 'root' },
    { key: 'annualSavings', label: 'Expected annual savings ($)', scope: 'root' },
  ];
}

function snapshotChanged(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

function ScenarioDetailSheet({
  scenario,
  propertyId,
  open,
  onOpenChange,
  onCompute,
  onPin,
  onArchive,
  onDecide,
  onRename,
  onUpdateAssumptions,
  onDelete,
  isComputing,
  isUpdating,
  isDeciding,
  isDeleting,
}: {
  scenario: HomeTwinScenarioDTO | null;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompute: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDecide: (id: string, decisionStatus: HomeTwinScenarioDecisionStatus, decisionReason: string | null) => void;
  onRename: (id: string, name: string) => void;
  onUpdateAssumptions: (id: string, inputPayload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  isComputing: boolean;
  isUpdating: boolean;
  isDeciding: boolean;
  isDeleting: boolean;
}) {
  const [decisionReason, setDecisionReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [assumptionsDraft, setAssumptionsDraft] = useState<Record<string, unknown>>({});
  const [assumptionsError, setAssumptionsError] = useState<string | null>(null);

  const { data: handoff } = useQuery({
    queryKey: ['home-digital-twin-scenario-handoff', propertyId, scenario?.id],
    queryFn: () => getDigitalTwinScenarioHandoff(propertyId, scenario?.id ?? ''),
    enabled: open && !!scenario,
  });
  const { data: computationRuns = [] } = useQuery({
    queryKey: ['home-digital-twin-scenario-runs', propertyId, scenario?.id],
    queryFn: () => listDigitalTwinScenarioRuns(propertyId, scenario?.id ?? ''),
    enabled: open && !!scenario,
    refetchInterval: (query) => {
      const runs = query.state.data;
      return isActiveScenarioRun(runs?.[0])
        ? 2000
        : false;
    },
  });

  useEffect(() => {
    setDecisionReason(scenario?.decisionReason ?? '');
    setReasonError(null);
    setNameDraft(scenario?.name ?? '');
    setAssumptionsDraft({ ...(scenario?.inputPayload ?? {}) });
    setAssumptionsError(null);
  }, [scenario?.decisionReason, scenario?.id, scenario?.inputPayload, scenario?.name, scenario?.updatedAt]);

  if (!scenario) return null;

  const handleDelete = () => {
    if (window.confirm(`Permanently delete "${scenario.name}"? This cannot be undone.`)) {
      onDelete(scenario.id);
    }
  };

  const handleDecide = (decisionStatus: HomeTwinScenarioDecisionStatus) => {
    if ((decisionStatus === 'DEFERRED' || decisionStatus === 'REJECTED') && !decisionReason.trim()) {
      setReasonError('Add a reason before deferring or rejecting.');
      return;
    }
    setReasonError(null);
    onDecide(scenario.id, decisionStatus, decisionReason.trim() || null);
  };

  const computationPending = isActiveScenarioRun(scenario.latestRun);
  const canCompute = !computationPending && (scenario.status === 'DRAFT' || scenario.status === 'READY');
  const assumptionFields = scenarioAssumptionFields(scenario.scenarioType);
  const updateAssumptionField = (field: ScenarioAssumptionField, rawValue: string) => {
    setAssumptionsDraft((current) => {
      const next = { ...current };
      const parsedValue =
        rawValue === '' ? undefined : field.type === 'date' ? rawValue : Number(rawValue);
      if (field.scope === 'root') {
        if (parsedValue === undefined) delete next[field.key];
        else next[field.key] = parsedValue;
      } else {
        const assumptions = {
          ...((next.assumptions as Record<string, unknown> | undefined) ?? {}),
        };
        if (parsedValue === undefined) delete assumptions[field.key];
        else assumptions[field.key] = parsedValue;
        next.assumptions = assumptions;
      }
      return next;
    });
    setAssumptionsError(null);
  };
  const assumptionValue = (field: ScenarioAssumptionField) => {
    const value = field.scope === 'root'
      ? assumptionsDraft[field.key]
      : ((assumptionsDraft.assumptions as Record<string, unknown> | undefined) ?? {})[field.key];
    return value == null ? '' : String(value);
  };
  const statusTone =
    scenario.status === 'COMPUTED'
      ? 'good'
      : scenario.status === 'FAILED'
        ? 'danger'
        : 'info';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-l-slate-200 bg-[#fbfcfb] p-0 shadow-[0_0_80px_-30px_rgba(15,23,42,0.55)] sm:max-w-xl">
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4">
          <SheetTitle className="pr-10 text-lg text-slate-950">{scenario.name}</SheetTitle>
          <SheetDescription className="sr-only">
            Scenario details for {scenario.name}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5 sm:px-6">
          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={statusTone}>
              {computationPending
                ? scenario.latestRun?.status === 'RUNNING' ? 'Calculating' : 'Queued'
                : SCENARIO_STATUS_LABEL[scenario.status] ?? scenario.status}
            </StatusChip>
            <StatusChip tone="info">{SCENARIO_TYPE_LABEL[scenario.scenarioType]}</StatusChip>
            <StatusChip tone={DECISION_STATUS_TONE[scenario.decisionStatus]}>
              {DECISION_STATUS_LABEL[scenario.decisionStatus]}
            </StatusChip>
          </div>

          <ScenarioOutcomeSummary scenario={scenario} />

          {computationPending && (
            <div role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-900">
                {scenario.latestRun?.status === 'RUNNING' ? 'Calculating this option' : 'Calculation queued'}
              </p>
              <p className="text-xs text-blue-800">
                This view will refresh automatically when the calculation finishes.
              </p>
            </div>
          )}

          {scenario.staleAt && !computationPending && (
            <div role="status" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-900">Results need refreshing</p>
              <p className="text-xs text-amber-800">
                {scenario.staleReason ?? 'Home facts or assumptions changed after this option was computed.'}
              </p>
            </div>
          )}

          {computationRuns[0] && (
            <details className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-[hsl(var(--mobile-text-secondary))]">
                Evidence used for latest calculation
              </summary>
              <div className="mt-2 space-y-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
                <p>Model: {computationRuns[0].modelVersion}</p>
                <p>Started: {formatDate(computationRuns[0].startedAt)}</p>
                {computationRuns[1] && (
                  <p className="font-medium text-[hsl(var(--foreground))]">
                    Changed since the previous run:{' '}
                    {[
                      snapshotChanged(computationRuns[0].inputSnapshot, computationRuns[1].inputSnapshot) ? 'inputs' : null,
                      snapshotChanged(computationRuns[0].sourceSnapshot, computationRuns[1].sourceSnapshot) ? 'source facts' : null,
                      snapshotChanged(computationRuns[0].outputSnapshot, computationRuns[1].outputSnapshot) ? 'outputs' : null,
                    ].filter(Boolean).join(', ') || 'no preserved values'}
                  </p>
                )}
                {[
                  ['Inputs and assumptions', computationRuns[0].inputSnapshot],
                  ['Source facts', computationRuns[0].sourceSnapshot],
                  ['Outputs', computationRuns[0].outputSnapshot],
                ].map(([label, snapshot]) => (
                  <details key={String(label)} className="rounded-lg bg-[hsl(var(--mobile-bg-muted))] px-2.5 py-2">
                    <summary className="cursor-pointer font-medium text-[hsl(var(--foreground))]">
                      {String(label)}
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px]">
                      {JSON.stringify(snapshot ?? null, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </details>
          )}

          {/* Decision — select / defer / reject / close, with a recorded reason */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Your decision</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">
                Does this option fit your plan?
              </h3>
            </div>
            {scenario.decisionReason && (
              <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                &ldquo;{scenario.decisionReason}&rdquo;
                {scenario.decidedAt ? ` — ${formatDate(scenario.decidedAt)}` : ''}
              </p>
            )}
            <textarea
              className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-transparent px-2.5 py-1.5 text-xs"
              rows={2}
              placeholder="Reason (required to defer or reject)"
              value={decisionReason}
              onChange={(e) => {
                setDecisionReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              aria-label="Decision reason"
            />
            {reasonError && <p className="text-xs text-red-600">{reasonError}</p>}
            <div className="grid grid-cols-2 gap-2">
              {(['SELECTED', 'DEFERRED', 'REJECTED', 'CLOSED'] as HomeTwinScenarioDecisionStatus[]).map((status) => (
                <Button
                  key={status}
                  variant={
                    scenario.decisionStatus === status || (status === 'SELECTED' && scenario.decisionStatus === 'OPEN')
                      ? 'default'
                      : 'outline'
                  }
                  size="sm"
                  className={cn(
                    'min-w-[90px] rounded-xl',
                    status === 'SELECTED' &&
                      scenario.decisionStatus === 'OPEN' &&
                      'bg-teal-700 text-white hover:bg-teal-800',
                  )}
                  disabled={isDeciding}
                  onClick={() => handleDecide(status)}
                  aria-label={`Mark this option as ${DECISION_STATUS_LABEL[status].toLowerCase()}`}
                >
                  {DECISION_STATUS_LABEL[status]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Assumptions</p>
              <h3 className="mt-1 text-base font-semibold text-slate-950">Tune the comparison</h3>
              <p className="mt-1 text-xs text-slate-600">
                Adjust the values used for this option, save, then recompute.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {assumptionFields.map((field) => (
                <label key={`${field.scope ?? 'assumptions'}:${field.key}`} className="space-y-1 text-xs">
                  <span className="text-[hsl(var(--mobile-text-secondary))]">{field.label}</span>
                  <input
                    type={field.type ?? 'number'}
                    min={field.type === 'number' ? (field.min ?? '0') : undefined}
                    step={field.step ?? (field.type === 'number' ? '0.01' : undefined)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/15"
                    value={assumptionValue(field)}
                    onChange={(event) => updateAssumptionField(field, event.target.value)}
                    aria-label={field.label}
                  />
                </label>
              ))}
            </div>
            {assumptionsError && (
              <p id="scenario-assumptions-error" role="alert" className="text-xs text-red-600">
                {assumptionsError}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={isUpdating}
              onClick={() => onUpdateAssumptions(scenario.id, assumptionsDraft)}
            >
              Save assumptions
            </Button>
          </div>

          {/* Handoff — act on the decision without re-entering what's already known */}
          {handoff && (scenario.decisionStatus === 'SELECTED' || handoff.actualOutcome) && (
            <div className="space-y-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Next step
              </h3>
              {handoff.actualOutcome && (
                <div className="rounded-lg bg-[hsl(var(--mobile-bg-muted))] px-2.5 py-2 space-y-0.5">
                  <p className="text-xs font-medium text-[hsl(var(--mobile-text-primary))]">How it turned out</p>
                  <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                    Actual cost: {formatUSD(handoff.actualOutcome.actualCostCents / 100)}
                    {handoff.actualOutcome.projectedCostLow != null && handoff.actualOutcome.projectedCostHigh != null && (
                      <> — projected {formatUSD(handoff.actualOutcome.projectedCostLow)}–{formatUSD(handoff.actualOutcome.projectedCostHigh)}</>
                    )}
                  </p>
                  {handoff.actualOutcome.projectedCostSourceClass === 'HOMEOWNER_ASSUMPTION' && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      The projected range came from your planning estimate.
                    </p>
                  )}
                  {handoff.actualOutcome.varianceCents != null && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      {handoff.actualOutcome.varianceCents > 0 ? 'Over' : handoff.actualOutcome.varianceCents < 0 ? 'Under' : 'Matched'} estimate by{' '}
                      {formatUSD(Math.abs(handoff.actualOutcome.varianceCents) / 100)}
                    </p>
                  )}
                </div>
              )}
              {handoff.linkedProject ? (
                <Link
                  href={`/dashboard/properties/${propertyId}/projects/${handoff.linkedProject.id}`}
                  className="block text-sm font-medium text-[hsl(var(--mobile-brand-strong))] underline-offset-2 hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_view_linked_project' })}
                >
                  View project: {handoff.linkedProject.name}
                </Link>
              ) : (
                <Link
                  href={handoff.createProjectHref}
                  className="block"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_create_project' })}
                >
                  <Button variant="outline" size="sm" className="w-full">
                    Create project from this decision
                  </Button>
                </Link>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                <Link
                  href={handoff.handoffLinks.servicePriceRadar}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_service_price_radar' })}
                >
                  Review quotes
                </Link>
                <Link
                  href={handoff.handoffLinks.inspection}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_inspection' })}
                >
                  Get an inspection
                </Link>
                <Link
                  href={handoff.handoffLinks.renovationAdvisor}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_renovation_advisor' })}
                >
                  Check renovation risk
                </Link>
                <Link
                  href={handoff.handoffLinks.incentives}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_incentives' })}
                >
                  Find incentives
                </Link>
                <Link
                  href={handoff.handoffLinks.reserveFund}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_reserve_fund' })}
                >
                  Check reserve fund
                </Link>
                <Link
                  href={handoff.handoffLinks.capitalTimeline}
                  className="text-xs text-[hsl(var(--mobile-brand-strong))] hover:underline"
                  onClick={() => track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'handoff_capital_timeline' })}
                >
                  View capital timeline
                </Link>
              </div>
            </div>
          )}

          {/* Category-specific professional/safety boundary */}
          {scenario.safetyBoundary && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-xs leading-snug text-amber-800">{scenario.safetyBoundary}</p>
            </div>
          )}

          {/* Rename */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
              Name
            </h3>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-transparent px-2.5 py-1.5 text-sm"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label="Scenario name"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdating || !nameDraft.trim() || nameDraft.trim() === scenario.name}
                onClick={() => onRename(scenario.id, nameDraft.trim())}
                aria-label="Save name"
              >
                Save
              </Button>
            </div>
          </div>

          {/* Description */}
          {scenario.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Description
              </h3>
              <DescriptionPointList description={scenario.description} />
            </div>
          )}

          {/* Computed impacts */}
          {scenario.status === 'COMPUTED' && scenario.impacts.length > 0 && (() => {
            const computedImpacts = scenario.impacts.filter(
              (i) => i.impactType !== 'CUSTOM' && !i.isUserSupplied,
            );
            const userSuppliedImpacts = scenario.impacts.filter((i) => i.isUserSupplied);
            const planningNotes = scenario.impacts.filter(
              (i) => i.impactType === 'CUSTOM' && !i.isUserSupplied && i.valueText,
            );

            const formatImpactValue = (impact: HomeTwinScenarioImpactDTO, value: number) =>
              impact.unit === 'USD'
                ? formatUSD(value)
                : impact.unit === 'PERCENT'
                  ? `${value}%`
                  : `${value}${impact.unit ? ` ${impact.unit.toLowerCase()}` : ''}`;

            const renderImpactRow = (impact: HomeTwinScenarioImpactDTO) => {
              const hasRange =
                impact.valueLow != null && impact.valueHigh != null && impact.valueLow !== impact.valueHigh;
              const sourceLabel = {
                HOMEOWNER_ASSUMPTION: 'Input assumption',
                CANONICAL_RECORD: 'Home Record',
                SYSTEM_CALCULATION: 'Planning calculation',
                CATEGORY_DEFAULT: 'Category default',
              }[impact.sourceClass] ?? 'Planning source';
              return (
                <div key={impact.id} className="space-y-0.5 rounded-lg border border-[hsl(var(--mobile-border-subtle))] px-2.5 py-2">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-[hsl(var(--mobile-text-secondary))]">
                      {IMPACT_TYPE_LABEL[impact.impactType] ?? impact.impactType}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-medium text-right',
                        impact.direction === 'POSITIVE'
                          ? 'text-green-700'
                          : impact.direction === 'NEGATIVE'
                            ? 'text-red-600'
                            : 'text-[hsl(var(--foreground))]',
                      )}
                    >
                      {impact.impactType === 'PAYBACK_PERIOD' && impact.valueText
                        ? impact.valueText
                        : impact.impactType === 'COMFORT_IMPACT' && impact.valueText
                          ? impact.valueText
                          : hasRange
                            ? `${formatImpactValue(impact, impact.valueLow!)}–${formatImpactValue(impact, impact.valueHigh!)}`
                            : impact.valueNumeric != null
                              ? formatImpactValue(impact, impact.valueNumeric)
                              : impact.valueText ?? '—'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
                    {sourceLabel}
                    {impact.sourceAsOf ? ` · as of ${formatDate(impact.sourceAsOf)}` : ''}
                    {impact.qualificationText ? ` · ${impact.qualificationText}` : ''}
                  </p>
                </div>
              );
            };

            return (
              <div className="space-y-3">
                {computedImpacts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                      Projected impacts
                    </h3>
                    <div className="space-y-1.5">{computedImpacts.map(renderImpactRow)}</div>
                    {scenario.lastComputedAt && (
                      <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                        Computed {formatDate(scenario.lastComputedAt)}
                      </p>
                    )}
                  </div>
                )}

                {planningNotes.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                      Planning notes
                    </h3>
                    <div className="space-y-1.5">{planningNotes.map(renderImpactRow)}</div>
                  </div>
                )}

                {userSuppliedImpacts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                      Input assumptions
                    </h3>
                    <div className="space-y-1.5">{userSuppliedImpacts.map(renderImpactRow)}</div>
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      These values were entered or calculated from input assumptions. They have not been independently verified.
                    </p>
                  </div>
                )}

                {/* Sensitivity — which assumption moves the payback estimate more */}
                {scenario.sensitivity.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                      What drives this range
                    </h3>
                    <div className="space-y-1">
                      {scenario.sensitivity.map((factor) => (
                        <div key={factor.assumption} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-[hsl(var(--mobile-text-secondary))]">{factor.assumption}</span>
                          <span className="font-medium">±{factor.swingYears.toFixed(1)} yrs on payback</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      If you&apos;re going to double-check one number before trusting this range, check the one with the larger swing.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Not yet computed notice */}
          {canCompute && (
            <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
              <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                This option has not been compared yet. Calculate it to see estimated
                impacts based on your home&apos;s current information.
              </p>
            </div>
          )}

          {/* Failed notice */}
          {scenario.status === 'FAILED' && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200/70 bg-red-50/80 px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              <p className="text-xs leading-snug text-red-700">
                The last compute run failed. Try running it again — if the problem persists, check
                that your home data is complete.
              </p>
            </div>
          )}

          <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            Scenario projections are estimates based on your home&apos;s modeled state and standard
            industry assumptions. They are not financial advice.
          </p>
        </div>

        {/* Footer actions */}
        <div className="border-t px-5 py-3 flex flex-col gap-2">
          {(canCompute || scenario.status === 'FAILED') && (
            <Button
              className="w-full gap-2"
              onClick={() => onCompute(scenario.id)}
              disabled={isComputing}
              aria-label="Run analysis for this scenario"
            >
              {isComputing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isComputing ? 'Computing…' : 'Compute Impacts'}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onPin(scenario.id, !scenario.isPinned)}
              disabled={isUpdating}
              aria-label={scenario.isPinned ? 'Unpin this scenario' : 'Pin this scenario'}
            >
              {scenario.isPinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-red-600 hover:text-red-700"
              onClick={() => onArchive(scenario.id, !scenario.isArchived)}
              disabled={isUpdating}
              aria-label={scenario.isArchived ? 'Restore this scenario' : 'Archive this scenario'}
            >
              {scenario.isArchived ? 'Restore' : 'Archive'}
            </Button>
          </div>
          {scenario.isArchived && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600 hover:text-red-700"
              onClick={handleDelete}
              disabled={isDeleting}
              aria-label="Delete this scenario permanently"
            >
              {isDeleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// COMPARE SCENARIOS SHEET
// ============================================================================

/**
 * Repair / replace / upgrade / wait, side by side — assembles whatever the
 * homeowner already created and computed via the normal scenario flow. Does
 * not compute anything new (see HDT-011).
 */
function CompareScenariosSheet({
  propertyId,
  componentId,
  open,
  onOpenChange,
}: {
  propertyId: string;
  componentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['home-digital-twin-scenario-comparison', propertyId, componentId],
    queryFn: () => compareDigitalTwinScenarios(propertyId, componentId ?? ''),
    enabled: open && !!componentId,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.options.some((option) => isActiveScenarioRun(option.latestRun))
        ? 2000
        : false;
    },
  });
  const ensureOptions = useMutation({
    mutationFn: () => ensureDigitalTwinComparisonOptions(propertyId, componentId ?? ''),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ['home-digital-twin-scenario-comparison', propertyId, componentId],
        result,
      );
      queryClient.invalidateQueries({
        queryKey: ['home-digital-twin-scenario-comparison', propertyId, componentId],
      });
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
    },
  });

  const keyImpact = (scenario: HomeTwinScenarioDTO, type: string) =>
    scenario.impacts.find((i) => i.impactType === type && !i.isUserSupplied);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-l-slate-200 bg-[#f8faf9] p-0 shadow-[0_0_90px_-30px_rgba(15,23,42,0.55)] sm:max-w-3xl">
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <SheetTitle className="pr-10 text-lg text-slate-950">
            {comparison ? `Compare options: ${comparison.component.label ?? COMPONENT_LABEL[comparison.component.componentType]}` : 'Compare options'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Side-by-side comparison of maintain, repair, replace, upgrade, and wait options.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5 sm:px-6" aria-live="polite">
          {isLoading && (
            <div className="animate-pulse motion-reduce:animate-none space-y-2">
              <div className="h-20 rounded-[22px] bg-gray-100" />
              <div className="h-20 rounded-[22px] bg-gray-100" />
            </div>
          )}

          {!isLoading && comparison && comparison.options.length < 5 && (
            <div className="overflow-hidden rounded-2xl border border-teal-200 bg-[linear-gradient(135deg,#ecfdf5,#eff6ff)] p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <Layers className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-950">Build the full decision set</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Add maintain, repair, replace, upgrade, and wait options so the tradeoffs are visible in one place.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => ensureOptions.mutate()}
                disabled={ensureOptions.isPending}
                className="mt-4 w-full rounded-xl bg-teal-700 hover:bg-teal-800"
              >
                {ensureOptions.isPending ? 'Building options…' : 'Complete comparison'}
              </Button>
            </div>
          )}

          {ensureOptions.isError && (
            <p role="alert" className="text-sm text-red-600">
              Could not build comparison options. Please try again.
            </p>
          )}

          {!isLoading && comparison && comparison.options.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
            {comparison.options.map((option) => {
              const cost = keyImpact(option, 'UPFRONT_COST');
              const savings = keyImpact(option, 'ANNUAL_SAVINGS');
              const payback = keyImpact(option, 'PAYBACK_PERIOD');
              const activeRun = isActiveScenarioRun(option.latestRun) ? option.latestRun : null;
              const isSelected = option.decisionStatus === 'SELECTED';
              return (
                <div
                  key={option.id}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_16px_38px_-32px_rgba(15,23,42,0.75)]',
                    isSelected ? 'border-teal-400 ring-2 ring-teal-500/10' : 'border-slate-200',
                  )}
                >
                  {isSelected && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-teal-500" aria-hidden="true" />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-700">
                        {SCENARIO_TYPE_LABEL[option.scenarioType]}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-slate-950">{option.name}</h3>
                    </div>
                    {isSelected && <StatusChip tone="good">Selected</StatusChip>}
                  </div>
                  {activeRun && (
                    <p role="status" className="mt-2 text-xs font-medium text-blue-700">
                      {activeRun.status === 'RUNNING' ? 'Calculating…' : 'Queued…'}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                    {[
                      { label: 'Upfront', value: formatImpactDisplay(cost) },
                      { label: 'Savings / yr', value: formatImpactDisplay(savings) },
                      { label: 'Payback', value: formatImpactDisplay(payback) },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <p className="text-slate-500">{metric.label}</p>
                        <p className="mt-1 break-words font-semibold text-slate-950">{metric.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs leading-snug text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Figures are planning ranges based on your Home Record and assumptions, not guaranteed quotes.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

export default function HomeDigitalTwinClient({
  propertyIdOverride,
}: {
  propertyIdOverride?: string;
} = {}) {
  const params = useParams<{ id: string }>();
  const propertyId = propertyIdOverride ?? params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const toolLaunchContext = useToolLaunchContext();
  const focusedEntityId = toolLaunchContext?.resolved.prefill.itemId ??
    toolLaunchContext?.resolved.prefill.entityId ??
    null;
  const consumedFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'home-digital-twin', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [suggestionSheetOpen, setSuggestionSheetOpen] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioSheetOpen, setScenarioSheetOpen] = useState(false);

  const [compareComponentId, setCompareComponentId] = useState<string | null>(null);
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);
  const [expandedScenarioGroupKey, setExpandedScenarioGroupKey] = useState<string | null>(null);
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>('ALL');
  const [showAllScenarioGroups, setShowAllScenarioGroups] = useState(false);

  // ── Twin query ──────────────────────────────────────────────────────────────
  const {
    data: twin,
    isLoading: twinLoading,
    isError: twinError,
    refetch: refetchTwin,
  } = useQuery({
    queryKey: ['home-digital-twin', propertyId],
    queryFn: () => getHomeDigitalTwin(propertyId),
    enabled: !!propertyId,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.recentScenarios.some((scenario) => isActiveScenarioRun(scenario.latestRun))
        ? 2000
        : false;
    },
  });

  // Data quality signals — measured separately from engagement (workflow_
  // started above). One signal per twin load, not per render.
  const dataQualitySignalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!twin || !propertyId) return;
    const signalKey = `${twin.id}:${twin.lastComputedAt}`;
    if (dataQualitySignalRef.current === signalKey) return;
    dataQualitySignalRef.current = signalKey;
    if (twin.staleReason) {
      track('data_quality_signal', { tool: 'home-digital-twin', propertyId, signalType: 'STALE' });
    } else if (twin.needsRecompute) {
      track('data_quality_signal', { tool: 'home-digital-twin', propertyId, signalType: 'NEEDS_RECOMPUTE' });
    }
    if (twin.completenessScore != null && twin.completenessScore < 0.35) {
      track('data_quality_signal', { tool: 'home-digital-twin', propertyId, signalType: 'DEGRADED' });
    }
  }, [twin, propertyId]);

  // ── Recommendations query ───────────────────────────────────────────────────
  const {
    data: recommendations,
    isLoading: recLoading,
  } = useQuery({
    queryKey: ['home-digital-twin-recommendations', propertyId],
    queryFn: () => getDigitalTwinRecommendations(propertyId),
    enabled: !!twin,
  });

  // Derive selected items from query data — always fresh
  const selectedSuggestion =
    recommendations?.find((s) => s.key === selectedSuggestionKey) ?? null;
  const selectedScenario =
    twin?.recentScenarios.find((s) => s.id === selectedScenarioId) ?? null;
  const scenarioGroups = useMemo(
    () => buildScenarioComparisonGroups(twin?.recentScenarios ?? []),
    [twin?.recentScenarios],
  );
  const filteredScenarioGroups = useMemo(
    () =>
      scenarioGroups.filter((group) =>
        group.scenarios.some((scenario) => scenarioMatchesFilter(scenario, scenarioFilter)),
      ),
    [scenarioFilter, scenarioGroups],
  );
  const visibleScenarioGroups = showAllScenarioGroups
    ? filteredScenarioGroups
    : filteredScenarioGroups.slice(0, 3);

  useEffect(() => {
    if (filteredScenarioGroups.length === 0) {
      setExpandedScenarioGroupKey(null);
      return;
    }
    if (!filteredScenarioGroups.some((group) => group.key === expandedScenarioGroupKey)) {
      setExpandedScenarioGroupKey(filteredScenarioGroups[0].key);
    }
  }, [expandedScenarioGroupKey, filteredScenarioGroups]);

  useEffect(() => {
    if (!focusedEntityId || !twin || consumedFocusRef.current === focusedEntityId) return;
    const component = twin.components.find((candidate) =>
      candidate.id === focusedEntityId || candidate.sourceReferenceId === focusedEntityId,
    );
    if (!component) return;
    consumedFocusRef.current = focusedEntityId;
    setCompareComponentId(component.id);
    setCompareSheetOpen(true);
    track('action_taken', {
      tool: 'home-digital-twin',
      propertyId,
      actionType: 'scenario_compare_opened',
    });
  }, [focusedEntityId, propertyId, twin]);

  // ── Init mutation ───────────────────────────────────────────────────────────
  const initMutation = useMutation({
    mutationFn: () => initHomeDigitalTwin(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin-recommendations', propertyId] });
      toast({ title: 'Planner ready', description: 'Your home data is ready for option comparisons.' });
    },
    onError: (error) =>
      toast({
        title: 'Could not build view',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      }),
  });

  // ── Refresh mutation ────────────────────────────────────────────────────────
  const refreshMutation = useMutation({
    mutationFn: () => refreshHomeDigitalTwin(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin-recommendations', propertyId] });
      toast({ title: 'Model updated', description: 'Your home model has been refreshed.' });
    },
    onError: (error) =>
      toast({
        title: 'Refresh failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      }),
  });

  // ── Create + compute scenario mutation ─────────────────────────────────────
  const runSuggestionMutation = useMutation({
    mutationFn: async (suggestion: ScenarioSuggestionDTO) => {
      const scenario = await createDigitalTwinScenario(propertyId, {
        name: suggestion.title,
        scenarioType: suggestion.scenarioType,
        description: suggestion.description,
        inputPayload: suggestion.suggestedInputPayload,
      });
      return computeDigitalTwinScenario(propertyId, scenario.id);
    },
    onSuccess: (scenario) => {
      setSuggestionSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      toast({
        title: 'Calculation queued',
        description: `"${scenario.name}" will refresh automatically when it is ready.`,
      });
      track('action_taken', { tool: 'home-digital-twin', actionType: 'queue_scenario', propertyId });
    },
    onError: (error) =>
      toast({
        title: 'Scenario failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      }),
  });

  // ── Compute scenario mutation ───────────────────────────────────────────────
  const computeMutation = useMutation({
    mutationFn: (scenarioId: string) => computeDigitalTwinScenario(propertyId, scenarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      toast({ title: 'Comparison queued', description: 'Results will refresh automatically.' });
    },
    onError: () =>
      toast({ title: 'Compute failed. Please try again.', variant: 'destructive' }),
  });

  // ── Update scenario mutation ────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isPinned?: boolean; isArchived?: boolean; name?: string; description?: string | null; inputPayload?: Record<string, unknown> } }) =>
      updateDigitalTwinScenario(propertyId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      if (variables.input.isArchived) {
        setScenarioSheetOpen(false);
      }
      if (variables.input.name) {
        toast({ title: 'Renamed', description: `Now called "${variables.input.name}".` });
      }
      if (variables.input.inputPayload) {
        toast({ title: 'Assumptions saved', description: 'Recompute this option to refresh its results.' });
      }
    },
    onError: () =>
      toast({ title: 'Could not update scenario. Please try again.', variant: 'destructive' }),
  });

  // ── Delete scenario mutation (permanent, archived-only) ─────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDigitalTwinScenario(propertyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      setScenarioSheetOpen(false);
      setSelectedScenarioId(null);
      toast({ title: 'Deleted', description: 'The option was permanently removed.' });
    },
    onError: (error) =>
      toast({
        title: 'Could not delete',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      }),
  });

  // ── Decision mutation (select / defer / reject / close) ────────────────────
  const decisionMutation = useMutation({
    mutationFn: ({
      id,
      decisionStatus,
      decisionReason,
    }: {
      id: string;
      decisionStatus: HomeTwinScenarioDecisionStatus;
      decisionReason: string | null;
    }) => recordDigitalTwinScenarioDecision(propertyId, id, { decisionStatus, decisionReason }),
    onSuccess: (scenario) => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      toast({
        title: 'Decision recorded',
        description: `Marked as ${DECISION_STATUS_LABEL[scenario.decisionStatus].toLowerCase()}.`,
      });
      track('action_taken', {
        tool: 'home-digital-twin',
        propertyId,
        actionType: `decision_${scenario.decisionStatus.toLowerCase()}`,
      });
    },
    onError: (error) =>
      toast({
        title: 'Could not record decision',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      }),
  });

  // Distinguish "not yet built" (API returned null) from "failed to load" (request error)
  const twinNotFound = !twinError && twin === null;
  const twinLoadError = twinError;
  const isRefreshing = refreshMutation.isPending;

  return (
    <MobilePageContainer className="space-y-5 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-[1440px] lg:px-8 lg:pb-12">
      {/* Back button */}
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to property
        </Link>
      </Button>

      {/* Page intro */}
      <MobilePageIntro
        eyebrow="Home tool"
        title="Home Upgrade Planner"
        subtitle="Compare repair, replacement, upgrade, and wait options using facts maintained in your Home Record."
        showOnDesktop
      />

      {/* Tool rail */}
      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      {/* Content states */}
      <div aria-live="polite" aria-busy={twinLoading}>
      {twinLoading ? (
        <DigitalTwinSkeleton />
      ) : twinLoadError ? (
        /* ── LOAD ERROR ─────────────────────────────────────────────────────── */
        <EmptyStateCard
          title="Couldn't load your home view"
          description="There was a problem loading your home model. This is usually temporary."
          action={
            <Button
              variant="outline"
              onClick={() => refetchTwin()}
              className="gap-2"
              aria-label="Retry loading home view"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </Button>
          }
        />
      ) : twinNotFound || !twin ? (
        /* ── NOT YET BUILT ──────────────────────────────────────────────────── */
        <EmptyStateCard
          title="Your planner isn't ready yet"
          description="Prepare your existing Home Record facts for repair and upgrade comparisons. This takes just a moment."
          action={
            <Button
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
              className="gap-2"
              aria-label="Build my home model"
            >
              {initMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Zap className="h-4 w-4" aria-hidden="true" />
              )}
              {initMutation.isPending ? 'Building view...' : 'Build my home view'}
            </Button>
          }
        />
      ) : (
        <div className="space-y-7">
          <TwinStatusCard
            twin={twin}
            onRefresh={() => refreshMutation.mutate()}
            isRefreshing={isRefreshing}
            onCompare={(componentId) => {
              setCompareComponentId(componentId);
              setCompareSheetOpen(true);
              track('action_taken', {
                tool: 'home-digital-twin',
                propertyId,
                actionType: 'scenario_compare_opened',
              });
            }}
          />

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)] lg:items-start">
            <MobileSection className="space-y-4">
              <MobileSectionHeader
                title="Your home systems"
                subtitle="Planning signals from your Home Record — choose a system to compare options"
                action={
                  <Button variant="ghost" size="sm" asChild className="hidden gap-1.5 text-teal-700 sm:flex">
                    <Link href={`/dashboard/properties/${propertyId}/inventory`}>
                      Edit Home Record
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                }
              />
              {twin.components.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="Systems available for option comparison">
                  {twin.components.map((component) => (
                    <ComponentCard
                      key={component.id}
                      component={component}
                      onClick={() => {
                        setCompareComponentId(component.id);
                        setCompareSheetOpen(true);
                        track('action_taken', {
                          tool: 'home-digital-twin',
                          propertyId,
                          actionType: 'scenario_compare_opened',
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  title="Add your first home system"
                  description="Track a roof, HVAC system, water heater, or another major system to begin comparing options."
                  action={
                    <Button asChild className="rounded-xl">
                      <Link href={`/dashboard/properties/${propertyId}/inventory`}>Open Home Record</Link>
                    </Button>
                  }
                />
              )}
            </MobileSection>

            <div className="space-y-6">
          {/* ── SUGGESTIONS ─────────────────────────────────────────────────── */}
          {recLoading && (
            <div className="animate-pulse motion-reduce:animate-none space-y-2">
              <div className="h-4 w-32 rounded bg-gray-100" />
              <div className="h-20 rounded-[22px] bg-gray-100" />
            </div>
          )}
          {!recLoading && recommendations && recommendations.length > 0 && (
            <MobileSection>
              <MobileSectionHeader
                title="Recommended next moves"
                subtitle="Evidence-bounded ideas worth exploring"
              />
              <div className="space-y-2" role="list" aria-label="Suggested what-if scenarios">
                {recommendations.map((s) => (
                  <div key={s.key} role="listitem">
                    <SuggestionCard
                      suggestion={s}
                      onClick={() => {
                        setSelectedSuggestionKey(s.key);
                        setSuggestionSheetOpen(true);
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="pt-1 text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                Planning suggestions use install dates and typical service-life windows. They are not failure predictions.
              </p>
            </MobileSection>
          )}

          {/* ── GROUPED COMPARISONS ────────────────────────────────────────── */}
          {scenarioGroups.length > 0 && (
            <MobileSection className="space-y-4">
              <MobileSectionHeader
                title="Your comparisons"
                subtitle={`${scenarioGroups.length} ${scenarioGroups.length === 1 ? 'system' : 'systems'} · ${twin.recentScenarios.length} saved options`}
              />
              <div
                className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
                role="group"
                aria-label="Filter saved comparisons"
              >
                {(Object.keys(SCENARIO_FILTER_LABEL) as ScenarioFilter[]).map((filter) => {
                  const count = twin.recentScenarios.filter((scenario) =>
                    scenarioMatchesFilter(scenario, filter),
                  ).length;
                  return (
                    <Button
                      key={filter}
                      type="button"
                      size="sm"
                      variant={scenarioFilter === filter ? 'default' : 'outline'}
                      className={cn(
                        'shrink-0 rounded-full',
                        scenarioFilter === filter && 'bg-teal-700 hover:bg-teal-800',
                      )}
                      onClick={() => {
                        setScenarioFilter(filter);
                        setShowAllScenarioGroups(false);
                      }}
                      aria-pressed={scenarioFilter === filter}
                    >
                      {SCENARIO_FILTER_LABEL[filter]}
                      <span className="ml-1 text-[11px] opacity-75">{count}</span>
                    </Button>
                  );
                })}
              </div>

              {filteredScenarioGroups.length > 0 ? (
                <>
                  <div className="space-y-3" role="list" aria-label="Saved comparisons grouped by home system">
                    {visibleScenarioGroups.map((group) => (
                      <ScenarioComparisonGroupCard
                        key={group.key}
                        group={group}
                        filter={scenarioFilter}
                        expanded={expandedScenarioGroupKey === group.key}
                        onToggle={() =>
                          setExpandedScenarioGroupKey((current) =>
                            current === group.key ? null : group.key,
                          )
                        }
                        onOpenScenario={(scenarioId) => {
                          setSelectedScenarioId(scenarioId);
                          setScenarioSheetOpen(true);
                        }}
                      />
                    ))}
                  </div>
                  {filteredScenarioGroups.length > 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={() => setShowAllScenarioGroups((current) => !current)}
                    >
                      {showAllScenarioGroups
                        ? 'Show recent systems only'
                        : `View ${filteredScenarioGroups.length - 3} more ${
                            filteredScenarioGroups.length - 3 === 1 ? 'system' : 'systems'
                          }`}
                    </Button>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
                  <p className="text-sm font-semibold text-slate-900">
                    No {SCENARIO_FILTER_LABEL[scenarioFilter].toLowerCase()} options
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Choose another filter to review the rest of your comparisons.
                  </p>
                </div>
              )}
            </MobileSection>
          )}

          {twin.recentScenarios.length === 0 && !recLoading && recommendations && recommendations.length === 0 && (
            <div className="rounded-2xl border border-dashed border-teal-300 bg-teal-50/50 p-6 text-center">
              <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-700 text-white">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-semibold text-slate-950">Choose a system to start</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                We&apos;ll build maintain, repair, replace, upgrade, and wait options side by side.
              </p>
            </div>
          )}
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">Your Home Record stays in control</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
                    This planner compares decisions. Correct system facts in Home Record, review current attention on Status Board,
                    and manage timing in Capital Timeline.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild className="rounded-xl">
                  <Link href={`/dashboard/properties/${propertyId}/inventory`}>Home Record</Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="rounded-xl">
                  <Link href={`/dashboard/properties/${propertyId}/status-board`}>Status Board</Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="rounded-xl">
                  <Link href={`/dashboard/properties/${propertyId}/tools/capital-timeline`}>Capital Timeline</Link>
                </Button>
              </div>
            </div>
          </section>

          {twin.context && (
            <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Data freshness and planning sources
              </summary>
              <div className="mt-3">
                <PropertyContextStatusNotice context={twin.context} title="Home data freshness" />
              </div>
            </details>
          )}
        </div>
      )}
      </div>

      {/* Sheets */}
      <CompareScenariosSheet
        propertyId={propertyId}
        componentId={compareComponentId}
        open={compareSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCompareSheetOpen(false);
            setCompareComponentId(null);
          }
        }}
      />

      <SuggestionDetailSheet
        suggestion={selectedSuggestion}
        propertyId={propertyId}
        open={suggestionSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSuggestionSheetOpen(false);
            setSelectedSuggestionKey(null);
          }
        }}
        onRunScenario={(s) => runSuggestionMutation.mutate(s)}
        isRunning={runSuggestionMutation.isPending}
      />

      <ScenarioDetailSheet
        scenario={selectedScenario}
        propertyId={propertyId}
        open={scenarioSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setScenarioSheetOpen(false);
            setSelectedScenarioId(null);
          }
        }}
        onCompute={(id) => computeMutation.mutate(id)}
        onPin={(id, pinned) => updateMutation.mutate({ id, input: { isPinned: pinned } })}
        onArchive={(id, archived) => updateMutation.mutate({ id, input: { isArchived: archived } })}
        onRename={(id, name) => updateMutation.mutate({ id, input: { name } })}
        onUpdateAssumptions={(id, inputPayload) => updateMutation.mutate({ id, input: { inputPayload } })}
        onDelete={(id) => deleteMutation.mutate(id)}
        onDecide={(id, decisionStatus, decisionReason) =>
          decisionMutation.mutate({ id, decisionStatus, decisionReason })
        }
        isComputing={computeMutation.isPending}
        isUpdating={updateMutation.isPending}
        isDeciding={decisionMutation.isPending}
        isDeleting={deleteMutation.isPending}
      />
    </MobilePageContainer>
  );
}
