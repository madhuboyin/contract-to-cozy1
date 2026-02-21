// apps/backend/src/controllers/inventoryVerification.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import {
  getHighestPriorityUnverifiedItem,
  markItemVerified,
  getVerificationStats,
} from '../services/inventoryVerification.service';
import { getNextPropertyNudge } from '../services/property.service';

export async function getNudge(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await getHighestPriorityUnverifiedItem(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getNextDashboardNudge(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId } = req.params;

    // Priority 1: Property-level nudges (resilience, utility, insurance, equity)
    const propertyNudge = await getNextPropertyNudge(propertyId);
    if (propertyNudge) {
      return res.json({ success: true, data: propertyNudge });
    }

    // Priority 2: Inventory verification nudges
    const inventoryNudge = await getHighestPriorityUnverifiedItem(propertyId);
    if (!inventoryNudge) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        type: 'ASSET_VERIFICATION',
        source: 'INVENTORY',
        ...inventoryNudge,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, itemId } = req.params;
    const { source, technicalSpecs } = req.body;

    const item = await markItemVerified(itemId, propertyId, source, technicalSpecs);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function getStats(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const stats = await getVerificationStats(propertyId);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}
