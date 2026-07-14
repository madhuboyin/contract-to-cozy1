// apps/backend/src/modules/personalization/infrastructure/householdPropertyRepository.ts
//
// Property/household lookup helpers. The pilot intentionally has no nightly
// database-wide personalization sweep; recomputation is scoped to opted-in
// properties at interaction boundaries.
import { prisma } from '../../../lib/prisma';

/** Distinct propertyIds with a currently-active (effectiveTo: null) HouseholdProperty link. */
export async function listPropertyIdsWithActiveHouseholdLink(): Promise<string[]> {
  const links = await prisma.householdProperty.findMany({
    where: { effectiveTo: null },
    distinct: ['propertyId'],
    select: { propertyId: true },
  });
  return links.map((l) => l.propertyId);
}
