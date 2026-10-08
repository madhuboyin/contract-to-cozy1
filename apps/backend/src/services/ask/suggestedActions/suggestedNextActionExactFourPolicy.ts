// Plan Appendix C.15: the exact-four selection policy. Pure given its inputs (no clock, database, metrics or model), so every rule is
// unit-testable. It reuses the shared stages 1-3 (validation, eligibility, scoring, semantic/presentation deduplication) and replaces
// only the final greedy selection with the C.15 slot order. NOT wired into the live finalizer: exact-four activates atomically after
// the whole scope can meet the invariant (C.15.4 step 6), so today's `selectSuggestedNextActions` remains the production path.
import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import {
  emptyPolicyDiagnostics, evaluateSuggestedNextActionPool, selectSuggestedNextActions,
  type PolicyDiagnostics, type PolicyInput, type PolicyResult, type SelectedCandidate,
} from './suggestedNextActionPolicy';
import { compareRanked } from './suggestedNextActionRanking';
import {
  COOLDOWN_EXEMPT_SLOT_CLASSES, EXACT_FOUR, lifecycleKey, EXACT_FOUR_SHORTAGE_REASONS, STARTER_ROTATION_MS, currentOperationOwnsOutcome, evaluateSignalClaims, grantForProducer, OPPORTUNITY_SLOT_CLASSES, SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION,
  SUGGESTED_NEXT_ACTION_SLOT_CLASSES, PRODUCER_SLOT_GRANTS, REGISTERED_WHY_NOW_REASONS, resolveGrantedSlotClass,
  type ProducerSlotGrant, type ExactFourExemptReason, type ExactFourShortageReason, type SuggestedNextActionSlotClass,
} from './suggestedNextActionExactFourRegistry';

export const EXACT_FOUR_COOLDOWN_REJECTION = 'COOLDOWN:SUPPRESSED';
export const EXACT_FOUR_COMPLETED_REJECTION = 'COMPLETED:SUPPRESSED';

export interface ExactFourInput extends PolicyInput {
  /** The answer already renders declared workflow controls; curated starter padding would compete with that contextual surface. */
  contextualPresentationActions?: boolean;
  /**
   * Actionable profile completeness as a fraction in [0, 1] (plan C.15.1), or null when it could not be computed. Below the
   * threshold, missing-profile capture is prioritized. null (could not be computed) is NOT treated as complete: it fails profile-first
   * (the same regime as below the threshold) and is reported as `completenessUnknown`.
   */
  actionableCompleteness: number | null;
  /**
   * The completeness score came from an audience lookup that failed (`ActionableCompleteness.audienceUncertain`), so the denominator may
   * be too small and the fraction overstated. Like unknown completeness it fails profile-first: the home is not treated as at or above
   * 90%, and the uncertainty is reported.
   */
  audienceUncertain?: boolean;
  /**
   * Lifecycle keys (`lifecycleKey`: operation + outcome + entity scope) in offer cooldown or explicit dismissal, from the durable
   * lifecycle record (`loadLifecycleState().cooldownKeys`). Never applied to a granted CONTINUE_WORK, URGENT_WORK or EXACT_RECORD.
   */
  cooldownLifecycleKeys?: ReadonlySet<string>;
  /**
   * Lifecycle keys whose outcome was completed and is not registry-repeatable (`loadLifecycleState().completedKeys`). Unlike a cooldown
   * this applies to EVERY slot class, including the cooldown-exempt ones: a completed action is not offered again.
   */
  completedLifecycleKeys?: ReadonlySet<string>;
  /** Last offer time per lifecycle key (`loadLifecycleState().lastOfferedAtMs`), used only to rotate curated starters. */
  starterLastOfferedAtMs?: ReadonlyMap<string, number>;
  /** Clock for the starter rotation window; the policy itself never reads one. Without it no rotation diagnostic is produced. */
  rotationNowMs?: number;
  /**
   * The operation of the TRUSTED current execution (the finalizer's own `operationId`), never read from a candidate. Ownership claims
   * from a producer whose grant requires a registered relationship are honored only when this operation owns the candidate's outcome.
   */
  currentOperationId?: string | null;
  /** Overrides the server-owned producer grants (tests only; production uses the registry). */
  slotGrants?: Readonly<Record<string, ProducerSlotGrant>>;
  /** Overrides the registered why-now reason tokens (tests only; production uses the registry). */
  whyNowReasons?: ReadonlySet<string>;
  /** Failures the caller already knows about, carried into a shortage diagnostic. */
  upstreamShortageReasons?: readonly Extract<ExactFourShortageReason, 'PRODUCER_DROPPED' | 'CONTEXT_FAILED'>[];
}

