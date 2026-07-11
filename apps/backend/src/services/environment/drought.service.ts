// apps/backend/src/services/environment/drought.service.ts
//
// US Drought Monitor (USDM) D0-D4 severity progression for a county, via
// the free, keyless USDM Data Services REST API. Keyed by 5-digit county
// FIPS code — see fipsResolver.service.ts for lat/lon -> FIPS resolution.
// USDM publishes weekly, every Thursday.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const USDM_URL =
  'https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — USDM only updates weekly, but keep in step with other daily sections
const HISTORY_WEEKS = 12;

export type DroughtCategory = 'None' | 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

export interface DroughtWeekPoint {
  date: string;
  dominantCategory: DroughtCategory;
  /** Percent of the county area in each category or worse, as published by USDM. */
  percentArea: Record<DroughtCategory, number>;
}

export interface DroughtData {
  current: DroughtWeekPoint | null;
  history: DroughtWeekPoint[];
}

// USDM's API returns CSV by default; sending `Accept: application/json`
// switches it to JSON with these camelCase field names (verified live).
interface UsdmRecord {
  validStart: string;
  none: number;
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
}

const cache = new TtlCache<DroughtData>(CACHE_TTL_MS);

function mmddyyyy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function dominantCategory(percentArea: Record<DroughtCategory, number>): DroughtCategory {
  // USDM percentages are cumulative (D1 includes D2-D4 etc.) — the most
  // severe category with non-trivial area present is the dominant one.
  const order: DroughtCategory[] = ['D4', 'D3', 'D2', 'D1', 'D0'];
  for (const cat of order) {
    if (percentArea[cat] >= 1) return cat;
  }
  return 'None';
}

function toWeekPoint(rec: UsdmRecord): DroughtWeekPoint {
  const percentArea: Record<DroughtCategory, number> = {
    None: rec.none,
    D0: rec.d0,
    D1: rec.d1,
    D2: rec.d2,
    D3: rec.d3,
    D4: rec.d4,
  };
  return { date: rec.validStart.slice(0, 10), dominantCategory: dominantCategory(percentArea), percentArea };
}

/**
 * Returns current + recent-weeks drought severity for a county FIPS code.
 * Never throws — returns { status: 'unavailable' } if fips is null or the
 * fetch fails.
 */
export async function getDrought(countyFips: string | null): Promise<SectionResult<DroughtData>> {
  if (!countyFips) {
    return { status: 'unavailable', reason: 'fips_unresolved' };
  }

  const cached = cache.get(countyFips);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8_000);

  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - HISTORY_WEEKS * 7);

    const url = new URL(USDM_URL);
    url.searchParams.set('aoi', countyFips);
    url.searchParams.set('startdate', mmddyyyy(start));
    url.searchParams.set('enddate', mmddyyyy(end));
    url.searchParams.set('statisticsType', '1');

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(`[ENV_DROUGHT] USDM returned ${res.status} for fips=${countyFips}: ${body}`);
      return { status: 'unavailable', reason: 'http_error' };
    }

    const records = (await res.json()) as UsdmRecord[];
    if (!Array.isArray(records) || records.length === 0) {
      return { status: 'unavailable', reason: 'no_data' };
    }

    const history = records.map(toWeekPoint).sort((a, b) => a.date.localeCompare(b.date));
    const current = history[history.length - 1] ?? null;

    const data: DroughtData = { current, history };
    cache.set(countyFips, data);
    return { status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_DROUGHT] Fetch timed out for fips=${countyFips}`);
    } else {
      logger.error({ err: error }, `[ENV_DROUGHT] Fetch failed for fips=${countyFips}`);
    }
    return { status: 'unavailable', reason: 'fetch_error' };
  } finally {
    clearTimeout(timeout);
  }
}
