// apps/backend/src/services/environment/radonZone.service.ts
//
// EPA's radon zone map, via a live point query against EPA's own ArcGIS
// service (geodata.epa.gov) — verified live during implementation. This
// replaced an earlier design that planned to bundle EPA's ~3,100-county
// table as a static JSON lookup; querying the authoritative service
// directly is both simpler (no FIPS-resolution dependency, no manual data
// transcription/staleness risk) and more trustworthy for this
// safety-relevant, county-identified data than a hand-transcribed copy
// would have been.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const EPA_RADON_ZONE_QUERY_URL = 'https://geodata.epa.gov/arcgis/rest/services/ORD/ROE_Radon/MapServer/0/query';
// Radon zone assignments are static — cache for a month.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RadonData {
  zone: 1 | 2 | 3;
  zoneDescription: string;
  countyName: string | null;
  stateName: string | null;
}

interface EpaRadonFeature {
  attributes?: { CountyFIPS?: string; CountyName?: string; StateName?: string; RadonZone?: number };
}
interface EpaRadonQueryResponse {
  features?: EpaRadonFeature[];
}

const ZONE_DESCRIPTIONS: Record<1 | 2 | 3, string> = {
  1: 'Highest potential (predicted average indoor radon screening level > 4 pCi/L)',
  2: 'Moderate potential (predicted average 2 - 4 pCi/L)',
  3: 'Low potential (predicted average < 2 pCi/L)',
};

const cache = new TtlCache<RadonData>(CACHE_TTL_MS);

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function isValidZone(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Looks up the EPA radon zone for a lat/lon point via EPA's live ArcGIS
 * service. Never throws — returns { status: 'unavailable' } on any failure
 * or if the point doesn't intersect a known county polygon.
 */
export async function getRadonZone(lat: number, lon: number): Promise<SectionResult<RadonData>> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12_000);

  try {
    const url = new URL(EPA_RADON_ZONE_QUERY_URL);
    url.searchParams.set('geometry', `${lon},${lat}`);
    url.searchParams.set('geometryType', 'esriGeometryPoint');
    url.searchParams.set('inSR', '4326');
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    url.searchParams.set('outFields', 'CountyFIPS,CountyName,StateName,RadonZone');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('f', 'json');

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      logger.error(`[ENV_RADON] EPA radon service returned ${res.status} for ${lat},${lon}`);
      return { status: 'unavailable', reason: 'http_error' };
    }

    const data = (await res.json()) as EpaRadonQueryResponse;
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs || !isValidZone(attrs.RadonZone)) {
      return { status: 'unavailable', reason: 'no_zone_at_point' };
    }

    const result: RadonData = {
      zone: attrs.RadonZone,
      zoneDescription: ZONE_DESCRIPTIONS[attrs.RadonZone],
      countyName: attrs.CountyName ?? null,
      stateName: attrs.StateName ?? null,
    };

    cache.set(key, result);
    return { status: 'ok', data: result, fetchedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_RADON] Fetch timed out for ${lat},${lon}`);
    } else {
      logger.error({ err: error }, `[ENV_RADON] Fetch failed for ${lat},${lon}`);
    }
    return { status: 'unavailable', reason: 'fetch_error' };
  } finally {
    clearTimeout(timeout);
  }
}
