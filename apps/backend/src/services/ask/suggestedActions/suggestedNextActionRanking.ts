// Plan §7.2: deterministic scoring and ordering. Integer arithmetic only, no model, no clock, no randomness: the same eligible
// candidates always produce the same order. Weights and the policy version live in the registry and are snapshot-tested.
import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import {
  MIN_DISPLAY_SCORE, SCORE_WEIGHTS, SOURCE_PRECEDENCE, TIER_BASE_SCORE,
} from './suggestedNextActionRegistry';

export interface ScoreInput {
  candidate: SuggestedNextActionCandidate;
  /** Whether the candidate is NEEDS_CONTEXT (no readiness bonus) or ELIGIBLE. */
  ready: boolean;
  /** An equivalent outcome was completed/asked recently but is allowed back (e.g. repeatable); soft penalty. */
  recentlyDone?: boolean;
  /** How many already-selected candidates share this candidate's operation destination. */
  repeatsAlreadyChosen?: number;
}

export function scoreSuggestedNextActionCandidate(input: ScoreInput): number {
  const { candidate } = input;
  const { signals } = candidate;
  let score = TIER_BASE_SCORE[candidate.tier];
  if (signals.exactEntityMatch) score += SCORE_WEIGHTS.exactEntityMatch;
  if (signals.currentResultOwnership) score += SCORE_WEIGHTS.currentResultOwnership;
  if (signals.activeGoalMatch) score += SCORE_WEIGHTS.activeGoalMatch;
  score += SCORE_WEIGHTS.materiality[signals.materiality] ?? 0;
  if (input.ready) score += SCORE_WEIGHTS.readinessEligible;
  score += Math.round(Math.min(1, Math.max(0, signals.sourceConfidence)) * SCORE_WEIGHTS.sourceConfidenceMax);
  if (input.recentlyDone) score += SCORE_WEIGHTS.recencyPenalty;
  const repeats = Math.max(0, input.repeatsAlreadyChosen ?? 0);
  score += Math.max(SCORE_WEIGHTS.diversityPenaltyCap, repeats * SCORE_WEIGHTS.diversityPenaltyPerRepeat);
  return score;
}

export interface Ranked {
  candidate: SuggestedNextActionCandidate;
  score: number;
}

function precedence(source: SuggestedNextActionCandidate['source']): number {
  const index = SOURCE_PRECEDENCE.indexOf(source);
  return index === -1 ? SOURCE_PRECEDENCE.length : index;
}

const compareText = (a: string | null, b: string | null): number => (a ?? '').localeCompare(b ?? '', 'en', { sensitivity: 'variant' });

/**
 * score DESC, producer (source) precedence, operationId, outcomeKey, entity type, entity id, then the candidate's own message as
 * the last deterministic key (the action id is derived from these same fields, so ordering by them *is* ordering by id).
 */
export function compareRanked(a: Ranked, b: Ranked): number {
  return (b.score - a.score)
    || (precedence(a.candidate.source) - precedence(b.candidate.source))
    || compareText(a.candidate.operationId, b.candidate.operationId)
    || compareText(a.candidate.outcomeKey, b.candidate.outcomeKey)
    || compareText(a.candidate.entityContext.entityType, b.candidate.entityContext.entityType)
    || compareText(a.candidate.entityContext.entityId, b.candidate.entityContext.entityId)
    || compareText(a.candidate.message, b.candidate.message);
}

export function meetsMinimumDisplayScore(score: number): boolean {
  return score >= MIN_DISPLAY_SCORE;
}
