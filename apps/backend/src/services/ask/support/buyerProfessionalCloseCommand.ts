// Recording that the professional closing is complete, inside Ask (register P2 "Buyer Closing"; FRD v1.461; owner ruling D2, 2026-10-28).
// Pure: the declared message and action id, the form, the readiness check and the timestamp the canonical service takes.
//
// The action records the buyer's OWN report that the professional closing has completed. Ask does not decide that closing is safe, read the signed documents,
// recommend proceeding or verify legal completion. The authorization (contributor and up) and the prerequisites are Desktop's, enforced again by
// BuyerClosingDayService.confirmProfessionalClose; the readiness check here only lets the buyer see what is missing before they are asked to confirm.
import { z } from 'zod';

export const PROFESSIONAL_CLOSE_MESSAGE = 'Record that my professional closing is complete.';
export const PROFESSIONAL_CLOSE_ACTION_ID = 'buyer-closing-day-professional-close';
export const PROFESSIONAL_CLOSE_CAPTURE_KEY = 'BUYER_CLOSING_DAY_PROFESSIONAL_CLOSE';
export const PROFESSIONAL_CLOSE_ENTITY_TYPE = 'BUYER_CLOSING_DAY_WORKSPACE';

const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const blank = (value: unknown) => (value === '' || value === undefined || value === null ? undefined : value);

export const ProfessionalCloseFormSchema = z.object({
  closedDate: exactDate,
  confirmationNotes: z.preprocess(blank, z.string().trim().max(2_000).optional()),
}).strict();
export interface ProfessionalCloseForm { closedDate: string; confirmationNotes?: string }

/** Validates a submitted form or a stored confirmation parameter. A completion date in the future is refused, as on Desktop. */
export function parseProfessionalCloseAnswer(answer: unknown, now: Date = new Date()): { success: true; data: ProfessionalCloseForm } | { success: false; reason: 'INVALID' | 'FUTURE' } {
  const parsed = ProfessionalCloseFormSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const day = parsed.data.closedDate as string;
  // A real calendar day: 2026-02-31 parses, then rolls over to March, so compare it back.
  const parsedDay = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) return { success: false, reason: 'INVALID' };
  // The date is the buyer's local day, which can be a day ahead of UTC: allow up to tomorrow in UTC and let the timestamp below clamp to now.
  if (day > new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)) return { success: false, reason: 'FUTURE' };
  return { success: true, data: { closedDate: day, ...(parsed.data.confirmationNotes ? { confirmationNotes: parsed.data.confirmationNotes } : {}) } };
}

/** The datetime the canonical service takes: midday UTC of the day given, never later than now (the service refuses the future). */
export function professionalCloseTimestamp(day: string, now: Date = new Date()): string {
  const noon = new Date(`${day}T12:00:00.000Z`);
  return (noon.getTime() > now.getTime() ? now : noon).toISOString();
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  keysStatus: 'Keys', remotesStatus: 'Remotes', accessCodesStatus: 'Access codes', mailboxAccessStatus: 'Mailbox access', warrantiesManualsStatus: 'Warranties and manuals',
};
const CHECK_LABELS: Record<string, string> = {
  identificationReady: 'Identification ready', requiredDocumentsReady: 'Required documents ready', fundsReadinessReviewed: 'Funds readiness reviewed',
  blockersReviewed: 'Blockers reviewed', questionsResolved: 'Questions resolved', signingCompleted: 'Signing completed', copiesReceived: 'Copies received',
  possessionConfirmed: 'Possession confirmed',
};

export interface ClosingDayView {
  workspace: (Record<string, unknown> & { professionalClosingConfirmedAt?: string | null }) | null;
  appointment: { scheduledAt: string | null; format: string | null; trustedContact: unknown } | null;
  signedDocument: unknown;
  lifecycle: { stage: string };
}

/** What still stands between the buyer and recording the close, in the order the service checks it. Empty means every prerequisite is met. */
export function professionalCloseGaps(view: ClosingDayView): string[] {
  const workspace = view.workspace;
  if (!workspace) return ['The Closing Day checklist has not been started.'];
  const gaps: string[] = [];
  for (const [key, label] of Object.entries(CHECK_LABELS)) if (!workspace[key]) gaps.push(label);
  for (const [key, label] of Object.entries(ITEM_STATUS_LABELS)) if (!workspace[key] || workspace[key] === 'UNKNOWN') gaps.push(`${label} status`);
  if (!view.signedDocument) gaps.push('A current signed closing record');
  const appointment = view.appointment;
  if (!appointment?.scheduledAt) gaps.push('The closing appointment time');
  if (!appointment || !appointment.format || appointment.format === 'UNKNOWN') gaps.push('The closing appointment method');
  if (!appointment?.trustedContact) gaps.push('A trusted title or escrow contact');
  return gaps;
}
