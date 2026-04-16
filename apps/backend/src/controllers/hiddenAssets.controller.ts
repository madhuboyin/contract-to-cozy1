import { Response } from 'express';
import { CustomRequest } from '../types';
import { HiddenAssetService } from '../services/hiddenAssets.service';
import {
  HiddenAssetMatchFilters,
  UpdateMatchStatusInput,
} from '../services/hiddenAssets/types';
import {
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  PropertyHiddenAssetMatchStatus,
} from '@prisma/client';
import { logger } from '../lib/logger';

const service = new HiddenAssetService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Authentication required.');
  return userId;
}

// ============================================================================
// GET /properties/:propertyId/hidden-assets
// ============================================================================

export async function getHiddenAssetsForProperty(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { propertyId } = req.params;

    const filters: HiddenAssetMatchFilters = {
      confidenceLevel: req.query.confidenceLevel as HiddenAssetConfidenceLevel | undefined,
      category: req.query.category as HiddenAssetCategory | undefined,
      status: req.query.status as PropertyHiddenAssetMatchStatus | undefined,
      includeDismissed: req.query.includeDismissed === 'true',
      includeExpired: req.query.includeExpired === 'true',
    };

    const result = await service.getMatchesForProperty(propertyId, userId, filters);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, '[HiddenAssets] getHiddenAssetsForProperty error');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch hidden asset matches.',
    });
  }
}

// ============================================================================
// POST /properties/:propertyId/hidden-assets/refresh
// ============================================================================

export async function refreshHiddenAssetsForProperty(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { propertyId } = req.params;

    const result = await service.refreshMatchesForProperty(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const msg = error?.message ?? '';
    const status =
      msg === 'Authentication required.' ? 401 :
      msg === 'SCAN_IN_PROGRESS' ? 409 :
      500;
    const clientMessage =
      msg === 'SCAN_IN_PROGRESS'
        ? 'A scan is already in progress for this property. Please wait a moment and try again.'
        : msg || 'Failed to run hidden asset scan.';
    logger.error({ err: error }, '[HiddenAssets] refreshHiddenAssetsForProperty error');
    return res.status(status).json({ success: false, message: clientMessage });
  }
}

// ============================================================================
// GET /hidden-asset-programs/:programId
// ============================================================================

export async function getHiddenAssetProgramDetail(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const { programId } = req.params;

    const result = await service.getProgramDetail(programId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const isNotFound = error?.message === 'Program not found.';
    const isAuth = error?.message === 'Authentication required.';
    const status = isNotFound ? 404 : isAuth ? 401 : 500;
    logger.error({ err: error }, '[HiddenAssets] getHiddenAssetProgramDetail error');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch program detail.',
    });
  }
}

// ============================================================================
// PATCH /property-hidden-asset-matches/:matchId
// ============================================================================

export async function updateHiddenAssetMatchStatus(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { matchId } = req.params;
    const input = req.body as UpdateMatchStatusInput;

    const result = await service.updateMatchStatus(matchId, input, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const isNotFound = error?.message === 'Match not found or access denied.';
    const isAuth = error?.message === 'Authentication required.';
    const status = isNotFound ? 404 : isAuth ? 401 : 500;
    logger.error({ err: error }, '[HiddenAssets] updateHiddenAssetMatchStatus error');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to update match status.',
    });
  }
}
