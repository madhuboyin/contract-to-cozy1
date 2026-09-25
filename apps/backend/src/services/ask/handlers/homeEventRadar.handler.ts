// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { radarQueryService } from '../../../modules/homeEventRadar/services/radarQuery.service';
import { radarInteractionService } from '../../../modules/homeEventRadar/services/radarInteraction.service';
import { RADAR_FEEDBACK_COMMENT_MAX_LENGTH } from '../../../modules/homeEventRadar/domain/radarInteraction';
import { radarTaskIntegrationService } from '../../../modules/homeEventRadar/services/radarTaskIntegration.service';
import { radarNotificationPreferenceService } from '../../../modules/homeEventRadar/services/radarNotificationPreference.service';
import { RADAR_ACTION_CODES, type RadarActionTaskOperation } from '../../../modules/homeEventRadar/domain/radarActionRegistry';
import { deriveRadarTaskDueDate, RadarTaskDueDateError } from '../../../modules/homeEventRadar/domain/radarTaskDueDate';
import type { RadarNotificationPreferenceProjection } from '../../../modules/homeEventRadar/domain/radarNotificationPreferences';
import { updateRadarNotificationPreferencesBodySchema } from '../../../validators/homeEventRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { type CorrectionOption } from '../askCorrectionFields';
import { ensurePropertyAccess, loadRadarMatchForWrite, RadarFeedbackInputSchema, RadarTaskAnswerSchema, RadarTaskInputSchema, RadarTaskTargetSchema } from '../askHandlerSupport';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { getAskPropertyTimezone } from '../askExecutionContext';

const RADAR_SOURCE_FAMILY_LABEL: Record<string, string> = {
  weather: 'Weather', air_quality: 'Air quality', disaster: 'Disaster', utility: 'Utility', tax: 'Tax', insurance: 'Insurance', other: 'Other',
};

const RADAR_FEED_STATE_COPY: Record<string, { title: string; body: string }> = {
  CONFIRMED_CLEAR: { title: 'No active monitored events', body: 'Registered monitoring sources have confirmed no active events for this property right now.' },
  UNCOVERED: { title: 'No monitored events recorded yet', body: 'Home Event Radar has not recorded any monitored events for this property yet -- confirm your property address to enable monitoring.' },
  DEGRADED: { title: 'Monitoring is degraded', body: 'One or more registered monitoring sources are degraded right now, so this may not reflect every current event.' },
  PARTIAL_COVERAGE: { title: 'Monitoring only partially covers this property', body: 'Only some registered monitoring sources cover this property, so this may not reflect every current event.' },
};

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 1 cross-cutting, capability-card audit
// (Appendix D), second reference journey (2026-09-22). Reads
// radarQueryService.listFeed directly -- the SAME canonical read the
// traditional Home Event Radar page itself calls (via /radar/events) --
// deliberately NOT a reuse of INTELLIGENCE_ENVELOPE_QUERY (see
// intelligenceEnvelopeQueryResult above), which the FRD explicitly flags as
// not proof of this specific workflow: wrong item set (cross-domain
// normalized envelope items, not radar matches), wrong filters, wrong
// grouping. FRD v1.40 added filter chips (below) and the per-user writes
// (HOME_EVENT_RADAR_STATE / MARK_DONE / FEEDBACK, declared as item actions);
// FRD v1.41 added task create-or-link (item action) and notification
// settings (feed action).
// Feed filters (FRD v1.40), mirroring the traditional page's own three controls: lifecycle view (now / upcoming /
// recently ended), source family, and show-dismissed. Filter chips re-send a self-contained message that routes back
// here and is re-parsed, so "Show more" paging (which prefixes the prior message) keeps the same filters -- and the
// canonical cursor is itself bound to the filter key, so a mismatch could never page silently.
export type RadarFeedLifecycleFilter = 'now' | 'upcoming' | 'recently_ended';

export type RadarFeedFamilyFilter = 'weather' | 'air_quality' | 'disaster' | 'utility' | 'tax' | 'insurance';

export interface RadarFeedFilterState { lifecycle: RadarFeedLifecycleFilter | null; sourceFamily: RadarFeedFamilyFilter | null; includeDismissed: boolean }

const RADAR_LIFECYCLE_PHRASE: Record<RadarFeedLifecycleFilter, string> = { now: 'happening now', upcoming: 'that are upcoming', recently_ended: 'that recently ended' };

const RADAR_LIFECYCLE_CHIP: Record<RadarFeedLifecycleFilter, string> = { now: 'Happening now', upcoming: 'Upcoming', recently_ended: 'Recently ended' };

const RADAR_FAMILY_PHRASE: Record<RadarFeedFamilyFilter, string> = { weather: 'weather', air_quality: 'air quality', disaster: 'disaster', utility: 'utility', tax: 'tax', insurance: 'insurance' };

export function parseRadarFeedFilters(message: string): RadarFeedFilterState {
  const lifecycle: RadarFeedLifecycleFilter | null = /\bhappening now\b/i.test(message) ? 'now'
    : /\brecently ended\b/i.test(message) ? 'recently_ended'
      : /\bupcoming\b/i.test(message) ? 'upcoming' : null;
  // "<family> events" only, so a routing phrase like "severe weather near my home" does not silently narrow the feed.
  const familyMatch = /\b(weather|air quality|disaster|utility|tax|insurance) events\b/i.exec(message);
  const sourceFamily = familyMatch ? (Object.keys(RADAR_FAMILY_PHRASE) as RadarFeedFamilyFilter[]).find((key) => RADAR_FAMILY_PHRASE[key] === familyMatch[1].toLowerCase()) ?? null : null;
  return { lifecycle, sourceFamily, includeDismissed: /\bincluding dismissed\b/i.test(message) };
}

export function radarFeedFilterMessage(state: RadarFeedFilterState): string {
  return `Show my home event radar feed${state.sourceFamily ? ` for ${RADAR_FAMILY_PHRASE[state.sourceFamily]} events` : ''}${state.lifecycle ? ` ${RADAR_LIFECYCLE_PHRASE[state.lifecycle]}` : ''}${state.includeDismissed ? ', including dismissed' : ''}.`;
}

function radarFeedFilterChips(state: RadarFeedFilterState, presentFamilies: string[]) {
  const chip = (id: string, label: string, next: RadarFeedFilterState, active: boolean) => ({ id, label, message: radarFeedFilterMessage(next), active });
  const families = [...new Set([...presentFamilies, ...(state.sourceFamily ? [state.sourceFamily] : [])])]
    .filter((family): family is RadarFeedFamilyFilter => family in RADAR_FAMILY_PHRASE).sort();
  return [
    chip('radar-lifecycle-all', 'Any time', { ...state, lifecycle: null }, state.lifecycle === null),
    ...(Object.keys(RADAR_LIFECYCLE_CHIP) as RadarFeedLifecycleFilter[]).map((lifecycle) => chip(`radar-lifecycle-${lifecycle}`, RADAR_LIFECYCLE_CHIP[lifecycle], { ...state, lifecycle }, state.lifecycle === lifecycle)),
    chip('radar-family-all', 'All sources', { ...state, sourceFamily: null }, state.sourceFamily === null),
    ...families.map((family) => chip(`radar-family-${family}`, RADAR_SOURCE_FAMILY_LABEL[family] ?? family, { ...state, sourceFamily: family }, state.sourceFamily === family)),
    chip('radar-hide-dismissed', 'Hide dismissed', { ...state, includeDismissed: false }, !state.includeDismissed),
    chip('radar-include-dismissed', 'Include dismissed', { ...state, includeDismissed: true }, state.includeDismissed),
  ];
}

