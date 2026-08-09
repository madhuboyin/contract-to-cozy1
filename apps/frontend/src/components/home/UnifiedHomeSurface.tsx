'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { usePostLoginTransitionReadiness } from '@/components/system/PostLoginTransitionContext';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  CloudLightning,
  CloudSun,
  CalendarDays,
  FileCheck2,
  Home,
  MessageCircle,
  Milestone,
  PencilLine,
  Radar,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  HomeActionCommand,
  HomeFirstValueInsightDTO,
  RankedHomeActionDTO,
  UnifiedHomeDTO,
} from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { UnifiedHomeToolsSection } from '@/components/home/UnifiedHomeToolsSection';
import { resolveHomeActionPrimaryHref } from '@/lib/navigation/homeActionNavigation';
import { buildHomeEventRadarHref } from '@/features/homeEventRadar/radarDeepLinks';
import { WorkItemManageDrawer } from '@/components/home/WorkItemManageDrawer';
import { track } from '@/lib/analytics/events';

/**
 * Home Operations Item #13 (§ launch-review gap): last carried by the
 * deleted MobileDashboardHome.tsx (Slice 9) — UnifiedHomeSurface never
 * picked it up when it replaced that component in Slice 2. Home Event
 * Radar isn't a registered HOME_ACTION_SOURCE_KIND, so it can't appear via
 * the ranked-action feed; it's fetched and rendered as its own standalone
 * widget until it has its own canonical source adapter.
 */
