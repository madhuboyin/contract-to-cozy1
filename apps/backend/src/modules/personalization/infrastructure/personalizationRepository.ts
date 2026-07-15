import { prisma } from '../../../lib/prisma';

export const HOUSEHOLD_PROFILE_CONSENT_VERSION = 'personalization-household-profile-v1';

export async function findHouseholdForPropertyOwner(propertyId: string, ownerUserId: string) {
  return prisma.household.findFirst({
    where: {
      ownerUserId,
      properties: { some: { propertyId, effectiveTo: null } },
    },
    select: { id: true, consentVersion: true, consentedAt: true },
  });
}

export async function findConsentedHouseholdForProperty(propertyId: string, ownerUserId: string) {
  return prisma.household.findFirst({
    where: {
      ownerUserId,
      consentVersion: { not: null },
      properties: { some: { propertyId, effectiveTo: null } },
    },
    select: { id: true, consentVersion: true, consentedAt: true },
  });
}

export async function enableHouseholdProfile(propertyId: string, ownerUserId: string) {
  return prisma.$transaction(async (db) => {
    let household = await db.household.findFirst({
      where: {
        ownerUserId,
        properties: { some: { propertyId, effectiveTo: null } },
      },
      select: { id: true },
    });

    if (!household) {
      household = await db.household.create({
        data: {
          ownerUserId,
          properties: { create: { propertyId, occupancyType: 'PRIMARY' } },
        },
        select: { id: true },
      });
    }

    return db.household.update({
      where: { id: household.id },
      data: { consentVersion: HOUSEHOLD_PROFILE_CONSENT_VERSION, consentedAt: new Date() },
      select: { id: true, consentVersion: true, consentedAt: true },
    });
  });
}

export async function listActivePersonalizationRecommendations(propertyId: string) {
  return prisma.personalizedRecommendation.findMany({
    where: { propertyId, status: 'ACTIVE' },
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

export async function listActiveRecommendationsForModule(
  propertyId: string,
  take = 25,
) {
  return prisma.personalizedRecommendation.findMany({
    where: { propertyId, status: 'ACTIVE' },
    orderBy: [{ score: 'desc' }, { firstEligibleAt: 'desc' }],
    take: Math.min(Math.max(take, 1), 25),
    select: {
      id: true,
      status: true,
      score: true,
      priorityBand: true,
      confidence: true,
      expiresAt: true,
      definition: { select: { code: true, category: true } },
      explanations: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { headline: true, reasonCodes: true },
      },
    },
  });
}

export async function loadActiveRecommendationForAction(
  recommendationId: string,
  propertyId: string,
) {
  return prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationId, propertyId, status: 'ACTIVE' },
    select: {
      id: true,
      definition: { select: { code: true } },
      explanations: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { headline: true, reasonCodes: true },
      },
    },
  });
}

export async function recommendationBelongsToProperty(
  recommendationId: string,
  propertyId: string,
): Promise<boolean> {
  const row = await prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationId, propertyId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function resetHouseholdProfile(propertyId: string, ownerUserId: string): Promise<boolean> {
  const household = await findHouseholdForPropertyOwner(propertyId, ownerUserId);
  if (!household) return false;

  // Profile answers and the property link cascade with the Household.
  // Property-owned traits, recommendations and suppressions survive reset.
  await prisma.household.delete({ where: { id: household.id } });
  return true;
}