async function homeEventRadarFeedResult(userId: string, propertyId: string, message: string, cursor?: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const filters = parseRadarFeedFilters(message);
  const page = await radarQueryService.listFeed(propertyId, userId, {
    limit: 20,
    ...(cursor ? { cursor } : {}),
    ...(filters.lifecycle ? { lifecycle: [filters.lifecycle] } : {}),
    ...(filters.sourceFamily ? { sourceFamily: [filters.sourceFamily] } : {}),
    // Same default as the traditional page: dismissed events are hidden unless asked for.
    ...(filters.includeDismissed ? {} : { state: ['new', 'seen', 'saved', 'acted_on'] }),
  } as Parameters<typeof radarQueryService.listFeed>[2]) as {
    items: Array<Record<string, any>>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
    feedState: string;
    asOf: string;
  };
  const items = page.items ?? [];
  const radarHref = (matchId?: string) => radarEventHref(propertyId, matchId);
  const narrowed = filters.lifecycle !== null || filters.sourceFamily !== null;

  if (!items.length && !narrowed) {
    const copy = RADAR_FEED_STATE_COPY[page.feedState] ?? RADAR_FEED_STATE_COPY.UNCOVERED;
    return {
      status: 'ANSWERED',
      blocks: [{
        type: 'EMPTY_STATE',
        id: 'home-event-radar-empty',
        title: copy.title,
        body: filters.includeDismissed ? copy.body : `${copy.body} Dismissed events are hidden.`,
        actions: [
          ...(filters.includeDismissed ? [] : [{ id: 'radar-include-dismissed', label: 'Include dismissed events', interactionType: 'START_WORKFLOW' as const, message: radarFeedFilterMessage({ ...filters, includeDismissed: true }), operationId: 'HOME_EVENT_RADAR_FEED', style: 'SECONDARY' as const }]),
          ...radarFeedBlockActions(access.role),
          { id: 'open-radar', label: 'Open Home Event Radar', href: radarHref(), style: 'SECONDARY' },
        ],
      }],
      suggestions: [],
    };
  }

  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const family = typeof item.sourceFamily === 'string' && RADAR_SOURCE_FAMILY_LABEL[item.sourceFamily] ? item.sourceFamily : 'other';
    const existing = grouped.get(family) ?? [];
    existing.push(item);
    grouped.set(family, existing);
  }
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'home-event-radar-summary',
    title: 'Monitored home events',
    body: items.length
      ? `${items.length} monitored event${items.length === 1 ? '' : 's'} from Home Event Radar${page.totalCount > items.length ? ` (${page.totalCount} total)` : ''}.`
      : 'No monitored events match these filters.',
    tone: items.some((item) => item.isSourceStale) ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }, {
    type: 'GROUPED_LIST',
    filters: radarFeedFilterChips(filters, [...grouped.keys()]),
    id: 'home-event-radar-feed',
    title: 'Home Event Radar feed',
    // IW-PRES-015 / IW-PRES-022 (FRD v1.92): the feed is a card deck; Save is a right swipe and Dismiss a left swipe.
    presentation: { pattern: 'DECK', swipeRightActionId: 'radar-save', swipeLeftActionId: 'radar-dismiss' },
    description: `This is the same canonical feed the Home Event Radar page reads, grouped by source.${filters.includeDismissed ? '' : ' Dismissed events are hidden.'}`,
    sections: items.length ? [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([family, sectionItems]) => ({
      id: `radar-${family}`,
      title: RADAR_SOURCE_FAMILY_LABEL[family] ?? family,
      count: sectionItems.length,
      items: sectionItems.map((item) => ({
        id: String(item.id),
        title: String(item.title),
        description: String(item.summary ?? item.title),
        meta: [String(item.severity ?? 'info'), item.sourceName ? String(item.sourceName) : null].filter(Boolean) as string[],
        status: item.userState ? String(item.userState) : null,
        href: radarHref(String(item.id)),
        entityType: 'RADAR_MATCH',
        actions: radarEventItemActions(access.role, item.userState ? String(item.userState) : null),
      })),
    })) : [{ id: 'radar-no-match', title: 'No matching events', count: 0, items: [] }],
    actions: [...radarFeedBlockActions(access.role), { id: 'open-radar', label: 'Open Home Event Radar', href: radarHref(), style: 'SECONDARY' }],
  }];
  const degraded = page.feedState === 'PARTIAL_COVERAGE' || page.feedState === 'DEGRADED' || page.feedState === 'UNCOVERED';
  if (degraded) {
    const copy = RADAR_FEED_STATE_COPY[page.feedState];
    blocks.push({
      type: 'BOUNDARY',
      id: 'home-event-radar-partial',
      title: copy.title,
      body: copy.body,
      severity: 'INFO',
      suggestions: ['Ask again later'],
    });
  }
  return {
    status: degraded ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: degraded ? 'HOME_EVENT_RADAR_FEED_PARTIAL' : undefined,
    blocks,
    suggestions: page.pageInfo?.hasNextPage ? ['Show more monitored events'] : [],
    parameters: page.pageInfo?.hasNextPage ? { nextCursor: page.pageInfo.endCursor } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Home Event Radar writes (ASK_COZY_INLINE_WORKSPACE_FRD v1.40, capability-card
// audit follow-up). Split by consequence, per product decision:
// - HOME_EVENT_RADAR_STATE: save / unsave / dismiss / restore, a one-click
//   direct write (recorded IW-CONF-001 exception: the caller's own per-user,
//   reversible state with no property-level effect).
// - HOME_EVENT_RADAR_MARK_DONE: confirmed, because acted_on requests the
//   property's radar risk reconciliation (radarInteractionService.updateState's
//   mitigation_changed branch).
// - HOME_EVENT_RADAR_FEEDBACK: confirmed, a reason + optional comment form.
// All three are non-routable and reached only from the declared item actions
// on a HOME_EVENT_RADAR_FEED event. FRD v1.41 added task create-or-link
// (HOME_EVENT_RADAR_TASK) and notification settings
// (HOME_EVENT_RADAR_PREFERENCES), both form -> review -> confirm; see below.
// ---------------------------------------------------------------------------
export const RADAR_STATE_MESSAGES = {
  save: 'Save this monitored event.',
  unsave: 'Remove this monitored event from saved.',
  dismiss: 'Dismiss this monitored event.',
  restore: 'Restore this dismissed monitored event.',
} as const;

export type RadarStateRequest = keyof typeof RADAR_STATE_MESSAGES;

export const RADAR_MARK_DONE_MESSAGE = 'Mark this monitored event as done.';

export const RADAR_FEEDBACK_MESSAGE = 'Send feedback on this monitored event.';

export const RADAR_TASK_MESSAGE = 'Plan this recommended action from a monitored event.';

export const RADAR_PREFERENCES_MESSAGE = 'Change my Home Event Radar notification settings.';

export const RADAR_USER_STATE_LABEL: Record<string, string> = { new: 'New', seen: 'Seen', saved: 'Saved', dismissed: 'Dismissed', acted_on: 'Done' };

// The traditional page's own five reasons (RadarDetailSheet.tsx FEEDBACK_OPTIONS); 'helpful' exists in the
// canonical enum but is not offered there, so it is not offered here either.
export const RADAR_FEEDBACK_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Wrong location', value: 'wrong_location' },
  { label: 'Not relevant to my home', value: 'not_relevant' },
  { label: 'Duplicate event', value: 'duplicate' },
  { label: 'Information is stale', value: 'stale' },
  { label: 'Something else', value: 'other' },
];

export function radarEventHref(propertyId: string, matchId?: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-event-radar${matchId ? `?matchId=${encodeURIComponent(matchId)}` : ''}`;
}

// Every action a member of this role may take on a feed event. The inline detail (RadarEventDetail) shows only the
// ones valid for the event's LIVE canonical userState, so the feed row itself never needs refreshing to stay correct.
export function radarEventItemActions(role: HouseholdRole, recordedState?: string | null) {
  const action = (id: string, label: string, message: string, operationId: string, style: 'PRIMARY' | 'SECONDARY' = 'SECONDARY') => ({ id, label, message, style, interactionType: 'MUTATE_RECORD' as const, operationId });
  const all = [
    action('radar-save', 'Save', RADAR_STATE_MESSAGES.save, 'HOME_EVENT_RADAR_STATE'),
    action('radar-unsave', 'Remove from saved', RADAR_STATE_MESSAGES.unsave, 'HOME_EVENT_RADAR_STATE'),
    action('radar-dismiss', 'Dismiss', RADAR_STATE_MESSAGES.dismiss, 'HOME_EVENT_RADAR_STATE'),
    action('radar-restore', 'Restore', RADAR_STATE_MESSAGES.restore, 'HOME_EVENT_RADAR_STATE'),
    // Domain commands have no VIEWER floor, so these two are contributor-and-up (stricter than the traditional page).
    ...(role !== HouseholdRole.VIEWER ? [
      action('radar-mark-done', 'Mark done', RADAR_MARK_DONE_MESSAGE, 'HOME_EVENT_RADAR_MARK_DONE', 'PRIMARY'),
      action('radar-feedback', 'Send feedback', RADAR_FEEDBACK_MESSAGE, 'HOME_EVENT_RADAR_FEEDBACK'),
      // Not a button of its own: RadarEventDetail renders it once per recommended action that supports task planning,
      // and sends that action's code as launchContext.actionId (FRD v1.41).
      action('radar-plan-task', 'Plan this action', RADAR_TASK_MESSAGE, 'HOME_EVENT_RADAR_TASK'),
    ] : []),
  ];
  // IW-PRES-015 (FRD v1.92): with the event's recorded state, only the actions that state allows are declared, so a card
  // deck never offers Save on a saved event or anything but Restore on a dismissed one (the same rules as the detail's
  // live-state filter and the server's own transition). Without a state every action is declared, as before.
  if (recordedState === undefined) return all;
  const state = recordedState ?? 'new';
  return all.filter((entry) => {
    switch (entry.id) {
      case 'radar-save': return state !== 'saved' && state !== 'acted_on';
      case 'radar-unsave': return state === 'saved';
      case 'radar-dismiss': return state !== 'dismissed' && state !== 'acted_on';
      case 'radar-restore': return state === 'dismissed';
      case 'radar-mark-done': return state !== 'acted_on';
      default: return true;
    }
  });
}

// Feed-level actions (FRD v1.41). Notification settings are per-user and per-property, like the traditional page's
// "Radar notifications" card, so they sit on the feed rather than on an event.
function radarFeedBlockActions(role: HouseholdRole) {
  return role !== HouseholdRole.VIEWER
    ? [{ id: 'radar-notification-settings', label: 'Notification settings', interactionType: 'START_WORKFLOW' as const, message: RADAR_PREFERENCES_MESSAGE, operationId: 'HOME_EVENT_RADAR_PREFERENCES', style: 'SECONDARY' as const }]
    : [];
}

// Pure: the state a request moves to from the LIVE state, or why it is refused. A done (acted_on) event is refused:
// on the traditional page Save/Dismiss would silently undo "done" and re-trigger the property risk reconciliation,
// which is exactly the material change the confirmed MARK_DONE path exists for.
export function radarStateTransition(request: RadarStateRequest, current: string): { target: 'saved' | 'seen' | 'dismissed'; alreadyApplied: boolean } | { refused: string } {
  if (current === 'acted_on') return { refused: 'This event is marked done. Saving or dismissing it here would undo that, so use Home Event Radar to change it.' };
  switch (request) {
    case 'save': return { target: 'saved', alreadyApplied: current === 'saved' };
    case 'unsave': return { target: 'seen', alreadyApplied: current !== 'saved' };
    case 'dismiss': return { target: 'dismissed', alreadyApplied: current === 'dismissed' };
    case 'restore': return { target: 'seen', alreadyApplied: current !== 'dismissed' };
  }
}

export function radarStateContextVersion(matchId: string, userState: string): string {
  return createHash('sha256').update(`${matchId}:${userState}`).digest('hex');
}

function radarLaunchMatchId(launchContext?: CreateAskExecutionRequest['launchContext']): string | null {
  return launchContext?.entityType === 'RADAR_MATCH' && launchContext.entityId ? launchContext.entityId : null;
}

function radarWriteBoundary(propertyId: string, title: string, body: string, status: AskOperationResult['status'] = 'BLOCKED'): AskOperationResult {
  return {
    status,
    reasonCode: 'HOME_EVENT_RADAR_WRITE_NOT_AVAILABLE',
    blocks: [{ type: 'BOUNDARY', id: 'radar-write-boundary', title, body, severity: 'INFO', suggestions: ['Show my home event radar feed'] }],
    suggestions: ['Show my home event radar feed'],
  };
}

const RADAR_EVENT_GONE = { title: 'Event no longer available', body: 'This monitored event was removed or is no longer matched to this home. Nothing was changed.' };

const RADAR_WRITE_NEEDS_EVENT = { title: 'Choose the event in Home Event Radar', body: 'Open the event from your Home Event Radar feed and use its actions there. Nothing was changed.' };

export async function homeEventRadarStateResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const request = (Object.keys(RADAR_STATE_MESSAGES) as RadarStateRequest[]).find((key) => RADAR_STATE_MESSAGES[key] === message.trim());
  const matchId = radarLaunchMatchId(launchContext);
  // Declared-action-only start (write rule 3): only a click on the declared action writes. An ASK_REFRESH re-run,
  // or anything without the pinned operation, the canned message and the event, writes nothing.
  const declared = launchContext?.operationId === 'HOME_EVENT_RADAR_STATE' && launchContext.surface !== 'ASK_REFRESH';
  if (!request || !matchId || !declared) return radarWriteBoundary(propertyId, RADAR_WRITE_NEEDS_EVENT.title, RADAR_WRITE_NEEDS_EVENT.body, 'NOT_APPLICABLE');
  const detail = await loadRadarMatchForWrite(propertyId, matchId, userId);
  if (!detail) return radarWriteBoundary(propertyId, RADAR_EVENT_GONE.title, RADAR_EVENT_GONE.body);
  const current = String(detail.userState ?? 'new');
  const transition = radarStateTransition(request, current);
  if ('refused' in transition) return radarWriteBoundary(propertyId, 'Event is marked done', transition.refused);
  if (!transition.alreadyApplied) {
    await radarInteractionService.updateState(propertyId, matchId, userId, transition.target);
    // Same analytics the traditional PATCH /state controller emits (write rule 2); its guidance-journey completion
    // only runs when a guidanceJourneyId is supplied, which Ask never has.
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.RISK, featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
      metadataJson: { actionType: 'update_match_state', matchId, state: transition.target, surface: 'ASK' },
    });
  }
  const title = transition.alreadyApplied
    ? ({ save: 'Already saved', unsave: 'Not saved', dismiss: 'Already dismissed', restore: 'Not dismissed' } as const)[request]
    : ({ save: 'Event saved', unsave: 'Removed from saved', dismiss: 'Event dismissed', restore: 'Event restored' } as const)[request];
  return {
    status: 'COMPLETED',
    reasonCode: transition.alreadyApplied ? 'HOME_EVENT_RADAR_STATE_ALREADY_SET' : 'HOME_EVENT_RADAR_STATE_CHANGED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `radar-state-${matchId}`, title, status: 'COMPLETED',
      description: 'This changes Home Event Radar for you only; other household members keep their own view.',
      details: [
        { label: 'Event', value: String(detail.title ?? 'Monitored event') },
        { label: 'Previous state', value: RADAR_USER_STATE_LABEL[current] ?? current },
        { label: 'Current state', value: transition.alreadyApplied ? RADAR_USER_STATE_LABEL[current] ?? current : RADAR_USER_STATE_LABEL[transition.target] },
      ],
      actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }],
    }],
    suggestions: ['Show my home event radar feed'],
  };
}

function radarMarkDoneConfirmation(detail: Record<string, any>, version: number, expiresAt: Date) {
  return {
    confirmationId: `radar-mark-done-${detail.propertyMatchId}-${version}`, version,
    title: `Mark "${detail.title}" as done?`,
    description: 'Home Event Radar will treat this event as handled for you and recheck this home\'s radar risk to reflect it.',
    fields: [{ label: 'Event', value: String(detail.title) }, { label: 'Current state', value: RADAR_USER_STATE_LABEL[String(detail.userState ?? 'new')] ?? String(detail.userState) }],
    editableFields: [],
    confirmLabel: 'Mark done',
    consentText: 'I have handled this event and want Home Event Radar to recheck this home\'s risk.',
    expiresAt: expiresAt.toISOString(),
  };
}

async function homeEventRadarMarkDoneResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const matchId = radarLaunchMatchId(launchContext);
  const declared = launchContext?.operationId === 'HOME_EVENT_RADAR_MARK_DONE' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === RADAR_MARK_DONE_MESSAGE;
  if (!matchId || !declared) return radarWriteBoundary(propertyId, RADAR_WRITE_NEEDS_EVENT.title, RADAR_WRITE_NEEDS_EVENT.body, 'NOT_APPLICABLE');
  const detail = await loadRadarMatchForWrite(propertyId, matchId, userId);
  if (!detail) return radarWriteBoundary(propertyId, RADAR_EVENT_GONE.title, RADAR_EVENT_GONE.body);
  const current = String(detail.userState ?? 'new');
  if (current === 'acted_on') {
    return {
      status: 'COMPLETED', reasonCode: 'HOME_EVENT_RADAR_ALREADY_DONE',
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `radar-mark-done-${matchId}`, title: 'Already marked done', status: 'COMPLETED', description: 'Nothing was changed.', details: [{ label: 'Event', value: String(detail.title) }], actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }] }],
      suggestions: ['Show my home event radar feed'],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_RADAR_MARK_DONE_CONFIRMATION_REQUIRED', contextVersion: radarStateContextVersion(matchId, current),
    parameters: {
      radarMatchId: matchId, radarStateContextVersion: radarStateContextVersion(matchId, current), sourceExecutionId: launchContext?.sourceExecutionId ?? null,
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{ type: 'SUMMARY', id: 'radar-mark-done-review', title: `Review marking ${detail.title} as done`, body: 'Nothing has changed yet. Confirm to mark this event done.', tone: 'DEFAULT', actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }] }],
    confirmation: radarMarkDoneConfirmation(detail, 1, expiresAt),
    suggestions: [],
  };
}

export function radarFeedbackConfirmation(detail: Record<string, any>, input: z.infer<typeof RadarFeedbackInputSchema>, version: number, expiresAt: Date) {
  return {
    confirmationId: `radar-feedback-${input.matchId}-${version}`, version,
    title: `Send feedback on "${detail.title}"?`,
    description: 'Feedback helps Home Event Radar match events to this home. It replaces any feedback you sent on this event before.',
    fields: [{ label: 'Event', value: String(detail.title) }],
    editableFields: [
      { key: 'feedbackType', label: 'Reason', type: 'SELECT' as const, value: input.feedbackType ?? '', options: [...RADAR_FEEDBACK_OPTIONS] },
      { key: 'comment', label: `Comment (optional, up to ${RADAR_FEEDBACK_COMMENT_MAX_LENGTH} characters)`, type: 'TEXTAREA' as const, value: input.comment ?? '' },
    ],
    confirmLabel: 'Send feedback',
    consentText: 'I want to send this feedback to Home Event Radar.',
    expiresAt: expiresAt.toISOString(),
  };
}

export const RADAR_FEEDBACK_REVIEW_BODY = 'Nothing has been sent yet. Choose a reason, add a comment if you like, then confirm.';

async function homeEventRadarFeedbackResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const matchId = radarLaunchMatchId(launchContext);
  const declared = launchContext?.operationId === 'HOME_EVENT_RADAR_FEEDBACK' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === RADAR_FEEDBACK_MESSAGE;
  if (!matchId || !declared) return radarWriteBoundary(propertyId, RADAR_WRITE_NEEDS_EVENT.title, RADAR_WRITE_NEEDS_EVENT.body, 'NOT_APPLICABLE');
  const detail = await loadRadarMatchForWrite(propertyId, matchId, userId);
  if (!detail) return radarWriteBoundary(propertyId, RADAR_EVENT_GONE.title, RADAR_EVENT_GONE.body);
  const existingType = detail.userFeedback?.feedbackType;
  const input = RadarFeedbackInputSchema.parse({
    matchId,
    feedbackType: RADAR_FEEDBACK_OPTIONS.some((option) => option.value === existingType) ? existingType : null,
    comment: null,
  });
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_RADAR_FEEDBACK_CONFIRMATION_REQUIRED',
    parameters: { radarFeedback: input, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'radar-feedback-review', title: `Feedback on ${detail.title}`, body: RADAR_FEEDBACK_REVIEW_BODY, tone: 'DEFAULT', actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }] }],
    confirmation: radarFeedbackConfirmation(detail, input, 1, expiresAt),
    suggestions: [],
  };
}

registerCapabilityHandler('home-event-radar.state', async (envelope) => homeEventRadarStateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('home-event-radar.mark-done', async (envelope) => homeEventRadarMarkDoneResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('home-event-radar.feedback', async (envelope) => homeEventRadarFeedbackResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

export function radarConfirmError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export async function radarWriteReceipt(ctx: ConfirmCapabilityContext, matchId: string, block: Extract<AskPresentationBlock, { type: 'WORKFLOW_PROGRESS' }>, reasonCode: string, artifactType: string): Promise<ConfirmCapabilityResult> {
  const result: AskOperationResult = { status: 'COMPLETED', reasonCode, blocks: [block], suggestions: ['Show my home event radar feed'] };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `radar-refresh-failed-${matchId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'This was saved to Home Event Radar. The feed you were viewing could not refresh automatically -- ask "Show my home event radar feed" to see its current state.' });
  }
  return { result, artifactType, artifactId: matchId, refreshedExecutions: refresh.refreshedExecutions };
}

