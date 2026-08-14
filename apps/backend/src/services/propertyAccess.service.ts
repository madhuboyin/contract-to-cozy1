// apps/backend/src/services/propertyAccess.service.ts
//
// Pure property-access resolution — deliberately free of Express types so it
// can be shared by the Express backend (propertyAuth.middleware.ts) and the
// workers process (PropertyMaintenanceTask.service.ts, background jobs)
// without pulling Express into the workers Docker build, which has no
// Express dependency at all.

import { HouseholdRole } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const ROLE_RANK: Record<HouseholdRole, number> = {
  VIEWER: 0,
  CONTRIBUTOR: 1,
  OWNER: 2,
};

export interface PropertyAccess {
  propertyId: string;
  role: HouseholdRole;
  isPrimaryOwner?: boolean;
}

/**
 * Single source of truth for "who can access this property and at what role."
 * Used by propertyAuthMiddleware (route-level, propertyId from req.params) and
 * directly by services/workers that already have a resolved propertyId from
 * elsewhere (query param, request body, or a related row like a task).
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
    select: { role: true, isPrimaryOwner: true },
  });

  if (member) {
    return {
      propertyId,
      role: member.role,
      ...(typeof member.isPrimaryOwner === 'boolean' ? { isPrimaryOwner: member.isPrimaryOwner } : {}),
    };
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
    await prisma.householdMember.upsert({
      where: { propertyId_userId: { propertyId, userId } },
      create: {
        propertyId,
        userId,
        role: 'OWNER',
        isPrimaryOwner: true,
        joinedAt: new Date(),
      },
      update: {},
      select: { id: true },
    });
    return { propertyId, role: 'OWNER', isPrimaryOwner: true };
  }

  return null;
}
