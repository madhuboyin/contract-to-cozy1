// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C.15 / Ask Redo FRD §27.7a: reviewed configuration for the exact-four
// selection policy. Versioned registry data, never handler prose. Self-contained (no handler imports) like the main registry.
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { SUGGESTED_ACTION_OUTCOMES } from './suggestedNextActionRegistry';
import { operationSpecificContinuationOutcomeKeys } from './operationSpecificContinuationRecipes';

export const SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION = 'sna-exact-four-1';

/** Selection-order classes (plan C.15 "Selection order", positions 1-7). */
export const SUGGESTED_NEXT_ACTION_SLOT_CLASSES = [
  'CONTINUE_WORK', 'URGENT_WORK', 'EXACT_RECORD', 'PROFILE_GAP', 'HOME_OPPORTUNITY', 'GOVERNED_CAPABILITY', 'CURATED_STARTER',
] as const;
export type SuggestedNextActionSlotClass = typeof SUGGESTED_NEXT_ACTION_SLOT_CLASSES[number];

export const EXACT_FOUR = {
  /** The fixed product count for this increment (plan C.15). */
  count: 4,
  /** Actionable profile completeness below this fraction prioritizes missing-profile capture. */
  completenessThreshold: 0.9,
  /** At most this many opportunities unrelated to the current answer (plan C.15.2). */
  maxUnrelatedOpportunities: 1,
  /** Below the threshold, one position is held for a strongly relevant opportunity only when at least this many positions are open. */
  opportunityReserveMinOpenPositions: 2,
  /**
   * A "strongly relevant" opportunity needs a contextual signal (current-answer ownership, an active-goal match, or a registered
   * why-now reason). Confidence only qualifies that signal: it must be at least this, and it can never create the signal.
   */
  strongOpportunityMinConfidence: 0.5,
} as const;

/**
 * Completed read surfaces whose embedded controls are optional branches, not a step the homeowner must finish. These operations keep
 * the governed footer as an escape route when the homeowner does not want the in-result CTA. This is deliberately operation-scoped:
 * capture, confirmation, clarification, recovery and safety states remain focused and never opt in through labels or block shape.
 */
export const OPTIONAL_RESULT_ESCAPE_ROUTE_OPERATIONS: ReadonlySet<string> = new Set([
  'PROPERTY_SUMMARY',
  'SELLER_PREP_CHECKLIST',
]);

export function allowsOptionalResultEscapeRoutes(operationId: string | null | undefined, status: string): boolean {
  return Boolean(operationId
    && OPTIONAL_RESULT_ESCAPE_ROUTE_OPERATIONS.has(operationId)
    && (status === 'ANSWERED' || status === 'READY_WITH_LIMITATIONS'));
}

/** Classes that carry no generic impression/dismissal cooldown (plan C.15.4): they are the current answer, urgent work, or the record in view. */
export const COOLDOWN_EXEMPT_SLOT_CLASSES: ReadonlySet<SuggestedNextActionSlotClass> = new Set(['CONTINUE_WORK', 'URGENT_WORK', 'EXACT_RECORD']);

/** Classes counted against `maxUnrelatedOpportunities` when the current answer does not own them. */
export const OPPORTUNITY_SLOT_CLASSES: ReadonlySet<SuggestedNextActionSlotClass> = new Set(['HOME_OPPORTUNITY', 'GOVERNED_CAPABILITY']);

/**
 * Registered "why now" reason tokens (plan C.15.2). A candidate's `reasonCodes` count as a why-now signal only when listed here.
 * Empty until the opportunity producer (step 4) registers its reviewed signals; tests inject their own through the policy input.
 */
export const REGISTERED_WHY_NOW_REASONS: ReadonlySet<string> = new Set<string>([
  'WHY_NOW_CAPITAL_ITEMS_UPCOMING',
  'WHY_NOW_WARRANTY_EXPIRING',
  'WHY_NOW_OPEN_FINDINGS',
]);

/**
 * Server-owned slot grants (plan C.15 review finding 1). A candidate's own `slotClass`, tier, source and traits are claims by the
 * producer that built it; they never decide a protected position or a cooldown exemption on their own. A producer may occupy only
 * the classes granted to its registered id; a claim outside the grant is demoted to the producer's `fallback` and counted. An
 * unregistered producer id gets only `HOME_OPPORTUNITY`.
 */