// ---------------------------------------------------------------------------
// Home Event Radar task create-or-link and notification settings
// (ASK_COZY_INLINE_WORKSPACE_FRD v1.41). Both go form -> review -> confirm, the same shape as "Add a room": the
// traditional controls are forms (RadarDetailSheet's "Plan this action" controls and the "Radar notifications"
// card), and the shared confirmation card allows only three editable fields, so the form is an inline capture and
// the confirmation card shows what was entered.
// ---------------------------------------------------------------------------
export const RADAR_TASK_CAPTURE_KEY = 'HOME_EVENT_RADAR_TASK_INPUTS';

export const RADAR_PREFERENCES_CAPTURE_KEY = 'HOME_EVENT_RADAR_PREFERENCES_INPUTS';

const RADAR_UNASSIGNED = 'UNASSIGNED';

const RADAR_DEFAULT_DUE_TIME = '09:00';

const RADAR_TASK_OPERATION_LABEL: Record<RadarActionTaskOperation, string> = {
  create_task: 'Add a maintenance task',
  create_reminder: 'Set a reminder',
  link_existing_task: 'Link an existing task',
};

type RadarTaskTarget = z.infer<typeof RadarTaskTargetSchema>;

type RadarTaskAnswer = z.infer<typeof RadarTaskAnswerSchema>;

