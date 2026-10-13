// Recording what the household saw after a hazard event (register P1 "Home Risk Replay"; FRD v1.325). Pure: the declared message, action id and the form.
//
// A hazard record matched to the home's geography is not evidence of damage. The household may say what, if anything, they observed: no effect, or an effect
// they describe (without inferring a cause). Confirming an observed effect also writes an entry to the home's timeline, which the review says.
import { z } from 'zod';

export const PAST_HAZARD_RECORD_ENTITY_TYPE = 'PAST_HAZARD_RECORD';
export const PAST_HAZARD_COMMAND_MESSAGE = 'Record what I observed after this hazard event.';
export const PAST_HAZARD_COMMAND_ACTION_ID = 'past-hazard-record-outcome';
export const PAST_HAZARD_CAPTURE_KEY = 'PAST_HAZARD_OUTCOME';

export const PAST_HAZARD_STATUSES = ['NO_OBSERVED_EFFECT', 'OBSERVED_EFFECT_CONFIRMED', 'UNKNOWN'] as const;
export const PAST_HAZARD_STATUS_LABELS: Record<string, string> = {
  NO_OBSERVED_EFFECT: 'I saw no effect on the home', OBSERVED_EFFECT_CONFIRMED: 'I saw an effect on the home', UNKNOWN: 'I am not sure, or it has not been checked',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);

export const PastHazardOutcomeInputSchema = z.object({
  status: z.enum(PAST_HAZARD_STATUSES),
  observedOn: z.preprocess(blank, exactDate.nullable()).optional(),
  note: z.string().trim().min(3).max(1200),
}).strict();
export type PastHazardOutcomeForm = z.infer<typeof PastHazardOutcomeInputSchema>;

/** The route's own rules: a confirmed effect needs a description of at least 10 characters, and the date is not in the future. */
export function parsePastHazardOutcomeAnswer(answer: unknown, today = new Date().toISOString().slice(0, 10)):
  { success: true; data: PastHazardOutcomeForm } | { success: false; reason: 'INVALID' | 'NOTE_TOO_SHORT' | 'FUTURE' } {
  const parsed = PastHazardOutcomeInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  if (parsed.data.status === 'OBSERVED_EFFECT_CONFIRMED' && parsed.data.note.length < 10) return { success: false, reason: 'NOTE_TOO_SHORT' };
  if (parsed.data.observedOn && parsed.data.observedOn > today) return { success: false, reason: 'FUTURE' };
  return { success: true, data: parsed.data };
}
export const PAST_HAZARD_INVALID_MESSAGES = {
  INVALID: 'Check the form and try again.',
  NOTE_TOO_SHORT: 'Describe what you observed in at least 10 characters, without guessing at a cause.',
  FUTURE: 'The date cannot be in the future.',
} as const;