function HomeEventRadarTopMatchCard({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['home-event-radar-top-match', propertyId],
    queryFn: () => api.getRadarEvents(propertyId, { limit: 20, state: ['new', 'seen', 'saved', 'acted_on'] }),
    enabled: Boolean(propertyId),
    staleTime: 3 * 60 * 1000,
  });
  const items = query.data?.items ?? [];
  const topItem = items[0] ?? null;
  if (!topItem) return null;

  const href = buildHomeEventRadarHref({
    propertyId,
    view: topItem.matchLifecycleStatus,
    family: topItem.sourceFamily,
    matchId: topItem.propertyMatchId,
    context: { launchSurface: 'unified_home' },
  });
  const newCount = items.filter((item) => item.userState === 'new').length;

  return (
    <Card className="rounded-[24px] border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-950">
            <Radar className="h-4 w-4 text-slate-500" />Home Radar
          </p>
          <p className="mt-1 text-sm text-slate-600">{topItem.title}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
          <Link href={href}>{newCount > 0 ? `${newCount} new` : 'Open Radar'}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function priorityTone(priority: RankedHomeActionDTO['priority']) {
  if (priority === 'NOW') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'SOON') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (priority === 'PLAN') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function priorityLabel(priority: RankedHomeActionDTO['priority']) {
  if (priority === 'PLAN') return 'Plan ahead';
  if (priority === 'CONSIDER') return 'Good to know';
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

export function coverageCorrectionSubject(action: RankedHomeActionDTO): string | null {
  if (action.source.kind !== 'GUIDANCE' || action.governance.safetyTier !== 'REGULATED_COVERAGE') return null;
  return action.recommendedAction.match(/^(?:Add coverage information|Confirm coverage) for (.+)$/i)?.[1]?.trim() || null;
}

export function isSeasonalChecklistAction(action: RankedHomeActionDTO): boolean {
  return action.source.kind === 'MAINTENANCE' && action.id.startsWith('seasonal-checklist:');
}

export function isEnvironmentAction(action: RankedHomeActionDTO): boolean {
  return action.source.kind === 'MAINTENANCE' && action.id.startsWith('environment:');
}

export function isCriticalWeatherAction(action: RankedHomeActionDTO): boolean {
  return action.source.kind === 'INCIDENT' &&
    action.governance.safetyTier === 'SAFETY_EMERGENCY' &&
    action.evidence.some((evidence) => /weather|national weather service/i.test(evidence.source));
}

export type AttentionEntry =
  | { kind: 'ACTION'; action: RankedHomeActionDTO }
  | { kind: 'SEASONAL_CHECKLIST'; action: RankedHomeActionDTO }
  | { kind: 'CRITICAL_WEATHER'; action: RankedHomeActionDTO }
  | { kind: 'ENVIRONMENT'; action: RankedHomeActionDTO }
  | { kind: 'COVERAGE_CORRECTION_GROUP'; actions: RankedHomeActionDTO[]; subjects: string[] };

function entryForAction(action: RankedHomeActionDTO): AttentionEntry {
  if (isCriticalWeatherAction(action)) return { kind: 'CRITICAL_WEATHER', action };
  if (isEnvironmentAction(action)) return { kind: 'ENVIRONMENT', action };
  if (isSeasonalChecklistAction(action)) return { kind: 'SEASONAL_CHECKLIST', action };
  return { kind: 'ACTION', action };
}

export function groupAttentionActions(actions: RankedHomeActionDTO[]): AttentionEntry[] {
  const coverageActions = actions.filter((action) => coverageCorrectionSubject(action));
  if (coverageActions.length < 2) return actions.map(entryForAction);

  const groupedIds = new Set(coverageActions.map((action) => action.id));
  const subjects = [...new Set(coverageActions
    .map((action) => coverageCorrectionSubject(action))
    .filter((subject): subject is string => Boolean(subject)))];
  let inserted = false;

  return actions.flatMap((action): AttentionEntry[] => {
    if (!groupedIds.has(action.id)) return [entryForAction(action)];
    if (inserted) return [];
    inserted = true;
    return [{ kind: 'COVERAGE_CORRECTION_GROUP', actions: coverageActions, subjects }];
  });
}

export function resolveHomeAttentionState(
  actionCount: number,
  context: Pick<
    UnifiedHomeDTO['propertyContext'],
    'missingFactCount' | 'conflictedFactCount' | 'staleFactCount'
  >,
  hasFirstValueInsight = false,
  highPriorityActionCount = actionCount,
): 'ACTIONS' | 'OUTLOOK' | 'SETUP' | 'ALL_CLEAR' {
  if (highPriorityActionCount > 0) return 'ACTIONS';
  if (hasFirstValueInsight) return 'OUTLOOK';
  if (actionCount > 0) return 'ACTIONS';
  if (context.missingFactCount > 0 || context.conflictedFactCount > 0 || context.staleFactCount > 0) {
    return 'SETUP';
  }
  return 'ALL_CLEAR';
}

function formattedAlertExpiry(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CriticalWeatherActionCard({
  action,
  propertyId,
  showSupportingDetails = false,
}: {
  action: RankedHomeActionDTO;
  propertyId: string;
  showSupportingDetails?: boolean;
}) {
  const expiry = formattedAlertExpiry(action.timing.windowEnd ?? action.timing.dueAt);
  return (
    <article className="rounded-2xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 to-amber-50 p-4 shadow-sm" role="alert">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-rose-100 p-2 text-rose-700"><CloudLightning className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-rose-700 text-white hover:bg-rose-700">Critical weather</Badge>
            <span className="text-xs font-semibold text-rose-800">Priority #{action.ranking.rank}</span>
            {expiry && <span className="text-xs text-rose-700">Active until {expiry}</span>}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{action.signal}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{action.whyItMatters}</p>
          {showSupportingDetails && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Official guidance</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{action.expectedOutcome}</p>
              <p className="mt-2 text-xs text-slate-500">Source: {action.evidence[0]?.source ?? 'Official weather alert'}</p>
            </div>
          )}
          <div className="mt-4">
            <Button asChild size="sm" className="rounded-full bg-rose-700 hover:bg-rose-800">
              <Link href={action.primaryCta.href} onClick={() => { void api.recordHomeActionOpened(propertyId, action.id); }}>
                Review weather alert<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function formattedEnvironmentWindow(action: RankedHomeActionDTO): string | null {
  const start = action.timing.windowStart ? new Date(action.timing.windowStart) : null;
  const end = action.timing.windowEnd ? new Date(action.timing.windowEnd) : null;
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    const startLabel = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return startLabel === endLabel ? startLabel : `${startLabel}–${endLabel}`;
  }
  return formattedAlertExpiry(action.timing.dueAt);
}

export function EnvironmentActionCard({
  action,
  propertyId,
  onChanged,
}: {
  action: RankedHomeActionDTO;
  propertyId: string;
  onChanged: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<HomeActionCommand | null>(null);
  const windowLabel = formattedEnvironmentWindow(action);
  const canComplete = action.feedbackControls.includes('COMPLETE');
  const canAcknowledge = !canComplete && action.feedbackControls.includes('ACKNOWLEDGE');
  const windowEndMs = action.timing.windowEnd ? new Date(action.timing.windowEnd).getTime() : Number.NaN;
  const canDefer = (action.feedbackControls.includes('DEFER') || action.feedbackControls.includes('SNOOZE')) &&
    (Number.isNaN(windowEndMs) || windowEndMs > Date.now() + 2 * 60 * 60 * 1000);

  const execute = async (command: HomeActionCommand) => {
    setPending(command);
    try {
      let nextTriggerAt: string | null = null;
      if (['DEFER', 'SNOOZE'].includes(command)) {
        const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
        const expiry = action.timing.windowEnd ? new Date(action.timing.windowEnd).getTime() : Number.NaN;
        const bounded = Number.isNaN(expiry) ? tomorrow : Math.min(tomorrow, expiry - 60 * 60 * 1000);
        nextTriggerAt = new Date(Math.max(Date.now() + 60 * 60 * 1000, bounded)).toISOString();
      }
      const response = await api.executeHomeActionCommand(propertyId, action.id, {
        command,
        nextTriggerAt,
        consequenceAcknowledged: ['DEFER', 'DISMISS', 'NOT_RELEVANT', 'NO_MORTGAGE'].includes(command),
      });
      if (!response.success) throw new Error(response.message || 'Unable to update this action.');
      toast({
        title: command === 'COMPLETE'
          ? 'Preparation marked complete'
          : command === 'ACKNOWLEDGE'
            ? 'Acknowledged'
            : 'Weather action updated',
      });
      await onChanged();
    } catch (error) {
      toast({
        title: 'Unable to update weather action',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <article className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/70 p-5 shadow-sm" role="status">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><AlertTriangle className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-amber-600 text-white hover:bg-amber-600">Environment action recommended</Badge>
            <Badge variant="outline" className={priorityTone(action.priority)}>{action.priority}</Badge>
            {windowLabel && <span className="text-xs font-medium text-amber-800">{windowLabel}</span>}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{action.signal}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{action.whyItMatters}</p>
          <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Recommended preparation</p>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-800">{action.recommendedAction}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">Source: {action.evidence[0]?.source}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-full bg-amber-700 hover:bg-amber-800">
              <Link href={action.primaryCta.href} onClick={() => { void api.recordHomeActionOpened(propertyId, action.id); }}>
                {action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            {canComplete && (
              <Button size="sm" variant="outline" className="rounded-full bg-white" disabled={Boolean(pending)} onClick={() => execute('COMPLETE')}>
                <Check className="mr-1 h-3.5 w-3.5" />Mark prepared
              </Button>
            )}
            {canAcknowledge && (
              <Button size="sm" variant="outline" className="rounded-full bg-white" disabled={Boolean(pending)} onClick={() => execute('ACKNOWLEDGE')}>
                <Check className="mr-1 h-3.5 w-3.5" />Acknowledge
              </Button>
            )}
            {canDefer && (
              <Button size="sm" variant="outline" className="rounded-full bg-white" disabled={Boolean(pending)} onClick={() => execute(action.feedbackControls.includes('DEFER') ? 'DEFER' : 'SNOOZE')}>
                <Clock3 className="mr-1 h-3.5 w-3.5" />Remind tomorrow
              </Button>
            )}
            {action.feedbackControls.includes('NOT_RELEVANT') && (
              <Button size="sm" variant="ghost" className="rounded-full text-slate-600" disabled={Boolean(pending)} onClick={() => execute('NOT_RELEVANT')}>
                Not relevant
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function HomeFirstValueInsightCard({ insight }: { insight: HomeFirstValueInsightDTO }) {
  const watch = insight.kind === 'WATCH';
  return (
    <article className={watch
      ? 'rounded-2xl border border-sky-200 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm'
      : 'rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm'}>
      <div className="flex items-start gap-3">
        <div className={watch ? 'rounded-xl bg-sky-100 p-2.5 text-sky-700' : 'rounded-xl bg-emerald-100 p-2.5 text-emerald-700'}>
          <CloudSun className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={watch ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
              {insight.badge}
            </Badge>
            {insight.timeframe && <span className="text-xs text-slate-500">{insight.timeframe}</span>}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{insight.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{insight.summary}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{insight.detail}</p>
          <p className="mt-2 text-xs text-slate-500">Source: {insight.source}</p>
          <Button asChild size="sm" variant="outline" className="mt-4 rounded-full bg-white">
            <Link href={insight.href}>View full home outlook<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function SeasonalChecklistActionCard({
  action,
  propertyId,
  showSupportingDetails = false,
}: {
  action: RankedHomeActionDTO;
  propertyId: string;
  showSupportingDetails?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(showSupportingDetails);
  const presentation = action.presentation;
  return (
    <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={priorityTone(action.priority)}>{priorityLabel(action.priority)}</Badge>
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
          <CalendarDays className="h-4 w-4" />{presentation?.eyebrow ?? 'Seasonal checklist'}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">{presentation?.headline ?? action.signal}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{presentation?.summary ?? action.whyItMatters}</p>
      {presentation && presentation.keyFacts.length > 0 && (
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {presentation.keyFacts.map((fact) => (
            <div key={`${fact.label}:${fact.value}`} className="rounded-xl bg-white/80 px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-emerald-800">{fact.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-800">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(detailsOpen || showSupportingDetails) && (
        <div className="mt-3 border-t border-emerald-100 pt-3">
          <p className="text-sm leading-6 text-slate-600">{action.whyItMatters}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-800">Remaining tasks</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {action.evidence.map((evidence) => (
              <li key={evidence.id} className="rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-700">{evidence.label}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full">
          <Link href={action.primaryCta.href} onClick={() => { void api.recordHomeActionOpened(propertyId, action.id); }}>
            {action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        {presentation && !showSupportingDetails && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-slate-500"
            aria-expanded={detailsOpen}
            onClick={() => {
              const nextOpen = !detailsOpen;
              setDetailsOpen(nextOpen);
              if (nextOpen) {
                track('home_card_detail_opened', {
                  propertyId,
                  actionId: action.id,
                  priority: action.priority,
                  sourceKind: action.source.kind,
                });
              }
            }}
          >
            {presentation.detailLabel}
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>
    </article>
  );
}

export function CoverageCorrectionGroupCard({
  actions,
  subjects,
  propertyId,
  showSupportingDetails = false,
  onChanged,
}: {
  actions: RankedHomeActionDTO[];
  subjects: string[];
  propertyId: string;
  showSupportingDetails?: boolean;
  onChanged?: () => Promise<unknown>;
}) {
  const first = actions[0];
  const href = `/dashboard/properties/${propertyId}/inventory?tab=coverage&focus=incomplete`;
  const [manageWorkItemId, setManageWorkItemId] = React.useState<string | null>(null);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={priorityTone(first.priority)}>{first.priority}</Badge>
        <span className="text-xs text-slate-500">{actions.length} related items</span>
        <span className="text-xs text-slate-500">{first.confidence.label.toLowerCase()} confidence</span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-950">
        Review coverage information for {actions.length} home items
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Coverage information is incomplete for these items. Confirm what you know, update anything uncertain, or choose to be reminded later.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {subjects.map((subject) => <Badge key={subject} variant="secondary" className="rounded-full">{subject}</Badge>)}
      </div>
      {showSupportingDetails && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {actions.map((action) => (
            <div key={action.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{coverageCorrectionSubject(action) ?? action.recommendedAction}</p>
                <p className="mt-1 text-xs text-slate-500">Priority #{action.ranking.rank} · {action.confidence.label.toLowerCase()} confidence</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link href={action.primaryCta.href}>Review item</Link>
                </Button>
                {action.workItem && (
                  <Button size="sm" variant="ghost" className="rounded-full text-slate-500" onClick={() => setManageWorkItemId(action.workItem!.id)}>
                    <Settings2 className="mr-1 h-3.5 w-3.5" />Manage
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Button asChild size="sm" className="rounded-full">
          <Link href={href}>Review coverage information<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </div>
      {manageWorkItemId && (
        <WorkItemManageDrawer
          propertyId={propertyId}
          workItemId={manageWorkItemId}
          open={Boolean(manageWorkItemId)}
          onOpenChange={(open) => { if (!open) setManageWorkItemId(null); }}
          onChanged={onChanged ?? (async () => {})}
        />
      )}
    </article>
  );
}

export function ActionCard({
  action,
  propertyId,
  onChanged,
  showSupportingDetails = false,
}: {
  action: RankedHomeActionDTO;
  propertyId: string;
  onChanged: () => Promise<unknown>;
  showSupportingDetails?: boolean;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<HomeActionCommand | null>(null);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(showSupportingDetails);

  const execute = async (command: HomeActionCommand) => {
    setPending(command);
    try {
      const nextTriggerAt = ['DEFER', 'SNOOZE'].includes(command)
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const response = await api.executeHomeActionCommand(propertyId, action.id, {
        command,
        nextTriggerAt,
        consequenceAcknowledged: ['DEFER', 'DISMISS', 'NOT_RELEVANT', 'NO_MORTGAGE'].includes(command),
      });
      if (!response.success) throw new Error(response.message || 'Unable to update this action.');
      toast({
        title: command === 'COMPLETE'
          ? 'Action completed'
          : command === 'ACKNOWLEDGE'
            ? 'Acknowledged'
            : 'Action updated',
      });
      await onChanged();
    } catch (error) {
      toast({
        title: 'Unable to update action',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPending(null);
    }
  };

  const correctionCta = action.secondaryCtas.find((cta) =>
    cta.kind === 'CORRECT_FACT' || /correct|context|update.*detail/i.test(cta.label));
  const primaryHref = resolveHomeActionPrimaryHref(action, propertyId);
  const canDefer = action.governance.safetyTier !== 'SAFETY_EMERGENCY' &&
    (action.feedbackControls.includes('DEFER') || action.feedbackControls.includes('SNOOZE'));
  const presentation = action.presentation;
  const headline = presentation?.headline ?? action.recommendedAction;
  const summary = presentation?.summary ?? action.expectedOutcome;

  const toggleDetails = () => {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
    if (nextOpen) {
      track('home_card_detail_opened', {
        propertyId,
        actionId: action.id,
        priority: action.priority,
        sourceKind: action.source.kind,
      });
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={priorityTone(action.priority)}>{priorityLabel(action.priority)}</Badge>
            {presentation?.eyebrow && <span className="text-xs font-medium text-slate-500">{presentation.eyebrow}</span>}
            {action.workItem?.acceptanceState === 'ACCEPTED' && (
              <Badge variant="outline" className="rounded-full border-teal-200 bg-teal-50 text-teal-700">In your plan</Badge>
            )}
          </div>
          <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">{headline}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{summary}</p>
          {presentation && presentation.keyFacts.length > 0 && (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {presentation.keyFacts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{fact.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-800">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {(detailsOpen || showSupportingDetails) && (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why you&apos;re seeing this</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{action.whyItMatters}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected outcome</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{action.expectedOutcome}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timing</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{action.timing.rationale}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting evidence</p>
            <ul className="mt-2 space-y-2">
              {action.evidence.map((evidence) => (
                <li key={evidence.id} className="text-sm text-slate-700">
                  <span className="font-medium">{evidence.label}</span>
                  <span className="text-slate-500"> · {evidence.source} · {evidence.freshness.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
          {action.confidence.missing.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Missing information</p>
              <p className="mt-1 text-sm text-amber-800">{action.confidence.missing.join(' · ')}</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full">
          <Link href={primaryHref} onClick={() => { void api.recordHomeActionOpened(propertyId, action.id); }}>{action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
        {action.feedbackControls.includes('COMPLETE') && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute('COMPLETE')}>
            <Check className="mr-1 h-3.5 w-3.5" />Mark done
          </Button>
        )}
        {!action.feedbackControls.includes('COMPLETE') && action.feedbackControls.includes('ACKNOWLEDGE') && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute('ACKNOWLEDGE')}>
            <Check className="mr-1 h-3.5 w-3.5" />Acknowledge
          </Button>
        )}
        {canDefer && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute(action.feedbackControls.includes('DEFER') ? 'DEFER' : 'SNOOZE')}>
            <Clock3 className="mr-1 h-3.5 w-3.5" />{action.priority === 'PLAN' ? 'Remind me later' : 'Remind in 7 days'}
          </Button>
        )}
        {action.feedbackControls.includes('NOT_RELEVANT') && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" disabled={Boolean(pending)} onClick={() => execute('NOT_RELEVANT')}>
            This doesn&apos;t apply
          </Button>
        )}
        {action.feedbackControls.includes('NO_MORTGAGE') && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" disabled={Boolean(pending)} onClick={() => execute('NO_MORTGAGE')}>
            I don&apos;t have a mortgage
          </Button>
        )}
        {correctionCta && (
          <Button asChild size="sm" variant="ghost" className="rounded-full text-slate-500">
            <Link
              href={correctionCta.href}
              onClick={() => track('home_card_correction_clicked', {
                propertyId,
                actionId: action.id,
                sourceKind: action.source.kind,
              })}
            >
              <PencilLine className="mr-1 h-3.5 w-3.5" />{correctionCta.label}
            </Link>
          </Button>
        )}
        {!showSupportingDetails && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-slate-500"
            aria-expanded={detailsOpen}
            onClick={toggleDetails}
          >
            {presentation?.detailLabel ?? 'Why this?'}
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </Button>
        )}
        {action.workItem && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" onClick={() => setManageOpen(true)}>
            <Settings2 className="mr-1 h-3.5 w-3.5" />Manage
          </Button>
        )}
      </div>
      {action.workItem && (
        <WorkItemManageDrawer
          propertyId={propertyId}
          workItemId={action.workItem.id}
          open={manageOpen}
          onOpenChange={setManageOpen}
          onChanged={onChanged}
        />
      )}
    </article>
  );
}

function attentionEntryPriority(entry: AttentionEntry): RankedHomeActionDTO['priority'] {
  return entry.kind === 'COVERAGE_CORRECTION_GROUP'
    ? entry.actions[0].priority
    : entry.action.priority;
}

export function splitHomeAttentionEntries(entries: AttentionEntry[], limit = 3) {
  return {
    urgent: entries
      .filter((entry) => ['NOW', 'SOON'].includes(attentionEntryPriority(entry)))
      .slice(0, limit),
    planning: entries
      .filter((entry) => ['PLAN', 'CONSIDER'].includes(attentionEntryPriority(entry)))
      .slice(0, limit),
  };
}

function AttentionEntryCard({
  entry,
  propertyId,
  onChanged,
}: {
  entry: AttentionEntry;
  propertyId: string;
  onChanged: () => Promise<unknown>;
}) {
  if (entry.kind === 'ACTION') {
    return <ActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'CRITICAL_WEATHER') {
    return <CriticalWeatherActionCard action={entry.action} propertyId={propertyId} />;
  }
  if (entry.kind === 'ENVIRONMENT') {
    return <EnvironmentActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'SEASONAL_CHECKLIST') {
    return <SeasonalChecklistActionCard action={entry.action} propertyId={propertyId} />;
  }
  return (
    <CoverageCorrectionGroupCard
      actions={entry.actions}
      subjects={entry.subjects}
      propertyId={propertyId}
      onChanged={onChanged}
    />
  );
}

export function UnifiedHomeSurface({
  propertyId,
  properties = [],
}: {
  propertyId: string;
  properties?: Array<{ id: string; address: string }>;
}) {
  const { markReady: markPostLoginReady } = usePostLoginTransitionReadiness();
  const query = useQuery({
    queryKey: ['unified-home', propertyId],
    queryFn: () => api.getUnifiedHome(propertyId),
    staleTime: 2 * 60 * 1000,
  });

  React.useEffect(() => {
    if (!query.isLoading) {
      markPostLoginReady();
    }
  }, [markPostLoginReady, query.isLoading]);

  React.useEffect(() => {
    const actions = query.data?.attention.actions;
    if (!actions) return;
    track('home_cards_viewed', {
      propertyId,
      actionIds: actions.slice(0, 6).map((action) => action.id),
      urgentCount: actions.filter((action) => action.priority === 'NOW' || action.priority === 'SOON').length,
      planCount: actions.filter((action) => action.priority === 'PLAN' || action.priority === 'CONSIDER').length,
    });
  }, [propertyId, query.dataUpdatedAt, query.data?.attention.actions]);

  if (query.isLoading) {
    return <div className="py-16 text-center text-sm text-slate-500">Preparing your Home…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-800">Home is temporarily unavailable.</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const home = query.data;
  const attentionEntries = groupAttentionActions(home.attention.actions);
  const { urgent: visibleAttentionEntries, planning: visiblePlanEntries } = splitHomeAttentionEntries(attentionEntries);
  const attentionState = resolveHomeAttentionState(
    home.attention.actions.length,
    home.propertyContext,
    Boolean(home.attention.firstValueInsight),
    home.attention.actions.filter(action => action.priority === 'NOW' || action.priority === 'SOON').length,
  );
  const setupMessage = home.propertyContext.conflictedFactCount > 0
    ? 'Review conflicting home details so recommendations use the right information.'
    : home.propertyContext.staleFactCount > 0
      ? 'Refresh outdated home details so maintenance and seasonal guidance stays accurate.'
      : 'Add a few missing home details to unlock applicable seasonal and maintenance guidance.';
  const setupCtaLabel = home.propertyContext.conflictedFactCount > 0
    ? 'Review conflicting details'
    : home.propertyContext.staleFactCount > 0
      ? 'Refresh home details'
      : 'Continue home setup';
  const openAsk = () => {
    window.dispatchEvent(new CustomEvent('cozy-chat-open'));
  };

  const glanceItems = [
    {
      label: 'Record complete',
      value: `${home.glance.recordCompleteness}%`,
      detail: home.propertyContext.conflictedFactCount > 0
        ? `Review ${home.propertyContext.conflictedFactCount} conflicting home fact${home.propertyContext.conflictedFactCount === 1 ? '' : 's'}`
        : home.propertyContext.staleFactCount > 0
          ? `Refresh ${home.propertyContext.staleFactCount} stale home fact${home.propertyContext.staleFactCount === 1 ? '' : 's'}`
          : home.propertyContext.missingFactCount > 0
            ? `Add ${home.propertyContext.missingFactCount} missing home fact${home.propertyContext.missingFactCount === 1 ? '' : 's'}`
            : 'Review your verified Home Record',
      href: home.glance.recordHref,
    },
    {
      label: 'Systems tracked',
      value: home.glance.trackedSystems,
      detail: 'Open systems and inventory',
      href: home.glance.systemsHref,
    },
    {
      label: 'Coverage gaps',
      value: home.glance.coverageGapCount,
      detail: home.glance.coverageGapCount > 0 ? 'Review uncovered items' : 'Review coverage records',
      href: home.glance.coverageHref,
    },
    {
      label: 'Prioritized actions',
      value: home.glance.openWorkCount,
      detail: 'Review your ranked action plan',
      href: home.glance.workHref,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700"><Home className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Home</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{home.property.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{home.property.address}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
          <Badge variant="outline" className="rounded-full bg-white">{home.attention.totalCount} open actions</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{home.glance.recordCompleteness}% record complete</Badge>
        </div>
      </header>

      <section aria-labelledby="attention-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="attention-heading" className="text-xl font-semibold text-slate-950">
              {attentionState === 'OUTLOOK' ? 'Your first home outlook' : 'What needs attention'}
            </h2>
            <p className="text-sm text-slate-500">
              {attentionState === 'OUTLOOK'
                ? 'A location-specific result based on current and recent area conditions.'
                : 'A limited, ranked list with the reason and next move.'}
            </p>
          </div>
          {home.attention.totalCount > 0 && (
            <Button asChild variant="ghost" size="sm" className="rounded-full text-teal-700 hover:text-teal-800">
              <Link href={home.attention.planHref}>View full action plan</Link>
            </Button>
          )}
        </div>
        {attentionState === 'OUTLOOK' && home.attention.firstValueInsight ? (
          <>
            <HomeFirstValueInsightCard insight={home.attention.firstValueInsight} />
            {(home.propertyContext.missingFactCount > 0 || home.propertyContext.conflictedFactCount > 0 || home.propertyContext.staleFactCount > 0) && (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">Make future guidance more specific to this home</p>
                  <p className="mt-0.5 text-slate-600">{setupMessage}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
                  <Link href={home.glance.recordHref}>{setupCtaLabel}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            )}
          </>
        ) : attentionState === 'SETUP' ? (
          <div className="rounded-[24px] border border-sky-200 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-sky-100 p-2.5 text-sky-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">Personalize your home guidance</p>
                    <Badge variant="outline" className="rounded-full bg-white text-slate-600">
                      {home.propertyContext.completenessPercent}% complete
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{setupMessage}</p>
                </div>
              </div>
              <Button asChild className="shrink-0 rounded-full bg-teal-700 hover:bg-teal-800">
                <Link href={home.glance.recordHref}>
                  {setupCtaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : attentionState === 'ALL_CLEAR' ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            No action currently needs your attention.
          </div>
        ) : visibleAttentionEntries.length > 0 ? visibleAttentionEntries.map((entry) => (
          <AttentionEntryCard
            key={entry.kind === 'COVERAGE_CORRECTION_GROUP'
              ? `coverage-group:${entry.actions.map((action) => action.id).join(':')}`
              : entry.action.id}
            entry={entry}
            propertyId={propertyId}
            onChanged={() => query.refetch()}
          />
        )) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            Nothing urgent needs your attention right now.
          </div>
        )}
      </section>

      {visiblePlanEntries.length > 0 && (
        <section aria-labelledby="plan-ahead-heading" className="space-y-3">
          <div>
            <h2 id="plan-ahead-heading" className="text-xl font-semibold text-slate-950">Plan ahead</h2>
            <p className="text-sm text-slate-500">Useful preparation for upcoming costs and decisions—nothing here is urgent.</p>
          </div>
          {visiblePlanEntries.map((entry) => (
            <AttentionEntryCard
              key={entry.kind === 'COVERAGE_CORRECTION_GROUP'
                ? `plan-coverage-group:${entry.actions.map((action) => action.id).join(':')}`
                : `plan:${entry.action.id}`}
              entry={entry}
              propertyId={propertyId}
              onChanged={() => query.refetch()}
            />
          ))}
        </section>
      )}

      <HomeEventRadarTopMatchCard propertyId={propertyId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[24px] border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-teal-600" />Decisions to make</CardTitle><CardDescription>Material choices that need a deliberate answer.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {home.decisions.length === 0 ? <p className="text-sm text-slate-500">No material decision is waiting right now.</p> : home.decisions.map((decision) => (
              <Link key={decision.id} href={decision.primaryCta.href} className="block rounded-xl border border-slate-200 p-3 transition hover:border-teal-300 hover:bg-teal-50/40">
                <p className="font-semibold text-slate-900">{decision.recommendedAction}</p><p className="mt-1 text-xs text-slate-500">{decision.expectedOutcome}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Milestone className="h-5 w-5 text-indigo-600" />Active major moment</CardTitle><CardDescription>Current stage, blocker, and next milestone.</CardDescription></CardHeader>
          <CardContent>
            {home.activeMajorMoment ? (
              <div className="space-y-3"><Badge variant="outline">{home.activeMajorMoment.stage.replace(/_/g, ' ')}</Badge><h3 className="font-semibold text-slate-950">{home.activeMajorMoment.title}</h3>{home.activeMajorMoment.context && <p className="text-sm text-slate-600">{home.activeMajorMoment.context}</p>}{home.activeMajorMoment.blocker && <p className="flex gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{home.activeMajorMoment.blocker}</p>}<p className="text-sm text-slate-600">Next: {home.activeMajorMoment.nextMilestone}</p><Button asChild size="sm" variant="outline" className="rounded-full"><Link href={home.activeMajorMoment.href}>Continue moment</Link></Button></div>
            ) : <p className="text-sm text-slate-500">No major project or guided journey is active.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[24px] border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-sky-600" />Home at a glance</CardTitle><CardDescription>Systems, coverage, work, and recent changes supporting your next action.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {glanceItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-label={`${item.label}: ${item.value}. ${item.detail}`}
                className="group rounded-xl border border-transparent bg-slate-50 p-3 transition hover:border-teal-200 hover:bg-teal-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{item.value}</p>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-teal-700">
                  {item.detail}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </p>
              </Link>
            ))}
          </div>
          {home.glance.recentChanges.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent changes</p>{home.glance.recentChanges.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2 text-sm"><span className="text-slate-700">{event.title}</span><span className="shrink-0 text-xs text-slate-400">{new Date(event.occurredAt).toLocaleDateString()}</span></div>)}</div>}
        </CardContent>
      </Card>

      <UnifiedHomeToolsSection
        home={home}
        propertyId={propertyId}
      />

      <Card className="rounded-[24px] border-teal-200 bg-teal-50/50 shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-teal-700" />Ask ContractToCozy</CardTitle>
            <CardDescription className="mt-1">For open-ended questions that require explanation across this home’s records and actions.</CardDescription>
          </div>
          <Button className="shrink-0 rounded-full" onClick={openAsk}><MessageCircle className="mr-2 h-4 w-4" />Ask about this home</Button>
        </div>
      </Card>
    </div>
  );
}