// A wall-clock date and time in `timeZone` as a UTC instant. Two passes so a DST change between the guess and the
// answer still lands on the right offset.
export function radarZonedWallClockToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - instant;
  };
  const first = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(first));
}

export function radarDateTimeLabel(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
}

export const radarTaskContextVersion = (target: RadarTaskTarget): string => createHash('sha256').update(`radar-task:${target.matchId}:${target.actionCode}`).digest('hex');

// The form kept beside a review card gets its own requirementId: the inline card is keyed by it and holds one
// idempotency key per mount, so reusing the id would make a changed resubmission an idempotency conflict.
function radarCaptureRequirementId(base: string, entered: unknown): string {
  return entered === undefined ? base : `${base}-${createHash('sha256').update(JSON.stringify(entered)).digest('hex').slice(0, 12)}`;
}

export function radarCaptureError(message: string, code = 'ASK_CAPTURE_VALIDATION_ERROR'): Error {
  return Object.assign(new Error(message), { code });
}

async function radarHouseholdMemberOptions(propertyId: string): Promise<Array<{ label: string; value: string }>> {
  const members = await prisma.householdMember.findMany({
    where: { propertyId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: [{ isPrimaryOwner: 'desc' }, { joinedAt: 'asc' }],
  });
  // Same label as the traditional assignee picker: display name, then first and last name, then email.
  return members.map((member) => ({
    label: member.displayName || `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || member.user.email,
    value: member.userId,
  }));
}

function radarTaskCaptureRequest(
  contextVersion: string,
  actionLabel: string,
  operations: RadarActionTaskOperation[],
  candidates: Array<{ id: string; title: string }>,
  members: Array<{ label: string; value: string }>,
  entered?: RadarTaskAnswer,
): AskCaptureRequest {
  const creates = operations.some((operation) => operation !== 'link_existing_task');
  return {
    requirementId: radarCaptureRequirementId('radar-task-inputs', entered), captureKey: RADAR_TASK_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Plan this action', question: `How would you like to plan "${actionLabel}"?`,
    helpText: 'You will review everything before a task is added or linked.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'operation', label: 'What to do', required: true, inputSchema: { type: 'SINGLE_SELECT', options: operations.map((operation) => ({ label: RADAR_TASK_OPERATION_LABEL[operation], value: operation })) } },
      ...(operations.includes('link_existing_task') ? [{ key: 'maintenanceTaskId', label: 'Existing maintenance task', required: true, when: { fieldKey: 'operation', operator: 'EQUALS' as const, value: 'link_existing_task' }, inputSchema: { type: 'SINGLE_SELECT' as const, options: candidates.map((task) => ({ label: task.title, value: task.id })) } }] : []),
      ...(creates ? [
        { key: 'dueDate', label: 'Due date', helpText: 'Optional. Leave it empty and Home Event Radar uses the event timing when it safely can.', required: false, when: { fieldKey: 'operation', operator: 'NOT_EQUALS' as const, value: 'link_existing_task' }, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE' as const], allowFuture: true } },
        { key: 'dueTime', label: 'Due time', helpText: `Optional, in your home's timezone. Defaults to ${RADAR_DEFAULT_DUE_TIME} when you choose a date.`, required: false, when: { fieldKey: 'operation', operator: 'NOT_EQUALS' as const, value: 'link_existing_task' }, inputSchema: { type: 'TIME' as const } },
      ] : []),
      { key: 'assigneeUserId', label: 'Assign to', helpText: 'Optional.', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Unassigned', value: RADAR_UNASSIGNED }, ...members] } },
    ] },
    currentAnswer: {
      operation: entered?.operation ?? (operations.length === 1 ? operations[0] : null),
      maintenanceTaskId: entered?.maintenanceTaskId ?? null,
      dueDate: entered?.dueDate ?? null,
      dueTime: entered?.dueTime ?? null,
      assigneeUserId: entered?.assigneeUserId ?? RADAR_UNASSIGNED,
    },
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this task; nothing is added or linked until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

type RadarRecommendedAction = {
  code: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  supportedTaskOperations: RadarActionTaskOperation[];
  taskLink: { operation: string; task: { id: string; title: string; href: string; nextDueDate: string | null } } | null;
};

function radarTaskAlreadyPlanned(propertyId: string, matchId: string, eventTitle: string, action: RadarRecommendedAction): AskOperationResult {
  const link = action.taskLink!;
  return {
    status: 'COMPLETED', reasonCode: 'HOME_EVENT_RADAR_TASK_ALREADY_LINKED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `radar-task-${matchId}-${action.code}`, title: 'Already planned', status: 'COMPLETED',
      description: 'This recommended action already has a maintenance task. Nothing was changed.',
      details: [{ label: 'Event', value: eventTitle }, { label: 'Recommended action', value: action.label }, { label: 'Task', value: link.task.title }],
      actions: [{ id: 'open-task', label: 'Open task', href: link.task.href, style: 'PRIMARY' }, { id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, matchId), style: 'SECONDARY' }],
    }],
    suggestions: ['Show my home event radar feed'],
  };
}

