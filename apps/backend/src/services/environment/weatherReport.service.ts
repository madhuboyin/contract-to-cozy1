// apps/backend/src/services/environment/weatherReport.service.ts
//
// Current conditions + 48h hourly + 10-day forecast + 30-day history, via
// Open-Meteo's free, keyless forecast + archive APIs. Distinct from
// weather.service.ts, which stays as-is and only extracts freeze/heavy-rain
// signals for maintenance nudges from a different (OWM) provider.

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';
import { TtlCache } from './ttlCache';
import { SectionResult } from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface WeatherCurrentConditions {
  temperatureF: number;
  apparentTemperatureF: number;
  humidityPercent: number;
  windSpeedMph: number;
  precipitationIn: number;
  weatherCode: number;
  isDay: boolean;
  observedAt: string;
}

export interface WeatherHourlyPoint {
  time: string;
  temperatureF: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
}

export interface WeatherDailyForecastPoint {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  weatherCode: number;
}

export interface WeatherHistoryPoint {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
}

export interface WeatherReportData {
  current: WeatherCurrentConditions;
  hourly: WeatherHourlyPoint[];
  tenDayForecast: WeatherDailyForecastPoint[];
  thirtyDayHistory: WeatherHistoryPoint[];
}

interface OpenMeteoForecastResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
    time: string;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

interface OpenMeteoArchiveResponse {
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

type DailyWeatherArrays = NonNullable<OpenMeteoForecastResponse['daily']>;
type HourlyWeatherArrays = NonNullable<OpenMeteoForecastResponse['hourly']>;

export function upcomingHourlyWeather(
  hourly: HourlyWeatherArrays,
  currentLocalTime: string,
): WeatherHourlyPoint[] {
  return hourly.time
    .map((time, i) => ({
      time,
      temperatureF: hourly.temperature_2m[i],
      precipitationProbabilityPercent: hourly.precipitation_probability[i],
      weatherCode: hourly.weather_code[i],
    }))
    .filter(point => point.time >= currentLocalTime)
    .slice(0, 48);
}

export function partitionWeatherDays(
  daily: DailyWeatherArrays,
  localToday: string,
  archivedHistory: WeatherHistoryPoint[] = [],
): Pick<WeatherReportData, 'tenDayForecast' | 'thirtyDayHistory'> {
  const allDaily = daily.time.map((date, i) => ({
    date,
    tempMaxF: daily.temperature_2m_max[i],
    tempMinF: daily.temperature_2m_min[i],
    precipitationSumIn: daily.precipitation_sum[i],
    weatherCode: daily.weather_code[i],
  }));
  const tenDayForecast = allDaily.filter(day => day.date >= localToday);
  const recentObserved = allDaily
    .filter(day => day.date < localToday)
    .map(({ weatherCode: _weatherCode, ...day }) => day);
  const historyByDate = new Map(
    [...archivedHistory, ...recentObserved].map(day => [day.date, day]),
  );
  const thirtyDayHistory = [...historyByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
  return { tenDayForecast, thirtyDayHistory };
}

const cache = new TtlCache<WeatherReportData>(CACHE_TTL_MS);

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function fetchJson<T>(url: URL): Promise<T | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const requestUrl = url.toString();
    await assertSafeUrl(requestUrl);
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(`[ENV_WEATHER] ${url.hostname} returned ${res.status}: ${body}`);
      return null;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns current/hourly/10-day-forecast/30-day-history weather for a
 * lat/lon point. Never throws — returns { status: 'unavailable' } on any
 * failure so a dead Open-Meteo endpoint only degrades this one section.
 */
export async function getWeatherReport(lat: number, lon: number): Promise<SectionResult<WeatherReportData>> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return { status: 'unavailable', reason: 'invalid_coordinates' };
  }

  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return { status: 'ok', data: cached, fetchedAt: new Date().toISOString() };

  try {
    const forecastUrl = new URL(FORECAST_URL);
    forecastUrl.searchParams.set('latitude', String(lat));
    forecastUrl.searchParams.set('longitude', String(lon));
    forecastUrl.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day'
    );
    forecastUrl.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
    forecastUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code');
    forecastUrl.searchParams.set('forecast_days', '10');
    // Forecast past-days are the authoritative source for the immediately
    // preceding week. The archive API intentionally lags several days.
    forecastUrl.searchParams.set('past_days', '7');
    forecastUrl.searchParams.set('temperature_unit', 'fahrenheit');
    forecastUrl.searchParams.set('wind_speed_unit', 'mph');
    forecastUrl.searchParams.set('precipitation_unit', 'inch');
    forecastUrl.searchParams.set('timezone', 'auto');

    // Archive API data lags by a few days for final QC — end 5 days back to
    // stay reliably within available data, spanning the prior 30 days.
    const end = new Date();
    end.setDate(end.getDate() - 5);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);

    const archiveUrl = new URL(ARCHIVE_URL);
    archiveUrl.searchParams.set('latitude', String(lat));
    archiveUrl.searchParams.set('longitude', String(lon));
    archiveUrl.searchParams.set('start_date', isoDate(start));
    archiveUrl.searchParams.set('end_date', isoDate(end));
    archiveUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum');
    archiveUrl.searchParams.set('temperature_unit', 'fahrenheit');
    archiveUrl.searchParams.set('precipitation_unit', 'inch');
    archiveUrl.searchParams.set('timezone', 'auto');

    const [forecast, archive] = await Promise.all([
      fetchJson<OpenMeteoForecastResponse>(forecastUrl),
      fetchJson<OpenMeteoArchiveResponse>(archiveUrl),
    ]);

    if (!forecast?.current || !forecast.hourly || !forecast.daily) {
      return { status: 'unavailable', reason: 'forecast_fetch_failed' };
    }

    const current: WeatherCurrentConditions = {
      temperatureF: forecast.current.temperature_2m,
      apparentTemperatureF: forecast.current.apparent_temperature,
      humidityPercent: forecast.current.relative_humidity_2m,
      windSpeedMph: forecast.current.wind_speed_10m,
      precipitationIn: forecast.current.precipitation,
      weatherCode: forecast.current.weather_code,
      isDay: forecast.current.is_day === 1,
      observedAt: forecast.current.time,
    };

    const hourly = upcomingHourlyWeather(forecast.hourly, forecast.current.time);

    const archivedHistory: WeatherHistoryPoint[] = archive?.daily
      ? archive.daily.time.map((date, i) => ({
          date,
          tempMaxF: archive.daily!.temperature_2m_max[i],
          tempMinF: archive.daily!.temperature_2m_min[i],
          precipitationSumIn: archive.daily!.precipitation_sum[i],
        }))
      : []; // archive failing doesn't sink the whole section — current/forecast are the priority
    const { tenDayForecast, thirtyDayHistory } = partitionWeatherDays(
      forecast.daily,
      forecast.current.time.slice(0, 10),
      archivedHistory,
    );

    const data: WeatherReportData = { current, hourly, tenDayForecast, thirtyDayHistory };
    cache.set(key, data);
    return { status: 'ok', data, fetchedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      logger.error(`[ENV_WEATHER] Fetch timed out for ${lat},${lon}`);
    } else {
      logger.error({ err: error }, `[ENV_WEATHER] Fetch failed for ${lat},${lon}`);
    }
    return { status: 'unavailable', reason: 'fetch_error' };
  }
}
