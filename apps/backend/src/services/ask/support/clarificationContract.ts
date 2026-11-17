// The contract for a clarification card (`AskClarification`). A card is a set of buttons; pressing one sends its option id (or, for a plain card, its `operationId`) and
// the backend re-runs the original message with that operation forced (execution/askClarification.ts). So:
//   - two options with the same effective action (the operation plus its typed payload) are one choice shown twice, and the label the user read is discarded;
//   - the stored clarification (`parameters.clarification`, with a version, an expiry, the candidate operations and any typed payloads) is what a press is validated
//     against, so a card without it is a set of buttons that fail ("This clarification is no longer active");
//   - a card never has exactly one option (FR-REC-1): there is nothing to choose.
// Producers must satisfy this; `buildPayloadClarification` makes it true by construction for typed options, and `enforceClarificationContract` is the safety net at the
// point a result is stored, so a violation degrades to a free-text question instead of dead buttons. Pure.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AskClarification } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';

/**
 * What a typed option carries, kept on the SERVER (parameters.clarification.candidateOptions): the client sends only an option id. A closed set of kinds, each validated,
 * so an option is a typed intent with resolved arguments and never retyped question text. BOOLEAN_READING is the answer to a "no A or B" question: EITHER_OR ("no A, or B")
 * or NEITHER_NOR ("no A and no B"), re-applied to the original message by the parser.
 */
export const ClarificationOptionPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('BOOLEAN_READING'), reading: z.enum(['EITHER_OR', 'NEITHER_NOR']) }).strict(),
]);
export type ClarificationOptionPayload = z.infer<typeof ClarificationOptionPayloadSchema>;

/** The reading a homeowner chose, from an envelope's supplied input (put there by the server from the stored option): one of the closed set, or undefined. */
export function clarifiedReadingFrom(suppliedInput: unknown): 'EITHER_OR' | 'NEITHER_NOR' | undefined {
  const value = (suppliedInput as { clarifiedReading?: unknown } | null | undefined)?.clarifiedReading;
  return value === 'EITHER_OR' || value === 'NEITHER_NOR' ? value : undefined;
}

export interface StoredClarificationOption { readonly optionId: string; readonly operationId: string; readonly payload: ClarificationOptionPayload }

export type ClarificationViolationCode =
  | 'DUPLICATE_EFFECTIVE_ACTION'
  | 'DUPLICATE_LABEL'
  | 'DUPLICATE_OPTION_ID'
  | 'SINGLE_OPTION'
  | 'STORED_CLARIFICATION_MISSING'
  | 'STORED_CLARIFICATION_MISMATCH'
  | 'STORED_OPTIONS_NOT_COVERED'
  | 'INVALID_PAYLOAD'
  | 'STORED_PAYLOAD_MISSING'
  | 'NEEDS_CLARIFICATION_WITHOUT_CARD';

export interface ClarificationViolation { readonly code: ClarificationViolationCode; readonly detail: string }

type CardOption = { readonly operationId: string; readonly label: string; readonly optionId?: string; readonly payload?: unknown };

/** What pressing the option does: the operation it forces plus any typed payload. Two options with the same key are the same action. */
export function effectiveActionKey(option: { operationId: string; payload?: unknown }): string {
  const payload = option.payload === undefined || option.payload === null ? 'null' : JSON.stringify(option.payload);
  return `${option.operationId}|${createHash('sha256').update(payload).digest('hex').slice(0, 12)}`;
}

const normalizedLabel = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

type Stored = { version?: unknown; expiresAt?: unknown; candidateOperationIds?: unknown; candidateOptions?: unknown };
const storedOf = (result: Pick<AskOperationResult, 'parameters'>): Stored | null => {
  const stored = (result.parameters as { clarification?: unknown } | undefined)?.clarification;
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Stored : null;
};
const storedOptionsOf = (stored: Stored | null): StoredClarificationOption[] => (Array.isArray(stored?.candidateOptions) ? stored!.candidateOptions as unknown[] : [])
  .filter((entry): entry is StoredClarificationOption => Boolean(entry) && typeof entry === 'object'
    && typeof (entry as StoredClarificationOption).optionId === 'string' && typeof (entry as StoredClarificationOption).operationId === 'string'
    && ClarificationOptionPayloadSchema.safeParse((entry as StoredClarificationOption).payload).success);

