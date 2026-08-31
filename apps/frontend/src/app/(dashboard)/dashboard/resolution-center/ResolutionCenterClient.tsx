'use client';

import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricTile, PageHero, SmartCTA, TrustMetaRow } from '@/components/system/PremiumPrimitives';
import { SourceChip } from '@/components/trust';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { Property, RankedHomeActionDTO } from '@/types';

type ResolutionFilter = 'all' | 'decisions' | 'information' | 'exceptions';
export type ResolutionCaseKind = Exclude<ResolutionFilter, 'all'>;
type ResolutionHomeAction = ReturnType<typeof toResolutionAction>;

export type ResolutionCase = {
  key: string;
  kind: ResolutionCaseKind;
  action: ResolutionHomeAction;
  relatedActions: ResolutionHomeAction[];
  missingInformation: string[];
};

const FILTERS: Array<{ key: ResolutionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'information', label: 'Missing information' },
  { key: 'exceptions', label: 'Blocked or verify' },
];

const EXCEPTION_STATES = new Set(['BLOCKED', 'REPORTED_COMPLETE', 'FOLLOW_UP_DUE', 'REOPENED']);
const GENERIC_SUBJECT_LABELS = new Set(['property', 'home', 'home workflow', 'home asset']);
const DECISION_CTA_KINDS = new Set(['COMPARE', 'PURCHASE', 'FINANCE']);
const DECISION_SOURCE_KINDS = new Set(['INCIDENT', 'RECALL']);
const DECISION_VARIANTS = new Set(['COVERAGE_REVIEW', 'FINANCIAL_EXPOSURE']);
const INFORMATION_VARIANTS = new Set(['HOME_FACT_REVIEW', 'HEALTH_FACTOR_REVIEW']);

