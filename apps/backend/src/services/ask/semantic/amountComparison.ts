// FR-PLAN-5, live prompt #2 ("show maintenance tasks due next month that cost more than $50"): the typed stack has no dollar-threshold condition, but its
// "unresolved words" check skips digits and comparison words, so the cost condition was dropped and the unfiltered list was presented as the answer. This detects an
// explicit amount comparison in the message so a typed-stack answer can say it was not applied. Pure.
import type { AskOperationResult } from '../askOperationRegistry';
import type { SemanticRequestPlan, SemanticWhereExpression } from './semanticRequestPlan';

export interface AmountComparison {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** GREATER_THAN for "over / more than / above / exceeding / greater than" (strictly greater); OTHER for every comparator the typed stack does not apply. */
  readonly comparator: 'GREATER_THAN' | 'OTHER';
  /** The amount in whole cents, or null when it cannot be read exactly. */
  readonly cents: number | null;
}

// A comparator followed by a dollar amount ("more than $50", "over $1,000", "at least $2k") or by a number of dollars ("under 500 dollars").
// "over 2 years" and "more than 18 months" are time windows, which the typed stack does apply, so a bare number never counts.
const AMOUNT_COMPARISON = new RegExp([
  String.raw`\b(?:(?:more|less|greater|fewer|cheaper)\s+than|over|under|above|below|exceeding|exceeds|at\s+(?:least|most))\s+\$\s?\d[\d,]*(?:\.\d+)?(?:\s*[km]\b)?`,
  String.raw`\b(?:(?:more|less)\s+than|over|under|above|below)\s+\d[\d,]*(?:\.\d+)?\s*(?:dollars|usd|bucks)\b`,
].join('|'), 'gi');

const GREATER_THAN_WORDS = /^(?:more\s+than|greater\s+than|over|above|exceeding|exceeds)\b/i;

function amountCents(text: string): number | null {
  const match = /\$?\s?(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/i.exec(text.replace(/^[a-z\s]+?(?=\$|\d)/i, ''));
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const scale = match[2]?.toLowerCase() === 'k' ? 1_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  const cents = Math.round(base * scale * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function findAmountComparisons(message: string): AmountComparison[] {
  return [...message.matchAll(AMOUNT_COMPARISON)].map((match) => {
    const text = match[0].trim();
    return {
      text, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length,
      comparator: GREATER_THAN_WORDS.test(text) ? 'GREATER_THAN' as const : 'OTHER' as const,
      cents: amountCents(text),
    };
  });
}

/** The one threshold the typed maintenance filter applies: a single strictly-greater-than comparison. Anything else (under, at least, two comparisons) is not applied. */
export function singleGreaterThanAmountCents(message: string): number | null {
  const found = findAmountComparisons(message);
  return found.length === 1 && found[0].comparator === 'GREATER_THAN' && found[0].cents !== null && found[0].cents >= 0 ? found[0].cents : null;
}

/**
 * A typed-stack answer to a question that also asked for an amount comparison is labelled partial: the comparison is named, the answer says it is not filtered
 * by it, and the status is no longer a plain ANSWERED. Only an answered result is touched, and only its first summary block (the one a receipt binds to keeps its id).
 */
export function withUnappliedAmountComparison<T extends AskOperationResult>(result: T, message: string, appliedAmountOverCents: readonly number[] = []): T {
  if (result.status !== 'ANSWERED') return result;
  const comparisons = findAmountComparisons(message)
    .filter((comparison) => !(comparison.comparator === 'GREATER_THAN' && comparison.cents !== null && appliedAmountOverCents.includes(comparison.cents)));
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

/** The cost thresholds a parsed plan actually applies (strictly greater than, in cents), so the answer does not also claim they were not applied. */
export function appliedAmountOverCents(plan: SemanticRequestPlan): number[] {
  const found: number[] = [];
  const walk = (where: SemanticWhereExpression | null | undefined): void => {
    if (!where) return;
    if (where.kind === 'PREDICATE') { if (typeof where.amountOverCents === 'number') found.push(where.amountOverCents); return; }
    if (where.kind === 'NOT') { walk(where.operand); return; }
    where.operands.forEach(walk);
  };
  if (plan.outcome === 'MATCH') plan.facets.forEach((facet) => walk(facet.where));
  return found;
}
