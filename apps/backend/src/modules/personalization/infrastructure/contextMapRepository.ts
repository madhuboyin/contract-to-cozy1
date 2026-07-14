import { prisma } from '../../../lib/prisma';

/**
 * Loads only the current, property-relevant records needed by the Phase 4
 * transparency facade. Property-derived traits and property recommendations
 * are loaded regardless of optional-profile consent. Optional answers are
 * loaded only from the authenticated owner's consented Household.
 */
export async function loadHouseholdContextMapData(propertyId: string, ownerUserId: string) {
  const household = await prisma.household.findFirst({
    where: {
      ownerUserId,
      consentVersion: { not: null },
      properties: { some: { propertyId, effectiveTo: null } },
    },
    select: {
      id: true,
      consentVersion: true,
      consentedAt: true,
      properties: {
        where: { propertyId },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
        select: { occupancyType: true, effectiveFrom: true, effectiveTo: true },
      },
      profileAnswers: {
        where: { action: 'ANSWERED' },
        orderBy: { createdAt: 'asc' },
        select: {
          answerJson: true,
          createdAt: true,
          question: { select: { code: true, prompt: true } },
        },
      },
    },
  });
  const [derivedTraits, recommendations] = await Promise.all([
    prisma.derivedTrait.findMany({
      where: {
        propertyId,
      },
      orderBy: { traitKey: 'asc' },
      select: {
        traitKey: true,
        valueJson: true,
        source: true,
        computedAt: true,
      },
    }),
    prisma.personalizedRecommendation.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
      },
      orderBy: [{ score: 'desc' }, { firstEligibleAt: 'desc' }],
      select: {
        status: true,
        firstEligibleAt: true,
        expiresAt: true,
        definition: { select: { code: true } },
      },
    }),
  ]);
  const publicHousehold = household
    ? (({ id: _householdId, ...profile }) => profile)(household)
    : null;
  return {
    source: publicHousehold ? 'USER_INPUT' : null,
    consentVersion: publicHousehold?.consentVersion ?? null,
    consentedAt: publicHousehold?.consentedAt ?? null,
    properties: publicHousehold?.properties ?? [],
    profileAnswers: publicHousehold?.profileAnswers ?? [],
    derivedTraits,
    recommendations,
  };
}

export type HouseholdContextMapData = NonNullable<Awaited<ReturnType<typeof loadHouseholdContextMapData>>>;
