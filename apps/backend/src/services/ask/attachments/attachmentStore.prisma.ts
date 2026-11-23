// The Prisma-backed store for the attachment sweeper. Thin on purpose: every rule lives in attachmentLifecycle and attachmentSweeper.
import { prisma } from '../../../lib/prisma';
import type { AttachmentSweepStore, SweepableAttachment } from './attachmentSweeper';

const LIVE = ['UPLOADING', 'READY', 'ANALYZING', 'ANALYZED', 'FAILED', 'PROMOTED'] as const;
type Row = { id: string; userId: string; scopeKind: string; scopeId: string; sessionId: string | null; state: string; deleteAfter: Date };
const toSweepable = (row: Row): SweepableAttachment => ({ id: row.id, userId: row.userId, scopeKind: row.scopeKind === 'CANDIDATE' ? 'CANDIDATE' : 'PROPERTY', scopeId: row.scopeId, sessionId: row.sessionId, state: row.state as SweepableAttachment['state'], deleteAfter: row.deleteAfter });
const select = { id: true, userId: true, scopeKind: true, scopeId: true, sessionId: true, state: true, deleteAfter: true } as const;

export const prismaAttachmentSweepStore: AttachmentSweepStore = {
  async findDue(now, limit) {
    const rows = await prisma.askChatAttachment.findMany({ where: { state: { in: [...LIVE] }, deleteAfter: { lte: now } }, orderBy: { deleteAfter: 'asc' }, take: limit, select });
    return rows.map(toSweepable);
  },
  async findBySession(userId, sessionId) {
    const rows = await prisma.askChatAttachment.findMany({ where: { userId, sessionId, state: { in: [...LIVE] } }, select });
    return rows.map(toSweepable);
  },
  async markEnded(id, state, reason, at) {
    // Guarded on the live states so a row that another sweeper already ended is not ended twice.
    await prisma.askChatAttachment.updateMany({ where: { id, state: { in: [...LIVE] } }, data: { state, endedAt: at, endedReason: reason } });
  },
};
