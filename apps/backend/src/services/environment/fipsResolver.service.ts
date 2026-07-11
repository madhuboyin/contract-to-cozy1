// apps/backend/src/services/environment/fipsResolver.service.ts
//
// lat/lon -> 5-digit county FIPS code, via the Census Bureau's free, keyless
// reverse geocoder. Shared prerequisite for the Drought and Radon sections,
// which are both published keyed by county rather than by coordinate.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';

const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
// County FIPS boundaries don't change day-to-day — cache generously.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CensusCountyLayer {
  GEOID?: string;
}

interface CensusGeographiesResponse {
  result?: {
    geographies?: {
      Counties?: CensusCountyLayer[];
    };
  };
}

const cache = new TtlCache<string | null>(CACHE_TTL_MS);

/** Rounds to ~110m precision — plenty for county-level lookups, keeps cache hit rate high. */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * Resolves the 5-digit county FIPS code (state+county, e.g. "06037") for a
 * lat/lon point. Returns null on any error, timeout, or unresolvable point —
 * never throws.
 */
export async function resolveCountyFips(lat: number, lon: number): Promise<string | null> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached !== null) return cached;

  try {
    const url = new URL(CENSUS_GEOCODER_URL);
    url.searchParams.set('x', String(lon));
    url.searchParams.set('y', String(lat));
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('layers', 'Counties');
    url.searchParams.set('format', 'json');

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8_000);

    let data: CensusGeographiesResponse;
    try {
      const requestUrl = url.toString();
      await assertSafeUrl(requestUrl);
      const res = await fetch(requestUrl, { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error(`[ENV_FIPS] Census geocoder returned ${res.status} for ${lat},${lon}: ${body}`);
        return null;
      }
      data = (await res.json()) as CensusGeographiesResponse;
    } finally {
      clearTimeout(timeout);
    }

    const geoid = data?.result?.geographies?.Counties?.[0]?.GEOID ?? null;
    cache.set(key, geoid);
    return geoid;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_FIPS] Fetch timed out for ${lat},${lon}`);
    } else {
      logger.error({ err: error }, `[ENV_FIPS] Fetch failed for ${lat},${lon}`);
    }
    return null;
  }
}
