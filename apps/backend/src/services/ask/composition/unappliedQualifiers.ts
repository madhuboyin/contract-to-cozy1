// FR-PLAN-5 (no silent partial interpretation), composed turns: a clause can name an explicit numeric qualifier ("in the next 90 days", "older than 10
// years", "over $500") that the operation it routes to has no parameter for. Running the operation anyway would answer the representable subset (every
// warranty, the 60-day "expiring" window) and present it as the answer to the whole clause. Pure: no routing, no I/O.
import type { AskOperationId } from '../askOperationRegistry';

export type QualifierKind = 'RELATIVE_WINDOW' | 'AGE_THRESHOLD' | 'AMOUNT_THRESHOLD';

const DETECTORS: ReadonlyArray<{ kind: QualifierKind; pattern: RegExp }> = [
  // "in the next 90 days", "over the last 6 months", "within 30 days", "past 2 years"
  { kind: 'RELATIVE_WINDOW', pattern: /\b(?:(?:in|over|during)\s+the\s+)?(?:next|last|past|previous)\s+\d+\s*(?:day|week|month|year)s?\b|\bwithin\s+(?:the\s+(?:next|last)\s+)?\d+\s*(?:day|week|month|year)s?\b/i },
  // "older than 10 years", "newer than 2 years", "more than 15 years old", "10+ years old"
  { kind: 'AGE_THRESHOLD', pattern: /\b(?:older|newer|younger)\s+than\s+\d+\b|\b(?:more|less|over|under)\s+than\s+\d+\s*years?\s+old\b|\b\d+\s*\+\s*years?\s+old\b/i },
  // "over $500", "under 2,000 dollars", "more than $1k"
  { kind: 'AMOUNT_THRESHOLD', pattern: /\b(?:over|under|above|below|more\s+than|less\s+than|at\s+least|at\s+most)\s+\$\s?\d|\b(?:over|under|above|below|more\s+than|less\s+than)\s+[\d,]+\s*(?:dollars|bucks|usd)\b/i },
];

/**
 * The qualifier kinds an operation genuinely applies from the clause text. Empty by default: an operation is listed only after its handler is verified to
 * read that qualifier from the message (the warranty handler, for one, reduces "expiring in the next 90 days" to its fixed 60-day status).
 */
const APPLIED_QUALIFIERS: Partial<Record<AskOperationId, ReadonlySet<QualifierKind>>> = {};

/** The first explicit qualifier in `clause` that `operationId` cannot apply, as the words the homeowner used, or null when every qualifier is applied. */
export function unappliedQualifier(operationId: AskOperationId, clause: string): { kind: QualifierKind; text: string } | null {
  const applied = APPLIED_QUALIFIERS[operationId];
  for (const { kind, pattern } of DETECTORS) {
    if (applied?.has(kind)) continue;
    const match = pattern.exec(clause);
    if (match) return { kind, text: match[0].trim() };
  }
  return null;
}
