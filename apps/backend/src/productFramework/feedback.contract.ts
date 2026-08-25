/**
 * Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-003) — the
 * code-owned vocabulary every typed `Feedback` write draws its
 * `reasonCodes` from. USEFUL/NOT_USEFUL double as the general sentiment a
 * caller records in place of (or alongside) the legacy free-text `rating`
 * field; the remaining seven refine why a rating was given. This is the
 * platform's one distinguishable set of feedback meanings — surfaces must
 * not invent ad hoc reason strings outside it. Lives in productFramework
 * (not services/feedback) so the Ask operation contract (ask.contract.ts)
 * can validate against it without importing from the services layer.
 */
export const FEEDBACK_REASON_CODES = [
  'USEFUL',
  'NOT_USEFUL',
  'ALREADY_HANDLED',
  'WRONG_FACT',
  'WRONG_TIMING',
  'NOT_APPLICABLE',
  'DUPLICATE',
  'UNCLEAR_EXPLANATION',
  'UNSAFE_OR_INAPPROPRIATE',
] as const;

export type FeedbackReasonCode = typeof FEEDBACK_REASON_CODES[number];

const FEEDBACK_REASON_CODE_SET: ReadonlySet<string> = new Set(FEEDBACK_REASON_CODES);

export function isFeedbackReasonCode(value: string): value is FeedbackReasonCode {
  return FEEDBACK_REASON_CODE_SET.has(value);
}

/**
 * HI-FBK-002: "Safety floors and mandatory compliance obligations shall not
 * be hidden by negative usefulness feedback." A report that the
 * recommendation itself is unsafe or inappropriate is never just sentiment
 * — callers that branch on it (e.g. routing to a human review queue) should
 * use this rather than re-deriving the same check from `rating`.
 */
const SAFETY_SENSITIVE_REASON_CODES: ReadonlySet<FeedbackReasonCode> = new Set(['UNSAFE_OR_INAPPROPRIATE']);

export function isSafetySensitiveFeedback(reasonCodes: readonly FeedbackReasonCode[]): boolean {
  return reasonCodes.some((code) => SAFETY_SENSITIVE_REASON_CODES.has(code));
}
