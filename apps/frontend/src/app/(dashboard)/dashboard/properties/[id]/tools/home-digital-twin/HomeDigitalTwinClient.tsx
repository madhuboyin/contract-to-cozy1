'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { track } from '@/lib/analytics/events';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronRight,
  CheckCircle2,
  Droplets,
  FileCheck,
  Flame,
  Hammer,
  Home,
  Info,
  Landmark,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Square,
  Sun,
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
  MetricRow,
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
  deleteDigitalTwinScenario,
} from './homeDigitalTwinApi';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';
import HomeRecordReadinessCard from '../../components/HomeRecordReadinessCard';

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

// Every derived fact carries its own provenance — this must never read more
// confidently than the underlying source justifies.
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

function readinessLabel(score: number | null): string {
  if (score == null) return 'Unknown';
  if (score >= 0.70) return 'Good';
  if (score >= 0.35) return 'Partial';
  return 'Limited';
}

function readinessTone(score: number | null): 'good' | 'elevated' | 'info' {
  if (score == null) return 'info';
  if (score >= 0.70) return 'good';
  if (score >= 0.35) return 'elevated';
  return 'info';
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
}: {
  twin: HomeDigitalTwinDTO;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const isDegraded = twin.completenessScore != null && twin.completenessScore < 0.35;
  const isReturning = twin.recentScenarios.length > 0;

  return (
    <MobileCard variant="standard" className="space-y-3">
      {/* Stale — the last computed view no longer reflects current home data */}
      {twin.staleReason && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2.5"
        >
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-xs font-medium text-amber-900">This view may be out of date</p>
            <p className="text-xs leading-snug text-amber-800">{twin.staleReason}</p>
          </div>
        </div>
      )}

      {/* Dependency drift — your data changed since this was last computed */}
      {twin.needsRecompute && !twin.staleReason && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
            <p className="text-xs leading-snug text-[hsl(var(--mobile-text-primary))]">
              Your home data has changed since this view was last computed. Refresh to see current
              numbers.
            </p>
          </div>
        </div>
      )}

      {/* Degraded — too little data to be much more than a placeholder */}
      {isDegraded && !twin.staleReason && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mobile-text-secondary))]" aria-hidden="true" />
          <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            Your home model is mostly estimates right now. Add property and inventory details to
            replace defaults with real data.
          </p>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
            {isReturning ? 'Your Home Model — welcome back' : 'Your Home Model'}
          </p>
          <MetricRow
            label="Data readiness"
            value={
              <span className="flex items-center gap-1.5">
                <StatusChip tone={readinessTone(twin.completenessScore)}>
                  {readinessLabel(twin.completenessScore)}
                </StatusChip>
                {twin.completenessScore != null && (
                  <span className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                    ({formatPct(twin.completenessScore)})
                  </span>
                )}
              </span>
            }
          />
          <MetricRow
            label="Systems tracked"
            value={String(twin.components.length)}
          />
          <MetricRow
            label="Last updated"
            value={twin.lastSyncedAt ? formatDate(twin.lastSyncedAt) : 'Not yet synced'}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Refreshing view...' : 'Refresh view'}
          className="shrink-0 gap-1.5 rounded-full"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isRefreshing ? 'Updating…' : 'Refresh'}
        </Button>
      </div>
    </MobileCard>
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
  const tone = componentStatusTone(component);
  const pct = ageRatioPct(component);
  const ComponentIcon = COMPONENT_ICON[component.componentType] ?? Home;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View details for ${component.label ?? COMPONENT_LABEL[component.componentType]}`}
      className="block w-full text-left"
    >
      <MobileCard
        variant="standard"
        className="transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={tone}>
                {COMPONENT_STATUS_LABEL[component.status] ?? component.status}
              </StatusChip>
              {pct != null && (
                <span className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                  {pct}% of lifespan used
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]"
                aria-hidden="true"
              >
                <ComponentIcon className="h-4 w-4" />
              </span>
              <p className="text-base font-semibold leading-tight">
                {component.label ?? COMPONENT_LABEL[component.componentType]}
              </p>
            </div>
            {component.estimatedAgeYears != null && (
              <p className="mt-0.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
                ~{Math.round(component.estimatedAgeYears)} years old
                {component.usefulLifeYears != null
                  ? ` · ${component.usefulLifeYears}-yr lifespan`
                  : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[hsl(var(--mobile-text-secondary))]">
            {component.failureRiskScore != null && component.failureRiskScore >= 0.45 && (
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            )}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </MobileCard>
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
          {component.failureRiskScore != null && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                Planning Attention
              </h3>
              <p className="text-sm font-semibold">
                {planningAttentionLabel(component.failureRiskScore)}
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
// SCENARIO CARD
// ============================================================================

function ScenarioCard({
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

  const topImpact = scenario.impacts.find((i) => i.direction === 'POSITIVE' && i.valueNumeric != null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View scenario: ${scenario.name}`}
      className="block w-full text-left"
    >
      <MobileCard
        variant="standard"
        className="transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={statusTone}>
                {SCENARIO_STATUS_LABEL[scenario.status] ?? scenario.status}
              </StatusChip>
              <StatusChip tone="info">{SCENARIO_TYPE_LABEL[scenario.scenarioType]}</StatusChip>
              {scenario.isPinned && (
                <span className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">Pinned</span>
              )}
            </div>
            <p className="text-base font-semibold leading-tight">{scenario.name}</p>
            {topImpact && (
              <p className="mt-0.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
                {IMPACT_TYPE_LABEL[topImpact.impactType] ?? topImpact.impactType}
                {topImpact.valueNumeric != null
                  ? `: ${topImpact.unit === 'USD' ? formatUSD(topImpact.valueNumeric) : topImpact.valueNumeric}`
                  : topImpact.valueText
                    ? `: ${topImpact.valueText}`
                    : ''}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--mobile-text-secondary))]" aria-hidden="true" />
        </div>
      </MobileCard>
    </button>
  );
}

