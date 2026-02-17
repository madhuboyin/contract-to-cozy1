import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  AccountUpsertPayload,
  OpportunityStatusInput,
  RunComparisonInput,
} from '../services/homeSavings/types';
import { HomeSavingsService } from '../services/homeSavings.service';

const service = new HomeSavingsService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return userId;
}

export async function listHomeSavingsCategories(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const result = await service.listCategories();
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error listing home savings categories:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to list home savings categories.',
    });
  }
}

export async function getHomeSavingsSummary(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const result = await service.getSummary(req.params.propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error fetching home savings summary:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch home savings summary.',
    });
  }
}

export async function getHomeSavingsCategoryDetail(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const result = await service.getCategoryDetail(
      req.params.propertyId,
      req.params.categoryKey,
      userId
    );
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error fetching home savings category detail:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch home savings category detail.',
    });
  }
}

export async function upsertHomeSavingsAccount(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as AccountUpsertPayload;
    const result = await service.upsertAccount(
      req.params.propertyId,
      req.params.categoryKey,
      userId,
      payload
    );
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error upserting home savings account:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to save home savings account.',
    });
  }
}

export async function runHomeSavingsComparison(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as RunComparisonInput;
    const result = await service.runComparison(req.params.propertyId, userId, payload);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error running home savings comparison:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to run home savings comparison.',
    });
  }
}

export async function setHomeSavingsOpportunityStatus(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as { status: OpportunityStatusInput };
    const result = await service.setOpportunityStatus(req.params.id, payload.status, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    console.error('Error updating home savings opportunity:', error);
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to update home savings opportunity.',
    });
  }
}
