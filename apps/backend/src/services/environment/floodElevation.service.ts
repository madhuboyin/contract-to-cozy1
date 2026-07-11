// apps/backend/src/services/environment/floodElevation.service.ts
//
// FEMA flood zone (National Flood Hazard Layer, ArcGIS REST point query) +
// USGS ground elevation (Elevation Point Query Service). Both free, keyless,
// lat/lon-keyed.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

// The `hazards.fema.gov/gis/nfhl/...` host referenced in older docs now 404s
// behind a WebSEAL proxy — verified live during implementation that FEMA's
// current NFHL query service is hosted here instead. Layer 28 (Flood Hazard
// Zones) confirmed present on this MapServer.
const FEMA_NFHL_FLOOD_ZONES_URL =
  'https://msc.fema.gov/arcgis/rest/services/NFHL_Print/NFHLQuery/MapServer/28/query';
const USGS_ELEVATION_URL = 'https://epqs.nationalmap.gov/v1/json';
// Flood zones and elevation are effectively static — cache for a month.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface FloodElevationData {
  femaFloodZone: string | null;
  femaZoneSubtype: string | null;
  elevationFeet: number | null;
}

interface FemaFeature {
  attributes?: { FLD_ZONE?: string; ZONE_SUBTY?: string };
}
interface FemaQueryResponse {
  features?: FemaFeature[];
}
interface UsgsElevationResponse {
  value?: number;
}

const cache = new TtlCache<FloodElevationData>(CACHE_TTL_MS);

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

async function fetchFloodZone(lat: number, lon: number): Promise<{ zone: string | null; subtype: string | null }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const url = new URL(FEMA_NFHL_FLOOD_ZONES_URL);
    url.searchParams.set('geometry', `${lon},${lat}`);
    url.searchParams.set('geometryType', 'esriGeometryPoint');
    url.searchParams.set('inSR', '4326');
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    url.searchParams.set('outFields', 'FLD_ZONE,ZONE_SUBTY');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('f', 'json');

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      logger.error(`[ENV_FLOOD] FEMA NFHL returned ${res.status} for ${lat},${lon}`);
      return { zone: null, subtype: null };
    }
    const data = (await res.json()) as FemaQueryResponse;
    const attrs = data?.features?.[0]?.attributes;
    return { zone: attrs?.FLD_ZONE ?? null, subtype: attrs?.ZONE_SUBTY ?? null };
  } catch (error: any) {
    logger.error({ err: error }, `[ENV_FLOOD] FEMA fetch failed for ${lat},${lon}`);
    return { zone: null, subtype: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const url = new URL(USGS_ELEVATION_URL);
    url.searchParams.set('x', String(lon));
    url.searchParams.set('y', String(lat));
    url.searchParams.set('units', 'Feet');
    url.searchParams.set('wkid', '4326');
    url.searchParams.set('includeDate', 'false');

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      logger.error(`[ENV_FLOOD] USGS EPQS returned ${res.status} for ${lat},${lon}`);
      return null;
    }
    const data = (await res.json()) as UsgsElevationResponse;
    return typeof data?.value === 'number' ? data.value : null;
  } catch (error: any) {
    logger.error({ err: error }, `[ENV_FLOOD] USGS fetch failed for ${lat},${lon}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns FEMA flood zone + USGS elevation for a lat/lon point. Each source
 * is fetched independently and defaults to null on failure — the section is
 * only 'unavailable' if BOTH sources fail, since either alone is still
 * useful to show.
 */
export async function getFloodElevation(lat: number, lon: number): Promise<SectionResult<FloodElevationData>> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const [flood, elevationFeet] = await Promise.all([fetchFloodZone(lat, lon), fetchElevation(lat, lon)]);

  if (flood.zone === null && elevationFeet === null) {
    return { status: 'unavailable', reason: 'both_sources_failed' };
  }

  const data: FloodElevationData = {
    femaFloodZone: flood.zone,
    femaZoneSubtype: flood.subtype,
    elevationFeet,
  };
  cache.set(key, data);
  return { status: 'ok', data, fetchedAt: new Date().toISOString() };
}
