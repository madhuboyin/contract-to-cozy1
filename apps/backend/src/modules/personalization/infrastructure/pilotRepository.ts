import { prisma } from '../../../lib/prisma';

export const PILOT_CONSENT_VERSION = 'personalization-pilot-v1';

export async function findPilotHousehold(propertyId: string, ownerUserId: string) {
  return prisma.household.findFirst({
    where: {
      ownerUserId,
      status: 'ACTIVE',
      deletedAt: null,
      properties: { some: { propertyId, effectiveTo: null } },
    },
    select: { id: true, consentVersion: true, consentedAt: true },
  });
}

export async function optInPilotHousehold(propertyId: string, ownerUserId: string) {
  return prisma.$transaction(async (db) => {
    let household = await db.household.findFirst({
      where: {
        ownerUserId,
        status: 'ACTIVE',
        deletedAt: null,
        properties: { some: { propertyId, effectiveTo: null } },
      },
      select: { id: true },
    });

    if (!household) {
      household = await db.household.create({
        data: {
          ownerUserId,
          source: 'USER_CREATED',
          properties: { create: { propertyId, occupancyType: 'PRIMARY' } },
        },
        select: { id: true },
      });
    }

    return db.household.update({
      where: { id: household.id },
      data: { consentVersion: PILOT_CONSENT_VERSION, consentedAt: new Date() },
      select: { id: true, consentVersion: true, consentedAt: true },
    });
  });
}

export async function listActivePilotRecommendations(propertyId: string, householdId: string) {
  return prisma.personalizedRecommendation.findMany({
    where: { propertyId, householdId, status: 'ACTIVE' },
    orderBy: [{ score: 'desc' }, { firstEligibleAt: 'desc' }],
    take: 3,
    select: {
      id: true,
      status: true,
      score: true,
      priorityBand: true,
      confidence: true,
      firstEligibleAt: true,
      definition: { select: { code: true, category: true } },
      explanations: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { headline: true, reasonCodes: true, evidenceJson: true },
      },
    },
  });
}

export async function recommendationBelongsToProperty(
  recommendationId: string,
  propertyId: string,
  householdId: string,
): Promise<boolean> {
  const row = await prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationId, propertyId, householdId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function resetPilotHousehold(propertyId: string, ownerUserId: string): Promise<boolean> {
  const household = await findPilotHousehold(propertyId, ownerUserId);
  if (!household) return false;

  // Pilot reset is intentionally complete and understandable: remove both
  // household-owned rows and property-scoped outputs that use nullable
  // household foreign keys before deleting the aggregate.
  await prisma.$transaction(async (db) => {
    await db.personalizedRecommendation.deleteMany({
      where: { propertyId, householdId: household.id },
    });
    await db.recommendationSuppression.deleteMany({
      where: { propertyId, householdId: household.id },
    });
    await db.traitSnapshot.deleteMany({ where: { propertyId, householdId: household.id } });
    await db.derivedTrait.deleteMany({ where: { propertyId, householdId: household.id } });
    await db.household.delete({ where: { id: household.id } });
  });
  return true;
}
