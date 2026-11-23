// BICC-UND-007 / UND-008 / UND-009 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md §7): Ask asks at most ONE consecutive
// clarification for the same unresolved intent. When the person repeats or rephrases the same thing instead of answering, a second clarification is a
// loop, not help. After the limit:
//   - a read-only, non-consequential request is answered with the best-supported interpretation, LABELLED, so correcting it is easy (UND-008);
//   - anything involving an unresolved entity, a write, a consequential action or a material decision is never guessed (UND-009): it keeps the bounded
//     selection it already offers.
// Pure and deterministic: the caller supplies the previous turn and the candidate operations.
import type { AskOperationId } from '../askOperationRegistry';
import { getAskOperationDefinition } from '../askOperationRegistry';
import { isWriteCapableOperation } from './writeCapability';

export interface PreviousClarificationTurn {
  status: string;
  reasonCode: string | null;
  message: string;
  createdAt: Date;
}

export interface ClarificationCandidate { operationId: AskOperationId; confidence: number }

export type ClarificationLoopDecision =
  | { kind: 'ASK' }
  | { kind: 'ASSUME'; operationId: AskOperationId; reason: 'CLARIFICATION_LIMIT_REACHED' };

const WINDOW_MS = 30 * 60 * 1000;
const STOP = new Set(['a', 'an', 'the', 'my', 'our', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'i', 'me', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'please', 'can', 'you', 'tell', 'what', 'about', 'it', 'this', 'that', 'with', 'have', 'has']);
const contentTokens = (text: string): Set<string> => new Set(text.toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)));

/** Jaccard overlap of the content words; a high value means the person is repeating or rephrasing, not adding information. */
export function sameIntentOverlap(previous: string, current: string): number {
  const left = contentTokens(previous); const right = contentTokens(current);
  if (!left.size || !right.size) return 0;
  let shared = 0; for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export const SAME_INTENT_THRESHOLD = 0.5;
const CLARIFICATION_REASONS = new Set(['ASK_ROUTING_AMBIGUOUS', 'ASK_SKILL_AMBIGUOUS']);

/** True when the operation may be answered on a best interpretation: a plain read with no write, no high materiality and no boundary. */
export function mayAssumeInterpretation(operationId: AskOperationId): boolean {
  const definition = getAskOperationDefinition(operationId);
  if (definition.executionMode !== 'DETERMINISTIC') return false;
  if (definition.semantic.effect !== 'READ' || definition.semantic.materiality === 'HIGH') return false;
  if (String(definition.safetyClass).endsWith('_BOUNDARY') || definition.safetyClass === 'MATERIAL_DECISION') return false;
  return !isWriteCapableOperation(operationId);
}

export function decideClarificationLoop(input: {
  previous: PreviousClarificationTurn | null;
  message: string;
  candidates: readonly ClarificationCandidate[];
  entityAmbiguous: boolean;
  now?: Date;
}): ClarificationLoopDecision {
  const { previous } = input;
  if (!previous || previous.status !== 'NEEDS_CLARIFICATION' || !previous.reasonCode || !CLARIFICATION_REASONS.has(previous.reasonCode)) return { kind: 'ASK' };
  if ((input.now ?? new Date()).getTime() - previous.createdAt.getTime() > WINDOW_MS) return { kind: 'ASK' };
  // New material information (a different request) starts a fresh clarification budget.
  if (sameIntentOverlap(previous.message, input.message) < SAME_INTENT_THRESHOLD) return { kind: 'ASK' };
  // UND-009: an unresolved entity or property is never guessed.
  if (input.entityAmbiguous) return { kind: 'ASK' };
  const best = [...input.candidates].sort((a, b) => b.confidence - a.confidence)[0];
  if (!best || !mayAssumeInterpretation(best.operationId)) return { kind: 'ASK' };
  return { kind: 'ASSUME', operationId: best.operationId, reason: 'CLARIFICATION_LIMIT_REACHED' };
}
