import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

type PersonalizationDb = typeof prisma | Prisma.TransactionClient;

export interface HouseholdConsent {
  consentVersion: string | null;
  consentedAt: Date | null;
}

/** Consent is checked in the same transaction that records an answer. */
export async function getHouseholdConsentForPropertyOwner(
  householdId: string,
  propertyId: string,
  ownerUserId: string,
  db: PersonalizationDb = prisma,
): Promise<HouseholdConsent | null> {
  return db.household.findFirst({
    where: {
      id: householdId,
      ownerUserId,
      properties: { some: { propertyId, effectiveTo: null } },
    },
    select: { consentVersion: true, consentedAt: true },
  });
}
