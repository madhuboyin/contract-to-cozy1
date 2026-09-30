import type { AskOperationResult } from './askOperationRegistry';
import type { AskOperationId } from './askOperationRegistry';
import type { RankedHomeAction } from '../homeActions.service';
import type { AskCaptureRequest } from '../../productFramework/ask/ask.contract';
import { resolveHealthFactorChecklist, urgencyLabel, type HealthFactorChecklistProperty } from './healthFactorChecklist';
import { buildPolicyConflictSection } from './policyConflictPresentation';
import type { ConflictedInsurancePolicyTerm } from '../coverageConflict.service';
import { isAppliancesInsight } from './healthGapCapture';

// Must equal INVENTORY_ADD_MESSAGE in handlers/inventory.handler.ts (pinned by test): the handler recognises the
// declared add action by this exact text, and importing it here would pull that handler's registrations into this pure module.
export const INVENTORY_ADD_ACTION_MESSAGE = 'Add an item to my home inventory.';

export type HomeActionPriority = 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';

/** Keeps Ask landing section prompts aligned with the dashboard's canonical partitions. */
export function homeActionPriorityFilter(message: string): HomeActionPriority[] | null {
  if (/\bneeds? attention now or soon\b/i.test(message)) return ['NOW', 'SOON'];
  if (/\bplan ahead\b/i.test(message)) return ['PLAN', 'CONSIDER'];
  if (/\b(?:urgent|right now|immediately|priority now)\b/i.test(message)) return ['NOW'];
  if (/\bsoon\b/i.test(message)) return ['SOON'];
  if (/\b(?:should i plan|planning|plan for|later)\b/i.test(message)) return ['PLAN'];
  if (/\b(?:can wait|consider)\b/i.test(message)) return ['PLAN', 'CONSIDER'];
  return null;
}

