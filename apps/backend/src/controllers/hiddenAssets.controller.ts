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
      activeOnly: req.query.activeOnly === 'true',
      includeDismissed: req.query.includeDismissed === 'true',
      includeExpired: req.query.includeExpired === 'true',
    };

    const result = await service.getMatchesForProperty(propertyId, userId, filters);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('[HiddenAssets] getHiddenAssetsForProperty error:', error);
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
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('[HiddenAssets] refreshHiddenAssetsForProperty error:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to run hidden asset scan.',
    });
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
    console.error('[HiddenAssets] getHiddenAssetProgramDetail error:', error);
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
    console.error('[HiddenAssets] updateHiddenAssetMatchStatus error:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to update match status.',
    });
  }
}
