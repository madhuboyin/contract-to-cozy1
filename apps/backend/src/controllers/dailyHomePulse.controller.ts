import { Response } from 'express';
import { CustomRequest } from '../types';
import { dailyHomePulseService } from '../services/dailyHomePulse.service';

export async function getDailySnapshot(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const snapshot = await dailyHomePulseService.getOrCreateTodaySnapshot(propertyId, userId);
    return res.json({ success: true, data: { snapshot } });
  } catch (error: any) {
    console.error('Error fetching daily snapshot:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch daily snapshot.',
    });
  }
}

export async function checkinDailySnapshot(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const data = await dailyHomePulseService.recordCheckin(propertyId, userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error recording daily snapshot check-in:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to record check-in.',
    });
  }
}

export async function completeDailyMicroAction(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const actionId = req.params.actionId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const data = await dailyHomePulseService.completeMicroAction(propertyId, actionId, userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error completing micro action:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to complete micro action.',
    });
  }
}

export async function dismissDailyMicroAction(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const actionId = req.params.actionId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const data = await dailyHomePulseService.dismissMicroAction(propertyId, actionId, userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error dismissing micro action:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to dismiss micro action.',
    });
  }
}