function normalizeUpper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function toDisplayLabel(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'Home asset';
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      return upper.length <= 4 && word === upper
        ? upper
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

function isMachineToken(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return Boolean(text && (text.includes('_') || (/^[A-Z0-9\s-]+$/.test(text) && text === text.toUpperCase())));
}

export function resolveAssetTitle(item: any): string {
  const subject = item?.presentation?.subject?.label;
  if (typeof subject === 'string' && subject.trim()) return subject.trim();
  return toDisplayLabel(item?.systemType || item?.category || item?.title);
}

export function resolveIssueHeadline(item: any): string {
  const headline = item?.presentation?.headline;
  if (typeof headline === 'string' && headline.trim()) return headline.trim();
  const fallback = [item?.title, item?.summary]
    .map((value) => String(value ?? '').trim())
    .find((value) => value && !isMachineToken(value));
  return fallback || 'Review this home action';
}

const GENERIC_DESCRIPTIONS = new Set(['schedule maintenance', 'schedule maintenance task', 'maintenance task']);

export function resolveIssueDescription(item: any, headline: string): string {
  const candidate = [
    item?.presentation?.whyNow,
    item?.presentation?.summary,
    item?.description,
    item?.summary,
    item?.whyItMatters,
  ]
    .map((value) => String(value ?? '').trim())
    .find((value) =>
      Boolean(
        value &&
          value !== headline &&
          !isMachineToken(value) &&
          !GENERIC_DESCRIPTIONS.has(value.toLowerCase()),
      ),
    );
  return candidate || 'Review the supporting home information before choosing the next step.';
}

export function isProviderExecutionAction(action: any): boolean {
  return action?.presentation?.variant === 'ACCEPTED_WORK';
}

export function isUrgentAction(action: any): boolean {
  return (
    action?.priority === 'NOW' ||
    action?.governance?.safetyTier === 'SAFETY_EMERGENCY' ||
    normalizeUpper(action?.riskLevel) === 'CRITICAL' ||
    action?.overdue === true
  );
}

export function toResolutionAction(action: RankedHomeActionDTO) {
  const priorityRisk =
    action.priority === 'NOW' || action.governance.safetyTier === 'SAFETY_EMERGENCY'
      ? 'CRITICAL'
      : action.priority === 'SOON'
        ? 'MEDIUM'
        : 'LOW';
  const dueAt = action.timing?.dueAt ?? null;
  return {
    ...action,
    __kind: 'home-action' as const,
    actionKey: action.id,
    title: action.presentation?.headline ?? action.recommendedAction,
    description: action.presentation?.whyNow ?? action.presentation?.summary ?? action.whyItMatters,
    summary: action.presentation?.summary ?? action.whyItMatters,
    category: action.source.kind,
    systemType: action.presentation?.subject?.label ?? action.source.kind,
    riskLevel: priorityRisk,
    severity: priorityRisk,
    status: action.state,
    nextDueDate: dueAt,
    dueDate: dueAt,
    overdue: Boolean(dueAt && Date.parse(dueAt) < Date.now()),
    confidence: { ...action.confidence, level: action.confidence.label },
    cta: action.primaryCta,
  };
}

function factKinds(action: any): string[] {
  return (action?.presentation?.factGroups ?? []).flatMap((group: any) =>
    (group?.facts ?? []).map((fact: any) => normalizeUpper(fact?.kind)),
  );
}

export function isMissingInformationAction(action: any): boolean {
  const responseStatus = normalizeUpper(action?.recommendationResponse?.status);
  return Boolean(
    normalizeUpper(action?.primaryCta?.kind) === 'CORRECT_FACT' ||
      INFORMATION_VARIANTS.has(normalizeUpper(action?.presentation?.variant)) ||
      (action?.confidence?.missing?.length ?? 0) > 0 ||
      (action?.confidence?.conflicted?.length ?? 0) > 0 ||
      ['LOW_CONFIDENCE', 'DATA_UNAVAILABLE', 'UPSTREAM_FAILURE'].includes(responseStatus) ||
      factKinds(action).some((kind) => kind === 'MISSING' || kind === 'CONFLICTED'),
  );
}

export function isExecutionExceptionAction(action: any): boolean {
  return isProviderExecutionAction(action) && EXCEPTION_STATES.has(normalizeUpper(action?.workItem?.state));
}

function isCoverageAction(action: any): boolean {
  const text = [action?.title, action?.description, action?.category, action?.actionKey]
    .map(normalizeUpper)
    .join(' ');
  return (
    action?.source?.kind === 'COVERAGE' ||
    action?.governance?.safetyTier === 'REGULATED_COVERAGE' ||
    DECISION_VARIANTS.has(normalizeUpper(action?.presentation?.variant)) ||
    /COVERAGE|WARRANTY|INSURANCE|POLICY/.test(text)
  );
}

function isRepairReplaceAction(action: any): boolean {
  const identity = `${action?.id ?? ''} ${action?.lineageId ?? ''} ${action?.primaryCta?.href ?? ''}`.toLowerCase();
  return identity.includes('repair-replace') || identity.includes('replace-repair');
}

export function isDecisionAction(action: any): boolean {
  if (isProviderExecutionAction(action)) return false;
  return Boolean(
    action?.job === 'DECIDE' ||
      isUrgentAction(action) ||
      isCoverageAction(action) ||
      isRepairReplaceAction(action) ||
      DECISION_CTA_KINDS.has(normalizeUpper(action?.primaryCta?.kind)) ||
      DECISION_SOURCE_KINDS.has(normalizeUpper(action?.source?.kind)),
  );
}

export function resolutionCaseKind(action: any): ResolutionCaseKind | null {
  if (isMissingInformationAction(action)) return 'information';
  if (isExecutionExceptionAction(action)) return 'exceptions';
  if (isDecisionAction(action)) return 'decisions';
  return null;
}

export function resolutionCaseKey(action: any): string {
  const subject = action?.presentation?.subject;
  const subjectKind = normalizeUpper(subject?.kind);
  const subjectId = String(subject?.id ?? '').trim();
  const subjectLabel = String(subject?.label ?? '').trim();
  if (subjectKind === 'INVENTORY_ITEM' && subjectId) return `inventory-item:${subjectId}`;
  if (subjectKind && !['PROPERTY', 'WORK_ITEM'].includes(subjectKind) && subjectId) {
    return `${subjectKind.toLowerCase()}:${subjectId}`;
  }
  if (subjectLabel && !GENERIC_SUBJECT_LABELS.has(subjectLabel.toLowerCase())) {
    return `subject-label:${subjectLabel.toLowerCase()}`;
  }
  if (subjectKind === 'WORK_ITEM' && subjectId) return `work-item:${subjectId}`;
  return `action:${action?.deduplication?.canonicalKey || action?.actionKey || action?.id}`;
}

function missingInformation(action: any): string[] {
  const factLabels = (action?.presentation?.factGroups ?? []).flatMap((group: any) =>
    (group?.facts ?? [])
      .filter((fact: any) => ['MISSING', 'CONFLICTED'].includes(normalizeUpper(fact?.kind)))
      .map((fact: any) => String(fact?.label ?? fact?.key ?? '').trim()),
  );
  return Array.from(
    new Set(
      [
        ...(action?.confidence?.missing ?? []),
        ...(action?.confidence?.conflicted ?? []),
        ...(action?.recommendationResponse?.missingFacts ?? []),
        ...factLabels,
      ].filter(Boolean),
    ),
  );
}

const KIND_PRIORITY: Record<ResolutionCaseKind, number> = {
  information: 0,
  exceptions: 1,
  decisions: 2,
};

export function composeResolutionCases(actions: RankedHomeActionDTO[]): ResolutionCase[] {
  const groups = new Map<string, ResolutionHomeAction[]>();
  for (const raw of actions) {
    const action = toResolutionAction(raw);
    if (!resolutionCaseKind(action)) continue;
    const key = resolutionCaseKey(action);
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }

  return Array.from(groups.entries())
    .map(([key, grouped]) => {
      const ordered = [...grouped].sort((left, right) => {
        const leftKind = resolutionCaseKind(left)!;
        const rightKind = resolutionCaseKind(right)!;
        return KIND_PRIORITY[leftKind] - KIND_PRIORITY[rightKind] ||
          (left.ranking?.rank ?? Number.MAX_SAFE_INTEGER) - (right.ranking?.rank ?? Number.MAX_SAFE_INTEGER);
      });
      const action = ordered[0];
      return {
        key,
        kind: resolutionCaseKind(action)!,
        action,
        relatedActions: ordered.slice(1),
        missingInformation: Array.from(new Set(ordered.flatMap(missingInformation))),
      };
    })
    .sort((left, right) =>
      KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind] ||
      (left.action.ranking?.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.action.ranking?.rank ?? Number.MAX_SAFE_INTEGER),
    );
}