export interface ProducerSlotGrant {
  allowed: ReadonlySet<SuggestedNextActionSlotClass>;
  fallback: SuggestedNextActionSlotClass;
  /**
   * `currentResultOwnership` and `activeGoalMatch` on a candidate are producer claims, and they steer governance (the unrelated-
   * opportunity cap, offer cooldown, the reserved opportunity slot). A claim counts only when the producer's grant allows it; a denied
   * claim is cleared and counted (`signalClaimsDenied`). Both default to not allowed.
   */
  mayClaimCurrentResultOwnership?: boolean;
  /**
   * A SHARED transport producer (every handler's candidates flow through `operation-result.candidates`) is not proof of semantic
   * ownership. When true, an ownership claim is honored only if the TRUSTED current execution operation owns the candidate's target
   * outcome in `RESULT_OWNERSHIP_RELATIONSHIPS`. The candidate's own `sourceOperationId` is handler-set and is never the proof.
   */
  ownershipRequiresRegisteredRelationship?: boolean;
  mayClaimActiveGoalMatch?: boolean;
}
export const UNREGISTERED_PRODUCER_GRANT: ProducerSlotGrant = { allowed: new Set(['HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' };
export const PRODUCER_SLOT_GRANTS: Readonly<Record<string, ProducerSlotGrant>> = {
  // Handler-attached candidates describe the answer in front of the homeowner: continuing it and fixing its records. Urgent work
  // and starters need their own registered producers (step 4).
  // It may claim current-result ownership ONLY for an outcome the current execution's operation owns (RESULT_OWNERSHIP_RELATIONSHIPS);
  // it has no goal source.
  'operation-result.candidates': {
    allowed: new Set(['CONTINUE_WORK', 'EXACT_RECORD', 'HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY', mayClaimCurrentResultOwnership: true,
    ownershipRequiresRegisteredRelationship: true,
  },
  'operation-result.domain-continuations': {
    allowed: new Set(['CONTINUE_WORK']), fallback: 'HOME_OPPORTUNITY', mayClaimCurrentResultOwnership: true,
    ownershipRequiresRegisteredRelationship: true,
  },
  'profile.actionable-gaps': { allowed: new Set(['PROFILE_GAP']), fallback: 'PROFILE_GAP' },
  'handoff.skill': { allowed: new Set(['GOVERNED_CAPABILITY']), fallback: 'GOVERNED_CAPABILITY' },
  'home-actions.urgent': { allowed: new Set(['URGENT_WORK']), fallback: 'HOME_OPPORTUNITY' },
  'home-opportunities.signals': { allowed: new Set(['HOME_OPPORTUNITY']), fallback: 'HOME_OPPORTUNITY' },
  'active-plan.decision-thread': { allowed: new Set(['CONTINUE_WORK']), fallback: 'HOME_OPPORTUNITY', mayClaimActiveGoalMatch: true },
  'capability.recommendations': { allowed: new Set(['GOVERNED_CAPABILITY']), fallback: 'HOME_OPPORTUNITY' },
  // Curated starters (inventory D-O4/D-O16): last-resort fill only. A starter producer may occupy no other slot class and claims nothing.
  'starter.seasonal-home-care': { allowed: new Set(['CURATED_STARTER']), fallback: 'HOME_OPPORTUNITY' },
  'starter.home-basics': { allowed: new Set(['CURATED_STARTER']), fallback: 'HOME_OPPORTUNITY' },
  'starter.hiring-guide': { allowed: new Set(['CURATED_STARTER']), fallback: 'HOME_OPPORTUNITY' },
  'starter.property-summary': { allowed: new Set(['CURATED_STARTER']), fallback: 'HOME_OPPORTUNITY' },
};

type ClassifiableCandidate = {
  slotClass?: SuggestedNextActionSlotClass;
  source: SuggestedNextAction['provenance']['source'];
  tier: SuggestedNextAction['priority']['tier'];
  traits: { continuesPending: boolean };
  entityContext: { entityId: string | null };
};

/**
 * An explicit `slotClass` always wins. Otherwise: pending work or a CONTINUE tier continues the current work; a MISSING_DETAIL on a
 * named entity (or any RECORD_ACTION / ENTITY_ACTION) fixes the record in view; a MISSING_DETAIL with no entity is a home-profile gap;
 * a capability recommendation is a governed capability; everything else is an ordinary home opportunity. URGENT_WORK and
 * CURATED_STARTER are never inferred: a producer must declare them.
 */
export function resolveSuggestedNextActionSlotClass(candidate: ClassifiableCandidate): SuggestedNextActionSlotClass {
  if (candidate.slotClass) return candidate.slotClass;
  if (candidate.traits.continuesPending || candidate.source === 'PENDING_WORK' || candidate.tier === 'CONTINUE') return 'CONTINUE_WORK';
  if (candidate.source === 'MISSING_DETAIL') return candidate.entityContext.entityId ? 'EXACT_RECORD' : 'PROFILE_GAP';
  if (candidate.tier === 'RECORD_ACTION' || candidate.source === 'ENTITY_ACTION') return 'EXACT_RECORD';
  if (candidate.source === 'CAPABILITY_RECOMMENDATION') return 'GOVERNED_CAPABILITY';
  return 'HOME_OPPORTUNITY';
}

/** Bounded reason tokens for the degraded diagnostic and metrics (no homeowner data). */
export const EXACT_FOUR_EXEMPT_REASONS = ['SAFE_RECOVERY_ONLY', 'PENDING_INTERACTION', 'NO_PROPERTY', 'CONTEXTUAL_ACTIONS_IN_RESULT'] as const;
export type ExactFourExemptReason = typeof EXACT_FOUR_EXEMPT_REASONS[number];

export const EXACT_FOUR_SHORTAGE_REASONS = [
  'NO_CANDIDATES', 'INVALID_CANDIDATES', 'INELIGIBLE', 'COOLDOWN_SUPPRESSED', 'PRESENTATION_DUPLICATE',
  'OPPORTUNITY_CAP', 'PRODUCER_DROPPED', 'CONTEXT_FAILED', 'COMPLETENESS_UNKNOWN',
] as const;
export type ExactFourShortageReason = typeof EXACT_FOUR_SHORTAGE_REASONS[number];

/** The class a candidate may actually occupy: its requested class when the producer's grant allows it, else the grant's fallback. */
export function resolveGrantedSlotClass(
  candidate: ClassifiableCandidate,
  /** The REGISTERED producer id from the nominations key; never read from the candidate. */
  producerId: string | undefined,
  grants: Readonly<Record<string, ProducerSlotGrant>> = PRODUCER_SLOT_GRANTS,
): { slotClass: SuggestedNextActionSlotClass; denied: boolean } {
  const requested = resolveSuggestedNextActionSlotClass(candidate);
  const grant = grantForProducer(producerId, grants);
  return grant.allowed.has(requested) ? { slotClass: requested, denied: false } : { slotClass: grant.fallback, denied: true };
}

// ---- cooldown and lifecycle identity (packet section 8; owner-approved defaults, plan C.15.4) --------------------------------------

const HOUR_MS = 60 * 60 * 1000;
export const COOLDOWN_MS = {
  /** After an opportunity or capability unrelated to the current answer is OFFERED. */
  unrelatedOpportunityOffer: 7 * 24 * HOUR_MS,
  /** After a missing-profile chip is OFFERED. */
  profileOffer: 24 * HOUR_MS,
  /** After an explicit "Not now". "Not relevant" has no duration: it lasts until the material-state fingerprint changes. */
  notNow: 30 * 24 * HOUR_MS,
} as const;

/**
 * Offer cooldown for a granted slot class, or null for none. Current-answer, urgent and exact-record actions never get one, nor do
 * opportunities the current answer owns. Curated starters get none either: they are the last-resort fill, so cooling them would
 * manufacture shortages (a decision for review; the plan is silent).
 */
export function offerCooldownMs(slotClass: SuggestedNextActionSlotClass, currentResultOwnership: boolean): number | null {
  if (COOLDOWN_EXEMPT_SLOT_CLASSES.has(slotClass)) return null;
  if (slotClass === 'PROFILE_GAP') return COOLDOWN_MS.profileOffer;
  if (OPPORTUNITY_SLOT_CLASSES.has(slotClass) && !currentResultOwnership) return COOLDOWN_MS.unrelatedOpportunityOffer;
  return null;
}

/**
 * Owner-approved supported bound (October 5, 2026): at most this many ACTIVE dismissals (NOT_NOW or NOT_RELEVANT) are kept per user and
 * property. A new dismissal beyond it lifts the oldest ones, so the lifecycle table cannot grow without bound and an old dismissal
 * cannot suppress an outcome forever. The bound is a product limit, not a data-protection rule.
 */
export const SUPPORTED_DISMISSALS_PER_PROPERTY = 30;

/**
 * What a homeowner may dismiss, and how. Everything not listed is not dismissible (fail closed): continuing work, urgent work and exact-record
 * fixes are never dismissed by this control. "Not relevant" is for curated starters only (opportunities have no producer yet, so no fingerprint
 * source exists for them); "Not now" is for starters and home-profile gaps.
 */
export type DismissalReason = 'NOT_NOW' | 'NOT_RELEVANT';
const STARTER_DISMISSIBLE: ReadonlySet<string> = new Set([
  'SEASONAL_HOME_CARE:REVIEW_THIS_SEASON', 'SEASONAL_HOME_CARE:PREPARE_NEXT_SEASON', 'HOME_BASICS_GUIDE:REVIEW_SAFETY_BASICS', 'HOME_BASICS_GUIDE:REVIEW_MONTHLY_ROUTINE',
  'HIRING_GUIDE:REVIEW_HIRING_CHECKLIST', 'PROPERTY_SUMMARY:REVIEW_HOME_SUMMARY', 'PROPERTY_SUMMARY:REVIEW_COMPLETENESS',
]);
const PROFILE_GAP_OPERATIONS: ReadonlySet<string> = new Set(['PROPERTY_CONTEXT_AREA_CAPTURE']);
export function dismissalReasonsFor(operationId: string, outcomeKey: string): readonly DismissalReason[] {
  if (STARTER_DISMISSIBLE.has(`${operationId}:${outcomeKey}`)) return ['NOT_NOW', 'NOT_RELEVANT'];
  if (PROFILE_GAP_OPERATIONS.has(operationId)) return ['NOT_NOW'];
  return [];
}
/** A starter has no changing material state, so its "not relevant" fingerprint is a fixed, versioned token: it lapses only when the starter is revised. */
export function starterDismissalFingerprint(operationId: string, outcomeKey: string): string {
  return `STARTER:${operationId}:${outcomeKey}:v1`;
}

export interface LifecycleIdentity { operationId: string; outcomeKey: string; entityType: string | null; entityId: string | null }

/** The lifecycle record's identity within one user and property. `reasonCode` is deliberately not part of it. */
export function lifecycleKey(identity: LifecycleIdentity): string {
  return JSON.stringify([identity.operationId, identity.outcomeKey, identity.entityType ?? '', identity.entityId ?? '']);
}

export function grantForProducer(producerId: string | undefined, grants: Readonly<Record<string, ProducerSlotGrant>> = PRODUCER_SLOT_GRANTS): ProducerSlotGrant {
  return (producerId !== undefined ? grants[producerId] : undefined) ?? UNREGISTERED_PRODUCER_GRANT;
}

export interface EvaluatedSignals { currentResultOwnership: boolean; activeGoalMatch: boolean; deniedClaims: number }

/**
 * Registered ownership relationships: the operation that RAN (the trusted current execution) -> the target outcomes (`operation:outcome`)
 * whose actions it legitimately owns. Derived from the handlers' real call sites and cross-checked by tests against the outcome
 * vocabulary and the handler sources. An unlisted operation owns nothing.
 */
const INVENTORY_DETAIL_OUTCOMES = (SUGGESTED_ACTION_OUTCOMES.INVENTORY_ITEM_CORRECT ?? []).map((outcome) => `INVENTORY_ITEM_CORRECT:${outcome}`);
const HOME_EVENT_FOLLOW_UPS = ['HOME_EVENT_CORRECT:LINK_INVENTORY_ITEM', 'HOME_EVENT_CORRECT:ADD_AMOUNT'] as const;
const WARRANTY_REMINDER = ['HOME_DEADLINE_MONITOR:MONITOR_WARRANTY_EXPIRY'] as const;
const ROOM_ADD_ITEM = ['INVENTORY_ITEM_CREATE:ADD_ITEM_TO_ROOM'] as const;
export const RESULT_OWNERSHIP_RELATIONSHIPS: Readonly<Record<string, readonly string[]>> = {
  INVENTORY_ITEM_CORRECT: INVENTORY_DETAIL_OUTCOMES,
  INVENTORY_ITEM_CREATE: INVENTORY_DETAIL_OUTCOMES,
  HOME_EVENT_CORRECT: HOME_EVENT_FOLLOW_UPS,
  HOME_EVENT_UPDATE: HOME_EVENT_FOLLOW_UPS,
  CAPTURE_EVENT_CONFIRM: HOME_EVENT_FOLLOW_UPS,
  WARRANTY_UPDATE: WARRANTY_REMINDER,
  CAPTURE_WARRANTY_CONFIRM: WARRANTY_REMINDER,
  ROOM_CREATE: ROOM_ADD_ITEM,
  ROOM_RENAME: ROOM_ADD_ITEM,
  MAINTENANCE_TASK_UPDATE: ['MAINTENANCE_TASK_UPDATE:REOPEN_TASK', 'MAINTENANCE_TASK_UPDATE:RESUME_REMINDERS'],
  // Platform recovery (plan C.13): the failed operation owns its own "start this again", and a lookup owns its exact-record review.
  MAINTENANCE_TASK_CREATE: ['MAINTENANCE_TASK_CREATE:RESTART_AFTER_EXPIRY', ...operationSpecificContinuationOutcomeKeys('MAINTENANCE_TASK_CREATE')],
  MAINTENANCE_TASK_COMPLETE: operationSpecificContinuationOutcomeKeys('MAINTENANCE_TASK_COMPLETE'),
  REFINANCE_RATE_MONITOR: ['REFINANCE_RATE_MONITOR:RESTART_AFTER_EXPIRY', ...operationSpecificContinuationOutcomeKeys('REFINANCE_RATE_MONITOR')],
  QUOTE_COMPARISON_CREATE: ['QUOTE_COMPARISON_CREATE:RESTART_AFTER_EXPIRY', ...operationSpecificContinuationOutcomeKeys('QUOTE_COMPARISON_CREATE')],
  INVENTORY_LOOKUP: ['INVENTORY_LOOKUP:REVIEW_CURRENT_RECORD', ...operationSpecificContinuationOutcomeKeys('INVENTORY_LOOKUP')],
  DIY_TEMPLATE_BROWSE: ['DIY_PROJECT_START:START_REVIEWED_PROJECT', 'DIY_PROJECT_GUIDE:CONTINUE_REVIEWED_PROJECT'],
  DIY_PROJECTS: ['DIY_PROJECT_GUIDE:CONTINUE_REVIEWED_PROJECT'],
  MAINTENANCE_STATUS: operationSpecificContinuationOutcomeKeys('MAINTENANCE_STATUS'),
  MAINTENANCE_FORECAST: operationSpecificContinuationOutcomeKeys('MAINTENANCE_FORECAST'),
  MAINTENANCE_BUDGET_FORECAST: operationSpecificContinuationOutcomeKeys('MAINTENANCE_BUDGET_FORECAST'),
  MAINTENANCE_TEMPLATES_BROWSE: operationSpecificContinuationOutcomeKeys('MAINTENANCE_TEMPLATES_BROWSE'),
  HOME_ACTIONS: operationSpecificContinuationOutcomeKeys('HOME_ACTIONS'),
  WARRANTY_LOOKUP: operationSpecificContinuationOutcomeKeys('WARRANTY_LOOKUP'),
  DOCUMENT_LOOKUP: operationSpecificContinuationOutcomeKeys('DOCUMENT_LOOKUP'),
  DOCUMENT_PROMOTION_REVIEW: operationSpecificContinuationOutcomeKeys('DOCUMENT_PROMOTION_REVIEW'),
  RECALL_REVIEW: operationSpecificContinuationOutcomeKeys('RECALL_REVIEW'),
  INSPECTION_FINDINGS: operationSpecificContinuationOutcomeKeys('INSPECTION_FINDINGS'),
  INCIDENT_CLAIM_STATUS: operationSpecificContinuationOutcomeKeys('INCIDENT_CLAIM_STATUS'),
  INCIDENT_CONTINUATION: operationSpecificContinuationOutcomeKeys('INCIDENT_CONTINUATION'),
  CLAIM_CHECKLIST_VIEW: operationSpecificContinuationOutcomeKeys('CLAIM_CHECKLIST_VIEW'),
  DOCUMENT_PROMOTION_CONFIRM: operationSpecificContinuationOutcomeKeys('DOCUMENT_PROMOTION_CONFIRM'),
  RECALL_MATCH_UPDATE: operationSpecificContinuationOutcomeKeys('RECALL_MATCH_UPDATE'),
  INSPECTION_FINDING_UPDATE: operationSpecificContinuationOutcomeKeys('INSPECTION_FINDING_UPDATE'),
  INSPECTION_FINDING_DECISION_COMMAND: operationSpecificContinuationOutcomeKeys('INSPECTION_FINDING_DECISION_COMMAND'),
  INSPECTION_REPORT_COMMAND: operationSpecificContinuationOutcomeKeys('INSPECTION_REPORT_COMMAND'),
  INSPECTION_NEGOTIATION_PACKAGE: operationSpecificContinuationOutcomeKeys('INSPECTION_NEGOTIATION_PACKAGE'),
  INSPECTION_REPORTS: operationSpecificContinuationOutcomeKeys('INSPECTION_REPORTS'),
  INSPECTION_REPORT_FINDINGS: operationSpecificContinuationOutcomeKeys('INSPECTION_REPORT_FINDINGS'),
  INSPECTION_REPORT_COMPARE: operationSpecificContinuationOutcomeKeys('INSPECTION_REPORT_COMPARE'),
  CLAIM_FILE: operationSpecificContinuationOutcomeKeys('CLAIM_FILE'),
  CLAIM_TRANSITION: operationSpecificContinuationOutcomeKeys('CLAIM_TRANSITION'),
  CLAIM_ACTIVITY_COMMAND: operationSpecificContinuationOutcomeKeys('CLAIM_ACTIVITY_COMMAND'),
  SEASONAL_CHECKLIST_SETUP: operationSpecificContinuationOutcomeKeys('SEASONAL_CHECKLIST_SETUP'),
  SEASONAL_ITEM_COMMAND: operationSpecificContinuationOutcomeKeys('SEASONAL_ITEM_COMMAND'),
  PROJECT_TRACKER_PROJECTS: operationSpecificContinuationOutcomeKeys('PROJECT_TRACKER_PROJECTS'),
  PROJECT_TRACKER_CREATE: operationSpecificContinuationOutcomeKeys('PROJECT_TRACKER_CREATE'),
  PROJECT_TRACKER_COMMAND: operationSpecificContinuationOutcomeKeys('PROJECT_TRACKER_COMMAND'),
  DIY_PROJECT_GUIDE: operationSpecificContinuationOutcomeKeys('DIY_PROJECT_GUIDE'),
  DIY_STEP_UPDATE: operationSpecificContinuationOutcomeKeys('DIY_STEP_UPDATE'),
  DIY_PROJECT_COMPLETE: operationSpecificContinuationOutcomeKeys('DIY_PROJECT_COMPLETE'),
  DIY_PROJECT_ABANDON: operationSpecificContinuationOutcomeKeys('DIY_PROJECT_ABANDON'),
  DIY_PROJECT_START: operationSpecificContinuationOutcomeKeys('DIY_PROJECT_START'),
  DIY_COMPLETION_RECOVER: operationSpecificContinuationOutcomeKeys('DIY_COMPLETION_RECOVER'),
  DIY_PROJECT_NOTE_COMMAND: operationSpecificContinuationOutcomeKeys('DIY_PROJECT_NOTE_COMMAND'),
  DIY_SKILL_PROFILE_COMMAND: operationSpecificContinuationOutcomeKeys('DIY_SKILL_PROFILE_COMMAND'),
  PLANT_CARE_OUTLOOK: operationSpecificContinuationOutcomeKeys('PLANT_CARE_OUTLOOK'),
  ROOM_PLANT_RECOMMENDATIONS: operationSpecificContinuationOutcomeKeys('ROOM_PLANT_RECOMMENDATIONS'),
  HOME_PLANT_ADD: operationSpecificContinuationOutcomeKeys('HOME_PLANT_ADD'),
  HOME_HABIT_UPDATE: operationSpecificContinuationOutcomeKeys('HOME_HABIT_UPDATE'),
  HOME_HABIT_PREFERENCES_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_HABIT_PREFERENCES_COMMAND'),
  HOME_HABITS_GENERATE: operationSpecificContinuationOutcomeKeys('HOME_HABITS_GENERATE'),
  RENOVATION_PERMIT_READINESS: operationSpecificContinuationOutcomeKeys('RENOVATION_PERMIT_READINESS'),
  RENOVATION_CASE_START: operationSpecificContinuationOutcomeKeys('RENOVATION_CASE_START'),
  RENOVATION_READINESS_COMMAND: operationSpecificContinuationOutcomeKeys('RENOVATION_READINESS_COMMAND'),
  PERMIT_TRACKER_COMMAND: operationSpecificContinuationOutcomeKeys('PERMIT_TRACKER_COMMAND'),
  PERMIT_TRACKER_STATUS: operationSpecificContinuationOutcomeKeys('PERMIT_TRACKER_STATUS'),
  COVERAGE_GAPS: operationSpecificContinuationOutcomeKeys('COVERAGE_GAPS'),
  COVERAGE_COMPARISON_STATUS: operationSpecificContinuationOutcomeKeys('COVERAGE_COMPARISON_STATUS'),
  COVERAGE_REVIEW_STATUS: operationSpecificContinuationOutcomeKeys('COVERAGE_REVIEW_STATUS'),
  COVERAGE_COMMAND: operationSpecificContinuationOutcomeKeys('COVERAGE_COMMAND'),
  SAVINGS_OPPORTUNITIES: operationSpecificContinuationOutcomeKeys('SAVINGS_OPPORTUNITIES'),
  SAVINGS_BENEFIT_COMMAND: operationSpecificContinuationOutcomeKeys('SAVINGS_BENEFIT_COMMAND'),
  OWNERSHIP_COSTS: operationSpecificContinuationOutcomeKeys('OWNERSHIP_COSTS'),
  OWNERSHIP_COST_COMMAND: operationSpecificContinuationOutcomeKeys('OWNERSHIP_COST_COMMAND'),
  FINANCING_OVERVIEW: operationSpecificContinuationOutcomeKeys('FINANCING_OVERVIEW'),
  FINANCING_PROFILE_COMMAND: operationSpecificContinuationOutcomeKeys('FINANCING_PROFILE_COMMAND'),
  REFINANCE_ANALYSIS: operationSpecificContinuationOutcomeKeys('REFINANCE_ANALYSIS'),
  CAPITAL_RESERVE_PLAN: operationSpecificContinuationOutcomeKeys('CAPITAL_RESERVE_PLAN'),
  CAPITAL_TIMELINE_COMMAND: operationSpecificContinuationOutcomeKeys('CAPITAL_TIMELINE_COMMAND'),
  PROPERTY_TAX_APPEAL_READINESS: operationSpecificContinuationOutcomeKeys('PROPERTY_TAX_APPEAL_READINESS'),
  PROPERTY_TAX_APPEAL_COMMAND: operationSpecificContinuationOutcomeKeys('PROPERTY_TAX_APPEAL_COMMAND'),
  PROPERTY_TAX_COMPARABLE_COMMAND: operationSpecificContinuationOutcomeKeys('PROPERTY_TAX_COMPARABLE_COMMAND'),
  SERVICE_PRICE_CHECKS: operationSpecificContinuationOutcomeKeys('SERVICE_PRICE_CHECKS'),
  SERVICE_PRICE_CHECK_RUN: operationSpecificContinuationOutcomeKeys('SERVICE_PRICE_CHECK_RUN'),
  QUOTE_COMPARISON_REVIEW: operationSpecificContinuationOutcomeKeys('QUOTE_COMPARISON_REVIEW'),
  QUOTE_COMPARISON_COMMAND: operationSpecificContinuationOutcomeKeys('QUOTE_COMPARISON_COMMAND'),
  PRICE_FINALIZATIONS_LIST: operationSpecificContinuationOutcomeKeys('PRICE_FINALIZATIONS_LIST'),
  PRICE_FINALIZATION_COMMAND: operationSpecificContinuationOutcomeKeys('PRICE_FINALIZATION_COMMAND'),
  REPLACEMENT_GUIDANCE: operationSpecificContinuationOutcomeKeys('REPLACEMENT_GUIDANCE'),
  GUIDANCE_JOURNEYS_LIST: operationSpecificContinuationOutcomeKeys('GUIDANCE_JOURNEYS_LIST'),
  GUIDANCE_JOURNEY_CONTINUE: operationSpecificContinuationOutcomeKeys('GUIDANCE_JOURNEY_CONTINUE'),
  GUIDANCE_STEP_SKIP: operationSpecificContinuationOutcomeKeys('GUIDANCE_STEP_SKIP'),
  GUIDANCE_JOURNEY_DISMISS: operationSpecificContinuationOutcomeKeys('GUIDANCE_JOURNEY_DISMISS'),
  GUIDANCE_JOURNEY_CREATE: operationSpecificContinuationOutcomeKeys('GUIDANCE_JOURNEY_CREATE'),
  NEGOTIATION_SHIELD_CASES: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_CASES'),
  NEGOTIATION_SHIELD_CASE_START: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_CASE_START'),
  NEGOTIATION_SHIELD_BUYER_COMMAND: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_BUYER_COMMAND'),
  NEGOTIATION_SHIELD_CASE_ATTACH: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_CASE_ATTACH'),
  NEGOTIATION_SHIELD_CASE_UPDATE: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_CASE_UPDATE'),
  NEGOTIATION_SHIELD_CASE_ANALYZE: operationSpecificContinuationOutcomeKeys('NEGOTIATION_SHIELD_CASE_ANALYZE'),
  SELL_HOLD_RENT_ANALYSIS: operationSpecificContinuationOutcomeKeys('SELL_HOLD_RENT_ANALYSIS'),
  SELL_HOLD_RENT_COMMAND: operationSpecificContinuationOutcomeKeys('SELL_HOLD_RENT_COMMAND'),
  SELL_HOLD_RENT_GOAL_CAPTURE: operationSpecificContinuationOutcomeKeys('SELL_HOLD_RENT_GOAL_CAPTURE'),
  SELLER_PREP_CHECKLIST: operationSpecificContinuationOutcomeKeys('SELLER_PREP_CHECKLIST'),
  SELLER_PREP_ITEM_DECISION: operationSpecificContinuationOutcomeKeys('SELLER_PREP_ITEM_DECISION'),
  SELLER_PREP_CASE_COMMAND: operationSpecificContinuationOutcomeKeys('SELLER_PREP_CASE_COMMAND'),
  MAJOR_EVENT_ENTRY: operationSpecificContinuationOutcomeKeys('MAJOR_EVENT_ENTRY'),
  HVAC_DECISION_START: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_START'),
  HVAC_DECISION_CONTINUE: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_CONTINUE'),
  HVAC_SPECIALIST_ENGAGE: operationSpecificContinuationOutcomeKeys('HVAC_SPECIALIST_ENGAGE'),
  HVAC_DECISION_SCENARIO: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_SCENARIO'),
  HVAC_DECISION_ABANDON: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_ABANDON'),
  HVAC_PREFERENCE_SAVE: operationSpecificContinuationOutcomeKeys('HVAC_PREFERENCE_SAVE'),
  HVAC_PREFERENCE_FORGET: operationSpecificContinuationOutcomeKeys('HVAC_PREFERENCE_FORGET'),
  HVAC_DECISION_OUTCOME_REPORT: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_OUTCOME_REPORT'),
  HVAC_DECISION_OUTCOME_VIEW: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_OUTCOME_VIEW'),
  HVAC_DECISION_OUTCOME_UNLINK: operationSpecificContinuationOutcomeKeys('HVAC_DECISION_OUTCOME_UNLINK'),
  BUYER_PLAN_STATUS: operationSpecificContinuationOutcomeKeys('BUYER_PLAN_STATUS'),
  BUYER_DEADLINES: operationSpecificContinuationOutcomeKeys('BUYER_DEADLINES'),
  BUYER_DOCUMENT_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_DOCUMENT_READINESS'),
  BUYER_INSPECTION_REVIEW: operationSpecificContinuationOutcomeKeys('BUYER_INSPECTION_REVIEW'),
  BUYER_FINANCING_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_FINANCING_READINESS'),
  BUYER_TITLE_ESCROW_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_TITLE_ESCROW_READINESS'),
  BUYER_WALKTHROUGH_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_WALKTHROUGH_READINESS'),
  BUYER_DISCLOSURE_FUNDS_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_DISCLOSURE_FUNDS_READINESS'),
  BUYER_CLOSING_DAY_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_CLOSING_DAY_READINESS'),
  BUYER_CONTRACT_TIMELINE: operationSpecificContinuationOutcomeKeys('BUYER_CONTRACT_TIMELINE'),
  BUYER_NEGOTIATION_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_NEGOTIATION_READINESS'),
  BUYER_COST_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_COST_READINESS'),
  BUYER_MOVE_STATUS: operationSpecificContinuationOutcomeKeys('BUYER_MOVE_STATUS'),
  BUYER_LOAN_ESTIMATES: operationSpecificContinuationOutcomeKeys('BUYER_LOAN_ESTIMATES'),
  BUYER_INSURANCE_READINESS: operationSpecificContinuationOutcomeKeys('BUYER_INSURANCE_READINESS'),
  BUYER_CONTRACT_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_CONTRACT_COMMAND'),
  BUYER_CLOSING_DISCLOSURE_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_CLOSING_DISCLOSURE_COMMAND'),
  BUYER_LOAN_ESTIMATE_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_LOAN_ESTIMATE_COMMAND'),
  BUYER_PLAN_SETUP_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_PLAN_SETUP_COMMAND'),
  BUYER_INSURANCE_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_INSURANCE_COMMAND'),
  BUYER_CLOSING_ITEM_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_CLOSING_ITEM_COMMAND'),
  BUYER_WALKTHROUGH_COMMAND: operationSpecificContinuationOutcomeKeys('BUYER_WALKTHROUGH_COMMAND'),
  BUYER_TASK_COMPLETE: operationSpecificContinuationOutcomeKeys('BUYER_TASK_COMPLETE'),
  BUYER_TASK_CREATE: operationSpecificContinuationOutcomeKeys('BUYER_TASK_CREATE'),
  BUYER_TASK_UPDATE: operationSpecificContinuationOutcomeKeys('BUYER_TASK_UPDATE'),
  BUYER_FINDING_DISPOSITION: operationSpecificContinuationOutcomeKeys('BUYER_FINDING_DISPOSITION'),
  BUYER_LIFECYCLE_UPDATE: operationSpecificContinuationOutcomeKeys('BUYER_LIFECYCLE_UPDATE'),
  HOME_STATUS_BOARD: operationSpecificContinuationOutcomeKeys('HOME_STATUS_BOARD'),
  STATUS_BOARD_COMMAND: operationSpecificContinuationOutcomeKeys('STATUS_BOARD_COMMAND'),
  HOME_TIMELINE_EVENTS: operationSpecificContinuationOutcomeKeys('HOME_TIMELINE_EVENTS'),
  HOME_EVENT_VISIBILITY: operationSpecificContinuationOutcomeKeys('HOME_EVENT_VISIBILITY'),
  HOME_CHANGE_SUMMARY: operationSpecificContinuationOutcomeKeys('HOME_CHANGE_SUMMARY'),
  HOME_BRIEFING_VIEW: operationSpecificContinuationOutcomeKeys('HOME_BRIEFING_VIEW'),
  HOME_BRIEFING_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_BRIEFING_COMMAND'),
  HOME_BRIEFING_SHARE_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_BRIEFING_SHARE_COMMAND'),
  HOME_EVENT_RADAR_FEED: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_FEED'),
  HOME_EVENT_RADAR_STATE: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_STATE'),
  HOME_EVENT_RADAR_MARK_DONE: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_MARK_DONE'),
  HOME_EVENT_RADAR_FEEDBACK: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_FEEDBACK'),
  HOME_EVENT_RADAR_PREFERENCES: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_PREFERENCES'),
  HOME_EVENT_RADAR_TASK: operationSpecificContinuationOutcomeKeys('HOME_EVENT_RADAR_TASK'),
  HOME_WORK_ITEMS: operationSpecificContinuationOutcomeKeys('HOME_WORK_ITEMS'),
  HOME_WORK_ITEM_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_WORK_ITEM_COMMAND'),
  PROPERTY_SUMMARY: operationSpecificContinuationOutcomeKeys('PROPERTY_SUMMARY'),
  HOME_DEADLINE_MONITOR: operationSpecificContinuationOutcomeKeys('HOME_DEADLINE_MONITOR'),
  APPLIANCE_FAILURE_RISK: operationSpecificContinuationOutcomeKeys('APPLIANCE_FAILURE_RISK'),
  BREAK_EVEN_ANALYSIS: operationSpecificContinuationOutcomeKeys('BREAK_EVEN_ANALYSIS'),
  CAPTURE_EVIDENCE_CONFIRM: operationSpecificContinuationOutcomeKeys('CAPTURE_EVIDENCE_CONFIRM'),
  CAPTURE_FACT_CONFIRM: operationSpecificContinuationOutcomeKeys('CAPTURE_FACT_CONFIRM'),
  DO_NOTHING_SCENARIO_COMMAND: operationSpecificContinuationOutcomeKeys('DO_NOTHING_SCENARIO_COMMAND'),
  DO_NOTHING_SIMULATION: operationSpecificContinuationOutcomeKeys('DO_NOTHING_SIMULATION'),
  DO_NOTHING_SIMULATION_RUN: operationSpecificContinuationOutcomeKeys('DO_NOTHING_SIMULATION_RUN'),
  HIRING_GUIDE: operationSpecificContinuationOutcomeKeys('HIRING_GUIDE'),
  HOA_COMPLIANCE_COMMAND: operationSpecificContinuationOutcomeKeys('HOA_COMPLIANCE_COMMAND'),
  HOA_COMPLIANCE_STATUS: operationSpecificContinuationOutcomeKeys('HOA_COMPLIANCE_STATUS'),
  HOME_BASICS_GUIDE: operationSpecificContinuationOutcomeKeys('HOME_BASICS_GUIDE'),
  HOME_DIGITAL_WILL: operationSpecificContinuationOutcomeKeys('HOME_DIGITAL_WILL'),
  HOME_JOURNEY_SET: operationSpecificContinuationOutcomeKeys('HOME_JOURNEY_SET'),
  HOME_RECORD_STATE_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_RECORD_STATE_COMMAND'),
  HOME_UPGRADE_COMMAND: operationSpecificContinuationOutcomeKeys('HOME_UPGRADE_COMMAND'),
  HOME_UPGRADE_SCENARIOS: operationSpecificContinuationOutcomeKeys('HOME_UPGRADE_SCENARIOS'),
  HOUSEHOLD_INVITATION: operationSpecificContinuationOutcomeKeys('HOUSEHOLD_INVITATION'),
  INTELLIGENCE_ENVELOPE_QUERY: operationSpecificContinuationOutcomeKeys('INTELLIGENCE_ENVELOPE_QUERY'),
  MATERIAL_SPECS_LIST: operationSpecificContinuationOutcomeKeys('MATERIAL_SPECS_LIST'),
  MATERIAL_SPEC_ADD: operationSpecificContinuationOutcomeKeys('MATERIAL_SPEC_ADD'),
  MATERIAL_SPEC_UPDATE: operationSpecificContinuationOutcomeKeys('MATERIAL_SPEC_UPDATE'),
  NEIGHBORHOOD_CHANGE_FEED: operationSpecificContinuationOutcomeKeys('NEIGHBORHOOD_CHANGE_FEED'),
  NEIGHBORHOOD_INTERACTION_COMMAND: operationSpecificContinuationOutcomeKeys('NEIGHBORHOOD_INTERACTION_COMMAND'),
  OPERATIONAL_WORK_UPDATE: operationSpecificContinuationOutcomeKeys('OPERATIONAL_WORK_UPDATE'),
  PAST_HAZARD_EXPOSURE: operationSpecificContinuationOutcomeKeys('PAST_HAZARD_EXPOSURE'),
  PAST_HAZARD_OUTCOME_COMMAND: operationSpecificContinuationOutcomeKeys('PAST_HAZARD_OUTCOME_COMMAND'),
  ENVIRONMENT_REPORT: operationSpecificContinuationOutcomeKeys('ENVIRONMENT_REPORT'),
  ENVIRONMENT_REPORT_COMMAND: operationSpecificContinuationOutcomeKeys('ENVIRONMENT_REPORT_COMMAND'),
  PROPERTY_BRIEFS_LIST: operationSpecificContinuationOutcomeKeys('PROPERTY_BRIEFS_LIST'),
  PROPERTY_BRIEF_COMMAND: operationSpecificContinuationOutcomeKeys('PROPERTY_BRIEF_COMMAND'),
  PROPERTY_CONTEXT_AREA_CAPTURE: operationSpecificContinuationOutcomeKeys('PROPERTY_CONTEXT_AREA_CAPTURE'),
  PROPERTY_PURCHASE_DATE_SET: operationSpecificContinuationOutcomeKeys('PROPERTY_PURCHASE_DATE_SET'),
  RESERVE_FUND_COMMAND: operationSpecificContinuationOutcomeKeys('RESERVE_FUND_COMMAND'),
};

/** Does the TRUSTED current execution operation own this candidate's target outcome? */
export function currentOperationOwnsOutcome(currentOperationId: string | null | undefined, target: { operationId: string; outcomeKey: string }): boolean {
  if (!currentOperationId) return false;
  return (RESULT_OWNERSHIP_RELATIONSHIPS[currentOperationId] ?? []).includes(`${target.operationId}:${target.outcomeKey}`);
}

/** The ownership and goal signals a candidate may actually carry: its claims, cleared where the producer's grant (and relationship) do not allow them. */
export function evaluateSignalClaims(
  signals: { currentResultOwnership: boolean; activeGoalMatch: boolean },
  grant: ProducerSlotGrant,
  context: { ownershipRelationshipHolds: boolean } = { ownershipRelationshipHolds: false },
): EvaluatedSignals {
  const ownershipAllowed = grant.mayClaimCurrentResultOwnership === true
    && (grant.ownershipRequiresRegisteredRelationship !== true || context.ownershipRelationshipHolds);
  const ownership = signals.currentResultOwnership && ownershipAllowed;
  const goal = signals.activeGoalMatch && grant.mayClaimActiveGoalMatch === true;
  return {
    currentResultOwnership: ownership, activeGoalMatch: goal,
    deniedClaims: Number(signals.currentResultOwnership && !ownership) + Number(signals.activeGoalMatch && !goal),
  };
}

/**
 * Curated starters are governed by a SOFT rotation, not a cooldown (a hard cooldown would manufacture shortages): every offer is
 * recorded, starters not offered within this window are preferred, then the least recently offered, and the oldest still fills the row.
 */
export const STARTER_ROTATION_MS = 7 * 24 * HOUR_MS;
