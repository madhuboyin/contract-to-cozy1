// apps/backend/src/services/weather.service.ts

import { SignalType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OWMForecastEntry {
  main: {
    temp_min: number;
    temp_max: number;
    temp: number;
  };
  weather: Array<{ main: string; description: string }>;
  dt_txt: string;
}

interface OWMForecastResponse {
  list: OWMForecastEntry[];
  city: {
    name: string;
    country: string;
  };
}

interface CacheEntry {
  signals: SignalType[];
  cityName: string | null;
  expiresAt: number;
}

export interface ForecastMeta {
  signals: SignalType[];
  cityName: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const OWM_BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — stays within OWM free tier
const FREEZE_THRESHOLD_F = 32;
const HEAVY_RAIN_VOLUME_MM_3H = 7.5; // mm per 3-hour block = ~60mm/day threshold

// ─────────────────────────────────────────────────────────────────────────────
// WeatherService
// ─────────────────────────────────────────────────────────────────────────────

export class WeatherService {
  /** In-process TTL cache: zipCode → cached result */
  private readonly cache = new Map<string, CacheEntry>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns active weather SignalTypes for the given zip code.
   * Uses a 30-minute in-memory cache to stay within OWM free-tier limits.
   * Returns [] on any error — never throws.
   */
  async getLocalSignals(zipCode: string): Promise<SignalType[]> {
    const { signals } = await this.getLocalForecastMeta(zipCode);
    return signals;
  }

  /**
   * Returns active weather SignalTypes AND the OWM city name for the given zip code.
   * Uses a 30-minute in-memory cache to stay within OWM free-tier limits.
   * Returns { signals: [], cityName: null } on any error — never throws.
   */
  async getLocalForecastMeta(zipCode: string): Promise<ForecastMeta> {
    const zip = String(zipCode ?? '').trim();
    if (!zip) {
      console.warn('[WEATHER] getLocalForecastMeta called with empty zipCode');
      return { signals: [], cityName: null };
    }

    // 1. Cache check
    const cached = this.getFromCache(zip);
    if (cached) {
      console.log(`[WEATHER] Cache hit for zip=${zip}: [${cached.signals.join(', ')}]`);
      return { signals: cached.signals, cityName: cached.cityName };
    }

    // 2. Fetch from OpenWeatherMap
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        console.error('[WEATHER] OPENWEATHER_API_KEY is not set — returning empty signals');
        return { signals: [], cityName: null };
      }

      const url = new URL(OWM_BASE_URL);
      url.searchParams.set('zip', `${zip},US`);
      url.searchParams.set('appid', apiKey);
      url.searchParams.set('units', 'imperial'); // °F

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8_000);

      let data: OWMForecastResponse;
      try {
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[WEATHER] OWM returned ${res.status} for zip=${zip}: ${body}`);
          return { signals: [], cityName: null };
        }
        data = (await res.json()) as OWMForecastResponse;
      } finally {
        clearTimeout(timeout);
      }

      // 3. Map to internal signals + extract city name
      const signals = this.mapResponseToSignals(data);
      const cityName = data?.city?.name ?? null;
      console.log(
        `[WEATHER] Fetched signals for zip=${zip} city=${cityName ?? 'unknown'}: [${signals.join(', ')}]`
      );

      // 4. Store in cache
      this.setCache(zip, signals, cityName);

      return { signals, cityName };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.error(`[WEATHER] Fetch timed out for zip=${zip}`);
      } else {
        console.error(`[WEATHER] Fetch failed for zip=${zip}:`, error?.message ?? error);
      }
      return { signals: [], cityName: null };
    }
  }

  /**
   * Explicitly invalidate cached signals for a zip code.
   * Useful in tests or after manual overrides.
   */
  invalidateCache(zipCode: string): void {
    this.cache.delete(zipCode.trim());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private mapResponseToSignals(data: OWMForecastResponse): SignalType[] {
    const signals = new Set<SignalType>();
    const forecastList: OWMForecastEntry[] = data?.list ?? [];

    for (const entry of forecastList) {
      // ── Freeze risk: temp_min below 32°F ───────────────────────────────────
      if (typeof entry.main?.temp_min === 'number' && entry.main.temp_min < FREEZE_THRESHOLD_F) {
        signals.add(SignalType.WEATHER_FORECAST_MIN_TEMP);
      }

      // ── Heavy rain: OWM main category 'Rain' OR measured volume threshold ──
      const weatherMain = entry.weather?.[0]?.main ?? '';
      const rainVolume3h: number = (entry as any).rain?.['3h'] ?? 0;

      if (weatherMain === 'Rain' || rainVolume3h >= HEAVY_RAIN_VOLUME_MM_3H) {
        signals.add(SignalType.WEATHER_FORECAST_HEAVY_RAIN);
      }

      // Short-circuit: both signals found, no need to keep scanning
      if (signals.size === 2) break;
    }

    return Array.from(signals);
  }

  private getFromCache(zip: string): CacheEntry | null {
    const entry = this.cache.get(zip);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(zip);
      return null;
    }
    return entry;
  }

  private setCache(zip: string, signals: SignalType[], cityName: string | null): void {
    this.cache.set(zip, {
      signals,
      cityName,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}

export const weatherService = new WeatherService();