// ============================================================================
// SCENARIO DETAIL SHEET
// ============================================================================

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
  onDelete: (id: string) => void;
  isComputing: boolean;
  isUpdating: boolean;
  isDeciding: boolean;
  isDeleting: boolean;
}) {
  const [decisionReason, setDecisionReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const { data: handoff } = useQuery({
    queryKey: ['home-digital-twin-scenario-handoff', propertyId, scenario?.id],
    queryFn: () => getDigitalTwinScenarioHandoff(propertyId, scenario?.id ?? ''),
    enabled: open && !!scenario,
  });

  useEffect(() => {
    setDecisionReason(scenario?.decisionReason ?? '');
    setReasonError(null);
    setNameDraft(scenario?.name ?? '');
  }, [scenario?.id]);

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

  const canCompute = scenario.status === 'DRAFT' || scenario.status === 'READY';
  const statusTone =
    scenario.status === 'COMPUTED'
      ? 'good'
      : scenario.status === 'FAILED'
        ? 'danger'
        : 'info';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">{scenario.name}</SheetTitle>
          <SheetDescription className="sr-only">
            Scenario details for {scenario.name}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5">
          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={statusTone}>
              {SCENARIO_STATUS_LABEL[scenario.status] ?? scenario.status}
            </StatusChip>
            <StatusChip tone="info">{SCENARIO_TYPE_LABEL[scenario.scenarioType]}</StatusChip>
            <StatusChip tone={DECISION_STATUS_TONE[scenario.decisionStatus]}>
              {DECISION_STATUS_LABEL[scenario.decisionStatus]}
            </StatusChip>
          </div>

          {/* Decision — select / defer / reject / close, with a recorded reason */}
          <div className="space-y-2 rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5">
            <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
              Your decision
            </h3>
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
            <div className="flex flex-wrap gap-1.5">
              {(['SELECTED', 'DEFERRED', 'REJECTED', 'CLOSED'] as HomeTwinScenarioDecisionStatus[]).map((status) => (
                <Button
                  key={status}
                  variant={scenario.decisionStatus === status ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 min-w-[70px]"
                  disabled={isDeciding}
                  onClick={() => handleDecide(status)}
                  aria-label={`Mark this option as ${DECISION_STATUS_LABEL[status].toLowerCase()}`}
                >
                  {DECISION_STATUS_LABEL[status]}
                </Button>
              ))}
            </div>
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
            // The takeaway banner may only come from a system-generated summary
            // row, never a caller-supplied one — see HDT-005. isUserSupplied
            // rows are rendered separately below as "Your estimates" so they
            // are never blended in with computed evidence.
            const takeaway = scenario.impacts.find(
              (i) => i.impactType === 'CUSTOM' && !i.isUserSupplied,
            );
            const computedImpacts = scenario.impacts.filter(
              (i) => i.impactType !== 'CUSTOM' && !i.isUserSupplied,
            );
            const userSuppliedImpacts = scenario.impacts.filter((i) => i.isUserSupplied);

            const formatImpactValue = (impact: HomeTwinScenarioImpactDTO, value: number) =>
              impact.unit === 'USD'
                ? formatUSD(value)
                : impact.unit === 'PERCENT'
                  ? `${value}%`
                  : `${value}${impact.unit ? ` ${impact.unit.toLowerCase()}` : ''}`;

            const renderImpactRow = (impact: HomeTwinScenarioImpactDTO) => {
              const hasRange =
                impact.valueLow != null && impact.valueHigh != null && impact.valueLow !== impact.valueHigh;
              return (
                <div key={impact.id} className="flex items-start justify-between gap-3 text-sm">
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
              );
            };

            return (
              <div className="space-y-3">
                {/* Takeaway banner — system-generated summaries only */}
                {takeaway?.valueText && (
                  <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
                    <p className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))] mb-1">
                      Bottom line
                    </p>
                    <p
                      className={cn(
                        'text-sm font-medium leading-snug',
                        takeaway.direction === 'POSITIVE'
                          ? 'text-green-700'
                          : 'text-[hsl(var(--foreground))]',
                      )}
                    >
                      {takeaway.valueText}
                    </p>
                  </div>
                )}

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

                {userSuppliedImpacts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-normal text-[hsl(var(--mobile-text-secondary))]">
                      Your estimates
                    </h3>
                    <div className="space-y-1.5">{userSuppliedImpacts.map(renderImpactRow)}</div>
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      You entered these values. They have not been independently verified or computed.
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
                      If you're going to double-check one number before trusting this range, check the one with the larger swing.
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
                This scenario hasn&apos;t been computed yet. Run the compute engine to see projected
                impacts based on your home&apos;s current modeled state.
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
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['home-digital-twin-scenario-comparison', propertyId, componentId],
    queryFn: () => compareDigitalTwinScenarios(propertyId, componentId ?? ''),
    enabled: open && !!componentId,
  });

  const keyImpact = (scenario: HomeTwinScenarioDTO, type: string) =>
    scenario.impacts.find((i) => i.impactType === type && !i.isUserSupplied);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">
            {comparison ? `Compare options: ${comparison.component.label ?? COMPONENT_LABEL[comparison.component.componentType]}` : 'Compare options'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Side-by-side comparison of computed repair, replace, upgrade, and wait options.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-3" aria-live="polite">
          {isLoading && (
            <div className="animate-pulse motion-reduce:animate-none space-y-2">
              <div className="h-20 rounded-[22px] bg-gray-100" />
              <div className="h-20 rounded-[22px] bg-gray-100" />
            </div>
          )}

          {!isLoading && comparison && comparison.options.length === 0 && (
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              No computed options yet for this system. Run and compute at least two scenarios (e.g.
              repair vs. replace) to compare them here.
            </p>
          )}

          {!isLoading && comparison && comparison.options.length === 1 && (
            <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
              Only one computed option exists for this system so far. Create and compute another
              (e.g. repair vs. replace) to compare them side by side.
            </p>
          )}

          {!isLoading &&
            comparison?.options.map((option) => {
              const cost = keyImpact(option, 'UPFRONT_COST');
              const savings = keyImpact(option, 'ANNUAL_SAVINGS');
              const payback = keyImpact(option, 'PAYBACK_PERIOD');
              return (
                <div
                  key={option.id}
                  className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] px-3 py-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{option.name}</span>
                    <StatusChip tone={DECISION_STATUS_TONE[option.decisionStatus]}>
                      {DECISION_STATUS_LABEL[option.decisionStatus]}
                    </StatusChip>
                  </div>
                  <StatusChip tone="info">{SCENARIO_TYPE_LABEL[option.scenarioType]}</StatusChip>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <p className="mb-0.5 text-[hsl(var(--mobile-text-secondary))]">Cost</p>
                      <p className="font-medium">
                        {cost?.valueLow != null && cost.valueHigh != null
                          ? `${formatUSD(cost.valueLow)}–${formatUSD(cost.valueHigh)}`
                          : cost?.valueNumeric != null
                            ? formatUSD(cost.valueNumeric)
                            : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[hsl(var(--mobile-text-secondary))]">Savings/yr</p>
                      <p className="font-medium">
                        {savings?.valueNumeric != null ? formatUSD(savings.valueNumeric) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[hsl(var(--mobile-text-secondary))]">Payback</p>
                      <p className="font-medium">{payback?.valueText ?? '—'}</p>
                    </div>
                  </div>
                </div>
              );
            })}

          <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            Figures are ranges based on your home&apos;s modeled state, not guaranteed quotes.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

export default function HomeDigitalTwinClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
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

  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [componentSheetOpen, setComponentSheetOpen] = useState(false);

  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [suggestionSheetOpen, setSuggestionSheetOpen] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioSheetOpen, setScenarioSheetOpen] = useState(false);

  const [compareComponentId, setCompareComponentId] = useState<string | null>(null);
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);

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
  const selectedComponent =
    twin?.components.find((c) => c.id === selectedComponentId) ?? null;
  const selectedSuggestion =
    recommendations?.find((s) => s.key === selectedSuggestionKey) ?? null;
  const selectedScenario =
    twin?.recentScenarios.find((s) => s.id === selectedScenarioId) ?? null;

  useEffect(() => {
    if (!focusedEntityId || !twin || consumedFocusRef.current === focusedEntityId) return;
    const component = twin.components.find((candidate) =>
      candidate.id === focusedEntityId || candidate.sourceReferenceId === focusedEntityId,
    );
    if (!component) return;
    consumedFocusRef.current = focusedEntityId;
    setSelectedComponentId(component.id);
    setComponentSheetOpen(true);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`twin-component-${component.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedEntityId, twin]);

  // ── Init mutation ───────────────────────────────────────────────────────────
  const initMutation = useMutation({
    mutationFn: () => initHomeDigitalTwin(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin-recommendations', propertyId] });
      toast({ title: 'Home view ready', description: 'Your home model is ready to explore.' });
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
        title: 'Scenario computed',
        description: `"${scenario.name}" is ready to review.`,
      });
      track('action_completed', { tool: 'home-digital-twin', actionType: 'run_scenario', propertyId });
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
      toast({ title: 'Impacts computed', description: 'Scenario results are ready.' });
    },
    onError: () =>
      toast({ title: 'Compute failed. Please try again.', variant: 'destructive' }),
  });

  // ── Update scenario mutation ────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isPinned?: boolean; isArchived?: boolean; name?: string; description?: string | null } }) =>
      updateDigitalTwinScenario(propertyId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      if (variables.input.isArchived) {
        setScenarioSheetOpen(false);
      }
      if (variables.input.name) {
        toast({ title: 'Renamed', description: `Now called "${variables.input.name}".` });
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
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
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
        subtitle="See what we know about your home's systems, correct what's uncertain, and compare the cost, timing, savings, and risk trade-offs of a repair or upgrade."
       className="lg:hidden"/>

      {/* Tool rail */}
      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      {/* Projection context status */}
      {twin?.context && (
        <PropertyContextStatusNotice context={twin.context} title="Home data freshness" />
      )}

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
          title="Your home view isn't built yet"
          description="Build your home model to see your systems' age and condition, correct anything that's wrong, and compare upgrade options. Takes just a moment."
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
        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6 lg:space-y-0">
        {/* ── Left column: current state of the home ─────────────────────────── */}
        <div className="space-y-4">
          {/* ── STATUS CARD ──────────────────────────────────────────────────── */}
          <TwinStatusCard
            twin={twin}
            onRefresh={() => refreshMutation.mutate()}
            isRefreshing={isRefreshing}
          />

          {/* ── FACT READINESS — known / missing / conflicting, with why it matters ── */}
          <HomeRecordReadinessCard propertyId={propertyId} />

          {/* ── COMPONENTS ──────────────────────────────────────────────────── */}
          {twin.components.length > 0 && (
            <MobileSection>
              <MobileSectionHeader
                title="Home Systems"
                subtitle={`${twin.components.length} system${twin.components.length !== 1 ? 's' : ''} modeled`}
              />
              <div className="space-y-2" role="list" aria-label="Modeled home systems">
                {twin.components.map((c) => (
                  <div
                    id={`twin-component-${c.id}`}
                    key={c.id}
                    role="listitem"
                    className={cn(
                      'scroll-mt-28 rounded-[22px]',
                      focusedEntityId && (c.id === focusedEntityId || c.sourceReferenceId === focusedEntityId)
                        ? 'ring-2 ring-teal-500 ring-offset-2'
                        : '',
                    )}
                  >
                    <ComponentCard
                      component={c}
                      onClick={() => {
                        setSelectedComponentId(c.id);
                        setComponentSheetOpen(true);
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="pt-1 text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
                Estimates are derived from your property profile and inventory. Add more home details
                to improve accuracy.
              </p>
            </MobileSection>
          )}
        </div>

        {/* ── Right column: decisions to make ─────────────────────────────────── */}
        <div className="space-y-4">
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
                title="Suggested Scenarios"
                subtitle="Based on your home's current state"
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
                Suggestions are derived from component age and risk data. Running a scenario creates
                a draft — nothing is scheduled or committed.
              </p>
            </MobileSection>
          )}

          {/* ── RECENT SCENARIOS ────────────────────────────────────────────── */}
          {twin.recentScenarios.length > 0 && (
            <MobileSection>
              <MobileSectionHeader
                title="Recent Scenarios"
                subtitle="Your saved what-if analyses"
              />
              <div className="space-y-2" role="list" aria-label="Recent saved scenarios">
                {twin.recentScenarios.map((s) => (
                  <div key={s.id} role="listitem">
                    <ScenarioCard
                      scenario={s}
                      onClick={() => {
                        setSelectedScenarioId(s.id);
                        setScenarioSheetOpen(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            </MobileSection>
          )}

          {/* Empty scenarios state */}
          {twin.recentScenarios.length === 0 && !recLoading && recommendations && recommendations.length === 0 && (
            <EmptyStateCard
              title="No what-if scenarios yet"
              description="Refresh your view to generate suggestions, or add more details to your property profile to improve the analysis."
            />
          )}
        </div>
        </div>
      )}
      </div>

      {/* Sheets */}
      <ComponentDetailSheet
        component={selectedComponent}
        open={componentSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setComponentSheetOpen(false);
            setSelectedComponentId(null);
          }
        }}
        onCompare={(componentId) => {
          setComponentSheetOpen(false);
          setCompareComponentId(componentId);
          setCompareSheetOpen(true);
          track('action_taken', { tool: 'home-digital-twin', propertyId, actionType: 'scenario_compare_opened' });
        }}
      />

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
