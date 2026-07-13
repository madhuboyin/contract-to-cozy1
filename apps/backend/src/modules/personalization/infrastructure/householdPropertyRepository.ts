// apps/backend/src/modules/personalization/infrastructure/householdPropertyRepository.ts
//
// Used by the nightly shadow-sweep job (apps/workers/src/jobs/personalizationShadowSweep.job.ts)
// to enumerate which properties currently have an active household context,
// rather than sweeping every Property row in the database.
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
