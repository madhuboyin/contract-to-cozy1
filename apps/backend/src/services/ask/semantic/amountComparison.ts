// FR-PLAN-5, live prompt #2 ("show maintenance tasks due next month that cost more than $50"): the typed stack has no dollar-threshold condition, but its
// "unresolved words" check skips digits and comparison words, so the cost condition was dropped and the unfiltered list was presented as the answer. This detects an
// explicit amount comparison in the message so a typed-stack answer can say it was not applied. Pure.
import type { AskOperationResult } from '../askOperationRegistry';

export interface AmountComparison { readonly text: string; readonly start: number; readonly end: number }

// A comparator followed by a dollar amount ("more than $50", "over $1,000", "at least $2k") or by a number of dollars ("under 500 dollars").
// "over 2 years" and "more than 18 months" are time windows, which the typed stack does apply, so a bare number never counts.
const AMOUNT_COMPARISON = new RegExp([
  String.raw`\b(?:(?:more|less|greater|fewer|cheaper)\s+than|over|under|above|below|exceeding|exceeds|at\s+(?:least|most))\s+\$\s?\d[\d,]*(?:\.\d+)?(?:\s*[km]\b)?`,
  String.raw`\b(?:(?:more|less)\s+than|over|under|above|below)\s+\d[\d,]*(?:\.\d+)?\s*(?:dollars|usd|bucks)\b`,
].join('|'), 'gi');

export function findAmountComparisons(message: string): AmountComparison[] {
  return [...message.matchAll(AMOUNT_COMPARISON)].map((match) => ({ text: match[0].trim(), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
}

/**
 * A typed-stack answer to a question that also asked for an amount comparison is labelled partial: the comparison is named, the answer says it is not filtered
 * by it, and the status is no longer a plain ANSWERED. Only an answered result is touched, and only its first summary block (the one a receipt binds to keeps its id).
 */
export function withUnappliedAmountComparison<T extends AskOperationResult>(result: T, message: string): T {
  if (result.status !== 'ANSWERED') return result;
  const comparisons = findAmountComparisons(message);
  if (comparisons.length === 0) return result;
  const index = result.blocks.findIndex((block) => block.type === 'SUMMARY');
  if (index < 0) return result;
  const phrase = comparisons.map((comparison) => `“${comparison.text}”`).join(' and ');
  const summary = result.blocks[index];
  if (summary.type !== 'SUMMARY') return result;
  const blocks = result.blocks.slice();
  blocks[index] = {
    ...summary,
    title: `${summary.title} (not filtered by amount)`,
    body: `Partial answer: I couldn’t apply ${phrase}, so this list is not filtered by it. ${summary.body}`,
    tone: 'CAUTION',
  };
  return { ...result, status: 'READY_WITH_LIMITATIONS', blocks };
}
