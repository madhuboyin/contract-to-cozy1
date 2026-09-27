import type { Page } from '@playwright/test';
import { askApiOrigin as apiOrigin, assertAskAuthenticated as assertAuthenticated, fulfillAskRoute as fulfill, propertyId } from './fixtures';

// Radar R-3 (FRD v1.134): the Home Event Radar journey fixture. It mirrors the producer's shape after R-1 and R-2 (counted headline, chips,
// priority-ordered sections, view state, declared chips with authoritative source availability, the recorded-information boundary) and a small
// state machine for the per-user writes, so the acceptance journey exercises the calm shell against the same anatomy the handler emits.
// Layered over installAskApi: routes registered here win, and anything else falls back to it. Browser behavior against the producer's shape,
// not a live backend.
type Lifecycle = 'now' | 'upcoming' | 'recently_ended';
type Family = 'weather' | 'air_quality' | 'utility' | 'disaster' | 'tax' | 'insurance';
type UserState = 'new' | 'saved' | 'dismissed' | 'acted_on';
interface View { lifecycle: Lifecycle | null; family: Family | null; dismissed: boolean; revision: number }

export interface RadarJourneyOptions {
  viewer?: boolean; empty?: boolean; partial?: boolean; detailAccessLost?: boolean; removedEvent?: boolean;
  confirmDenied?: boolean; unknownOutcomeOnce?: boolean; failFirstAsk?: boolean; failFirstRefinement?: boolean;
}

const LIFECYCLE_ORDER: Lifecycle[] = ['now', 'upcoming', 'recently_ended'];
const BAND_ORDER = ['high', 'medium', 'low'];
const FAMILY_LABEL: Record<Family, string> = { weather: 'Weather', air_quality: 'Air quality', utility: 'Utility', disaster: 'Disaster', tax: 'Tax', insurance: 'Insurance' };
const FAMILIES = Object.keys(FAMILY_LABEL) as Family[];
const LIFECYCLE_LABEL: Record<Lifecycle, string> = { now: 'Happening now', upcoming: 'Upcoming', recently_ended: 'Recently ended' };
const LIFECYCLE_ADJECTIVE: Record<Lifecycle, string> = { now: 'current', upcoming: 'upcoming', recently_ended: 'recently ended' };
const TIMING_MESSAGE: Record<Lifecycle | 'all', string> = {
  all: 'Now show events at any time', now: 'Only show events happening now', upcoming: 'Only show upcoming events', recently_ended: 'Only show recently ended events',
};

