import { prisma } from '../../../lib/prisma';

function canonicalLocationValue(locationKey: string): string {
  const separator = locationKey.indexOf(':');
  return separator >= 0 ? locationKey.slice(separator + 1) : locationKey;
}

export function propertyWhereForRadarEvent(event: {
  locationType: unknown;
  locationKey: unknown;
}): Record<string, unknown> | null {
  const locationType = String(event.locationType);
  const locationKey = String(event.locationKey);

  switch (locationType) {
    case 'property':
      return { id: canonicalLocationValue(locationKey) };
    case 'postal_code': {
      const parts = locationKey.split(':');
      const postalCode = parts.length > 1 ? parts[parts.length - 1] : locationKey;
      return {
        OR: [
          { normalizedZipCode: postalCode.trim().toUpperCase() },
          { zipCode: postalCode.trim().toUpperCase() },
        ],
      };
    }
    case 'zip':
      return { zipCode: locationKey };
    case 'city':
      return { city: { equals: locationKey, mode: 'insensitive' } };
    case 'state':
      return { state: { equals: locationKey, mode: 'insensitive' } };
    case 'county':
      return {
        OR: [
          { countyFips: locationKey },
          { county: { equals: locationKey, mode: 'insensitive' } },
        ],
      };
    case 'administrative_area': {
      const [, level, ...valueParts] = locationKey.split(':');
      const value = valueParts.join(':');
      if (level === 'state') {
        return { state: { equals: value, mode: 'insensitive' } };
      }
      if (level === 'county') {
        return {
          OR: [
            { countyFips: value },
            { county: { equals: value, mode: 'insensitive' } },
          ],
        };
      }
      return null;
    }
    case 'point':
    case 'radius':
    case 'polygon':
      // Point/radius/polygon matching belongs to HER-300's indexed PostGIS
      // implementation. Never broaden these scopes to a ZIP/city guess.
      return null;
    default:
      return null;
  }
}

export type RadarPropertyPageResult =
  | {
      outcome: 'ready';
      propertyIds: string[];
      nextCursor: string | null;
    }
  | {
      outcome: 'event_not_found' | 'revision_not_found' | 'revision_mismatch' | 'archived' | 'unsupported_geography';
      propertyIds: [];
      nextCursor: null;
    };

/**
 * Reads one stable, bounded page of property IDs. The cursor is the final
 * returned property ID, making a scan resumable without retaining worker
 * memory or opening an all-property transaction.
 */
export async function listMatchingPropertyIdsForEventPage(
  eventId: string,
  radarEventRevisionId: string,
  afterPropertyId: string | undefined,
  pageSize: number,
  dbOverride: any = prisma,
): Promise<RadarPropertyPageResult> {
  const db = dbOverride as any;
  const [event, revision] = await Promise.all([
    db.radarEvent.findUnique({ where: { id: eventId } }),
    db.radarEventRevision.findUnique({
      where: { id: radarEventRevisionId },
      select: { radarEventId: true },
    }),
  ]);
  if (!event) return { outcome: 'event_not_found', propertyIds: [], nextCursor: null };
  if (!revision) return { outcome: 'revision_not_found', propertyIds: [], nextCursor: null };
  if (revision.radarEventId !== eventId) {
    return { outcome: 'revision_mismatch', propertyIds: [], nextCursor: null };
  }
  if (event.status === 'archived') {
    return { outcome: 'archived', propertyIds: [], nextCursor: null };
  }
  const where = propertyWhereForRadarEvent(event);
  if (!where) {
    return { outcome: 'unsupported_geography', propertyIds: [], nextCursor: null };
  }

  const boundedPageSize = Math.min(500, Math.max(1, Math.trunc(pageSize)));
  const pageWhere = afterPropertyId
    ? { AND: [where, { id: { gt: afterPropertyId } }] }
    : where;
  const rows = await db.property.findMany({
    where: pageWhere,
    select: { id: true },
    orderBy: { id: 'asc' },
    take: boundedPageSize + 1,
  }) as Array<{ id: string }>;
  const hasMore = rows.length > boundedPageSize;
  const propertyIds = rows.slice(0, boundedPageSize).map((row) => row.id);
  return {
    outcome: 'ready',
    propertyIds,
    nextCursor: hasMore ? propertyIds[propertyIds.length - 1] ?? null : null,
  };
}
