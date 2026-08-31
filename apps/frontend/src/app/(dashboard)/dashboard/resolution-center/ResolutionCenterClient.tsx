'use client';

import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const KIND_META: Record<ResolutionCaseKind, { accent: string; pill: string; dot: string }> = {
  information: { accent: 'border-l-amber-400', pill: 'bg-amber-50 text-amber-800 ring-amber-200/70', dot: 'bg-amber-500' },
  decisions: { accent: 'border-l-teal-500', pill: 'bg-teal-50 text-teal-800 ring-teal-200/70', dot: 'bg-teal-600' },
  exceptions: { accent: 'border-l-rose-400', pill: 'bg-rose-50 text-rose-800 ring-rose-200/70', dot: 'bg-rose-500' },
};

function caseLabel(item: ResolutionCase): string {
  if (item.kind === 'information') return 'Information needed';
  if (item.kind === 'exceptions') {
    return normalizeUpper(item.action.workItem?.state) === 'REPORTED_COMPLETE' ? 'Verify completion' : 'Needs attention';
  }
  return 'Decision needed';
}

// Backend `expectedOutcome` is often a shared boilerplate sentence — don't give
// it its own line when it says nothing specific to this case.
const GENERIC_OUTCOMES = new Set([
  'complete the task and record the outcome.',
  'make an informed choice using the evidence already on record.',
  'more accurate timing, cost guidance, and future recommendations.',
  'clear the exception and keep the work record accurate.',
  'resolve or deliberately schedule the action with its supporting context preserved.',
  'a clear next step is chosen.',
]);

function substantiveOutcome(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text && !GENERIC_OUTCOMES.has(text.toLowerCase()) ? text : null;
}

// The backend auto-generates "Review <asset name> details" / "Add … for …" for
// actions with no authored CTA — collapse those to a short verb so the button
// never overflows. A concise authored label is used as-is.
const CTA_KIND_LABEL: Record<string, string> = {
  CORRECT_FACT: 'Update details',
  REVIEW: 'Review',
  COMPARE: 'Compare options',
  PURCHASE: 'Review options',
  FINANCE: 'Review financing',
  SCHEDULE: 'Schedule',
  SELECT_PROVIDER: 'Find a pro',
  ESCALATE: 'Review now',
  START: 'Start',
};

function shortCtaLabel(cta: { kind?: string; label: string }, kind: ResolutionCaseKind): string {
  const raw = String(cta.label ?? '').trim();
  const autogenerated = /^review .+ details$/i.test(raw) || /^(add|confirm) .+\b(for|details)\b/i.test(raw);
  if (raw && !autogenerated && raw.length <= 24) return raw;
  return (
    CTA_KIND_LABEL[normalizeUpper(cta.kind)] ??
    (kind === 'information' ? 'Update details' : kind === 'decisions' ? 'Review decision' : 'Review')
  );
}

