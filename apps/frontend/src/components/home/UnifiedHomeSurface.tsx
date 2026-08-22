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
  Megaphone,
  MessageCircle,
  Milestone,
  PencilLine,
  Radar,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { LocalUpdatesCarousel } from '@/components/localUpdates/LocalUpdatesCarousel';
import { PersonalizedReadOnlySuggestions } from '@/components/personalization/PersonalizedReadOnlySuggestions';
import type {
  HomeActionCommand,
  HomeFirstValueInsightDTO,
  RankedHomeActionDTO,
  BuyerRecentOwnerTransition,
  UnifiedHomeDTO,
} from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { UnifiedHomeToolsSection } from '@/components/home/UnifiedHomeToolsSection';
import { resolveHomeActionPrimaryHref } from '@/lib/navigation/homeActionNavigation';
import { buildHomeEventRadarHref } from '@/features/homeEventRadar/radarDeepLinks';
import { WorkItemManageDrawer } from '@/components/home/WorkItemManageDrawer';
import { track } from '@/lib/analytics/events';
import { RecentOwnerAdvocacyPrompt } from '@/components/home/RecentOwnerAdvocacyPrompt';

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

/**
 * Fully built (backend + component) but never rendered anywhere — a
 * database audit traced LocalUpdateEvent's zero rows back to this: the
 * carousel had no live surface generating impressions to track in the
 * first place. Revived here following the same pattern as
 * HomeEventRadarTopMatchCard above.
 */
