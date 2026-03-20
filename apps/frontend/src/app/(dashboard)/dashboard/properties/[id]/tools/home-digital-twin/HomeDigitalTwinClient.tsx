'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  FileCheck,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
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
} from './homeDigitalTwinApi';

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

const SCENARIO_TYPE_LABEL: Record<HomeTwinScenarioType, string> = {
  REPLACE_COMPONENT: 'Replace Component',
  UPGRADE_COMPONENT: 'Upgrade Component',
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
    <div className="animate-pulse space-y-3">
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
  return (
    <MobileCard variant="standard">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-secondary))]">
            Your Home Model
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
            label="Systems modeled"
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
          aria-label={isRefreshing ? 'Refreshing model…' : 'Refresh model'}
          className="shrink-0 gap-1.5 rounded-full"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
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
            <p className="text-base font-semibold leading-tight">
              {component.label ?? COMPONENT_LABEL[component.componentType]}
            </p>
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
}: {
  component: HomeTwinComponentDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
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

          {/* Risk */}
          {component.failureRiskScore != null && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                Failure Risk
              </h3>
              <p className="text-sm font-semibold">
                {formatPct(component.failureRiskScore)}
              </p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                Estimated probability of a failure event requiring significant repair or replacement.
              </p>
            </div>
          )}

          {/* Cost estimates */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
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
  open,
  onOpenChange,
  onRunScenario,
  isRunning,
}: {
  suggestion: ScenarioSuggestionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunScenario: (s: ScenarioSuggestionDTO) => void;
  isRunning: boolean;
}) {
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

          {/* Description */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
              Why this matters
            </h3>
            <p className="text-sm leading-[1.5]">{suggestion.description}</p>
          </div>

          {/* Reason */}
          {suggestion.reason && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
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
  isComputing,
  isUpdating,
}: {
  scenario: HomeTwinScenarioDTO | null;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompute: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  isComputing: boolean;
  isUpdating: boolean;
}) {
  if (!scenario) return null;

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
          </div>

          {/* Description */}
          {scenario.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                Description
              </h3>
              <DescriptionPointList description={scenario.description} />
            </div>
          )}

          {/* Computed impacts */}
          {scenario.status === 'COMPUTED' && scenario.impacts.length > 0 && (() => {
            const takeaway = scenario.impacts.find((i) => i.impactType === 'CUSTOM');
            const mainImpacts = scenario.impacts.filter((i) => i.impactType !== 'CUSTOM');
            return (
              <div className="space-y-3">
                {/* Takeaway banner */}
                {takeaway?.valueText && (
                  <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))] mb-1">
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

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                    Projected impacts
                  </h3>
                  <div className="space-y-1.5">
                    {mainImpacts.map((impact) => (
                      <div
                        key={impact.id}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <span className="text-[hsl(var(--mobile-text-secondary))]">
                          {IMPACT_TYPE_LABEL[impact.impactType] ?? impact.impactType}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-medium',
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
                              : impact.valueNumeric != null
                                ? impact.unit === 'USD'
                                  ? formatUSD(impact.valueNumeric)
                                  : impact.unit === 'PERCENT'
                                    ? `${impact.valueNumeric}%`
                                    : `${impact.valueNumeric}${impact.unit ? ` ${impact.unit.toLowerCase()}` : ''}`
                                : impact.valueText ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {scenario.lastComputedAt && (
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      Computed {formatDate(scenario.lastComputedAt)}
                    </p>
                  )}
                </div>
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
              aria-label="Run compute engine for this scenario"
            >
              {isComputing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
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
              onClick={() => onArchive(scenario.id)}
              disabled={isUpdating}
              aria-label="Archive this scenario"
            >
              Archive
            </Button>
          </div>
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

  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [componentSheetOpen, setComponentSheetOpen] = useState(false);

  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [suggestionSheetOpen, setSuggestionSheetOpen] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioSheetOpen, setScenarioSheetOpen] = useState(false);

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
    retry: 1,
    retryDelay: 1500,
  });

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

  // ── Init mutation ───────────────────────────────────────────────────────────
  const initMutation = useMutation({
    mutationFn: () => initHomeDigitalTwin(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin-recommendations', propertyId] });
      toast({ title: 'Home model ready', description: 'Your digital twin has been built.' });
    },
    onError: (error) =>
      toast({
        title: 'Could not build model',
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
      toast({ title: 'Model updated', description: 'Your digital twin has been refreshed.' });
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
    mutationFn: ({ id, input }: { id: string; input: { isPinned?: boolean; isArchived?: boolean } }) =>
      updateDigitalTwinScenario(propertyId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-twin', propertyId] });
      if (variables.input.isArchived) {
        setScenarioSheetOpen(false);
      }
    },
    onError: () =>
      toast({ title: 'Could not update scenario. Please try again.', variant: 'destructive' }),
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
        eyebrow="Home Tool"
        title="Home Digital Twin"
        subtitle="A living model of your home — systems, age, risk, and what-if scenarios. Data is derived from your property profile and inventory."
       className="lg:hidden"/>

      {/* Tool rail */}
      <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
        <HomeToolsRail propertyId={propertyId} />
      </MobileFilterSurface>

      {/* Content states */}
      {twinLoading ? (
        <DigitalTwinSkeleton />
      ) : twinLoadError ? (
        /* ── LOAD ERROR ─────────────────────────────────────────────────────── */
        <EmptyStateCard
          title="Couldn't load your home model"
          description="There was a problem loading your digital twin. This is usually temporary."
          action={
            <Button
              variant="outline"
              onClick={() => refetchTwin()}
              className="gap-2"
              aria-label="Retry loading home model"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </Button>
          }
        />
      ) : twinNotFound || !twin ? (
        /* ── NOT YET BUILT ──────────────────────────────────────────────────── */
        <EmptyStateCard
          title="Your home model isn't built yet"
          description="Build your digital twin to see a living model of your home's systems, age estimates, and what-if scenarios. Takes just a moment."
          action={
            <Button
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
              className="gap-2"
              aria-label="Build home digital twin"
            >
              {initMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Zap className="h-4 w-4" aria-hidden="true" />
              )}
              {initMutation.isPending ? 'Building model…' : 'Build My Home Model'}
            </Button>
          }
        />
      ) : (
        <>
          {/* ── STATUS CARD ──────────────────────────────────────────────────── */}
          <TwinStatusCard
            twin={twin}
            onRefresh={() => refreshMutation.mutate()}
            isRefreshing={isRefreshing}
          />

          {/* ── COMPONENTS ──────────────────────────────────────────────────── */}
          {twin.components.length > 0 && (
            <MobileSection>
              <MobileSectionHeader
                title="Home Systems"
                subtitle={`${twin.components.length} system${twin.components.length !== 1 ? 's' : ''} modeled`}
              />
              <div className="space-y-2" role="list" aria-label="Modeled home systems">
                {twin.components.map((c) => (
                  <div key={c.id} role="listitem">
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

          {/* ── SUGGESTIONS ─────────────────────────────────────────────────── */}
          {recLoading && (
            <div className="animate-pulse space-y-2">
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
              description="Refresh your model to generate suggestions, or add more details to your property profile to improve the analysis."
            />
          )}
        </>
      )}

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
      />

      <SuggestionDetailSheet
        suggestion={selectedSuggestion}
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
        onArchive={(id) => updateMutation.mutate({ id, input: { isArchived: true } })}
        isComputing={computeMutation.isPending}
        isUpdating={updateMutation.isPending}
      />
    </MobilePageContainer>
  );
}
