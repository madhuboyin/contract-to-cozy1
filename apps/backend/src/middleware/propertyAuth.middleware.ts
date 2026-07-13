// apps/backend/src/middleware/propertyAuth.middleware.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import { resolvePropertyAccess } from '../services/propertyAccess.service';
import {
  securityAuthDenialsTotal,
  securityPropertyScopeDenialsTotal,
} from '../lib/metrics';

export const propertyAuthMiddleware = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
) => {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  if (!userId) {
    securityAuthDenialsTotal.inc({
      surface: 'property_auth_middleware',
      status_code: '401',
      code: 'AUTH_REQUIRED',
    });
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!propertyId) {
    return res.status(400).json({ message: 'Property ID must be provided.' });
  }

  try {
    const access = await resolvePropertyAccess(userId, propertyId);

    if (!access) {
      securityPropertyScopeDenialsTotal.inc({
        source: 'property_auth_middleware',
        status_code: '404',
      });
      return res.status(404).json({ message: 'Property not found or access denied.' });
    }

    req.property = { id: access.propertyId } as any;
    req.householdRole = access.role;
    return next();
  } catch (error) {
    logger.error({ err: error }, 'Property Auth Error');
    return res
      .status(500)
      .json({ message: 'Internal server error during property authorization check.' });
  }
};
