// apps/workers/src/lib/propertyGeo.ts
import { prisma } from './prisma';
import { geocodeZip, Geo } from './geocodeZip';
import { normalizeUsZip } from '@worker-shared/modules/homeEventRadar/domain/propertyGeography';

type GeocodableProperty = {
  id: string;
  zipCode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodedZipCode: string | null;
};

async function persist(propertyId: string, zip: string, geo: Geo): Promise<void> {
  try {
    const normalizedZipCode = normalizeUsZip(zip);
    await prisma.$transaction(async (tx) => {
      await tx.propertyRadarCoverage.deleteMany({ where: { propertyId } });
      await tx.propertyRadarMatch.deleteMany({ where: { propertyId } });
      await tx.property.update({
        where: { id: propertyId },
        data: {
          latitude: geo.lat,
          longitude: geo.lon,
          geocodedZipCode: normalizedZipCode,
          normalizedZipCode,
          geocodingStatus: 'VERIFIED',
          geocodingProvider: 'open-meteo',
          geocodingVersion: 'open-meteo-geocoding-v1',
          geocodedAt: new Date(),
          geographyVersion: { increment: 1 },
        },
      });
      await tx.$executeRaw`
        UPDATE "properties"
        SET "locationPoint" = ST_SetSRID(ST_MakePoint(${geo.lon}, ${geo.lat}), 4326)::geography
        WHERE "id" = ${propertyId}
      `;
    });
  } catch {
    // Non-fatal: worst case we re-geocode this property on the next run.
  }
}

async function persistFailure(propertyId: string, zip: string): Promise<void> {
  try {
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        normalizedZipCode: normalizeUsZip(zip),
        geocodingStatus: 'FAILED',
        geocodingProvider: 'open-meteo',
        geocodingVersion: 'open-meteo-geocoding-v1',
      },
    });
  } catch {
    // A failed status write must not turn a provider miss into a job failure.
  }
}

/**
 * Resolves lat/lon for a property, preferring the value cached on the
 * Property row (populated by a prior run) over calling the geocoding API
 * again. `geocodedZipCode` is compared against the property's current
 * zipCode, so a zip change automatically invalidates the cache.
 *
 * `runCache` (in-memory, scoped to one job run) covers the case where
 * multiple properties share a not-yet-cached zip — only the first one in a
 * run calls the geocoding API; the rest reuse that result and still get it
 * persisted to their own row for future runs.
 */
export async function getPropertyGeo(
  property: GeocodableProperty,
  runCache?: Map<string, Geo | null>
): Promise<Geo | null> {
  const zip = (property.zipCode ?? '').trim();
  if (!zip) return null;

  if (
    property.geocodedZipCode === zip &&
    typeof property.latitude === 'number' &&
    typeof property.longitude === 'number'
  ) {
    return { lat: property.latitude, lon: property.longitude };
  }

  if (runCache?.has(zip)) {
    const cached = runCache.get(zip) ?? null;
    if (cached) await persist(property.id, zip, cached);
    else await persistFailure(property.id, zip);
    return cached;
  }

  const geo = await geocodeZip(zip, 'US');
  runCache?.set(zip, geo);
  if (geo) await persist(property.id, zip, geo);
  else await persistFailure(property.id, zip);
  return geo;
}
