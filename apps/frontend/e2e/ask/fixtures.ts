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
function capitalReservePlanExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-capital-reserve-plan', sessionId: 'ask-acceptance-session',
    question: 'Create a capital reserve plan for future replacements.', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'CAPITAL_RESERVE_PLAN', version: '1.0', family: 'DECISION_ANALYSIS' }, contextVersion: 'capital-reserve-plan-v1',
    blocks: [{
      type: 'SUMMARY', id: 'capital-reserve-summary', title: '1 upcoming capital event is in the current plan',
      body: 'The modeled cost range for the displayed 10-year horizon is $1,000–$1,400. The canonical reserve plan currently suggests $25 per month and records a $0 shortfall.',
      tone: 'DEFAULT', actions: [
        { id: 'open-timeline', label: 'Open capital timeline', href: `/dashboard/properties/${propertyId}/tools/capital-timeline`, style: 'PRIMARY' },
        { id: 'open-reserve', label: 'Open reserve fund', href: `/dashboard/properties/${propertyId}/tools/reserve-fund`, style: 'SECONDARY' },
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
function homeEventRadarFeedExecution() {
  return {
    schemaVersion: '1.0', executionId: 'execution-home-event-radar-feed', sessionId: 'ask-acceptance-session',
    question: 'Show my home event radar feed.', status: 'ANSWERED',
    property: { id: propertyId, label: 'Acceptance Home' },
    operation: { id: 'HOME_EVENT_RADAR_FEED', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: null,
    blocks: [{
      type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events',
      body: '1 monitored event from Home Event Radar.', tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters: [],
      description: 'This is the same canonical feed the Home Event Radar page reads, grouped by source.',
      sections: [{ id: 'radar-weather', title: 'Weather', count: 1, items: [
        { id: 'match-property-summary', title: 'severe thunderstorm warning', entityType: 'RADAR_MATCH', description: 'A severe thunderstorm warning is in effect for this area.', meta: ['high', 'National Weather Service'], status: 'new', href: `/dashboard/properties/${propertyId}/tools/home-event-radar?matchId=match-property-summary` },
      ] }],
      actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: `/dashboard/properties/${propertyId}/tools/home-event-radar`, style: 'SECONDARY' }],
    }],
    skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null, childExecutions: [], originalResponse: null,
    correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
    suggestions: [], createdAt: '2026-09-22T12:00:00.000Z', updatedAt: '2026-09-22T12:00:00.000Z',
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
function evidenceAttachConfirmation(version: number, documentName: string) {
  return {
    confirmationId: `evidence-attach-event-property-summary-${version}`, version, title: 'Attach this document as evidence?',
    description: 'You are attaching a document you just uploaded to this home timeline entry. No change is saved until you confirm.',
    fields: [{ label: 'Document', value: documentName }, { label: 'Attach to', value: 'Roof replacement' }],
    editableFields: [], confirmLabel: 'Attach document', consentText: 'I confirm this document is evidence for this home record entry.',
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

function evidenceAttachExecution(status: 'NEEDS_CONFIRMATION' | 'COMPLETED', version: number, documentName: string, sessionId?: string) {
  const base = propertySummaryTimelineExecution();
  return {
    ...base, sessionId: sessionId ?? base.sessionId, executionId: 'execution-evidence-attach', question: 'Attach evidence to this home timeline entry.', status,
    operation: { id: 'CAPTURE_EVIDENCE_CONFIRM', version: '1.0', family: 'COMMAND' }, contextVersion: 'evidence-attach-v1',
    blocks: status === 'COMPLETED'
      ? [{ type: 'SUMMARY', id: 'evidence-attached-link-1', title: 'Attached to your home timeline', tone: 'POSITIVE', body: `${documentName} is now attached as evidence on your home timeline.`, actions: [] }]
      : [{ type: 'SUMMARY', id: 'evidence-attach-review', title: 'Attach this document to "Roof replacement"?', body: 'Nothing has been saved yet. Review, then confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: status === 'COMPLETED' ? null : evidenceAttachConfirmation(version, documentName),
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

export async function installAskContext(context: BrowserContext) {
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
      targetCapability: null, supportedTaskOperations: [], taskLink: null,
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
      const response = capitalReservePlanExecution();
      if (body.sessionId) response.sessionId = body.sessionId;
      await fulfill(route, { success: true, data: response }, 201);
      return;
    }
    if (/home event radar feed/i.test(body.message)) {
      const response = homeEventRadarFeedExecution();
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
  return { captureBodies, executionQuestions, executionBodies, correctionEditBodies, correctionConfirmBodies, warrantyAddCaptureBodies, addCaptureBodies, captureAttempts: () => captureAttempts };
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
