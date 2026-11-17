// Ask clarification relevance gate. A "Did you mean…" or "What would you like to focus on?" card offers the router's nearest operations, but nearest is not related: a prompt
// about missing receipts in two rooms was offered insurance-policy facts and claims, and a prompt about seller-readiness items was offered equipment lookup and end-of-life. A button the
// homeowner cannot connect to their own words is worse than no button, so a candidate is offered only when the message shares a distinctive word with that operation's own vocabulary
// (its description, supported jobs and example questions). Distinctive means rare across all operations (the words "show", "items", "and" appear in most, so they prove nothing).
// Pure: no I/O, no model, no routing. The vocabulary comes from the operation registry, so a new operation is covered without editing a list here.
import { ASK_OPERATION_DEFINITIONS, isReadOnlyOperation, type AskOperationId } from '../askOperationRegistry';

/** A word that appears in more than this many operations' vocabulary says nothing about which one the homeowner meant. Measured on the 231-operation routing corpus: at 20 the gate removed 25% of the wrong options and kept the right one in 407 of 419 cases (at 12 it removed 33% but lost the right one in 22). */
export const RELEVANCE_MAX_OPERATION_FREQUENCY = 20;

// Words that carry no domain on their own even when rare in the registry's phrasing.
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'without', 'that', 'this', 'these', 'those', 'which', 'what', 'when', 'where', 'who', 'how', 'why',
  'show', 'list', 'give', 'tell', 'find', 'see', 'get', 'any', 'all', 'some', 'there', 'here', 'than', 'then', 'from', 'into', 'about', 'over', 'under', 'more', 'less', 'most',
  'much', 'many', 'long', 'still', 'also', 'not', 'but', 'can', 'could', 'would', 'should', 'does', 'did', 'will', 'you', 'your', 'our', 'its', 'mine', 'home', 'house', 'property',
  'need', 'needs', 'want', 'next', 'last', 'month', 'week', 'year', 'time', 'item', 'items', 'thing', 'things', 'high', 'low', 'new', 'old', 'open', 'record', 'records',
]);

function stem(word: string): string {
  return word.replace(/(ies|es|s|ing|ed)$/, '');
}

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((word) => !GENERIC_WORDS.has(word)).map(stem);
}

let vocabulary: ReadonlyMap<AskOperationId, ReadonlySet<string>> | null = null;
let frequency: ReadonlyMap<string, number> | null = null;

function loadVocabulary(): { vocabulary: ReadonlyMap<AskOperationId, ReadonlySet<string>>; frequency: ReadonlyMap<string, number> } {
  if (!vocabulary || !frequency) {
    const words = new Map<AskOperationId, ReadonlySet<string>>();
    const counts = new Map<string, number>();
    for (const [operationId, definition] of Object.entries(ASK_OPERATION_DEFINITIONS) as Array<[AskOperationId, (typeof ASK_OPERATION_DEFINITIONS)[AskOperationId]]>) {
      const semantic = definition.semantic;
      const set = new Set(wordsOf([semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples].join(' ')));
      words.set(operationId, set);
      for (const word of set) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    vocabulary = words;
    frequency = counts;
  }
  return { vocabulary, frequency };
}

/** The words of the message that can tell one operation from another: not generic, and in few operations' vocabulary (a word in no operation's vocabulary is kept, it just matches nothing). */
export function distinctiveWords(message: string): string[] {
  const { frequency: counts } = loadVocabulary();
  return [...new Set(wordsOf(message))].filter((word) => (counts.get(word) ?? 0) <= RELEVANCE_MAX_OPERATION_FREQUENCY);
}

/** True when the message shares at least one distinctive word with the operation's own vocabulary. */
export function operationIsRelevantTo(message: string, operationId: AskOperationId): boolean {
  const { vocabulary: words } = loadVocabulary();
  const own = words.get(operationId);
  if (!own) return false;
  return distinctiveWords(message).some((word) => own.has(word));
}

/**
 * The candidates worth offering for this message, in their given order. A message with no distinctive words at all (a vague question) cannot be judged, so every candidate is kept:
 * the gate removes options that are demonstrably unrelated, it never turns a vague question into a refusal.
 */
export function relevantCandidates<T extends { operationId: AskOperationId }>(message: string | null | undefined, candidates: readonly T[]): T[] {
  if (!message || distinctiveWords(message).length === 0) return [...candidates];
  // Only lookups are judged by shared words. A write ("I replaced the water heater") is chosen by its verb, and what it acts on ("water heater") is an argument, not part of the operation's
  // own vocabulary, so word overlap says nothing about it; a write is offered only when the message already uses command wording (didYouMean.ts), which is its own gate.
  const related = candidates.filter((candidate) => !isReadOnlyOperation(candidate.operationId) || operationIsRelevantTo(message, candidate.operationId));
  // Judged only when something relates: if no candidate shares a word the vocabulary cannot tell paraphrase ("chores", "fridge") from unrelated, so nothing is removed.
  return related.length > 0 ? related : [...candidates];
}
