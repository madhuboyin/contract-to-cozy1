// The contract for a clarification card (`AskClarification`). A card is a set of buttons; pressing one sends its `operationId` and the backend re-runs the original
// message with that operation forced (execution/askClarification.ts). So:
//   - two options with the same effective action are one choice shown twice, and the label the user read is discarded;
//   - the stored clarification (`parameters.clarification`, with a version, an expiry and the candidate operations) is what a press is validated against, so a card
//     without it is a set of buttons that fail ("This clarification is no longer active");
//   - a card never has exactly one option (FR-REC-1): there is nothing to choose.
// Producers must satisfy this; `enforceClarificationContract` is the safety net at the point a result is stored, so a violation degrades to a free-text question
// instead of dead buttons. Pure.
import { createHash } from 'node:crypto';
import type { AskOperationResult } from '../askOperationRegistry';

export type ClarificationViolationCode =
  | 'DUPLICATE_EFFECTIVE_ACTION'
  | 'DUPLICATE_LABEL'
  | 'SINGLE_OPTION'
  | 'STORED_CLARIFICATION_MISSING'
  | 'STORED_CLARIFICATION_MISMATCH'
  | 'STORED_OPTIONS_NOT_COVERED'
  | 'NEEDS_CLARIFICATION_WITHOUT_CARD';

export interface ClarificationViolation { readonly code: ClarificationViolationCode; readonly detail: string }

type CardOption = { readonly operationId: string; readonly label: string; readonly payload?: unknown };

/** What pressing the option does: the operation it forces plus any typed payload it carries (none today). Two options with the same key are the same action. */
export function effectiveActionKey(option: CardOption): string {
  const payload = option.payload === undefined ? 'null' : JSON.stringify(option.payload);
  return `${option.operationId}|${createHash('sha256').update(payload).digest('hex').slice(0, 12)}`;
}

const normalizedLabel = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

type Stored = { version?: unknown; expiresAt?: unknown; candidateOperationIds?: unknown };
const storedOf = (result: Pick<AskOperationResult, 'parameters'>): Stored | null => {
  const stored = (result.parameters as { clarification?: unknown } | undefined)?.clarification;
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Stored : null;
};

export function findClarificationViolations(result: Pick<AskOperationResult, 'status' | 'clarification' | 'parameters'>): ClarificationViolation[] {
  const card = result.clarification;
  if (!card) {
    return result.status === 'NEEDS_CLARIFICATION'
      ? [{ code: 'NEEDS_CLARIFICATION_WITHOUT_CARD', detail: 'the answer asks a question but carries no card, so the user has nothing to press or answer through' }]
      : [];
  }
  const violations: ClarificationViolation[] = [];
  const options = card.options as readonly CardOption[];
  const seenActions = new Map<string, string>();
  const seenLabels = new Map<string, string>();
  for (const option of options) {
    const key = effectiveActionKey(option);
    if (seenActions.has(key)) violations.push({ code: 'DUPLICATE_EFFECTIVE_ACTION', detail: `“${seenActions.get(key)}” and “${option.label}” both run ${option.operationId}` });
    else seenActions.set(key, option.label);
    const label = normalizedLabel(option.label);
    if (seenLabels.has(label)) violations.push({ code: 'DUPLICATE_LABEL', detail: `two options are labelled “${option.label}”` });
    else seenLabels.set(label, option.label);
  }
  if (options.length === 1) violations.push({ code: 'SINGLE_OPTION', detail: `only “${options[0].label}” is offered; a card has no options (free text) or at least two` });
  const stored = storedOf(result);
  if (!stored) {
    violations.push({ code: 'STORED_CLARIFICATION_MISSING', detail: 'parameters.clarification is absent, so pressing any option fails as "no longer active"' });
  } else {
    if (stored.version !== card.version || stored.expiresAt !== card.expiresAt) violations.push({ code: 'STORED_CLARIFICATION_MISMATCH', detail: 'the stored version or expiry differs from the card' });
    const candidates = Array.isArray(stored.candidateOperationIds) ? stored.candidateOperationIds.filter((value): value is string => typeof value === 'string') : [];
    const uncovered = options.filter((option) => !candidates.includes(option.operationId));
    if (uncovered.length > 0) violations.push({ code: 'STORED_OPTIONS_NOT_COVERED', detail: `${uncovered.map((o) => o.operationId).join(', ')} is not in the stored candidate operations` });
  }
  return violations;
}

/**
 * Repairs a card so it satisfies the contract: options with the same effective action (or label) collapse to the first, a lone option becomes a free-text
 * question, and the stored clarification is written (or corrected) to match the card. Anything that is not a card is returned unchanged. Idempotent.
 */
export function enforceClarificationContract<T extends AskOperationResult>(result: T): { result: T; violations: ClarificationViolation[] } {
  const violations = findClarificationViolations(result).filter((violation) => violation.code !== 'NEEDS_CLARIFICATION_WITHOUT_CARD');
  const card = result.clarification;
  if (!card || violations.length === 0) return { result, violations: [] };
  const seen = new Set<string>();
  const seenLabels = new Set<string>();
  const unique = (card.options as readonly CardOption[]).filter((option) => {
    const key = effectiveActionKey(option);
    const label = normalizedLabel(option.label);
    if (seen.has(key) || seenLabels.has(label)) return false;
    seen.add(key); seenLabels.add(label);
    return true;
  });
  // A lone option is not a choice (FR-REC-1): the card becomes a free-text question rather than a one-button card.
  const options = unique.length >= 2 ? unique : [];
  const stored = storedOf(result);
  const previous = Array.isArray(stored?.candidateOperationIds) ? (stored!.candidateOperationIds as unknown[]).filter((value): value is string => typeof value === 'string') : [];
  const fallbackOperation = (result.parameters as { operationId?: unknown } | undefined)?.operationId;
  const candidates = options.length > 0
    ? [...new Set([...previous, ...options.map((option) => option.operationId)])]
    : previous.length > 0 ? previous : typeof fallbackOperation === 'string' ? [fallbackOperation] : [];
  const repaired = {
    ...result,
    clarification: { ...card, options: options as unknown as typeof card.options, allowFreeText: options.length === 0 ? true : card.allowFreeText },
    parameters: { ...(result.parameters ?? {}), clarification: { ...(stored ?? {}), version: card.version, expiresAt: card.expiresAt, candidateOperationIds: candidates } },
  };
  return { result: repaired as T, violations };
}
