// BICC-MM-003 / MM-004 / MM-005 / MM-010 / MM-011: the states an ephemeral chat attachment moves through, when each one expires, what a deletion must remove, and who
// may read it. Pure. Analysis and saving to Home Records are separate actions: no state here is reached by analysing, and PROMOTED is reached only by an explicit,
// separately confirmed promotion.
import { ATTACHMENT_DERIVED_KINDS, ATTACHMENT_RETENTION, type AttachmentDerivedKind } from './attachmentPolicy';

export const ATTACHMENT_STATES = ['UPLOADING', 'READY', 'ANALYZING', 'ANALYZED', 'FAILED', 'PROMOTED', 'DELETED', 'EXPIRED'] as const;
export type AttachmentState = typeof ATTACHMENT_STATES[number];

/** Terminal states: nothing is retrievable and nothing moves out of them. */
export const TERMINAL_STATES: ReadonlySet<AttachmentState> = new Set(['DELETED', 'EXPIRED']);

const TRANSITIONS: Readonly<Record<AttachmentState, readonly AttachmentState[]>> = {
  UPLOADING: ['READY', 'FAILED', 'DELETED'],
  READY: ['ANALYZING', 'PROMOTED', 'DELETED', 'EXPIRED'],
  ANALYZING: ['ANALYZED', 'FAILED', 'DELETED'],
  ANALYZED: ['PROMOTED', 'DELETED', 'EXPIRED'],
  FAILED: ['READY', 'DELETED', 'EXPIRED'],
  // A confirmed canonical record is separate: deleting or expiring the chat copy never touches it (MM-011), so the chat copy may still end.
  PROMOTED: ['DELETED', 'EXPIRED'],
  DELETED: [],
  EXPIRED: [],
};

export function canTransition(from: AttachmentState, to: AttachmentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class AttachmentTransitionError extends Error {
  constructor(readonly from: AttachmentState, readonly to: AttachmentState) { super(`An attachment cannot move from ${from} to ${to}.`); this.name = 'AttachmentTransitionError'; }
}

export function transition(from: AttachmentState, to: AttachmentState): AttachmentState {
  if (!canTransition(from, to)) throw new AttachmentTransitionError(from, to);
  return to;
}

export interface AttachmentTimes { state: AttachmentState; uploadedAt: Date; analysisCompletedAt?: Date | null }

/**
 * When this attachment must be gone (D10, MM-010). Analysed: 24 hours after analysis completes. Never analysed: 24 hours after upload. Failed: one hour after upload.
 * A promoted attachment keeps the unanalysed period for its chat copy only; the canonical record has its own retention.
 */
export function deleteAfter(times: AttachmentTimes): Date {
  const base = times.state === 'FAILED' || times.state === 'UPLOADING'
    ? times.uploadedAt.getTime() + ATTACHMENT_RETENTION.failedUploadMs
    : times.analysisCompletedAt
      ? times.analysisCompletedAt.getTime() + ATTACHMENT_RETENTION.afterAnalysisMs
      : times.uploadedAt.getTime() + ATTACHMENT_RETENTION.unanalyzedMs;
  return new Date(base);
}

export function isExpired(times: AttachmentTimes & { deleteAfter?: Date | null }, now: Date): boolean {
  if (TERMINAL_STATES.has(times.state)) return false;
  return (times.deleteAfter ?? deleteAfter(times)).getTime() <= now.getTime();
}

/** Every copy that must be removed with the attachment: raw file, preview, OCR text, chunks and any derived index. Nothing is left out by omission. */
export function deletionPlan(): readonly AttachmentDerivedKind[] {
  return ATTACHMENT_DERIVED_KINDS;
}

export interface AttachmentOwner { userId: string; scopeKind: 'PROPERTY' | 'CANDIDATE'; scopeId: string }
export interface AttachmentReader { userId: string; /** The homes and candidates the reader may reach right now. */ reachableScopes: ReadonlySet<string> }
const scopeKey = (scopeKind: string, scopeId: string) => `${scopeKind}:${scopeId}`;

/**
 * MM-004: retrievable only by its owner, only while its scope is still reachable, and only while it is live. Checked before retrieval and again before delivery. A
 * deleted, expired or access-lost attachment yields nothing, so stale content cannot be returned (MM-005).
 */
export function canRetrieve(attachment: AttachmentOwner & { state: AttachmentState }, reader: AttachmentReader): boolean {
  if (TERMINAL_STATES.has(attachment.state)) return false;
  if (attachment.state !== 'ANALYZED' && attachment.state !== 'READY' && attachment.state !== 'PROMOTED') return false;
  return attachment.userId === reader.userId && reader.reachableScopes.has(scopeKey(attachment.scopeKind, attachment.scopeId));
}

export { scopeKey as attachmentScopeKey };

/** Isolated storage key: the owner and scope are part of the path, ids are validated, so one person's key can never address another's. */
export function storageKeyFor(owner: AttachmentOwner, attachmentId: string, kind: AttachmentDerivedKind = 'RAW_FILE'): string {
  for (const part of [owner.userId, owner.scopeId, attachmentId]) if (!/^[A-Za-z0-9_-]{1,80}$/.test(part)) throw new Error('Attachment storage keys accept only letters, digits, hyphen and underscore.');
  return `ask-attachments/${owner.userId}/${owner.scopeKind.toLowerCase()}/${owner.scopeId}/${attachmentId}/${kind.toLowerCase()}`;
}
