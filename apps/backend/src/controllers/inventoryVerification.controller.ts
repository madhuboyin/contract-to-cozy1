// apps/backend/src/controllers/inventoryVerification.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import {
  getHighestPriorityUnverifiedItem,
  markItemVerified,
  getVerificationStats,
} from '../services/inventoryVerification.service';
import { getNextDiscoveryNudge } from '../services/discovery.service';

function parseExcludedIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

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
    const excludedIds = parseExcludedIds((req as any).query?.excludedIds);
    const nudge = await getNextDiscoveryNudge(propertyId, excludedIds);
    return res.json({ success: true, data: nudge });
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
