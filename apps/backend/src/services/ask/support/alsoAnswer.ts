// Ask support: a question with two parts ("how old is my roof AND what would a new one cost?") is answered by ONE operation, so the second part used to be
// dropped silently. This module finds the second part and offers it as a one-tap "Also answer ..." button on the first answer. Tapping it asks that clause as
// its own question, so it goes through routing, execution and the answer-trust checks like any other turn. No blocks from two operations are ever merged.
//
// Only clauses that the deterministic router resolves, with confidence, to a different READ operation are offered. A write operation, a guided-guidance
// fallback, a boundary and the answer's own operation are never offered.

import { type AskOperationId, getAskOperationDefinition, resolveAskOperation } from '../askOperationRegistry';
import { parseTargetDate } from './targetDate';

export const ALSO_ANSWER_ACTION_PREFIX = 'also-answer-';
const MIN_CLAUSE_WORDS = 4;
const MIN_CONFIDENCE = 0.85;
const MAX_LABEL_CHARS = 60;
const READ_FAMILIES = new Set(['RECORD_QUERY', 'STATUS_SUMMARY', 'DECISION_ANALYSIS']);
// An answer that already states an item's timing and cost does not offer the same item's repair-or-replace read for a "when will it need replacing" part.
const ALREADY_COVERED_CLAUSES: Readonly<Record<string, ReadonlySet<string>>> = {
  // The funding answer uses the same capital-timeline cost source and states the
  // dated replacement cost before calculating the reserve gap and monthly need.
  CAPITAL_ITEM_FUNDING_GOAL: new Set(['ITEM_REPLACEMENT_COST', 'REPLACEMENT_GUIDANCE']),
};
const NEVER_OFFERED = new Set<string>(['GROUNDED_GUIDANCE', 'EMERGENCY_BOUNDARY', 'UNSAFE_RESTRICTED_BOUNDARY', 'OUT_OF_SCOPE_BOUNDARY']);

/** The question split at its joining words, each part trimmed of its own joiner. Parts too short to be a question are folded into the part before them. */
export function splitQuestionClauses(message: string): string[] {
  const parts = message
    .split(/\s*(?:[?;]\s+|,\s*(?:and\s+(?:also\s+)?|then\s+|plus\s+)?|\s+and\s+(?:also\s+|then\s+)?|\s+(?:plus|as well as)\s+)(?=(?:what|how|which|when|where|who|is|are|do|does|can|could|should|will|would|show|tell|list|compare)\b)/i)
    .map((part) => part.trim().replace(/[?.!]+$/, '').trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const part of parts) {
    if (part.split(/\s+/).length < MIN_CLAUSE_WORDS && merged.length) merged[merged.length - 1] += ` ${part}`;
    else merged.push(part);
  }
  return merged;
}

/** "my roof" from "How old is my roof"; null when the first part names no owned thing. */
export function subjectOf(firstClause: string): string | null {
  const match = /\b(my|our)\s+([a-z][a-z -]{2,28}?)(?=\s+(?:is|are|was|were|needs?|has|have|covered|leaks?|and|in|to|for|from)\b|$)/i.exec(firstClause);
  return match ? `${match[1].toLowerCase()} ${match[2].trim()}` : null;
}

/** A later part usually leans on the first ("what condition is it in"); the first part's subject replaces the pronoun so the part can be routed on its own. */
export function standalone(clause: string, subject: string | null): string {
  if (!subject) return clause;
  const noun = subject.replace(/^(?:my|our)\s+/, '');
  // "a new one" -> "a new roof"; "is it" -> "is my roof".
  // "how much would a replacement cost if it is not" -> "how much would a replacement water heater cost".
  const trimmed = clause.replace(/\s+if (?:it|that|they) (?:is|are) not$/i, '');
  if (/^how much would (?:a|the) replacement cost$/i.test(trimmed)) return `how much would a replacement ${noun} cost`;
  return /\b(?:new|replacement|another)\s+one\b/i.test(clause)
    ? clause.replace(/\b(new|replacement|another)\s+one\b/i, `$1 ${noun}`)
    : clause.replace(/\b(?:it|that|this|them|those items|these items)\b(?!\s+(?:cost|do|mean))/i, subject);
}

// Follow-up shapes the global router deliberately does not claim: on their own they are ambiguous ("what happens if I skip them"), but as the later
// part of a two-part question the first part says what they are about. They apply ONLY here, so standalone routing is unchanged. Each names a read operation.
const CLAUSE_SHAPES: ReadonlyArray<{ operationId: AskOperationId; pattern: RegExp }> = [
  { operationId: 'DO_NOTHING_SIMULATION', pattern: /^what (?:happens|would happen) if i (?:skip|ignore|put off|delay|neglect) (?:them|those|these|all of them)\b/i },
  { operationId: 'CAPITAL_ITEM_FUNDING_GOAL', pattern: /^what should i (?:save|set aside|put aside)(?: each| every| per| a)? month\b.*\bmy [a-z][a-z -]+/i },
  // Whole-home money follow-ups: "how much more per month would close the gap", "what would replacing them all cost", "how does that compare to my reserve contributions".
  { operationId: 'CAPITAL_RESERVE_PLAN', pattern: /^how much more\b.*\b(?:per month|a month|each month|setting aside|set aside|save|saving|close the gap)\b|^what (?:would|will) (?:replacing|it cost to replace) (?:them all|all of them|everything)\b|^how does (?:that|it) compare to my (?:reserve|savings)\b/i },
  // "which of those items are old enough to fail": the items are the ones the first part listed.
  { operationId: 'APPLIANCE_FAILURE_RISK', pattern: /^which of (?:those|these|them)(?: items| appliances| systems)?\b.*\b(?:fail|failing|break|old enough|likely to)\b/i },
  // "how much would a replacement cost if it is not": rewritten with the first part's item by `standalone`.
  { operationId: 'REPLACEMENT_GUIDANCE', pattern: /^how much would (?:a|the) replacement (?:[a-z -]+ )?cost\b/i },
  { operationId: 'OWNERSHIP_COSTS', pattern: /^(?:is|are) (?:that|this|it) more than i (?:spent|paid)\b|^what would (?:that|it) do to my (?:monthly )?(?:budget|costs?)\b/i },
];

