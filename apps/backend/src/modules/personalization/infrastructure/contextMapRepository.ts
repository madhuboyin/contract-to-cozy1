import { prisma } from '../../../lib/prisma';

/**
 * Loads only the current, property-relevant records needed by the Phase 4
 * transparency facade. One household identifier is used internally to scope
 * outputs, then removed; database identifiers and raw evidence are never part
 * of the public context-map contract.
 */
export async function loadHouseholdContextMapData(propertyId: string) {
  const household = await prisma.household.findFirst({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        consentVersion: { not: null },
        properties: { some: { propertyId, effectiveTo: null } },
      },
      select: {
      id: true,
      status: true,
      source: true,
      consentVersion: true,
      consentedAt: true,
      properties: {
        where: { propertyId },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
        select: { occupancyType: true, effectiveFrom: true, effectiveTo: true },
      },
      members: {
        where: { status: 'ACTIVE' },
        orderBy: [{ type: 'asc' }, { lifeStage: 'asc' }],
        select: { type: true, lifeStage: true, count: true, source: true, createdAt: true },
      },
      pets: {
        where: {
          status: 'ACTIVE',
          OR: [{ propertyId: null }, { propertyId }],
        },
        orderBy: [{ petType: 'asc' }, { createdAt: 'asc' }],
        select: {
          petType: true,
          count: true,
          sizeBand: true,
          sheddingLevel: true,
          indoorOutdoor: true,
          yardFenceDependent: true,
          createdAt: true,
        },
      },
      goals: {
        where: {
          status: 'ACTIVE',
          OR: [{ propertyId: null }, { propertyId }],
        },
        orderBy: [{ priority: 'desc' }, { goalCode: 'asc' }],
        select: { goalCode: true, priority: true, horizon: true, source: true, createdAt: true },
      },
      preferences: {
        where: {
          status: 'ACTIVE',
          OR: [{ propertyId: null }, { propertyId }],
        },
        orderBy: { key: 'asc' },
        select: { key: true, valueJson: true, createdAt: true },
      },
      lifestyleAttributes: {
        where: {
          status: 'ACTIVE',
          source: 'EXPLICIT',
          OR: [{ propertyId: null }, { propertyId }],
        },
        orderBy: { key: 'asc' },
        select: {
          key: true,
          source: true,
          confidence: true,
          valueBoolean: true,
          valueNumber: true,
          valueText: true,
          valueCode: true,
          valueDate: true,
          valueJson: true,
          createdAt: true,
        },
      },
      derivedTraits: {
        where: {
          propertyId,
          overriddenAt: null,
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
        orderBy: { traitKey: 'asc' },
        select: {
          traitKey: true,
          valueJson: true,
          source: true,
          confidence: true,
          computedAt: true,
          validUntil: true,
        },
      },
      },
  });
  if (!household) return null;

  const recommendations = await prisma.personalizedRecommendation.findMany({
      where: {
        propertyId,
        status: 'ACTIVE',
        OR: [{ householdId: null }, { householdId: household.id }],
      },
      orderBy: [{ score: 'desc' }, { firstEligibleAt: 'desc' }],
      select: {
        status: true,
        firstEligibleAt: true,
        expiresAt: true,
        definition: { select: { code: true } },
      },
  });
  const { id: _householdId, ...publicHousehold } = household;
  return { ...publicHousehold, recommendations };
}

export type HouseholdContextMapData = NonNullable<Awaited<ReturnType<typeof loadHouseholdContextMapData>>>;
