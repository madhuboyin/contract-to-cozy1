// Plan §6-§7: the single server policy. candidates -> schema validation -> eligibility -> deterministic scoring -> semantic
// deduplication -> diversity -> discovery reserve -> display limit. Pure given its inputs: no clock reads, no database, no model.
import { SuggestedNextActionCandidateSchema, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import {
  evaluateSuggestedNextActionEligibility, type EligibilityContext, type EligibilityVerdict,
} from './suggestedNextActionEligibility';
import { compareRanked, meetsMinimumDisplayScore, scoreSuggestedNextActionCandidate, type Ranked } from './suggestedNextActionRanking';
import { deduplicateSuggestedNextActions, type DedupResult } from './suggestedNextActionDeduplication';
import { RANKING_MODE, SUGGESTED_NEXT_ACTION_LIMITS, type SuggestedNextActionRankingMode } from './suggestedNextActionRegistry';
import { suggestedNextActionSemanticKeyHash } from './suggestedNextActionIdentity';
import { candidateIdentityFields } from './suggestedNextActionCandidate';

export interface PolicyDiagnostics {
  nominated: number;
  invalidCandidates: number;
  droppedOverProducerLimit: number;
  droppedOverTotalLimit: number;
  eligible: number;
  /** Counts by `RULE:REASON` for audit/telemetry (bounded tokens, never homeowner data). */
  rejections: Record<string, number>;
  belowMinimumScore: number;
  duplicatesMerged: number;
  suppressedByPresentation: number;
  droppedByDiscoveryReserve: number;
  droppedByLimit: number;
}

export interface SelectedCandidate {
  candidate: SuggestedNextActionCandidate;
  /** The registered producer that nominated it (the nominations key). Authoritative; the candidate itself carries no identity. */
  producerId: string;
  verdict: Extract<EligibilityVerdict, { state: 'ELIGIBLE' | 'NEEDS_CONTEXT' }>;
  score: number;
  mergedReasonCodes: string[];
}

export interface PolicyResult {
  selected: SelectedCandidate[];
  diagnostics: PolicyDiagnostics;
}

export interface PolicyInput {
  /** Raw nominations grouped by the REGISTERED producer id (the map key is authoritative; a candidate's own `producerId` is overwritten). */
  nominations: ReadonlyMap<string, readonly unknown[]>;
  eligibility: EligibilityContext;
  presentationIdentities?: ReadonlySet<string>;
  /** Defaults to the registry's RANKING_MODE (TIER_ONLY). */
  rankingMode?: SuggestedNextActionRankingMode;
}

export interface EvaluatedPool {
  /** Deduplicated winners, best first (score, then the deterministic tie-break order). */
  winners: DedupResult['winners'];
  verdictByCandidate: ReadonlyMap<SuggestedNextActionCandidate, SelectedCandidate['verdict']>;
  /** Registered producer id per evaluated candidate, bound from the nominations key during validation. */
  producerByCandidate: ReadonlyMap<SuggestedNextActionCandidate, string>;
}

export function emptyPolicyDiagnostics(): PolicyDiagnostics {
  return {
    nominated: 0, invalidCandidates: 0, droppedOverProducerLimit: 0, droppedOverTotalLimit: 0, eligible: 0, rejections: {},
    belowMinimumScore: 0, duplicatesMerged: 0, suppressedByPresentation: 0, droppedByDiscoveryReserve: 0, droppedByLimit: 0,
  };
}

/**
 * Stages 1-3 shared by every selection strategy: bounded validated nominations, eligibility, optional caller suppression (cooldown),
 * scoring and semantic/presentation deduplication. `suppress` returns a bounded `RULE:REASON` token to reject a candidate, or null.
 * It runs before deduplication so a suppressed duplicate can never shadow an equivalent candidate that is allowed.
 */
export function evaluateSuggestedNextActionPool(
  input: PolicyInput,
  diagnostics: PolicyDiagnostics,
  suppress?: (candidate: SuggestedNextActionCandidate, producerId: string) => string | null,
): EvaluatedPool {
  const mode = input.rankingMode ?? RANKING_MODE;

  // 1. Bounded, validated nominations. Producer order is the map's insertion order, kept deterministic by the caller.
  const candidates: SuggestedNextActionCandidate[] = [];
  const producerByCandidate = new Map<SuggestedNextActionCandidate, string>();
  for (const [producerKey, raw] of input.nominations) {
    diagnostics.nominated += raw.length;
    const bounded = raw.slice(0, SUGGESTED_NEXT_ACTION_LIMITS.perProducerCandidates);
    diagnostics.droppedOverProducerLimit += raw.length - bounded.length;
    for (const entry of bounded) {
      const parsed = SuggestedNextActionCandidateSchema.safeParse(entry);
      if (!parsed.success) { diagnostics.invalidCandidates += 1; continue; }
      if (candidates.length >= SUGGESTED_NEXT_ACTION_LIMITS.totalCandidates) { diagnostics.droppedOverTotalLimit += 1; continue; }
      // The producer identity is the registered key the nominations came from. The candidate schema has no identity field (a candidate
      // that supplies one is invalid), so no handler-controlled value can claim another producer's slot grant (plan C.15 review).
      candidates.push(parsed.data);
      producerByCandidate.set(parsed.data, producerKey);
    }
  }

  // 2. Eligibility, then caller suppression.
  const eligible: Array<{ candidate: SuggestedNextActionCandidate; verdict: SelectedCandidate['verdict'] }> = [];
  for (const candidate of candidates) {
    const verdict = evaluateSuggestedNextActionEligibility(candidate, input.eligibility);
    if (verdict.state !== 'ELIGIBLE' && verdict.state !== 'NEEDS_CONTEXT') {
      const key = `${verdict.rule}:${verdict.reasonCodes[0] ?? 'UNSPECIFIED'}`;
      diagnostics.rejections[key] = (diagnostics.rejections[key] ?? 0) + 1;
      continue;
    }
    const suppressed = suppress?.(candidate, producerByCandidate.get(candidate)!) ?? null;
    if (suppressed) { diagnostics.rejections[suppressed] = (diagnostics.rejections[suppressed] ?? 0) + 1; continue; }
    eligible.push({ candidate, verdict });
  }
  diagnostics.eligible = eligible.length;
  const verdictByCandidate = new Map(eligible.map((entry) => [entry.candidate, entry.verdict]));

  // 3. Score, then deduplicate on semantic identity.
  const ranked: Ranked[] = eligible.map(({ candidate, verdict }) => ({
    candidate,
    score: scoreSuggestedNextActionCandidate({ candidate, ready: verdict.state === 'ELIGIBLE', mode }),
  })).sort(compareRanked);
  const dedup = deduplicateSuggestedNextActions(ranked, input.presentationIdentities);
  diagnostics.suppressedByPresentation = dedup.suppressedByPresentation;
  diagnostics.duplicatesMerged = dedup.winners.reduce((sum, winner) => sum + winner.duplicatesMerged, 0);
  return { winners: dedup.winners, verdictByCandidate, producerByCandidate };
}

export function selectSuggestedNextActions(input: PolicyInput): PolicyResult {
  const mode = input.rankingMode ?? RANKING_MODE;
  const diagnostics = emptyPolicyDiagnostics();
  const { winners, verdictByCandidate, producerByCandidate } = evaluateSuggestedNextActionPool(input, diagnostics);

  // 4. Greedy selection with a diversity penalty per repeated operation destination, re-scored as each winner is taken so the
  // result stays deterministic (stable sort on a total order) and a fourth same-operation action loses to a different one.
  const pool = winners.map((winner) => ({ winner, verdict: verdictByCandidate.get(winner.candidate)! }));
  const chosen: SelectedCandidate[] = [];
  const operationRepeats = new Map<string, number>();
  while (pool.length > 0 && chosen.length < SUGGESTED_NEXT_ACTION_LIMITS.maxShown + 8) {
    const rescored = pool.map((entry) => ({
      entry,
      ranked: {
        candidate: entry.winner.candidate,
        score: scoreSuggestedNextActionCandidate({
          candidate: entry.winner.candidate, ready: entry.verdict.state === 'ELIGIBLE',
          repeatsAlreadyChosen: operationRepeats.get(entry.winner.candidate.operationId) ?? 0, mode,
        }),
      } satisfies Ranked,
    })).sort((a, b) => compareRanked(a.ranked, b.ranked));
    const best = rescored[0]!;
    pool.splice(pool.indexOf(best.entry), 1);
    if (!meetsMinimumDisplayScore(best.ranked.score, mode)) { diagnostics.belowMinimumScore += 1; continue; }
    operationRepeats.set(best.ranked.candidate.operationId, (operationRepeats.get(best.ranked.candidate.operationId) ?? 0) + 1);
    chosen.push({ candidate: best.ranked.candidate, producerId: producerByCandidate.get(best.ranked.candidate)!, verdict: best.entry.verdict, score: best.ranked.score, mergedReasonCodes: best.entry.winner.mergedReasonCodes });
  }
  diagnostics.belowMinimumScore += pool.length;

  // 5. Discovery reserve: when a stronger CONTINUE/RECORD_ACTION action exists, keep at most one DISCOVERY action.
  const hasStronger = chosen.some((entry) => entry.candidate.tier === 'CONTINUE' || entry.candidate.tier === 'RECORD_ACTION');
  let discoveryKept = 0;
  const afterReserve = chosen.filter((entry) => {
    if (entry.candidate.tier !== 'DISCOVERY' || !hasStronger) return true;
    discoveryKept += 1;
    if (discoveryKept <= SUGGESTED_NEXT_ACTION_LIMITS.discoveryWhenStrongerExists) return true;
    diagnostics.droppedByDiscoveryReserve += 1;
    return false;
  });

  const selected = afterReserve.slice(0, SUGGESTED_NEXT_ACTION_LIMITS.maxShown);
  diagnostics.droppedByLimit = afterReserve.length - selected.length;
  return { selected, diagnostics };
}

/** Semantic-key hash of a candidate, exported for the finalizer's history/current-outcome sets. */
export function candidateSemanticKeyHash(candidate: SuggestedNextActionCandidate): string {
  return suggestedNextActionSemanticKeyHash(candidateIdentityFields(candidate));
}