/** The operation a part belongs to: the router's confident answer, else one of the follow-up shapes. Null when neither claims it. */
export function resolveClauseOperation(clause: string): { operationId: AskOperationId; family: string; confidence: number } | null {
  const routed = resolveAskOperation(clause);
  if (routed.operationId !== 'GROUNDED_GUIDANCE') return routed;
  const shape = CLAUSE_SHAPES.find((candidate) => candidate.pattern.test(clause));
  if (!shape) return null;
  const definition = getAskOperationDefinition(shape.operationId);
  return { operationId: shape.operationId, family: definition.family, confidence: MIN_CONFIDENCE };
}

export interface AlsoAnswerOffer { operationId: AskOperationId; clause: string }

/** Whether the selected answer contract already supplies this clause's result. */
export function operationCoversClause(answeredOperationId: AskOperationId, clauseOperationId: AskOperationId, clause: string): boolean {
  if (answeredOperationId === clauseOperationId) return true;
  if (!ALREADY_COVERED_CLAUSES[answeredOperationId]?.has(clauseOperationId)) return false;
  // Repair-vs-replace is a decision the funding calculation does not make.
  return clauseOperationId !== 'REPLACEMENT_GUIDANCE' || !/\brepair\b/i.test(clause);
}

/** The first clause (the answered operation may have been picked by any of them) that clearly belongs to a different read operation, or null. */
export function findAlsoAnswerOffer(message: string, answeredOperationId: AskOperationId): AlsoAnswerOffer | null {
  const clauses = splitQuestionClauses(message);
  if (clauses.length < 2) return null;
  const subject = subjectOf(clauses[0]);
  for (const part of clauses) {
    const dated = standalone(part, subject);
    // A saving question leans on the first part's date as well ("…in 5 years"), and the funding read needs it in its own words.
    const date = parseTargetDate(clauses[0]);
    const clause = date && !parseTargetDate(dated) && /\b(?:save|set aside|put aside)\b/i.test(dated) ? `${dated} ${date.label}` : dated;
    const resolved = resolveClauseOperation(clause);
    if (!resolved) continue;
    if (operationCoversClause(answeredOperationId, resolved.operationId, clause) || NEVER_OFFERED.has(resolved.operationId)) continue;
    if (!READ_FAMILIES.has(resolved.family) || resolved.confidence < MIN_CONFIDENCE) continue;
    return { operationId: resolved.operationId, clause: clause.charAt(0).toUpperCase() + clause.slice(1) + '?' };
  }
  return null;
}

function shortLabel(clause: string): string {
  const text = clause.replace(/\?$/, '');
  return `Also answer: ${text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…` : text}`;
}

export function alsoAnswerAction(offer: AlsoAnswerOffer) {
  return {
    id: `${ALSO_ANSWER_ACTION_PREFIX}${offer.operationId.toLowerCase().replace(/_/g, '-')}`, label: shortLabel(offer.clause),
    interactionType: 'START_WORKFLOW' as const, message: offer.clause, operationId: offer.operationId, style: 'SECONDARY' as const,
  };
}

/** True only for an action alsoAnswerAction could have built, so the trust policy can allow it on any answer without a per-operation list. */
export function isAlsoAnswerAction(action: { id: string; label?: string; href?: string; interactionType?: string; message?: string; operationId?: string }): boolean {
  if (action.href || action.interactionType !== 'START_WORKFLOW' || !action.message || !action.operationId) return false;
  if (NEVER_OFFERED.has(action.operationId)) return false;
  const expected = alsoAnswerAction({ operationId: action.operationId as AskOperationId, clause: action.message });
  if (action.id !== expected.id || action.label !== expected.label) return false;
  const resolved = resolveClauseOperation(action.message);
  return resolved != null && resolved.operationId === action.operationId && READ_FAMILIES.has(resolved.family);
}

/** The result with the offer's button added to its first SUMMARY block; unchanged when there is nothing to offer or no summary to carry it. */
export function withAlsoAnswerAction<T extends { blocks: Array<{ type: string; actions?: unknown[] }> }>(result: T, message: string, answeredOperationId: AskOperationId): T {
  const offer = findAlsoAnswerOffer(message, answeredOperationId);
  const index = result.blocks.findIndex((block) => block.type === 'SUMMARY' && Array.isArray(block.actions));
  if (!offer || index < 0) return result;
  const action = alsoAnswerAction(offer);
  const summary = result.blocks[index];
  if ((summary.actions ?? []).some((existing) => (existing as { id?: string }).id === action.id)) return result;
  const blocks = result.blocks.slice();
  blocks[index] = { ...summary, actions: [...(summary.actions ?? []), action] };
  return { ...result, blocks };
}
