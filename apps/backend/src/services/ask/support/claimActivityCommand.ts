// Claim checklist and notes inside Ask (register P2 "Claims"; FRD v1.337). Pure: declared messages, action ids and the note form.
//
// Documents are uploaded and attached on the page (binary files and a record picker); regenerating a checklist deletes its items and their progress, so
// it is not offered. What a household does day to day on a claim is tick the checklist and write down what happened, and that is here.
import { z } from 'zod';

export const CLAIM_ENTITY_TYPE = 'CLAIM';
export const CLAIM_CHECKLIST_ITEM_ENTITY_TYPE = 'CLAIM_CHECKLIST_ITEM';
export const CLAIM_CHECKLIST_MESSAGE = 'Show the checklist for this claim.';
export const CLAIM_CHECKLIST_ACTION_ID = 'claim-checklist';
export const CLAIM_ACTIVITY_MESSAGES = {
  NOTE: 'Add a note to this claim.',
  DONE: 'Mark this claim checklist item done.',
  NOT_APPLICABLE: 'Mark this claim checklist item not applicable.',
  REOPEN: 'Reopen this claim checklist item.',
} as const;
export type ClaimActivityKind = keyof typeof CLAIM_ACTIVITY_MESSAGES;
export const CLAIM_ACTIVITY_ACTION_IDS = { NOTE: 'claim-note', DONE: 'claim-checklist-done', NOT_APPLICABLE: 'claim-checklist-not-applicable', REOPEN: 'claim-checklist-reopen' } as const;
export const claimActivityKindFromMessage = (message: string): ClaimActivityKind | null =>
  ((Object.entries(CLAIM_ACTIVITY_MESSAGES) as Array<[ClaimActivityKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const claimActivityEntityType = (kind: ClaimActivityKind) => (kind === 'NOTE' ? CLAIM_ENTITY_TYPE : CLAIM_CHECKLIST_ITEM_ENTITY_TYPE);
export const CHECKLIST_STATUS_FOR_KIND = { DONE: 'DONE', NOT_APPLICABLE: 'NOT_APPLICABLE', REOPEN: 'OPEN' } as const;
export const CLAIM_NOTE_CAPTURE_KEY = 'CLAIM_NOTE';
export const ClaimNoteInputSchema = z.object({ note: z.string().trim().min(3).max(2000) }).strict();
export const parseClaimNoteAnswer = (answer: unknown) => ClaimNoteInputSchema.safeParse(answer);
/** Which checklist step an item allows from its current status. */
export function claimChecklistKinds(status: string): ClaimActivityKind[] {
  if (status === 'OPEN') return ['DONE', 'NOT_APPLICABLE'];
  return ['REOPEN'];
}
