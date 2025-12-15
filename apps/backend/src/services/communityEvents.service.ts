import { prisma } from '../lib/prisma';

export async function getCommunityEventsForProperty(params: {
  propertyId: string;
  limit?: number;
}) {
  const { propertyId, limit = 3 } = params;

  // Resolve property -> city/state
  const property = await (prisma as any).property.findUnique({
    where: { id: propertyId },
    select: { city: true, state: true }
  });

  if (!property) {
    const err = new Error('Property not found');
    (err as any).statusCode = 404;
    throw err;
  }

  // Feature flag gate (city-level)
  const flag = await prisma.cityFeatureFlag.findUnique({
    where: { city_state: { city: property.city, state: property.state } }
  });

  if (!flag?.eventsEnabled) {
    return [];
  }

  // Query cached events
  const events = await prisma.communityEvent.findMany({
    where: {
      city: property.city,
      state: property.state,
      isActive: true,
      startTime: { gte: new Date() }
    },
    orderBy: { startTime: 'asc' },
    take: limit
  });

  return events;
}
