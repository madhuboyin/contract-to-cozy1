// FR-PLAN-4 for the legacy refusal: when the typed-grammar agreement gate declines to run a read, the homeowner is told which words of their question could not be matched to anything
// Ask can look up, instead of "I need a clearer question" (the question was clear; the capability was missing, and the old headline sent people to rephrase what was already well formed).
// The words come from the typed parser's own unresolved spans plus any amount comparison (which the typed stack cannot apply). Pure: no routing, no I/O.
import { parseCrossDomainSemanticRequest } from '../semantic/crossDomain/crossDomainPlanBuilder';
import { findAmountComparisons } from '../semantic/amountComparison';

const MAX_PHRASES = 3;

/** The unmatched phrases of a message, in the order written: adjacent unresolved words merged ("licensed professional"), amount comparisons added, duplicates and whole-message spans dropped. */
export function unmatchedPhrases(message: string): string[] {
  const text = message ?? '';
  const parsed = parseCrossDomainSemanticRequest(text);
  const spans = [...parsed.plan.unresolvedSpans.map((span) => ({ start: span.start, end: span.end })), ...findAmountComparisons(text).map((c) => ({ start: c.start, end: c.end }))]
    .filter((span) => span.end > span.start)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end + 1 && /^\s*$/.test(text.slice(last.end, span.start))) last.end = Math.max(last.end, span.end);
    else if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  const phrases = merged
    // A span that covers most of the message (the parser could place nothing) names nothing useful.
    .filter((span) => span.end - span.start < Math.max(12, text.trim().length * 0.6))
    .map((span) => text.slice(span.start, span.end).trim().replace(/[?.!,;:]+$/, ''))
    .filter(Boolean);
  return [...new Set(phrases)].slice(0, MAX_PHRASES);
}

function quoted(phrases: readonly string[]): string {
  const marked = phrases.map((phrase) => `“${phrase}”`);
  return marked.length <= 1 ? marked.join('') : `${marked.slice(0, -1).join(', ')} and ${marked[marked.length - 1]}`;
}

/** The headline and body for a read the agreement gate did not run. Nothing was guessed and nothing was run; the words that could not be matched are named when they can be. */
export function agreementRefusalCopy(message: string): { title: string; body: string } {
  const phrases = unmatchedPhrases(message);
  return phrases.length > 0
    ? {
      title: 'I can’t answer that as asked',
      body: `I couldn’t match ${quoted(phrases)} to anything I can look up in your home record, so I didn’t run this and haven’t guessed. Ask it without ${phrases.length === 1 ? 'that part' : 'those parts'}, or ask the parts one at a time.`,
    }
    : {
      title: 'I can’t answer that as asked',
      body: 'I couldn’t match every part of your question to something I can look up in your home record, so I didn’t run it and haven’t guessed. Ask it one part at a time.',
    };
}
