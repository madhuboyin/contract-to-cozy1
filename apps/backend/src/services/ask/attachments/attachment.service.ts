// BICC-MM-001/002/003/004/010 (BICC-3.1): receiving, listing and removing an ephemeral chat attachment. Everything is scoped to the signed-in person in the query itself; a scope
// (an owned home or the person's own candidate home) is checked before anything is stored; the type comes from the BYTES; a rejected, unscannable or failed file leaves no
// stored copy; and nothing here analyses the file or creates a record (MM-003): the result is a READY file waiting for the person to ask about it.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { candidatePropertyService } from '../buyer/candidateProperty.service';
import { scanContent } from '../../contentScan.service';
import { validateAttachment } from './attachmentPolicy';
import { deleteAfter, deletionPlan, type AttachmentOwner } from './attachmentLifecycle';
import { s3AttachmentObjectStore, type AttachmentObjectStore } from './attachmentObjectStore.s3';

/** Per-person ceiling on files that are still live, so uploads cannot be used to fill storage. */
export const MAX_LIVE_ATTACHMENTS_PER_USER = 10;
const LIVE = ['UPLOADING', 'READY', 'ANALYZING', 'ANALYZED', 'FAILED', 'PROMOTED'] as const;

export interface AttachmentView {
  id: string; fileName: string; type: string; sizeBytes: number; state: string; scopeKind: 'PROPERTY' | 'CANDIDATE'; scopeId: string; sessionId: string | null;
  uploadedAt: string; deleteAfter: string;
}
type Row = { id: string; userId: string; scopeKind: string; scopeId: string; sessionId: string | null; state: string; declaredMimeType: string; detectedMimeType: string | null; originalFileName: string; sizeBytes: number; uploadedAt: Date; deleteAfter: Date };
const toView = (row: Row): AttachmentView => ({
  id: row.id, fileName: row.originalFileName, type: row.detectedMimeType ?? row.declaredMimeType, sizeBytes: row.sizeBytes, state: row.state,
  scopeKind: row.scopeKind === 'CANDIDATE' ? 'CANDIDATE' : 'PROPERTY', scopeId: row.scopeId, sessionId: row.sessionId, uploadedAt: row.uploadedAt.toISOString(), deleteAfter: row.deleteAfter.toISOString(),
});

export interface AttachmentDeps {
  objects?: AttachmentObjectStore;
  scan?: (bytes: Buffer) => Promise<{ status: string }>;
  propertyRole?: (userId: string, propertyId: string) => Promise<string | null>;
  candidateExists?: (userId: string, candidateId: string) => Promise<boolean>;
  now?: () => Date;
  /** HEIC/HEIF are not converted yet, so they are rejected with a recovery path (MM-002). */
  canConvertHeic?: boolean;
}

const defaults = {
  scan: scanContent,
  propertyRole: async (userId: string, propertyId: string) => (await resolvePropertyAccess(userId, propertyId))?.role ?? null,
  candidateExists: async (userId: string, candidateId: string) => Boolean(await candidatePropertyService.get(userId, candidateId)),
};
const notFound = () => new APIError('That home was not found.', 404, 'ATTACHMENT_SCOPE_NOT_FOUND');

/** The scope must be the person's own: a home they can contribute to, or one of their own candidate homes. A viewer cannot add files. Everything else is "not found". */
async function authorizeScope(userId: string, scopeKind: string, scopeId: string, deps: AttachmentDeps): Promise<AttachmentOwner> {
  if (scopeKind !== 'PROPERTY' && scopeKind !== 'CANDIDATE') throw new APIError('Choose the home this file is about.', 400, 'ATTACHMENT_SCOPE_INVALID');
  if (typeof scopeId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(scopeId)) throw new APIError('Choose the home this file is about.', 400, 'ATTACHMENT_SCOPE_INVALID');
  if (scopeKind === 'PROPERTY') {
    const role = await (deps.propertyRole ?? defaults.propertyRole)(userId, scopeId);
    if (!role) throw notFound();
    if (role === 'VIEWER') throw new APIError('Your role on this home cannot add files.', 403, 'ATTACHMENT_ROLE_FORBIDDEN');
  } else if (!(await (deps.candidateExists ?? defaults.candidateExists)(userId, scopeId))) throw notFound();
  return { userId, scopeKind, scopeId };
}

