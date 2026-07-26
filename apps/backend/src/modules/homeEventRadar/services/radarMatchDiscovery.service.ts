import { prisma } from '../../../lib/prisma';
import {
  normalizeCountyFips,
  normalizeUsZip,
  propertyCoordinatesSchema,
} from '../domain/propertyGeography';
import {
  multiPolygonGeoJsonSchema,
  polygonGeoJsonSchema,
} from '../contracts';

function canonicalLocationValue(locationKey: string): string {
  const separator = locationKey.indexOf(':');
  return separator >= 0 ? locationKey.slice(separator + 1) : locationKey;
}

function normalizedFiveDigitZip(value: string): string | null {
  try {
    return normalizeUsZip(value).slice(0, 5);
  } catch {
    return null;
  }
}

function normalizedCountyFips(value: string): string | null {
  try {
    return normalizeCountyFips(value);
  } catch {
    return null;
  }
}

function cityStateWhere(locationKey: string): Record<string, unknown> | null {
  const parts = locationKey.split(':').map((value) => value.trim()).filter(Boolean);
  let state: string | undefined;
  let city: string | undefined;
  if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[0])) {
    [state, city] = [parts[0], parts.slice(1).join(':')];
  } else if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) {
    [city, state] = [parts.slice(0, -1).join(':'), parts[parts.length - 1]];
  }
  if (!state || !city) return null;
  return {
    AND: [
      { city: { equals: city, mode: 'insensitive' } },
      { state: { equals: state.toUpperCase(), mode: 'insensitive' } },
    ],
  };
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
      const postalCode = normalizedFiveDigitZip(
        parts.length > 1 ? parts[parts.length - 1] : locationKey,
      );
      if (!postalCode) return null;
      return {
        OR: [
          { normalizedZipCode: { startsWith: postalCode } },
          { zipCode: { startsWith: postalCode } },
        ],
      };
    }
    case 'zip': {
      const postalCode = normalizedFiveDigitZip(locationKey);
      if (!postalCode) return null;
      return {
        OR: [
          { normalizedZipCode: { startsWith: postalCode } },
          { zipCode: { startsWith: postalCode } },
        ],
      };
    }
    case 'city':
      return cityStateWhere(locationKey);
    case 'state':
      return /^[A-Za-z]{2}$/.test(locationKey.trim())
        ? { state: { equals: locationKey.trim().toUpperCase(), mode: 'insensitive' } }
        : null;
    case 'county': {
      const countyFips = normalizedCountyFips(locationKey);
      return countyFips ? { countyFips } : null;
    }
    case 'administrative_area': {
      const [, level, ...valueParts] = locationKey.split(':');
      const value = valueParts.join(':');
      if (level === 'state') {
        return /^[A-Za-z]{2}$/.test(value.trim())
          ? { state: { equals: value.trim().toUpperCase(), mode: 'insensitive' } }
          : null;
      }
      if (level === 'county') {
        const countyFips = normalizedCountyFips(value);
        return countyFips ? { countyFips } : null;
      }
      if (level === 'city') return cityStateWhere(value);
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

export type RadarSpatialMatchSpec =
  | { kind: 'distance'; longitude: number; latitude: number; distanceMeters: number }
  | { kind: 'polygon'; geoJson: string };

export function configuredRadarPointDistanceMeters(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.RADAR_POINT_MATCH_DISTANCE_METERS?.trim() ?? '';
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return 1_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1_000;
  return Math.min(100_000, Math.max(1, parsed));
}

export function spatialMatchSpecForRadarEvent(
  event: { locationType: unknown; geoJson?: unknown },
  env: NodeJS.ProcessEnv = process.env,
): RadarSpatialMatchSpec | null {
  const locationType = String(event.locationType);
  const geoJson = event.geoJson;
  if (locationType === 'point') {
    if (!geoJson || typeof geoJson !== 'object') return null;
    const candidate = geoJson as { type?: unknown; coordinates?: unknown };
    if (candidate.type !== 'Point' || !Array.isArray(candidate.coordinates)) return null;
    const [longitude, latitude] = candidate.coordinates;
    const coordinates = propertyCoordinatesSchema.safeParse({ latitude, longitude });
    return coordinates.success
      ? {
          kind: 'distance',
          ...coordinates.data,
          distanceMeters: configuredRadarPointDistanceMeters(env),
        }
      : null;
  }
  if (locationType === 'radius') {
    if (!geoJson || typeof geoJson !== 'object') return null;
    const candidate = geoJson as {
      type?: unknown;
      center?: unknown;
      radiusMeters?: unknown;
    };
    if (candidate.type !== 'Radius' || !Array.isArray(candidate.center)) return null;
    const [longitude, latitude] = candidate.center;
    const coordinates = propertyCoordinatesSchema.safeParse({ latitude, longitude });
    const radiusMeters = Number(candidate.radiusMeters);
    return coordinates.success
      && Number.isFinite(radiusMeters)
      && radiusMeters > 0
      && radiusMeters <= 1_000_000
      ? {
          kind: 'distance',
          ...coordinates.data,
          distanceMeters: radiusMeters,
        }
      : null;
  }
  if (locationType === 'polygon') {
    if (!geoJson || typeof geoJson !== 'object') return null;
    const parsed = (geoJson as { type?: unknown }).type === 'Polygon'
      ? polygonGeoJsonSchema.safeParse(geoJson)
      : multiPolygonGeoJsonSchema.safeParse(geoJson);
    return parsed.success
      ? { kind: 'polygon', geoJson: JSON.stringify(parsed.data) }
      : null;
  }
  return null;
}

const DISTANCE_PROPERTY_PAGE_SQL = `
  SELECT p."id"
  FROM "properties" p
  WHERE p."locationPoint" IS NOT NULL
    AND ST_DWithin(
      p."locationPoint",
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )
    AND ($4::text IS NULL OR p."id" > $4)
  ORDER BY p."id" ASC
  LIMIT $5
`;

const POLYGON_PROPERTY_PAGE_SQL = `
  SELECT p."id"
  FROM "properties" p
  WHERE p."locationPoint" IS NOT NULL
    AND ST_Covers(
      ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography,
      p."locationPoint"
    )
    AND ($2::text IS NULL OR p."id" > $2)
  ORDER BY p."id" ASC
  LIMIT $3
`;

const DISTANCE_PROPERTY_ID_SQL = `
  SELECT p."id"
  FROM "properties" p
  WHERE p."id" = $4
    AND p."locationPoint" IS NOT NULL
    AND ST_DWithin(
      p."locationPoint",
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )
  LIMIT 1
`;

const POLYGON_PROPERTY_ID_SQL = `
  SELECT p."id"
  FROM "properties" p
  WHERE p."id" = $2
    AND p."locationPoint" IS NOT NULL
    AND ST_Covers(
      ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography,
      p."locationPoint"
    )
  LIMIT 1
`;

async function spatialPropertyPage(
  spec: RadarSpatialMatchSpec,
  afterPropertyId: string | undefined,
  take: number,
  db: any,
): Promise<Array<{ id: string }>> {
  if (spec.kind === 'distance') {
    return db.$queryRawUnsafe(
      DISTANCE_PROPERTY_PAGE_SQL,
      spec.longitude,
      spec.latitude,
      spec.distanceMeters,
      afterPropertyId ?? null,
      take,
    ) as Promise<Array<{ id: string }>>;
  }
  return db.$queryRawUnsafe(
    POLYGON_PROPERTY_PAGE_SQL,
    spec.geoJson,
    afterPropertyId ?? null,
    take,
  ) as Promise<Array<{ id: string }>>;
}

/**
 * Revalidates a dispatched property against the current canonical geography.
 * This prevents a property move/geocode refresh between scan and property jobs
 * from creating a stale match.
 */
export async function radarEventMatchesPropertyId(
  event: { locationType: unknown; locationKey: unknown; geoJson?: unknown },
  propertyId: string,
  dbOverride: any = prisma,
): Promise<boolean> {
  const db = dbOverride as any;
  const spatialSpec = spatialMatchSpecForRadarEvent(event);
  if (spatialSpec?.kind === 'distance') {
    const rows = await db.$queryRawUnsafe(
      DISTANCE_PROPERTY_ID_SQL,
      spatialSpec.longitude,
      spatialSpec.latitude,
      spatialSpec.distanceMeters,
      propertyId,
    ) as Array<{ id: string }>;
    return rows.length > 0;
  }
  if (spatialSpec?.kind === 'polygon') {
    const rows = await db.$queryRawUnsafe(
      POLYGON_PROPERTY_ID_SQL,
      spatialSpec.geoJson,
      propertyId,
    ) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const where = propertyWhereForRadarEvent(event);
  if (!where) return false;
  const row = await db.property.findFirst({
    where: { AND: [where, { id: propertyId }] },
    select: { id: true },
  });
  return Boolean(row);
}

type RadarGeographyProperty = {
  id: string;
  city: string;
  state: string;
  zipCode: string;
  normalizedZipCode?: string | null;
  countyFips?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type RadarGeographicMatchExplanation = {
  matcherVersion: 'geography-v1';
  matchedAt: string;
  matchType: 'property' | 'point' | 'radius' | 'postal_code' | 'administrative_area' | 'polygon';
  confidence: 'high' | 'verified';
  distanceMeters?: number | null;
  reasons: string[];
  propertyFactsUsed: string[];
};

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const latitude1 = radians(first.latitude);
  const latitude2 = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function explainRadarGeographicMatch(
  event: { locationType: unknown; locationKey: unknown; geoJson?: unknown },
  property: RadarGeographyProperty,
  matchedAt: Date = new Date(),
): RadarGeographicMatchExplanation {
  const locationType = String(event.locationType);
  const locationKey = String(event.locationKey);
  const base = {
    matcherVersion: 'geography-v1' as const,
    matchedAt: matchedAt.toISOString(),
    confidence: 'high' as const,
  };

  if (locationType === 'property') {
    return {
      ...base,
      matchType: 'property',
      confidence: 'verified',
      reasons: [`Event is scoped to canonical property ${property.id}.`],
      propertyFactsUsed: ['property.id'],
    };
  }

  const spec = spatialMatchSpecForRadarEvent(event);
  if (spec?.kind === 'distance') {
    const propertyCoordinates = propertyCoordinatesSchema.safeParse({
      latitude: property.latitude,
      longitude: property.longitude,
    });
    const measuredDistance = propertyCoordinates.success
      ? distanceMeters(propertyCoordinates.data, spec)
      : null;
    const roundedDistance = measuredDistance === null ? null : Math.round(measuredDistance);
    const matchType = locationType === 'radius' ? 'radius' as const : 'point' as const;
    return {
      ...base,
      matchType,
      distanceMeters: roundedDistance,
      reasons: [
        roundedDistance === null
          ? `The property's indexed canonical point is within ${Math.round(spec.distanceMeters)} meters of the event.`
          : `The property's canonical point is ${roundedDistance} meters from the event, within the ${Math.round(spec.distanceMeters)} meter ${matchType} boundary.`,
      ],
      propertyFactsUsed: ['property.locationPoint'],
    };
  }
  if (spec?.kind === 'polygon') {
    return {
      ...base,
      matchType: 'polygon',
      reasons: [
        `The property's canonical point is inside or on the boundary of the event polygon.`,
      ],
      propertyFactsUsed: ['property.locationPoint'],
    };
  }

  if (locationType === 'postal_code' || locationType === 'zip') {
    const value = locationKey.split(':').at(-1) ?? locationKey;
    const zip = normalizedFiveDigitZip(value) ?? value;
    return {
      ...base,
      matchType: 'postal_code',
      reasons: [`Property ZIP ${zip} equals the event's normalized five-digit ZIP.`],
      propertyFactsUsed: ['property.normalizedZipCode'],
    };
  }

  const administrativeType = locationType === 'administrative_area'
    ? locationKey.split(':')[1]
    : locationType;
  if (administrativeType === 'county') {
    return {
      ...base,
      matchType: 'administrative_area',
      reasons: [`Property county FIPS ${property.countyFips} equals the event county FIPS.`],
      propertyFactsUsed: ['property.countyFips'],
    };
  }
  if (administrativeType === 'city') {
    return {
      ...base,
      matchType: 'administrative_area',
      reasons: [`Property city/state ${property.city}, ${property.state} equals the event city/state.`],
      propertyFactsUsed: ['property.city', 'property.state'],
    };
  }
  return {
    ...base,
    matchType: 'administrative_area',
    reasons: [`Property state ${property.state} equals the event state.`],
    propertyFactsUsed: ['property.state'],
  };
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
  const boundedPageSize = Math.min(500, Math.max(1, Math.trunc(pageSize)));
  const spatialSpec = spatialMatchSpecForRadarEvent(event);
  const where = propertyWhereForRadarEvent(event);
  if (!where && !spatialSpec) {
    return { outcome: 'unsupported_geography', propertyIds: [], nextCursor: null };
  }

  const rows = spatialSpec
    ? await spatialPropertyPage(
        spatialSpec,
        afterPropertyId,
        boundedPageSize + 1,
        db,
      )
    : await db.property.findMany({
        where: afterPropertyId
          ? { AND: [where, { id: { gt: afterPropertyId } }] }
          : where,
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
