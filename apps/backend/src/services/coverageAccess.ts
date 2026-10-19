import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { getPropertyRoleReadOnly, ROLE_RANK } from './propertyAccess.service';

/**
 * The one authorization rule for coverage, enforced in every coverage service whatever route or caller reaches it. Access is household
 * membership at a declared floor, never the primary homeowner account:
 *   - reading a review, a comparison, or an analysis: VIEWER
 *   - generating a review, starting a comparison, adding a quote, running or simulating an analysis: CONTRIBUTOR
 *   - recording a final coverage decision: OWNER
 * A caller with no access gets the same not-found a missing property would, so another home's existence is not revealed.
 */
export const COVERAGE_ROLE_FLOORS = {
  READ: 'VIEWER',
  START_OR_CHANGE: 'CONTRIBUTOR',
  FINAL_DECISION: 'OWNER',
} as const satisfies Record<string, HouseholdRole>;

export async function requireCoverageRole(propertyId: string, userId: string, minimum: HouseholdRole): Promise<HouseholdRole> {
  const role = await getPropertyRoleReadOnly(prisma, userId, propertyId);
  if (!role) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
    throw new APIError(`This action requires the ${minimum} role for the property.`, 403, 'PROPERTY_ROLE_REQUIRED');
  }
  return role;
}