export function focusedOperationForLaunchContext(context?: {
  entityType?: string | null;
  entityId?: string | null;
  actionId?: string | null;
}): AskOperationId | null {
  if (context?.entityType === 'HOME_ACTION' && (context.actionId || context.entityId)) return 'HOME_ACTIONS';
  if (context?.entityType === 'DECISION_THREAD' && context.entityId) return 'HVAC_DECISION_CONTINUE';
  if (context?.entityType === 'GUIDANCE_JOURNEY' && context.entityId) return 'GUIDANCE_JOURNEY_CONTINUE';
  if (context?.entityType === 'INVENTORY_ITEM' && context.entityId) return 'REPLACEMENT_GUIDANCE';
  return null;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// Home Action focused-guidance CTA fix, Group A (gap audit §17; FRD v1.156).
// `action.primaryCta.href` is taken verbatim from the governed Home Action
// feed (shared with the traditional dashboard), so a focused-guidance turn's
// only action used to navigate the whole browser out of Ask. These eight
// destinations already have a certified Ask operation that reads the same
// data the traditional page would show -- routing to it in-Ask (via the same
// START_WORKFLOW pattern warranties.handler.ts/homeEventRadar.handler.ts
// already use for their own declared actions) keeps the homeowner in the
// conversation instead. Matched on `primaryCta.href` (the only signal this
// module receives) against the exact destinations the audit traced per-site
// in homeActionSourcePromotion.service.ts -- not a guess from the label,
// which is homeowner-facing copy, not a stable routing key. Groups B/C/D
// (drawer candidates, whole stateful tools, and guided journeys) are
// deliberately untouched here and keep navigating.
function parseHomeActionHref(href: string): { pathname: string; params: URLSearchParams } | null {
  try {
    const url = new URL(href, 'https://internal.invalid');
    return { pathname: url.pathname, params: url.searchParams };
  } catch {
    return null;
  }
}

function propertyToolPath(tool: string): RegExp {
  return new RegExp(`^/dashboard/properties/[^/]+/tools/${tool}$`);
}

function resolveGroupAAskRouting(href: string | undefined): { operationId: AskOperationId; message: string } | null {
  if (!href) return null;
  const parsed = parseHomeActionHref(href);
  if (!parsed) return null;
  const { pathname, params } = parsed;

  if (pathname === '/dashboard/warranties') {
    return { operationId: 'WARRANTY_LOOKUP', message: 'Show my warranties' };
  }
  // Coverage-renewal's Warranty case (loadCoverageRenewalActions) links to the inventory
  // coverage tab, not /dashboard/warranties, but is the same underlying warranty record.
  if (/^\/dashboard\/properties\/[^/]+\/inventory$/.test(pathname) && params.get('tab') === 'coverage') {
    return { operationId: 'WARRANTY_LOOKUP', message: 'Show my warranties' };
  }
  if (propertyToolPath('coverage-intelligence').test(pathname) && params.get('stage') === 'questions') {
    return { operationId: 'COVERAGE_GAPS', message: 'What coverage gaps do I have?' };
  }
  if (pathname === '/dashboard/home-event-radar') {
    return { operationId: 'HOME_EVENT_RADAR_FEED', message: 'Show my Home Event Radar feed' };
  }
  if (propertyToolPath('sell-hold-rent').test(pathname)) {
    return { operationId: 'SELL_HOLD_RENT_ANALYSIS', message: 'Should I sell, hold, or rent this property?' };
  }
  if (propertyToolPath('mortgage-refinance-radar').test(pathname)) {
    return { operationId: 'REFINANCE_ANALYSIS', message: 'Should I refinance my mortgage?' };
  }
  // Excludes the in-progress ?section=in-progress&actionId=... resume case (Group C):
  // that is a specific, already-started benefit action, not the general opportunities list.
  if (propertyToolPath('savings-benefits').test(pathname) && !params.has('actionId')) {
    return { operationId: 'SAVINGS_OPPORTUNITIES', message: 'What savings opportunities are available for this home?' };
  }
  // Sweep of the remaining producers (gap audit §17; FRD v1.170): the incident producer's fallback
  // destination when there is neither a weather-preparation page nor a proposed-action URL. Same
  // precedent as inspection-hub/:reportId above -- an entity-detail href routes to the operation that
  // reads that record set. INCIDENT_CLAIM_STATUS is property-wide (scoped by the word "incidents"; the phrasing is one the deterministic router recognises without the forced hint), so
  // the focused incident is in the list, not singled out. The bare /incidents list is not matched: it
  // only ever appears as a secondary escalation link, and only the primary CTA is routed here.
  if (/^\/dashboard\/properties\/[^/]+\/incidents\/[^/]+$/.test(pathname)) {
    return { operationId: 'INCIDENT_CLAIM_STATUS', message: 'What incidents are recorded for this home?' };
  }
  // A project with no renovation case (that is Group C, matched above by its /renovations/ path). The
  // phrase names the tracker explicitly: the tracked-projects router excludes create/start/permit wording.
  if (/^\/dashboard\/properties\/[^/]+\/projects\/[^/]+$/.test(pathname)) {
    return { operationId: 'PROJECT_TRACKER_PROJECTS', message: 'Show my projects in the project tracker' };
  }
  if (propertyToolPath('property-tax').test(pathname) && params.get('stage') === 'appeal') {
    return { operationId: 'PROPERTY_TAX_APPEAL_READINESS', message: 'What is the status of my property tax appeal?' };
  }
  // The seasonal-checklist branch inside MAINTENANCE_STATUS only activates on a seasonal
  // keyword in the message (maintenance.handler.ts); forcing the operation still requires it.
  if (pathname === '/dashboard/seasonal') {
    return { operationId: 'MAINTENANCE_STATUS', message: 'What is on my seasonal checklist?' };
  }
  return null;
}

// Group B, health-factor checklist slice (gap audit §17). A health-insight Home Action with no
// matched inventory item routes here (homeActionSourcePromotion.service.ts's buildInsightAction),
// e.g. the reported "See age-related checklist" case. Unlike Group A, no existing Ask operation
// covers this content, so it is rendered inline (see healthFactorChecklist.ts) rather than routed.
export function isHealthFactorFocusHref(href: string | undefined): boolean {
  if (!href) return false;
  const parsed = parseHomeActionHref(href);
  if (!parsed) return false;
  return /^\/dashboard\/properties\/[^/]+\/focus\/health\/[^/]+$/.test(parsed.pathname);
}

// Group C (gap audit §17): whole-feature/stateful tools where navigation is fundamentally
// correct -- the Risk Premium Optimizer mitigation plan, a Renovation Case, the Sale Case tool,
// Capital Timeline, and Savings & Benefits' in-progress (has-actionId) resume case. Unlike
// Group A/B, the fix here is not to change the destination -- it is to stop presenting an
// out-of-Ask navigation as the bare PRIMARY action, since the SUMMARY/GROUPED_LIST content
// above it is the actual answer and this is an honest secondary escape hatch to the full tool.
// A SAFETY_EMERGENCY renovation/project action is excluded: its urgency should stay visually
// PRIMARY regardless of which group its destination falls into.
export function isGroupCWholeToolDestination(action: RankedHomeAction): boolean {
  if (action.lineageId.startsWith('mitigation-plan:')) return true;
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY') return false;
  const parsed = parseHomeActionHref(action.primaryCta.href);
  if (!parsed) return false;
  const { pathname, params } = parsed;
  if (/^\/dashboard\/properties\/[^/]+\/renovations\/[^/]+$/.test(pathname)) return true;
  if (propertyToolPath('sale-case').test(pathname)) return true;
  if (propertyToolPath('capital-timeline').test(pathname)) return true;
  if (propertyToolPath('savings-benefits').test(pathname) && params.has('actionId')) return true;
  return false;
}

// Group D (gap audit §17), repair/replace decision slice only. The other Group D destination --
// the generic financial/weather guided-journey continuation (homeActionSourcePromotion.service.ts's
// "journey" producer, href resolved per journey type via resolveGuidanceHref) -- genuinely has no
// existing Ask operation that reads a specific GuidanceJourney's current-step state
// (GUIDANCE_JOURNEYS_LIST only lists all journeys with a still-external href per item); building
// that is real new-operation work, not done here. The repair/replace decision, by contrast,
// already has a fully-capable operation: REPLACEMENT_GUIDANCE (non-HVAC items) delegates
// internally to the durable HVAC Decision Platform for HVAC items via hvacDecisionStartResult,
// which is the SAME "continue the tracked HVAC decision" content this Home Action's own copy
// already promises. Identified by lineageId prefix, not href -- the producer's href varies (a
// bare item page, or a guidance-overview journey URL) depending on whether an active guided
// journey exists for the item, but the underlying decision content is the same either way.
const REPAIR_REPLACE_LINEAGE_PREFIXES = ['repair-replace:', 'appliance-repair-replace:'];

function resolveGroupDReplacementGuidanceRouting(
  action: RankedHomeAction,
): { operationId: AskOperationId; entityId: string; message: string } | null {
  if (!REPAIR_REPLACE_LINEAGE_PREFIXES.some((prefix) => action.lineageId.startsWith(prefix))) return null;
  const subject = action.presentation?.subject;
  if (!subject || subject.kind !== 'INVENTORY_ITEM') return null;
  return { operationId: 'REPLACEMENT_GUIDANCE', entityId: subject.id, message: `Should I repair or replace ${subject.label}?` };
}

// Group E (gap audit §17; FRD v1.169): accepted Operational Work. appendAcceptedOperationalWork
// (homeActions.service.ts) is a producer the original 27-site classification never covered -- it is a
// different file from homeActionSourcePromotion.service.ts -- so its "Open work" CTA (href
// /dashboard/properties/:id/home-operations?focusWorkItemId=...&openManage=1) still navigated out of Ask.
// OPERATIONAL_WORK_UPDATE already resolves the exact item from launchContext.entityId and runs the same
// confirmation-gated transitions the desktop card offers, so the CTA becomes those declared actions. What is
// offered mirrors the card's own governed `feedbackControls` (COMPLETE is only there when the work is
// completion-eligible); messages deliberately omit the title, because the handler infers the verb from the
// message with a loose pattern a title like "Finish the deck" would confuse. REPORTED_COMPLETE keeps its
// "Review completion" navigation (verification is not an Ask operation), and a viewer keeps it too, since
// the operation needs CONTRIBUTOR.
function resolveAcceptedWorkActions(action: RankedHomeAction, canContribute: boolean) {
  const workItem = action.workItem;
  if (!canContribute || !workItem || action.presentation?.variant !== 'ACCEPTED_WORK') return null;
  if (workItem.state === 'REPORTED_COMPLETE') return null;
  const common = {
    interactionType: 'START_WORKFLOW' as const,
    operationId: 'OPERATIONAL_WORK_UPDATE',
    entityType: 'WORK_ITEM',
    entityId: workItem.id,
  };
  const controls = new Set<string>(action.feedbackControls);
  const actions = [
    ...(controls.has('COMPLETE') ? [{ ...common, id: `home-action-complete-${action.id}`, label: 'Mark complete', message: 'Complete this work item.', style: 'PRIMARY' as const }] : []),
    ...(controls.has('SNOOZE') ? [{ ...common, id: `home-action-snooze-${action.id}`, label: 'Snooze reminders', message: 'Snooze this work item.', style: (controls.has('COMPLETE') ? 'SECONDARY' : 'PRIMARY') as 'PRIMARY' | 'SECONDARY' }] : []),
  ];
  return actions.length ? actions : null;
}

// Group B (gap audit §17), resolution-center capture slice. The reclassification note above (see
// "Group B re-classification" comment on isHealthFactorFocusHref) found this third Group B shape:
// a `CORRECT_FACT` CTA whose href is literally `/dashboard/resolution-center` (the
// home-digital-twin-fact-review producer in homeActionSourcePromotion.service.ts, covering HVAC/
// water heater/roof/appliance lifecycle facts alike -- one producer, many components) carries a
// `propertyContextFeature` ref that is exactly what ResolutionCenterClient.tsx's own
// PropertyContextCapturePanel already consumes (its `canCaptureResolutionInline` uses this same
// CORRECT_FACT + propertyContextFeature test). Rather than porting that Sheet/drawer into Ask, this
// reuses Ask's OWN generic inline-capture contract (AskCaptureRequest, the same mechanism
// HOME_SAVINGS/OWNERSHIP_COSTS/CAPITAL_RESERVE_PLAN already drive from evaluateFeatureContext) --
// the missing fact is asked and answered as a chat-native capture card, no new frontend surface.
export function isPropertyContextCaptureAction(action: RankedHomeAction): boolean {
  return Boolean(
    action.primaryCta.kind === 'CORRECT_FACT'
      && action.propertyContextFeature?.featureKey
      && action.propertyContextFeature?.operationKey,
  );
}

// Group B (gap audit §17): recall review and inspection-finding review. Both were classified as
// "no existing operation covers this" in the original audit; inspection-finding review turned out,
// on inspection, to already have a fully-built read+write operation (INSPECTION_FINDINGS/
// INSPECTION_FINDING_UPDATE, complete with confirm-gated accept/dismiss/resolve item actions) --
// only routing was missing, so this is a Group-A-style fix, not new-operation work. Recall review
// had no covering operation at all, so RECALL_REVIEW (recallReview.handler.ts) was built read-only;
// confirm/dismiss/resolve mutations are a deferred follow-up noted in that file.
function resolveGroupBRecordReviewRouting(action: RankedHomeAction): { operationId: AskOperationId; message: string } | null {
  if (action.lineageId.startsWith('recall:')) {
    return { operationId: 'RECALL_REVIEW', message: 'Show my open recall matches' };
  }
  const parsed = parseHomeActionHref(action.primaryCta.href);
  // Matches both the reported single-finding href (/inspection-hub/{reportId}?findingId=...) and
  // the no-finding fallback (/inspection-hub/open-items) -- INSPECTION_FINDINGS shows the same
  // property-scoped list regardless, so both resolve to the same in-Ask answer.
  if (parsed && /^\/dashboard\/properties\/[^/]+\/inspection-hub\/[^/]+$/.test(parsed.pathname)) {
    return { operationId: 'INSPECTION_FINDINGS', message: 'Show my open inspection findings' };
  }
  return null;
}

// Group D (guided journey continuation, Phase 1; FRD ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD section 3.5): an action
// tied to a guided journey continues it in Ask through GUIDANCE_JOURNEY_CONTINUE, a read of that one journey. It
// completes nothing (steps finish in their tools), so the page link stays as the secondary way in.
function resolveGroupDJourneyRouting(action: RankedHomeAction): { operationId: AskOperationId; entityType: string; entityId: string; message: string } | null {
  if (!action.relatedJourneyId) return null;
  return { operationId: 'GUIDANCE_JOURNEY_CONTINUE', entityType: 'GUIDANCE_JOURNEY', entityId: action.relatedJourneyId, message: 'Continue this guided journey.' };
}

function focusedTitle(action: RankedHomeAction): string {
  return (action.presentation?.headline ?? action.recommendedAction)
    .trim()
    .replace(/\s+preparation$/i, '')
    .replace(/[.!?]+$/g, '');
}

export function focusedHomeActionQuestion(action: RankedHomeAction): string {
  const title = focusedTitle(action);
  if (
    (action.presentation?.variant === 'WEATHER_ALERT' || action.presentation?.variant === 'ENVIRONMENT_PREPARATION')
    && /multi-day heat risk/i.test(title)
  ) {
    return 'How should I prepare for the multi-day heat risk at this home?';
  }
  if (action.presentation?.variant === 'WEATHER_ALERT' || action.presentation?.variant === 'ENVIRONMENT_PREPARATION') {
    return `How should I prepare for the ${title.toLowerCase()} at this home?`;
  }
  return `What should I do next for “${title}”?`;
}

export function focusedHomeActionCategory(action: RankedHomeAction): {
  categoryId: 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'PLAN_MONITOR';
  categoryLabel: 'Maintain' | 'Protect' | 'Save' | 'Plan';
} {
  if (['INCIDENT', 'RECALL', 'COVERAGE'].includes(action.source.kind)) return { categoryId: 'PROTECT', categoryLabel: 'Protect' };
  if (action.source.kind === 'SAVINGS_BENEFITS') return { categoryId: 'SAVE', categoryLabel: 'Save' };
  if (['PROJECT', 'SALE_PREP'].includes(action.source.kind)) return { categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan' };
  return { categoryId: 'MAINTAIN', categoryLabel: 'Maintain' };
}

export function buildFocusedHomeActionGuidance(
  action: RankedHomeAction,
  contextVersion: string | null,
  propertyFacts?: HealthFactorChecklistProperty,
  captureRequest?: AskCaptureRequest | null,
  options: {
    canContribute?: boolean;
    policyConflict?: ConflictedInsurancePolicyTerm | null;
    // The feature a derived inline capture targets (health-insight data gaps); falls back to the action's own.
    captureFeature?: { featureKey: string; operationKey: string; operationInput?: Record<string, unknown> } | null;
    // Appliances recorded for this home, when this is the Appliances insight; null/undefined otherwise.
    applianceCount?: number | null;
  } = {},
): AskOperationResult {
  const title = focusedTitle(action);
  const groupARouting = resolveGroupAAskRouting(action.primaryCta.href);
  const groupDRouting = !groupARouting ? resolveGroupDReplacementGuidanceRouting(action) : null;
  const groupBRecordReviewRouting = !groupARouting && !groupDRouting ? resolveGroupBRecordReviewRouting(action) : null;
  const specificRouting = groupARouting ?? groupDRouting ?? groupBRecordReviewRouting;
  const checklist = !specificRouting && propertyFacts && isHealthFactorFocusHref(action.primaryCta.href)
    ? resolveHealthFactorChecklist(action.signal, propertyFacts)
    : null;
  const acceptedWorkActions = !specificRouting && !checklist ? resolveAcceptedWorkActions(action, options.canContribute === true) : null;
  const policyConflictSection = !specificRouting && !checklist && !acceptedWorkActions && options.policyConflict?.conflicts.length
    ? buildPolicyConflictSection(options.policyConflict, options.canContribute === true)
    : null;
  // Lowest priority: a journey-linked action that has a more specific inline answer keeps that answer.
  const groupDJourneyRouting = !specificRouting && !checklist && !acceptedWorkActions && !policyConflictSection ? resolveGroupDJourneyRouting(action) : null;
  const routing = specificRouting ?? groupDJourneyRouting;
  // Resolvable inline only when the conflict is shown with its actions; otherwise the (exactly targeted) link stays.
  const policyConflictResolvableInline = Boolean(policyConflictSection && options.canContribute === true);
  // Appliances insight: the existing inventory-create workflow, one item at a time. The bulk form stays as the
  // secondary link -- it is bulk administration, which the decisions keep as a page destination.
  const applianceAddAction = !routing && !checklist && !acceptedWorkActions && !policyConflictSection
    && options.canContribute === true && typeof options.applianceCount === 'number' && isAppliancesInsight(action)
    ? {
      id: `home-action-add-appliance-${action.id}`,
      label: options.applianceCount > 0 ? 'Add another appliance' : 'Add an appliance',
      interactionType: 'START_WORKFLOW' as const,
      message: INVENTORY_ADD_ACTION_MESSAGE,
      operationId: 'INVENTORY_ITEM_CREATE',
      style: 'PRIMARY' as const,
    }
    : null;
  const isGroupCDestination = !routing && !checklist && isGroupCWholeToolDestination(action);
  const hasFeatureCapture = !routing && !checklist && !acceptedWorkActions && !policyConflictSection && !applianceAddAction && Boolean(captureRequest);
  const primaryAction = routing
    ? {
      id: `home-action-primary-${action.id}`,
      label: action.primaryCta.label,
      interactionType: 'START_WORKFLOW' as const,
      message: routing.message,
      operationId: routing.operationId,
      ...(groupDRouting ? { entityType: 'INVENTORY_ITEM', entityId: groupDRouting.entityId } : {}),
      ...(groupDJourneyRouting ? { entityType: groupDJourneyRouting.entityType, entityId: groupDJourneyRouting.entityId } : {}),
      style: 'PRIMARY' as const,
    }
    : {
      id: `home-action-primary-${action.id}`,
      label: action.primaryCta.label,
      href: action.primaryCta.href,
      // The checklist is now answered inline (see the `checklist` section below), so the
      // traditional page becomes an optional escape hatch rather than the sole destination.
      // A Group C whole-tool destination is honestly secondary for the same reason -- the
      // SUMMARY/GROUPED_LIST content above it is the actual answer, navigation is correct but
      // not the primary action. Same for a Group B feature-capture case: the missing fact is now
      // asked inline as a captureRequest card, so the resolution-center escape hatch is optional.
      style: checklist || isGroupCDestination || hasFeatureCapture ? 'SECONDARY' as const : 'PRIMARY' as const,
    };

  const timing = action.timing.dueAt
    ? `Due ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(action.timing.dueAt))}`
    : action.timing.rationale;
  const keyFacts = (action.presentation?.keyFacts ?? []).filter((fact) =>
    !/^(?:source|execution|task|work state)$/i.test(fact.label.trim()),
  );
  const isPreparation = action.presentation?.variant === 'ENVIRONMENT_PREPARATION';
  const preparationFacts = isPreparation
    ? action.presentation?.factGroups
      .find((group) => /preparation|checklist/i.test(group.label))
      ?.facts ?? []
    : [];
  const preparationItems = preparationFacts.length
    ? preparationFacts.map((fact, index) => ({
      id: `${action.id}-preparation-${index + 1}`,
      title: fact.value,
      description: null,
      meta: [fact.label],
      status: null,
      href: null,
    }))
    : [{
      id: action.id,
      title: action.recommendedAction,
      description: action.expectedOutcome,
      meta: [timing, `${action.confidence.label.toLowerCase()} confidence`],
      status: action.state,
      href: null,
    }];
  const boundaryParts = [
    action.governance.emergencyEscalation,
    action.governance.conservativeFallback,
    action.governance.professionalBoundary,
    action.recommendationResponse.status === 'AVAILABLE' ? null : action.recommendationResponse.safeNextAction,
  ].filter((value): value is string => Boolean(value));

  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY',
    id: 'focused-home-action-summary',
    title,
    body: sentence(action.presentation?.summary ?? action.whyItMatters),
    tone: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'CRITICAL' : action.priority === 'NOW' ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }, {
    type: 'GROUPED_LIST', filters: [],
    id: 'focused-home-action-guidance',
    title: isPreparation ? 'Prepare this home' : 'What to do next',
    description: isPreparation
      ? `${timing}. These steps come from the preparation plan for this home.`
      : 'Guidance for the Home Action you selected.',
    sections: [{
      id: 'next-step',
      title: isPreparation ? 'Preparation checklist' : 'Recommended next step',
      count: preparationItems.length,
      items: preparationItems,
    }, {
      id: 'why-it-matters',
      title: isPreparation ? 'Why this matters for this home' : 'Why this matters',
      count: 1,
      items: [{
        id: `${action.id}-why`,
        title: action.signal,
        description: action.whyItMatters,
        meta: [],
        status: null,
        href: null,
      }],
    }, ...(keyFacts.length ? [{
      id: 'known-details',
      title: isPreparation ? 'Forecast and home details' : 'Known details',
      count: keyFacts.filter((fact) => !isPreparation || fact.label !== 'Preparation').length,
      items: keyFacts.filter((fact) => !isPreparation || fact.label !== 'Preparation').map((fact, index) => ({
        id: `${action.id}-fact-${index}`,
        title: fact.label,
        description: fact.value,
        meta: [],
        status: null,
        href: null,
      })),
    }] : []), ...(checklist ? [{
      id: 'checklist',
      title: checklist.title,
      count: checklist.items.length,
      items: checklist.items.map((item) => ({
        id: `${action.id}-checklist-${item.id}`,
        title: item.system,
        description: `${item.ageNote} ${item.action}`,
        meta: [urgencyLabel(item.urgency)],
        status: null,
        href: null,
      })),
    }] : []), ...(policyConflictSection ? [policyConflictSection] : [])],
    // The inline checklist IS the destination page's content, so linking back to it is a redundant
    // round trip out of Ask -- omit the action entirely rather than demote it.
    actions: checklist || policyConflictResolvableInline
      ? []
      : acceptedWorkActions ?? (applianceAddAction ? [applianceAddAction, { ...primaryAction, style: 'SECONDARY' as const }] : [primaryAction]),
  }, {
    type: 'EVIDENCE',
    id: 'focused-home-action-evidence',
    title: 'Evidence for this guidance',
    items: action.evidence.map((evidence) => ({
      label: evidence.label,
      source: evidence.source,
      observedAt: evidence.observedAt,
    })),
  }];

  if (boundaryParts.length) {
    blocks.push({
      type: 'BOUNDARY',
      id: 'focused-home-action-boundary',
      title: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'Safety boundary' : 'Review before acting',
      body: boundaryParts.map(sentence).join(' '),
      severity: action.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'EMERGENCY' : action.governance.safetyTier === 'LOW_CONSEQUENCE' ? 'INFO' : 'CAUTION',
      suggestions: [],
    });
  }

  const limited = action.confidence.label === 'LOW' || action.recommendationResponse.status !== 'AVAILABLE';
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: limited ? action.recommendationResponse.reasonCode : 'HOME_ACTION_FOCUSED_GUIDANCE',
    contextVersion,
    parameters: {
      focusedHomeActionId: action.id,
      // Lets askCapture.ts's HOME_ACTIONS capture-submission branch write to (and recompute) the
      // SAME feature this specific action evaluated, instead of the generic HOME_ACTIONS/VIEW_FEED
      // scope the unfocused Home Actions list uses.
      ...(hasFeatureCapture && (options.captureFeature ?? action.propertyContextFeature) ? { captureFeature: options.captureFeature ?? action.propertyContextFeature } : {}),
    },
    blocks,
    ...(hasFeatureCapture && captureRequest ? { captureRequests: [captureRequest] } : {}),
    // The generic HOME_ACTIONS -> MAINTENANCE_STATUS handoff ("Understand maintenance status") is
    // unrelated to the one action being viewed, and the recommended step is already the first
    // section above -- offering it again as a "Suggested next step" only misleads.
    suppressSkillHandoff: true,
    suggestions: isPreparation ? [] : ['What else needs my attention?'],
  };
}