// Builds the form, or, with an answer, the review card. Shared by the declared start and the capture submission.
export async function radarTaskFormResult(userId: string, propertyId: string, target: RadarTaskTarget, answer: RadarTaskAnswer | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const detail = await loadRadarMatchForWrite(propertyId, target.matchId, userId);
  if (!detail) return radarWriteBoundary(propertyId, RADAR_EVENT_GONE.title, RADAR_EVENT_GONE.body);
  const action = ((detail.recommendedActions ?? []) as RadarRecommendedAction[]).find((candidate) => candidate.code === target.actionCode);
  if (!action) return radarWriteBoundary(propertyId, 'Action no longer recommended', 'Home Event Radar no longer recommends this action for the event. Nothing was changed.');
  const eventTitle = String(detail.title ?? 'Monitored event');
  if (action.taskLink) return radarTaskAlreadyPlanned(propertyId, target.matchId, eventTitle, action);
  // Linking needs at least one open task, exactly as the traditional control shows "No active maintenance tasks".
  const candidates = action.supportedTaskOperations.includes('link_existing_task')
    ? await radarTaskIntegrationService.listCandidateTasks(propertyId, target.matchId, target.actionCode) as Array<{ id: string; title: string }>
    : [];
  const operations = action.supportedTaskOperations.filter((operation) => operation !== 'link_existing_task' || candidates.length > 0);
  if (!operations.length) {
    return radarWriteBoundary(propertyId, 'This action cannot be planned here', action.supportedTaskOperations.length
      ? 'The only option for this action is linking an existing task, and there are no open maintenance tasks to link. Nothing was changed.'
      : 'Home Event Radar does not offer a task or reminder for this action. Nothing was changed.');
  }
  const members = await radarHouseholdMemberOptions(propertyId);
  const contextVersion = radarTaskContextVersion(target);
  const openRadar = { id: 'open-radar', label: 'Open in Home Event Radar', href: radarEventHref(propertyId, target.matchId), style: 'SECONDARY' as const };
  const capture = radarTaskCaptureRequest(contextVersion, action.label, operations, candidates, members, answer);
  if (!answer) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_EVENT_RADAR_TASK_INPUT_REQUIRED', contextVersion,
      parameters: { radarTaskTarget: target, sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'radar-task-input', title: `Plan "${action.label}"`, body: `For ${eventTitle}. Nothing has been added yet. Choose how to plan it, then review before anything is saved.`, tone: 'DEFAULT', actions: [openRadar] }],
      captureRequests: [capture], suggestions: [],
    };
  }

  // Validate the answer against the same rules createOrLink applies, so a problem shows on the form, not at confirm.
  if (!operations.includes(answer.operation)) throw radarCaptureError('That option is not available for this action.');
  const linking = answer.operation === 'link_existing_task';
  const maintenanceTaskId = linking ? answer.maintenanceTaskId || null : null;
  if (linking && !candidates.some((task) => task.id === maintenanceTaskId)) throw radarCaptureError('Choose one of the listed maintenance tasks to link.');
  const assigneeUserId = answer.assigneeUserId && answer.assigneeUserId !== RADAR_UNASSIGNED ? answer.assigneeUserId : null;
  if (assigneeUserId && !members.some((member) => member.value === assigneeUserId)) throw radarCaptureError('Choose a household member, or leave the task unassigned.');
  const timeZone = getAskPropertyTimezone();
  const requestedDate = linking ? null : answer.dueDate?.value ?? null;
  if (!linking && !requestedDate && answer.dueTime) throw radarCaptureError('Choose a due date to go with the due time.');
  const dueAt = requestedDate ? radarZonedWallClockToUtc(requestedDate, answer.dueTime || RADAR_DEFAULT_DUE_TIME, timeZone).toISOString() : null;
  let due: ReturnType<typeof deriveRadarTaskDueDate>;
  try {
    due = deriveRadarTaskDueDate({
      now: new Date(), operation: answer.operation, priority: action.priority,
      effectiveAt: detail.effectiveAt ?? null, expiresAt: detail.expiresAt ?? null, requestedDueAt: dueAt,
    });
  } catch (error) {
    if (error instanceof RadarTaskDueDateError) throw radarCaptureError(error.message);
    throw error;
  }
  const input = RadarTaskInputSchema.parse({ matchId: target.matchId, actionCode: target.actionCode, operation: answer.operation, maintenanceTaskId, dueAt, assigneeUserId });
  const linkedTask = linking ? candidates.find((task) => task.id === maintenanceTaskId) : null;
  const dueLabel = linking
    ? 'Kept from the existing task'
    : due ? `${radarDateTimeLabel(due.dueAt, timeZone)}${due.source === 'user_provided' ? '' : ' (from the event timing)'}` : 'No due date';
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_RADAR_TASK_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { radarTaskTarget: target, radarTask: input, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'radar-task-review', title: `Review planning "${action.label}"`, body: 'You entered these details. Nothing is added or linked until you confirm.', tone: 'DEFAULT', actions: [openRadar] }],
    confirmation: {
      confirmationId: `radar-task-${target.matchId}-${target.actionCode}-1`, version: 1,
      title: linking ? `Link "${linkedTask?.title}" to this action?` : answer.operation === 'create_reminder' ? `Set a reminder for "${action.label}"?` : `Add "${action.label}" as a maintenance task?`,
      description: linking
        ? 'The existing maintenance task is linked to this recommended action, the same as linking it from Home Event Radar.'
        : 'This adds a task to your maintenance list through the same service Home Event Radar uses, linked to this recommended action.',
      fields: [
        { label: 'Event', value: eventTitle },
        { label: 'Recommended action', value: action.label },
        { label: 'What happens', value: RADAR_TASK_OPERATION_LABEL[answer.operation] },
        ...(linking ? [{ label: 'Task', value: linkedTask?.title ?? '' }] : [{ label: 'Task title', value: answer.operation === 'create_reminder' ? `Reminder: ${action.label}` : action.label }]),
        { label: 'Due', value: dueLabel },
        { label: 'Assigned to', value: assigneeUserId ? members.find((member) => member.value === assigneeUserId)?.label ?? 'Household member' : 'Unassigned' },
      ],
      editableFields: [], confirmLabel: linking ? 'Link task' : answer.operation === 'create_reminder' ? 'Set reminder' : 'Add task',
      consentText: 'I authorize adding this to the shared maintenance list for this home.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be changed and resubmitted before confirming.
    captureRequests: [capture],
    suggestions: [],
  };
}

