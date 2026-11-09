// Ask support: a question with two parts ("how old is my roof AND what would a new one cost?") is answered by ONE operation, so the second part used to be
// dropped silently. This module finds the second part and offers it as a one-tap "Also answer ..." button on the first answer. Tapping it asks that clause as
// its own question, so it goes through routing, execution and the answer-trust checks like any other turn. No blocks from two operations are ever merged.
//
// Only clauses that the deterministic router resolves, with confidence, to a different READ operation are offered. A write operation, a guided-guidance
// fallback, a boundary and the answer's own operation are never offered.

import { type AskOperationId, resolveAskOperation } from '../askOperationRegistry';

export const ALSO_ANSWER_ACTION_PREFIX = 'also-answer-';
const MIN_CLAUSE_WORDS = 4;
const MIN_CONFIDENCE = 0.85;
const MAX_LABEL_CHARS = 60;
const READ_FAMILIES = new Set(['RECORD_QUERY', 'STATUS_SUMMARY', 'DECISION_ANALYSIS']);
// An answer that already states an item's timing and cost does not offer the same item's repair-or-replace read for a "when will it need replacing" part.
const ALREADY_COVERED_UNLESS_REPAIR: Readonly<Record<string, string>> = { CAPITAL_ITEM_FUNDING_GOAL: 'REPLACEMENT_GUIDANCE' };
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
function subjectOf(firstClause: string): string | null {
  const match = /\b(my|our)\s+([a-z][a-z -]{2,28}?)(?=\s+(?:is|are|was|were|needs?|has|have|covered|leaks?|and|in|to|for|from)\b|$)/i.exec(firstClause);
  return match ? `${match[1].toLowerCase()} ${match[2].trim()}` : null;
}

/** A later part usually leans on the first ("what condition is it in"); the first part's subject replaces the pronoun so the part can be routed on its own. */
function standalone(clause: string, subject: string | null): string {
  if (!subject) return clause;
  const noun = subject.replace(/^(?:my|our)\s+/, '');
  // "a new one" -> "a new roof"; "is it" -> "is my roof".
  return /\b(?:new|replacement|another)\s+one\b/i.test(clause)
    ? clause.replace(/\b(new|replacement|another)\s+one\b/i, `$1 ${noun}`)
    : clause.replace(/\b(?:it|that|this|them|those items|these items)\b(?!\s+(?:cost|do|mean))/i, subject);
}

export interface AlsoAnswerOffer { operationId: AskOperationId; clause: string }

/** The first clause (the answered operation may have been picked by any of them) that clearly belongs to a different read operation, or null. */
export function findAlsoAnswerOffer(message: string, answeredOperationId: AskOperationId): AlsoAnswerOffer | null {
  const clauses = splitQuestionClauses(message);
  if (clauses.length < 2) return null;
  const subject = subjectOf(clauses[0]);
  for (const part of clauses) {
    const clause = standalone(part, subject);
    const resolved = resolveAskOperation(clause);
    if (resolved.operationId === answeredOperationId || NEVER_OFFERED.has(resolved.operationId)) continue;
    if (ALREADY_COVERED_UNLESS_REPAIR[answeredOperationId] === resolved.operationId && !/\brepair/i.test(clause)) continue;
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
  const resolved = resolveAskOperation(action.message);
  return resolved.operationId === action.operationId && READ_FAMILIES.has(resolved.family);
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
