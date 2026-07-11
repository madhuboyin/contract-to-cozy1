// apps/backend/src/services/environment/hardinessZone.service.ts
//
// USDA Plant Hardiness zone, via phzmapi.org — a free, keyless, zip-keyed
// mirror of the USDA hardiness zone dataset.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const PHZMAPI_BASE_URL = 'https://phzmapi.org';
// Hardiness zones don't change — cache generously.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface HardinessZoneData {
  zone: string;
  temperatureRangeF: string;
}

interface PhzMapiResponse {
  zone?: string;
  temperature_range?: string;
}

const cache = new TtlCache<HardinessZoneData>(CACHE_TTL_MS);

/**
 * Looks up the USDA plant hardiness zone for a zip code. Never throws —
 * returns { status: 'unavailable' } if zip is null or the fetch fails.
 */
export async function getHardinessZone(zip: string | null): Promise<SectionResult<HardinessZoneData>> {
  const cleanZip = (zip ?? '').trim();
  if (!cleanZip) {
    return { status: 'unavailable', reason: 'no_zip' };
  }

  const cached = cache.get(cleanZip);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8_000);

  try {
    const requestUrl = `${PHZMAPI_BASE_URL}/${encodeURIComponent(cleanZip)}.json`;
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      logger.error(`[ENV_HARDINESS] phzmapi returned ${res.status} for zip=${cleanZip}`);
      return { status: 'unavailable', reason: 'http_error' };
    }
    const json = (await res.json()) as PhzMapiResponse;
    if (!json?.zone) {
      return { status: 'unavailable', reason: 'malformed_response' };
    }

    const data: HardinessZoneData = {
      zone: json.zone,
      temperatureRangeF: json.temperature_range ?? '',
    };
    cache.set(cleanZip, data);
    return { status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_HARDINESS] Fetch timed out for zip=${cleanZip}`);
    } else {
      logger.error({ err: error }, `[ENV_HARDINESS] Fetch failed for zip=${cleanZip}`);
    }
    return { status: 'unavailable', reason: 'fetch_error' };
  } finally {
    clearTimeout(timeout);
  }
}