export const attachmentService = {
  async upload(userId: string, input: { scopeKind: string; scopeId: string; sessionId?: string | null; file: { originalname: string; mimetype: string; buffer: Buffer } }, deps: AttachmentDeps = {}): Promise<AttachmentView> {
    const now = (deps.now ?? (() => new Date()))();
    const owner = await authorizeScope(userId, input.scopeKind, input.scopeId, deps);
    const checked = validateAttachment({ declaredMimeType: input.file.mimetype, bytes: input.file.buffer, canConvertHeic: deps.canConvertHeic === true });
    if (!checked.ok) throw new APIError(checked.message, checked.code === 'TOO_LARGE' ? 413 : 400, `ATTACHMENT_${checked.code}`);
    const sessionId = typeof input.sessionId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(input.sessionId) ? input.sessionId : null;
    if (sessionId) {
      const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
      // A session that does not exist yet is fine (it is created by the first message); one that is another person's is not usable.
      const taken = session ? null : await prisma.askSession.findFirst({ where: { id: sessionId }, select: { userId: true } });
      if (taken && taken.userId !== userId) throw notFound();
    }
    const live = await prisma.askChatAttachment.count({ where: { userId, state: { in: [...LIVE] } } });
    if (live >= MAX_LIVE_ATTACHMENTS_PER_USER) throw new APIError(`You can keep up to ${MAX_LIVE_ATTACHMENTS_PER_USER} files in chat at once. Remove one to add another.`, 429, 'ATTACHMENT_LIMIT_REACHED');
    const scan = await (deps.scan ?? defaults.scan)(input.file.buffer);
    if (scan.status === 'REJECTED') throw new APIError('This file was blocked because it may be harmful. It was not added.', 422, 'ATTACHMENT_MALWARE_DETECTED');
    const sha256 = createHash('sha256').update(input.file.buffer).digest('hex');
    const created = await prisma.askChatAttachment.create({
      data: {
        userId, scopeKind: owner.scopeKind, scopeId: owner.scopeId, sessionId, state: 'UPLOADING', declaredMimeType: input.file.mimetype, detectedMimeType: checked.type,
        originalFileName: input.file.originalname.slice(0, 200), sizeBytes: input.file.buffer.length, sha256, uploadedAt: now,
        deleteAfter: deleteAfter({ state: 'UPLOADING', uploadedAt: now }),
      },
    });
    const objects = deps.objects ?? s3AttachmentObjectStore;
    try {
      await objects.putRaw(owner, created.id, input.file.buffer, checked.type);
    } catch {
      // Nothing may linger: remove whatever may have been written, then end the row as failed. The sweeper removes it within the hour if this cleanup also fails.
      await objects.deleteCopies({ ...owner, id: created.id, sessionId, state: 'FAILED', deleteAfter: now }, deletionPlan()).catch(() => undefined);
      await prisma.askChatAttachment.updateMany({ where: { id: created.id, userId }, data: { state: 'FAILED', deleteAfter: deleteAfter({ state: 'FAILED', uploadedAt: now }) } });
      throw new APIError('The file could not be saved. Try again.', 503, 'ATTACHMENT_STORAGE_FAILED');
    }
    const ready = await prisma.askChatAttachment.update({ where: { id: created.id }, data: { state: 'READY', deleteAfter: deleteAfter({ state: 'READY', uploadedAt: now }) } });
    return toView(ready as unknown as Row);
  },

  async list(userId: string, sessionId?: string | null): Promise<AttachmentView[]> {
    const rows = await prisma.askChatAttachment.findMany({
      where: { userId, state: { in: ['READY', 'ANALYZING', 'ANALYZED', 'FAILED'] }, deleteAfter: { gt: new Date() }, ...(sessionId ? { sessionId } : {}) },
      orderBy: { uploadedAt: 'desc' }, take: 50,
    });
    return rows.map((row) => toView(row as unknown as Row));
  },

  /** Removing is the person's own choice and removes every copy; the row ends only after the copies are gone, otherwise the sweeper retries. */
  async remove(userId: string, id: string, deps: AttachmentDeps = {}): Promise<{ deleted: true } | { deleted: false; retryLater: true }> {
    const row = await prisma.askChatAttachment.findFirst({ where: { id, userId, state: { in: [...LIVE] } } });
    if (!row) throw new APIError('That file was not found.', 404, 'ATTACHMENT_NOT_FOUND');
    const objects = deps.objects ?? s3AttachmentObjectStore;
    const owner = { userId, scopeKind: row.scopeKind === 'CANDIDATE' ? 'CANDIDATE' as const : 'PROPERTY' as const, scopeId: row.scopeId };
    const { failed } = await objects.deleteCopies({ ...owner, id: row.id, sessionId: row.sessionId, state: row.state as never, deleteAfter: row.deleteAfter }, deletionPlan()).catch(() => ({ failed: [...deletionPlan()] }));
    if (failed.length) {
      // Leave it due so the next sweep retries; never claim a copy is gone when it may not be.
      await prisma.askChatAttachment.updateMany({ where: { id, userId }, data: { deleteAfter: new Date() } });
      return { deleted: false, retryLater: true };
    }
    await prisma.askChatAttachment.updateMany({ where: { id, userId, state: { in: [...LIVE] } }, data: { state: 'DELETED', endedAt: new Date(), endedReason: 'USER_REMOVED' } });
    return { deleted: true };
  },
};
