// Bringing back a dismissed guided journey, and the optional reason for dismissing one, inside Ask (FRD v1.462; owner rulings D3a and D3b, 2026-10-28).
// Pure: the declared restore message and action id, the closed list of dismissal reasons, and the form that collects one.
//
// Restoring and dismissing share the GUIDANCE_JOURNEY_DISMISS operation (no new operation or registry entry), told apart by their declared messages.
// A reason is feedback metadata, never a verified fact about the home, and the form never blocks dismissal: every field is optional.
import { z } from 'zod';

export const GUIDANCE_JOURNEY_RESTORE_MESSAGE = 'Bring back this guided journey.';
export const GUIDANCE_JOURNEY_RESTORE_ACTION_ID = 'restore-guided-journey';
export const GUIDANCE_JOURNEY_DISMISS_REASON_CAPTURE_KEY = 'GUIDANCE_JOURNEY_DISMISS_REASON';

export const GUIDANCE_DISMISS_REASONS = [
  { value: 'NOT_RELEVANT', label: 'It is not relevant to my home' },
  { value: 'ALREADY_HANDLED', label: 'I already took care of it' },
  { value: 'DIFFERENT_APPROACH', label: 'I am handling it another way' },
  { value: 'NOT_NOW', label: 'It is not a priority right now' },
  { value: 'PREFER_NOT_TO_SAY', label: 'I would rather not say' },
] as const;
const REASON_VALUES = GUIDANCE_DISMISS_REASONS.map((entry) => entry.value) as [string, ...string[]];

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? undefined : value);
export const GuidanceDismissReasonAnswerSchema = z.object({
  reason: z.preprocess(blank, z.enum(REASON_VALUES).optional()),
  note: z.preprocess(blank, z.string().trim().max(300).optional()),
}).strict();
export type GuidanceDismissReasonAnswer = z.infer<typeof GuidanceDismissReasonAnswerSchema>;

/** The text stored with the dismissal (the service's `dismissedReason`, at most 500 characters), or null when none was given. "Rather not say" stores nothing. */
export function dismissalReasonText(answer: GuidanceDismissReasonAnswer): string | null {
  const label = answer.reason && answer.reason !== 'PREFER_NOT_TO_SAY' ? GUIDANCE_DISMISS_REASONS.find((entry) => entry.value === answer.reason)?.label ?? null : null;
  const text = [label, answer.note?.trim() || null].filter((part): part is string => Boolean(part)).join(': ');
  return text ? text.slice(0, 500) : null;
}
