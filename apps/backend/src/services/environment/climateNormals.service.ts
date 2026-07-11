// apps/backend/src/services/environment/climateNormals.service.ts
//
// NOAA NCEI 1991-2020 Climate Normals (monthly avg/max/min temperature +
// heating/cooling degree days), via the CDO Web API v2. Requires a free
// token (NOAA_NCEI_TOKEN — request at https://www.ncdc.noaa.gov/cdo-web/token)
// and a nearest-station resolution step, since normals are published per
// station, not per coordinate.
//
// KNOWN GAP: first/last frost date normals are not implemented — NOAA
// publishes these as percentile datatypes on the NORMAL_ANN dataset (e.g.
// "last spring freeze" at various probability thresholds) whose exact
// datatype ids weren't confidently known at implementation time. Rather than
// guess and risk silently wrong dates, frostDates stays null until sourced.
// Everything else in this section is fetched live and is accurate as long
// as NOAA's API contract matches what's implemented here.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const CDO_BASE_URL = 'https://www.ncei.noaa.gov/cdo-web/api/v2';
const STATION_SEARCH_RADIUS_DEG = 0.75;
// Climate normals (10-year averages) are effectively static.
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface MonthlyNormal {
  month: number; // 1-12
  avgTempF: number | null;
  avgHighF: number | null;
  avgLowF: number | null;
}

export interface ClimateNormalsData {
  stationId: string;
  stationName: string;
  monthly: MonthlyNormal[];
  annualHeatingDegreeDays: number | null;
  annualCoolingDegreeDays: number | null;
  firstFrostDate: null; // not yet sourced — see file header
  lastFrostDate: null; // not yet sourced — see file header
}

interface NcdcStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}
interface NcdcStationsResponse {
  results?: NcdcStation[];
}
interface NcdcDataPoint {
  date: string;
  datatype: string;
  station: string;
  value: number;
}
interface NcdcDataResponse {
  results?: NcdcDataPoint[];
}

const stationCache = new TtlCache<NcdcStation | null>(CACHE_TTL_MS);
const normalsCache = new TtlCache<ClimateNormalsData>(CACHE_TTL_MS);

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function cdoFetch<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const url = new URL(`${CDO_BASE_URL}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal, headers: { token } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(`[ENV_CLIMATE] NCEI ${path} returned ${res.status}: ${body}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_CLIMATE] NCEI ${path} fetch timed out`);
    } else {
      logger.error({ err: error }, `[ENV_CLIMATE] NCEI ${path} fetch failed`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveNearestStation(lat: number, lon: number, token: string): Promise<NcdcStation | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = stationCache.get(key);
  if (cached !== null) return cached;

  const extent = [
    lat - STATION_SEARCH_RADIUS_DEG,
    lon - STATION_SEARCH_RADIUS_DEG,
    lat + STATION_SEARCH_RADIUS_DEG,
    lon + STATION_SEARCH_RADIUS_DEG,
  ].join(',');

  const data = await cdoFetch<NcdcStationsResponse>(
    '/stations',
    { datasetid: 'NORMAL_MLY', extent, limit: '25' },
    token
  );

  const candidates = data?.results ?? [];
  if (candidates.length === 0) {
    stationCache.set(key, null);
    return null;
  }

  const nearest = candidates.reduce((best, s) => {
    const d = haversineMiles(lat, lon, s.latitude, s.longitude);
    return d < best.distance ? { station: s, distance: d } : best;
  }, { station: candidates[0], distance: haversineMiles(lat, lon, candidates[0].latitude, candidates[0].longitude) }).station;

  stationCache.set(key, nearest);
  return nearest;
}

const MONTHLY_DATATYPES = ['MLY-TAVG-NORMAL', 'MLY-TMAX-NORMAL', 'MLY-TMIN-NORMAL', 'MLY-HTDD-NORMAL', 'MLY-CLDD-NORMAL'];

/**
 * Returns monthly temperature normals + annual heating/cooling degree days
 * for the nearest NOAA station to a lat/lon point. Never throws — returns
 * { status: 'unavailable' } if NOAA_NCEI_TOKEN is unset, no station is found,
 * or the fetch fails.
 */
export async function getClimateNormals(lat: number, lon: number): Promise<SectionResult<ClimateNormalsData>> {
  const token = process.env.NOAA_NCEI_TOKEN;
  if (!token) {
    return { status: 'unavailable', reason: 'noaa_token_not_configured' };
  }
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = normalsCache.get(cacheKey);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const station = await resolveNearestStation(lat, lon, token);
  if (!station) {
    return { status: 'unavailable', reason: 'no_station_found' };
  }

  // Normals are stored against a fixed placeholder year (2010) — the year
  // itself is not meaningful, only the month.
  const data = await cdoFetch<NcdcDataResponse>(
    '/data',
    {
      datasetid: 'NORMAL_MLY',
      stationid: station.id,
      startdate: '2010-01-01',
      enddate: '2010-12-01',
      datatypeid: MONTHLY_DATATYPES.join(','),
      units: 'standard',
      limit: '1000',
    },
    token
  );

  const points = data?.results ?? [];
  if (points.length === 0) {
    return { status: 'unavailable', reason: 'no_normals_data' };
  }

  const byMonth = new Map<number, Partial<Record<(typeof MONTHLY_DATATYPES)[number], number>>>();
  for (const p of points) {
    const month = new Date(p.date).getUTCMonth() + 1;
    if (!byMonth.has(month)) byMonth.set(month, {});
    byMonth.get(month)![p.datatype as (typeof MONTHLY_DATATYPES)[number]] = p.value;
  }

  const monthly: MonthlyNormal[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const v = byMonth.get(m) ?? {};
    return {
      month: m,
      avgTempF: v['MLY-TAVG-NORMAL'] ?? null,
      avgHighF: v['MLY-TMAX-NORMAL'] ?? null,
      avgLowF: v['MLY-TMIN-NORMAL'] ?? null,
    };
  });

  const sumIfComplete = (key: 'MLY-HTDD-NORMAL' | 'MLY-CLDD-NORMAL'): number | null => {
    const values = Array.from(byMonth.values()).map(v => v[key]);
    if (values.some(v => typeof v !== 'number')) return null;
    return (values as number[]).reduce((a, b) => a + b, 0);
  };

  const result: ClimateNormalsData = {
    stationId: station.id,
    stationName: station.name,
    monthly,
    annualHeatingDegreeDays: sumIfComplete('MLY-HTDD-NORMAL'),
    annualCoolingDegreeDays: sumIfComplete('MLY-CLDD-NORMAL'),
    firstFrostDate: null,
    lastFrostDate: null,
  };

  normalsCache.set(cacheKey, result);
  return { status: 'ok', data: result, fetchedAt: new Date().toISOString() };
}
