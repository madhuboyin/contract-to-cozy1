// apps/backend/src/services/homeRecordsAccess.ts
//
// Record-level authorization for Home Records, in one place. Property-level access (requireHouseholdRole) says who may act on a home; it does
// not say which records a member may see. Reads have always applied the visibility rule below, and every mutation and extraction entry point
// must apply the same rule, so a member can never change, link, analyze or promote a record they could not read (and never learns that it
// exists: an invisible record is "not found", exactly as it is on the read paths).
import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

/** The records a household role may see. Only owners see owner-only records; every other role sees household records. */
export function visibleRecordWhere(role: HouseholdRole) {
  return role === 'OWNER' ? {} : { visibility: 'HOUSEHOLD' as const };
}

/** The one role-aware record lookup: throws a plain not-found (no existence leak) when the record is missing or not visible to this role. */
export async function assertRecordVisible(propertyId: string, recordId: string, role: HouseholdRole): Promise<void> {
  const record = await prisma.propertyRecord.findFirst({
    where: { id: recordId, propertyId, ...visibleRecordWhere(role) },
    select: { id: true },
  });
  if (!record) throw new APIError('Record not found.', 404, 'PROPERTY_RECORD_NOT_FOUND');
}

/**
 * The visibilities a record can be created with. RECIPIENT_SELECTED is in the schema enum but has no recipient model behind it (no recipient
 * identity, grant, acceptance, expiry, access log or revocation), so the read rule treats it as owner-only: offering it would let a contributor
 * lock themselves out of their own upload while no intended recipient could ever see it. It is refused until that foundation exists.
 */
export const SELECTABLE_RECORD_VISIBILITIES = ['HOUSEHOLD', 'OWNER_ONLY'] as const;

export function assertVisibilitySelectable(visibility: string): void {
  if (!(SELECTABLE_RECORD_VISIBILITIES as readonly string[]).includes(visibility)) {
    throw new APIError(
      'Recipient-selected visibility is not available yet. Choose Household or Owner only.',
      422,
      'PROPERTY_RECORD_VISIBILITY_UNSUPPORTED',
    );
  }
}
