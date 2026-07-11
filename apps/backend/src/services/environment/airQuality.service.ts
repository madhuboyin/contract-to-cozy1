// apps/backend/src/services/environment/airQuality.service.ts
//
// Current AQI/PM2.5 + a 30-day daily-average history, via Open-Meteo's free,
// keyless Air Quality API.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface AirQualityCurrent {
  aqi: number;
  pm2_5: number;
  pm10: number;
  observedAt: string;
}

export interface AirQualityHistoryPoint {
  date: string;
  avgAqi: number;
  avgPm2_5: number;
}

export interface AirQualityData {
  current: AirQualityCurrent;
  history: AirQualityHistoryPoint[];
}

interface OpenMeteoAirQualityResponse {
  current?: {
    us_aqi: number;
    pm2_5: number;
    pm10: number;
    time: string;
  };
  hourly?: {
    time: string[];
    us_aqi: number[];
    pm2_5: number[];
  };
}

const cache = new TtlCache<AirQualityData>(CACHE_TTL_MS);

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Collapses hourly points into one average-per-day point for a compact history chart. */
function toDailyHistory(time: string[], aqi: number[], pm2_5: number[]): AirQualityHistoryPoint[] {
  const byDate = new Map<string, { aqi: number[]; pm2_5: number[] }>();
  time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, { aqi: [], pm2_5: [] });
    const bucket = byDate.get(date)!;
    if (typeof aqi[i] === 'number') bucket.aqi.push(aqi[i]);
    if (typeof pm2_5[i] === 'number') bucket.pm2_5.push(pm2_5[i]);
  });

  return Array.from(byDate.entries())
    .filter(([, v]) => v.aqi.length > 0)
    .map(([date, v]) => ({ date, avgAqi: Math.round(average(v.aqi)), avgPm2_5: Math.round(average(v.pm2_5) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Returns current + 30-day daily-average air quality for a lat/lon point.
 * Never throws — returns { status: 'unavailable' } on any failure.
 */
export async function getAirQuality(lat: number, lon: number): Promise<SectionResult<AirQualityData>> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8_000);

  try {
    const url = new URL(AIR_QUALITY_URL);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'us_aqi,pm2_5,pm10');
    url.searchParams.set('hourly', 'us_aqi,pm2_5');
    url.searchParams.set('past_days', '30');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'auto');

    let data: OpenMeteoAirQualityResponse;
    try {
      const requestUrl = url.toString();
      await assertSafeUrl(requestUrl);
      const res = await fetch(requestUrl, { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error(`[ENV_AIR_QUALITY] returned ${res.status} for ${lat},${lon}: ${body}`);
        return { status: 'unavailable', reason: 'http_error' };
      }
      data = (await res.json()) as OpenMeteoAirQualityResponse;
    } finally {
      clearTimeout(timeout);
    }

    if (!data?.current || !data.hourly) {
      return { status: 'unavailable', reason: 'malformed_response' };
    }

    const result: AirQualityData = {
      current: {
        aqi: data.current.us_aqi,
        pm2_5: data.current.pm2_5,
        pm10: data.current.pm10,
        observedAt: data.current.time,
      },
      history: toDailyHistory(data.hourly.time, data.hourly.us_aqi, data.hourly.pm2_5),
    };

    cache.set(key, result);
    return { status: 'ok', data: result, fetchedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_AIR_QUALITY] Fetch timed out for ${lat},${lon}`);
    } else {
      logger.error({ err: error }, `[ENV_AIR_QUALITY] Fetch failed for ${lat},${lon}`);
    }
    return { status: 'unavailable', reason: 'fetch_error' };
  }
}