// Missing-fact labels arrive verbose and sometimes prefixed with the subject
// ("Smoke & CO Detector Check condition" alongside a bare "Condition").
function tidyNeeds(needs: string[], subjectLabel: string): string[] {
  const subject = subjectLabel.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of needs) {
    let text = String(entry ?? '').trim();
    if (subject && text.toLowerCase().startsWith(subject)) {
      text = text.slice(subject.length).replace(/^[\s:–-]+/, '').trim();
    }
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out;
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
  const meta = KIND_META[item.kind];
  const headline = resolveIssueHeadline(item.action);
  const subject = resolveAssetTitle(item.action);
  const why = resolveIssueDescription(item.action, headline);
  const needs = tidyNeeds(item.missingInformation, subject);
  const primary = item.action.primaryCta;
  const secondary = item.action.secondaryCtas?.[0];
  const sources = sourceLabels(item.action);

  const subjectKicker =
    subject && subject.toLowerCase() !== 'home asset' && !headline.toLowerCase().includes(subject.toLowerCase())
      ? subject
      : null;
  const fullerWhy = (() => {
    const text = String(item.action.whyItMatters ?? '').trim();
    return text && text.toLowerCase() !== why.trim().toLowerCase() && !isMachineToken(text) ? text : null;
  })();
  const outcome = substantiveOutcome(item.action.expectedOutcome);
  const related = item.relatedActions
    .map(resolveIssueHeadline)
    .filter((text) => {
      const lower = text.toLowerCase();
      return lower !== headline.toLowerCase() && !lower.includes(subject.toLowerCase());
    });
  const hasDetails = Boolean(fullerWhy || outcome || related.length || sources.length);

  return (
    <article
      className={cn(
        'rounded-2xl border border-slate-200 border-l-[3px] bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5',
        meta.accent,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                meta.pill,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
              {caseLabel(item)}
            </span>
            {subjectKicker ? (
              <span className="truncate text-xs font-medium text-slate-500">{subjectKicker}</span>
            ) : null}
          </div>

          <h2 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 sm:text-base">{headline}</h2>
          <p className="mt-1 line-clamp-2 max-w-[68ch] text-sm leading-6 text-slate-600">{why}</p>

          {needs.length > 0 ? (
            <p className="mt-2.5 text-xs leading-5 text-slate-500">
              <span className="font-semibold text-slate-600">Needs from you:</span>{' '}
              {needs.slice(0, 5).join(' · ')}
              {needs.length > 5 ? ` · +${needs.length - 5} more` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button
            asChild
            size="sm"
            className="h-9 whitespace-nowrap rounded-lg bg-teal-700 px-3.5 text-[13px] font-semibold text-white hover:bg-teal-800"
          >
            <Link href={primary.href} title={primary.label}>
              {shortCtaLabel(primary, item.kind)}
              <ChevronRight className="ml-0.5 h-4 w-4" />
            </Link>
          </Button>
          {secondary ? (
            <Link
              href={secondary.href}
              title={secondary.label}
              className="max-w-[11rem] truncate text-xs font-medium text-teal-700 hover:underline"
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>

      {hasDetails ? (
        <details className="group mt-3 border-t border-slate-100 pt-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
            Why this matters &amp; details
          </summary>
          <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
            {fullerWhy ? <p>{fullerWhy}</p> : null}
            {outcome ? (
              <p>
                <span className="font-semibold text-slate-700">Value of resolving it:</span> {outcome}
              </p>
            ) : null}
            {related.length ? (
              <p className="text-xs text-slate-500">Also considers: {related.join('; ')}.</p>
            ) : null}
            {sources.length ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {sources.map((source) => (
                  <SourceChip key={source} source={source} />
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
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
    <div className="mx-auto max-w-5xl space-y-4 pb-16">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-teal-700">
              <ClipboardCheck className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Resolution Center</span>
            </div>
            <h1 className="mt-1.5 text-xl font-semibold text-slate-950 sm:text-2xl">Decisions &amp; missing information</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {cases.length > 0
                ? `${cases.length} ${cases.length === 1 ? 'case needs' : 'cases need'} your input. Accepted work and routine upkeep stay in Home Operations.`
                : 'Choices and missing information will appear here. Accepted work stays in Home Operations.'}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 rounded-lg bg-white">
            <Link href={operationsHref}>View all work</Link>
          </Button>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1.5" aria-label="Resolution case filters">
          {FILTERS.map((option) => {
            const count = option.key === 'all' ? cases.length : counts[option.key];
            const active = filter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => chooseFilter(option.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {option.label}
                <span className={cn('ml-1.5 text-xs', active ? 'text-white/80' : 'text-slate-400')}>{count}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-rose-600" />
          <p className="mt-2 font-semibold text-slate-900">We could not load your resolution cases.</p>
          <Button variant="outline" className="mt-4 bg-white" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : visibleCases.length > 0 ? (
        <div className="space-y-3">{visibleCases.map((item) => <ResolutionCaseCard key={item.key} item={item} />)}</div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-slate-950">Nothing needs your input here</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Decisions and missing information will appear here. Continue routine and accepted work in Home Operations.
          </p>
          <Button asChild variant="outline" className="mt-5 bg-white"><Link href={operationsHref}>Open Home Operations</Link></Button>
        </div>
      )}
    </div>
  );
}
