import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = 'ask-property-fixture';
export const otherPropertyId = 'ask-other-property-fixture';
const apiOrigin = 'http://localhost:8080';

function capabilityExecution(unavailable = false) {
  const capability = {
    id: 'mortgage-refinance-radar', label: 'Mortgage Refinance Radar',
    description: 'Watch this mortgage for a refinance opportunity and compare the real tradeoffs.',
    expectedOutput: 'A property-specific opportunity conclusion and recorded refinance decision.',
    href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`,
    inlineLaunch: null,
    inlineBoundary: 'This tool’s full journey is not available inside Ask Cozy yet.',
    readiness: unavailable ? 'UNAVAILABLE' : 'NEEDS_CONTEXT',
    readinessLabel: unavailable ? 'Not ready for the current context' : 'More home details will improve the result',
    readinessReasons: unavailable ? ['This tool is disabled by the current rollout policy.'] : ['Add current mortgage facts before running a comparison.'],
    releaseStage: 'ACTIVE',
  };
  return {
    schemaVersion: '1.0', executionId: `execution-capability-${unavailable ? 'unavailable' : 'ready'}`, sessionId: 'ask-acceptance-session', question: 'Is there a tool to help with refinancing?',
    status: unavailable ? 'UNAVAILABLE' : 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: 'CAPABILITY_DISCOVERY', version: '1.0', family: 'CAPABILITY_DISCOVERY' },
    contextVersion: 'capability-context-v1', blocks: unavailable
      ? [{ type: 'CAPABILITY_LIST', id: 'unavailable-capability', title: 'Requested tool availability', description: 'Unavailable tools are never presented as launchable.', capabilities: [capability] }]
      : [
        { type: 'CAPABILITY_LIST', id: 'capability-matches', title: 'Best match for your goal', description: 'Ranked from reviewed homeowner language.', capabilities: [capability] },
        { type: 'CAPABILITY_LIST', id: 'related-capabilities', title: 'Related tools for what comes next', description: 'Filtered for this home.', capabilities: [{ ...capability, id: 'break-even', label: 'Break-Even', href: `/dashboard/properties/${propertyId}/tools/break-even`, readiness: 'READY', readinessLabel: 'Ready for this home', readinessReasons: [] }] },
      ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: ['What information does this tool need?'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function heatPreparationExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-heat-preparation', sessionId: 'ask-acceptance-session',
    question: 'How should I prepare for the multi-day heat risk at this home?',
    status: 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_ACTIONS', version: '1.0', family: 'STATUS_SUMMARY' },
    contextVersion: 'heat-context-v1',
    blocks: [
      { type: 'SUMMARY', id: 'focused-home-action-summary', title: 'Multi-day heat risk ahead', body: 'Three days may reach 95°F or higher. This home uses central cooling.', tone: 'CAUTION', actions: [] },
      {
        type: 'GROUPED_LIST', filters: [], id: 'focused-home-action-guidance', title: 'Prepare this home',
        description: 'Due Aug 20, 2026. These steps come from the preparation plan for this home.',
        sections: [
          { id: 'next-step', title: 'Preparation checklist', count: 3, items: [
            { id: 'heat-step-1', title: 'Inspect the HVAC filter before the heat arrives.', description: null, meta: ['Step 1'], status: null, href: null },
            { id: 'heat-step-2', title: 'Keep the outdoor condenser area clear.', description: null, meta: ['Step 2'], status: null, href: null },
            { id: 'heat-step-3', title: 'Use shades and avoid peak-hour heat-generating activities.', description: null, meta: ['Step 3'], status: null, href: null },
          ] },
          { id: 'why-it-matters', title: 'Why this matters for this home', count: 1, items: [{ id: 'heat-why', title: 'Sustained heat increases cooling demand.', description: 'The recorded cooling system will run longer during the forecast window.', meta: [], status: null, href: null }] },
        ],
        actions: [{ id: 'open-heat-checklist', label: 'Open preparation checklist', href: `/dashboard/properties/${propertyId}/environment-report/preparation?insightId=heat-1`, style: 'PRIMARY' }],
      },
      { type: 'EVIDENCE', id: 'heat-evidence', title: 'Evidence for this guidance', items: [{ label: 'Local heat forecast', source: 'Open-Meteo forecast and property profile', observedAt: '2026-08-14T12:00:00.000Z' }] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function propertySummaryTimelineExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-property-summary', sessionId: 'ask-acceptance-session',
    question: 'Give me a summary of my home record.', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'PROPERTY_SUMMARY', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: 'property-summary-context-v1',
    blocks: [{
      type: 'SUMMARY', id: 'property-summary', title: 'Here is the current Living Home Record for Acceptance Home',
      body: 'Recent verified home activity is available below.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'property-recent-events', title: 'Recent verified home activity', filters: [],
      description: 'One current confirmed or evidence-verified event is visible to you.',
      sections: [{ id: 'recent-events', title: 'Home Timeline', count: 1, items: [{
        id: 'event-property-summary', title: 'Roof replacement', entityType: 'HOME_EVENT', description: null,
        meta: ['Sep 1, 2026', 'improvement', 'evidence verified', 'home record'], status: 'EVIDENCE_VERIFIED', href: null,
      }] }],
      actions: [{ id: 'open-home-timeline', label: 'Open home timeline', href: `/dashboard/properties/${propertyId}/timeline`, style: 'SECONDARY' }],
    }, {
      type: 'GROUPED_LIST', id: 'property-rooms', title: 'Rooms', filters: [],
      description: 'Select a room to inspect its current canonical details without leaving Ask Cozy.',
      sections: [{ id: 'rooms', title: 'Recorded rooms', count: 1, items: [{
        id: 'room-property-summary', title: 'Kitchen', entityType: 'INVENTORY_ROOM', description: null,
        meta: ['Kitchen', 'Updated Sep 18, 2026'], status: null, href: null,
      }] }],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${propertyId}/rooms`, style: 'SECONDARY' }],
    }, {
      type: 'GROUPED_LIST', id: 'property-documents', title: 'Documents', filters: [],
      description: 'Select a document to inspect its current canonical details without leaving Ask Cozy.',
      sections: [{ id: 'documents', title: 'Recorded documents', count: 1, items: [{
        id: 'document-property-summary', title: 'Homeowners policy declaration', entityType: 'DOCUMENT', description: null,
        meta: ['Insurance certificate', 'Uploaded Sep 10, 2026'], status: 'VERIFIED', href: null,
      }] }],
      actions: [{ id: 'open-documents', label: 'Open Documents', href: `/dashboard/documents?propertyId=${propertyId}`, style: 'SECONDARY' }],
    }, {
      // Read-only, like Documents: no per-member mutation operation exists, so no item declares actions.
      // 'member-departed' is deliberately absent from the household/members canonical mock below -- it exists
      // only in this list, exercising the "no longer a member" data-absence state (never an HTTP 404, unlike
      // every other entity's not-found path -- see HouseholdMemberDetail's own comment on this).
      type: 'GROUPED_LIST', id: 'property-household', title: 'Household access', filters: [],
      description: 'Select a household member to inspect their current canonical role without leaving Ask Cozy.',
      sections: [{ id: 'household', title: 'Household members', count: 2, items: [
        { id: 'member-property-summary', title: 'Jordan Reyes', description: null, entityType: 'HOUSEHOLD_MEMBER', href: null, status: 'PRIMARY OWNER', meta: ['Owner', 'Joined Jun 1, 2025'] },
        { id: 'member-departed', title: 'Alex Departed', description: null, entityType: 'HOUSEHOLD_MEMBER', href: null, status: null, meta: ['Contributor', 'Joined Feb 3, 2024'] },
      ] }],
      actions: [{ id: 'open-household', label: 'Open household access', href: `/dashboard/properties/${propertyId}/household`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: true, entity: false, homeRecord: true, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z',
  };
}

// Home Capital Timeline reference journey (FRD Appendix D): both inline-detail slices exercised here --
// reserve-allocations (first slice, a GROUPED_LIST) and capital-timeline-table (the TABLE-block row-click-to-detail
// platform capability, second slice). The real response also has an EVIDENCE block
// (askOrchestrator.service.ts's capitalReservePlanResult), trimmed here since neither slice touches it.
// horizonYears mirrors the real capitalReservePlanResult's own horizon re-run behavior (FRD Appendix D
// planning/refinement follow-up): only the horizon NOT currently shown gets an action, matching a two-state
// toggle rather than two redundant buttons.
function capitalReservePlanExecution({ horizonYears = 10 as 5 | 10 } = {}) {
  return {
    // A distinct id for the 5-year re-run response (a real backend would mint a fresh executionId per turn too)
    // so it appends as its own article instead of colliding with the initial 10-year response's.
    schemaVersion: '1.0', executionId: horizonYears === 5 ? 'execution-capital-reserve-plan-5yr' : 'execution-capital-reserve-plan', sessionId: 'ask-acceptance-session',
    question: 'Create a capital reserve plan for future replacements.', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'CAPITAL_RESERVE_PLAN', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: 'capital-reserve-plan-v1',
    blocks: [{
      type: 'SUMMARY', id: 'capital-reserve-summary', title: '1 upcoming capital event is in the current plan',
      body: `The modeled cost range for the displayed ${horizonYears}-year horizon is $1,000–$1,400. The canonical reserve plan currently suggests $25 per month and records a $0 shortfall.`,
      tone: 'DEFAULT', actions: [
        { id: 'open-timeline', label: 'Open capital timeline', href: `/dashboard/properties/${propertyId}/tools/capital-timeline`, style: 'PRIMARY' },
        { id: 'open-reserve', label: 'Open reserve fund', href: `/dashboard/properties/${propertyId}/tools/reserve-fund`, style: 'SECONDARY' },
        ...(horizonYears !== 5 ? [{ id: 'rerun-horizon-5', label: 'Show 5-year horizon', interactionType: 'START_WORKFLOW', message: 'Show my capital reserve plan for a 5-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' }] : []),
        ...(horizonYears !== 10 ? [{ id: 'rerun-horizon-10', label: 'Show 10-year horizon', interactionType: 'START_WORKFLOW', message: 'Show my capital reserve plan for a 10-year horizon.', operationId: 'CAPITAL_RESERVE_PLAN', style: 'SECONDARY' }] : []),
      ],
    }, {
      // capital-timeline-table row-click-to-detail platform capability (FRD Appendix D): its own row (a
      // different item than reserve-allocations' "Water heater" below, deliberately, so the two blocks'
      // detail-trigger buttons in the same response never collide on accessible name), exercised inline
      // via TableBlock.tsx's dispatch. Row id matches capitalReservePlanResult's real HomeCapitalTimelineItem.id.
      type: 'TABLE', id: 'capital-timeline-table', title: 'Upcoming capital windows',
      description: 'The next 12 planning windows across your capital timeline.',
      columns: [{ key: 'item', label: 'Item' }, { key: 'window', label: 'Planning window' }, { key: 'cost', label: 'Estimated range' }, { key: 'confidence', label: 'Confidence' }],
      rows: [{ id: 'timeline-roof-property-summary', values: { item: 'Roof replacement', window: 'Jan 2027 – Jun 2027', cost: '$7,800 – $11,600', confidence: 'High' } }],
      totalCount: 1, actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'reserve-allocations', title: 'Active reserve allocations', filters: [],
      description: 'Allocated amounts are derived from timeline items and the homeowner’s reserve posture.',
      sections: [{ id: 'allocations', title: 'Funding plan', count: 1, items: [
        { id: 'line-property-summary', title: 'Water heater', entityType: 'RESERVE_LINE_ITEM', description: '$25/month toward $1,200', meta: ['active'], status: 'ACTIVE', href: `/dashboard/properties/${propertyId}/tools/reserve-fund` },
      ] }],
      actions: [{ id: 'open-reserve-fund', label: 'Open Reserve Fund', href: `/dashboard/properties/${propertyId}/tools/reserve-fund`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
  };
}

// Capability-card audit (FRD Appendix D), second reference journey. Real
// response also groups by every sourceFamily the feed returns; trimmed to
// one section here since that's all this slice's scenario exercises.
// FRD v1.40: filter chips + the per-user write actions the real homeEventRadarFeedResult declares (the inline
// detail shows the ones valid for the live state). `happeningNow` is the chip-refined variant, with a distinct
// executionId so it appends as its own article.
const RADAR_ITEM_ACTIONS = [
  { id: 'radar-save', label: 'Save', message: 'Save this monitored event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_STATE' },
  { id: 'radar-unsave', label: 'Remove from saved', message: 'Remove this monitored event from saved.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_STATE' },
  { id: 'radar-dismiss', label: 'Dismiss', message: 'Dismiss this monitored event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_STATE' },
  { id: 'radar-restore', label: 'Restore', message: 'Restore this dismissed monitored event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_STATE' },
  { id: 'radar-mark-done', label: 'Mark done', message: 'Mark this monitored event as done.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_MARK_DONE' },
  { id: 'radar-feedback', label: 'Send feedback', message: 'Send feedback on this monitored event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_FEEDBACK' },
  // FRD v1.41: rendered once per plannable recommended action in the detail, not as its own button.
  { id: 'radar-plan-task', label: 'Plan this action', message: 'Plan this recommended action from a monitored event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_RADAR_TASK' },
];
function radarFilterChips(happeningNow: boolean) {
  return [
    { id: 'radar-lifecycle-all', label: 'Any time', message: 'Show my home event radar feed.', active: !happeningNow },
    { id: 'radar-lifecycle-now', label: 'Happening now', message: 'Show my home event radar feed happening now.', active: happeningNow },
    { id: 'radar-family-all', label: 'All sources', message: `Show my home event radar feed${happeningNow ? ' happening now' : ''}.`, active: true },
    { id: 'radar-family-weather', label: 'Weather', message: `Show my home event radar feed for weather events${happeningNow ? ' happening now' : ''}.`, active: false },
    { id: 'radar-hide-dismissed', label: 'Hide dismissed', message: `Show my home event radar feed${happeningNow ? ' happening now' : ''}.`, active: true },
    { id: 'radar-include-dismissed', label: 'Include dismissed', message: `Show my home event radar feed${happeningNow ? ' happening now' : ''}, including dismissed.`, active: false },
  ];
}
function radarStateReceiptExecution(sessionId?: string) {
  return {
    schemaVersion: '1.0', executionId: 'execution-radar-state-save', sessionId: sessionId ?? 'ask-acceptance-session',
    question: 'Save this monitored event.', status: 'COMPLETED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_EVENT_RADAR_STATE', version: '1.0', family: 'COMMAND' }, contextVersion: null,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'radar-state-match-property-summary', title: 'Event saved', status: 'COMPLETED',
      description: 'This changes Home Event Radar for you only; other household members keep their own view.',
      details: [{ label: 'Event', value: 'severe thunderstorm warning' }, { label: 'Previous state', value: 'New' }, { label: 'Current state', value: 'Saved' }],
      actions: [{ id: 'open-radar', label: 'Open in Home Event Radar', href: `/dashboard/properties/${propertyId}/tools/home-event-radar?matchId=match-property-summary`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: ['Show my home event radar feed'], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
  };
}
// FRD v1.41 "Plan this action": form -> review -> receipt. Shapes mirror radarTaskFormResult / confirmHomeEventRadarTask.
function radarTaskExecution(stage: 'FORM' | 'CONFIRMATION' | 'DONE', sessionId?: string, answer: Record<string, unknown> = {}) {
  const captureRequest = (requirementId: string, current: Record<string, unknown>) => ({
    requirementId, captureKey: 'HOME_EVENT_RADAR_TASK_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Plan this action', question: 'How would you like to plan "Secure outdoor furniture and loose items"?', helpText: 'You will review everything before a task is added or linked.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'operation', label: 'What to do', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Add a maintenance task', value: 'create_task' }, { label: 'Set a reminder', value: 'create_reminder' }] } },
      { key: 'dueDate', label: 'Due date', required: false, when: { fieldKey: 'operation', operator: 'NOT_EQUALS', value: 'link_existing_task' }, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
      { key: 'dueTime', label: 'Due time', required: false, when: { fieldKey: 'operation', operator: 'NOT_EQUALS', value: 'link_existing_task' }, inputSchema: { type: 'TIME' } },
      { key: 'assigneeUserId', label: 'Assign to', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Unassigned', value: 'UNASSIGNED' }, { label: 'Alex Kim', value: 'user-alex' }] } },
    ] },
    currentAnswer: current, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this task; nothing is added or linked until you confirm', confirmationText: null,
    expectedContextVersion: 'radar-task-context-v1',
  });
  const common = {
    schemaVersion: '1.0', executionId: 'execution-radar-task', sessionId: sessionId ?? 'ask-acceptance-session',
    question: 'Plan this recommended action from a monitored event.', property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_EVENT_RADAR_TASK', version: '1.0', family: 'COMMAND' }, contextVersion: 'radar-task-context-v1',
    skill: null, skillHandoff: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: new Date().toISOString(),
  };
  const radarHref = `/dashboard/properties/${propertyId}/tools/home-event-radar?matchId=match-property-summary`;
  if (stage === 'FORM') {
    return { ...common, status: 'NEEDS_CONTEXT', confirmation: null,
      captureRequests: [captureRequest('radar-task-inputs', { operation: null, maintenanceTaskId: null, dueDate: null, dueTime: null, assigneeUserId: 'UNASSIGNED' })],
      blocks: [{ type: 'SUMMARY', id: 'radar-task-input', title: 'Plan "Secure outdoor furniture and loose items"', body: 'For severe thunderstorm warning. Nothing has been added yet. Choose how to plan it, then review before anything is saved.', tone: 'DEFAULT', actions: [] }] };
  }
  if (stage === 'CONFIRMATION') {
    return { ...common, status: 'NEEDS_CONFIRMATION', captureRequests: [captureRequest('radar-task-inputs-entered', answer)],
      blocks: [{ type: 'SUMMARY', id: 'radar-task-review', title: 'Review planning "Secure outdoor furniture and loose items"', body: 'You entered these details. Nothing is added or linked until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: 'radar-task-match-property-summary-SECURE_OUTDOOR_ITEMS-1', version: 1, title: 'Set a reminder for "Secure outdoor furniture and loose items"?',
        description: 'This adds a task to your maintenance list through the same service Home Event Radar uses, linked to this recommended action.',
        fields: [{ label: 'Event', value: 'severe thunderstorm warning' }, { label: 'What happens', value: 'Set a reminder' }, { label: 'Task title', value: 'Reminder: Secure outdoor furniture and loose items' }, { label: 'Due', value: 'Sep 30, 2026, 7:30 AM' }, { label: 'Assigned to', value: 'Alex Kim' }],
        editableFields: [], confirmLabel: 'Set reminder', consentText: 'I authorize adding this to the shared maintenance list for this home.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      } };
  }
  return { ...common, status: 'COMPLETED', captureRequests: [], confirmation: null, blocks: [{
    type: 'WORKFLOW_PROGRESS', id: 'radar-task-match-property-summary-SECURE_OUTDOOR_ITEMS', title: 'Reminder set', status: 'COMPLETED',
    description: 'It is on your maintenance list and linked to this Home Event Radar action.',
    details: [{ label: 'Task', value: 'Reminder: Secure outdoor furniture and loose items' }],
    actions: [{ id: 'open-task', label: 'Open task', href: '/dashboard/maintenance?taskId=task-radar-1', style: 'PRIMARY' }, { id: 'open-radar', label: 'Open in Home Event Radar', href: radarHref, style: 'SECONDARY' }],
  }] };
}
// FRD v1.42 claims capability-card slice: INCIDENT_CLAIM_STATUS's claims-only view and a CLAIM_TRANSITION review.
const CLAIM_ITEM_ACTIONS = [
  ['claim-start', 'Mark in progress', 'Mark this claim as in progress.'],
  ['claim-submit', 'Mark submitted', 'Submit this claim.'],
  ['claim-under-review', 'Mark under review', 'Move this claim to under review.'],
  ['claim-approve', 'Mark approved', 'Mark this claim approved.'],
  ['claim-deny', 'Mark denied', 'Mark this claim denied.'],
  ['claim-close', 'Close claim', 'Close this claim.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'CLAIM_TRANSITION' }));
function claimsExecution(stage: 'LIST' | 'REVIEW', sessionId?: string) {
  const common = {
    schemaVersion: '1.0', sessionId: sessionId ?? 'ask-acceptance-session', property: { id: propertyId, label: 'Acceptance Home' },
    skill: null, skillHandoff: null, captureRequests: [], clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
  };
  const claimHref = `/dashboard/properties/${propertyId}/claims/claim-kitchen-leak`;
  if (stage === 'LIST') {
    return { ...common, executionId: 'execution-claims', question: 'Show my claims', status: 'ANSWERED', confirmation: null, suggestions: [],
      operation: { id: 'INCIDENT_CLAIM_STATUS', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
      blocks: [
        { type: 'SUMMARY', id: 'incident-claim-summary', title: '1 active item needs attention', body: '0 recorded incidents and 1 recorded claim are on file for this home.', tone: 'CAUTION', actions: [{ id: 'open-claims', label: 'Open claims', href: `/dashboard/properties/${propertyId}/claims`, style: 'PRIMARY' }] },
        { type: 'GROUPED_LIST', filters: [], id: 'incident-claim-list', title: 'Claims', actions: [], sections: [{ id: 'active-claims', title: 'Open claims', count: 1, items: [
          { id: 'claim-kitchen-leak', title: 'Kitchen leak', description: 'Acme Insurance · water damage', meta: ['draft'], status: 'DRAFT', href: claimHref, entityType: 'CLAIM', actions: CLAIM_ITEM_ACTIONS },
        ] }] },
      ] };
  }
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  return { ...common, executionId: 'execution-claim-transition', question: 'Submit this claim.', status: 'NEEDS_CONFIRMATION', suggestions: [],
    operation: { id: 'CLAIM_TRANSITION', version: '1.0', family: 'COMMAND' }, contextVersion: 'claim-context-v1',
    blocks: [{ type: 'SUMMARY', id: 'claim-transition-review', title: 'Review the claim status change', body: 'The canonical Claims service will enforce the legal lifecycle.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: 'claim-transition-claim-kitchen-leak-1', version: 1, title: 'Change Kitchen leak to submitted?', description: 'This changes the shared claim record.', fields: [{ label: 'From', value: 'draft' }, { label: 'To', value: 'submitted' }], editableFields: [], confirmLabel: 'Change status', consentText: 'I authorize this claim status change.', expiresAt } };
}
// FRD v1.43 inspection-hub capability-card slice: INSPECTION_FINDINGS and an INSPECTION_FINDING_UPDATE resolve review.
const FINDING_ITEM_ACTIONS = [
  ['finding-accept', 'Accept as work', 'Accept this inspection finding as work.'],
  ['finding-dismiss', 'Dismiss', 'Dismiss this inspection finding.'],
  ['finding-resolve', 'Mark resolved', 'Mark this inspection finding resolved.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'INSPECTION_FINDING_UPDATE' }));
function inspectionExecution(stage: 'LIST' | 'REVIEW', sessionId?: string) {
  const common = {
    schemaVersion: '1.0', sessionId: sessionId ?? 'ask-acceptance-session', property: { id: propertyId, label: 'Acceptance Home' },
    skill: null, skillHandoff: null, captureRequests: [], clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z', suggestions: [],
  };
  if (stage === 'LIST') {
    return { ...common, executionId: 'execution-inspection-findings', question: 'Show my open inspection findings', status: 'ANSWERED', confirmation: null,
      operation: { id: 'INSPECTION_FINDINGS', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
      blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'inspection-findings', title: 'Open inspection findings', description: 'These findings come only from confirmed inspection reports.',
        actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href: `/dashboard/properties/${propertyId}/inspection-hub/open-items`, style: 'SECONDARY' }],
        sections: [{ id: 'open', title: 'Needs review', count: 1, items: [{
          id: 'finding-roof', title: 'ROOF: Missing shingles on the north slope', description: 'major · Pat', meta: ['Disposition: pending review'], status: 'OPEN',
          href: `/dashboard/properties/${propertyId}/inspection-hub/report-roof?findingId=finding-roof`, entityType: 'INSPECTION_FINDING', parentId: 'report-roof', actions: FINDING_ITEM_ACTIONS,
        }] }] }] };
  }
  return { ...common, executionId: 'execution-finding-resolve', question: 'Mark this inspection finding resolved.', status: 'NEEDS_CONFIRMATION',
    operation: { id: 'INSPECTION_FINDING_UPDATE', version: '1.0', family: 'COMMAND' }, contextVersion: 'finding-context-v1',
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-review', title: 'Review resolve action', body: 'Resolving records how this finding was handled.', tone: 'CAUTION', actions: [] }],
    confirmation: { confirmationId: 'inspection-finding-finding-roof-1', version: 1, title: 'Resolve this finding?', description: 'Missing shingles on the north slope',
      fields: [{ label: 'System', value: 'ROOF' }, { label: 'Severity', value: 'major' }, { label: 'Action', value: 'resolve' }],
      editableFields: [
        { key: 'method', label: 'How was this resolved?', type: 'SELECT', value: 'CONTRACTOR_WORK', options: [{ label: 'Contractor work', value: 'CONTRACTOR_WORK' }, { label: 'DIY repair', value: 'DIY' }, { label: 'Seller repair', value: 'SELLER_REPAIR' }, { label: 'Credited at closing', value: 'CREDITED_AT_CLOSING' }, { label: 'Dismissed / not applicable', value: 'DISMISSED' }] },
        { key: 'notes', label: 'Notes (optional)', type: 'TEXTAREA', value: '' },
        { key: 'costCents', label: 'Cost in dollars (optional)', type: 'MONEY', value: '' },
      ],
      confirmLabel: 'Resolve finding', consentText: 'I reviewed this inspection finding and authorize updating its canonical disposition.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}
// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.75): the findings answer as the real producer now sends it to a
// contributor -- a card deck whose Accept/Dismiss decisions are collected and proposed together -- and that batch's
// single review. The breaker finding's live read reuses the report-roof findings route below.
function inspectionDeckExecution(stage: 'LIST' | 'BATCH_REVIEW', sessionId?: string) {
  const base = inspectionExecution('LIST', sessionId);
  const finding = (id: string, title: string, extra: Record<string, unknown>) => ({
    id, title, description: null, meta: [], status: 'OPEN', href: `/dashboard/properties/${propertyId}/inspection-hub/report-roof?findingId=${id}`,
    entityType: 'INSPECTION_FINDING', parentId: 'report-roof', actions: FINDING_ITEM_ACTIONS, timingLabel: 'Inspected Sep 12, 2026', ...extra,
  });
  if (stage === 'LIST') {
    return { ...base, executionId: 'execution-inspection-deck', question: 'Go through my inspection findings',
      blocks: [{ ...base.blocks[0], presentation: { pattern: 'DECK', swipeRightActionId: 'finding-accept', swipeLeftActionId: 'finding-dismiss',
        batch: { operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', actionIds: ['finding-accept', 'finding-dismiss'], message: 'Review my inspection finding decisions.' } },
      sections: [{ id: 'open', title: 'Needs review', count: 3, items: [
        finding('finding-roof', 'ROOF: Missing shingles on the north slope', { tone: 'CAUTION', badgeLabel: 'Major', amountLabel: 'Est. $300–$600' }),
        finding('finding-breaker', 'ELECTRICAL: Double-tapped breaker', { tone: 'CRITICAL', badgeLabel: 'Safety', amountLabel: 'Est. $150–$300' }),
        finding('finding-crack', 'STRUCTURE: Hairline crack in the garage slab', { badgeLabel: 'Monitor' }),
      ] }] }] };
  }
  return { ...base, executionId: 'execution-inspection-batch', question: 'Review my inspection finding decisions.', status: 'NEEDS_CONFIRMATION',
    operation: { id: 'INSPECTION_FINDING_UPDATE', version: '1.0', family: 'COMMAND' }, contextVersion: 'finding-batch-v1',
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-batch-review', title: 'Review 2 findings', body: 'Accepting as work creates or reuses tracked work for 1 finding. Dismissing closes 1 finding without work. Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: 'inspection-finding-batch-1', version: 1, title: 'Confirm 2 findings?', description: 'These changes are saved to the canonical inspection record, one finding at a time.',
      fields: [{ label: 'Accept as work', value: '1 finding' }, { label: 'Dismiss', value: '1 finding' }], editableFields: [], confirmLabel: 'Confirm 2 changes',
      consentText: 'I have reviewed these inspection finding decisions and want them saved.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}
// FRD v1.44 seller-prep capability-card slice: SELLER_PREP_CHECKLIST and a SELLER_PREP_ITEM_DECISION review.
const SALE_ITEM_ACTIONS = [
  ['sale-item-pursue', 'Pursue before listing', 'Pursue this seller-prep checklist item.'],
  ['sale-item-unpursue', 'Stop pursuing', 'Stop pursuing this seller-prep checklist item.'],
  ['sale-item-waive', 'Disclose and waive', 'Waive this seller-prep checklist item.'],
  ['sale-item-reopen', 'Reopen', 'Reopen this seller-prep checklist item.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'SELLER_PREP_ITEM_DECISION' }));
// `shelves` is the FRD v1.84 answer: the same checklist with the shelves declared and each card's facts.
function sellerPrepExecution(stage: 'LIST' | 'REVIEW', sessionId?: string, shelves = false) {
  const common = {
    schemaVersion: '1.0', sessionId: sessionId ?? 'ask-acceptance-session', property: { id: propertyId, label: 'Acceptance Home' },
    skill: null, skillHandoff: null, captureRequests: [], clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z', suggestions: [],
  };
  if (stage === 'LIST') {
    return { ...common, executionId: shelves ? 'execution-seller-prep-shelves' : 'execution-seller-prep', question: shelves ? 'What should I fix before listing?' : 'Check my sale readiness', status: 'ANSWERED', confirmation: null,
      operation: { id: 'SELLER_PREP_CHECKLIST', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
      blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'seller-prep-open-items', title: 'Open items', ...(shelves ? { presentation: { pattern: 'SHELVES' } } : {}), description: 'Repairs, records, and presentation work recommended before listing, grouped by category.',
        actions: [],
        sections: [{ id: 'seller-prep-presentation', title: 'Presentation', count: 1, items: [{
          id: 'item-door', title: 'Paint the front door', description: null, meta: ['$200–$400 estimated'], status: 'OPEN',
          ...(shelves ? { tone: 'DEFAULT', timingLabel: null, amountLabel: '$200–$400 estimated' } : {}),
          href: `/dashboard/properties/${propertyId}/tools/sale-case?focusItemId=item-door`, entityType: 'SALE_READINESS_ITEM', actions: SALE_ITEM_ACTIONS,
        }] }] }] };
  }
  return { ...common, executionId: 'execution-sale-item-unpursue', question: 'Stop pursuing this seller-prep checklist item.', status: 'NEEDS_CONFIRMATION',
    operation: { id: 'SELLER_PREP_ITEM_DECISION', version: '1.0', family: 'COMMAND' }, contextVersion: 'sale-item-context-v1',
    blocks: [{ type: 'SUMMARY', id: 'seller-prep-item-review', title: 'Review unpursue decision', body: 'Removing your pursue commitment returns this item to open, undecided.', tone: 'CAUTION', actions: [] }],
    confirmation: { confirmationId: 'seller-prep-item-item-door-1', version: 1, title: 'Unpursue "Paint the front door"?', description: 'Paint the front door',
      fields: [{ label: 'Item', value: 'Paint the front door' }, { label: 'Decision', value: 'unpursue' }], editableFields: [],
      confirmLabel: 'Unpursue item', consentText: 'I authorize this update to the shared seller-prep checklist.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}
// FRD v1.45 mortgage-refinance-radar slice: REFINANCE_ANALYSIS now also shows the homeowner's own rate monitor.
function refinanceMonitorAnalysisExecution(sessionId?: string) {
  return {
    schemaVersion: '1.0', executionId: 'execution-refinance-monitor-analysis', sessionId: sessionId ?? 'ask-acceptance-session', question: 'Is refinancing worth reviewing now?',
    status: 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: 'REFINANCE_ANALYSIS', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: 'refinance-context-v1',
    blocks: [
      { type: 'SUMMARY', id: 'refinance-analysis-summary', title: 'Current conditions do not meet the radar’s actionable threshold', body: 'Your recorded rate is close to the governed benchmark.', tone: 'DEFAULT', actions: [] },
      { type: 'MONITOR', id: 'rate-monitor-monitor-30', monitorId: 'monitor-30', title: 'Your mortgage-rate monitor', status: 'ACTIVE', threshold: '5.500% or lower', product: '30-year fixed national benchmark',
        channel: 'Email plus in-app', cadence: 'IMMEDIATE', quietHours: null, sourceBoundary: 'Evaluates governed national benchmark snapshots; this is not a personalized lender offer.',
        actions: [{ id: 'edit-monitor', label: 'Alert delivery settings', href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar#refinance-evidence-settings`, style: 'SECONDARY' }] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z', suggestions: [],
  };
}
// FRD v1.46 buyer-closing slice: BUYER_DEADLINES with a blocking task, and a BUYER_TASK_COMPLETE review.
function buyerDeadlinesExecution(stage: 'LIST' | 'REVIEW', sessionId?: string) {
  const common = {
    schemaVersion: '1.0', sessionId: sessionId ?? 'ask-acceptance-session', property: { id: propertyId, label: 'Acceptance Home' },
    skill: null, skillHandoff: null, captureRequests: [], clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z', suggestions: [],
  };
  const planHref = `/dashboard/properties/${propertyId}/buyer-plan`;
  if (stage === 'LIST') {
    return { ...common, executionId: 'execution-buyer-deadlines', question: 'What is due before closing?', status: 'READY_WITH_LIMITATIONS', confirmation: null,
      operation: { id: 'BUYER_DEADLINES', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: 'buyer-context-v1',
      blocks: [{ type: 'GROUPED_LIST', id: 'buyer-deadlines-list', title: 'Deadlines and blockers', description: 'From the canonical Buyer Plan.', actions: [],
        filters: [{ id: 'all', label: 'All', message: 'Now show all blocking deadlines', active: true }],
        sections: [
          { id: 'milestones', title: 'Upcoming milestones', count: 1, items: [{ id: 'milestone-closing', title: 'Closing', description: null, meta: ['Due Oct 30, 2026'], status: 'NOT_STARTED', href: planHref }] },
          { id: 'blockers', title: 'Blocking before closing', count: 1, items: [{ id: 'task-appraisal', title: 'Order the appraisal', description: null, meta: ['Now'], status: 'PENDING',
            href: `${planHref}?taskId=task-appraisal`, entityType: 'BUYER_TASK',
            actions: [{ id: 'buyer-task-complete', label: 'Mark complete', message: 'Mark this Buyer Plan task complete.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'BUYER_TASK_COMPLETE' }] }] },
        ] }] };
  }
  return { ...common, executionId: 'execution-buyer-task-complete', question: 'Mark this Buyer Plan task complete.', status: 'NEEDS_CONFIRMATION',
    operation: { id: 'BUYER_TASK_COMPLETE', version: '1.0', family: 'COMMAND' }, contextVersion: 'buyer-task-v1',
    blocks: [{ type: 'SUMMARY', id: 'buyer-task-complete-review', title: 'Review completion for Order the appraisal', body: 'No status has changed yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: 'buyer-task-complete-task-appraisal-1', version: 1, title: 'Mark this Buyer Plan task complete?', description: 'This records completion in the canonical Buyer Plan and updates closing readiness.',
      fields: [{ label: 'Task', value: 'Order the appraisal' }, { label: 'Current status', value: 'in progress' }, { label: 'Completion method', value: 'User attestation' }], editableFields: [],
      confirmLabel: 'Mark complete', consentText: 'I confirm this task was completed and authorize updating the shared Buyer Plan.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
}
function homeEventRadarFeedExecution({ happeningNow = false } = {}) {
  return {
    schemaVersion: '1.0', executionId: happeningNow ? 'execution-home-event-radar-feed-now' : 'execution-home-event-radar-feed', sessionId: 'ask-acceptance-session',
    question: happeningNow ? 'Show my home event radar feed happening now.' : 'Show my home event radar feed.', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_EVENT_RADAR_FEED', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events',
      body: '1 monitored event from Home Event Radar.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters: radarFilterChips(happeningNow),
      description: 'This is the same canonical feed the Home Event Radar page reads, grouped by source. Dismissed events are hidden.',
      sections: [{ id: 'radar-weather', title: 'Weather', count: 1, items: [
        { id: 'match-property-summary', title: 'severe thunderstorm warning', entityType: 'RADAR_MATCH', description: 'A severe thunderstorm warning is in effect for this area.', meta: ['high', 'National Weather Service'], status: 'new', href: `/dashboard/properties/${propertyId}/tools/home-event-radar?matchId=match-property-summary`, actions: RADAR_ITEM_ACTIONS },
      ] }],
      actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: `/dashboard/properties/${propertyId}/tools/home-event-radar`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.92): the radar feed as a card deck. Each event declares the actions its
// recorded state allows: the first is new (Save, Dismiss, Mark done), the second is already saved (Remove from saved, ...).
function homeEventRadarDeckExecution() {
  const action = (id: string, label: string, message: string, operationId: string, style = 'SECONDARY') => ({ id, label, message, style, interactionType: 'MUTATE_RECORD', operationId });
  const save = action('radar-save', 'Save', 'Save this monitored event.', 'HOME_EVENT_RADAR_STATE');
  const unsave = action('radar-unsave', 'Remove from saved', 'Remove this monitored event from saved.', 'HOME_EVENT_RADAR_STATE');
  const dismiss = action('radar-dismiss', 'Dismiss', 'Dismiss this monitored event.', 'HOME_EVENT_RADAR_STATE');
  const done = action('radar-mark-done', 'Mark done', 'Mark this monitored event done.', 'HOME_EVENT_RADAR_MARK_DONE', 'PRIMARY');
  const href = `/dashboard/properties/${propertyId}/tools/home-event-radar`;
  return {
    schemaVersion: '1.0', executionId: 'execution-home-event-radar-deck', sessionId: 'ask-acceptance-session',
    question: 'What is on my home radar right now?', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_EVENT_RADAR_FEED', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events', body: '2 monitored events from Home Event Radar.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters: radarFilterChips(false),
      presentation: { pattern: 'DECK', swipeRightActionId: 'radar-save', swipeLeftActionId: 'radar-dismiss' },
      description: 'This is the same canonical feed the Home Event Radar page reads, grouped by source. Dismissed events are hidden.',
      sections: [{ id: 'radar-weather', title: 'Weather', count: 2, items: [
        { id: 'match-property-summary', title: 'severe thunderstorm warning', entityType: 'RADAR_MATCH', description: 'A severe thunderstorm warning is in effect for this area.', meta: ['high', 'National Weather Service'], status: 'new', href, actions: [save, dismiss, done] },
        { id: 'match-heat', title: 'excessive heat watch', entityType: 'RADAR_MATCH', description: 'Dangerous heat is expected later this week.', meta: ['medium', 'National Weather Service'], status: 'saved', href, actions: [unsave, dismiss, done] },
      ] }],
      actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: INVENTORY_LOOKUP's own disambiguation shape (askOrchestrator.service.ts's
// 'inventory-entity-selection' block) when a free-text question matches more than one item. Routed through the
// same InventoryResultList as 'inventory-results' (IW-PRIN-002) -- selecting an ambiguous match opens inline
// canonical detail instead of implicitly ejecting to /inventory before the homeowner confirmed which item they meant.
function inventoryDisambiguationExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-inventory-disambiguation', sessionId: 'ask-acceptance-session',
    question: 'Tell me about my smoke detector.', status: 'NEEDS_ENTITY',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'INVENTORY_LOOKUP', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: 'inventory-disambiguation-v1',
    blocks: [{
      type: 'GROUPED_LIST', id: 'inventory-entity-selection', title: 'Which inventory item do you mean?', filters: [],
      description: 'More than one Living Home Record matches this question. Open the intended item, or ask again using its room, brand, or model.',
      sections: [{ id: 'matches', title: 'Matching records', count: 2, items: [
        { id: 'item-smoke-kitchen', title: 'Kitchen smoke detector', entityType: 'INVENTORY_ITEM', description: 'Kidde brand', meta: ['Kitchen', 'safety', 'Updated Sep 5, 2026'], status: 'GOOD', href: null },
        { id: 'item-smoke-hallway', title: 'Hallway smoke detector', entityType: 'INVENTORY_ITEM', description: 'First Alert brand', meta: ['Hallway', 'safety', 'Updated Aug 20, 2026'], status: 'GOOD', href: null },
      ] }],
      actions: [],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: true, homeRecord: false, retryResponse: false },
    suggestions: ['Open home inventory'], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
  };
}

// Phase 3 write-slice acceptance: the same Property Summary timeline result,
// but with the contributor-only "Correct title" item action declared, as the
// server does for CONTRIBUTOR/OWNER (a VIEWER's result carries no actions).
function correctableSummaryExecution() {
  const response = propertySummaryTimelineExecution();
  const list = response.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'property-recent-events') as
    { sections: Array<{ items: Array<Record<string, unknown>> }> } | undefined;
  if (list) {
    const eventAction = (id: string, label: string, message: string) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_CORRECT' });
    // More than three corrections, so the detail folds them behind one "Correct a detail" disclosure.
    list.sections[0].items[0].actions = [
      eventAction('correct-title', 'Correct title', 'Correct the title of this timeline event.'),
      eventAction('correct-occurredAt', 'Correct date', 'Correct the date of this timeline event.'),
      eventAction('correct-amount', 'Correct amount', 'Correct the amount of this timeline event.'),
      eventAction('correct-type', 'Correct type', 'Correct the type of this timeline event.'),
      { id: 'correct-visibility', label: 'Change visibility', message: 'Change the visibility of this timeline event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_VISIBILITY' },
      { id: 'correct-roomId', label: 'Correct room', message: 'Correct the room of this timeline event.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'HOME_EVENT_CORRECT' },
    ];
  }
  const action = (id: string, label: string, message: string, operationId: string) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId });
  const rooms = response.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'property-rooms') as
    { sections: Array<{ items: Array<Record<string, unknown>> }> } | undefined;
  if (rooms) rooms.sections[0].items[0].actions = [
    action('rename-room', 'Rename room', 'Rename this room.', 'ROOM_RENAME'),
    action('correct-room-type', 'Change room type', 'Change the type of this room.', 'ROOM_RENAME'),
    action('correct-room-floorLevel', 'Change floor level', 'Change the floor level of this room.', 'ROOM_RENAME'),
  ];
  const withAddAction = (blockId: string, addAction: Record<string, unknown>) => {
    const target = response.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === blockId) as { actions: Array<Record<string, unknown>> } | undefined;
    if (target) target.actions = [addAction, ...target.actions];
  };
  withAddAction('property-recent-events', { id: 'add-timeline-event', label: 'Add a timeline event', interactionType: 'START_WORKFLOW', message: 'Add an event to my home timeline.', operationId: 'CAPTURE_EVENT_CONFIRM', style: 'PRIMARY' });
  withAddAction('property-rooms', { id: 'add-room', label: 'Add a room', interactionType: 'START_WORKFLOW', message: 'Add a room to my home record.', operationId: 'ROOM_CREATE', style: 'PRIMARY' });
  // The two collections below are what the real Property Summary emits for inventory and warranties
  // (owner-only warranty actions are declared here because the fixture user owns the warranty).
  (response.blocks as unknown[]).push({
    type: 'GROUPED_LIST', id: 'property-inventory', title: 'Systems and inventory', filters: [],
    description: 'Select an item to inspect its current canonical details without leaving Ask Cozy.',
    sections: [{ id: 'inventory', title: 'Recorded items', count: 1, items: [{
      id: 'item-property-summary', title: 'Water heater', description: null, entityType: 'INVENTORY_ITEM', href: null, status: 'VERIFIED',
      meta: ['Plumbing', 'Good', 'Updated Sep 1, 2026'],
      // More than three corrections, so the detail folds them behind one "Correct a detail" disclosure.
      actions: [
        action('correct-installedOn', 'Correct install date', 'Correct the install date of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
        action('correct-condition', 'Correct condition', 'Correct the condition of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
        action('correct-purchaseCostCents', 'Correct purchase cost', 'Correct the purchase cost of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
        action('correct-notes', 'Correct notes', 'Correct the notes of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
        action('correct-roomId', 'Correct room', 'Correct the room of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
        action('correct-category', 'Correct category', 'Correct the category of this inventory item.', 'INVENTORY_ITEM_CORRECT'),
      ],
    }] }],
    actions: [
      { id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW', message: 'Add an item to my home inventory.', operationId: 'INVENTORY_ITEM_CREATE', style: 'PRIMARY' },
      { id: 'open-inventory', label: 'Open home inventory', href: `/dashboard/properties/${propertyId}/inventory`, style: 'SECONDARY' },
    ],
  }, {
    // What the real Property Summary emits for an incomplete area: a row whose id is the area, with the declared area action.
    type: 'GROUPED_LIST', id: 'property-completeness', title: 'Areas that can improve', filters: [],
    description: 'Open the property record or answer the inline prompt to add canonical information.',
    sections: [{ id: 'incomplete-scopes', title: 'Property Context completeness', count: 1, items: [{
      id: 'STRUCTURE', title: 'Structure', description: '4 of 7 facts known', meta: ['3 missing', '0 conflicted', '0 stale'], status: '57% COMPLETE',
      href: `/dashboard/properties/${propertyId}/edit#structure`, entityType: 'PROPERTY_CONTEXT_AREA',
      actions: [action('fill-area-structure', 'Fill in missing details', 'Fill in the missing structure details.', 'PROPERTY_CONTEXT_AREA_CAPTURE')],
    }] }],
    actions: [],
  }, {
    type: 'GROUPED_LIST', id: 'property-warranties', title: 'Warranties', filters: [],
    description: 'Select a warranty to inspect its current canonical details without leaving Ask Cozy.',
    sections: [{ id: 'warranties', title: 'Recorded warranties', count: 1, items: [{
      id: 'warranty-property-summary', title: 'Acme Home Warranty', description: null, entityType: 'WARRANTY', href: null, status: 'ACTIVE',
      meta: ['Home warranty plan', 'Expires Dec 1, 2027'],
      actions: [
        action('correct-expiryDate', 'Correct expiry date', 'Correct the expiry date of this warranty.', 'WARRANTY_CORRECT'),
        action('correct-category', 'Correct coverage type', 'Correct the coverage type of this warranty.', 'WARRANTY_CORRECT'),
        action('correct-cost', 'Correct cost', 'Correct the cost of this warranty.', 'WARRANTY_CORRECT'),
        action('correct-coverageDetails', 'Correct coverage details', 'Correct the coverage details of this warranty.', 'WARRANTY_CORRECT'),
      ],
    }] }],
    actions: [
      { id: 'add-warranty', label: 'Add a warranty', interactionType: 'START_WORKFLOW', message: 'Add a warranty to my home record.', operationId: 'CAPTURE_WARRANTY_CONFIRM', style: 'PRIMARY' },
      { id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'SECONDARY' },
    ],
  });
  return response;
}

function eventCorrectionConfirmation(version: number, value: string) {
  return {
    confirmationId: `home-event-correct-event-property-summary-${version}`, version, title: 'Correct the title of "Roof replacement"?',
    description: 'This records a new revision on the canonical home timeline; the original is preserved as history.',
    fields: [{ label: 'Event', value: 'Roof replacement' }, { label: 'Field', value: 'title' }, { label: 'Current value', value: 'Roof replacement' }],
    editableFields: [{ key: 'value', label: 'Corrected title', type: 'TEXT', value }],
    confirmLabel: 'Save title', consentText: 'I authorize this correction to the shared home timeline.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

function eventCorrectionExecution(status: 'NEEDS_CONFIRMATION' | 'COMPLETED', version: number, value: string, sessionId?: string) {
  const base = propertySummaryTimelineExecution();
  return {
    ...base, sessionId: sessionId ?? base.sessionId, executionId: 'execution-event-correction', question: 'Correct the title of this timeline event.', status,
    operation: { id: 'HOME_EVENT_CORRECT', version: '1.0', family: 'COMMAND' }, contextVersion: 'home-event-correction-v1',
    blocks: status === 'COMPLETED'
      ? [{ type: 'WORKFLOW_PROGRESS', id: 'event-corrected-event-replacement', title: 'Home timeline event corrected', status: 'COMPLETED', description: 'A new revision replaces the prior entry on your home\'s canonical timeline; the original is preserved as history.', details: [{ label: 'Event', value }], actions: [] }]
      : [{ type: 'SUMMARY', id: 'home-event-correct-review', title: 'Review this title correction', body: 'No shared-home record has changed yet. Edit the corrected value, then confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: status === 'COMPLETED' ? null : eventCorrectionConfirmation(version, value),
    updatedAt: new Date().toISOString(),
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3, evidence upload design (approved and built 2026-09-22). Must match
// EVIDENCE_ATTACH_MESSAGE in HomeEventResultList.tsx and askOrchestrator.service.ts exactly. Unlike every other
// correction here, editableFields is always [] -- the file was already picked and uploaded client-side before
// this execution exists, so there is nothing left to edit on the confirmation card, only review and consent.
// FRD v1.99: the same flow for an inventory item or a warranty; only the record and the wording differ.
type EvidenceTarget = { kind: 'event' | 'inventory' | 'warranty'; title: string; where: string; noun: string; message: string };
const EVIDENCE_TARGETS: Record<EvidenceTarget['kind'], EvidenceTarget> = {
  event: { kind: 'event', title: 'Roof replacement', where: 'home timeline entry', noun: 'home record entry', message: 'Attach evidence to this home timeline entry.' },
  inventory: { kind: 'inventory', title: 'Water heater', where: 'inventory item', noun: 'inventory item', message: 'Attach this document to this inventory item.' },
  warranty: { kind: 'warranty', title: 'Acme Home Warranty', where: 'warranty', noun: 'warranty', message: 'Attach this document to this warranty.' },
};
function evidenceAttachConfirmation(version: number, documentName: string, target: EvidenceTarget = EVIDENCE_TARGETS.event) {
  return {
    confirmationId: `evidence-attach-${target.kind}-property-summary-${version}`, version, title: 'Attach this document as evidence?',
    description: `You are attaching a document you just uploaded to this ${target.where}. No change is saved until you confirm.`,
    fields: [{ label: 'Document', value: documentName }, { label: 'Attach to', value: target.title }],
    editableFields: [], confirmLabel: 'Attach document', consentText: target.kind === 'event' ? 'I confirm this document is evidence for this home record entry.' : `I confirm this document belongs with this ${target.noun}.`,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

function evidenceAttachExecution(status: 'NEEDS_CONFIRMATION' | 'COMPLETED', version: number, documentName: string, sessionId?: string, target: EvidenceTarget = EVIDENCE_TARGETS.event) {
  const base = propertySummaryTimelineExecution();
  return {
    ...base, sessionId: sessionId ?? base.sessionId, executionId: 'execution-evidence-attach', question: target.message, status,
    operation: { id: 'CAPTURE_EVIDENCE_CONFIRM', version: '1.0', family: 'COMMAND' }, contextVersion: 'evidence-attach-v1',
    blocks: status === 'COMPLETED'
      ? [{ type: 'SUMMARY', id: 'evidence-attached-link-1', title: 'Attached to your home timeline', tone: 'POSITIVE', body: `${documentName} is now attached as evidence on your home timeline.`, actions: [] }]
      : [{ type: 'SUMMARY', id: 'evidence-attach-review', title: `Attach this document to "${target.title}"?`, body: 'Nothing has been saved yet. Review, then confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: status === 'COMPLETED' ? null : evidenceAttachConfirmation(version, documentName, target),
    updatedAt: new Date().toISOString(),
  };
}

// Phase 3 write-slice acceptance: confirmation -> edit -> confirm for the
// inventory (DATE), warranty (DATE) and room (TEXT) corrections. Shapes mirror
// the real server's confirmation cards.
export type CorrectionKind = 'inventory' | 'warranty' | 'room' | 'roomType' | 'roomFloor' | 'inventoryCondition' | 'inventoryCost' | 'inventoryRoom' | 'eventAmount' | 'eventVisibility' | 'eventRoom' | 'warrantyCategory';
const CORRECTIONS: Record<CorrectionKind, { message: RegExp; operationId: string; title: string; label: string; type: 'DATE' | 'TEXT' | 'SELECT' | 'MONEY'; initial: string; confirmLabel: string; consentText: string; receiptTitle: string; current: string; options?: Array<{ label: string; value: string }> }> = {
  inventory: { message: /correct the install date of this inventory item/i, operationId: 'INVENTORY_ITEM_CORRECT', title: 'Correct installed date for Water heater?', label: 'Corrected installed date', type: 'DATE', initial: '2022-01-15', current: '2022-01-15', confirmLabel: 'Save installed date', consentText: 'I authorize this correction to the shared home inventory record.', receiptTitle: 'Inventory record updated' },
  warranty: { message: /correct the expiry date of this warranty/i, operationId: 'WARRANTY_CORRECT', title: 'Correct the expiry date of the Acme Home Warranty warranty?', label: 'Corrected expiry date', type: 'DATE', initial: '2027-12-01', current: '2027-12-01', confirmLabel: 'Save expiry date', consentText: 'I authorize this correction to the warranty record.', receiptTitle: 'Warranty updated' },
  inventoryCondition: { message: /correct the condition of this inventory item/i, operationId: 'INVENTORY_ITEM_CORRECT', title: 'Correct condition for Water heater?', label: 'Corrected condition', type: 'SELECT', initial: 'GOOD', current: 'Good', confirmLabel: 'Save condition', consentText: 'I authorize this correction to the shared home inventory record.', receiptTitle: 'Inventory record updated', options: [{ label: 'New', value: 'NEW' }, { label: 'Good', value: 'GOOD' }, { label: 'Fair', value: 'FAIR' }, { label: 'Poor', value: 'POOR' }, { label: 'Unknown', value: 'UNKNOWN' }] },
  inventoryCost: { message: /correct the purchase cost of this inventory item/i, operationId: 'INVENTORY_ITEM_CORRECT', title: 'Correct purchase cost for Water heater?', label: 'Corrected purchase cost', type: 'MONEY', initial: '850.00', current: '$850.00', confirmLabel: 'Save purchase cost', consentText: 'I authorize this correction to the shared home inventory record.', receiptTitle: 'Inventory record updated' },
  eventAmount: { message: /correct the amount of this timeline event/i, operationId: 'HOME_EVENT_CORRECT', title: 'Correct the amount of "Roof replacement"?', label: 'Corrected amount', type: 'MONEY', initial: '18500.00', current: '$18,500.00', confirmLabel: 'Save amount', consentText: 'I authorize this correction to the shared home timeline.', receiptTitle: 'Home timeline event corrected' },
  warrantyCategory: { message: /correct the coverage type of this warranty/i, operationId: 'WARRANTY_CORRECT', title: 'Correct the coverage type of the Acme Home Warranty warranty?', label: 'Corrected coverage type', type: 'SELECT', initial: 'HOME_WARRANTY_PLAN', current: 'Home warranty plan', confirmLabel: 'Save coverage type', consentText: 'I authorize this correction to the warranty record.', receiptTitle: 'Warranty updated', options: [{ label: 'Appliance', value: 'APPLIANCE' }, { label: 'HVAC', value: 'HVAC' }, { label: 'Roofing', value: 'ROOFING' }, { label: 'Home warranty plan', value: 'HOME_WARRANTY_PLAN' }, { label: 'Other', value: 'OTHER' }] },
  roomType: { message: /change the type of this room/i, operationId: 'ROOM_RENAME', title: 'Change the type of "Kitchen"?', label: 'New type', type: 'SELECT', initial: 'KITCHEN', current: 'Kitchen', confirmLabel: 'Save type', consentText: 'I authorize this type change to the shared home record.', receiptTitle: 'Room updated', options: [{ label: 'Kitchen', value: 'KITCHEN' }, { label: 'Office', value: 'OFFICE' }, { label: 'Basement', value: 'BASEMENT' }] },
  roomFloor: { message: /change the floor level of this room/i, operationId: 'ROOM_RENAME', title: 'Change the floor level of "Kitchen"?', label: 'New floor level', type: 'TEXT', initial: '1', current: '1', confirmLabel: 'Save floor level', consentText: 'I authorize this floor level change to the shared home record.', receiptTitle: 'Room updated' },
  room: { message: /rename this room/i, operationId: 'ROOM_RENAME', title: 'Rename "Kitchen"?', label: 'New room name', type: 'TEXT', initial: 'Kitchen', current: 'Kitchen', confirmLabel: 'Save room name', consentText: 'I authorize this rename of the shared home record.', receiptTitle: 'Room renamed' },
  eventVisibility: { message: /change the visibility of this timeline event/i, operationId: 'HOME_EVENT_VISIBILITY', title: 'Change who can see "Roof replacement"?', label: 'New visibility', type: 'SELECT', initial: 'HOUSEHOLD', current: 'Household (everyone with access to this home)', confirmLabel: 'Save visibility', consentText: 'I authorize this visibility change to the shared home timeline.', receiptTitle: 'Visibility changed', options: [{ label: 'Private (only you)', value: 'PRIVATE' }, { label: 'Household (everyone with access to this home)', value: 'HOUSEHOLD' }, { label: 'Resale pack (also shared in resale summaries for buyers and listing agents)', value: 'RESALE_PACK' }] },
  eventRoom: { message: /correct the room of this timeline event/i, operationId: 'HOME_EVENT_CORRECT', title: 'Correct the room of "Roof replacement"?', label: 'Corrected room', type: 'SELECT', initial: 'NONE', current: 'Not recorded', confirmLabel: 'Save room', consentText: 'I authorize this correction to the shared home timeline.', receiptTitle: 'Home timeline event corrected', options: [{ label: 'No room', value: 'NONE' }, { label: 'Kitchen', value: 'room-property-summary' }] },
  inventoryRoom: { message: /correct the room of this inventory item/i, operationId: 'INVENTORY_ITEM_CORRECT', title: 'Correct room for Water heater?', label: 'Corrected room', type: 'SELECT', initial: 'NONE', current: 'Not recorded', confirmLabel: 'Save room', consentText: 'I authorize this correction to the shared home inventory record.', receiptTitle: 'Inventory record updated', options: [{ label: 'No room', value: 'NONE' }, { label: 'Kitchen', value: 'room-property-summary' }] },
};

function correctionExecution(kind: CorrectionKind, status: 'NEEDS_CONFIRMATION' | 'COMPLETED', version: number, value: string, sessionId?: string) {
  const spec = CORRECTIONS[kind];
  const base = propertySummaryTimelineExecution();
  return {
    ...base, sessionId: sessionId ?? base.sessionId, executionId: `execution-correct-${kind}`, question: 'Correction', status,
    operation: { id: spec.operationId, version: '1.0', family: 'COMMAND' }, contextVersion: `correct-${kind}-v1`,
    blocks: status === 'COMPLETED'
      ? [{ type: 'WORKFLOW_PROGRESS', id: `corrected-${kind}`, title: spec.receiptTitle, status: 'COMPLETED', description: 'The canonical record was updated.', details: [{ label: 'New value', value }], actions: [] }]
      : [{ type: 'SUMMARY', id: `correct-${kind}-review`, title: 'Review this correction', body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: status === 'COMPLETED' ? null : {
      confirmationId: `correct-${kind}-${version}`, version, title: spec.title, description: 'Review before it is written to the canonical record.',
      fields: [{ label: 'Current value', value: spec.current }],
      editableFields: [{ key: 'value', label: spec.label, type: spec.type, value, ...(spec.options ? { options: spec.options } : {}) }],
      confirmLabel: spec.confirmLabel, consentText: spec.consentText, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}

// Phase 3 add-record acceptance: user-initiated "Add a warranty" -> empty form -> confirmation -> receipt.
// Shapes mirror what warrantyAddResult / editCaptureWarrantyCandidate / confirmCaptureWarranty produce.
function warrantyAddExecution(stage: 'FORM' | 'CONFIRMATION' | 'DONE', sessionId?: string, answer?: Record<string, string>) {
  const base = propertySummaryTimelineExecution();
  const common = {
    ...base, sessionId: sessionId ?? base.sessionId, executionId: 'execution-warranty-add', question: 'Add a warranty to my home record.',
    operation: { id: 'CAPTURE_WARRANTY_CONFIRM', version: '1.0', family: 'COMMAND' }, contextVersion: 'warranty-add-context-v1', updatedAt: new Date().toISOString(),
  };
  const field = (key: string, label: string, required: boolean, inputSchema: Record<string, unknown>) => ({ key, label, required, inputSchema });
  if (stage === 'FORM') {
    return {
      ...common, status: 'NEEDS_CONTEXT', confirmation: null,
      blocks: [{ type: 'SUMMARY', id: 'warranty-add-input', title: 'Add a warranty', body: 'Nothing has been saved yet. Enter the details, then review them before the warranty is added.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [{
        requirementId: 'capture-warranty-edit', captureKey: 'CAPTURE_WARRANTY_EDIT', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Add a warranty', question: 'Which warranty would you like to add to your home record?', helpText: 'Enter dates as YYYY-MM-DD. You will review everything before it is saved.',
        inputSchema: { type: 'GROUP', fields: [
          field('providerName', 'Provider', true, { type: 'SHORT_TEXT', maxLength: 160 }),
          field('category', 'Coverage type', true, { type: 'SINGLE_SELECT', options: [{ label: 'HOME_WARRANTY_PLAN', value: 'HOME_WARRANTY_PLAN' }, { label: 'HVAC', value: 'HVAC' }] }),
          field('policyNumber', 'Policy number', false, { type: 'SHORT_TEXT', maxLength: 160 }),
          field('coverageDetails', 'Coverage details', false, { type: 'SHORT_TEXT', maxLength: 2000 }),
          field('cost', 'Cost', false, { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' }),
          field('startDate', 'Start date', true, { type: 'SHORT_TEXT', maxLength: 10 }),
          field('expiryDate', 'Expiration date', true, { type: 'SHORT_TEXT', maxLength: 10 }),
        ] },
        currentAnswer: { providerName: null, category: null, policyNumber: null, coverageDetails: null, cost: null, startDate: null, expiryDate: null },
        allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this warranty; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: 'warranty-add-context-v1',
      }],
    };
  }
  if (stage === 'CONFIRMATION') {
    return {
      ...common, status: 'NEEDS_CONFIRMATION', captureRequests: [],
      blocks: [{ type: 'SUMMARY', id: 'capture-warranty-edit-preview', title: 'Save this warranty to your property record?', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: 'capture-warranty-edit-1', version: 1, title: 'Save this warranty to your property record?',
        description: 'You entered these details. No change is saved until you confirm.',
        fields: [{ label: 'Provider', value: answer?.providerName ?? '' }, { label: 'Coverage', value: answer?.category ?? '' }, { label: 'Expires', value: answer?.expiryDate ?? '' }],
        editableFields: [], confirmLabel: 'Save warranty',
        consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my property record.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    };
  }
  return {
    ...common, status: 'COMPLETED', captureRequests: [], confirmation: null,
    blocks: [{ type: 'SUMMARY', id: 'warranty-captured-new', title: 'Recorded to your property record', body: 'Your Acme Home Warranty warranty is now saved to your Living Home Record.', tone: 'POSITIVE', actions: [] }],
  };
}

// Phase 3 add-record acceptance: "Add a timeline event" and "Add a room" -> form -> review -> receipt.
// Shapes mirror buildUserAddedEventConfirmation / roomCreateResult / the existing confirm receipts.
type AddKind = 'event' | 'room' | 'item' | 'area';
function addExecution(kind: AddKind, stage: 'FORM' | 'CONFIRMATION' | 'DONE', sessionId?: string, answer?: Record<string, unknown>, notice?: string) {
  const base = propertySummaryTimelineExecution();
  const spec = kind === 'event'
    ? { executionId: 'execution-event-add', question: 'Add an event to my home timeline.', operationId: 'CAPTURE_EVENT_CONFIRM', context: 'event-add-context-v1', requirementId: 'capture-event-add', captureKey: 'CAPTURE_EVENT_ADD', title: 'Add a timeline event', questionText: 'What would you like to add to your home timeline?' }
    : kind === 'area'
    ? { executionId: 'execution-area-add', question: 'Fill in the missing structure details.', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', context: 'area-add-context-v1', requirementId: 'area-roof-requirement', captureKey: 'ROOF_STRUCTURE_PROFILE', title: 'Roof details', questionText: 'Confirm the roof type, replacement year, and responsibility.' }
    : kind === 'item'
    ? { executionId: 'execution-item-add', question: 'Add an item to my home inventory.', operationId: 'INVENTORY_ITEM_CREATE', context: 'item-add-context-v1', requirementId: 'inventory-create-inputs', captureKey: 'INVENTORY_ITEM_CREATE_INPUTS', title: 'Add an item', questionText: 'Which item would you like to add to your home inventory?' }
    : { executionId: 'execution-room-add', question: 'Add a room to my home record.', operationId: 'ROOM_CREATE', context: 'room-add-context-v1', requirementId: 'room-create-inputs', captureKey: 'ROOM_CREATE_INPUTS', title: 'Add a room', questionText: 'Which room would you like to add to your home record?' };
  const common = { ...base, sessionId: sessionId ?? base.sessionId, executionId: spec.executionId, question: spec.question, operation: { id: spec.operationId, version: '1.0', family: 'COMMAND' }, contextVersion: spec.context, updatedAt: new Date().toISOString() };
  const field = (key: string, label: string, required: boolean, inputSchema: Record<string, unknown>) => ({ key, label, required, inputSchema });
  const fields = kind === 'event'
    ? [
      field('title', 'Title', true, { type: 'SHORT_TEXT', maxLength: 140 }),
      field('type', 'Type', true, { type: 'SINGLE_SELECT', options: [{ label: 'Repair', value: 'REPAIR' }, { label: 'Improvement', value: 'IMPROVEMENT' }, { label: 'Note', value: 'NOTE' }] }),
      field('occurredAt', 'Date', true, { type: 'SHORT_TEXT', maxLength: 10 }),
      field('summary', 'Details', false, { type: 'SHORT_TEXT', maxLength: 500 }),
      field('amount', 'Amount', false, { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' }),
      field('providerName', 'Provider', false, { type: 'SHORT_TEXT', maxLength: 160 }),
    ]
    : kind === 'area'
    ? [
      field('roofType', 'Roof type', true, { type: 'SINGLE_SELECT', options: [{ label: 'Asphalt shingle', value: 'ASPHALT_SHINGLE' }, { label: 'Metal', value: 'METAL' }] }),
      field('roofReplacementYear', 'Roof replacement year', true, { type: 'INTEGER', min: 1600, max: 2200, unit: 'year' }),
    ]
    : kind === 'item'
    ? [
      field('name', 'Item name', true, { type: 'SHORT_TEXT', maxLength: 120 }),
      field('category', 'Category', true, { type: 'SINGLE_SELECT', options: [{ label: 'Appliance', value: 'APPLIANCE' }, { label: 'Hvac', value: 'HVAC' }, { label: 'Plumbing', value: 'PLUMBING' }] }),
      field('roomId', 'Room', true, { type: 'SINGLE_SELECT', options: [{ label: 'Kitchen', value: 'room-kitchen' }, { label: 'No room (whole-home)', value: 'NONE' }] }),
      field('brand', 'Brand', false, { type: 'SHORT_TEXT', maxLength: 80 }),
      field('model', 'Model', false, { type: 'SHORT_TEXT', maxLength: 80 }),
    ]
    : [
      field('type', 'Room type', true, { type: 'SINGLE_SELECT', options: [{ label: 'Office', value: 'OFFICE' }, { label: 'Bedroom', value: 'BEDROOM' }, { label: 'Other', value: 'OTHER' }] }),
      field('name', 'Room name', true, { type: 'SHORT_TEXT', maxLength: 80 }),
      field('floorLevel', 'Floor level', false, { type: 'INTEGER', min: -5, max: 50 }),
    ];
  const captureRequest = (current: Record<string, unknown>) => ({
    requirementId: spec.requirementId, captureKey: spec.captureKey, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: spec.title, question: spec.questionText,
    helpText: 'You will review everything before it is saved.', inputSchema: { type: 'GROUP', fields }, currentAnswer: current,
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Nothing is saved until you confirm', confirmationText: null, expectedContextVersion: spec.context,
    ...(kind === 'area' ? { skippable: true } : {}),
  });
  const empty = kind === 'event' ? { title: null, type: null, occurredAt: null, summary: null, amount: null, providerName: null }
    : kind === 'area' ? { roofType: null, roofReplacementYear: null }
    : kind === 'item' ? { name: null, category: null, roomId: null, brand: null, model: null }
    : { type: null, name: null, floorLevel: null };
  if (stage === 'FORM') {
    return { ...common, status: 'NEEDS_CONTEXT', confirmation: null, captureRequests: [captureRequest(empty)],
      blocks: [
        ...(notice ? [{ type: 'SUMMARY', id: 'area-capture-notice', title: notice, body: 'Nothing was saved. You can come back to it any time.', tone: 'DEFAULT', actions: [] }] : []),
        { type: 'SUMMARY', id: `${kind}-add-input`, title: spec.title, body: 'Nothing has been saved yet. Enter the details, then review them before it is added.', tone: 'DEFAULT', actions: [] },
      ] };
  }
  if (stage === 'CONFIRMATION') {
    const entered = answer ?? {};
    const confirmation = kind === 'event'
      ? { confirmationId: 'capture-event-add-1', version: 1, title: 'Add this to your home timeline?', description: 'You entered these details. No change is saved until you confirm.',
        fields: [{ label: 'Event', value: String(entered.title ?? '') }, { label: 'Type', value: String(entered.type ?? '') }, { label: 'Date', value: String(entered.occurredAt ?? '') }],
        editableFields: [], confirmLabel: 'Add to timeline', consentText: 'I confirm this is accurate and authorize ContractToCozy to save it to my home timeline.' }
      : kind === 'area'
      ? { confirmationId: 'area-capture-1', version: 1, title: 'Save "Roof details" to your home record?', description: 'This saves the answer to the shared home record through Property Context.',
        fields: [{ label: 'Property', value: 'Acceptance Home' }, { label: 'Roof type', value: String(entered.roofType ?? '') }, { label: 'Roof replacement year', value: String(entered.roofReplacementYear ?? '') }, { label: 'Areas updated', value: 'Structure, Maintenance responsibility' }],
        editableFields: [], confirmLabel: 'Save details', consentText: 'I authorize saving these details to the shared home record.' }
      : kind === 'item'
      ? { confirmationId: 'inventory-create-1', version: 1, title: `Add "${String(entered.name ?? '')}" to your inventory?`, description: 'This adds the item through the canonical inventory service.',
        fields: [{ label: 'Item name', value: String(entered.name ?? '') }, { label: 'Category', value: String(entered.category ?? '') }, { label: 'Room', value: 'Kitchen' }],
        editableFields: [], confirmLabel: 'Add item', consentText: 'I authorize adding this item to the shared home record.' }
      : { confirmationId: 'room-create-1', version: 1, title: `Add the room "${String(entered.name ?? '')}"?`, description: 'This adds the room through the canonical inventory service.',
        fields: [{ label: 'Room name', value: String(entered.name ?? '') }, { label: 'Type', value: String(entered.type ?? '') }],
        editableFields: [], confirmLabel: 'Add room', consentText: 'I authorize adding this room to the shared home record.' };
    return { ...common, status: 'NEEDS_CONFIRMATION', captureRequests: [captureRequest(entered)],
      blocks: [{ type: 'SUMMARY', id: `${kind}-add-review`, title: 'Review before adding', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: { ...confirmation, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
  }
  if (kind === 'area') {
    return { ...common, status: 'COMPLETED', captureRequests: [], confirmation: null, blocks: [
      { type: 'WORKFLOW_PROGRESS', id: 'area-capture-saved', title: 'Details saved', status: 'COMPLETED', description: 'The answer is now part of your home record.', details: [{ label: 'Areas updated', value: 'Structure, Maintenance responsibility' }], actions: [] },
      { type: 'SUMMARY', id: 'area-capture-progress', title: 'No more questions in this session', body: 'Structure is 71% complete on the home record. 1 detail cannot be filled in here: Roof age (calculated from the replacement year).', tone: 'CAUTION', actions: [] },
    ] };
  }
  return { ...common, status: 'COMPLETED', captureRequests: [], confirmation: null,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `${kind}-added`, title: kind === 'event' ? 'Added to your home timeline' : kind === 'item' ? 'Item added' : 'Room added', status: 'COMPLETED', description: 'The record was added.', details: [], actions: [] }] };
}

function maintenanceExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-maintenance', sessionId: 'ask-acceptance-session',
    question: 'What maintenance tasks are due this month?', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'MAINTENANCE_QUERY', version: '1.0', family: 'MAINTENANCE' }, contextVersion: 'maintenance-context-v1',
    viewState: { resultId: 'maintenance-result-1', domainScopePhrase: null, dateScopePhrase: 'this month', statusFilter: 'ALL_OPEN', selectedTaskId: null, revision: 1 },
    blocks: [
      { type: 'SUMMARY', id: 'maintenance-summary', title: '1 maintenance record matches this request', body: 'The task is recorded for this home.', tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', id: 'maintenance-groups', title: 'Maintenance record', description: 'Showing current recorded tasks.', filters: [], sections: [{
        id: 'open', title: 'Pending and in progress', count: 51, offset: 0, items: [{
          id: 'maintenance-task-1', title: 'Service the heat pump', description: 'Annual preventive service.', meta: ['HVAC', 'Due Oct 1, 2026', 'high priority'], status: 'PENDING',
          href: `/dashboard/maintenance?propertyId=${propertyId}&taskId=maintenance-task-1&from=ask`, entityType: 'MAINTENANCE_TASK',
          actions: [{ id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'MAINTENANCE_TASK_COMPLETE' }],
        }],
      }], actions: [
        // Matches the real producer, which lists this first so a truncated section always has a full-result link.
        { id: 'view-all-maintenance', label: 'View all in Maintenance', href: `/dashboard/maintenance?propertyId=${propertyId}`, style: 'SECONDARY' },
        { id: 'open-maintenance', label: 'Open Maintenance', href: `/dashboard/maintenance?propertyId=${propertyId}`, style: 'SECONDARY' },
        { id: 'create-maintenance', label: 'Create a task', interactionType: 'START_WORKFLOW', message: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', style: 'PRIMARY' },
        { id: 'open-maintenance-setup', label: 'Maintenance Setup', href: `/dashboard/maintenance-setup?propertyId=${propertyId}&from=ask`, style: 'SECONDARY' },
      ] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: true, entity: true, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.74): the maintenance answer as the real producer now sends it -- answer
// chips, timing groups and the declared shelves pattern. maintenance-task-1 reuses the mocked canonical task read.
function maintenanceShelvesExecution() {
  const base = maintenanceExecution();
  const complete = { id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'MAINTENANCE_TASK_COMPLETE' };
  const soon = (index: number) => ({
    id: `maintenance-soon-${index}`, title: ['Flush the water heater', 'Clean the gutters', 'Test the sump pump'][index], description: null,
    meta: ['Plumbing', `Due Oct ${index + 3}, 2026`, 'medium priority'], status: 'PENDING', entityType: 'MAINTENANCE_TASK', actions: [complete],
    tone: 'CAUTION', timingLabel: `Due Oct ${index + 3}, 2026`, amountLabel: index === 1 ? 'Est. $180' : null,
  });
  return {
    ...base, executionId: 'execution-maintenance-shelves', question: 'What maintenance is pending?',
    viewState: { ...base.viewState, resultId: 'maintenance-shelves-result', dateScopePhrase: null },
    blocks: [
      { type: 'SUMMARY', id: 'maintenance-summary', title: '4 maintenance records match this request', body: '4 open, 0 completed, and 1 overdue task are recorded in the selected scope.', tone: 'CAUTION', actions: [],
        chips: [{ label: '1 overdue', tone: 'CRITICAL' }, { label: '3 due in 30 days', tone: 'CAUTION' }, { label: '4 open', tone: 'DEFAULT' }] },
      { ...base.blocks[1], presentation: { pattern: 'SHELVES' }, sections: [
        { id: 'overdue', title: 'Overdue', count: 1, offset: 0, items: [{
          ...(base.blocks[1] as { sections: Array<{ items: Array<Record<string, unknown>> }> }).sections[0].items[0],
          tone: 'CRITICAL', timingLabel: 'Was due Sep 20, 2026', amountLabel: 'Est. $250',
        }] },
        { id: 'due-soon', title: 'Due in the next 30 days', count: 3, offset: 0, items: [0, 1, 2].map(soon) },
      ] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.82): the Home Actions answer with its priorities as read-only shelves.
function homeActionShelvesExecution() {
  const base = maintenanceExecution();
  const card = (id: string, title: string, description: string, timingLabel: string, tone: 'DEFAULT' | 'CAUTION') => ({
    id, title, description, meta: [timingLabel, 'high confidence'], status: 'OPEN', href: `/dashboard/maintenance?propertyId=${propertyId}`, timingLabel, tone,
  });
  return {
    ...base, executionId: 'execution-home-action-shelves', question: 'What needs my attention now?',
    operation: { id: 'HOME_ACTIONS', version: '1.0', family: 'READ' },
    viewState: null,
    blocks: [
      { type: 'SUMMARY', id: 'home-actions-summary', title: '4 governed Home Actions are ready to review', body: '2 need attention now, 1 is due soon, 1 is for planning.', tone: 'CAUTION', actions: [] },
      { type: 'GROUPED_LIST', filters: [], id: 'home-actions-list', title: 'Prioritized actions', presentation: { pattern: 'SHELVES' },
        description: 'Priority and order come from the canonical Home Action feed. Ask does not independently rerank them.',
        sections: [
          { id: 'now', title: 'Now', count: 2, items: [
            card('action-filter', 'Replace the HVAC filter', 'A clogged filter strains the system.', 'Due Oct 3, 2026', 'CAUTION'),
            card('action-smoke', 'Test the smoke alarms', 'Alarms are unchecked for over a year.', 'Due Oct 5, 2026', 'CAUTION'),
          ] },
          { id: 'soon', title: 'Soon', count: 1, items: [card('action-gutter', 'Clean the gutters', 'Leaves are due to fall.', 'Due Nov 1, 2026', 'DEFAULT')] },
          { id: 'plan', title: 'Plan', count: 1, items: [card('action-roof', 'Budget for a new roof', 'The recorded roof is near the end of its typical life.', 'Within five years', 'DEFAULT')] },
        ], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.83): the seasonal checklist answer with its tasks as read-only priority shelves.
function seasonalShelvesExecution() {
  const base = maintenanceExecution();
  const seasonalHref = `/dashboard/seasonal?propertyId=${propertyId}&from=ask`;
  const task = (id: string, title: string, description: string, priority: string, timingLabel: string, tone: 'DEFAULT' | 'CAUTION') => ({
    id, title, description, meta: [`${priority} priority`, timingLabel, 'Seasonal checklist'], status: 'PENDING', actions: [],
    href: `${seasonalHref}&checklistId=summer-2026&itemId=${id}`, timingLabel, tone,
  });
  return {
    ...base, executionId: 'execution-seasonal-shelves', question: 'What seasonal tasks are pending?', viewState: null,
    blocks: [
      { type: 'SUMMARY', id: 'seasonal-maintenance-summary', title: '3 summer tasks need attention', body: 'These tasks come from the Summer 2026 checklist.', tone: 'CAUTION',
        actions: [{ id: 'open-seasonal', label: 'Open Summer checklist', href: seasonalHref, style: 'PRIMARY' }] },
      { type: 'GROUPED_LIST', filters: [], id: 'seasonal-maintenance-items', title: 'Summer checklist', presentation: { pattern: 'SHELVES' },
        description: 'Checklist status is used first; a linked canonical Maintenance completion takes precedence when the two sources differ.',
        sections: [
          { id: 'priority-critical', title: 'Critical', count: 2, items: [
            task('season-ac', 'Service air conditioner', 'Prepare the cooling system for sustained heat.', 'Critical', 'Recommended Aug 20, 2026', 'CAUTION'),
            task('season-drain', 'Inspect exterior drainage', 'Check that water runs away from the foundation.', 'Critical', 'Recommended Aug 25, 2026', 'CAUTION'),
          ] },
          { id: 'priority-optional', title: 'Optional', count: 1, items: [task('season-vent', 'Clean dryer vent', 'Lint buildup is a fire risk.', 'Optional', 'No recommended date', 'DEFAULT')] },
        ], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.84): the Status Board answer with appliances and systems as read-only shelves.
function statusBoardShelvesExecution() {
  const base = maintenanceExecution();
  const boardHref = `/dashboard/properties/${propertyId}/status-board`;
  const row = (id: string, title: string, description: string | null, condition: string, timingLabel: string, tone: 'DEFAULT' | 'CAUTION', extra: Record<string, unknown> = {}) => ({
    id, title, description, meta: ['Replace soon', timingLabel, 'Kitchen'], status: condition, href: `/dashboard/properties/${propertyId}/inventory?openItemId=${id}`, timingLabel, tone, ...extra,
  });
  // P1 inline capture (FRD v1.100): an item with no install date carries an "Add install date" action on the inventory item id.
  const installDateCapture = { entityType: 'INVENTORY_ITEM', actions: [{ id: 'correct-installedOn', label: 'Add install date', message: 'Correct the install date of this inventory item.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'INVENTORY_ITEM_CORRECT' }] };
  return {
    ...base, executionId: 'execution-status-board-shelves', question: 'Show my status board', viewState: null,
    operation: { id: 'HOME_STATUS_BOARD', version: '1.0', family: 'READ' },
    blocks: [
      { type: 'SUMMARY', id: 'status-board-summary', title: '2 need action, 1 to monitor, 1 in good shape', body: 'Across 4 recorded appliances and systems.', tone: 'CAUTION',
        actions: [{ id: 'open-status-board', label: 'Open Status Board', href: boardHref, style: 'PRIMARY' }] },
      { type: 'GROUPED_LIST', filters: [], id: 'status-board-items', title: 'Appliances and systems by condition', presentation: { pattern: 'SHELVES' },
        description: 'Each with why, from age, warranty and maintenance records.',
        sections: [
          { id: 'status-board-action-needed', title: 'Needs action', count: 2, items: [
            row('item-water-heater', 'Water heater', 'Past expected life (10yr)', 'ACTION_NEEDED', '12 yr old', 'CAUTION'),
            row('item-furnace', 'Furnace', 'Past expected life (15yr)', 'ACTION_NEEDED', '16 yr old', 'CAUTION'),
          ] },
          { id: 'status-board-monitor', title: 'Monitor', count: 1, items: [row('item-dishwasher', 'Dishwasher', 'Near the end of expected life', 'MONITOR', 'Install date needed', 'DEFAULT', installDateCapture)] },
          { id: 'status-board-good', title: 'In good shape', count: 1, items: [row('item-fridge', 'Refrigerator', null, 'GOOD', '3 yr old', 'DEFAULT')] },
        ], actions: [{ id: 'open-status-board', label: 'Open Status Board', href: boardHref, style: 'SECONDARY' }] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.84): the Buyer Plan guidance with the next task and blockers as read-only shelves.
function buyerPlanShelvesExecution() {
  const base = maintenanceExecution();
  const planHref = `/dashboard/properties/${propertyId}/buyer-plan`;
  const task = (id: string, title: string, description: string, timingLabel: string | null, tone: 'DEFAULT' | 'CAUTION') => ({
    id, title, description, meta: ['Now', 'closing prep'], status: 'PENDING', href: `${planHref}?taskId=${id}`, timingLabel, tone,
  });
  return {
    ...base, executionId: 'execution-buyer-plan-shelves', question: 'What is left before I close?', viewState: null,
    operation: { id: 'HOME_ACTIONS', version: '1.0', family: 'READ' },
    blocks: [
      { type: 'SUMMARY', id: 'buyer-plan-summary', title: 'Next before closing: Review the Closing Disclosure', body: 'This comes directly from the canonical Buyer Plan. 2 of 10 applicable pre-close tasks remain.', tone: 'CAUTION',
        actions: [{ id: 'open-next-buyer-task', label: 'Open exact next task', href: `${planHref}?taskId=task-cd`, style: 'PRIMARY' }] },
      { type: 'GROUPED_LIST', filters: [], id: 'buyer-plan-actions', title: 'Buyer Plan guidance', presentation: { pattern: 'SHELVES' },
        description: 'Task order, status, and deadlines come from the selected property’s canonical Buyer Plan.',
        sections: [
          { id: 'next', title: 'Do this next', count: 1, items: [task('task-cd', 'Review the Closing Disclosure', 'Compare the current revision with the selected Loan Estimate.', 'Due Aug 20, 2026', 'CAUTION')] },
          { id: 'blockers', title: 'Also watch before closing', count: 2, items: [
            task('task-lender', 'Send the lender the pay stubs', 'The lender still needs two recent pay stubs.', null, 'DEFAULT'),
            task('task-insurance', 'Bind homeowners insurance', 'Proof of coverage is due at closing.', 'Due Aug 22, 2026', 'DEFAULT'),
          ] },
        ], actions: [{ id: 'open-buyer-plan', label: 'View full Buyer Plan', href: planHref, style: 'SECONDARY' }] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.85): the sell, hold and rent scenarios as a comparison strip, with no
// badge, no leading value and no price bars.
function sellHoldRentStripExecution() {
  const base = maintenanceExecution();
  const workspaceHref = `/dashboard/properties/${propertyId}/tools/sell-hold-rent`;
  const option = (id: string, label: string, outcome: string, components: string) => ({
    id, label, summary: null, actions: [],
    attributes: [{ label: 'Modeled outcome', value: outcome, tone: 'DEFAULT' }, { label: 'Key components', value: components, tone: 'DEFAULT' }],
  });
  return {
    ...base, executionId: 'execution-sell-hold-rent-strip', question: 'Should I sell, hold, or rent this home?', viewState: null,
    operation: { id: 'SELL_HOLD_RENT_ANALYSIS', version: '1.0', family: 'DECISION_ANALYSIS' },
    blocks: [
      { type: 'SUMMARY', id: 'sell-hold-rent-summary', title: 'Here is the current 5-year sell, hold, and rent comparison', tone: 'DEFAULT',
        body: 'The model’s directional indicator currently points to selling, but this is not a conclusion that now is the right time to sell.',
        actions: [{ id: 'open-sell-hold-rent', label: 'Explore and adjust scenarios', href: workspaceHref, style: 'PRIMARY' }] },
      { type: 'COMPARISON', id: 'sell-hold-rent-comparison', title: '5-year scenario snapshot',
        description: 'All amounts are planning estimates. Different scenario rows describe different economic outcomes and should be reviewed with the assumptions below.',
        options: [
          option('sell', 'Sell at the end of the horizon', '$412,000 modeled net proceeds', '$455,000 projected price · $27,300 selling costs'),
          option('hold', 'Continue holding', '$18,000 modeled net change', '$90,000 appreciation · $72,000 ownership and modeled interest costs'),
          option('rent', 'Rent the home out', '-$6,500 modeled net change', '$150,000 gross rent · $21,000 vacancy and management overhead'),
        ], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.86): the coverage comparison as a strip: premium bars, protection status,
// no badge and no leading mark.
function coverageComparisonStripExecution() {
  const base = maintenanceExecution();
  const href = `/dashboard/properties/${propertyId}/tools/coverage-options`;
  const attributes = (premium: string, protection: string, tone: string, extra: Array<Record<string, string>> = []) => [
    { label: 'Annual premium', value: premium, tone: 'DEFAULT' },
    { label: 'Protection compared with current', value: protection, tone },
    ...extra,
  ];
  return {
    ...base, executionId: 'execution-coverage-comparison-strip', question: 'Compare my current insurance policy against alternatives', viewState: null,
    operation: { id: 'COVERAGE_COMPARISON_STATUS', version: '1.0', family: 'STATUS_SUMMARY' },
    blocks: [
      { type: 'SUMMARY', id: 'coverage-comparison-summary', title: '2 options compared against your current policy', body: 'Overall status: Different protection.', tone: 'DEFAULT',
        actions: [{ id: 'open-coverage-comparison', label: 'Open coverage comparison', href, style: 'SECONDARY' }] },
      { type: 'COMPARISON', id: 'coverage-comparison-options', title: 'Options',
        description: 'Your current verified policy alongside any alternative quotes or policy terms compared against it. A lower premium is not a better policy when the protection differs.',
        options: [
          { id: 'cur', label: 'Current policy', summary: 'Your current verified policy', amount: { value: 1800, currency: 'USD' }, actions: [],
            attributes: attributes('$1,800/yr', 'Current policy', 'DEFAULT') },
          { id: 'q1', label: 'Harbor Insurance quote', summary: 'Harbor Insurance', amount: { value: 1350, currency: 'USD' }, actions: [],
            attributes: attributes('$1,350/yr', 'Different protection', 'CAUTION', [{ label: 'Differences found', value: '2 differences', tone: 'CAUTION' }, { label: 'Facts to confirm', value: '1 unconfirmed', tone: 'CAUTION' }]) },
        ], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.87): the hypothetical refinance scenario next to the canonical comparison it
// was run against, as a two-option strip with no badge and no bars.
function refinanceScenarioStripExecution() {
  const base = maintenanceExecution();
  const attribute = (label: string, value: string) => ({ label, value, tone: 'DEFAULT' });
  return {
    ...base, executionId: 'execution-refinance-scenario-strip', question: 'What if I refinanced at 5.5% for 15 years?', viewState: null,
    operation: { id: 'REFINANCE_ANALYSIS', version: '1.0', family: 'DECISION_ANALYSIS' },
    blocks: [
      { type: 'SUMMARY', id: 'refinance-scenario-summary', title: 'Illustrative 15-year scenario at 5.500%', tone: 'DEFAULT',
        body: 'This is a hypothetical recalculation only. Nothing was saved, and your recorded mortgage rate and term are unchanged. The current comparison is shown below, unchanged, alongside it.',
        actions: [{ id: 'open-radar', label: 'Explore in Mortgage Refinance Radar', href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`, style: 'PRIMARY' }] },
      { type: 'COMPARISON', id: 'refinance-scenario-table', title: 'Illustrative scenario vs. your current loan',
        description: 'A hypothetical revision, not a lender quote or a saved plan. Your recorded mortgage facts are not changed by asking this, and the current comparison was not recalculated or saved.',
        options: [
          { id: 'current-comparison', label: 'Your current comparison (unchanged)', summary: 'The canonical comparison this scenario was run against', actions: [], attributes: [
            attribute('Your recorded mortgage rate', '6.875%'), attribute('Market benchmark rate', '6.125%'), attribute('Modeled monthly savings', '$210'),
            attribute('Modeled lifetime savings', '$41,000'), attribute('Estimated break-even', '28 months')] },
          { id: 'illustrative-scenario', label: 'Illustrative scenario', summary: 'A hypothetical 15-year loan at 5.500%', actions: [], attributes: [
            attribute('Illustrative target rate', '5.500%'), attribute('Illustrative target term', '15-year'), attribute('Modeled monthly savings', '$333'),
            attribute('Modeled lifetime savings', '$77,000'), attribute('Modeled closing costs', '$6,400'), attribute('Estimated break-even', 'Not reached')] },
        ], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.89): saved upgrade options as one strip per system (two to four options),
// the only badge the homeowner's own Selected decision, and a system with one option left in the list.
function homeUpgradeStripExecution() {
  const base = maintenanceExecution();
  const pageHref = `/dashboard/properties/${propertyId}/tools/home-digital-twin`;
  const option = (id: string, label: string, type: string, upfront: string, savings: string, payback: string, extra: Record<string, unknown> = {}, results = 'Results Ready') => ({
    id, label, summary: type, actions: [],
    attributes: [
      { label: 'Upfront cost', value: upfront, tone: 'DEFAULT' }, { label: 'Annual savings', value: savings, tone: 'DEFAULT' },
      { label: 'Payback', value: payback, tone: 'DEFAULT' }, { label: 'Results', value: results, tone: results === 'Results out of date' ? 'CAUTION' : 'DEFAULT' },
    ], ...extra,
  });
  const selected = { badges: [{ label: 'Selected', basis: 'You chose this option in the Home Upgrade Planner.', policyCode: 'UPGRADE_SCENARIO_SELECTED' }] };
  return {
    ...base, executionId: 'execution-home-upgrade-strip', question: 'Show my upgrade planner options', viewState: null,
    operation: { id: 'HOME_UPGRADE_SCENARIOS', version: '1.0', family: 'RECORD_QUERY' },
    blocks: [
      { type: 'SUMMARY', id: 'home-upgrade-summary', title: '5 saved upgrade options across 3 systems', body: '4 with results ready, 1 selected.', tone: 'DEFAULT',
        actions: [{ id: 'open-home-digital-twin', label: 'Open Home Upgrade Planner', href: pageHref, style: 'PRIMARY' }] },
      { type: 'COMPARISON', id: 'home-upgrade-options-wh', title: 'Basement water heater options',
        description: 'Saved options for this system, from the Home Upgrade Planner. Costs, savings and payback are planning ranges, not quotes.',
        options: [
          option('heatpump', 'Heat pump water heater', 'Replace Component', '$2,800–$4,200', '$450', '6 years', selected),
          option('repair', 'Repair the tank', 'Repair', '$400–$700', 'Not calculated yet', 'Not calculated yet'),
        ], actions: [] },
      { type: 'COMPARISON', id: 'home-upgrade-options-roof', title: 'Roof options',
        description: 'Saved options for this system, from the Home Upgrade Planner. Costs, savings and payback are planning ranges, not quotes.',
        options: [
          option('reroof', 'Full re-roof', 'Replace Component', '$18,000', 'Not calculated yet', 'Not calculated yet', { amount: { value: 18000, currency: 'USD' } }),
          option('patch', 'Patch the north slope', 'Repair', '$4,500', 'Not calculated yet', 'Not calculated yet', { amount: { value: 4500, currency: 'USD' } }, 'Results out of date'),
        ], actions: [] },
      { type: 'GROUPED_LIST', filters: [], id: 'home-upgrade-options', title: 'Upgrade options by system', description: 'Grouped by home system, as on the page. Open the planner for the full comparison.',
        sections: [{ id: 'home-upgrade-ep', title: 'Electrical Panel', count: 1, items: [{ id: 'panel', title: 'Panel upgrade', description: null, meta: ['Upgrade Component'], status: 'Ready', href: pageHref }] }], actions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.90): the capital plan with its upcoming windows on a timeline track. The roof
// window's id is the one the mocked capital-timeline read returns, so its live detail opens; the other window is not in that
// read, so its detail says it no longer exists.
function capitalTimelineTrackExecution() {
  const base = maintenanceExecution();
  const href = `/dashboard/properties/${propertyId}/tools/capital-timeline`;
  const window = (id: string, label: string, date: string, category: { id: string; label: string }, confidence: string, cost: string, range: string) => ({
    id, label, date, datePrecision: 'MONTH', description: null, status: `${confidence} confidence`, href, category, meta: [range, cost],
  });
  return {
    ...base, executionId: 'execution-capital-timeline-track', question: 'What big expenses are coming up for my home?', viewState: null,
    operation: { id: 'CAPITAL_RESERVE_PLAN', version: '1.0', family: 'DECISION_ANALYSIS' },
    blocks: [
      { type: 'SUMMARY', id: 'capital-reserve-summary', title: '2 upcoming capital events are in the current plan', tone: 'DEFAULT',
        body: 'The modeled cost range for the displayed 10-year horizon is $8,900–$13,600.',
        actions: [{ id: 'open-timeline', label: 'Open capital timeline', href, style: 'PRIMARY' }] },
      { type: 'TIMELINE', id: 'capital-timeline-table', title: 'Upcoming capital windows',
        description: 'Windows and ranges come from the canonical Home Capital Timeline; they are not failure dates or vendor quotes. Each sits at the start of its window.',
        items: [
          window('timeline-roof-property-summary', 'Asphalt shingle roof', '2027-01', { id: 'ROOFING', label: 'Roofing' }, 'High', 'Estimated $8,000–$12,000', 'Window Jan 1, 2027–Jun 1, 2027'),
          window('timeline-heater', 'Water heater', '2028-05', { id: 'PLUMBING', label: 'Plumbing' }, 'Medium', 'Estimated $900–$1,600', 'Window May 3, 2028–Apr 30, 2029'),
        ] },
      { type: 'BOUNDARY', id: 'capital-plan-boundary', title: 'Planning range—not a guaranteed expense schedule', body: 'Actual condition, inspections and local prices can move timing and cost.', severity: 'INFO', suggestions: [] },
    ],
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.91): the Property Context's own completeness as a ring, with the three
// least complete areas as next steps (the first with its capture action).
function propertyCompletenessRingExecution() {
  const fill = { id: 'fill-area-core', label: 'Fill in missing details', message: 'Fill in the missing core property details.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE' };
  const step = (id: string, title: string, description: string, status: string, actions?: unknown[]) => ({ id, title, description, meta: [], status, href: `/dashboard/properties/${propertyId}/edit`, entityType: 'PROPERTY_CONTEXT_AREA', ...(actions ? { actions } : {}) });
  return {
    schemaVersion: '1.0', executionId: 'execution-property-completeness-ring', sessionId: 'ask-acceptance-session',
    question: 'How complete is my home record?', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'PROPERTY_SUMMARY', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: null,
    blocks: [
      { type: 'SUMMARY', id: 'property-summary', title: 'Acceptance Home’s Property Context is 62% complete', tone: 'CAUTION', body: '9 missing, 1 conflicted, and 2 stale details were found across 3 areas.',
        actions: [{ id: 'open-property-record', label: 'Review missing details', href: `/dashboard/properties/${propertyId}`, style: 'PRIMARY' }] },
      { type: 'PROGRESS', id: 'property-completeness-progress', title: 'Property record completeness',
        description: 'Counts the governed property facts that apply to this home and are known. Facts that are missing, conflicted or out of date are not counted as known.',
        percent: 62, basis: '31 of 50 applicable facts known across 9 areas',
        metrics: [{ label: 'Missing', value: '9', tone: 'CAUTION' }, { label: 'Conflicted', value: '1', tone: 'CAUTION' }, { label: 'Stale', value: '2', tone: 'CAUTION' }],
        nextSteps: [
          step('CORE', 'Core details', '4 of 10 facts known', '40% COMPLETE', [fill]),
          step('EXTERIOR', 'Exterior', '6 of 11 facts known', '55% COMPLETE'),
          step('SAFETY', 'Safety', '4 of 6 facts known', '67% COMPLETE'),
        ], actions: [] },
      { type: 'GROUPED_LIST', filters: [], id: 'property-completeness', title: 'Areas that can improve', description: 'Internal fact keys are intentionally hidden.',
        sections: [{ id: 'incomplete-scopes', title: 'Property Context completeness', count: 1, items: [step('CORE', 'Core details', '4 of 10 facts known', '40% COMPLETE')] }], actions: [] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// FRD v1.91: the buyer closing-day workspace's five checks as a ring; blockers first, then the checks still to do.
function buyerClosingDayRingExecution() {
  const plan = `/dashboard/properties/${propertyId}/buyer-plan`;
  const step = (id: string, title: string, description: string, status: string) => ({ id, title, description, meta: [], status, href: plan, entityType: null });
  return {
    schemaVersion: '1.0', executionId: 'execution-buyer-closing-day-ring', sessionId: 'ask-acceptance-session',
    question: 'What do I need for closing day?', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'BUYER_CLOSING_DAY_READINESS', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: null,
    blocks: [
      { type: 'SUMMARY', id: 'buyer-closing-day-summary', title: '1 blocker remains before closing day', tone: 'CAUTION', body: 'Confirm your appointment, identification, required documents, funds readiness, and questions before closing day.',
        actions: [{ id: 'open-buyer-plan', label: 'Open Buyer Plan', href: plan, style: 'PRIMARY' }] },
      { type: 'PROGRESS', id: 'buyer-closing-day-progress', title: 'Closing-day readiness',
        description: 'Counts the five checks recorded on your closing-day workspace. Blockers on the Buyer Plan are listed but are not part of the count.',
        percent: 40, basis: '2 of 5 closing-day checks done',
        metrics: [{ label: 'Done', value: '2', tone: 'DEFAULT' }, { label: 'Not yet', value: '3', tone: 'CAUTION' }, { label: 'Blockers', value: '1', tone: 'CAUTION' }],
        nextSteps: [
          step('blocker-stubs', 'Lender needs pay stubs', 'Blocker recorded on the Buyer Plan', 'PENDING'),
          step('closing-day-check-fundsReadinessReviewed', 'Funds readiness reviewed', 'Closing-day check not done yet', 'PENDING'),
          step('closing-day-check-blockersReviewed', 'Blockers reviewed', 'Closing-day check not done yet', 'PENDING'),
        ], actions: [] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (FRD v1.94): the renovation case's blocking readiness items as a ring.
function renovationReadinessRingExecution() {
  const caseHref = `/dashboard/properties/${propertyId}/renovations/case-1/readiness`;
  const step = (id: string, title: string, description: string) => ({ id, title, description, meta: [], status: 'OPEN', href: caseHref, entityType: null });
  return {
    schemaVersion: '1.0', executionId: 'execution-renovation-readiness-ring', sessionId: 'ask-acceptance-session',
    question: 'Is my kitchen remodel ready to start?', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'RENOVATION_PERMIT_READINESS', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: null,
    blocks: [
      { type: 'SUMMARY', id: 'renovation-readiness-summary', title: '2 blocking items remain for Kitchen remodel', tone: 'CAUTION', body: 'This readiness assessment organizes project records and does not establish legal compliance.',
        actions: [{ id: 'open-case', label: 'Open renovation case', href: caseHref, style: 'PRIMARY' }] },
      { type: 'PROGRESS', id: 'renovation-readiness-progress', title: 'Ready to start',
        description: 'Counts the items that block starting the work: a blocking item counts once it is satisfied or its open state was acknowledged. Other open items are listed but not counted, and this does not establish legal compliance.',
        percent: 50, basis: '2 of 4 blocking items satisfied or acknowledged',
        metrics: [{ label: 'Blocking', value: '2', tone: 'CAUTION' }, { label: 'Acknowledged', value: '1', tone: 'DEFAULT' }, { label: 'Other open', value: '1', tone: 'DEFAULT' }],
        nextSteps: [
          step('req-permit', 'Building permit', 'Needed before work starts · Upload the permit'),
          step('req-hoa', 'HOA approval', 'The association must approve exterior changes · Send the HOA form'),
        ], actions: [] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// FRD v1.94: the Home Continuity Plan's handoff requirements as a ring (not the plan's self-reported percent).
function digitalWillRingExecution() {
  const page = `/dashboard/properties/${propertyId}/tools/home-digital-will`;
  const step = (id: string, title: string, description: string) => ({ id, title, description, meta: [], status: 'MISSING', href: page, entityType: null });
  return {
    schemaVersion: '1.0', executionId: 'execution-digital-will-ring', sessionId: 'ask-acceptance-session',
    question: 'Show my home continuity plan', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_DIGITAL_WILL', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: null,
    blocks: [
      { type: 'SUMMARY', id: 'digital-will-summary', title: 'Maple Street plan: In progress, 40% complete', tone: 'CAUTION', body: 'Draft, with 4 entries across 2 sections. Last reviewed Sep 1, 2026.',
        actions: [{ id: 'open-home-digital-will', label: 'Open Home Continuity Plan', href: page, style: 'PRIMARY' }] },
      { type: 'PROGRESS', id: 'digital-will-progress', title: 'Ready to hand off',
        description: 'Counts the three things the plan needs before someone else can take over: an emergency instruction, a primary trusted contact, and a way to reach that contact. Other entries are not counted.',
        percent: 67, basis: '2 of 3 handoff requirements met',
        metrics: [{ label: 'Met', value: '2', tone: 'DEFAULT' }, { label: 'Missing', value: '1', tone: 'CAUTION' }, { label: 'Entries', value: '4', tone: 'DEFAULT' }],
        nextSteps: [step('handoff-primary-contact-method', 'Add an email or phone number for the primary contact.', 'Handoff requirement not met yet')], actions: [] },
    ],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

function maintenanceOutputExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-maintenance-output', sessionId: 'ask-acceptance-session',
    question: 'Show the task output', status: 'COMPLETED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'MAINTENANCE_TASK_CREATE', version: '1.0', family: 'COMMAND' }, contextVersion: 'maintenance-context-v2',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'maintenance-task-created', title: 'Maintenance task created', status: 'COMPLETED',
      description: 'The task is now part of this home’s canonical Maintenance record.',
      details: [{ label: 'Task', value: 'Replace HVAC filter' }, { label: 'Status', value: 'Pending' }], actions: [],
    }, {
      type: 'OUTPUT_ARTIFACTS', id: 'maintenance-output-task-2', title: 'Created record', items: [{
        artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: 'maintenance-task-2', relationship: 'CREATED', label: 'Replace HVAC filter', status: 'PENDING',
        createdAt: '2026-09-18T12:00:00.000Z', navigation: { label: 'Open task in Maintenance', href: `/dashboard/maintenance?propertyId=${propertyId}&taskId=maintenance-task-2&from=ask` },
      }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z',
  };
}

function quoteWorkspaceOutputExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-quote-workspace-output', sessionId: 'ask-acceptance-session',
    question: 'Show the quote workspace output', status: 'COMPLETED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'QUOTE_COMPARISON_CREATE', version: '1.0', family: 'COMMAND' }, contextVersion: 'quote-workspace-context-v2',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: 'quote-workspace-workspace-1', title: 'Existing comparison workspace opened', status: 'COMPLETED',
      description: 'No provider or quote was selected. Add comparable proposals in the governed workspace.',
      details: [{ label: 'Service', value: 'plumbing' }, { label: 'Status', value: 'draft' }], actions: [],
    }, {
      type: 'OUTPUT_ARTIFACTS', id: 'quote-workspace-output-workspace-1', title: 'Workspace record', items: [{
        artifactType: 'QUOTE_COMPARISON_WORKSPACE', artifactId: 'workspace-1', relationship: 'REUSED', label: 'Plumbing quote comparison', status: 'DRAFT',
        createdAt: '2026-09-17T12:00:00.000Z', navigation: { label: 'Open comparison', href: `/dashboard/properties/${propertyId}/tools/quote-comparison?workspaceId=workspace-1` },
      }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z',
  };
}

// IW-PRES-016 (FRD v1.76): the quote review as a comparison strip, three quotes still in play.
function quoteReviewStripExecution() {
  const href = `/dashboard/properties/${propertyId}/tools/quote-comparison?serviceCategory=ROOFING`;
  const quote = (id: string, label: string, value: number, extra: Record<string, unknown> = {}) => ({
    id, label, summary: null, amount: { value, currency: 'USD' },
    attributes: [
      { label: 'Price', value: `USD ${value.toLocaleString('en-US')}`, tone: 'DEFAULT' },
      { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' },
      { label: 'Scope', value: 'Tear off and replace 30 squares of asphalt shingles', tone: 'DEFAULT' },
      { label: 'Warranty', value: '10-year workmanship', tone: 'DEFAULT' },
      { label: 'Freshness', value: 'Quoted Sep 14, 2026', tone: 'DEFAULT' },
      { label: 'Missing facts', value: 'None', tone: 'DEFAULT' },
    ],
    actions: [], ...extra,
  });
  const summit = quote('quote-summit', 'Summit Roofing', 9800);
  summit.attributes[0] = { ...summit.attributes[0], leading: true } as typeof summit.attributes[number];
  return {
    schemaVersion: '1.0', executionId: 'execution-quote-review-strip', sessionId: 'ask-acceptance-session',
    question: 'Compare my roofing quotes', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'QUOTE_COMPARISON_REVIEW', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: '2026-09-24T12:00:00.000Z',
    blocks: [{
      type: 'SUMMARY', id: 'quote-review-summary', title: '3 proposals are ready for a scope-aligned review', tone: 'DEFAULT',
      body: 'The confirmed proposals share the same category, work type, location, and itemized scope. Recorded prices range from $9,800 to $12,400.',
      actions: [{ id: 'open-comparison', label: 'Open quote comparison', href, style: 'PRIMARY' }],
    }, {
      type: 'COMPARISON', id: 'quote-review-table', title: 'Recorded proposals',
      description: 'Ask preserves the canonical readiness state and does not select a provider. 1 rejected quote is not shown; open the quote comparison to see it.',
      options: [
        quote('quote-acme', 'Acme Roofing', 12400),
        { ...summit, badges: [{ label: 'Lowest price', policyCode: 'QUOTE_LOWEST_PRICE_SCOPE_ALIGNED', basis: 'The lowest recorded total among the comparison-ready proposals, which cover the same confirmed scope. It is not a recommendation: check exclusions, warranty and payment terms.' }] },
        quote('quote-ridge', 'Ridge Line Roofing', 11000, { attributes: [
          { label: 'Price', value: 'USD 11,000', tone: 'DEFAULT' },
          { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' },
          { label: 'Scope', value: 'Tear off and replace 30 squares of asphalt shingles', tone: 'DEFAULT' },
          { label: 'Warranty', value: 'Not recorded', tone: 'DEFAULT' },
          { label: 'Freshness', value: 'Expired Sep 23, 2026', tone: 'CAUTION' },
          { label: 'Missing facts', value: 'None', tone: 'DEFAULT' },
        ] }),
      ],
      actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'quote-review-gaps', title: 'Comparison controls', description: 'Resolve scope or fact gaps in the canonical workspace before making a decision.', filters: [], actions: [],
      sections: [{ id: 'controls', title: 'Aligned comparison', count: 1, items: [{ id: 'quote-reason-0', title: 'The confirmed proposals share the same category, work type, location, and itemized scope.', description: null, meta: [], status: 'COMPARABLE', href }] }],
    }, {
      type: 'BOUNDARY', id: 'quote-review-boundary', title: 'Comparison support—not provider endorsement', severity: 'INFO', suggestions: [],
      body: 'Verify scope, credentials, insurance, references, permits, warranties, payment milestones, and final terms. Ask does not accept a quote, rank provider trust, or guarantee workmanship.',
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: ['What makes these quotes incomparable?'],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// IW-PRES-017 (FRD v1.77): the Home Timeline answer on the track, with one undated event listed under it.
function homeTimelineTrackExecution() {
  const page = `/dashboard/properties/${propertyId}/timeline`;
  const item = (id: string, label: string, date: string, datePrecision: 'DAY' | 'MONTH' | 'YEAR', category: { id: string; label: string }, meta: string[], status = 'Unverified', description: string | null = null) => ({
    id, label, date, datePrecision, description, status, href: `${page}?eventId=${id}`, category, entityType: 'HOME_EVENT', meta,
  });
  const work = { id: 'work', label: 'Work done' };
  return {
    schemaVersion: '1.0', executionId: 'execution-home-timeline-track', sessionId: 'ask-acceptance-session',
    question: 'Show my home timeline history', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_TIMELINE_EVENTS', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'home-timeline-summary', title: '6 events on the home timeline', tone: 'DEFAULT',
      body: '3 confirmed or verified by evidence. Most recent event: Jun 15, 2024.',
      actions: [{ id: 'open-home-timeline', label: 'Open Home Timeline', href: page, style: 'PRIMARY' }],
    }, {
      type: 'TIMELINE', id: 'home-timeline-events', title: 'Home timeline',
      description: 'Each event sits at its recorded date; a month or a year is shown as recorded, and a range at its start. Open an event on the timeline for its evidence and revisions.',
      items: [
        item('kitchen', 'Kitchen remodel', '2024-06-15', 'DAY', work, ['Improvement', 'Highlight'], 'Evidence Verified', 'New cabinets and counters.'),
        item('paint', 'Paint colours chosen', '2024-02', 'MONTH', { id: 'records', label: 'Records and notes' }, ['Note']),
        item('inspection', 'Home inspection', '2023', 'YEAR', { id: 'inspections', label: 'Inspections' }, ['Inspection'], 'Homeowner Confirmed'),
        item('claim', 'Water damage claim', '2021-09-03', 'DAY', { id: 'claims', label: 'Claims' }, ['Claim'], 'Evidence Verified'),
        item('purchase', 'Home purchased', '2018-05-20', 'DAY', { id: 'purchases', label: 'Purchases and value' }, ['Purchase']),
      ],
    }, {
      type: 'GROUPED_LIST', id: 'home-timeline-undated', title: 'Date unknown', description: 'These events have no recorded date, so they are not placed on the timeline.', filters: [], actions: [],
      sections: [{ id: 'home-timeline-date-unknown', title: 'Date unknown', count: 1, items: [{ id: 'roof', title: 'Old roof work', description: null, meta: ['Date unknown', 'Repair'], status: 'Disputed', href: `${page}?eventId=roof` }] }],
    }, {
      type: 'BOUNDARY', id: 'home-timeline-boundary', title: 'History as recorded', severity: 'INFO', suggestions: [],
      body: 'Events are shown as they were recorded, with how well each is verified and how precise its date is. Unverified and inferred events have not been confirmed. Private events recorded by other household members are not shown.',
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: ['What changed at my home recently?'],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// IW-PRES-018 (FRD v1.78): Appliance Oracle as lifespan bars, with one appliance missing its purchase date.
function applianceLifespanExecution() {
  const addDate = { id: 'correct-purchasedOn', label: 'Add purchase date', message: 'Correct the purchase date of this inventory item.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'INVENTORY_ITEM_CORRECT' };
  return {
    schemaVersion: '1.0', executionId: 'execution-appliance-lifespan', sessionId: 'ask-acceptance-session',
    question: 'Show my appliance lifespans', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'APPLIANCE_FAILURE_RISK', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'appliance-oracle-summary', title: '3 appliances analysed', tone: 'CAUTION',
      body: '1 critical and 0 high risk. Replacing those would cost an estimated $800. Replacement model suggestions are on the Appliance Oracle page.',
      actions: [{ id: 'open-appliance-oracle', label: 'Open Appliance Oracle for AI replacement picks', href: `/dashboard/oracle?propertyId=${propertyId}`, style: 'PRIMARY' }],
    }, {
      type: 'LIFESPAN', id: 'appliance-oracle-items', title: 'Appliance lifespans',
      description: 'Each bar shows the appliance\'s age against its typical life. The label is the Appliance Oracle\'s own failure-risk level.',
      basis: 'An estimate from each appliance\'s purchase date and a typical lifespan for its type, not an inspection.',
      items: [
        { id: 'item-fridge', label: 'Refrigerator', ageYears: 4, typicalLifeYears: { min: 11, max: 15 }, status: 'WITHIN_RANGE', statusLabel: 'Low · 3% failure risk', entityType: 'INVENTORY_ITEM', meta: ['About 9 years left, around Sep 2035', 'Replacement about $1,800'] },
        { id: 'item-dishwasher', label: 'Dishwasher', ageYears: 12, typicalLifeYears: { min: 8, max: 12 }, status: 'PAST_RANGE', statusLabel: 'Critical · 64% failure risk', entityType: 'INVENTORY_ITEM', meta: ['Past its expected life', 'Replacement about $800', 'Replace immediately to avoid emergency failure and higher costs'] },
        { id: 'item-water-heater', label: 'Water heater', ageYears: 9, typicalLifeYears: { min: 8, max: 12 }, status: 'PLAN_AHEAD', statusLabel: 'Medium · 35% failure risk', entityType: 'INVENTORY_ITEM', meta: ['About 1 year left, around Sep 2027', 'Replacement about $1,500'] },
      ],
      missingAge: [{ id: 'item-dryer', label: 'Dryer', entityType: 'INVENTORY_ITEM', actions: [addDate] }],
      missingAgeTitle: 'No purchase date yet for this appliance',
    }, {
      type: 'BOUNDARY', id: 'appliance-oracle-boundary', title: 'An educational estimate by age', severity: 'INFO', suggestions: [],
      body: 'Risk comes from each appliance\'s age against a typical lifespan, not an inspection. Replacement costs are educational estimates.',
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: ['When should I replace my water heater?'],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// IW-PRES-019 (FRD v1.79): the home record's rooms as a room map. Kitchen is the room whose live detail is mocked.
function roomMapExecution() {
  const rename = { id: 'rename-room', label: 'Rename room', message: 'Rename this room.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'ROOM_RENAME' };
  const room = (id: string, title: string, floorLevel: number | null, countLabel: string, badgeLabel?: string) => ({
    id, title, entityType: 'INVENTORY_ROOM', description: null, status: null, href: null, floorLevel, countLabel,
    ...(badgeLabel ? { badgeLabel, tone: 'CAUTION' } : {}), meta: [title, countLabel, ...(badgeLabel ? [badgeLabel] : []), 'Updated Sep 1, 2026'], actions: [rename],
  });
  return {
    schemaVersion: '1.0', executionId: 'execution-room-map', sessionId: 'ask-acceptance-session',
    question: 'Show the rooms in my home record', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'PROPERTY_SUMMARY', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'property-summary', title: 'Acceptance Home', tone: 'DEFAULT', body: 'Five rooms are recorded.', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'property-rooms', title: 'Rooms', filters: [], presentation: { pattern: 'ROOM_MAP' },
      description: 'Select a room to inspect its current canonical details without leaving Ask Cozy.',
      sections: [{ id: 'rooms', title: 'Recorded rooms', count: 5, items: [
        room('room-property-summary', 'Kitchen', 0, '8 items', '2 open tasks'),
        room('room-den', 'Den', 0, '3 items'),
        room('room-primary', 'Primary bedroom', 1, '5 items'),
        room('room-office', 'Office', 1, '4 items', '1 open task'),
        room('room-garage', 'Garage', null, '1 item'),
      ] }],
      actions: [{ id: 'open-rooms', label: 'Open Rooms', href: `/dashboard/properties/${propertyId}/rooms`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

// IW-PRES-020 (FRD v1.80): seller-prep's sale readiness ring above the checklist.
function sellerPrepProgressExecution() {
  const decision = (id: string, label: string, message: string) => ({ id, label, message, style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'SELLER_PREP_ITEM_DECISION' });
  const pursue = decision('sale-item-pursue', 'Pursue before listing', 'Pursue this seller-prep checklist item.');
  const waive = decision('sale-item-waive', 'Disclose and waive', 'Waive this seller-prep checklist item.');
  const href = (id: string) => `/dashboard/properties/${propertyId}/tools/sale-case?focusItemId=${id}`;
  const step = (id: string, title: string, description: string, amountLabel: string | null) => ({ id, title, description, amountLabel, meta: [], status: 'OPEN', href: href(id), entityType: 'SALE_READINESS_ITEM', actions: [pursue, waive] });
  return {
    schemaVersion: '1.0', executionId: 'execution-seller-prep-progress', sessionId: 'ask-acceptance-session',
    question: 'How ready is my home to sell', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'SELLER_PREP_CHECKLIST', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'seller-prep-summary', title: 'Your seller-prep checklist', tone: 'DEFAULT', body: '3 open items, 1 already in progress, 1 waived.',
      actions: [{ id: 'open-seller-prep', label: 'Open sale readiness checklist', href: `/dashboard/properties/${propertyId}/tools/sale-case`, style: 'SECONDARY' }],
    }, {
      type: 'PROGRESS', id: 'seller-prep-progress', title: 'Sale readiness',
      description: 'Counts the must-address items: material blockers, items that need verifying, and professional decisions. Optional improvements and presentation work are listed below but not counted.',
      percent: 50, basis: '3 of 6 must-address items resolved or disclosed',
      metrics: [{ label: 'Open', value: '2', tone: 'CAUTION' }, { label: 'Pursuing', value: '1', tone: 'DEFAULT' }, { label: 'Waived', value: '1', tone: 'DEFAULT' }],
      nextSteps: [
        step('blocker-open', 'Repair the cracked foundation wall', 'Safety & structural · Blocks a sale', '$5,000–$9,000 estimated'),
        step('verify-open', 'Confirm the deck permit', 'Permits & disclosure · Needs verifying', null),
      ],
      actions: [],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: ['What should I prioritize first?'],
    createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z',
  };
}

function relatedRecordsExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-related-records', sessionId: 'ask-acceptance-session',
    question: 'Show the evidence relationship', status: 'COMPLETED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'CAPTURE_EVIDENCE_CONFIRM', version: '1.0', family: 'COMMAND' }, contextVersion: 'timeline-context-v2',
    blocks: [{
      type: 'SUMMARY', id: 'evidence-attached', title: 'Attached to your home timeline', tone: 'POSITIVE',
      body: 'Roof invoice.pdf is now attached as evidence on your home timeline.', actions: [],
    }, {
      type: 'RELATED_RECORDS', id: 'evidence-related-records-link-1', title: 'Related records', relationships: [{
        relationshipType: 'DOCUMENT_EVIDENCE_FOR_HOME_EVENT',
        source: { recordType: 'DOCUMENT', recordId: 'document-1', label: 'Roof invoice.pdf' },
        target: { recordType: 'HOME_EVENT', recordId: 'event-1', label: 'Roof replacement' },
        navigation: { label: 'Open home timeline', href: `/dashboard/properties/${propertyId}/timeline` },
      }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z',
  };
}

function adaptiveTableExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-adaptive-table', sessionId: 'ask-acceptance-session',
    question: 'Compare ownership costs', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'OWNERSHIP_COSTS', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: 'ownership-cost-context-v1',
    viewState: { resultId: 'adaptive-table-result', domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null, revision: 1 },
    blocks: [{
      type: 'TABLE', id: 'ownership-cost-categories', title: 'Cost by category', description: 'Recorded annual ownership costs.',
      columns: [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Annual amount' }, { key: 'source', label: 'Source' }],
      rows: [
        { id: 'tax', values: { category: 'Property tax', amount: '$6,200', source: 'Tax record' } },
        { id: 'insurance', values: { category: 'Insurance', amount: '$1,900', source: 'Policy' } },
      ],
      totalCount: 3,
      actions: [{ id: 'open-costs', label: 'Open ownership costs', href: `/dashboard/ownership-costs?propertyId=${propertyId}`, style: 'SECONDARY' }],
    }, {
      type: 'EVIDENCE', id: 'ownership-cost-evidence', title: 'Sources for these costs',
      items: [
        { label: '2026 property tax assessment', source: 'County assessor', observedAt: '2026-08-14T12:00:00.000Z', claim: { targetBlockId: 'ownership-cost-categories', targetItemId: 'tax', text: 'Property tax: $6,200 per year.' } },
        { label: 'Home insurance premium', source: 'Recorded insurance policy', observedAt: '2026-09-01T12:00:00.000Z', claim: { targetBlockId: 'ownership-cost-categories', targetItemId: 'insurance', text: 'Insurance: $1,900 per year.' } },
      ],
    }, {
      type: 'ASSUMPTIONS', id: 'ownership-cost-assumptions', title: 'Assumptions used',
      items: ['Recorded insurance premiums remain representative for this planning view.'],
    }, {
      type: 'LIMITATION', id: 'ownership-cost-limitation', title: 'Planning limitation',
      body: 'Future taxes and premiums may differ from the recorded amounts.', severity: 'CAUTION',
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: true, entity: false, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function comparisonStripExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-comparison-strip', sessionId: 'ask-acceptance-session',
    question: 'Compare repair options', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'REPLACEMENT_GUIDANCE', version: '1.0', family: 'DECISION' }, contextVersion: 'replacement-context-v1',
    viewState: { resultId: 'comparison-strip-result', domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null, revision: 1 },
    blocks: [{
      type: 'COMPARISON', id: 'refrigerator-options', title: 'Compare refrigerator options', description: 'Planning estimates based on the recorded refrigerator and current assumptions.',
      options: [
        {
          id: 'repair', label: 'Repair', summary: 'Address the current failure and retain the appliance.',
          badge: { label: 'Lowest upfront cost', basis: 'The recorded $650 repair estimate is lower than the modeled replacement estimate.', policyCode: 'LOWEST_RECORDED_UPFRONT_COST' },
          attributes: [
            { label: 'Estimated cost', value: '$650', tone: 'POSITIVE' },
            { label: 'Expected useful life', value: '2–3 years', tone: 'CAUTION' },
          ],
          actions: [{ id: 'review-repair', label: 'Review repair', message: 'Review the repair option for my refrigerator', operationId: 'REPLACEMENT_GUIDANCE', interactionType: 'START_WORKFLOW', style: 'PRIMARY' }],
        },
        {
          id: 'replace', label: 'Replace', summary: 'Install a comparable efficient refrigerator.',
          badge: { label: 'Longest horizon', basis: 'Replacement has the longest modeled useful-life range among these options.', policyCode: 'LONGEST_MODELED_USEFUL_LIFE' },
          attributes: [
            { label: 'Estimated cost', value: '$2,400', tone: 'CAUTION' },
            { label: 'Expected useful life', value: '10–12 years', tone: 'POSITIVE' },
          ],
          actions: [{ id: 'review-replacement', label: 'Review replacement', message: 'Review the replacement option for my refrigerator', operationId: 'REPLACEMENT_GUIDANCE', interactionType: 'START_WORKFLOW', style: 'PRIMARY' }],
        },
        {
          id: 'monitor', label: 'Monitor', summary: 'Defer work and watch for a material condition change.',
          attributes: [
            { label: 'Estimated cost', value: '$0 now', tone: 'DEFAULT' },
            { label: 'Failure risk', value: 'Higher uncertainty', tone: 'CRITICAL' },
          ],
          actions: [{ id: 'review-monitoring', label: 'Review monitoring', message: 'Review the monitoring option for my refrigerator', operationId: 'REPLACEMENT_GUIDANCE', interactionType: 'START_WORKFLOW', style: 'PRIMARY' }],
        },
      ],
      actions: [],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: true, entity: true, homeRecord: false, retryResponse: false }, suggestions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function execution(kind: 'refrigerator' | 'refinance', captured = false) {
  const capture = kind === 'refrigerator' ? {
    requirementId: 'repair-replace:refrigerator:lifecycle', captureKey: 'INVENTORY_ITEM_LIFECYCLE_UPDATE', classification: 'ENHANCEMENT_ACCURACY', state: 'UNKNOWN',
    title: 'Improve refrigerator lifecycle estimate', question: 'About when was the refrigerator installed, and what condition is it in?', helpText: 'Approximate dates are welcome.',
    inputSchema: { type: 'RELATIONAL_UPDATE', entityType: 'INVENTORY_ITEM', entityId: 'fridge-1', updateLabel: 'Save item details', currentValues: {}, fields: [
      { key: 'condition', label: 'Current condition', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Good', value: 'GOOD' }, { label: 'Fair', value: 'FAIR' }] } },
      { key: 'purchasedOn', label: 'Purchase date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' } },
    ] },
    allowNotSure: true, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null, fallbackHref: `/dashboard/properties/${propertyId}/inventory`, expectedContextVersion: 'context-v1',
  } : {
    requirementId: 'refinance:profile', captureKey: 'FINANCING_PROFILE_REFINANCE_INPUTS', classification: 'REQUIRED_CALCULATION', state: 'UNKNOWN',
    title: 'Add current mortgage details', question: 'Add the minimum details needed to evaluate refinancing.', helpText: null,
    inputSchema: { type: 'GROUP', fields: [
      { key: 'currentMortgageBalanceUsd', label: 'Mortgage balance', required: true, inputSchema: { type: 'DECIMAL', min: 1000, max: 100000000, unit: 'USD' } },
      { key: 'interestRatePct', label: 'Current interest rate', required: true, inputSchema: { type: 'DECIMAL', min: 0.01, max: 30, unit: '%' } },
      { key: 'remainingTermYears', label: 'Remaining term', required: true, inputSchema: { type: 'DECIMAL', min: 1, max: 50, unit: 'years' } },
    ] },
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: null, confirmationText: 'Save these details to my Financing Profile.', fallbackHref: `/dashboard/properties/${propertyId}/tools/financing/profile`, expectedContextVersion: 'context-v1',
  };
  return {
    schemaVersion: '1.0', executionId: `execution-${kind}`, sessionId: 'ask-acceptance-session', question: kind === 'refrigerator' ? 'When should I replace my refrigerator?' : 'Is refinancing a good option?',
    status: captured ? 'ANSWERED' : 'NEEDS_CONTEXT', property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: kind === 'refrigerator' ? 'REPLACEMENT_GUIDANCE' : 'REFINANCE_ANALYSIS', version: '1.0', family: 'DECISION' },
    contextVersion: captured ? 'context-v2' : 'context-v1', blocks: [{ type: 'SUMMARY', id: 'summary', title: captured ? 'Updated answer' : 'A little more context will improve this answer', body: captured ? 'The saved home details were applied automatically.' : 'Complete the inline card to continue.', tone: 'DEFAULT', actions: [] }],
    skill: null, skillHandoff: null, captureRequests: captured ? [] : [capture], confirmation: null, clarification: null,
    correctionCapabilities: { intent: true, entity: true, homeRecord: true, retryResponse: false },
    suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// The calm presentation is the default (FRD v1.111). Every spec that checks the previous presentation pins the setting off
// for each page load; `calm.spec.ts` asks for the default instead.
export async function installAskContext(context: BrowserContext, options: { calm?: 'legacy' | 'default' } = {}) {
  if ((options.calm ?? 'legacy') === 'legacy') {
    await context.addInitScript(() => { try { window.localStorage.setItem('ctc:ask-calm-answers', '0'); } catch { /* storage unavailable */ } });
  }
  await context.addCookies([{ name: 'ctc.at', value: 'ask-acceptance-token', domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Strict' }]);
}

export async function installAskApi(page: Page, options: { conflictOnce?: boolean; permissionDenied?: boolean; maintenanceDetailAccessLost?: boolean; noDecision?: boolean; heatAttention?: boolean; duplicateRefrigerator?: boolean; recentSessions?: boolean; recentSessionsPages?: boolean; searchSessions?: boolean; allHomeSessions?: boolean; pendingWork?: boolean; repeatedSuggestion?: boolean; inventoryDetailNotFound?: boolean; inventoryDetailAccessLost?: boolean } = {}) {
  activeSessionId = null;
  const captureBodies: Array<Record<string, unknown>> = [];
  const executionQuestions: string[] = [];
  const executionBodies: Array<Record<string, unknown>> = [];
  const correctionEditBodies: Array<{ confirmationVersion: number; edits: Record<string, string> }> = [];
  const correctionConfirmBodies: Array<Record<string, unknown>> = [];
  let correctionSessionId: string | undefined;
  const warrantyAddCaptureBodies: Array<Record<string, unknown>> = [];
  const addCaptureBodies: Array<Record<string, unknown>> = [];
  const monitorPatchBodies: Array<Record<string, unknown>> = [];
  let captureAttempts = 0;
  let pendingDismissed = false;
  await page.route(`${apiOrigin}/api/csrf-token`, (route) => fulfill(route, { csrfToken: 'ask-acceptance-csrf' }));
  await page.route(`${apiOrigin}/api/properties*`, (route) => fulfill(route, { success: true, data: { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] } }));
  await page.route(`${apiOrigin}/api/maintenance-tasks/maintenance-task-1`, (route) => options.maintenanceDetailAccessLost
    ? fulfill(route, { success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'Access to this home changed.' } }, 403)
    : fulfill(route, { success: true, data: {
      id: 'maintenance-task-1', propertyId, title: 'Service the heat pump', description: 'Annual preventive service for the recorded HVAC system.', status: 'PENDING', priority: 'HIGH', source: 'USER_CREATED',
      assetType: 'HVAC', riskLevel: null, nextDueDate: '2026-10-01T00:00:00.000Z', isRecurring: true, frequency: 'ANNUALLY', lastCompletedDate: null,
      estimatedCost: 250, actualCost: null, serviceCategory: 'HVAC', serviceProviderId: null, bookingId: null, inventoryItemId: null, warrantyId: null,
      seasonalChecklistItemId: null, actionKey: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-17T00:00:00.000Z', completedAt: null,
    } }));
  // inventoryDetailNotFound/inventoryDetailAccessLost: both are 404s that share the same HTTP status --
  // InventoryItemDetail distinguishes them by the response body's error code (ITEM_NOT_FOUND), not status alone.
  // See InventoryResultList.tsx's own errorCode comment.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/inventory/items/item-property-summary`, (route) => options.inventoryDetailNotFound
    ? fulfill(route, { success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found.' } }, 404)
    : options.inventoryDetailAccessLost
      ? fulfill(route, { success: false, error: { code: 'PROPERTY_ACCESS_DENIED', message: 'Property not found or access denied.' } }, 404)
      : fulfill(route, { success: true, data: { item: {
        id: 'item-property-summary', propertyId, roomId: null, warrantyId: null, insurancePolicyId: null, name: 'Water heater', category: 'PLUMBING', condition: 'GOOD',
        brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', installedOn: '2022-01-15T00:00:00.000Z', purchasedOn: '2022-01-10T00:00:00.000Z', lastServicedOn: null,
        purchaseCostCents: 85000, replacementCostCents: 120000, currency: 'USD', notes: 'Tank-style, in basement utility closet.', tags: [], sourceHash: null,
        coverageNotRequired: false, isVerified: true, documents: [], warranty: null, createdAt: '2022-01-15T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      } } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/inventory/items/item-smoke-kitchen`, (route) => fulfill(route, { success: true, data: { item: {
    id: 'item-smoke-kitchen', propertyId, roomId: null, warrantyId: null, insurancePolicyId: null, name: 'Kitchen smoke detector', category: 'SAFETY', condition: 'GOOD',
    brand: 'Kidde', model: 'PI2010', serialNo: 'SN-SMOKE-1', installedOn: '2024-03-01T00:00:00.000Z', purchasedOn: '2024-03-01T00:00:00.000Z', lastServicedOn: null,
    purchaseCostCents: 2500, replacementCostCents: 2500, currency: 'USD', notes: 'Ceiling-mounted, above the range.', tags: [], sourceHash: null,
    coverageNotRequired: true, isVerified: true, documents: [], warranty: null, createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z',
  } } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/inventory/items/item-smoke-hallway`, (route) => fulfill(route, { success: true, data: { item: {
    id: 'item-smoke-hallway', propertyId, roomId: null, warrantyId: null, insurancePolicyId: null, name: 'Hallway smoke detector', category: 'SAFETY', condition: 'GOOD',
    brand: 'First Alert', model: 'SC7010B', serialNo: 'SN-SMOKE-2', installedOn: '2024-03-01T00:00:00.000Z', purchasedOn: '2024-03-01T00:00:00.000Z', lastServicedOn: null,
    purchaseCostCents: 3200, replacementCostCents: 3200, currency: 'USD', notes: 'Combination smoke/CO alarm outside the bedrooms.', tags: [], sourceHash: null,
    coverageNotRequired: true, isVerified: true, documents: [], warranty: null, createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
  } } }));
  // No single-line-item GET exists on the real backend either -- ReserveAllocationDetail re-fetches the whole
  // list and finds its own id, the same pattern as Household/Warranty detail.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/reserve-fund/line-items`, (route) => fulfill(route, { success: true, data: { lineItems: [{
    id: 'line-property-summary', fundId: 'fund-property-summary', timelineItemId: 'timeline-property-summary', status: 'ACTIVE',
    targetCostCents: 120000, allocatedMonthlyCents: 2500, allocatedBalanceCents: 45000, retiredAt: null, retiredReason: null, retiredEvidenceRef: null,
    timelineItem: {
      id: 'timeline-property-summary', inventoryItemId: 'item-property-summary', category: 'PLUMBING', eventType: 'REPLACEMENT',
      windowStart: '2027-01-01T00:00:00.000Z', windowEnd: '2027-06-01T00:00:00.000Z', estimatedCostMinCents: 100000, estimatedCostMaxCents: 140000,
      why: 'Typical service life for this water heater type is 10-12 years; it was installed 5 years ago.',
      inventoryItem: { name: 'Water heater', condition: 'GOOD', installedOn: '2022-01-15T00:00:00.000Z', purchasedOn: '2022-01-10T00:00:00.000Z' },
    },
  }] } }));
  // capital-timeline-table row-click-to-detail platform capability: same list-scan exception as
  // reserve-fund/line-items above -- capitalTimelineApi.getLatestTimeline has no per-item GET, only the whole
  // analysis, so CapitalWindowDetail re-fetches it and finds its own id.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/capital-timeline`, (route) => fulfill(route, { success: true, data: {
    analysis: {
      id: 'analysis-property-summary', status: 'READY', confidence: 'HIGH', horizonYears: 10, summary: null, computedAt: '2026-09-22T12:00:00.000Z',
      items: [{
        id: 'timeline-roof-property-summary', inventoryItemId: null, category: 'ROOFING', eventType: 'REPLACEMENT',
        windowStart: '2027-01-01T00:00:00.000Z', windowEnd: '2027-06-01T00:00:00.000Z',
        estimatedCostMinCents: 800000, estimatedCostMaxCents: 1200000, currency: 'USD', confidence: 'HIGH', priority: 'HIGH',
        why: 'Typical service life for asphalt shingle roofing is 20-25 years; this roof was installed 22 years ago.',
        missingFactors: [], inventoryItem: null,
      }],
    },
    assumptionSetId: null, nextAction: null,
  } }));
  // The live task is already in progress (the list said pending); it is still open, so Mark complete is offered.
  await page.route(`${apiOrigin}/api/home-buyer-tasks/properties/${propertyId}/tasks/task-appraisal`, (route) => fulfill(route, { success: true, data: {
    id: 'task-appraisal', title: 'Order the appraisal', description: 'Your lender orders the appraisal once the loan is in process.', status: 'IN_PROGRESS', applicability: 'APPLICABLE',
    priority: 'NOW', phase: 'DUE_DILIGENCE', blocking: true, required: true, statusReason: null, notes: null, dueAt: '2026-10-10T00:00:00.000Z', estimatedCostCents: 60000,
  } }));
  let monitorStatus = 'ACTIVE';
  await page.route(`${apiOrigin}/api/ask/monitors/monitor-30`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      monitorPatchBodies.push(body);
      monitorStatus = body.action === 'PAUSE' ? 'PAUSED' : body.action === 'STOP' ? 'STOPPED' : 'ACTIVE';
    }
    await fulfill(route, { success: true, data: { id: 'monitor-30', status: monitorStatus } });
  });
  // The live item is already being pursued (someone pursued it after the list was read), so Stop pursuing is offered.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/sale-case`, (route) => fulfill(route, { success: true, data: {
    propertyId, saleIntentConfirmed: true, canCreate: false, saleCase: { id: 'case-1' }, transitions: [],
    readinessItems: [{
      id: 'item-door', saleCaseId: 'case-1', sourceEntityType: 'PRESENTATION', sourceEntityId: 'front-door', category: 'PRESENTATION', requirementClass: 'OPTIONAL_IMPROVEMENT',
      status: 'PURSUING', title: 'Paint the front door', detail: 'A fresh front door is a low-cost first impression.', dueAt: null, canonicalWorkItemId: null, resolvedAt: null,
      waivedAt: null, waivedReason: null, estimatedCostMinCents: 20000, estimatedCostMaxCents: 40000, estimatedValueAddMinCents: null, estimatedValueAddMaxCents: null, recommendedForBudget: true,
    }],
  } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/inspection-hub/reports/report-roof/findings`, (route) => fulfill(route, { success: true, data: { findings: [{
    id: 'finding-roof', reportId: 'report-roof', propertyId, homeSystem: 'ROOF', location: 'North slope', conditionRating: 'POOR', severity: 'MAJOR',
    inspectorDescription: 'Several shingles are missing on the north slope.', inspectorRecommendation: 'Replace the missing shingles.', aiInterpretation: '',
    estimatedCostCentsLow: 30000, estimatedCostCentsHigh: 60000, extractionConfidence: 'HIGH', status: 'OPEN', workDisposition: 'ACCEPTED',
    photoKeys: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
  }] } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/claims/claim-kitchen-leak`, (route) => fulfill(route, { success: true, data: {
    id: 'claim-kitchen-leak', propertyId, title: 'Kitchen leak', description: 'Water under the kitchen sink damaged the cabinet floor.', type: 'WATER_DAMAGE', status: 'DRAFT',
    providerName: 'Acme Insurance', claimNumber: null, incidentAt: '2026-09-01T00:00:00.000Z', submittedAt: null, estimatedLossAmount: '2500', deductibleAmount: '1000', settlementAmount: null,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z', checklistItems: [], timelineEvents: [], documents: [], checklistCompletionPct: 0,
  } }));
  // radarQueryService.getDetail has a real single-match GET (unlike reserve-fund/warranty/household above) --
  // its own genuine 404 (RADAR_MATCH_NOT_FOUND) is real, not a list-scan data-absence state.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/radar/events/match-property-summary`, (route) => fulfill(route, { success: true, data: {
    id: 'match-property-summary', propertyMatchId: 'match-property-summary', eventId: 'event-radar-property-summary', eventType: 'SEVERE_THUNDERSTORM_WARNING',
    sourceFamily: 'weather', title: 'severe thunderstorm warning', summary: 'A severe thunderstorm warning is in effect for this area.',
    severity: 'high', impact: 'moderate', confidence: 'high', priorityBand: 'high', priorityScore: 0.82,
    matchLifecycleStatus: 'active', sourceFreshnessStatus: 'fresh', sourceFreshnessReason: null,
    isSourceStale: false, isMaterialUpdate: false, lifecycleStatus: 'active',
    effectiveAt: '2026-09-22T12:00:00.000Z', expiresAt: '2026-09-22T18:00:00.000Z',
    sourceName: 'National Weather Service', provider: 'NOAA', userState: 'new',
    geography: null,
    matchExplanation: { matcherVersion: 'v1', matchedAt: '2026-09-22T11:00:00.000Z', matchType: 'geofence', confidence: 'high', homeownerExplanation: 'This storm cell tracks over your recorded property location.', reasons: ['Within the active warning polygon'], propertyFactsUsed: ['property.location'] },
    impactSummary: 'Expect heavy rain and possible hail through this evening.',
    impactFactors: null, matchedSystems: [],
    recommendedActions: [{
      code: 'SECURE_OUTDOOR_ITEMS', label: 'Secure outdoor furniture and loose items', priority: 'high',
      registryVersion: 'radar-actions-v1', completionEvidence: 'user_attestation', safetyClassification: 'property_protection',
      targetCapability: null, supportedTaskOperations: ['create_task', 'create_reminder'], taskLink: null,
      destination: { kind: 'informational', purpose: null, label: null, href: null },
    }],
    compoundInsights: [], canonicalUrl: null, observedAt: '2026-09-22T11:00:00.000Z',
    revision: { observedAt: '2026-09-22T11:00:00.000Z', receivedAt: '2026-09-22T11:00:00.000Z', materialUpdatedAt: null },
    sourceEvidence: { providerEventId: 'nws-123', providerRevision: '1', revisionIdentity: null },
    missingFacts: [], propertyGeographyVersion: 1, matcherVersion: 'v1',
    relatedIncident: null, relatedGuidance: null,
    resolutionContinuity: { state: 'not_started', incidentState: null, guidanceState: null, continueResolution: null },
    userFeedback: null,
  } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/warranties`, (route) => fulfill(route, { success: true, data: { warranties: [{
    id: 'warranty-property-summary', homeownerProfileId: 'profile-0', propertyId, inventoryItemId: null, category: 'HOME_WARRANTY_PLAN', providerName: 'Acme Home Warranty',
    policyNumber: 'POL-123', coverageDetails: 'Covers HVAC and major appliances.', cost: 45000, startDate: '2026-01-01T00:00:00.000Z', expiryDate: '2027-12-01T00:00:00.000Z',
    documents: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }] } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/home-events/event-property-summary`, (route) => fulfill(route, { success: true, data: { event: {
    id: 'event-property-summary', propertyId, type: 'IMPROVEMENT', subtype: 'ROOF', importance: 'HIGH', visibility: 'HOUSEHOLD',
    occurredAt: '2026-09-01T12:00:00.000Z', endAt: null, datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null,
    observationKind: 'EVIDENCE_DERIVED', verificationStatus: 'EVIDENCE_VERIFIED', title: 'Roof replacement',
    summary: 'The roof replacement is recorded with verified evidence.', amount: '18500', currency: 'USD', valueDelta: null,
    meta: null, groupKey: null, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z', documents: [{
      id: 'event-document-1', eventId: 'event-property-summary', documentId: 'document-1', kind: 'INVOICE', caption: null, sortOrder: 0,
      createdAt: '2026-09-01T12:00:00.000Z', document: { id: 'document-1', name: 'Roof invoice.pdf' },
    }],
  } } }));
  await page.route(`${apiOrigin}/api/properties/${propertyId}/inventory/rooms/room-property-summary/insights`, (route) => fulfill(route, { success: true, data: {
    room: { id: 'room-property-summary', name: 'Kitchen', type: 'KITCHEN', profile: null },
    stats: { itemCount: 8, replacementTotalCents: 1250000, coverageGapsCount: 1, appliancesCount: 4, docsLinkedCount: 3 },
    healthScore: { score: 82, band: 'GOOD', label: 'Good', evaluationState: 'SCORED', badges: [], improvements: [] },
    kitchen: { missingAppliances: [], quickWins: [] },
  } }));
  await page.route(`${apiOrigin}/api/documents/property/${propertyId}/document-property-summary`, (route) => fulfill(route, { success: true, data: { document: {
    id: 'document-property-summary', name: 'Homeowners policy declaration', type: 'INSURANCE_CERTIFICATE',
    description: 'Annual declarations page from the carrier.', fileSize: 245760, mimeType: 'application/pdf',
    propertyId, warrantyId: null, policyId: null, verificationStatus: 'VERIFIED', verifiedAt: '2026-09-11T00:00:00.000Z',
    createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z', fileSignedUrl: null,
  } } }));
  // Evidence upload design (approved and built 2026-09-22): the byte-upload half. Deliberately not /analyze --
  // no AI analysis, no Magic Scan quota. Returns just enough identity for AttachEvidenceControl to dispatch with.
  await page.route(`${apiOrigin}/api/documents/property/${propertyId}/evidence-upload`, (route) => fulfill(route, { success: true, data: { document: {
    id: 'document-evidence-fixture', name: 'invoice.pdf', mimeType: 'application/pdf', fileSize: 10240,
  } } }));
  // No single-member GET exists on the real backend either -- HouseholdMemberDetail re-fetches the whole list
  // and finds its own id. 'member-departed' (declared in the property-household fixture block above) is
  // deliberately NOT in this array, so opening it exercises the data-absence "no longer a member" state.
  await page.route(`${apiOrigin}/api/properties/${propertyId}/household/members`, (route) => fulfill(route, { success: true, data: { members: [{
    id: 'member-property-summary', propertyId, userId: 'user-jordan', role: 'OWNER', isPrimaryOwner: true, displayName: 'Jordan Reyes',
    joinedAt: '2025-06-01T00:00:00.000Z', createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
    user: { id: 'user-jordan', firstName: 'Jordan', lastName: 'Reyes', email: 'jordan@example.com' },
  }] } }));
  await page.route(`${apiOrigin}/api/ask/pending*`, (route) => {
    const pendingExecution = {
      ...execution('refrigerator'), executionId: 'execution-pending-maintenance', sessionId: 'session-pending-maintenance',
      question: 'I want to create a maintenance task', updatedAt: new Date().toISOString(),
    };
    return fulfill(route, { success: true, data: { items: options.pendingWork && !pendingDismissed ? [{ pendingKind: 'CONTEXT_CAPTURE', actionLabel: 'Add the missing detail', execution: pendingExecution }] : [] } });
  });
  await page.route(`${apiOrigin}/api/ask/concierge-home*`, (route) => fulfill(route, { success: true, data: {
    propertyId, generatedAt: new Date().toISOString(),
    priorityList: {
      state: 'AVAILABLE', rankingPolicyVersion: 'acceptance-v1', generatedAt: new Date().toISOString(), truncated: false, href: `/dashboard?propertyId=${propertyId}`,
      items: [options.heatAttention
        ? { homeActionId: 'heat-action-1', title: 'Multi-day heat risk ahead preparation', askQuestion: 'How should I prepare for the multi-day heat risk at this home?', askCategoryId: 'PROTECT', askCategoryLabel: 'Protect', subject: { kind: 'CHECKLIST', id: 'heat-checklist-1', label: 'Multi-day heat preparation' }, consumerPriority: 'PLAN_SOON', comparativeReasonCodes: ['SAFETY_IMPACT'], confidenceLabel: 'HIGH', deadlineAt: '2026-08-20T12:00:00.000Z', cta: { label: 'Open preparation checklist', href: `/dashboard/properties/${propertyId}/environment-report/preparation?insightId=heat-1` }, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false }
        : options.duplicateRefrigerator
          ? { homeActionId: 'refrigerator-action-1', title: 'Plan ahead for Refrigerator', askQuestion: 'What should I do next for “Plan ahead for Refrigerator”?', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', subject: { kind: 'INVENTORY_ITEM', id: 'refrigerator-1', label: 'Refrigerator' }, consumerPriority: 'PLAN_SOON', comparativeReasonCodes: ['COST_AVOIDANCE'], confidenceLabel: 'HIGH', deadlineAt: '2026-09-01T12:00:00.000Z', cta: { label: 'Review action', href: '/dashboard/actions/refrigerator-action-1' }, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false }
          : { homeActionId: 'action-1', title: 'Schedule HVAC service', askQuestion: 'What should I do next for “Schedule HVAC service”?', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', subject: { kind: 'WORK_ITEM', id: 'hvac-service-1', label: 'HVAC service' }, consumerPriority: 'PLAN_SOON', comparativeReasonCodes: ['COST_AVOIDANCE'], confidenceLabel: 'HIGH', deadlineAt: '2026-09-01T12:00:00.000Z', cta: { label: 'Review action', href: '/dashboard/actions/action-1' }, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false }],
    },
    changes: { state: 'AVAILABLE', windowDays: 30, items: [{ id: 'change-1', source: 'Home action', summary: 'Home action updated.', materiality: 'MEANINGFUL', detectedAt: new Date().toISOString(), effectiveAt: null }], href: `/dashboard/ask?propertyId=${propertyId}` },
    decisions: options.noDecision
      ? { state: 'NO_DECISIONS', items: [], href: `/dashboard/ask?propertyId=${propertyId}` }
      : { state: 'AVAILABLE', items: [{ decisionThreadId: 'decision-1', title: 'Repair or replace the refrigerator', lifecycleStatus: 'IN_PROGRESS', contextStatus: 'CURRENT', verdict: null, confidenceLabel: 'MEDIUM', subject: { kind: 'INVENTORY_ITEM', id: 'refrigerator-1', label: 'Refrigerator' }, updatedAt: '2026-08-12T12:00:00.000Z' }], href: `/dashboard/ask?propertyId=${propertyId}` },
    landingSpotlight: { kind: 'ATTENTION', entityId: options.heatAttention ? 'heat-action-1' : options.duplicateRefrigerator ? 'refrigerator-action-1' : 'action-1' },
    capabilityGroups: [
      { id: 'UNDERSTAND', label: 'Understand your home', description: 'Turn home records into a clear, useful picture.', capabilityIds: ['property-brief'], prompts: [{ id: 'understand-summary', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of my home record.' }] },
      { id: 'MAINTAIN', label: 'Maintain and prevent', description: 'Stay ahead of maintenance and prevent avoidable problems.', capabilityIds: ['maintenance'], prompts: [{ id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?' }] },
      { id: 'PROTECT', label: 'Protect your home', description: 'Find coverage gaps, risks, and important changes.', capabilityIds: ['coverage-intelligence'], prompts: [{ id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?' }] },
      { id: 'SAVE', label: 'Reduce costs', description: 'Understand spending and uncover relevant savings.', capabilityIds: ['savings-benefits'], prompts: [{ id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?' }] },
      { id: 'DECIDE', label: 'Compare and decide', description: 'Compare options with the relevant home context.', capabilityIds: ['replace-repair'], prompts: [{ id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.' }] },
      { id: 'PLAN_MONITOR', label: 'Plan and monitor', description: 'Build plans and keep watch on important deadlines.', capabilityIds: ['capital-timeline'], prompts: [{ id: 'plan-reserve', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Create a capital reserve plan for future replacements.' }] },
    ],
    featuredPrompts: [
      ...(!options.noDecision ? [{ id: 'decision-decision-1', categoryId: 'DECIDE' as const, categoryLabel: 'Decide', question: 'Help me continue this decision: Repair or replace the refrigerator', subject: { kind: 'INVENTORY_ITEM' as const, id: 'refrigerator-1', label: 'Refrigerator' }, context: { entityType: 'DECISION_THREAD' as const, entityId: 'decision-1' }, source: 'PERSONALIZED' as const }] : []),
      options.heatAttention
        ? { id: 'attention-heat-action-1', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'How should I prepare for the multi-day heat risk at this home?', subject: { kind: 'CHECKLIST', id: 'heat-checklist-1', label: 'Multi-day heat preparation' }, context: { entityType: 'HOME_ACTION', entityId: 'heat-action-1', actionId: 'heat-action-1', capabilityId: 'home-operations' }, source: 'PERSONALIZED' }
        : options.duplicateRefrigerator
          ? { id: 'attention-refrigerator-action-1', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What should I do next for “Plan ahead for Refrigerator”?', subject: { kind: 'INVENTORY_ITEM', id: 'refrigerator-1', label: 'Refrigerator' }, context: { entityType: 'HOME_ACTION', entityId: 'refrigerator-action-1', actionId: 'refrigerator-action-1', capabilityId: 'home-operations' }, source: 'PERSONALIZED' }
          : { id: 'attention-action-1', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What should I do next for “Schedule HVAC service”?', subject: { kind: 'WORK_ITEM', id: 'hvac-service-1', label: 'HVAC service' }, context: { entityType: 'HOME_ACTION', entityId: 'action-1', actionId: 'action-1', capabilityId: 'home-operations' }, source: 'PERSONALIZED' },
      { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?', source: 'DISCOVERY' },
      { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?', source: 'DISCOVERY' },
    ],
    suggestedQuestions: ['Help me continue this decision: Repair or replace the refrigerator', 'What should I do next for “Schedule HVAC service”?', 'Which items are missing coverage?', 'Where could I save money on this home?'],
  } }));
  await page.route(`${apiOrigin}/api/ask/sessions/*`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/search')) {
      const body = route.request().postDataJSON() as { query?: string; scope?: string };
      if (options.allHomeSessions && body.scope === 'ALL_HOMES') return fulfill(route, { success: true, data: { items: body.query?.toLowerCase().includes('boiler') ? [{
        sessionId: 'other-home-session', title: 'Boiler replacement options',
        property: { id: otherPropertyId, label: 'Second Home' }, latestStatus: 'ANSWERED',
        latestExecutionId: 'other-home-execution', executionCount: 1, lastActiveAt: new Date().toISOString(),
      }] : [], nextCursor: null } });
      // "flashing" appears only in the homeowner's stored question; the
      // search response intentionally returns a title, not a question snippet.
      return fulfill(route, { success: true, data: { items: options.searchSessions && body.query?.toLowerCase().includes('flashing') ? [{
        sessionId: 'recent-session-2', title: 'Older roof project',
        property: { id: propertyId, label: 'Acceptance Home' }, latestStatus: 'ANSWERED',
        latestExecutionId: 'execution-roof', executionCount: 1,
        lastActiveAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      }] : [], nextCursor: null } });
    }
    if (url.pathname.endsWith('/recent')) {
      if (options.allHomeSessions && url.searchParams.get('scope') === 'all') {
        return fulfill(route, { success: true, data: { items: [{
          sessionId: 'other-home-session', title: 'Boiler replacement options',
          property: { id: otherPropertyId, label: 'Second Home' }, latestStatus: 'ANSWERED',
          latestExecutionId: 'other-home-execution', executionCount: 1, lastActiveAt: new Date().toISOString(),
        }], nextCursor: null } });
      }
      if (options.recentSessionsPages && url.searchParams.has('cursor')) {
        return fulfill(route, { success: true, data: { items: [{
          sessionId: 'recent-session-2', title: 'Older roof project',
          property: { id: propertyId, label: 'Acceptance Home' }, latestStatus: 'ANSWERED',
          latestExecutionId: 'execution-roof', executionCount: 1,
          lastActiveAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        }], nextCursor: null } });
      }
      return fulfill(route, { success: true, data: { items: options.recentSessions ? [{
        sessionId: 'recent-session-1', title: 'When should I replace my refrigerator?',
        property: { id: propertyId, label: 'Acceptance Home' }, latestStatus: 'NEEDS_CONTEXT',
        latestExecutionId: 'execution-refrigerator', executionCount: 1,
        lastActiveAt: new Date().toISOString(),
      }] : [], nextCursor: options.recentSessionsPages ? 'fixture-page-2' : null } });
    }
    if (url.pathname.endsWith('/recent-session-1')) {
      return fulfill(route, { success: true, data: { executions: [{ ...execution('refrigerator'), sessionId: 'recent-session-1' }] } });
    }
    return fulfill(route, { success: true, data: { executions: [] } });
  });
  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as { message: string; sessionId?: string } & Record<string, unknown>;
    executionBodies.push(body);
    if (typeof body.sessionId === 'string') activeSessionId = body.sessionId;
    executionQuestions.push(body.message);
    if (/disabled refinance tool/i.test(body.message)) {
      await fulfill(route, { success: true, data: capabilityExecution(true) }, 201);
      return;
    }
    if (/tool to help with refinancing/i.test(body.message)) {
      await fulfill(route, { success: true, data: capabilityExecution(false) }, 201);
      return;
    }
    if (/multi-day heat risk/i.test(body.message)) {
      await fulfill(route, { success: true, data: heatPreparationExecution() }, 201);
      return;
    }
    if (/correctable summary of my home record/i.test(body.message)) {
      const response = correctableSummaryExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/smoke detector/i.test(body.message)) {
      const response = inventoryDisambiguationExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/capital reserve plan/i.test(body.message)) {
      // Horizon re-run (FRD Appendix D planning/refinement follow-up): a homeowner clicking "Show 5-year
      // horizon"/"Show 10-year horizon" re-sends this same operation with an explicit horizon in the message,
      // mirroring capitalReservePlanResult's own parseCapitalTimelineHorizonRequest parsing.
      const horizonYears = /5-year horizon/i.test(body.message) ? 5 : 10;
      const response = capitalReservePlanExecution({ horizonYears });
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (body.message === 'What is due before closing?') {
      await fulfill(route, { success: true, data: buyerDeadlinesExecution('LIST', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Mark this Buyer Plan task complete.') {
      await fulfill(route, { success: true, data: buyerDeadlinesExecution('REVIEW', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Is refinancing worth reviewing now?') {
      await fulfill(route, { success: true, data: refinanceMonitorAnalysisExecution(body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'What should I fix before listing?') {
      await fulfill(route, { success: true, data: sellerPrepExecution('LIST', body.sessionId as string | undefined, true) }, 201);
      return;
    }
    if (body.message === 'Check my sale readiness') {
      await fulfill(route, { success: true, data: sellerPrepExecution('LIST', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Stop pursuing this seller-prep checklist item.') {
      await fulfill(route, { success: true, data: sellerPrepExecution('REVIEW', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Go through my inspection findings') {
      await fulfill(route, { success: true, data: inspectionDeckExecution('LIST', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Review my inspection finding decisions.') {
      await fulfill(route, { success: true, data: inspectionDeckExecution('BATCH_REVIEW', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Show my open inspection findings') {
      await fulfill(route, { success: true, data: inspectionExecution('LIST', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Mark this inspection finding resolved.') {
      await fulfill(route, { success: true, data: inspectionExecution('REVIEW', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Show my claims') {
      await fulfill(route, { success: true, data: claimsExecution('LIST', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Submit this claim.') {
      await fulfill(route, { success: true, data: claimsExecution('REVIEW', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Plan this recommended action from a monitored event.') {
      if (typeof body.sessionId === 'string') correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: radarTaskExecution('FORM', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (body.message === 'Save this monitored event.') {
      await fulfill(route, { success: true, data: radarStateReceiptExecution(body.sessionId as string | undefined) }, 201);
      return;
    }
    if (/home event radar feed/i.test(body.message)) {
      const response = homeEventRadarFeedExecution({ happeningNow: /happening now/i.test(body.message) });
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/^add an event to my home timeline/i.test(body.message) || /^add a room to my home record/i.test(body.message) || /^add an item to my home inventory/i.test(body.message) || /^fill in the missing structure details/i.test(body.message)) {
      const addKind: AddKind = /event/i.test(body.message) ? 'event' : /item/i.test(body.message) ? 'item' : /^fill in/i.test(body.message) ? 'area' : 'room';
      if (typeof body.sessionId === 'string') correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: addExecution(addKind, 'FORM', body.sessionId as string | undefined) }, 201);
      return;
    }
    if (/^add a warranty to my home record/i.test(body.message)) {
      if (typeof body.sessionId === 'string') correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: warrantyAddExecution('FORM', body.sessionId as string | undefined) }, 201);
      return;
    }
    const correctionKind = (Object.keys(CORRECTIONS) as CorrectionKind[]).find((kind) => CORRECTIONS[kind].message.test(body.message));
    if (correctionKind) {
      if (typeof body.sessionId === 'string') correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: correctionExecution(correctionKind, 'NEEDS_CONFIRMATION', 1, CORRECTIONS[correctionKind].initial, body.sessionId as string | undefined) }, 201);
      return;
    }
    if (/correct the title of this timeline event/i.test(body.message)) {
      const response = eventCorrectionExecution('NEEDS_CONFIRMATION', 1, 'Roof replacement', body.sessionId);
      if (body.sessionId) correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/attach this document to this (inventory item|warranty)/i.test(body.message)) {
      const target = /warranty/i.test(body.message) ? EVIDENCE_TARGETS.warranty : EVIDENCE_TARGETS.inventory;
      const response = evidenceAttachExecution('NEEDS_CONFIRMATION', 1, 'receipt.pdf', body.sessionId as string | undefined, target);
      if (body.sessionId) correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/attach evidence to this home timeline entry/i.test(body.message)) {
      const response = evidenceAttachExecution('NEEDS_CONFIRMATION', 1, 'invoice.pdf', body.sessionId as string | undefined);
      if (body.sessionId) correctionSessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/summary of my home record/i.test(body.message)) {
      const response = propertySummaryTimelineExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/compare ownership costs/i.test(body.message)) {
      const response = adaptiveTableExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/compare repair options/i.test(body.message)) {
      const response = comparisonStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show next maintenance results/i.test(body.message)) {
      const response = maintenanceExecution();
      response.executionId = 'execution-maintenance-page-2';
      response.question = body.message;
      (response as typeof response & { continuesExecutionId: string }).continuesExecutionId = 'execution-maintenance';
      response.viewState = { ...response.viewState, revision: 2 };
      const list = response.blocks.find((block) => block.type === 'GROUPED_LIST');
      if (list?.type === 'GROUPED_LIST') {
        list.sections = [{ id: 'open', title: 'Pending and in progress', count: 51, offset: 50, items: [{
          id: 'maintenance-task-51', title: 'Inspect the attic fan', description: 'Final matching task.', meta: ['Attic', 'Due Nov 1, 2026', 'medium priority'], status: 'PENDING',
          href: `/dashboard/maintenance?propertyId=${propertyId}&taskId=maintenance-task-51&from=ask`, entityType: 'MAINTENANCE_TASK', actions: [],
        }] }];
      }
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show the evidence relationship/i.test(body.message)) {
      const response = relatedRecordsExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show the task output/i.test(body.message)) {
      const response = maintenanceOutputExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/^how ready is my home to sell/i.test(body.message)) {
      const response = sellerPrepProgressExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/^show the rooms in my home record/i.test(body.message)) {
      const response = roomMapExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/^show my appliance lifespans/i.test(body.message)) {
      const response = applianceLifespanExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/^show my home timeline history/i.test(body.message)) {
      const response = homeTimelineTrackExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/compare my roofing quotes/i.test(body.message)) {
      const response = quoteReviewStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show the quote workspace output/i.test(body.message)) {
      const response = quoteWorkspaceOutputExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/create a maintenance task/i.test(body.message)) {
      const response = {
        ...maintenanceExecution(), executionId: 'execution-maintenance-create', question: body.message, status: 'NEEDS_CONTEXT',
        blocks: [{ type: 'SUMMARY', id: 'maintenance-create-input', title: 'Add the task details', body: 'Nothing has been created yet.', tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance instead', href: `/dashboard/maintenance?propertyId=${propertyId}`, style: 'SECONDARY' }] }],
        captureRequests: [{
          requirementId: 'maintenance-task-context-v1', captureKey: 'MAINTENANCE_TASK_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
          title: 'Maintenance task details', question: 'What task should be added, and when should it be due?', helpText: 'You will review everything before the task is created.',
          inputSchema: { type: 'GROUP', fields: [
            { key: 'title', label: 'Task', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
            { key: 'priority', label: 'Priority', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Medium', value: 'MEDIUM' }, { label: 'High', value: 'HIGH' }] } },
            { key: 'isRecurring', label: 'Does this repeat?', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Recurring', falseLabel: 'One-time' } },
          ] },
          currentAnswer: {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this task; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: 'context-v1',
        }],
      };
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what needs my attention now/i.test(body.message)) {
      const response = homeActionShelvesExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what seasonal tasks are pending/i.test(body.message)) {
      const response = seasonalShelvesExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show my status board/i.test(body.message)) {
      const response = statusBoardShelvesExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what is left before i close/i.test(body.message)) {
      const response = buyerPlanShelvesExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/should i sell, hold, or rent/i.test(body.message)) {
      const response = sellHoldRentStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/compare my current insurance policy/i.test(body.message)) {
      const response = coverageComparisonStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what if i refinanced at 5\.5%/i.test(body.message)) {
      const response = refinanceScenarioStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show my upgrade planner options/i.test(body.message)) {
      const response = homeUpgradeStripExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what big expenses are coming up/i.test(body.message)) {
      const response = capitalTimelineTrackExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/how complete is my home record/i.test(body.message)) {
      const response = propertyCompletenessRingExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what do i need for closing day/i.test(body.message)) {
      const response = buyerClosingDayRingExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what is on my home radar right now/i.test(body.message)) {
      const response = homeEventRadarDeckExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/is my kitchen remodel ready to start/i.test(body.message)) {
      const response = renovationReadinessRingExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/show my home continuity plan/i.test(body.message)) {
      const response = digitalWillRingExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/what maintenance is pending/i.test(body.message)) {
      const response = maintenanceShelvesExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/maintenance tasks are due/i.test(body.message)) {
      const response = maintenanceExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    const response = execution(/refinanc/i.test(body.message) ? 'refinance' : 'refrigerator');
    response.question = body.message;
    if (body.sessionId) response.sessionId = body.sessionId;
    if (options.repeatedSuggestion) (response as { suggestions: string[] }).suggestions = [body.message, 'List all appliances'];
    await fulfill(route, { success: true, data: response }, 201);
  });
  await page.route(`${apiOrigin}/api/ask/executions/*/captures/events`, (route) => fulfill(route, {}, 204));
  await page.route(`${apiOrigin}/api/ask/executions/*/captures`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captureBodies.push(body);
    captureAttempts += 1;
    if (options.permissionDenied) {
      await fulfill(route, { success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'A contributor or owner must update this detail.' } }, 403);
      return;
    }
    if (options.conflictOnce && captureAttempts === 1) {
      const refreshed = execution(body.captureKey === 'FINANCING_PROFILE_REFINANCE_INPUTS' ? 'refinance' : 'refrigerator');
      refreshed.contextVersion = 'context-v2';
      refreshed.captureRequests[0].expectedContextVersion = 'context-v2';
      refreshed.captureRequests[0].state = 'STALE';
      await fulfill(route, { success: false, data: refreshed, error: { code: 'ASK_CONTEXT_VERSION_CONFLICT', message: 'The home record changed.' } }, 409);
      return;
    }
    await fulfill(route, { success: true, data: execution(body.captureKey === 'FINANCING_PROFILE_REFINANCE_INPUTS' ? 'refinance' : 'refrigerator', true) });
  });
  for (const kind of Object.keys(CORRECTIONS) as CorrectionKind[]) {
    await page.route(`${apiOrigin}/api/ask/executions/execution-correct-${kind}/confirm/edit`, async (route) => {
      assertAuthenticated(route.request());
      const body = route.request().postDataJSON() as { confirmationVersion: number; edits: Record<string, string> };
      correctionEditBodies.push(body);
      await fulfill(route, { success: true, data: correctionExecution(kind, 'NEEDS_CONFIRMATION', body.confirmationVersion + 1, body.edits.value, correctionSessionId) });
    });
    await page.route(`${apiOrigin}/api/ask/executions/execution-correct-${kind}/confirm`, async (route) => {
      assertAuthenticated(route.request());
      correctionConfirmBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await fulfill(route, { success: true, data: correctionExecution(kind, 'COMPLETED', 2, correctionEditBodies.at(-1)?.edits.value ?? '', correctionSessionId) });
    });
  }
  await page.route(`${apiOrigin}/api/ask/executions/execution-event-correction/confirm/edit`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as { confirmationVersion: number; edits: Record<string, string> };
    correctionEditBodies.push(body);
    await fulfill(route, { success: true, data: eventCorrectionExecution('NEEDS_CONFIRMATION', body.confirmationVersion + 1, body.edits.value, correctionSessionId) });
  });
  await page.route(`${apiOrigin}/api/ask/executions/execution-event-correction/confirm`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    correctionConfirmBodies.push(body);
    await fulfill(route, { success: true, data: eventCorrectionExecution('COMPLETED', 2, 'Roof replacement (full tear-off)', correctionSessionId) });
  });
  // No confirm/edit route -- evidenceAttachConfirmation's editableFields is always [], so the frontend never
  // offers an Edit control and never calls the edit endpoint for this execution.
  await page.route(`${apiOrigin}/api/ask/executions/execution-evidence-attach/confirm`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    correctionConfirmBodies.push(body);
    await fulfill(route, { success: true, data: evidenceAttachExecution('COMPLETED', 2, 'invoice.pdf', correctionSessionId) });
  });
  // Registered after the generic captures route above so it takes precedence for this execution only.
  await page.route(`${apiOrigin}/api/ask/executions/execution-warranty-add/captures`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    warrantyAddCaptureBodies.push(body);
    await fulfill(route, { success: true, data: warrantyAddExecution('CONFIRMATION', correctionSessionId, body.answer as Record<string, string>) });
  });
  await page.route(`${apiOrigin}/api/ask/executions/execution-warranty-add/confirm`, async (route) => {
    assertAuthenticated(route.request());
    correctionConfirmBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await fulfill(route, { success: true, data: warrantyAddExecution('DONE', correctionSessionId) });
  });
  await page.route(`${apiOrigin}/api/ask/executions/execution-radar-task/captures`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    addCaptureBodies.push(body);
    await fulfill(route, { success: true, data: radarTaskExecution('CONFIRMATION', correctionSessionId, body.answer as Record<string, unknown>) });
  });
  await page.route(`${apiOrigin}/api/ask/executions/execution-radar-task/confirm`, async (route) => {
    assertAuthenticated(route.request());
    correctionConfirmBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await fulfill(route, { success: true, data: radarTaskExecution('DONE', correctionSessionId) });
  });
  for (const addKind of ['event', 'room', 'item', 'area'] as const) {
    await page.route(`${apiOrigin}/api/ask/executions/execution-${addKind}-add/captures`, async (route) => {
      assertAuthenticated(route.request());
      const body = route.request().postDataJSON() as Record<string, unknown>;
      addCaptureBodies.push(body);
      const skipped = addKind === 'area' && (body.answer as Record<string, unknown>)?.$skip === true;
      await fulfill(route, { success: true, data: skipped ? addExecution(addKind, 'FORM', correctionSessionId, undefined, 'Skipped for now') : addExecution(addKind, 'CONFIRMATION', correctionSessionId, body.answer as Record<string, unknown>) });
    });
    await page.route(`${apiOrigin}/api/ask/executions/execution-${addKind}-add/confirm`, async (route) => {
      assertAuthenticated(route.request());
      correctionConfirmBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await fulfill(route, { success: true, data: addExecution(addKind, 'DONE', correctionSessionId) });
    });
  }
  await page.route(`${apiOrigin}/api/ask/executions/execution-pending-maintenance/cancel`, (route) => {
    pendingDismissed = true;
    const cancelled = {
      ...execution('refrigerator'), executionId: 'execution-pending-maintenance', sessionId: 'session-pending-maintenance',
      question: 'I want to create a maintenance task', status: 'CANCELLED', captureRequests: [],
      blocks: [{ type: 'SUMMARY', id: 'pending-request-dismissed', title: 'Pending request dismissed', body: 'No action was performed.', tone: 'DEFAULT', actions: [] }],
      updatedAt: new Date().toISOString(),
    };
    return fulfill(route, { success: true, data: cancelled });
  });
  return { captureBodies, executionQuestions, executionBodies, correctionEditBodies, correctionConfirmBodies, warrantyAddCaptureBodies, addCaptureBodies, monitorPatchBodies, captureAttempts: () => captureAttempts };
}

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=ask-acceptance-token');
}

// The page uses a per-conversation session id (a UUID it generates), but most
// fixture executions were authored with the fixed FIXTURE_SESSION_ID. A
// response for a different session is (correctly) ignored by the client, so
// every execution response adopts the session id of the create request the
// page most recently sent. Reset per installAskApi call.
const FIXTURE_SESSION_ID = 'ask-acceptance-session';
let activeSessionId: string | null = null;

function withActiveSession<T>(body: T): T {
  if (!activeSessionId || !body || typeof body !== 'object') return body;
  const record = body as { data?: { sessionId?: string } };
  if (record.data && typeof record.data === 'object' && record.data.sessionId === FIXTURE_SESSION_ID) {
    return { ...record, data: { ...record.data, sessionId: activeSessionId } } as T;
  }
  return body;
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(withActiveSession(body)) });
}
