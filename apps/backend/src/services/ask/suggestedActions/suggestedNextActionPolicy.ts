// Plan §6-§7: the single server policy. candidates -> schema validation -> eligibility -> deterministic scoring -> semantic
// deduplication -> diversity -> discovery reserve -> display limit. Pure given its inputs: no clock reads, no database, no model.
import { SuggestedNextActionCandidateSchema, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import {
  evaluateSuggestedNextActionEligibility, type EligibilityContext, type EligibilityVerdict,
} from './suggestedNextActionEligibility';
import { compareRanked, meetsMinimumDisplayScore, scoreSuggestedNextActionCandidate, type Ranked } from './suggestedNextActionRanking';
import { deduplicateSuggestedNextActions } from './suggestedNextActionDeduplication';
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
  verdict: Extract<EligibilityVerdict, { state: 'ELIGIBLE' | 'NEEDS_CONTEXT' }>;
  score: number;
  mergedReasonCodes: string[];
}

export interface PolicyResult {
  selected: SelectedCandidate[];
  diagnostics: PolicyDiagnostics;
}

export interface PolicyInput {
  /** Raw nominations grouped by producer id; untrusted shape, validated here. */
  nominations: ReadonlyMap<string, readonly unknown[]>;
  eligibility: EligibilityContext;
  presentationIdentities?: ReadonlySet<string>;
  /** Defaults to the registry's RANKING_MODE (TIER_ONLY). */
  rankingMode?: SuggestedNextActionRankingMode;
}

export function selectSuggestedNextActions(input: PolicyInput): PolicyResult {
  const mode = input.rankingMode ?? RANKING_MODE;
  const diagnostics: PolicyDiagnostics = {
    nominated: 0, invalidCandidates: 0, droppedOverProducerLimit: 0, droppedOverTotalLimit: 0, eligible: 0, rejections: {},
    belowMinimumScore: 0, duplicatesMerged: 0, suppressedByPresentation: 0, droppedByDiscoveryReserve: 0, droppedByLimit: 0,
  };

  // 1. Bounded, validated nominations. Producer order is the map's insertion order, kept deterministic by the caller.
  const candidates: SuggestedNextActionCandidate[] = [];
  for (const [, raw] of input.nominations) {
    diagnostics.nominated += raw.length;
    const bounded = raw.slice(0, SUGGESTED_NEXT_ACTION_LIMITS.perProducerCandidates);
    diagnostics.droppedOverProducerLimit += raw.length - bounded.length;
    for (const entry of bounded) {
      const parsed = SuggestedNextActionCandidateSchema.safeParse(entry);
      if (!parsed.success) { diagnostics.invalidCandidates += 1; continue; }
      if (candidates.length >= SUGGESTED_NEXT_ACTION_LIMITS.totalCandidates) { diagnostics.droppedOverTotalLimit += 1; continue; }
      candidates.push(parsed.data);
    }
  }

  // 2. Eligibility.
  const eligible: Array<{ candidate: SuggestedNextActionCandidate; verdict: SelectedCandidate['verdict'] }> = [];
  for (const candidate of candidates) {
    const verdict = evaluateSuggestedNextActionEligibility(candidate, input.eligibility);
    if (verdict.state === 'ELIGIBLE' || verdict.state === 'NEEDS_CONTEXT') { eligible.push({ candidate, verdict }); continue; }
    const key = `${verdict.rule}:${verdict.reasonCodes[0] ?? 'UNSPECIFIED'}`;
    diagnostics.rejections[key] = (diagnostics.rejections[key] ?? 0) + 1;
  }
  diagnostics.eligible = eligible.length;
  const verdictByCandidate = new Map(eligible.map((entry) => [entry.candidate, entry.verdict]));

  // 3. Score (diversity is applied below, once winners are known), then deduplicate on semantic identity.
  const ranked: Ranked[] = eligible.map(({ candidate, verdict }) => ({
    candidate,
    score: scoreSuggestedNextActionCandidate({ candidate, ready: verdict.state === 'ELIGIBLE', mode }),
  })).sort(compareRanked);
  const dedup = deduplicateSuggestedNextActions(ranked, input.presentationIdentities);
  diagnostics.suppressedByPresentation = dedup.suppressedByPresentation;
  diagnostics.duplicatesMerged = dedup.winners.reduce((sum, winner) => sum + winner.duplicatesMerged, 0);

  // 4. Greedy selection with a diversity penalty per repeated operation destination, re-scored as each winner is taken so the
  // result stays deterministic (stable sort on a total order) and a fourth same-operation action loses to a different one.
  const pool = dedup.winners.map((winner) => ({ winner, verdict: verdictByCandidate.get(winner.candidate)! }));
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
    chosen.push({ candidate: best.ranked.candidate, verdict: best.entry.verdict, score: best.ranked.score, mergedReasonCodes: best.entry.winner.mergedReasonCodes });
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
