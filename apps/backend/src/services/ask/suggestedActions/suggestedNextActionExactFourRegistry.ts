// ASK_COZY_SUGGESTED_NEXT_ACTIONS_IMPLEMENTATION_PLAN Appendix C.15 / Ask Redo FRD §27.7a: reviewed configuration for the exact-four
// selection policy. Versioned registry data, never handler prose. Self-contained (no handler imports) like the main registry.
import type { SuggestedNextAction } from '../../../productFramework/ask/ask.contract';
import { SUGGESTED_ACTION_OUTCOMES } from './suggestedNextActionRegistry';

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

/** Classes that carry no generic impression/dismissal cooldown (plan C.15.4): they are the current answer, urgent work, or the record in view. */
export const COOLDOWN_EXEMPT_SLOT_CLASSES: ReadonlySet<SuggestedNextActionSlotClass> = new Set(['CONTINUE_WORK', 'URGENT_WORK', 'EXACT_RECORD']);

/** Classes counted against `maxUnrelatedOpportunities` when the current answer does not own them. */
export const OPPORTUNITY_SLOT_CLASSES: ReadonlySet<SuggestedNextActionSlotClass> = new Set(['HOME_OPPORTUNITY', 'GOVERNED_CAPABILITY']);

/**
 * Registered "why now" reason tokens (plan C.15.2). A candidate's `reasonCodes` count as a why-now signal only when listed here.
 * Empty until the opportunity producer (step 4) registers its reviewed signals; tests inject their own through the policy input.
 */
export const REGISTERED_WHY_NOW_REASONS: ReadonlySet<string> = new Set<string>();

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
export const EXACT_FOUR_EXEMPT_REASONS = ['SAFE_RECOVERY_ONLY', 'PENDING_INTERACTION', 'NO_PROPERTY'] as const;
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
  CAPTURE_EVENT_CONFIRM: HOME_EVENT_FOLLOW_UPS,
  WARRANTY_CORRECT: WARRANTY_REMINDER,
  CAPTURE_WARRANTY_CONFIRM: WARRANTY_REMINDER,
  ROOM_CREATE: ROOM_ADD_ITEM,
  ROOM_RENAME: ROOM_ADD_ITEM,
  MAINTENANCE_TASK_UPDATE: ['MAINTENANCE_TASK_UPDATE:REOPEN_TASK', 'MAINTENANCE_TASK_UPDATE:RESUME_REMINDERS'],
  // Platform recovery (plan C.13): the failed operation owns its own "start this again", and a lookup owns its exact-record review.
  MAINTENANCE_TASK_CREATE: ['MAINTENANCE_TASK_CREATE:RESTART_AFTER_EXPIRY'],
  REFINANCE_RATE_MONITOR: ['REFINANCE_RATE_MONITOR:RESTART_AFTER_EXPIRY'],
  QUOTE_COMPARISON_CREATE: ['QUOTE_COMPARISON_CREATE:RESTART_AFTER_EXPIRY'],
  INVENTORY_LOOKUP: ['INVENTORY_LOOKUP:REVIEW_CURRENT_RECORD'],
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
