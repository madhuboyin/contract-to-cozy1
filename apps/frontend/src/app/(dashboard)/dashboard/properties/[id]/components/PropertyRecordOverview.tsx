'use client';

import { useEffect, useRef, type ElementType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Home,
  PackageSearch,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';

import { getPropertyToolPresentations } from '@/features/tools/propertyToolPresentationPolicy';
import { track } from '@/lib/analytics/events';
import type {
  Property,
  PropertyContextCompleteness,
  PropertyContextFact,
  PropertyContextScope,
  PropertyContextSnapshot,
  PropertyOnboardingNarrativeState,
  PropertyRecordOverviewDTO,
} from '@/types';
import { cn } from '@/lib/utils';

type RecordCategoryTone = 'complete' | 'progress' | 'missing';

interface RecordCategory {
  label: string;
  detail: string;
  percent: number;
  href: string;
  tone: RecordCategoryTone;
  issues: RecordQualityIssue[];
  nextActionLabel?: string;
}

interface RecordQualityIssue {
  key: string;
  label: string;
  state: 'MISSING' | 'CONFLICTED' | 'STALE';
  href: string;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function percent(values: unknown[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.filter(present).length / values.length) * 100);
}

function formatEnum(value: string | null | undefined, fallback = 'Not recorded'): string {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function queryCount(isLoading: boolean, isError: boolean, value: number): string | number {
  if (isLoading) return '…';
  if (isError) return '—';
  return value;
}

function categoryTone(value: number): RecordCategoryTone {
  if (value >= 85) return 'complete';
  if (value >= 40) return 'progress';
  return 'missing';
}

const FACT_LABEL_OVERRIDES: Record<string, string> = {
  'core.dwellingType': 'Property type',
  'core.propertySizeSqFt': 'Living area',
  'core.isPrimary': 'Primary-home status',
  'location.zipCode': 'ZIP code',
  'location.geocoded': 'Map location',
  'structure.roofAgeYears': 'Roof age',
  'structure.electricalPanelAgeYears': 'Electrical panel age',
  'systems.hvacInstallYear': 'HVAC installation year',
  'systems.waterHeaterInstallYear': 'Water-heater installation year',
  'systems.installedItemTypes': 'Tracked systems and equipment',
  'safety.hasCoDetectors': 'Carbon-monoxide detectors',
  'rooms.list': 'Rooms',
  'inventory.items': 'Inventory items',
};

function humanizeFactKey(key: string): string {
  if (FACT_LABEL_OVERRIDES[key]) return FACT_LABEL_OVERRIDES[key];
  const raw = key.split('.').pop() ?? key;
  const spaced = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function resolveCorrectionHref(
  propertyId: string,
  correctionPath: string | null | undefined,
  fallbackHref: string,
): string {
  if (!correctionPath || !correctionPath.startsWith('/dashboard/')) return fallbackHref;
  return correctionPath.replaceAll(':propertyId', encodeURIComponent(propertyId));
}

function aggregateScopeCompleteness(
  completeness: PropertyContextCompleteness | null | undefined,
  scopes: PropertyContextScope[],
  fallbackPercent: number,
): number {
  const included = completeness?.scopes.filter((entry) => scopes.includes(entry.scope)) ?? [];
  const totalFacts = included.reduce((sum, entry) => sum + entry.totalFacts, 0);
  const knownFacts = included.reduce((sum, entry) => sum + entry.knownFacts, 0);
  return totalFacts > 0 ? Math.round((knownFacts / totalFacts) * 100) : fallbackPercent;
}

function collectRecordIssues({
  propertyId,
  completeness,
  snapshot,
  scopes,
  fallbackHref,
}: {
  propertyId: string;
  completeness: PropertyContextCompleteness | null | undefined;
  snapshot: PropertyContextSnapshot | null | undefined;
  scopes: PropertyContextScope[];
  fallbackHref: string;
}): RecordQualityIssue[] {
  const entries = completeness?.scopes.filter((entry) => scopes.includes(entry.scope)) ?? [];
  const issues: RecordQualityIssue[] = [];
  const seen = new Set<string>();
  const add = (key: string, state: RecordQualityIssue['state']) => {
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      key,
      label: humanizeFactKey(key),
      state,
      href: resolveCorrectionHref(propertyId, snapshot?.facts[key]?.correctionPath, fallbackHref),
    });
  };
  entries.forEach((entry) => {
    entry.conflictedFactKeys.forEach((key) => add(key, 'CONFLICTED'));
    entry.staleFactKeys.forEach((key) => add(key, 'STALE'));
    entry.missingFactKeys.forEach((key) => add(key, 'MISSING'));
  });
  return issues;
}

export function calculatePropertyRecordCompleteness(
  property: Property,
  onboarding?: PropertyOnboardingNarrativeState | null,
): number {
  const coreFacts = [
    property.address,
    property.city,
    property.state,
    property.zipCode,
    property.dwellingType,
    property.ownershipForm,
    property.propertyUse,
    property.occupancyStatus,
    property.propertySize,
    property.yearBuilt,
    property.bedrooms,
    property.bathrooms,
    property.heatingType,
    property.coolingType,
    property.waterHeaterType,
    property.roofType,
    property.foundationType,
    property.occupantsCount,
  ];
  const factScore = percent(coreFacts);
  if (!onboarding?.steps?.length) return factScore;
  const onboardingScore = Math.round(
    (onboarding.steps.filter((step) => step.complete).length / onboarding.steps.length) * 100,
  );
  return Math.round(factScore * 0.7 + onboardingScore * 0.3);
}

export type PropertyRecordCategoryPercents = {
  profile: number;
  systems: number;
  spaces: number;
  documents: number;
};

export function calculatePropertyRecordCategoryPercents(
  property: Property,
  overview: PropertyRecordOverviewDTO,
): PropertyRecordCategoryPercents {
  const roomsCount = overview.sections.rooms.data?.count ?? 0;
  const householdCount = overview.sections.household.data?.totalCount ?? 0;
  const contextCompleteness = overview.context.completeness;
  const profileFallback = percent([
    property.address, property.city, property.state, property.zipCode,
    property.dwellingType, property.ownershipForm, property.propertyUse,
    property.occupancyStatus, property.propertySize, property.yearBuilt,
    property.bedrooms, property.bathrooms,
  ]);
  const systemsFallback = percent([
    property.heatingType, property.coolingType, property.waterHeaterType,
    property.roofType, property.hvacInstallYear, property.waterHeaterInstallYear,
    property.roofReplacementYear, property.foundationType, property.sidingType,
  ]);
  const spacesFallback = percent([
    property.bedrooms, property.bathrooms, property.occupantsCount,
    roomsCount > 0 ? roomsCount : null,
    householdCount > 0 ? householdCount : null,
  ]);
  const documents = overview.sections.documents.data;
  const documentsPercent = documents && documents.totalCount > 0
    ? Math.round(((documents.linkedCount + documents.verifiedCount) / (documents.totalCount * 2)) * 100)
    : 0;

  return {
    profile: aggregateScopeCompleteness(
      contextCompleteness,
      ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY'],
      profileFallback,
    ),
    systems: aggregateScopeCompleteness(
      contextCompleteness,
      ['SYSTEMS', 'SAFETY', 'INVENTORY'],
      systemsFallback,
    ),
    spaces: aggregateScopeCompleteness(
      contextCompleteness,
      ['ROOMS', 'OPTIONAL_HOUSEHOLD'],
      spacesFallback,
    ),
    documents: documentsPercent,
  };
}

export function calculatePropertyRecordOverviewCompleteness(
  property: Property,
  overview: PropertyRecordOverviewDTO,
): number {
  const values = Object.values(calculatePropertyRecordCategoryPercents(property, overview));
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function RecordPanel({
  id,
  title,
  description,
  href,
  actionLabel,
  icon,
  children,
  className,
}: {
  id?: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="mb-0 text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <Link
          href={href}
          className="no-brand-style inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FactRow({
  label,
  value,
  missing = false,
  fact,
  propertyId,
}: {
  label: string;
  value: string;
  missing?: boolean;
  fact?: PropertyContextFact;
  propertyId?: string;
}) {
  const provenance = fact
    ? fact.state === 'CONFLICTED' ? 'Conflicted'
      : fact.state === 'STALE' ? 'Stale'
        : fact.state === 'UNKNOWN' ? 'Missing'
          : fact.verified ? 'Verified'
            : fact.source === 'SYSTEM_DERIVED' ? 'Inferred'
              : fact.source ? formatEnum(fact.source) : 'Recorded'
    : null;
  const correctionHref = propertyId && fact?.correctionPath
    ? resolveCorrectionHref(propertyId, fact.correctionPath, `/dashboard/properties/${propertyId}/edit`)
    : null;
  return (
    <div className="flex min-h-[44px] items-start justify-between gap-4 border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cn('mb-0 text-right text-sm font-semibold', missing ? 'text-amber-700' : 'text-slate-900')}>
        <span className="block">{value}</span>
        {provenance && fact && propertyId ? (
          <details className="group/provenance mt-0.5 text-[10px] font-medium text-slate-500">
            <summary
              onClick={() => track('property_record_source_viewed', { propertyId, factKey: fact.key, source: fact.source ?? 'UNKNOWN', state: fact.state })}
              className="cursor-pointer list-none hover:text-emerald-700 [&::-webkit-details-marker]:hidden"
            >
              {provenance} · source details
            </summary>
            <span className="mt-1 block max-w-[220px] rounded-lg bg-slate-50 p-2 text-left font-normal leading-4 text-slate-600">
              Source: {fact.source ? formatEnum(fact.source) : 'Not recorded'}
              {fact.observedAt ? ` · observed ${formatDate(fact.observedAt)}` : ''}
              {fact.confidence != null ? ` · ${Math.round(fact.confidence * 100)}% confidence` : ''}
              {correctionHref ? (
                <Link href={correctionHref} className="no-brand-style mt-1 block font-semibold text-emerald-700">Review or correct</Link>
              ) : null}
            </span>
          </details>
        ) : provenance ? <span className="mt-0.5 block text-[10px] font-medium text-slate-500">{provenance}</span> : null}
      </dd>
    </div>
  );
}

function RecordCompleteness({ propertyId, categories }: { propertyId: string; categories: RecordCategory[] }) {
  const nextCategory = [...categories].sort((a, b) => a.percent - b.percent)[0];
  const nextImprovement = nextCategory?.issues[0];

  return (
    <section id="record-quality" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Record quality</p>
        <h2 className="mb-0 text-base font-semibold text-slate-950">Completeness by category</h2>
        <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">
          Add missing facts where they belong. Each improvement makes connected tools more useful.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {categories.map((category) => {
          const conflictedCount = category.issues.filter((issue) => issue.state === 'CONFLICTED').length;
          const staleCount = category.issues.filter((issue) => issue.state === 'STALE').length;
          const missingCount = category.issues.filter((issue) => issue.state === 'MISSING').length;
          return (
            <div key={category.label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <Link
                href={category.href}
                className="no-brand-style group block transition hover:text-emerald-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-0 truncate text-sm font-semibold text-slate-900">{category.label}</p>
                    <p className="mt-0.5 mb-0 truncate text-xs text-slate-500">{category.detail}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-xs font-semibold',
                      category.tone === 'complete'
                        ? 'text-emerald-700'
                        : category.tone === 'progress'
                          ? 'text-amber-700'
                          : 'text-slate-500',
                    )}
                  >
                    {category.percent}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      category.tone === 'complete'
                        ? 'bg-emerald-600'
                        : category.tone === 'progress'
                          ? 'bg-amber-500'
                          : 'bg-slate-300',
                    )}
                    style={{ width: `${category.percent}%` }}
                  />
                </div>
              </Link>

              {category.issues.length > 0 ? (
                <details className="group/issues mt-2 border-t border-slate-200/70 pt-2">
                  <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between text-[11px] font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
                    <span>
                      Review {category.issues.length} field{category.issues.length === 1 ? '' : 's'}
                      {conflictedCount > 0 ? ` · ${conflictedCount} conflicted` : ''}
                      {staleCount > 0 ? ` · ${staleCount} stale` : ''}
                      {missingCount > 0 && conflictedCount === 0 && staleCount === 0 ? ` · ${missingCount} missing` : ''}
                    </span>
                    <span className="text-slate-400 group-open/issues:rotate-90" aria-hidden="true">›</span>
                  </summary>
                  <div className="mt-1 space-y-1">
                    {category.issues.slice(0, 5).map((issue) => (
                      <Link
                        key={issue.key}
                        href={issue.href}
                        onClick={() => track('property_record_missing_detail_opened', {
                          propertyId,
                          category: category.label,
                          factKey: issue.key,
                          state: issue.state,
                        })}
                        className="no-brand-style flex min-h-[36px] items-center justify-between gap-3 rounded-lg bg-white px-2.5 text-xs text-slate-700 hover:text-emerald-800"
                      >
                        <span className="truncate">{issue.label}</span>
                        <span
                          className={cn(
                            'shrink-0 text-[10px] font-semibold',
                            issue.state === 'CONFLICTED'
                              ? 'text-rose-700'
                              : issue.state === 'STALE'
                                ? 'text-amber-700'
                                : 'text-slate-500',
                          )}
                        >
                          {issue.state === 'CONFLICTED' ? 'Resolve' : issue.state === 'STALE' ? 'Refresh' : 'Add'}
                        </span>
                      </Link>
                    ))}
                    {category.issues.length > 5 ? (
                      <Link href={category.href} className="no-brand-style inline-flex min-h-[32px] items-center px-2 text-[11px] font-semibold text-emerald-700">
                        Review {category.issues.length - 5} more
                      </Link>
                    ) : null}
                  </div>
                </details>
              ) : category.percent === 100 ? (
                <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  No missing, stale, or conflicted facts in this category
                </div>
              ) : (
                <div className="mt-2 border-t border-slate-200/70 pt-2 text-[11px] font-medium text-amber-700">
                  {category.nextActionLabel ?? `Continue improving ${category.label.toLowerCase()}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {nextCategory ? (
        <Link
          id="record-quality-next"
          href={nextImprovement?.href ?? nextCategory.href}
          className="no-brand-style mt-4 flex min-h-[44px] items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-900"
        >
          <span>{nextImprovement ? `${nextImprovement.state === 'MISSING' ? 'Add' : 'Review'} ${nextImprovement.label.toLowerCase()}` : nextCategory.nextActionLabel ?? `Improve ${nextCategory.label.toLowerCase()}`}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

interface RelatedTool {
  id: string;
  name: string;
  relationship: string;
  state: string;
  href: string;
  action: string;
  icon: ElementType;
  statusTone: 'saved' | 'setup' | 'loading' | 'unavailable';
  fallbackRank: number;
  group: string;
}

function RelatedPropertyTools({
  propertyId,
  contextVersion,
  tools,
  allToolsHref,
  registryVersion,
}: {
  propertyId: string;
  contextVersion?: string | null;
  tools: RelatedTool[];
  allToolsHref: string;
  registryVersion: string;
}) {
  const trackedImpression = useRef<string | null>(null);
  const visible = tools.slice(0, 4);
  const additional = tools.slice(4);
  const toolIds = tools.map((tool) => tool.id);
  const impressionKey = `${propertyId}:${contextVersion ?? 'fallback'}:${toolIds.join(',')}`;

  useEffect(() => {
    if (tools.length === 0 || trackedImpression.current === impressionKey) return;
    trackedImpression.current = impressionKey;
    track('tool_discovery_impression', {
      propertyId,
      surface: 'property_detail',
      toolIds,
      contextVersion,
      originSection: 'OVERVIEW',
      sourceEntityType: 'PROPERTY_RECORD',
      sourceEntityId: propertyId,
      registryVersion,
      toolGroups: tools.map((tool) => tool.group),
      toolStates: tools.map((tool) => tool.statusTone),
    });
  }, [contextVersion, impressionKey, propertyId, registryVersion, toolIds, tools]);

  const renderTool = (tool: RelatedTool, position: number) => {
    const ToolIcon = tool.icon;
    return (
      <Link
        key={tool.id}
        href={tool.href}
        onClick={() => track('tool_discovery_clicked', {
          propertyId,
          surface: 'property_detail',
          toolId: tool.id,
          position,
          contextVersion,
          originSection: 'OVERVIEW',
          sourceEntityType: 'PROPERTY_RECORD',
          sourceEntityId: propertyId,
          readiness: tool.statusTone === 'unavailable' ? 'UNKNOWN' : tool.statusTone === 'loading' ? 'NEEDS_CONTEXT' : 'READY',
          registryVersion,
          toolGroup: tool.group,
          toolState: tool.statusTone,
        })}
        className="no-brand-style group flex min-h-[132px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ToolIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className={cn(
            'text-[11px] font-semibold',
            tool.statusTone === 'saved'
              ? 'text-emerald-700'
              : tool.statusTone === 'unavailable'
                ? 'text-rose-600'
                : 'text-slate-500',
          )}>
            {tool.state}
          </span>
        </div>
        <p className="mt-3 mb-0 text-sm font-semibold text-slate-950">{tool.name}</p>
        <p className="mt-1 mb-0 line-clamp-2 text-xs leading-5 text-slate-500">{tool.relationship}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-emerald-700">
          {tool.action}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>
    );
  };

  return (
    <section aria-labelledby="related-property-tools" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Connected to this record</p>
          <h2 id="related-property-tools" className="mb-0 text-lg font-semibold text-slate-950">Related property tools</h2>
          <p className="mt-1 mb-0 max-w-2xl text-sm text-slate-500">
            Use this property&apos;s systems, spaces, documents, and history to plan or create durable home artifacts.
          </p>
        </div>
        <Link href={allToolsHref} className="no-brand-style inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-emerald-700">
          View all property tools
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((tool, index) => renderTool(tool, index))}
      </div>

      {additional.length > 0 ? (
        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show {additional.length} more connected tools</span>
            <span className="hidden group-open:inline">Show fewer tools</span>
          </summary>
          <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
            {additional.map((tool, index) => renderTool(tool, visible.length + index))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function RelatedWorkspaces({ propertyId, backTo }: { propertyId: string; backTo: string }) {
  const links = [
    {
      label: 'Maintenance',
      description: 'Scheduled and completed care',
      href: `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent(backTo)}`,
      icon: <Wrench className="h-4 w-4" />,
    },
    {
      label: 'Projects',
      description: 'Plans, work, and closeout',
      href: `/dashboard/properties/${propertyId}/projects?backTo=${encodeURIComponent(backTo)}`,
      icon: <FolderKanban className="h-4 w-4" />,
    },
    {
      label: 'Protection',
      description: 'Coverage and property protection',
      href: `/dashboard/protect?propertyId=${encodeURIComponent(propertyId)}&backTo=${encodeURIComponent(backTo)}`,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: 'Claims',
      description: 'Insurance and warranty claims',
      href: `/dashboard/properties/${propertyId}/claims?backTo=${encodeURIComponent(backTo)}`,
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      label: 'Reports',
      description: 'Property report packages',
      href: `/dashboard/properties/${propertyId}/reports?backTo=${encodeURIComponent(backTo)}`,
      icon: <FileText className="h-4 w-4" />,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Continue working</p>
      <h2 className="mb-0 text-base font-semibold text-slate-950">Related workspaces</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {links.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => track('property_related_workspace_opened', {
              propertyId,
              workspace: item.label,
            })}
            className="no-brand-style flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-emerald-200"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
              <span className="block truncate text-[11px] text-slate-500">{item.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function PropertyRecordOverview({
  property,
  overview,
  enableConnectedTools = true,
}: {
  property: Property;
  overview: PropertyRecordOverviewDTO;
  enableConnectedTools?: boolean;
}) {
  const propertyId = property.id;
  const contextCompleteness = overview.context.completeness;
  const contextSnapshot = overview.context.snapshot;
  const contextVersion = contextSnapshot?.contextVersion ?? null;
  const propertyPath = `/dashboard/properties/${propertyId}`;
  const withBackTo = (href: string) => `${href}${href.includes('?') ? '&' : '?'}backTo=${encodeURIComponent(propertyPath)}`;
  const documentsHref = withBackTo(`/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}`);

  const loadState = (status: 'AVAILABLE' | 'UNAVAILABLE') => ({ isLoading: false, isError: status === 'UNAVAILABLE' });
  const roomsQuery = loadState(overview.sections.rooms.status);
  const inventoryQuery = loadState(overview.sections.inventory.status);
  const documentsQuery = loadState(overview.sections.documents.status);
  const householdQuery = loadState(overview.sections.household.status);
  const capitalTimelineQuery = loadState(overview.tools.capitalTimeline.status);
  const continuityQuery = loadState(overview.tools.continuityPlan.status);
  const plantAdvisorQuery = loadState(overview.tools.plantAdvisor.status);
  const propertyBriefQuery = loadState(overview.tools.propertyBrief.status);
  const homeTimelineQuery = loadState(overview.tools.homeTimeline.status);
  const unavailableAdapters = [
    ['rooms', overview.sections.rooms.status],
    ['inventory', overview.sections.inventory.status],
    ['documents', overview.sections.documents.status],
    ['household', overview.sections.household.status],
    ['capital-timeline', overview.tools.capitalTimeline.status],
    ['continuity-plan', overview.tools.continuityPlan.status],
    ['plant-advisor', overview.tools.plantAdvisor.status],
    ['property-brief', overview.tools.propertyBrief.status],
    ['home-timeline', overview.tools.homeTimeline.status],
  ].filter(([, status]) => status === 'UNAVAILABLE').map(([name]) => name);
  const adapterFailureKey = unavailableAdapters.join(',');
  useEffect(() => {
    if (!adapterFailureKey) return;
    track('api_error_encountered', {
      endpoint: 'property-record-overview/adapters',
      statusCode: 206,
      message: `Unavailable property record adapters: ${adapterFailureKey}`,
    });
  }, [adapterFailureKey]);
  const rooms = overview.sections.rooms.data?.items ?? [];
  const inventoryCount = overview.sections.inventory.data?.totalCount ?? 0;
  const documentsCount = overview.sections.documents.data?.totalCount ?? 0;
  const householdCount = overview.sections.household.data?.totalCount ?? 0;
  const timeline = overview.tools.capitalTimeline.data;
  const continuityPlan = overview.tools.continuityPlan.data;
  const latestBrief = overview.tools.propertyBrief.data;
  const homeTimelineEventCount = overview.tools.homeTimeline.data?.confirmedCount ?? 0;
  const configuredPlantRooms = overview.tools.plantAdvisor.data?.profileCount ?? 0;
  const savedPlants = overview.tools.plantAdvisor.data?.savedCount ?? 0;
  const plantHasState = configuredPlantRooms > 0 || savedPlants > 0;
  const systemItemCount = overview.sections.inventory.data?.majorSystemCount ?? 0;
  const inventoryWithDocuments = overview.sections.inventory.data?.withDocumentCount ?? 0;

  const documentData = overview.sections.documents.data;
  const categoryPercents = calculatePropertyRecordCategoryPercents(property, overview);

  const propertyDetailScopes: PropertyContextScope[] = ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY'];
  const systemsScopes: PropertyContextScope[] = ['SYSTEMS', 'SAFETY', 'INVENTORY'];
  const roomsScopes: PropertyContextScope[] = ['ROOMS', 'OPTIONAL_HOUSEHOLD'];
  const profilePercent = categoryPercents.profile;
  const systemsPercent = categoryPercents.systems;
  const spacesPercent = categoryPercents.spaces;
  const documentsPercent = categoryPercents.documents;
  const detailsHref = `/dashboard/properties/${propertyId}/edit`;
  const systemsHref = withBackTo(`/dashboard/properties/${propertyId}/inventory`);
  const roomsHref = withBackTo(`/dashboard/properties/${propertyId}/rooms`);
  const propertyDetailIssues = collectRecordIssues({
    propertyId,
    completeness: contextCompleteness,
    snapshot: contextSnapshot,
    scopes: propertyDetailScopes,
    fallbackHref: detailsHref,
  });
  const systemsIssues = collectRecordIssues({
    propertyId,
    completeness: contextCompleteness,
    snapshot: contextSnapshot,
    scopes: systemsScopes,
    fallbackHref: systemsHref,
  });
  const roomsIssues = collectRecordIssues({
    propertyId,
    completeness: contextCompleteness,
    snapshot: contextSnapshot,
    scopes: roomsScopes,
    fallbackHref: roomsHref,
  });

  const categories: RecordCategory[] = [
    {
      label: 'Property details',
      detail: profilePercent >= 85 ? 'Core identity is well documented' : 'Add structure and ownership details',
      percent: profilePercent,
      href: detailsHref,
      tone: categoryTone(profilePercent),
      issues: propertyDetailIssues,
    },
    {
      label: 'Systems & inventory',
      detail: inventoryQuery.isError
        ? 'Inventory status is temporarily unavailable'
        : inventoryQuery.isLoading
          ? 'Loading systems and equipment'
          : systemItemCount > 0
            ? `${systemItemCount} major systems tracked`
            : 'Add major systems and equipment',
      percent: systemsPercent,
      href: systemsHref,
      tone: categoryTone(systemsPercent),
      issues: systemsIssues,
    },
    {
      label: 'Rooms & household',
      detail: roomsQuery.isError || householdQuery.isError
        ? 'Some room or household data is unavailable'
        : roomsQuery.isLoading || householdQuery.isLoading
          ? 'Loading rooms and household'
          : `${rooms.length} rooms · ${householdCount} household members`,
      percent: spacesPercent,
      href: roomsHref,
      tone: categoryTone(spacesPercent),
      issues: roomsIssues,
    },
    {
      label: 'Documents',
      detail: documentsQuery.isError
        ? 'Document status is temporarily unavailable'
        : documentsQuery.isLoading
          ? 'Loading attached records'
          : documentsCount > 0
            ? `${documentsCount} records · ${documentData?.needsReviewCount ?? 0} to review`
            : 'Add inspections, warranties, and receipts',
      percent: documentsPercent,
      href: documentsHref,
      tone: categoryTone(documentsPercent),
      issues: [],
      nextActionLabel: documentsCount === 0 ? 'Upload first document' : 'Review document evidence',
    },
  ];

  const tools: RelatedTool[] = (() => {
    const timelineCount = timeline?.itemCount ?? 0;
    return getPropertyToolPresentations({
      propertyId,
      returnTo: propertyPath,
      contextVersion,
    }).filter((presentation) => {
      const reasons = overview.tools.eligibility[presentation.toolId]?.reasons ?? [];
      return !reasons.some((reason) => [
        'CONTRIBUTOR_ROLE_REQUIRED', 'DISCOVERY_DISABLED', 'TOOL_DISABLED',
        'ROUTE_UNAVAILABLE', 'RELEASE_GATE_BLOCKED', 'ROLLOUT_DISABLED', 'WORKFLOW_ONLY',
      ].includes(reason));
    })
      .map((presentation): RelatedTool => {
      let state = 'Ready to use';
      let action = 'Open tool';
      let statusTone: RelatedTool['statusTone'] = 'setup';

      if (presentation.toolId === 'capital-timeline') {
        state = capitalTimelineQuery.isLoading
          ? 'Loading status'
          : capitalTimelineQuery.isError
            ? 'Status unavailable'
            : timelineCount > 0
              ? `${timelineCount} modeled · ${formatDate(timeline?.computedAt)}`
              : `${systemItemCount} systems available`;
        action = timelineCount > 0 ? 'Review timeline' : 'Build timeline';
        statusTone = capitalTimelineQuery.isError ? 'unavailable' : capitalTimelineQuery.isLoading ? 'loading' : timelineCount > 0 ? 'saved' : 'setup';
      } else if (presentation.toolId === 'home-digital-will') {
        state = continuityQuery.isLoading
          ? 'Loading status'
          : continuityQuery.isError
            ? 'Status unavailable'
            : continuityPlan
              ? `${continuityPlan.completionPercent}% · ${formatDate(continuityPlan.updatedAt)}`
              : 'Not started';
        action = continuityPlan ? 'Review plan' : 'Set up plan';
        statusTone = continuityQuery.isError ? 'unavailable' : continuityQuery.isLoading ? 'loading' : continuityPlan ? 'saved' : 'setup';
      } else if (presentation.toolId === 'plant-advisor') {
        state = plantAdvisorQuery.isLoading
          ? 'Loading status'
          : plantAdvisorQuery.isError
            ? 'Status unavailable'
            : plantHasState
              ? `${configuredPlantRooms} rooms · ${savedPlants} saved`
              : `${rooms.length} rooms available`;
        action = plantHasState ? 'Open advisor' : 'Set up a room';
        statusTone = plantAdvisorQuery.isError ? 'unavailable' : plantAdvisorQuery.isLoading ? 'loading' : plantHasState ? 'saved' : 'setup';
      } else if (presentation.toolId === 'property-brief') {
        state = propertyBriefQuery.isLoading
          ? 'Loading status'
          : propertyBriefQuery.isError
            ? 'Status unavailable'
            : latestBrief?.isStale
              ? 'Source records changed'
              : latestBrief
                ? `${formatEnum(latestBrief.status)} · ${formatDate(latestBrief.createdAt)}`
                : `${documentsCount} documents available`;
        action = latestBrief ? 'Review brief' : 'Create brief';
        statusTone = propertyBriefQuery.isError ? 'unavailable' : propertyBriefQuery.isLoading ? 'loading' : latestBrief ? 'saved' : 'setup';
      } else if (presentation.toolId === 'home-timeline') {
        state = homeTimelineQuery.isLoading
          ? 'Loading status'
          : homeTimelineQuery.isError
            ? 'Status unavailable'
            : homeTimelineEventCount > 0
              ? `${homeTimelineEventCount} confirmed events`
              : 'No confirmed events yet';
        action = 'Open timeline';
        statusTone = homeTimelineQuery.isError ? 'unavailable' : homeTimelineQuery.isLoading ? 'loading' : homeTimelineEventCount > 0 ? 'saved' : 'setup';
      } else if (presentation.toolId === 'status-board') {
        state = inventoryQuery.isLoading
          ? 'Loading status'
          : inventoryQuery.isError
            ? 'Status unavailable'
            : systemItemCount > 0
              ? `${systemItemCount} systems · ${formatDate(overview.tools.statusBoard.data?.updatedAt)}`
              : 'No systems represented yet';
        action = 'Open status board';
        statusTone = inventoryQuery.isError ? 'unavailable' : inventoryQuery.isLoading ? 'loading' : systemItemCount > 0 ? 'saved' : 'setup';
      }

      return {
        id: presentation.toolId,
        name: presentation.label,
        relationship: presentation.relationship,
        state,
        href: presentation.href,
        action,
        icon: presentation.icon,
        statusTone,
        fallbackRank: presentation.fallbackRank,
        group: presentation.group,
      };
    }).sort((a, b) => {
      const aSaved = a.statusTone === 'saved' ? 0 : 1;
      const bSaved = b.statusTone === 'saved' ? 0 : 1;
      return aSaved - bSaved || a.fallbackRank - b.fallbackRank;
    });
  })();
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const connectedToolHref = (
    toolId: string,
    fallbackHref: string,
    section?: 'SYSTEMS' | 'ROOMS' | 'DOCUMENTS',
  ) => {
    if (!section) return toolById.get(toolId)?.href ?? fallbackHref;
    const anchor = section === 'SYSTEMS' ? 'property-systems' : section === 'ROOMS' ? 'property-rooms' : 'property-documents';
    return getPropertyToolPresentations({
      propertyId,
      returnTo: `${propertyPath}#${anchor}`,
      contextVersion,
      section,
    }).find((tool) => tool.toolId === toolId)?.href ?? fallbackHref;
  };
  const trackContextualToolOpen = (toolId: string, originSection: string) => {
    const tool = toolById.get(toolId);
    track('tool_discovery_clicked', {
      propertyId,
      surface: 'property_detail',
      toolId,
      contextVersion,
      originSection,
      sourceEntityType: 'PROPERTY_RECORD',
      sourceEntityId: propertyId,
      readiness: tool?.statusTone === 'unavailable'
        ? 'UNKNOWN'
        : tool?.statusTone === 'loading'
          ? 'NEEDS_CONTEXT'
          : 'READY',
      registryVersion: overview.registryVersion,
      toolGroup: tool?.group,
      toolState: tool?.statusTone,
    });
  };

  const latestDocument = overview.sections.documents.data?.latest ?? null;

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 space-y-4 lg:order-1 lg:row-span-2">
          <RecordPanel
            id="property-details"
            title="Property profile"
            description="The essential identity and structure facts for this home."
            href={`/dashboard/properties/${propertyId}/edit`}
            actionLabel="Edit details"
            icon={<Home className="h-4 w-4" aria-hidden="true" />}
          >
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <FactRow label="Property type" value={formatEnum(property.dwellingType)} fact={contextSnapshot?.facts['core.dwellingType']} propertyId={propertyId} />
              <FactRow label="Ownership" value={formatEnum(property.ownershipForm)} fact={contextSnapshot?.facts['responsibility.ownershipForm']} propertyId={propertyId} />
              <FactRow label="Built" value={property.yearBuilt ? String(property.yearBuilt) : 'Add year'} missing={!property.yearBuilt} fact={contextSnapshot?.facts['structure.yearBuilt']} propertyId={propertyId} />
              <FactRow label="Living area" value={property.propertySize ? `${property.propertySize.toLocaleString()} sqft` : 'Add size'} missing={!property.propertySize} fact={contextSnapshot?.facts['core.propertySizeSqFt']} propertyId={propertyId} />
              <FactRow label="Layout" value={property.bedrooms != null || property.bathrooms != null ? `${property.bedrooms ?? '—'} bd · ${property.bathrooms ?? '—'} ba` : 'Add layout'} missing={property.bedrooms == null && property.bathrooms == null} />
              <FactRow label="Occupancy" value={formatEnum(property.occupancyStatus)} fact={contextSnapshot?.facts['core.occupancyStatus']} propertyId={propertyId} />
            </dl>
          </RecordPanel>

          <div className="grid items-start gap-4 md:grid-cols-2">
            <RecordPanel
              id="property-systems"
              title="Systems & inventory"
              description="Major systems, appliances, equipment, warranties, and supporting records."
              href={withBackTo(`/dashboard/properties/${propertyId}/inventory`)}
              actionLabel={inventoryQuery.isError ? 'Retry in inventory' : inventoryCount > 0 ? 'View inventory' : 'Add first system'}
              icon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{queryCount(inventoryQuery.isLoading, inventoryQuery.isError, systemItemCount)}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Major systems</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{queryCount(inventoryQuery.isLoading, inventoryQuery.isError, inventoryCount)}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Total items</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{queryCount(inventoryQuery.isLoading, inventoryQuery.isError, inventoryWithDocuments)}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">With records</p></div>
              </div>
              {enableConnectedTools ? (
                <Link
                  href={connectedToolHref('capital-timeline', withBackTo(`/dashboard/properties/${propertyId}/tools/capital-timeline`), 'SYSTEMS')}
                  onClick={() => trackContextualToolOpen('capital-timeline', 'SYSTEMS')}
                  className="no-brand-style mt-3 inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700"
                >
                  Plan system lifecycle
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </RecordPanel>

            <RecordPanel
              id="property-rooms"
              title="Rooms & household"
              description="Spaces, room context, occupants, and household access."
              href={withBackTo(`/dashboard/properties/${propertyId}/rooms`)}
              actionLabel={roomsQuery.isError ? 'Retry in rooms' : rooms.length > 0 ? 'View rooms' : 'Add first room'}
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{queryCount(roomsQuery.isLoading, roomsQuery.isError, rooms.length)}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Rooms recorded</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="mb-0 text-xl font-semibold text-slate-950">{queryCount(householdQuery.isLoading, householdQuery.isError, householdCount)}</p><p className="mt-1 mb-0 text-[11px] text-slate-500">Household members</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={withBackTo(`/dashboard/properties/${propertyId}/household`)} className="no-brand-style inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700">
                  Manage household
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                {enableConnectedTools ? (
                  <Link href={connectedToolHref('plant-advisor', withBackTo(`/dashboard/properties/${propertyId}/tools/plant-advisor`), 'ROOMS')} onClick={() => trackContextualToolOpen('plant-advisor', 'ROOMS')} className="no-brand-style inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700">
                    Open Plant Advisor
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </RecordPanel>
          </div>

          <RecordPanel
            id="property-documents"
            title="Documents"
            description="Inspections, warranties, policies, receipts, and other evidence attached to this property."
            href={documentsHref}
            actionLabel="View documents"
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          >
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-0 text-2xl font-semibold text-slate-950">{queryCount(documentsQuery.isLoading, documentsQuery.isError, documentsCount)}</p>
                <p className="mt-0.5 mb-0 text-xs text-slate-500">Documents attached to this property</p>
              </div>
              <Link href={documentsHref} className="no-brand-style inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                Upload document
              </Link>
            </div>
            {documentData && documentData.totalCount > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{documentData.verifiedCount} verified</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{documentData.needsReviewCount} need review</span>
                {documentData.byType.slice(0, 3).map((entry) => (
                  <span key={entry.type} className="rounded-full bg-white px-2.5 py-1">{formatEnum(entry.type)} {entry.count}</span>
                ))}
              </div>
            ) : null}
            {enableConnectedTools ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={connectedToolHref('property-brief', withBackTo(`/dashboard/properties/${propertyId}/property-brief`), 'DOCUMENTS')} onClick={() => trackContextualToolOpen('property-brief', 'DOCUMENTS')} className="no-brand-style inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700">
                  Create Property Brief
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <Link href={connectedToolHref('home-digital-will', withBackTo(`/dashboard/properties/${propertyId}/tools/home-digital-will`), 'DOCUMENTS')} onClick={() => trackContextualToolOpen('home-digital-will', 'DOCUMENTS')} className="no-brand-style inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-emerald-700">
                  Prepare Continuity Plan
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </RecordPanel>

        </div>

        <div className="contents">
          <div className="order-1 lg:order-2">
            <RecordCompleteness propertyId={propertyId} categories={categories} />
          </div>

          <section className="order-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:order-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Record history</p>
                <h2 className="mb-0 text-base font-semibold text-slate-950">Recent updates</h2>
              </div>
              <Link href={withBackTo(`/dashboard/properties/${propertyId}/timeline`)} className="no-brand-style text-xs font-semibold text-emerald-700">View history</Link>
            </div>
            <div className="mt-3 space-y-2">
              {overview.tools.homeTimeline.status === 'UNAVAILABLE' ? (
                <p role="status" className="mb-0 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Verified record history is temporarily unavailable.</p>
              ) : overview.tools.homeTimeline.data?.recent.length ? (
                overview.tools.homeTimeline.data.recent.slice(0, 3).map((event) => (
                  <div key={event.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="mb-0 truncate text-sm font-medium text-slate-900">{event.title}</p>
                      <p className="mt-0.5 mb-0 text-xs text-slate-500">{formatDate(event.occurredAt)} · {formatEnum(event.sourceBadge)} · {event.verificationStatus === 'EVIDENCE_VERIFIED' ? 'Evidence verified' : 'Homeowner confirmed'}</p>
                    </div>
                  </div>
                ))
              ) : latestDocument ? (
                <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                  <div className="min-w-0"><p className="mb-0 truncate text-sm font-medium text-slate-900">{latestDocument.name}</p><p className="mt-0.5 mb-0 text-xs text-slate-500">Latest document · {formatDate(latestDocument.createdAt)}</p></div>
                </div>
              ) : (
                <p className="mb-0 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Confirmed milestones and evidence-backed updates will appear here.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {enableConnectedTools ? (
        <RelatedPropertyTools
          propertyId={propertyId}
          contextVersion={contextVersion}
          tools={tools}
          allToolsHref={`/dashboard/home-tools?propertyId=${encodeURIComponent(propertyId)}&toolIds=${encodeURIComponent(tools.map((tool) => tool.id).join(','))}&backTo=${encodeURIComponent(propertyPath)}`}
          registryVersion={overview.registryVersion}
        />
      ) : null}
      <RelatedWorkspaces propertyId={propertyId} backTo={propertyPath} />
    </div>
  );
}