function LocalUpdatesSection({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['local-updates', propertyId],
    queryFn: () => api.getLocalUpdates(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
  });
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  const updates = (query.data?.success ? query.data.data.updates : []).filter(
    (update) => !dismissedIds.has(update.id)
  );
  if (updates.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    void api.dismissLocalUpdate(id).catch(() => {
      // Best-effort — worst case the update reappears next session.
    });
  };

  const handleCtaClick = (id: string) => {
    const update = updates.find((u) => u.id === id);
    if (update?.ctaUrl) {
      window.open(update.ctaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card className="rounded-[24px] border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5 text-teal-600" />Local updates
        </CardTitle>
        <CardDescription>Services and alerts relevant to your area.</CardDescription>
      </CardHeader>
      <CardContent>
        <LocalUpdatesCarousel updates={updates} onDismiss={handleDismiss} onCtaClick={handleCtaClick} variant="card" />
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
  if (priority === 'CONSIDER') return 'Worth reviewing';
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function homeownerPropertyName(name: string, address: string): string {
  if (name.trim() && !/^(main|primary|home)$/i.test(name.trim())) return name.trim();
  return address.split(',')[0]?.trim() || 'Your home';
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

export function isAssetLifecycleAction(action: RankedHomeActionDTO): boolean {
  return action.presentation?.variant === 'ASSET_LIFECYCLE' &&
    action.presentation.subject?.kind === 'INVENTORY_ITEM';
}

export function homeActionProvenance(action: RankedHomeActionDTO): {
  source: string;
  observedLabel: string | null;
  freshness: string;
  stale: boolean;
} | null {
  const evidence = action.evidence.find((entry) => entry.freshness === 'STALE') ?? action.evidence[0];
  if (!evidence) return null;
  const observed = evidence.observedAt ? new Date(evidence.observedAt) : null;
  const observedLabel = observed && !Number.isNaN(observed.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(observed)
    : null;
  const stale = evidence.freshness === 'STALE';
  const source = /^(?:system[ _-]?derived|system derivation|default|inferred)$/i.test(evidence.source.trim())
    ? 'Home Record estimate'
    : evidence.source;
  return {
    source,
    observedLabel,
    freshness: stale ? 'May be outdated' : evidence.freshness === 'CURRENT' ? 'Current evidence' : 'Freshness unknown',
    stale,
  };
}

function recordHomeActionPrimaryClick(action: RankedHomeActionDTO, propertyId: string): void {
  let continuityComplete = false;
  if (action.primaryCta.href.startsWith('/')) {
    const destination = new URL(action.primaryCta.href, 'https://contracttocozy.local');
    continuityComplete = [
      'launchSurface',
      'propertyId',
      'sourceActionId',
      'sourceEntityType',
      'sourceEntityId',
      'recommendationReason',
      'recommendationVersion',
      'contextVersion',
      'returnTo',
    ].every((key) => Boolean(destination.searchParams.get(key)));
  }
  track('home_action_primary_clicked', {
    propertyId,
    actionId: action.id,
    sourceKind: action.source.kind,
    presentationVariant: action.presentation?.variant ?? null,
    continuityComplete,
  });
  if (action.primaryCta.kind === 'CORRECT_FACT') {
    track('home_card_correction_clicked', {
      propertyId,
      actionId: action.id,
      sourceKind: action.source.kind,
    });
  }
  void api.recordHomeActionOpened(propertyId, action.id);
}

function recordHomeActionFeedback(
  action: RankedHomeActionDTO,
  propertyId: string,
  command: HomeActionCommand,
): void {
  track('home_action_feedback_submitted', {
    propertyId,
    actionId: action.id,
    command,
    sourceKind: action.source.kind,
    presentationVariant: action.presentation?.variant ?? null,
  });
}

export type AttentionEntry =
  | { kind: 'ACTION'; action: RankedHomeActionDTO }
  | { kind: 'ASSET_LIFECYCLE'; action: RankedHomeActionDTO }
  | { kind: 'SEASONAL_CHECKLIST'; action: RankedHomeActionDTO }
  | { kind: 'CRITICAL_WEATHER'; action: RankedHomeActionDTO }
  | { kind: 'ENVIRONMENT'; action: RankedHomeActionDTO }
  | { kind: 'COVERAGE_CORRECTION_GROUP'; actions: RankedHomeActionDTO[]; subjects: string[] };

function entryForAction(action: RankedHomeActionDTO): AttentionEntry {
  if (isCriticalWeatherAction(action)) return { kind: 'CRITICAL_WEATHER', action };
  if (isEnvironmentAction(action)) return { kind: 'ENVIRONMENT', action };
  if (isSeasonalChecklistAction(action)) return { kind: 'SEASONAL_CHECKLIST', action };
  if (isAssetLifecycleAction(action)) return { kind: 'ASSET_LIFECYCLE', action };
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
  const [detailsOpen, setDetailsOpen] = React.useState(showSupportingDetails);
  const expiry = formattedAlertExpiry(action.timing.windowEnd ?? action.timing.dueAt);
  const correctionCta = action.secondaryCtas.find((cta) => cta.kind === 'CORRECT_FACT');
  const acknowledge = async () => {
    setPending('ACKNOWLEDGE');
    try {
      const response = await api.executeHomeActionCommand(propertyId, action.id, {
        command: 'ACKNOWLEDGE', nextTriggerAt: null, consequenceAcknowledged: false,
      });
      if (!response.success) throw new Error(response.message || 'Unable to acknowledge this alert.');
      recordHomeActionFeedback(action, propertyId, 'ACKNOWLEDGE');
      toast({ title: 'Weather alert acknowledged' });
      await onChanged();
    } catch (error) {
      toast({ title: 'Unable to update weather alert', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setPending(null);
    }
  };
  const toggleDetails = () => {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
    if (nextOpen) track('home_card_detail_opened', { propertyId, actionId: action.id, priority: action.priority, sourceKind: action.source.kind });
  };
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
          {(detailsOpen || showSupportingDetails) && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Official guidance</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{action.expectedOutcome}</p>
              <p className="mt-2 text-xs text-slate-500">Source: {action.evidence[0]?.source ?? 'Official weather alert'}</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-full bg-rose-700 hover:bg-rose-800">
              <Link href={action.primaryCta.href} onClick={() => recordHomeActionPrimaryClick(action, propertyId)}>
                Review weather alert<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            {action.feedbackControls.includes('ACKNOWLEDGE') && (
              <Button size="sm" variant="outline" className="rounded-full bg-white" disabled={Boolean(pending)} onClick={acknowledge}>
                <Check className="mr-1 h-3.5 w-3.5" />Acknowledge
              </Button>
            )}
            {correctionCta && (
              <Button asChild size="sm" variant="ghost" className="rounded-full text-rose-700">
                <Link href={correctionCta.href} onClick={() => track('home_card_correction_clicked', { propertyId, actionId: action.id, sourceKind: action.source.kind })}>
                  <PencilLine className="mr-1 h-3.5 w-3.5" />{correctionCta.label}
                </Link>
              </Button>
            )}
            {!showSupportingDetails && (
              <Button size="sm" variant="ghost" className="rounded-full text-rose-700" aria-expanded={detailsOpen} onClick={toggleDetails}>
                {action.presentation?.detailLabel ?? 'Official guidance'}
                <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </Button>
            )}
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
  const [detailsOpen, setDetailsOpen] = React.useState(false);
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
      recordHomeActionFeedback(action, propertyId, command);
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
          {detailsOpen && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3 text-sm text-slate-700">
              <p>{action.expectedOutcome}</p>
              <p className="mt-2 text-xs text-slate-500">{action.timing.rationale}</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-full bg-amber-700 hover:bg-amber-800">
              <Link href={action.primaryCta.href} onClick={() => recordHomeActionPrimaryClick(action, propertyId)}>
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
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-amber-800"
              aria-expanded={detailsOpen}
              onClick={() => {
                const nextOpen = !detailsOpen;
                setDetailsOpen(nextOpen);
                if (nextOpen) track('home_card_detail_opened', { propertyId, actionId: action.id, priority: action.priority, sourceKind: action.source.kind });
              }}
            >
              {action.presentation?.detailLabel ?? 'Why this?'}
              <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            </Button>
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
            <Link href={insight.href}>{watch ? 'Review outlook details' : 'View full home outlook'}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function SeasonalChecklistActionCard({
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
  const [detailsOpen, setDetailsOpen] = React.useState(showSupportingDetails);
  const [pending, setPending] = React.useState<HomeActionCommand | null>(null);
  const { toast } = useToast();
  const presentation = action.presentation;
  const execute = async (command: 'SNOOZE' | 'NOT_RELEVANT') => {
    setPending(command);
    try {
      const response = await api.executeHomeActionCommand(propertyId, action.id, {
        command,
        nextTriggerAt: command === 'SNOOZE' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
        consequenceAcknowledged: command === 'NOT_RELEVANT',
      });
      if (!response.success) throw new Error(response.message || 'Unable to update this checklist.');
      recordHomeActionFeedback(action, propertyId, command);
      toast({ title: command === 'SNOOZE' ? 'Reminder scheduled' : 'Checklist removed from Home' });
      await onChanged();
    } catch (error) {
      toast({ title: 'Unable to update checklist', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setPending(null);
    }
  };
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
          <Link href={action.primaryCta.href} onClick={() => recordHomeActionPrimaryClick(action, propertyId)}>
            {action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        {action.feedbackControls.includes('SNOOZE') && (
          <Button size="sm" variant="outline" className="rounded-full bg-white" disabled={Boolean(pending)} onClick={() => execute('SNOOZE')}>
            <Clock3 className="mr-1 h-3.5 w-3.5" />Remind in 7 days
          </Button>
        )}
        {action.feedbackControls.includes('NOT_RELEVANT') && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" disabled={Boolean(pending)} onClick={() => execute('NOT_RELEVANT')}>
            This doesn&apos;t apply
          </Button>
        )}
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
  const destination = new URL(
    `/dashboard/properties/${propertyId}/inventory?tab=coverage&focus=incomplete`,
    'https://contracttocozy.local',
  );
  const sourceDestination = new URL(first.primaryCta.href, 'https://contracttocozy.local');
  [
    'launchSurface', 'propertyId', 'sourceActionId', 'sourceEntityType', 'sourceEntityId',
    'recommendationReason', 'recommendationVersion', 'contextVersion', 'journeyId', 'itemId', 'returnTo',
  ].forEach((key) => {
    const value = sourceDestination.searchParams.get(key);
    if (value) destination.searchParams.set(key, value);
  });
  destination.searchParams.set('groupActionIds', actions.map((action) => action.id).join(','));
  const href = `${destination.pathname}${destination.search}`;
  const [manageWorkItemId, setManageWorkItemId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(showSupportingDetails);
  const [pending, setPending] = React.useState<'SNOOZE' | 'NOT_RELEVANT' | null>(null);
  const { toast } = useToast();
  const executeGroup = async (command: 'SNOOZE' | 'NOT_RELEVANT') => {
    const targets = actions.filter((action) => action.feedbackControls.includes(command));
    if (targets.length === 0) return;
    setPending(command);
    try {
      const results = await Promise.all(targets.map(async (action) => ({
        action,
        response: await api.executeHomeActionCommand(propertyId, action.id, {
          command,
          nextTriggerAt: command === 'SNOOZE' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
          consequenceAcknowledged: command === 'NOT_RELEVANT',
        }),
      })));
      const successful = results.filter(({ response }) => response.success);
      successful.forEach(({ action }) => recordHomeActionFeedback(action, propertyId, command));
      if (successful.length === 0) throw new Error(results[0]?.response.message || 'Unable to update these actions.');
      toast({
        title: command === 'SNOOZE' ? 'Coverage reminder scheduled' : 'Coverage actions removed from Home',
        description: successful.length < targets.length ? `${successful.length} of ${targets.length} items were updated.` : undefined,
      });
      await onChanged?.();
    } catch (error) {
      toast({ title: 'Unable to update coverage actions', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setPending(null);
    }
  };
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
      {(detailsOpen || showSupportingDetails) && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {actions.map((action) => (
            <div key={action.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{coverageCorrectionSubject(action) ?? action.recommendedAction}</p>
                <p className="mt-1 text-xs text-slate-500">Priority #{action.ranking.rank} · {action.confidence.label.toLowerCase()} confidence</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link href={action.primaryCta.href} onClick={() => recordHomeActionPrimaryClick(action, propertyId)}>Review item</Link>
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
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-full">
          <Link
            href={href}
            onClick={() => {
              recordHomeActionPrimaryClick(first, propertyId);
              if (first.primaryCta.kind !== 'CORRECT_FACT') {
                track('home_card_correction_clicked', { propertyId, actionId: first.id, sourceKind: first.source.kind });
              }
            }}
          >
            Review coverage information<ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
        {actions.some((action) => action.feedbackControls.includes('SNOOZE')) && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => executeGroup('SNOOZE')}>
            <Clock3 className="mr-1 h-3.5 w-3.5" />Remind in 7 days
          </Button>
        )}
        {actions.some((action) => action.feedbackControls.includes('NOT_RELEVANT')) && (
          <Button size="sm" variant="ghost" className="rounded-full text-slate-500" disabled={Boolean(pending)} onClick={() => executeGroup('NOT_RELEVANT')}>
            This doesn&apos;t apply
          </Button>
        )}
        {!showSupportingDetails && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-slate-500"
            aria-expanded={detailsOpen}
            onClick={() => {
              const nextOpen = !detailsOpen;
              setDetailsOpen(nextOpen);
              if (nextOpen) track('home_card_detail_opened', { propertyId, actionId: first.id, priority: first.priority, sourceKind: first.source.kind });
            }}
          >
            Review included items
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </Button>
        )}
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

function AssetLifecycleFacts({ action }: { action: RankedHomeActionDTO }) {
  const groups = action.presentation?.factGroups ?? [];
  if (groups.length === 0) return null;

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      {groups.map((group) => (
        <section key={group.label} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{group.label}</h4>
          <dl className="mt-2 divide-y divide-slate-200/70">
            {group.facts.map((fact) => (
              <div key={fact.key} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0" title={`Source: ${fact.source}`}>
                <dt className="text-xs leading-5 text-slate-500">{fact.label}</dt>
                <dd className={`max-w-[65%] text-right text-xs font-medium leading-5 ${fact.kind === 'MISSING' ? 'text-amber-700' : 'text-slate-800'}`}>
                  {fact.value}
                  {fact.kind === 'BENCHMARK' && <span className="ml-1 font-normal text-slate-400">typical</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
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
      recordHomeActionFeedback(action, propertyId, command);
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
  const assetLifecycle = isAssetLifecycleAction(action);
  const provenance = homeActionProvenance(action);
  const headline = presentation?.headline ?? action.recommendedAction;
  const summary = assetLifecycle
    ? presentation?.whyNow ?? presentation?.summary ?? action.expectedOutcome
    : presentation?.summary ?? action.expectedOutcome;
  const hasOverflowActions = action.feedbackControls.includes('ACKNOWLEDGE')
    || action.feedbackControls.includes('NOT_RELEVANT')
    || action.feedbackControls.includes('NO_MORTGAGE')
    || Boolean(correctionCta)
    || Boolean(action.workItem);
  const visibleKeyFacts = presentation?.keyFacts.slice(0, detailsOpen || showSupportingDetails ? undefined : 4) ?? [];

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
          {provenance && (
            <p className={`mt-2 text-xs ${provenance.stale ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
              Based on {provenance.source}
              {provenance.observedLabel ? ` · Observed ${provenance.observedLabel}` : ''}
              {` · ${provenance.freshness}`}
            </p>
          )}
          {visibleKeyFacts.length > 0 && (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleKeyFacts.map((fact) => (
                <div key={`${fact.label}:${fact.value}`} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{fact.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-800">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {assetLifecycle && <AssetLifecycleFacts action={action} />}
          {assetLifecycle && presentation?.summary && (
            <p className="mt-3 text-xs leading-5 text-slate-500">{presentation.summary}</p>
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
                  <span className="text-slate-500">
                    {' · '}{evidence.source}
                    {evidence.observedAt && !Number.isNaN(new Date(evidence.observedAt).getTime())
                      ? ` · observed ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(evidence.observedAt))}`
                      : ''}
                    {` · ${evidence.freshness.toLowerCase()}`}
                  </span>
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
          <Link href={primaryHref} onClick={() => recordHomeActionPrimaryClick(action, propertyId)}>{action.primaryCta.label}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
        {action.feedbackControls.includes('COMPLETE') && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute('COMPLETE')}>
            <Check className="mr-1 h-3.5 w-3.5" />Mark done
          </Button>
        )}
        {canDefer && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={Boolean(pending)} onClick={() => execute(action.feedbackControls.includes('DEFER') ? 'DEFER' : 'SNOOZE')}>
            <Clock3 className="mr-1 h-3.5 w-3.5" />{action.priority === 'PLAN' ? 'Remind me later' : 'Remind in 7 days'}
          </Button>
        )}
        {!showSupportingDetails && (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-slate-600 hover:text-slate-900"
            aria-expanded={detailsOpen}
            onClick={toggleDetails}
          >
            {detailsOpen ? 'Hide supporting details' : presentation?.detailLabel ?? 'Why this?'}
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </Button>
        )}
        {hasOverflowActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full bg-white text-slate-600" aria-label="More action options">
                More<ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {action.feedbackControls.includes('ACKNOWLEDGE') && (
                <DropdownMenuItem disabled={Boolean(pending)} onSelect={() => void execute('ACKNOWLEDGE')}>
                  <Check />Acknowledge
                </DropdownMenuItem>
              )}
              {correctionCta && (
                <DropdownMenuItem asChild>
                  <Link
                    href={correctionCta.href}
                    onClick={() => track('home_card_correction_clicked', {
                      propertyId,
                      actionId: action.id,
                      sourceKind: action.source.kind,
                    })}
                  >
                    <PencilLine />{correctionCta.label}
                  </Link>
                </DropdownMenuItem>
              )}
              {action.feedbackControls.includes('NOT_RELEVANT') && (
                <DropdownMenuItem disabled={Boolean(pending)} onSelect={() => void execute('NOT_RELEVANT')}>
                  This doesn&apos;t apply
                </DropdownMenuItem>
              )}
              {action.feedbackControls.includes('NO_MORTGAGE') && (
                <DropdownMenuItem disabled={Boolean(pending)} onSelect={() => void execute('NO_MORTGAGE')}>
                  I don&apos;t have a mortgage
                </DropdownMenuItem>
              )}
              {action.workItem && (
                <DropdownMenuItem onSelect={() => setManageOpen(true)}>
                  <Settings2 />Manage action
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
  if (entry.kind === 'ACTION' || entry.kind === 'ASSET_LIFECYCLE') {
    return <ActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'CRITICAL_WEATHER') {
    return <CriticalWeatherActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'ENVIRONMENT') {
    return <EnvironmentActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
  }
  if (entry.kind === 'SEASONAL_CHECKLIST') {
    return <SeasonalChecklistActionCard action={entry.action} propertyId={propertyId} onChanged={onChanged} />;
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
  recentOwnerTransition = null,
}: {
  propertyId: string;
  properties?: Array<{ id: string; address: string }>;
  recentOwnerTransition?: BuyerRecentOwnerTransition | null;
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
  const hasUrgentHomeWork = home.attention.actions.some((action) =>
    action.priority === 'NOW'
    || action.priority === 'SOON'
    || action.governance.safetyTier === 'SAFETY_EMERGENCY',
  ) || Boolean(home.activeMajorMoment?.blocker);
  const setupMessage = home.propertyContext.conflictedFactCount > 0
    ? 'Review conflicting home details so recommendations use the right information.'
    : home.propertyContext.staleFactCount > 0
      ? 'Refresh outdated home details so maintenance and seasonal guidance stays accurate.'
      : 'Add a few missing home details to unlock applicable seasonal and maintenance guidance.';
  const setupCtaLabel = home.propertyContext.conflictedFactCount > 0
    ? 'Review conflicting details'
    : home.propertyContext.staleFactCount > 0
      ? 'Refresh home details'
      : home.propertyContext.missingFactCount > 0
        ? `Add ${home.propertyContext.missingFactCount} missing home fact${home.propertyContext.missingFactCount === 1 ? '' : 's'}`
        : 'Continue home setup';
  const openAsk = () => {
    window.dispatchEvent(new CustomEvent('cozy-chat-open', { detail: { surface: 'UNIFIED_HOME' } }));
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
      href: `${home.glance.recordHref}#record-quality-next`,
    },
    {
      label: 'Systems tracked',
      value: home.glance.trackedSystems,
      detail: 'Open systems and inventory',
      href: home.glance.systemsHref,
    },
    {
      label: home.glance.coverageGapCount === 0 ? 'Known coverage gaps' : 'Coverage gaps',
      value: home.glance.coverageGapCount,
      detail: home.glance.coverageGapCount > 0 ? 'Review uncovered items' : 'Based on current records',
      href: home.glance.coverageHref,
    },
    {
      label: 'Open actions',
      value: home.glance.openWorkCount,
      detail: 'Review your action plan',
      href: home.glance.workHref,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700"><Home className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Home</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{homeownerPropertyName(home.property.name, home.property.address)}</h1>
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
              {attentionState === 'OUTLOOK' ? 'Your home outlook' : 'What needs attention'}
            </h2>
            <p className="text-sm text-slate-500">
              {attentionState === 'OUTLOOK'
                ? 'A location-specific result based on current and recent area conditions.'
                : 'A limited, ranked list with the reason and next move.'}
            </p>
          </div>
          {home.attention.totalCount > 0 && (
            <Button asChild variant="outline" size="sm" className="rounded-full bg-white text-teal-700 hover:text-teal-800">
              <Link href={home.attention.planHref}>Review open actions<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
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

      <LocalUpdatesSection propertyId={propertyId} />

      {/*
        Personalization Engine Phase 2's "Dashboard consumer" was audited
        Complete (docs/personalization/phase2-implementation-audit.md) but
        went dark in the same Slice 9 refactor as LocalUpdatesCarousel above
        — restored here. docs/personalization/07-frontend-experience.md
        warns against "competing ranks" with the existing attention.actions
        feed above; the current catalog (HVAC filter, smoke/CO battery,
        dryer vent, smoke detector, roof age) doesn't overlap with it today,
        but re-check for duplication if attention.actions' sources expand.
      */}
      <PersonalizedReadOnlySuggestions
        propertyId={propertyId}
        module="DASHBOARD"
        title="Suggested for your home"
      />

      {home.decisions.length === 0 && !home.activeMajorMoment ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <ShieldCheck className="h-5 w-5 shrink-0 text-teal-600" />
          <p><span className="font-medium text-slate-900">No decisions need your attention.</span> No major project or guided plan is active.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-[24px] border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-teal-600" />Decisions to make</CardTitle><CardDescription>Choices that need your answer.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {home.decisions.length === 0 ? <p className="text-sm text-slate-500">No decisions need your attention.</p> : home.decisions.map((decision) => (
                <Link key={decision.id} href={decision.primaryCta.href} className="block rounded-xl border border-slate-200 p-3 transition hover:border-teal-300 hover:bg-teal-50/40">
                  <p className="font-semibold text-slate-900">{decision.recommendedAction}</p><p className="mt-1 text-xs text-slate-500">{decision.expectedOutcome}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Milestone className="h-5 w-5 text-indigo-600" />Active major moment</CardTitle><CardDescription>Your current project or guided plan.</CardDescription></CardHeader>
            <CardContent>
              {home.activeMajorMoment ? (
                <div className="space-y-3"><Badge variant="outline">{home.activeMajorMoment.stage.replace(/_/g, ' ')}</Badge><h3 className="font-semibold text-slate-950">{home.activeMajorMoment.title}</h3>{home.activeMajorMoment.context && <p className="text-sm text-slate-600">{home.activeMajorMoment.context}</p>}{home.activeMajorMoment.blocker && <p className="flex gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{home.activeMajorMoment.blocker}</p>}<p className="text-sm text-slate-600">Next: {home.activeMajorMoment.nextMilestone}</p><Button asChild size="sm" variant="outline" className="rounded-full"><Link href={home.activeMajorMoment.href}>Continue</Link></Button></div>
              ) : <p className="text-sm text-slate-500">No major project or guided plan is active.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="rounded-[24px] border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5 text-sky-600" />Home shortcuts</CardTitle><CardDescription>High-level pointers to the records and workspaces behind today&apos;s decisions.</CardDescription></CardHeader>
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
        </CardContent>
      </Card>

      <UnifiedHomeToolsSection
        home={home}
        propertyId={propertyId}
      />

      {recentOwnerTransition && (
        <RecentOwnerAdvocacyPrompt
          transition={recentOwnerTransition}
          suppressedByUrgentWork={hasUrgentHomeWork}
        />
      )}

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