async function homeEventRadarTaskResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const matchId = radarLaunchMatchId(launchContext);
  const actionCode = RADAR_ACTION_CODES.find((code) => code === launchContext?.actionId) ?? null;
  // Declared-action-only start: a click on "Plan this action" carries the event, the action code and the pinned
  // operation. An ASK_REFRESH re-run of an open form, or a bare message, starts nothing.
  const declared = launchContext?.operationId === 'HOME_EVENT_RADAR_TASK' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === RADAR_TASK_MESSAGE;
  if (!matchId || !actionCode || !declared) return radarWriteBoundary(propertyId, RADAR_WRITE_NEEDS_EVENT.title, RADAR_WRITE_NEEDS_EVENT.body, 'NOT_APPLICABLE');
  if (access.role === HouseholdRole.VIEWER) return radarWriteBoundary(propertyId, 'A contributor or owner can plan radar actions', 'Your role can view Home Event Radar but not add or link maintenance tasks. Nothing was changed.');
  return radarTaskFormResult(userId, propertyId, { matchId, actionCode }, undefined, launchContext?.sourceExecutionId ?? null);
}

registerCapabilityHandler('home-event-radar.task', async (envelope) => homeEventRadarTaskResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

// Errors createOrLink can raise after review, and how Ask reports them. Anything else is unexpected and rethrown.
export const RADAR_TASK_CONFIRM_ERRORS: Record<string, string> = {
  RADAR_MATCH_NOT_FOUND: 'ASK_CONTEXT_VERSION_CONFLICT',
  RADAR_ACTION_NOT_AVAILABLE: 'ASK_CONTEXT_VERSION_CONFLICT',
  RADAR_TASK_OPERATION_UNAVAILABLE: 'ASK_CONTEXT_VERSION_CONFLICT',
  RADAR_MAINTENANCE_TASK_NOT_FOUND: 'ASK_CONTEXT_VERSION_CONFLICT',
  RADAR_ASSIGNEE_NOT_IN_HOUSEHOLD: 'ASK_CONTEXT_VERSION_CONFLICT',
  RADAR_DUE_DATE_INVALID: 'ASK_INVALID_CONFIRMATION_EDIT',
  RADAR_REMINDER_DUE_DATE_REQUIRED: 'ASK_INVALID_CONFIRMATION_EDIT',
};

// Notification settings. The option labels are the traditional "Radar notifications" card's own.
const RADAR_CATEGORY_OPTIONS = [
  { value: 'weather', label: 'Weather' }, { value: 'air_quality', label: 'Air quality' }, { value: 'disaster', label: 'Emergency and disaster' },
  { value: 'utility', label: 'Utilities' }, { value: 'tax', label: 'Property tax' }, { value: 'insurance', label: 'Insurance' }, { value: 'other', label: 'Other property events' },
];

const RADAR_CHANNEL_OPTIONS = [{ value: 'in_app', label: 'In-app' }, { value: 'email', label: 'Email' }, { value: 'push', label: 'Push' }];

const RADAR_SEVERITY_OPTIONS = [
  { value: 'info', label: 'Informational or higher' }, { value: 'low', label: 'Low or higher' }, { value: 'moderate', label: 'Moderate or higher' },
  { value: 'high', label: 'High or higher' }, { value: 'severe', label: 'Severe or higher' }, { value: 'extreme', label: 'Extreme only' },
];

const RADAR_IMPACT_OPTIONS = [
  { value: 'none', label: 'Any property impact' }, { value: 'low', label: 'Low or higher' }, { value: 'moderate', label: 'Moderate or higher' },
  { value: 'high', label: 'High or higher' }, { value: 'critical', label: 'Critical only' },
];

const RADAR_DELIVERY_OPTIONS = [{ value: 'immediate', label: 'Immediate' }, { value: 'digest', label: 'Digest' }];

type RadarPreferencesBody = z.infer<typeof updateRadarNotificationPreferencesBodySchema>;

const RadarPreferencesAnswerSchema = z.object({
  isEnabled: z.boolean(),
  enabledCategories: z.array(z.string()),
  channels: z.array(z.string()),
  minimumSeverity: z.string(),
  minimumImpact: z.string(),
  deliveryMode: z.string(),
  criticalSafetyOverrideEnabled: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().nullish(),
  quietHoursEnd: z.string().nullish(),
  timezone: z.string(),
});

// The canonical row's identity and last save; the default projection (never saved) is its own version.
export function radarPreferencesContextVersion(current: Pick<RadarNotificationPreferenceProjection, 'propertyId' | 'userId' | 'persisted' | 'updatedAt'>): string {
  return createHash('sha256').update(`radar-preferences:${current.propertyId}:${current.userId}:${current.persisted}:${current.updatedAt ?? ''}`).digest('hex');
}

function radarPreferencesAnswer(value: RadarPreferencesBody | RadarNotificationPreferenceProjection): z.infer<typeof RadarPreferencesAnswerSchema> {
  return {
    isEnabled: value.isEnabled, enabledCategories: [...value.enabledCategories], channels: [...value.channels],
    minimumSeverity: value.minimumSeverity, minimumImpact: value.minimumImpact, deliveryMode: value.deliveryMode,
    criticalSafetyOverrideEnabled: value.criticalSafetyOverrideEnabled,
    quietHoursEnabled: Boolean(value.quietHours), quietHoursStart: value.quietHours?.start ?? '22:00', quietHoursEnd: value.quietHours?.end ?? '07:00',
    timezone: value.timezone,
  };
}

function radarPreferencesCaptureRequest(contextVersion: string, values: z.infer<typeof RadarPreferencesAnswerSchema>, reviewed = false): AskCaptureRequest {
  const quietHoursOn = { fieldKey: 'quietHoursEnabled', operator: 'EQUALS' as const, value: true };
  return {
    requirementId: radarCaptureRequirementId('radar-preferences-inputs', reviewed ? values : undefined), captureKey: RADAR_PREFERENCES_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'KNOWN',
    title: 'Radar notifications', question: 'Choose what reaches you, when, and through which channels.',
    helpText: 'These settings are yours only; other household members keep their own. You will review them before they are saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'isEnabled', label: 'Notify me about matching property events', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'On', falseLabel: 'Off' } },
      { key: 'enabledCategories', label: 'Categories', helpText: 'Choose at least one.', required: true, inputSchema: { type: 'MULTI_SELECT', options: RADAR_CATEGORY_OPTIONS } },
      { key: 'channels', label: 'Channels', helpText: 'Choose at least one.', required: true, inputSchema: { type: 'MULTI_SELECT', options: RADAR_CHANNEL_OPTIONS } },
      { key: 'minimumSeverity', label: 'Minimum event severity', required: true, inputSchema: { type: 'SINGLE_SELECT', options: RADAR_SEVERITY_OPTIONS } },
      { key: 'minimumImpact', label: 'Minimum property impact', required: true, inputSchema: { type: 'SINGLE_SELECT', options: RADAR_IMPACT_OPTIONS } },
      { key: 'deliveryMode', label: 'Delivery timing', helpText: 'Immediate sends each eligible event when policy permits. Digest groups eligible non-urgent events into a summary.', required: true, inputSchema: { type: 'SINGLE_SELECT', options: RADAR_DELIVERY_OPTIONS } },
      { key: 'quietHoursEnabled', label: 'Quiet hours', helpText: 'Pause eligible notifications during local quiet hours.', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'On', falseLabel: 'Off' } },
      { key: 'quietHoursStart', label: 'Quiet hours start', required: true, when: quietHoursOn, inputSchema: { type: 'TIME' } },
      { key: 'quietHoursEnd', label: 'Quiet hours end', required: true, when: quietHoursOn, inputSchema: { type: 'TIME' } },
      { key: 'criticalSafetyOverrideEnabled', label: 'Verified extreme safety alerts during quiet hours', helpText: 'Applies only to reviewed, observed, immediate official alerts with verified confidence and high property impact.', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Allow', falseLabel: 'Do not allow' } },
      { key: 'timezone', label: 'Timezone', helpText: 'An IANA timezone, such as America/New_York.', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 100 } },
    ] },
    currentAnswer: values,
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare your settings; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