export function findClarificationViolations(result: Pick<AskOperationResult, 'status' | 'clarification' | 'parameters'>): ClarificationViolation[] {
  const card = result.clarification;
  if (!card) {
    return result.status === 'NEEDS_CLARIFICATION'
      ? [{ code: 'NEEDS_CLARIFICATION_WITHOUT_CARD', detail: 'the answer asks a question but carries no card, so the user has nothing to press or answer through' }]
      : [];
  }
  const violations: ClarificationViolation[] = [];
  const options = card.options as readonly CardOption[];
  const stored = storedOf(result);
  const storedById = new Map(storedOptionsOf(stored).map((entry) => [entry.optionId, entry]));
  const seenActions = new Map<string, string>();
  const seenLabels = new Map<string, string>();
  const seenIds = new Set<string>();
  for (const option of options) {
    if (option.payload !== undefined && !ClarificationOptionPayloadSchema.safeParse(option.payload).success) violations.push({ code: 'INVALID_PAYLOAD', detail: `“${option.label}” carries a payload that is not a known kind` });
    if (option.payload !== undefined && !(option.optionId && storedById.has(option.optionId))) violations.push({ code: 'STORED_PAYLOAD_MISSING', detail: `“${option.label}” carries a payload that is not stored with the clarification` });
    if (option.optionId) {
      if (seenIds.has(option.optionId)) violations.push({ code: 'DUPLICATE_OPTION_ID', detail: `two options share the id ${option.optionId}` });
      seenIds.add(option.optionId);
    }
    const payload = option.payload ?? (option.optionId ? storedById.get(option.optionId)?.payload : undefined);
    const key = effectiveActionKey({ operationId: option.operationId, payload });
    if (seenActions.has(key)) violations.push({ code: 'DUPLICATE_EFFECTIVE_ACTION', detail: `“${seenActions.get(key)}” and “${option.label}” both run ${option.operationId}` });
    else seenActions.set(key, option.label);
    const label = normalizedLabel(option.label);
    if (seenLabels.has(label)) violations.push({ code: 'DUPLICATE_LABEL', detail: `two options are labelled “${option.label}”` });
    else seenLabels.set(label, option.label);
  }
  if (options.length === 1) violations.push({ code: 'SINGLE_OPTION', detail: `only “${options[0].label}” is offered; a card has no options (free text) or at least two` });
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
 * A card whose options carry typed payloads, built so the contract holds by construction: every option gets an id, the payloads are validated and stored with the
 * clarification (the card sent to the client carries only the ids), and the stored candidate operations cover the options. Throws on an invalid payload or an option set
 * that would violate the contract: a producer that builds an impossible card fails in its own test, not in front of a homeowner.
 */
export function buildPayloadClarification(input: {
  readonly question: string;
  readonly options: ReadonlyArray<{ readonly operationId: string; readonly label: string; readonly payload: ClarificationOptionPayload }>;
  readonly expiresInMs?: number;
  readonly allowFreeText?: boolean;
}): { clarification: AskClarification; parameters: { clarification: { version: number; expiresAt: string; candidateOperationIds: string[]; candidateOptions: StoredClarificationOption[] } } } {
  const expiresAt = new Date(Date.now() + (input.expiresInMs ?? 30 * 60 * 1000)).toISOString();
  const candidateOptions: StoredClarificationOption[] = input.options.map((option, index) => ({
    optionId: `option-${index + 1}`, operationId: option.operationId, payload: ClarificationOptionPayloadSchema.parse(option.payload),
  }));
  const clarification: AskClarification = {
    version: 1,
    question: input.question,
    options: input.options.map((option, index) => ({ operationId: option.operationId, label: option.label, optionId: candidateOptions[index].optionId })),
    allowFreeText: input.allowFreeText ?? true,
    expiresAt,
  };
  const parameters = { clarification: { version: 1, expiresAt, candidateOperationIds: [...new Set(candidateOptions.map((option) => option.operationId))], candidateOptions } };
  const violations = findClarificationViolations({ status: 'NEEDS_CLARIFICATION', clarification, parameters });
  if (violations.length > 0) throw new Error(`clarification card violates the contract: ${violations.map((v) => `${v.code} (${v.detail})`).join('; ')}`);
  return { clarification, parameters };
}

/**
 * What a press means, decided on the server from the stored clarification only. A typed option is found by its option id; a plain operation-id press is refused when
 * typed options share that operation (it would not say which one was meant). The payload is never taken from the client.
 */
export function resolveClarificationChoice(
  storedClarification: unknown,
  input: { operationId?: string; optionId?: string },
): { ok: true; operationId: string | null; optionId: string | null; payload: ClarificationOptionPayload | null } | { ok: false; code: 'INVALID_OPTION' | 'AMBIGUOUS_OPERATION_PRESS' } {
  const stored: Stored | null = storedClarification && typeof storedClarification === 'object' && !Array.isArray(storedClarification) ? storedClarification as Stored : null;
  const typedOptions = storedOptionsOf(stored);
  if (input.optionId) {
    const chosen = typedOptions.find((entry) => entry.optionId === input.optionId);
    return chosen ? { ok: true, operationId: chosen.operationId, optionId: chosen.optionId, payload: chosen.payload } : { ok: false, code: 'INVALID_OPTION' };
  }
  if (input.operationId && typedOptions.some((entry) => entry.operationId === input.operationId)) return { ok: false, code: 'AMBIGUOUS_OPERATION_PRESS' };
  return { ok: true, operationId: input.operationId ?? null, optionId: null, payload: null };
}

/**
 * Repairs a card so it satisfies the contract: typed payloads move to the stored clarification and each such option gets an id, options with the same effective action (or
 * label) collapse to the first, a lone option becomes a free-text question, and the stored clarification is written (or corrected) to match the card. Anything that is not a
 * card is returned unchanged. Idempotent.
 */
export function enforceClarificationContract<T extends AskOperationResult>(result: T): { result: T; violations: ClarificationViolation[] } {
  const violations = findClarificationViolations(result).filter((violation) => violation.code !== 'NEEDS_CLARIFICATION_WITHOUT_CARD');
  const card = result.clarification;
  if (!card || violations.length === 0) return { result, violations: [] };
  const stored = storedOf(result);
  const storedById = new Map(storedOptionsOf(stored).map((entry) => [entry.optionId, entry]));
  const seen = new Set<string>();
  const seenLabels = new Set<string>();
  const keptStored: StoredClarificationOption[] = [];
  const unique: Array<{ operationId: string; label: string; optionId?: string }> = [];
  (card.options as readonly CardOption[]).forEach((option, index) => {
    const parsedPayload = option.payload === undefined ? undefined : ClarificationOptionPayloadSchema.safeParse(option.payload);
    if (parsedPayload && !parsedPayload.success) return;
    const payload = parsedPayload?.success ? parsedPayload.data : option.optionId ? storedById.get(option.optionId)?.payload : undefined;
    const key = effectiveActionKey({ operationId: option.operationId, payload });
    const label = normalizedLabel(option.label);
    if (seen.has(key) || seenLabels.has(label)) return;
    seen.add(key); seenLabels.add(label);
    const optionId = payload ? (option.optionId && !unique.some((u) => u.optionId === option.optionId) ? option.optionId : `option-${index + 1}`) : option.optionId;
    unique.push({ operationId: option.operationId, label: option.label, ...(optionId ? { optionId } : {}) });
    if (payload && optionId) keptStored.push({ optionId, operationId: option.operationId, payload });
  });
  // A lone option is not a choice (FR-REC-1): the card becomes a free-text question rather than a one-button card.
  const options = unique.length >= 2 ? unique : [];
  const typed = options.length > 0 ? keptStored.filter((entry) => options.some((option) => option.optionId === entry.optionId)) : [];
  const previous = Array.isArray(stored?.candidateOperationIds) ? (stored!.candidateOperationIds as unknown[]).filter((value): value is string => typeof value === 'string') : [];
  const fallbackOperation = (result.parameters as { operationId?: unknown } | undefined)?.operationId;
  const candidates = options.length > 0
    ? [...new Set([...previous, ...options.map((option) => option.operationId)])]
    : previous.length > 0 ? previous : typeof fallbackOperation === 'string' ? [fallbackOperation] : [];
  const repaired = {
    ...result,
    clarification: { ...card, options: options as unknown as typeof card.options, allowFreeText: options.length === 0 ? true : card.allowFreeText },
    parameters: { ...(result.parameters ?? {}), clarification: { ...(stored ?? {}), version: card.version, expiresAt: card.expiresAt, candidateOperationIds: candidates, ...(typed.length > 0 ? { candidateOptions: typed } : { candidateOptions: undefined }) } },
  };
  return { result: repaired as T, violations };
}
