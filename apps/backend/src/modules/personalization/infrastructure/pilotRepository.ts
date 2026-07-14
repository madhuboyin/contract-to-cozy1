import { prisma } from '../../../lib/prisma';

export const HOUSEHOLD_PROFILE_CONSENT_VERSION = 'personalization-household-profile-v1';

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

export async function findPilotHouseholdForProperty(propertyId: string) {
  return prisma.household.findFirst({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      consentVersion: { not: null },
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
      data: { consentVersion: HOUSEHOLD_PROFILE_CONSENT_VERSION, consentedAt: new Date() },
      select: { id: true, consentVersion: true, consentedAt: true },
    });
  });
}

function householdRecommendationScope(householdId?: string | null) {
  return householdId
    ? { OR: [{ householdId: null }, { householdId }] }
    : { householdId: null };
}

export async function listActivePilotRecommendations(propertyId: string, householdId?: string | null) {
  return prisma.personalizedRecommendation.findMany({
    where: { propertyId, status: 'ACTIVE', ...householdRecommendationScope(householdId) },
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
  householdId?: string | null,
  take = 25,
) {
  return prisma.personalizedRecommendation.findMany({
    where: { propertyId, status: 'ACTIVE', ...householdRecommendationScope(householdId) },
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
  householdId?: string | null,
) {
  return prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationId, propertyId, status: 'ACTIVE', ...householdRecommendationScope(householdId) },
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
  householdId?: string | null,
): Promise<boolean> {
  const row = await prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationId, propertyId, ...householdRecommendationScope(householdId) },
    select: { id: true },
  });
  return Boolean(row);
}

export async function resetPilotHousehold(propertyId: string, ownerUserId: string): Promise<boolean> {
  const household = await findPilotHousehold(propertyId, ownerUserId);
  if (!household) return false;

  // Reset removes only optional household-profile data and any future outputs
  // explicitly owned by that profile. Default property-only recommendations
  // have householdId = null and intentionally survive this operation.
  await prisma.$transaction(async (db) => {
    await db.personalizedRecommendation.deleteMany({
      where: { propertyId, householdId: household.id },
    });
    await db.recommendationSuppression.deleteMany({
      where: { propertyId, householdId: household.id },
    });
    await db.household.delete({ where: { id: household.id } });
  });
  return true;
}
