// apps/workers/src/lib/paginateProperties.ts
import { prisma } from './prisma';

export type PropertyForGeoJobs = {
  id: string;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  countyFips: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedZipCode: string | null;
};

const DEFAULT_BATCH_SIZE = 500;

/**
 * Cursor-paginated generator over every property in the portfolio. Jobs that
 * scan the whole portfolio (freeze-risk, severe-weather-alerts) should use
 * this instead of a single findMany({ take: N }) — a fixed page size silently
 * stops covering the tail of the portfolio once property count exceeds it.
 */
export async function* iterateAllProperties(
  batchSize = DEFAULT_BATCH_SIZE
): AsyncGenerator<PropertyForGeoJobs> {
  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.property.findMany({
      select: {
        id: true,
        address: true,
        zipCode: true,
        city: true,
        state: true,
        countyFips: true,
        latitude: true,
        longitude: true,
        geocodedZipCode: true,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (batch.length === 0) return;

    for (const property of batch) {
      yield property;
    }

    if (batch.length < batchSize) return;
    cursor = batch[batch.length - 1].id;
  }
}