export type ExactFourDiagnostics =
  | { policyVersion: string; applicability: 'EXEMPT'; exemptReason: ExactFourExemptReason }
  | {
    policyVersion: string;
    applicability: 'EXACT_FOUR';
    /** 0 when four were selected. */
    shortage: number;
    shortageReasons: ExactFourShortageReason[];
    selectedBySlot: Partial<Record<SuggestedNextActionSlotClass, number>>;
    belowCompletenessThreshold: boolean;
    /** Completeness could not be computed; the policy ran profile-first. Reported even when four were selected. */
    completenessUnknown: boolean;
    /** The audience lookup behind the completeness score failed; the policy ran profile-first. Reported even when four were selected. */
    audienceUncertain: boolean;
    /** Candidates whose requested slot class was outside their producer's server-owned grant (demoted, never promoted). */
    slotClassDenied: number;
    /** Ownership or active-goal claims the producer's grant did not allow (cleared, never honored). */
    signalClaimsDenied: number;
    /** Curated starters selected although they were offered within the rotation window (the oldest filled the row). */
    startersWithinRotationWindow: number;
    /** True when a position was held for a strongly relevant opportunity. */
    opportunityReserved: boolean;
  };

/** What the policy actually evaluated for a selected action: the granted class and the signals that survived the grant. */
export interface ExactFourEvaluation {
  slotClass: SuggestedNextActionSlotClass;
  currentResultOwnership: boolean;
  activeGoalMatch: boolean;
}

export interface ExactFourResult extends PolicyResult {
  exactFour: ExactFourDiagnostics;
  /** Aligned with `selected` (same index). Lifecycle persistence must use these evaluated values, never the raw candidate claims. */
  evaluated: ExactFourEvaluation[];
}

export function resolveExactFourExemption(
  eligibility: PolicyInput['eligibility'],
  contextualPresentationActions = false,
): ExactFourExemptReason | null {
  if (eligibility.mode !== 'NORMAL') return 'SAFE_RECOVERY_ONLY';
  if (eligibility.pendingInteractionActive) return 'PENDING_INTERACTION';
  if (!eligibility.sourcePropertyId) return 'NO_PROPERTY';
  if (contextualPresentationActions) return 'CONTEXTUAL_ACTIONS_IN_RESULT';
  return null;
}

interface PoolEntry {
  candidate: SuggestedNextActionCandidate;
  producerId: string;
  verdict: SelectedCandidate['verdict'];
  score: number;
  mergedReasonCodes: string[];
  slotClass: SuggestedNextActionSlotClass;
  /** Signals after the producer grant: the only values governance may read. */
  currentResultOwnership: boolean;
  activeGoalMatch: boolean;
}