function normalizeFilter(value: string | null): ResolutionFilter {
  return FILTERS.some((filter) => filter.key === value) ? (value as ResolutionFilter) : 'all';
}

function caseCopy(item: ResolutionCase) {
  if (item.kind === 'information') {
    return {
      label: 'Information needed',
      why: item.action.whyItMatters || 'The recommendation cannot be made reliably until this home record is corrected.',
      value: item.action.expectedOutcome || 'More accurate timing, cost guidance, and future recommendations.',
      tone: 'border-amber-200 bg-amber-50/25',
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }
  if (item.kind === 'exceptions') {
    return {
      label: normalizeUpper(item.action.workItem?.state) === 'REPORTED_COMPLETE' ? 'Verify completion' : 'Work needs attention',
      why: item.action.whyItMatters || 'This accepted work cannot progress or close without your input.',
      value: item.action.expectedOutcome || 'Clear the exception and keep the work record accurate.',
      tone: 'border-rose-200 bg-rose-50/25',
      badge: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }
  return {
    label: 'Decision needed',
    why: item.action.whyItMatters || 'A choice is needed before the recommended next step can move forward.',
    value: item.action.expectedOutcome || 'Make an informed choice using the evidence already on record.',
    tone: 'border-teal-200 bg-teal-50/20',
    badge: 'border-teal-200 bg-teal-50 text-teal-800',
  };
}

function sourceLabels(action: ResolutionHomeAction): string[] {
  return Array.from(
    new Set(
      (action.evidence ?? [])
        .map((evidence) => String(evidence.source || evidence.label || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

function ResolutionCaseCard({ item }: { item: ResolutionCase }) {
  const copy = caseCopy(item);
  const headline = resolveIssueHeadline(item.action);
  const description = resolveIssueDescription(item.action, headline);
  const secondary = item.action.secondaryCtas?.[0];
  const sources = sourceLabels(item.action);

  return (
    <article className={cn('rounded-[24px] border p-5 shadow-sm md:p-6', copy.tone)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', copy.badge)}>{copy.label}</span>
            <span className="text-sm font-medium text-slate-600">{resolveAssetTitle(item.action)}</span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-slate-950">{headline}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>

          {item.missingInformation.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">What we need from you</p>
              <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                {item.missingInformation.map((fact) => <li key={fact}>• {fact}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/90 bg-white/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">{copy.why}</p>
            </div>
            <div className="rounded-2xl border border-white/90 bg-white/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Value of resolving it</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">{copy.value}</p>
            </div>
          </div>

          {item.relatedActions.length > 0 ? (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              This case also considers {item.relatedActions.map(resolveIssueHeadline).join('; ')}.
            </p>
          ) : null}
          {sources.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {sources.map((source) => <SourceChip key={source} source={source} />)}
            </div>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-56">
          <Button asChild className="min-h-11 bg-teal-700 text-white hover:bg-teal-800">
            <Link href={item.action.primaryCta.href}>{item.action.primaryCta.label}</Link>
          </Button>
          {secondary ? (
            <Button asChild variant="outline" className="min-h-10 bg-white/80">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ResolutionCenterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId: contextPropertyId, setSelectedPropertyId } = usePropertyContext();
  const requestedPropertyId = searchParams.get('propertyId');
  const filter = normalizeFilter(searchParams.get('filter'));

  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ['dashboard-properties'],
    queryFn: async (): Promise<Property[]> => {
      const response = await api.getProperties();
      return response.success ? response.data.properties : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedPropertyId =
    requestedPropertyId && properties.some((property) => property.id === requestedPropertyId)
      ? requestedPropertyId
      : contextPropertyId && (propertiesLoading || properties.length === 0 || properties.some((property) => property.id === contextPropertyId))
        ? contextPropertyId
        : properties[0]?.id;

  useEffect(() => {
    if (selectedPropertyId && selectedPropertyId !== contextPropertyId) setSelectedPropertyId(selectedPropertyId);
  }, [contextPropertyId, selectedPropertyId, setSelectedPropertyId]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home-actions', selectedPropertyId],
    queryFn: () => selectedPropertyId ? api.getHomeActions(selectedPropertyId) : Promise.resolve(null as any),
    enabled: Boolean(selectedPropertyId),
  });

  const cases = useMemo(
    () => composeResolutionCases((((data as any)?.actions ?? []) as RankedHomeActionDTO[])),
    [data],
  );
  const visibleCases = filter === 'all' ? cases : cases.filter((item) => item.kind === filter);
  const counts = {
    decisions: cases.filter((item) => item.kind === 'decisions').length,
    information: cases.filter((item) => item.kind === 'information').length,
    exceptions: cases.filter((item) => item.kind === 'exceptions').length,
  };
  const operationsHref = selectedPropertyId
    ? `/dashboard/properties/${selectedPropertyId}/home-operations`
    : '/dashboard';

  const chooseFilter = (next: ResolutionFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('filter'); else params.set('filter', next);
    router.replace(`/dashboard/resolution-center${params.size ? `?${params.toString()}` : ''}`);
  };

  if (propertiesLoading || isLoading) {
    return <div className="h-72 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100" />;
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHero
        eyebrow="Resolution Center"
        title="Decisions & Exceptions"
        description="Review choices, supply missing home information, and clear work that is blocked or waiting for verification. Accepted work and routine upkeep stay in Home Operations."
        icon={<ClipboardCheck className="h-5 w-5" />}
        action={<SmartCTA asChild><Link href={operationsHref}>View all work</Link></SmartCTA>}
        meta={<TrustMetaRow items={[`${cases.length} cases need your input`, 'One case per home asset']} />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile label="Decisions" value={counts.decisions} hint="Choose the next step" tone="brand" />
          <MetricTile label="Missing information" value={counts.information} hint="Improve recommendation accuracy" tone="warning" />
          <MetricTile label="Blocked or verify" value={counts.exceptions} hint="Unblock or close accepted work" tone="urgent" />
        </div>
      </PageHero>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/75 p-2" aria-label="Resolution case filters">
        {FILTERS.map((option) => {
          const count = option.key === 'all' ? cases.length : counts[option.key];
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => chooseFilter(option.key)}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                filter === option.key
                  ? 'border-teal-300 bg-teal-50 text-teal-800'
                  : 'border-transparent text-slate-600 hover:bg-slate-50',
              )}
            >
              {option.label} <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </nav>

      {isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-rose-600" />
          <p className="mt-2 font-semibold text-slate-900">We could not load your resolution cases.</p>
          <Button variant="outline" className="mt-4 bg-white" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : visibleCases.length > 0 ? (
        <div className="space-y-4">{visibleCases.map((item) => <ResolutionCaseCard key={item.key} item={item} />)}</div>
      ) : (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/35 p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-xl font-semibold text-slate-950">Nothing needs your input here</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Decisions, missing information, and work exceptions will appear here. Continue routine and accepted work in Home Operations.
          </p>
          <Button asChild variant="outline" className="mt-5 bg-white"><Link href={operationsHref}>Open Home Operations</Link></Button>
        </div>
      )}
    </div>
  );
}
