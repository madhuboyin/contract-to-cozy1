// BICC-MM-010 / FRD D10: removes expired, failed and session-deleted chat attachments together with everything derived from them. Storage and persistence are
// injected, so the rules are tested without either. A row is marked ended ONLY after every copy was removed; a failure leaves it due, so the next sweep retries and
// no copy is orphaned behind a row that claims to be gone. Only chat copies are touched: a separately confirmed canonical record is never read or changed here (MM-011).
import { deletionPlan, TERMINAL_STATES, type AttachmentOwner, type AttachmentState } from './attachmentLifecycle';
import type { AttachmentDerivedKind } from './attachmentPolicy';

export interface SweepableAttachment extends AttachmentOwner { id: string; sessionId: string | null; state: AttachmentState; deleteAfter: Date }

export interface AttachmentSweepStore {
  /** Live attachments whose deleteAfter has passed, oldest first, at most `limit`. */
  findDue(now: Date, limit: number): Promise<SweepableAttachment[]>;
  /** This person's live attachments in one session. Scoped by user so one person's session id can never reach another's files. */
  findBySession(userId: string, sessionId: string): Promise<SweepableAttachment[]>;
  markEnded(id: string, state: 'DELETED' | 'EXPIRED', reason: string, at: Date): Promise<void>;
}

export interface AttachmentDerivedStorage {
  /** Removes the given copies of one attachment. Removing a copy that does not exist is success. Returns the kinds that could NOT be removed. */
  deleteCopies(attachment: SweepableAttachment, kinds: readonly AttachmentDerivedKind[]): Promise<{ failed: AttachmentDerivedKind[] }>;
}

export interface SweepResult { examined: number; ended: number; retryLater: number }

async function endOne(attachment: SweepableAttachment, store: AttachmentSweepStore, storage: AttachmentDerivedStorage, end: { state: 'DELETED' | 'EXPIRED'; reason: string }, now: Date): Promise<boolean> {
  if (TERMINAL_STATES.has(attachment.state)) return true;
  let failed: AttachmentDerivedKind[];
  try { failed = (await storage.deleteCopies(attachment, deletionPlan())).failed; } catch { failed = [...deletionPlan()]; }
  if (failed.length) return false;
  await store.markEnded(attachment.id, end.state, end.reason, now);
  return true;
}

/** The scheduled sweep: everything past its deletion time. Idempotent, and bounded per run so one run cannot hold the table. */
export async function sweepExpiredAttachments(deps: { store: AttachmentSweepStore; storage: AttachmentDerivedStorage; now?: Date; limit?: number }): Promise<SweepResult> {
  const now = deps.now ?? new Date();
  const due = await deps.store.findDue(now, deps.limit ?? 200);
  let ended = 0; let retryLater = 0;
  for (const attachment of due) {
    // A failed upload is DELETED (it never became usable); everything else that outlived its time is EXPIRED.
    const end = attachment.state === 'FAILED' || attachment.state === 'UPLOADING' ? { state: 'DELETED' as const, reason: 'FAILED_UPLOAD_CLEANUP' } : { state: 'EXPIRED' as const, reason: 'RETENTION_ELAPSED' };
    if (await endOne(attachment, deps.store, deps.storage, end, now)) ended += 1; else retryLater += 1;
  }
  return { examined: due.length, ended, retryLater };
}

/** Deleting a conversation deletes its chat attachments and every derivative (MM-010), for that person only. */
export async function deleteSessionAttachments(deps: { store: AttachmentSweepStore; storage: AttachmentDerivedStorage; userId: string; sessionId: string; now?: Date }): Promise<SweepResult> {
  const now = deps.now ?? new Date();
  const rows = await deps.store.findBySession(deps.userId, deps.sessionId);
  let ended = 0; let retryLater = 0;
  for (const attachment of rows) {
    if (attachment.userId !== deps.userId) { retryLater += 1; continue; } // defence in depth: never act on a row that is not this person's
    if (await endOne(attachment, deps.store, deps.storage, { state: 'DELETED', reason: 'SESSION_DELETED' }, now)) ended += 1; else retryLater += 1;
  }
  return { examined: rows.length, ended, retryLater };
}
