// BICC-3.1: ephemeral chat attachments over HTTP. The ask router already requires an Ask-eligible account (D09). Nothing here analyses a file or creates a record.
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../types/auth.types';
import { APIError } from '../middleware/error.middleware';
import { attachmentService } from '../services/ask/attachments/attachment.service';

const need = (req: AuthRequest): string => { if (!req.user) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED'); return req.user.userId; };

export async function postAskAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = need(req);
    const file = (req as AuthRequest & { file?: { originalname: string; mimetype: string; buffer: Buffer } }).file;
    if (!file) throw new APIError('Choose a file to add.', 400, 'ATTACHMENT_FILE_REQUIRED');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const view = await attachmentService.upload(userId, { scopeKind: String(b.scopeKind ?? ''), scopeId: String(b.scopeId ?? ''), sessionId: typeof b.sessionId === 'string' ? b.sessionId : null, file });
    return res.status(201).json({ success: true, data: view });
  } catch (error) { return next(error); }
}

export async function listAskAttachments(req: AuthRequest, res: Response, next: NextFunction) {
  try { return res.json({ success: true, data: { attachments: await attachmentService.list(need(req), typeof req.query.sessionId === 'string' ? req.query.sessionId : null) } }); } catch (error) { return next(error); }
}

export async function deleteAskAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await attachmentService.remove(need(req), req.params.attachmentId);
    return res.status(result.deleted ? 200 : 202).json({ success: true, data: result });
  } catch (error) { return next(error); }
}
