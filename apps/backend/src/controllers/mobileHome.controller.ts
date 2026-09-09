// apps/backend/src/controllers/mobileHome.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types';
import { logger } from '../lib/logger';
import { buildMobileHome, MobileHomeError } from '../services/mobileHome.service';

/**
 * GET /api/mobile/home
 *
 * One call that powers the mobile home screen: the property picker, the
 * selected property's health score, onboarding progress, narrative brief,
 * a server-consolidated urgent-actions list, and headline counts.
 *
 * Query: propertyId (optional) — defaults to the caller's primary property.
 */
export const getMobileHome = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const requestedRaw = req.query.propertyId;
    const requestedPropertyId =
      typeof requestedRaw === 'string' && requestedRaw.trim().length > 0
        ? requestedRaw.trim()
        : undefined;

    const payload = await buildMobileHome(userId, requestedPropertyId);

    res.json({ success: true, data: payload });
  } catch (error) {
    if (error instanceof MobileHomeError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    logger.error({ err: error }, 'Error building mobile home payload');
    res.status(500).json({ success: false, message: 'Failed to load the mobile home screen.' });
  }
};
