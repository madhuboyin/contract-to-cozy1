// FR-GATE-3: when may a canonical (typed) answer SKIP the word-overlap relevance check? Only when (b) the entity and every required slot were resolved at or above threshold (so a roof handler cannot pass on a siding
// question) and (c) the message is not a compound or conditional one, unless deterministic decomposition positively certified the full-message segmentation. (a), that the operation was independently trusted, is
// decided by the caller (CONFIRMED_ROUTE_ONLY_CANONICAL_OPERATIONS and the confirmed/deterministic route). Pure; nothing here reads a record.
import type { AskEntityResolutionResult } from '../askEntityResolution';

/** Joiners that make a message more than one question or a conditional one: and, also, plus, vs/versus, or, if, but, then, while, whereas, and a comma that opens a new clause. */
const COMPOUND_JOINER = /\b(?:and|also|plus|vs\.?|versus|or|if|but|then|while|whereas|unless|otherwise)\b|,\s*\S/i;
export const hasCompoundJoiner = (question: string): boolean => COMPOUND_JOINER.test(question);

export type CanonicalBypassDenial = 'ENTITY_NOT_RESOLVED' | 'COMPOUND_NOT_SEGMENTED';
export interface CanonicalBypassDecision { readonly permitted: boolean; readonly denial: CanonicalBypassDenial | null }

export interface CanonicalBypassContext {
  readonly question: string;
  /** The routing decision's entity state. Omitted (a caller with no routing decision) means the entity check does not apply; null means routing found none and is treated as not resolved. */
  readonly entityResolution?: Pick<AskEntityResolutionResult, 'outcome' | 'confidenceBand' | 'missingSlots'> | null;
  /** True only when deterministic decomposition positively certified that every clause of the full message routed to this one operation (decomposition SAME_OPERATION). */
  readonly segmentationCertified?: boolean;
}

export function canonicalBypassDecision(context: CanonicalBypassContext): CanonicalBypassDecision {
  const { entityResolution } = context;
  if (entityResolution !== undefined) {
    const resolved = entityResolution !== null
      && (entityResolution.outcome === 'NOT_REQUIRED' || entityResolution.outcome === 'RESOLVED')
      && entityResolution.missingSlots.length === 0
      && entityResolution.confidenceBand !== 'LOW';
    if (!resolved) return { permitted: false, denial: 'ENTITY_NOT_RESOLVED' };
  }
  if (hasCompoundJoiner(context.question) && !context.segmentationCertified) return { permitted: false, denial: 'COMPOUND_NOT_SEGMENTED' };
  return { permitted: true, denial: null };
}
