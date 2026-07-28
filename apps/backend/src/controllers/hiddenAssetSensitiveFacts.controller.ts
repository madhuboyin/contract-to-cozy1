import { Response } from 'express';
import { HiddenAssetSensitiveFactKey } from '@prisma/client';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import {
  RecordSensitiveFactInput,
  SensitiveFactConsentError,
  declineSensitiveFact,
  deleteSensitiveFact,
  getSensitiveFactStatusForMatch,
  recordSensitiveFact,
} from '../services/hiddenAssetSensitiveFacts.service';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Authentication required.');
  return userId;
}

function statusForError(error: any): number {
  if (error?.message === 'Authentication required.') return 401;
  if (error?.message === 'Match not found or access denied.') return 404;
  if (error instanceof SensitiveFactConsentError) return 422;
  return 500;
}

// ============================================================================
// GET /property-hidden-asset-matches/:matchId/sensitive-facts
// ============================================================================

export async function listSensitiveFactsForMatch(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { matchId } = req.params;

    const facts = await getSensitiveFactStatusForMatch(matchId, userId);
    return res.json({ success: true, data: { facts } });
  } catch (error: any) {
    logger.error({ err: error }, '[HiddenAssetSensitiveFacts] listSensitiveFactsForMatch error');
    return res.status(statusForError(error)).json({
      success: false,
      message: error?.message || 'Failed to fetch sensitive fact status.',
    });
  }
}

// ============================================================================
// POST /property-hidden-asset-matches/:matchId/sensitive-facts
// ============================================================================

export async function submitSensitiveFactForMatch(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { matchId } = req.params;
    const input = req.body as RecordSensitiveFactInput;

    const fact = await recordSensitiveFact(matchId, userId, input);
    return res.status(201).json({ success: true, data: { fact } });
  } catch (error: any) {
    logger.error({ err: error }, '[HiddenAssetSensitiveFacts] submitSensitiveFactForMatch error');
    return res.status(statusForError(error)).json({
      success: false,
      code: error instanceof SensitiveFactConsentError ? error.code : undefined,
      message: error?.message || 'Failed to record sensitive fact.',
    });
  }
}

// ============================================================================
// POST /property-hidden-asset-matches/:matchId/sensitive-facts/:factKey/decline
// ============================================================================

export async function declineSensitiveFactForMatch(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { matchId, factKey } = req.params;

    const fact = await declineSensitiveFact(matchId, userId, factKey as HiddenAssetSensitiveFactKey);
    return res.json({ success: true, data: { fact } });
  } catch (error: any) {
    logger.error({ err: error }, '[HiddenAssetSensitiveFacts] declineSensitiveFactForMatch error');
    return res.status(statusForError(error)).json({
      success: false,
      code: error instanceof SensitiveFactConsentError ? error.code : undefined,
      message: error?.message || 'Failed to decline sensitive fact.',
    });
  }
}

// ============================================================================
// DELETE /property-hidden-asset-matches/:matchId/sensitive-facts/:factKey
// ============================================================================

export async function deleteSensitiveFactForMatch(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { matchId, factKey } = req.params;

    await deleteSensitiveFact(matchId, userId, factKey as HiddenAssetSensitiveFactKey);
    return res.status(204).send();
  } catch (error: any) {
    logger.error({ err: error }, '[HiddenAssetSensitiveFacts] deleteSensitiveFactForMatch error');
    return res.status(statusForError(error)).json({
      success: false,
      message: error?.message || 'Failed to delete sensitive fact.',
    });
  }
}