export const RADAR_JOURNEY_EVENTS = [
  { id: 'radar-heat', title: 'Heat advisory', family: 'weather' as Family, lifecycle: 'now' as Lifecycle, band: 'high', initial: 'new' as UserState, summary: 'A heat advisory is in effect until this evening.' },
  { id: 'radar-air', title: 'Air quality alert', family: 'air_quality' as Family, lifecycle: 'now' as Lifecycle, band: 'medium', initial: 'new' as UserState, summary: 'Air quality is unhealthy for sensitive groups today.' },
  { id: 'radar-boil', title: 'Boil water notice', family: 'utility' as Family, lifecycle: 'upcoming' as Lifecycle, band: 'medium', initial: 'new' as UserState, summary: 'A precautionary boil water notice starts tomorrow.' },
  { id: 'radar-flood', title: 'Flood watch', family: 'weather' as Family, lifecycle: 'recently_ended' as Lifecycle, band: 'low', initial: 'new' as UserState, summary: 'The flood watch for this area has ended.' },
  { id: 'radar-outage', title: 'Planned power outage', family: 'utility' as Family, lifecycle: 'now' as Lifecycle, band: 'low', initial: 'dismissed' as UserState, summary: 'A planned outage was scheduled for this street.' },
];
type EventRow = (typeof RADAR_JOURNEY_EVENTS)[number];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const act = (id: string, label: string, message: string, operationId: string, style: 'PRIMARY' | 'SECONDARY' = 'SECONDARY') => ({ id, label, message, style, interactionType: 'MUTATE_RECORD', operationId });
function itemActions(state: UserState, viewer: boolean) {
  const all = [
    act('radar-save', 'Save', 'Save this monitored event.', 'HOME_EVENT_RADAR_STATE'),
    act('radar-unsave', 'Remove from saved', 'Remove this monitored event from saved.', 'HOME_EVENT_RADAR_STATE'),
    act('radar-dismiss', 'Dismiss', 'Dismiss this monitored event.', 'HOME_EVENT_RADAR_STATE'),
    act('radar-restore', 'Restore', 'Restore this dismissed monitored event.', 'HOME_EVENT_RADAR_STATE'),
    ...(!viewer ? [
      act('radar-mark-done', 'Mark done', 'Mark this monitored event as done.', 'HOME_EVENT_RADAR_MARK_DONE', 'PRIMARY'),
      act('radar-feedback', 'Send feedback', 'Send feedback on this monitored event.', 'HOME_EVENT_RADAR_FEEDBACK'),
      act('radar-plan-task', 'Plan this action', 'Plan this recommended action from a monitored event.', 'HOME_EVENT_RADAR_TASK'),
    ] : []),
  ];
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

export async function installRadarJourney(page: Page, options: RadarJourneyOptions = {}) {
  const states = new Map<string, UserState>(RADAR_JOURNEY_EVENTS.map((event) => [event.id, event.initial]));
  const bodies: Array<Record<string, unknown>> = [];
  const confirmBodies: Array<Record<string, unknown>> = [];
  const captureBodies: Array<Record<string, unknown>> = [];
  const editBodies: Array<Record<string, unknown>> = [];
  let view: View | null = null;
  let session = 'ask-acceptance-session';
  let stateReceipts = 0;
  let confirmCalls = 0;
  let askFailed = false;
  let refinementFailed = false;
  let target: EventRow = RADAR_JOURNEY_EVENTS[0];
  const stateOf = (event: EventRow) => states.get(event.id) ?? 'new';
  const eventsFor = (state: View) => RADAR_JOURNEY_EVENTS
    .filter((event) => (!state.lifecycle || event.lifecycle === state.lifecycle) && (!state.family || event.family === state.family) && (state.dismissed || stateOf(event) !== 'dismissed'))
    .sort((left, right) => LIFECYCLE_ORDER.indexOf(left.lifecycle) - LIFECYCLE_ORDER.indexOf(right.lifecycle) || BAND_ORDER.indexOf(left.band) - BAND_ORDER.indexOf(right.band));
  const href = (matchId?: string) => `/dashboard/properties/${propertyId}/tools/home-event-radar${matchId ? `?matchId=${matchId}` : ''}`;
  const common = () => ({
    schemaVersion: '1.0', sessionId: session, property: { id: propertyId, label: 'Acceptance Home' }, skill: null, skillHandoff: null, captureRequests: [], clarification: null,
    childExecutions: [], originalResponse: null, confirmation: null, contextVersion: 'radar-journey-v1', suggestions: [] as string[],
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  function feed(state: View) {
    const boundary = { type: 'BOUNDARY', id: 'radar-feed-boundary', title: 'Recorded information only', body: 'These are events from the monitoring sources registered for your property address. This is not an emergency alert service and does not confirm that nothing else is happening. In an emergency, follow official local guidance.', severity: 'INFO', suggestions: [] };
    const partialBoundary = { type: 'BOUNDARY', id: 'home-event-radar-partial', title: 'Monitoring only partially covers this property', body: 'Only some registered monitoring sources cover this property, so this may not reflect every current event.', severity: 'INFO', suggestions: ['Ask again later'] };
    const operation = { id: 'HOME_EVENT_RADAR_FEED', version: '1.0', family: 'RECORD_QUERY' };
    if (options.empty) {
      return { ...common(), executionId: 'execution-radar-journey-empty', question: 'Show my radar journey', status: 'ANSWERED', operation, viewState: null, blocks: [{
        type: 'EMPTY_STATE', id: 'home-event-radar-empty', title: 'No monitored events recorded yet',
        body: 'Home Event Radar has not recorded any monitored events for this property yet -- confirm your property address to enable monitoring. Dismissed events are hidden.',
        actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: href(), style: 'SECONDARY' }],
      }] };
    }
    const matched = eventsFor(state);
    const total = matched.length;
    const life = (value: Lifecycle) => matched.filter((event) => event.lifecycle === value).length;
    const scope = [state.lifecycle ? LIFECYCLE_ADJECTIVE[state.lifecycle] : null, state.family ? FAMILY_LABEL[state.family].toLowerCase() : null].filter(Boolean).join(' ');
    let headline: string;
    if (total === 0) headline = 'No monitored events match these filters.';
    else if (!state.lifecycle && life('now') > 0) headline = `${count(life('now'), 'event is', 'events are')} happening now.`;
    else if (!state.lifecycle) headline = `Nothing is happening now; ${[life('upcoming') ? `${life('upcoming')} upcoming` : null, life('recently_ended') ? `${life('recently_ended')} recently ended` : null].filter(Boolean).join(' and ')}.`;
    else headline = `${total} ${scope ? `${scope} ` : ''}${scope ? (total === 1 ? 'event' : 'events') : (total === 1 ? 'monitored event' : 'monitored events')}.`.replace(/\s+/g, ' ');
    const high = matched.filter((event) => event.band === 'high').length;
    const saved = matched.filter((event) => stateOf(event) === 'saved').length;
    const chips = total === 0 ? [] : [
      ...(high ? [{ label: `${high} high priority`, tone: 'CRITICAL' }] : []),
      ...(!state.lifecycle && life('now') ? [{ label: `${life('now')} happening now`, tone: 'CAUTION' }] : []),
      ...(!state.lifecycle && life('upcoming') ? [{ label: `${life('upcoming')} upcoming`, tone: 'DEFAULT' }] : []),
      ...(!state.lifecycle && life('recently_ended') ? [{ label: `${life('recently_ended')} recently ended`, tone: 'DEFAULT' }] : []),
      ...(saved ? [{ label: `${saved} saved`, tone: 'DEFAULT' }] : []),
    ];
    const available = FAMILIES.filter((family) => RADAR_JOURNEY_EVENTS.some((event) => event.family === family && (!state.lifecycle || event.lifecycle === state.lifecycle) && (state.dismissed || stateOf(event) !== 'dismissed')));
    const chipOf = (id: string, label: string, message: string, active: boolean) => ({ id, label, message, active });
    const narrowed = Boolean(state.lifecycle || state.family || state.dismissed);
    const filters = [
      chipOf('radar-lifecycle-all', 'Any time', TIMING_MESSAGE.all, state.lifecycle === null),
      ...LIFECYCLE_ORDER.map((value) => chipOf(`radar-lifecycle-${value}`, LIFECYCLE_LABEL[value], TIMING_MESSAGE[value], state.lifecycle === value)),
      chipOf('radar-family-all', 'All sources', 'Now show events from all sources', state.family === null),
      ...FAMILIES.filter((family) => family === state.family || available.includes(family)).sort().map((family) => chipOf(`radar-family-${family}`, FAMILY_LABEL[family], `Only show ${FAMILY_LABEL[family].toLowerCase()} events`, state.family === family)),
      chipOf('radar-hide-dismissed', 'Hide dismissed', 'Now show events without dismissed ones', !state.dismissed),
      chipOf('radar-include-dismissed', 'Include dismissed', 'Now show events including dismissed ones', state.dismissed),
      ...(narrowed ? [chipOf('radar-clear-all', 'Clear filters', 'Now show all events with no filters', false)] : []),
    ];
    const grouped = new Map<Family, EventRow[]>();
    for (const event of matched) grouped.set(event.family, [...(grouped.get(event.family) ?? []), event]);
    const sections = total === 0 ? [{ id: 'radar-no-match', title: 'No matching events', count: 0, items: [] }] : [...grouped.entries()].map(([family, rows]) => ({
      id: `radar-${family}`, title: FAMILY_LABEL[family], count: rows.length,
      items: rows.map((event) => ({ id: event.id, title: event.title, description: event.summary, meta: [event.band, 'National Weather Service'], status: stateOf(event), href: href(event.id), entityType: 'RADAR_MATCH', actions: itemActions(stateOf(event), Boolean(options.viewer)) })),
    }));
    const partial = Boolean(options.partial);
    return {
      ...common(), executionId: `execution-radar-journey-${state.revision}`, ...(state.revision > 1 ? { continuesExecutionId: `execution-radar-journey-${state.revision - 1}` } : {}),
      question: state.revision === 1 ? 'Show my radar journey' : 'Refined events', status: partial ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', operation,
      viewState: { resultId: 'radar-journey-result', statusFilter: state.lifecycle ?? 'ALL', domainScopePhrase: state.family ?? 'ALL', dateScopePhrase: state.dismissed ? 'INCLUDE_DISMISSED' : null, selectedTaskId: null, revision: state.revision },
      blocks: [
        { type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events', body: `${count(total, 'monitored event', 'monitored events')} from Home Event Radar.`, tone: 'DEFAULT', headline,
          ...(total ? { supportLine: `Most important: ${matched[0].title}.` } : {}), chips, actions: [] },
        { type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters, sections,
          presentation: { pattern: 'DECK', swipeRightActionId: 'radar-save', swipeLeftActionId: 'radar-dismiss' },
          description: `This is the same canonical feed the Home Event Radar page reads, grouped by source.${state.dismissed ? '' : ' Dismissed events are hidden.'}`,
          actions: [...(options.viewer ? [] : [{ id: 'radar-notification-settings', label: 'Notification settings', message: 'Change my Home Event Radar notification settings.', interactionType: 'START_WORKFLOW', operationId: 'HOME_EVENT_RADAR_PREFERENCES', style: 'SECONDARY' }]), { id: 'open-radar', label: 'Open Home Event Radar', href: href(), style: 'SECONDARY' }] },
        partial ? partialBoundary : boundary,
      ],
    };
  }

  function stateReceipt(message: string) {
    stateReceipts += 1;
    const next = /^Save/.test(message) ? 'saved' : /^Remove/.test(message) ? 'new' : /^Dismiss/.test(message) ? 'dismissed' : 'new';
    const previous = stateOf(target);
    states.set(target.id, next as UserState);
    const title = /^Save/.test(message) ? 'Event saved' : /^Remove/.test(message) ? 'Removed from saved' : /^Dismiss/.test(message) ? 'Event dismissed' : 'Event restored';
    return { ...common(), executionId: `execution-radar-journey-state-${stateReceipts}`, question: message, status: 'COMPLETED', operation: { id: 'HOME_EVENT_RADAR_STATE', version: '1.0', family: 'COMMAND' },
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `radar-state-${target.id}-${stateReceipts}`, title, status: 'COMPLETED', description: 'This changes Home Event Radar for you only; other household members keep their own view.',
        details: [{ label: 'Event', value: target.title }, { label: 'Previous state', value: previous }, { label: 'Current state', value: next }],
        actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: href(target.id), style: 'SECONDARY' }] }],
      suggestions: ['Show my radar journey'] };
  }

  const confirmation = (stage: 'REVIEW' | 'RUNNING' | 'DONE', kind: 'done' | 'feedback' | 'task' | 'prefs', extra: Record<string, unknown> = {}) => {
    const spec = {
      done: { id: 'execution-radar-journey-done', question: 'Mark this monitored event as done.', operation: 'HOME_EVENT_RADAR_MARK_DONE', title: `Mark "${target.title}" as done?`, description: 'Marking an event done also asks Home Event Radar to recheck your property risk.', label: 'Mark done', consent: 'I have dealt with this event.', receipt: 'Event marked done', fields: [{ label: 'Event', value: target.title }] },
      feedback: { id: 'execution-radar-journey-feedback', question: 'Send feedback on this monitored event.', operation: 'HOME_EVENT_RADAR_FEEDBACK', title: `Send feedback on "${target.title}"?`, description: 'Feedback helps Home Event Radar match events to this home.', label: 'Send feedback', consent: 'I want to send this feedback to Home Event Radar.', receipt: 'Feedback sent', fields: [{ label: 'Event', value: target.title }] },
      task: { id: 'execution-radar-journey-task', question: 'Plan this recommended action from a monitored event.', operation: 'HOME_EVENT_RADAR_TASK', title: 'Set a reminder for "Check your cooling and water supply"?', description: 'This adds a task to your maintenance list, linked to this recommended action.', label: 'Set reminder', consent: 'I authorize adding this to the shared maintenance list for this home.', receipt: 'Reminder set', fields: [{ label: 'Event', value: target.title }, { label: 'What happens', value: 'Set a reminder' }] },
      prefs: { id: 'execution-radar-journey-prefs', question: 'Change my Home Event Radar notification settings.', operation: 'HOME_EVENT_RADAR_PREFERENCES', title: 'Save these notification settings?', description: 'These apply to you only.', label: 'Save settings', consent: 'I want Home Event Radar to use these notification settings for me.', receipt: 'Notification settings saved', fields: [{ label: 'Notifications', value: 'On' }, { label: 'Delivery', value: 'Digest' }] },
    }[kind];
    const base = { ...common(), executionId: spec.id, question: spec.question, operation: { id: spec.operation, version: '1.0', family: 'COMMAND' } };
    if (stage === 'DONE') return { ...base, status: 'COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `${spec.id}-receipt`, title: spec.receipt, status: 'COMPLETED', description: 'Home Event Radar has recorded this.', details: spec.fields, actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: href(target.id), style: 'PRIMARY' }] }] };
    return { ...base, status: stage === 'RUNNING' ? 'RUNNING' : 'NEEDS_CONFIRMATION',
      blocks: [{ type: 'SUMMARY', id: `${spec.id}-review`, title: `Review: ${spec.receipt.toLowerCase()}`, body: 'Nothing is changed until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: { confirmationId: `${spec.id}-1`, version: (extra.version as number | undefined) ?? 1, title: spec.title, description: spec.description, fields: spec.fields, confirmLabel: spec.label, consentText: spec.consent, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        editableFields: kind === 'feedback' ? [
          { key: 'feedbackType', label: 'Reason', type: 'SELECT', value: (extra.reason as string | undefined) ?? '', options: [{ label: 'Wrong location', value: 'wrong_location' }, { label: 'Not relevant to my home', value: 'not_relevant' }, { label: 'Duplicate event', value: 'duplicate' }, { label: 'Information is stale', value: 'stale' }, { label: 'Something else', value: 'other' }] },
          { key: 'comment', label: 'Comment (optional, up to 500 characters)', type: 'TEXTAREA', value: (extra.comment as string | undefined) ?? '' },
        ] : [] } };
  };

  const detail = (event: EventRow) => ({
    id: event.id, propertyMatchId: event.id, eventId: `event-${event.id}`, eventType: 'ADVISORY', sourceFamily: event.family, title: event.title, summary: event.summary,
    severity: event.band, impact: 'moderate', confidence: 'high', priorityBand: event.band, priorityScore: 0.8, matchLifecycleStatus: event.lifecycle, sourceFreshnessStatus: 'fresh', sourceFreshnessReason: null,
    isSourceStale: false, isMaterialUpdate: false, lifecycleStatus: event.lifecycle === 'now' ? 'active' : event.lifecycle, effectiveAt: '2026-09-26T12:00:00.000Z', expiresAt: '2026-09-26T22:00:00.000Z',
    sourceName: 'National Weather Service', provider: 'NOAA', userState: stateOf(event), geography: null,
    matchExplanation: { matcherVersion: 'v1', matchedAt: '2026-09-26T11:00:00.000Z', matchType: 'geofence', confidence: 'high', homeownerExplanation: 'This event covers your recorded property location.', reasons: ['Within the advisory area'] },
    impactSummary: 'Expect an effect on this property through this evening.', impactFactors: null, matchedSystems: [],
    recommendedActions: event.id === 'radar-heat' ? [{ code: 'CHECK_COOLING', label: 'Check your cooling and water supply', priority: 'high', registryVersion: 'radar-actions-v1', completionEvidence: 'user_attestation', safetyClassification: 'property_protection', targetCapability: null, supportedTaskOperations: ['create_task', 'create_reminder'], taskLink: null, destination: { kind: 'informational', purpose: null, label: null, href: null } }] : [],
    compoundInsights: [], canonicalUrl: null, observedAt: '2026-09-26T11:00:00.000Z', revision: { observedAt: '2026-09-26T11:00:00.000Z', receivedAt: '2026-09-26T11:00:00.000Z', materialUpdatedAt: null },
    sourceEvidence: { providerEventId: `nws-${event.id}`, providerRevision: '1', revisionIdentity: null }, missingFacts: [], propertyGeographyVersion: 1, matcherVersion: 'v1', relatedIncident: null, relatedGuidance: null,
    resolutionContinuity: { state: 'not_started', incidentState: null, guidanceState: null, continueResolution: null }, userFeedback: null,
  });

  const refine = (message: string, previous: View): View => {
    const next = { ...previous, revision: previous.revision + 1 };
    if (/^now show all events with no filters/i.test(message)) return { ...next, lifecycle: null, family: null, dismissed: false };
    if (/^now show events at any time/i.test(message)) next.lifecycle = null;
    else if (/^only show events happening now/i.test(message)) next.lifecycle = 'now';
    else if (/^only show upcoming events/i.test(message)) next.lifecycle = 'upcoming';
    else if (/^only show recently ended events/i.test(message)) next.lifecycle = 'recently_ended';
    if (/^now show events from all sources/i.test(message)) next.family = null;
    const family = FAMILIES.find((value) => new RegExp(`^only show ${FAMILY_LABEL[value].toLowerCase()} events`, 'i').test(message));
    if (family) next.family = family;
    if (/^now show events including dismissed ones/i.test(message)) next.dismissed = true;
    if (/^now show events without dismissed ones/i.test(message)) next.dismissed = false;
    return next;
  };

  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as { message: string; sessionId?: string; launchContext?: { entityId?: string } } & Record<string, unknown>;
    const message = body.message;
    const isRefinement = view !== null && /^(?:only show|now show)\b/i.test(message);
    const handled = /radar journey/i.test(message) || isRefinement
      || /^(?:Save|Remove|Dismiss|Restore) this (?:dismissed )?monitored event|^Mark this monitored event as done|^Send feedback on this monitored event|^Plan this recommended action from a monitored event|^Change my Home Event Radar notification settings/.test(message);
    if (!handled) return route.fallback();
    assertAuthenticated(route.request());
    bodies.push(body);
    if (typeof body.sessionId === 'string') session = body.sessionId;
    const entityId = body.launchContext?.entityId;
    if (entityId) target = RADAR_JOURNEY_EVENTS.find((event) => event.id === entityId) ?? target;
    if (options.failFirstAsk && !askFailed && /radar journey/i.test(message)) { askFailed = true; return fulfill(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Ask could not answer just now.' } }, 500); }
    if (options.failFirstRefinement && !refinementFailed && isRefinement) { refinementFailed = true; return fulfill(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Ask could not refine just now.' } }, 500); }
    if (/radar journey/i.test(message)) { view = { lifecycle: null, family: null, dismissed: false, revision: 1 }; return fulfill(route, { success: true, data: feed(view) }, 201); }
    if (isRefinement) { view = refine(message, view!); return fulfill(route, { success: true, data: feed(view) }, 201); }
    if (/^Mark this/.test(message)) return fulfill(route, { success: true, data: confirmation('REVIEW', 'done') }, 201);
    if (/^Send feedback/.test(message)) return fulfill(route, { success: true, data: confirmation('REVIEW', 'feedback') }, 201);
    if (/^Plan this/.test(message)) return fulfill(route, { success: true, data: confirmation('REVIEW', 'task') }, 201);
    if (/^Change my Home Event Radar/.test(message)) return fulfill(route, { success: true, data: confirmation('REVIEW', 'prefs') }, 201);
    return fulfill(route, { success: true, data: stateReceipt(message) }, 201);
  });

  for (const [kind, id] of [['done', 'execution-radar-journey-done'], ['feedback', 'execution-radar-journey-feedback'], ['task', 'execution-radar-journey-task'], ['prefs', 'execution-radar-journey-prefs']] as const) {
    await page.route(`${apiOrigin}/api/ask/executions/${id}/confirm/edit`, async (route) => {
      assertAuthenticated(route.request());
      const edits = route.request().postDataJSON() as { confirmationVersion: number; edits: Record<string, string> };
      editBodies.push(edits);
      await fulfill(route, { success: true, data: confirmation('REVIEW', kind, { version: edits.confirmationVersion + 1, reason: edits.edits.feedbackType, comment: edits.edits.comment }) });
    });
    await page.route(`${apiOrigin}/api/ask/executions/${id}/confirm`, async (route) => {
      assertAuthenticated(route.request());
      confirmBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      confirmCalls += 1;
      if (options.confirmDenied) return fulfill(route, { success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'A contributor or owner must do this.' } }, 403);
      // The first confirm's outcome is not known (the write may or may not have finished); a status check settles it.
      if (options.unknownOutcomeOnce && confirmCalls === 1) return fulfill(route, { success: true, data: confirmation('RUNNING', kind) });
      if (kind === 'done') states.set(target.id, 'acted_on');
      return fulfill(route, { success: true, data: confirmation('DONE', kind) });
    });
  }
  await page.route(`${apiOrigin}/api/properties/${propertyId}/radar/events/*`, async (route) => {
    assertAuthenticated(route.request());
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    if (options.detailAccessLost) return fulfill(route, { success: false, error: { code: 'PROPERTY_ACCESS_DENIED', message: 'Property not found or access denied.' } }, 404);
    const event = RADAR_JOURNEY_EVENTS.find((entry) => entry.id === id);
    if (!event || (options.removedEvent && id === 'radar-heat')) return fulfill(route, { success: false, error: { code: 'RADAR_MATCH_NOT_FOUND', message: 'This event is no longer available.' } }, 404);
    await fulfill(route, { success: true, data: detail(event) });
  });

  return { bodies, confirmBodies, captureBodies, editBodies, setState: (id: string, next: UserState) => states.set(id, next), stateOf: (id: string) => states.get(id) };
}