// The form answer as the traditional PUT body, validated by the traditional route's own schema.
export function radarPreferencesBodyFromAnswer(answer: unknown): RadarPreferencesBody {
  const parsed = RadarPreferencesAnswerSchema.safeParse(answer);
  if (!parsed.success) throw radarCaptureError('Answer every notification setting before reviewing.');
  const value = parsed.data;
  const body = updateRadarNotificationPreferencesBodySchema.safeParse({
    isEnabled: value.isEnabled, enabledCategories: value.enabledCategories, channels: value.channels,
    minimumSeverity: value.minimumSeverity, minimumImpact: value.minimumImpact, deliveryMode: value.deliveryMode,
    criticalSafetyOverrideEnabled: value.criticalSafetyOverrideEnabled,
    quietHours: value.quietHoursEnabled ? { start: value.quietHoursStart ?? '', end: value.quietHoursEnd ?? '' } : null,
    timezone: value.timezone,
  });
  if (!body.success) {
    const field = String(body.error.issues[0]?.path[0] ?? '');
    const messages: Record<string, string> = {
      enabledCategories: 'Choose at least one category.',
      channels: 'Choose at least one channel.',
      quietHours: 'Quiet hours need a 24-hour start and end time that are different from each other.',
      timezone: 'Enter a valid IANA timezone, such as America/New_York.',
    };
    throw radarCaptureError(messages[field] ?? 'Check the notification settings and try again.');
  }
  return body.data;
}

