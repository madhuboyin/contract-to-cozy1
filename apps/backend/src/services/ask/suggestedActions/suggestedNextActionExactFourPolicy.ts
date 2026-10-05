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
  COOLDOWN_EXEMPT_SLOT_CLASSES, EXACT_FOUR, lifecycleKey, EXACT_FOUR_SHORTAGE_REASONS, OPPORTUNITY_SLOT_CLASSES, SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION,
  SUGGESTED_NEXT_ACTION_SLOT_CLASSES, PRODUCER_SLOT_GRANTS, REGISTERED_WHY_NOW_REASONS, resolveGrantedSlotClass,
  type ProducerSlotGrant, type ExactFourExemptReason, type ExactFourShortageReason, type SuggestedNextActionSlotClass,
} from './suggestedNextActionExactFourRegistry';

export const EXACT_FOUR_COOLDOWN_REJECTION = 'COOLDOWN:SUPPRESSED';

export interface ExactFourInput extends PolicyInput {
  /**
   * Actionable profile completeness as a fraction in [0, 1] (plan C.15.1), or null when it could not be computed. Below the
   * threshold, missing-profile capture is prioritized. null (could not be computed) is NOT treated as complete: it fails profile-first
   * (the same regime as below the threshold) and is reported as `completenessUnknown`.
   */
  actionableCompleteness: number | null;
  /**
   * Lifecycle keys (`lifecycleKey`: operation + outcome + entity scope) in cooldown or dismissal, from the durable lifecycle record
   * (`loadSuppressedLifecycleKeys`). Never applied to CONTINUE_WORK, URGENT_WORK or EXACT_RECORD.
   */
  cooldownLifecycleKeys?: ReadonlySet<string>;
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
    /** Candidates whose requested slot class was outside their producer's server-owned grant (demoted, never promoted). */
    slotClassDenied: number;
    /** True when a position was held for a strongly relevant opportunity. */
    opportunityReserved: boolean;
  };

export interface ExactFourResult extends PolicyResult {
  exactFour: ExactFourDiagnostics;
}

export function resolveExactFourExemption(eligibility: PolicyInput['eligibility']): ExactFourExemptReason | null {
  if (eligibility.mode !== 'NORMAL') return 'SAFE_RECOVERY_ONLY';
  if (eligibility.pendingInteractionActive) return 'PENDING_INTERACTION';
  if (!eligibility.sourcePropertyId) return 'NO_PROPERTY';
  return null;
}

interface PoolEntry {
  candidate: SuggestedNextActionCandidate;
  producerId: string;
  verdict: SelectedCandidate['verdict'];
  score: number;
  mergedReasonCodes: string[];
  slotClass: SuggestedNextActionSlotClass;
}

export function selectExactFourSuggestedNextActions(input: ExactFourInput): ExactFourResult {
  const exemptReason = resolveExactFourExemption(input.eligibility);
  if (exemptReason) {
    // Required-step and safety states keep their dedicated controls; the existing policy decides what (if anything) accompanies them.
    return { ...selectSuggestedNextActions(input), exactFour: { policyVersion: SUGGESTED_NEXT_ACTION_EXACT_FOUR_POLICY_VERSION, applicability: 'EXEMPT', exemptReason } };
  }

  const diagnostics: PolicyDiagnostics = emptyPolicyDiagnostics();
  const grants = input.slotGrants ?? PRODUCER_SLOT_GRANTS;
  const whyNow = input.whyNowReasons ?? REGISTERED_WHY_NOW_REASONS;
  const grantedClass = (candidate: SuggestedNextActionCandidate, producerId: string) => resolveGrantedSlotClass(candidate, producerId, grants);
  const cooldown = input.cooldownLifecycleKeys ?? new Set<string>();
  const { winners, verdictByCandidate, producerByCandidate } = evaluateSuggestedNextActionPool(input, diagnostics, (candidate, producerId) => {
    if (cooldown.size === 0 || COOLDOWN_EXEMPT_SLOT_CLASSES.has(grantedClass(candidate, producerId).slotClass)) return null;
    return cooldown.has(lifecycleKey({ operationId: candidate.operationId, outcomeKey: candidate.outcomeKey, entityType: candidate.entityContext.entityType, entityId: candidate.entityContext.entityId })) ? EXACT_FOUR_COOLDOWN_REJECTION : null;
  });

  let slotClassDenied = 0;
  const pool: PoolEntry[] = winners.map((winner) => {
    const producerId = producerByCandidate.get(winner.candidate)!;
    const granted = grantedClass(winner.candidate, producerId);
    if (granted.denied) slotClassDenied += 1;
    return {
      candidate: winner.candidate, producerId, verdict: verdictByCandidate.get(winner.candidate)!, score: winner.score,
      mergedReasonCodes: winner.mergedReasonCodes, slotClass: granted.slotClass,
    };
  });
  const byClass = new Map<SuggestedNextActionSlotClass, PoolEntry[]>(SUGGESTED_NEXT_ACTION_SLOT_CLASSES.map((slotClass) => [slotClass, []]));
  for (const entry of pool) byClass.get(entry.slotClass)!.push(entry);
  // Highest-value profile details first (materiality), then the shared deterministic order.
  byClass.get('PROFILE_GAP')!.sort((a, b) => (b.candidate.signals.materiality - a.candidate.signals.materiality)
    || compareRanked({ candidate: a.candidate, score: a.score }, { candidate: b.candidate, score: b.score }));

  const chosen: PoolEntry[] = [];
  const chosenSet = new Set<PoolEntry>();
  let unrelatedOpportunities = 0;
  let opportunityCapHits = 0;
  const isUnrelatedOpportunity = (entry: PoolEntry) => OPPORTUNITY_SLOT_CLASSES.has(entry.slotClass) && !entry.candidate.signals.currentResultOwnership;
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
  const below = completenessUnknown || input.actionableCompleteness! < EXACT_FOUR.completenessThreshold;
  let opportunityReserved = false;
  if (below) {
    const open = EXACT_FOUR.count - chosen.length;
    // Contextual relevance only: confidence qualifies a signal, it never creates one.
    const strong = [...byClass.get('HOME_OPPORTUNITY')!, ...byClass.get('GOVERNED_CAPABILITY')!].find((entry) => {
      const { signals, reasonCodes } = entry.candidate;
      const hasSignal = signals.currentResultOwnership || signals.activeGoalMatch || reasonCodes.some((code) => whyNow.has(code));
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

  const selectedBySlot: Partial<Record<SuggestedNextActionSlotClass, number>> = {};
  for (const entry of chosen) selectedBySlot[entry.slotClass] = (selectedBySlot[entry.slotClass] ?? 0) + 1;

  const shortage = EXACT_FOUR.count - chosen.length;
  const reasons = new Set<ExactFourShortageReason>();
  if (shortage > 0) {
    const rejected = Object.entries(diagnostics.rejections);
    if (diagnostics.nominated === 0) reasons.add('NO_CANDIDATES');
    if (diagnostics.invalidCandidates > 0) reasons.add('INVALID_CANDIDATES');
    if (rejected.some(([key]) => key !== EXACT_FOUR_COOLDOWN_REJECTION)) reasons.add('INELIGIBLE');
    if (diagnostics.rejections[EXACT_FOUR_COOLDOWN_REJECTION]) reasons.add('COOLDOWN_SUPPRESSED');
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
      selectedBySlot, belowCompletenessThreshold: below, completenessUnknown, slotClassDenied, opportunityReserved,
    },
  };
}
