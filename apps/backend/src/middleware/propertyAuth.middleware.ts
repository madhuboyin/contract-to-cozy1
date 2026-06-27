// apps/backend/src/middleware/propertyAuth.middleware.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import { HouseholdService } from '../services/household.service';
import {
  securityAuthDenialsTotal,
  securityPropertyScopeDenialsTotal,
} from '../lib/metrics';

const householdService = new HouseholdService();

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
    // Check household membership first (covers owners who have a member row + contributors/viewers)
    const member = await prisma.householdMember.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
      select: { role: true },
    });

    if (member) {
      req.property = { id: propertyId } as any;
      req.householdRole = member.role;
      return next();
    }

    // Fall back: property ownership check for users who pre-date the household feature
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true },
    });

    if (property) {
      // Auto-create the primary owner HouseholdMember row (migration path for pre-household properties)
      await householdService.ensurePrimaryOwnerMember(property.id, userId);
      req.property = property as any;
      req.householdRole = 'OWNER';
      return next();
    }

    securityPropertyScopeDenialsTotal.inc({
      source: 'property_auth_middleware',
      status_code: '404',
    });
    return res.status(404).json({ message: 'Property not found or access denied.' });
  } catch (error) {
    logger.error({ err: error }, 'Property Auth Error');
    return res
      .status(500)
      .json({ message: 'Internal server error during property authorization check.' });
  }
};