export function radarPreferenceLabels(body: RadarPreferencesBody) {
  const pick = (options: Array<{ value: string; label: string }>, value: string) => options.find((option) => option.value === value)?.label ?? value;
  return [
    { key: 'isEnabled', label: 'Notifications', value: body.isEnabled ? 'On' : 'Off' },
    { key: 'enabledCategories', label: 'Categories', value: body.enabledCategories.map((value) => pick(RADAR_CATEGORY_OPTIONS, value)).join(', ') },
    { key: 'channels', label: 'Channels', value: body.channels.map((value) => pick(RADAR_CHANNEL_OPTIONS, value)).join(', ') },
    { key: 'minimumSeverity', label: 'Minimum severity', value: pick(RADAR_SEVERITY_OPTIONS, body.minimumSeverity) },
    { key: 'minimumImpact', label: 'Minimum impact', value: pick(RADAR_IMPACT_OPTIONS, body.minimumImpact) },
    { key: 'deliveryMode', label: 'Delivery', value: pick(RADAR_DELIVERY_OPTIONS, body.deliveryMode) },
    { key: 'quietHours', label: 'Quiet hours', value: body.quietHours ? `${body.quietHours.start} to ${body.quietHours.end}` : 'Off' },
    { key: 'criticalSafetyOverrideEnabled', label: 'Extreme safety alerts in quiet hours', value: body.criticalSafetyOverrideEnabled ? 'Allowed' : 'Not allowed' },
    { key: 'timezone', label: 'Timezone', value: body.timezone },
  ];
}

export async function radarPreferencesFormResult(userId: string, propertyId: string, body: RadarPreferencesBody | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const current = await radarNotificationPreferenceService.get(propertyId, userId);
  const contextVersion = radarPreferencesContextVersion(current);
  const openRadar = { id: 'open-radar', label: 'Open Home Event Radar', href: radarEventHref(propertyId), style: 'SECONDARY' as const };
  if (!body) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_EVENT_RADAR_PREFERENCES_INPUT_REQUIRED', contextVersion,
      parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'radar-preferences-input', title: 'Radar notification settings', body: `${current.persisted ? 'These are your current settings.' : 'You have not changed these yet, so these are the defaults.'} Change what you like, then review before anything is saved.`, tone: 'DEFAULT', actions: [openRadar] }],
      captureRequests: [radarPreferencesCaptureRequest(contextVersion, radarPreferencesAnswer(current))], suggestions: [],
    };
  }
  const before = radarPreferenceLabels({ ...current, quietHours: current.quietHours });
  const after = radarPreferenceLabels(body);
  const changed = after.filter((row, index) => row.value !== before[index].value).map((row) => row.label);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_EVENT_RADAR_PREFERENCES_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { radarPreferences: body, radarPreferencesContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'radar-preferences-review', title: 'Review your notification settings', body: changed.length ? `Changing: ${changed.join(', ')}. Nothing is saved until you confirm.` : 'These match your current settings. Confirming saves them as they are.', tone: 'DEFAULT', actions: [openRadar] }],
    confirmation: {
      confirmationId: `radar-preferences-${contextVersion.slice(0, 12)}-1`, version: 1,
      title: 'Save these notification settings?',
      description: 'They apply to Home Event Radar notifications for this home, for you only.',
      fields: after.map(({ label, value }) => ({ label, value })),
      editableFields: [], confirmLabel: 'Save settings',
      consentText: 'I want Home Event Radar to use these notification settings for me.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [radarPreferencesCaptureRequest(contextVersion, radarPreferencesAnswer(body), true)],
    suggestions: [],
  };
}

async function homeEventRadarPreferencesResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const declared = launchContext?.operationId === 'HOME_EVENT_RADAR_PREFERENCES' && launchContext.surface !== 'ASK_REFRESH' && message.trim() === RADAR_PREFERENCES_MESSAGE;
  if (!declared) return radarWriteBoundary(propertyId, 'Open notification settings from your radar feed', 'Use "Notification settings" on your Home Event Radar feed to change them here. Nothing was changed.', 'NOT_APPLICABLE');
  // Domain commands have no VIEWER floor, so this is stricter than the traditional page (FRD v1.41).
  if (access.role === HouseholdRole.VIEWER) return radarWriteBoundary(propertyId, 'Change these in Home Event Radar', 'In Ask, a contributor or owner can change radar notification settings. You can still change yours on the Home Event Radar page. Nothing was changed.');
  return radarPreferencesFormResult(userId, propertyId, undefined, launchContext?.sourceExecutionId ?? null);
}

registerCapabilityHandler('home-event-radar.preferences', async (envelope) => homeEventRadarPreferencesResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('home-event-radar.feed', async (envelope) => homeEventRadarFeedResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.continuationCursor));
