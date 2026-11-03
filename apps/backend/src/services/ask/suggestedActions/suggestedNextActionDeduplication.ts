// Plan §5.2 / §7.3: group candidates by registered semantic identity (never by label or message), keep the best, and fold the
// non-sensitive provenance reason codes of the losers into the winner. Presentation identities published by rich result cards
// and block actions suppress equivalent compact candidates before the response is persisted.
import type { SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { candidateIdentityFields } from './suggestedNextActionCandidate';
import { suggestedNextActionSemanticKey, type SuggestedNextActionIdentityFields } from './suggestedNextActionIdentity';
import { compareRanked, type Ranked } from './suggestedNextActionRanking';

export interface DedupResult {
  winners: Array<Ranked & { mergedReasonCodes: string[]; duplicatesMerged: number }>;
  /** Candidates removed because a rich card/block already presents the same semantic action. */
  suppressedByPresentation: number;
}

/**
 * CONVERSATION_CONTINUE and START_WORKFLOW both only navigate to the same registered operation:outcome, so a block button of one kind
 * and a compact chip of the other are the same destination. MUTATE_RECORD is a different act and has no twin.
 */
function navigationTwinKey(candidate: SuggestedNextActionCandidate): string {
  const fields = candidateIdentityFields(candidate);
  if (fields.interactionType === 'MUTATE_RECORD') return suggestedNextActionSemanticKey(fields);
  return suggestedNextActionSemanticKey({ ...fields, interactionType: fields.interactionType === 'START_WORKFLOW' ? 'CONVERSATION_CONTINUE' : 'START_WORKFLOW' });
}

/**
 * `presentationIdentities` are the semantic keys (`suggestedNextActionSemanticKey`) that result cards/blocks already publish.
 * Rich actions keep their own contract; they only suppress the compact duplicate.
 */
export function deduplicateSuggestedNextActions(
  ranked: readonly Ranked[],
  presentationIdentities: ReadonlySet<string> = new Set(),
): DedupResult {
  const groups = new Map<string, Ranked[]>();
  let suppressedByPresentation = 0;
  for (const entry of ranked) {
    const key = suggestedNextActionSemanticKey(candidateIdentityFields(entry.candidate));
    if (presentationIdentities.has(key) || presentationIdentities.has(navigationTwinKey(entry.candidate))) { suppressedByPresentation += 1; continue; }
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const winners: DedupResult['winners'] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(compareRanked);
    const [winner, ...losers] = ordered as [Ranked, ...Ranked[]];
    const mergedReasonCodes = [...new Set(losers.flatMap((loser) => loser.candidate.reasonCodes))].filter((code) => !winner.candidate.reasonCodes.includes(code));
    winners.push({ ...winner, mergedReasonCodes, duplicatesMerged: losers.length });
  }
  return { winners: winners.sort(compareRanked), suppressedByPresentation };
}

export type { SuggestedNextActionIdentityFields };