export function selectExactFourSuggestedNextActions(input: ExactFourInput): ExactFourResult {
  const exemptReason = resolveExactFourExemption(input.eligibility, input.contextualPresentationActions);
  if (exemptReason) {
    // Required-step and safety states keep their dedicated controls; the existing policy decides what (if anything) accompanies them.
    const legacy = selectSuggestedNextActions(input);
    const grants = input.slotGrants ?? PRODUCER_SLOT_GRANTS;
    return {
      ...legacy,
      exactFour: { policyVersion: SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, applicability: 'EXEMPT', exemptReason },
      evaluated: legacy.selected.map((entry) => {
        const granted = resolveGrantedSlotClass(entry.candidate, entry.producerId, grants);
        const signals = evaluateSignalClaims(entry.candidate.signals, grantForProducer(entry.producerId, grants), {
          ownershipRelationshipHolds: currentOperationOwnsOutcome(input.currentOperationId, entry.candidate),
        });
        return { slotClass: granted.slotClass, currentResultOwnership: signals.currentResultOwnership, activeGoalMatch: signals.activeGoalMatch };
      }),
    };
  }

  const diagnostics: PolicyDiagnostics = emptyPolicyDiagnostics();
  const grants = input.slotGrants ?? PRODUCER_SLOT_GRANTS;
  const whyNow = input.whyNowReasons ?? REGISTERED_WHY_NOW_REASONS;
  const grantedClass = (candidate: SuggestedNextActionCandidate, producerId: string) => resolveGrantedSlotClass(candidate, producerId, grants);
  const cooldown = input.cooldownLifecycleKeys ?? new Set<string>();
  const completed = input.completedLifecycleKeys ?? new Set<string>();
  const keyOf = (candidate: SuggestedNextActionCandidate) => lifecycleKey({
    operationId: candidate.operationId, outcomeKey: candidate.outcomeKey, entityType: candidate.entityContext.entityType, entityId: candidate.entityContext.entityId,
  });
  const { winners, verdictByCandidate, producerByCandidate } = evaluateSuggestedNextActionPool(input, diagnostics, (candidate, producerId) => {
    const key = keyOf(candidate);
    // A completed outcome is not offered again in ANY class; an offer cooldown spares the current answer, urgent work and the exact record.
    if (completed.size > 0 && completed.has(key)) return EXACT_FOUR_COMPLETED_REJECTION;
    if (cooldown.size === 0 || COOLDOWN_EXEMPT_SLOT_CLASSES.has(grantedClass(candidate, producerId).slotClass)) return null;
    return cooldown.has(key) ? EXACT_FOUR_COOLDOWN_REJECTION : null;
  });

  let slotClassDenied = 0;
  let signalClaimsDenied = 0;
  const pool: PoolEntry[] = winners.map((winner) => {
    const producerId = producerByCandidate.get(winner.candidate)!;
    const granted = grantedClass(winner.candidate, producerId);
    if (granted.denied) slotClassDenied += 1;
    const signals = evaluateSignalClaims(winner.candidate.signals, grantForProducer(producerId, grants), {
      ownershipRelationshipHolds: currentOperationOwnsOutcome(input.currentOperationId, winner.candidate),
    });
    signalClaimsDenied += signals.deniedClaims;
    return {
      candidate: winner.candidate, producerId, verdict: verdictByCandidate.get(winner.candidate)!, score: winner.score,
      mergedReasonCodes: winner.mergedReasonCodes, slotClass: granted.slotClass,
      currentResultOwnership: signals.currentResultOwnership, activeGoalMatch: signals.activeGoalMatch,
    };
  });
  const byClass = new Map<SuggestedNextActionSlotClass, PoolEntry[]>(SUGGESTED_NEXT_ACTION_SLOT_CLASSES.map((slotClass) => [slotClass, []]));
  for (const entry of pool) byClass.get(entry.slotClass)!.push(entry);
  // Curated starters rotate softly: least recently offered first (never offered sorts first), then the shared deterministic order.
  const starterOfferedAt = (entry: PoolEntry) => input.starterLastOfferedAtMs?.get(keyOf(entry.candidate)) ?? Number.NEGATIVE_INFINITY;
  byClass.get('CURATED_STARTER')!.sort((a, b) => {
    const left = starterOfferedAt(a);
    const right = starterOfferedAt(b);
    return (left === right ? 0 : left < right ? -1 : 1) || compareRanked({ candidate: a.candidate, score: a.score }, { candidate: b.candidate, score: b.score });
  });
  // Highest-value profile details first (materiality), then the shared deterministic order.
  byClass.get('PROFILE_GAP')!.sort((a, b) => (b.candidate.signals.materiality - a.candidate.signals.materiality)
    || compareRanked({ candidate: a.candidate, score: a.score }, { candidate: b.candidate, score: b.score }));

  const chosen: PoolEntry[] = [];
  const chosenSet = new Set<PoolEntry>();
  let unrelatedOpportunities = 0;
  let opportunityCapHits = 0;
  const isUnrelatedOpportunity = (entry: PoolEntry) => OPPORTUNITY_SLOT_CLASSES.has(entry.slotClass) && !entry.currentResultOwnership;
  const tryTake = (entry: PoolEntry): boolean => {
    if (chosen.length >= EXACT_FOUR.count || chosenSet.has(entry)) return false;
    if (isUnrelatedOpportunity(entry)) {
      if (unrelatedOpportunities >= EXACT_FOUR.maxUnrelatedOpportunities) { opportunityCapHits += 1; return false; }
      unrelatedOpportunities += 1;
    }
    chosen.push(entry);
    chosenSet.add(entry);
    return true;
  };
  const takeClass = (slotClass: SuggestedNextActionSlotClass, limit = Number.POSITIVE_INFINITY) => {
    let taken = 0;
    for (const entry of byClass.get(slotClass)!) {
      if (taken >= limit || chosen.length >= EXACT_FOUR.count) break;
      if (tryTake(entry)) taken += 1;
    }
  };

  for (const slotClass of ['CONTINUE_WORK', 'URGENT_WORK', 'EXACT_RECORD'] as const) takeClass(slotClass);

  const completenessUnknown = input.actionableCompleteness === null;
  const audienceUncertain = input.audienceUncertain === true;
  const below = completenessUnknown || audienceUncertain || input.actionableCompleteness! < EXACT_FOUR.completenessThreshold;
  let opportunityReserved = false;
  if (below) {
    const open = EXACT_FOUR.count - chosen.length;
    // Contextual relevance only: confidence qualifies a signal, it never creates one.
    const strong = [...byClass.get('HOME_OPPORTUNITY')!, ...byClass.get('GOVERNED_CAPABILITY')!].find((entry) => {
      const { signals, reasonCodes } = entry.candidate;
      // Ownership and goal count only after the producer grant (`entry.*`); a claim the grant denies was already cleared.
      const hasSignal = entry.currentResultOwnership || entry.activeGoalMatch || reasonCodes.some((code) => whyNow.has(code));
      return hasSignal && signals.sourceConfidence >= EXACT_FOUR.strongOpportunityMinConfidence;
    });
    const reserve = open >= EXACT_FOUR.opportunityReserveMinOpenPositions && strong ? 1 : 0;
    takeClass('PROFILE_GAP', open - reserve);
    if (reserve && strong) opportunityReserved = tryTake(strong);
    takeClass('HOME_OPPORTUNITY');
    takeClass('GOVERNED_CAPABILITY');
    takeClass('PROFILE_GAP');
  } else {
    takeClass('HOME_OPPORTUNITY');
    takeClass('GOVERNED_CAPABILITY');
    takeClass('PROFILE_GAP');
  }
  // Curated starters only when the stronger inventories could not reach four.
  takeClass('CURATED_STARTER');

  const selected: SelectedCandidate[] = chosen.map((entry) => ({
    candidate: entry.candidate, producerId: entry.producerId, verdict: entry.verdict, score: entry.score, mergedReasonCodes: entry.mergedReasonCodes,
  }));
  diagnostics.droppedByLimit = pool.length - chosen.length;

  const rotationCutoff = input.rotationNowMs === undefined ? null : input.rotationNowMs - STARTER_ROTATION_MS;
  const startersWithinRotationWindow = rotationCutoff === null ? 0
    : chosen.filter((entry) => entry.slotClass === 'CURATED_STARTER' && starterOfferedAt(entry) > rotationCutoff).length;
  const selectedBySlot: Partial<Record<SuggestedNextActionSlotClass, number>> = {};
  for (const entry of chosen) selectedBySlot[entry.slotClass] = (selectedBySlot[entry.slotClass] ?? 0) + 1;

  const shortage = EXACT_FOUR.count - chosen.length;
  const reasons = new Set<ExactFourShortageReason>();
  if (shortage > 0) {
    const rejected = Object.entries(diagnostics.rejections);
    if (diagnostics.nominated === 0) reasons.add('NO_CANDIDATES');
    if (diagnostics.invalidCandidates > 0) reasons.add('INVALID_CANDIDATES');
    const lifecycleRejection = (key: string) => key === EXACT_FOUR_COOLDOWN_REJECTION || key === EXACT_FOUR_COMPLETED_REJECTION;
    if (rejected.some(([key]) => !lifecycleRejection(key))) reasons.add('INELIGIBLE');
    if (rejected.some(([key]) => lifecycleRejection(key))) reasons.add('COOLDOWN_SUPPRESSED');
    if (diagnostics.suppressedByPresentation > 0) reasons.add('PRESENTATION_DUPLICATE');
    if (opportunityCapHits > 0) reasons.add('OPPORTUNITY_CAP');
    for (const reason of input.upstreamShortageReasons ?? []) reasons.add(reason);
    if (completenessUnknown) reasons.add('COMPLETENESS_UNKNOWN');
  }
  return {
    selected,
    diagnostics,
    exactFour: {
      policyVersion: SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, applicability: 'EXACT_FOUR', shortage,
      shortageReasons: EXACT_FOUR_SHORTAGE_REASONS.filter((reason) => reasons.has(reason)),
      selectedBySlot, belowCompletenessThreshold: below, completenessUnknown, audienceUncertain, slotClassDenied, signalClaimsDenied, startersWithinRotationWindow, opportunityReserved,
    },
    evaluated: chosen.map((entry) => ({ slotClass: entry.slotClass, currentResultOwnership: entry.currentResultOwnership, activeGoalMatch: entry.activeGoalMatch })),
  };
}
