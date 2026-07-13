// apps/backend/src/middleware/propertyAuth.middleware.ts
import { Response, NextFunction } from 'express';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import { HouseholdService } from '../services/household.service';
import {
  securityAuthDenialsTotal,
  securityPropertyScopeDenialsTotal,
} from '../lib/metrics';

const householdService = new HouseholdService();

export interface PropertyAccess {
  propertyId: string;
  role: HouseholdRole;
}

/**
 * Single source of truth for "who can access this property and at what role."
 * Used by propertyAuthMiddleware (route-level, propertyId from req.params) and
 * directly by services/controllers that already have a resolved propertyId
 * from elsewhere (query param, request body, or a related row like a task).
 * Returns null if the user has no access — callers decide the HTTP
 * status/error to surface; this function never touches req/res.
 */
export async function resolvePropertyAccess(
  userId: string,
  propertyId: string
): Promise<PropertyAccess | null> {
  // Check household membership first (covers owners who have a member row + contributors/viewers)
  const member = await prisma.householdMember.findUnique({
    where: { propertyId_userId: { propertyId, userId } },
    select: { role: true },
  });

  if (member) {
    return { propertyId, role: member.role };
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
    return { propertyId, role: 'OWNER' };
  }

  return null;
}

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
