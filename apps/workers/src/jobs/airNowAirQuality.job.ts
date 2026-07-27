import { randomUUID } from 'node:crypto';
import {
  radarSourceRegistryService,
  resolveRadarRuntimeEnvironment,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRegistry.service';
import {
  radarSourceRunService,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRun.service';
import {
  radarIngestQueueService,
} from '@worker-shared/modules/homeEventRadar/queues/radarIngest.queue';
import type {
  RadarSourceRegistrationInput,
} from '@worker-shared/modules/homeEventRadar/contracts';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { getPropertyGeo } from '../lib/propertyGeo';
import type { Geo } from '../lib/geocodeZip';
import { iterateAllProperties } from '../lib/paginateProperties';
import { logger, type AppLogger } from '../lib/logger';
import {
  AIRNOW_ACTIONABLE_AQI,
  AIRNOW_SEARCH_RADIUS_MILES,
  airNowProviderEventId,
  airNowRadarAdapter,
  isActionableAirNowReading,
  type AirNowReading,
  type AirNowReadingKind,
} from '../radar/airNowRadarAdapter';

export const AIRNOW_SOURCE_KEY = 'epa-airnow-air-quality';
export const AIRNOW_ADAPTER_VERSION = 'airnow-canonical-v1';

const DEFAULT_CURRENT_URL =
  'https://www.airnowapi.org/aq/observation/latitudeLongitude/current/';
const DEFAULT_FORECAST_URL =
  'https://www.airnowapi.org/aq/forecast/latitudeLongitude/';
const REQUEST_TIMEOUT_MS = 8_000;

type PropertyRow = {
  id: string;
  zipCode?: string | null;
};

type EndpointResult = {
  status: 'ok' | 'failed';
  readings: AirNowReading[];
  rejected: number;
  error?: string;
};

export type AirNowFetchResult = {
  current: EndpointResult;
  forecast: EndpointResult;
};

type AirNowDeps = {
  registry: Pick<typeof radarSourceRegistryService, 'register'>;
  runs: Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
  ingestQueue: Pick<typeof radarIngestQueueService, 'enqueue'>;
  iterateAllProperties: typeof iterateAllProperties;
  getPropertyGeo: typeof getPropertyGeo;
  fetchReadings(lat: number, lon: number, now: Date, env: NodeJS.ProcessEnv): Promise<AirNowFetchResult>;
  logger: AppLogger;
  now(): Date;
  correlationId(): string;
  sleep(ms: number): Promise<void>;
  env: NodeJS.ProcessEnv;
};

function value(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function text(record: Record<string, unknown>, ...keys: string[]): string {
  const entry = value(record, ...keys);
  return typeof entry === 'string' ? entry.trim() : '';
}

function finiteNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  const entry = Number(value(record, ...keys));
  return Number.isFinite(entry) ? entry : null;
}

function records(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const envelope = payload as Record<string, unknown>;
  const data = value(envelope, 'Data', 'data', 'Results', 'results');
  return Array.isArray(data) ? data : [];
}

function category(record: Record<string, unknown>): {
  number: number | null;
  name: string;
} {
  const raw = value(record, 'Category', 'category');
  if (!raw || typeof raw !== 'object') {
    return {
      number: finiteNumber(record, 'CategoryNumber', 'categoryNumber'),
      name: text(record, 'CategoryName', 'categoryName') || 'Unknown',
    };
  }
  const categoryRecord = raw as Record<string, unknown>;
  return {
    number: finiteNumber(categoryRecord, 'Number', 'number'),
    name: text(categoryRecord, 'Name', 'name') || 'Unknown',
  };
}

function isoDay(valueToParse: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueToParse)) return null;
  const parsed = new Date(`${valueToParse}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseReading(
  input: unknown,
  kind: AirNowReadingKind,
  now: Date,
): AirNowReading | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const reportingArea = text(record, 'ReportingArea', 'reportingArea');
  const stateCode = text(record, 'StateCode', 'stateCode');
  const parameterName = text(record, 'ParameterName', 'parameterName');
  const latitude = finiteNumber(record, 'Latitude', 'latitude');
  const longitude = finiteNumber(record, 'Longitude', 'longitude');
  if (!reportingArea || !stateCode || !parameterName || latitude === null || longitude === null) {
    return null;
  }
  const rawAqi = finiteNumber(record, 'AQI', 'aqi');
  const aqi = rawAqi !== null && rawAqi >= 0 ? Math.round(rawAqi) : null;
  const parsedCategory = category(record);

  if (kind === 'current') {
    const dateObserved = text(record, 'DateObserved', 'dateObserved');
    const hour = finiteNumber(record, 'HourObserved', 'hourObserved');
    const localTimeZone = text(record, 'LocalTimeZone', 'localTimeZone') || 'local';
    // AirNow reports this clock time in a provider-supplied local timezone
    // abbreviation. Preserve that identity instead of pretending it is UTC;
    // the canonical effectiveAt below uses our unambiguous observation time.
    const providerObservedAt = isoDay(dateObserved)
      ? `${dateObserved}:${String(Math.max(0, Math.min(23, Math.trunc(hour ?? 0)))).padStart(2, '0')}:${localTimeZone}`
      : now.toISOString();
    return {
      kind,
      reportingArea,
      stateCode,
      latitude,
      longitude,
      parameterName,
      aqi,
      categoryNumber: parsedCategory.number,
      categoryName: parsedCategory.name,
      actionDay: false,
      discussion: null,
      providerObservedAt,
      effectiveAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 2 * 3_600_000).toISOString(),
      rawPayload: input,
    };
  }

  const dateForecast = text(record, 'DateForecast', 'dateForecast');
  const forecastDay = isoDay(dateForecast);
  if (!forecastDay) return null;
  const effectiveAt = forecastDay.getTime() <= now.getTime() ? now : forecastDay;
  const expiresAt = new Date(forecastDay.getTime() + 24 * 3_600_000);
  const dateIssue = text(record, 'DateIssue', 'dateIssue');
  return {
    kind,
    reportingArea,
    stateCode,
    latitude,
    longitude,
    parameterName,
    aqi,
    categoryNumber: parsedCategory.number,
    categoryName: parsedCategory.name,
    actionDay: value(record, 'ActionDay', 'actionDay') === true,
    discussion: text(record, 'Discussion', 'discussion') || null,
    providerObservedAt: isoDay(dateIssue) ? dateIssue : now.toISOString(),
    effectiveAt: effectiveAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rawPayload: input,
  };
}

export function parseAirNowPayload(
  payload: unknown,
  kind: AirNowReadingKind,
  now: Date,
): { readings: AirNowReading[]; rejected: number } {
  const rawRecords = records(payload);
  const readings: AirNowReading[] = [];
  let rejected = 0;
  for (const record of rawRecords) {
    const parsed = parseReading(record, kind, now);
    if (parsed) readings.push(parsed);
    else rejected += 1;
  }
  return { readings, rejected };
}

async function fetchEndpoint(
  endpoint: string,
  kind: AirNowReadingKind,
  lat: number,
  lon: number,
  now: Date,
  apiKey: string,
): Promise<EndpointResult> {
  const url = new URL(endpoint);
  url.searchParams.set('format', 'application/json');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('distance', String(AIRNOW_SEARCH_RADIUS_MILES));
  url.searchParams.set('API_KEY', apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: 'failed', readings: [], rejected: 0, error: `AirNow HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/json/i.test(contentType)) {
      return { status: 'failed', readings: [], rejected: 0, error: 'AirNow returned a non-JSON response' };
    }
    const parsed = parseAirNowPayload(await response.json(), kind, now);
    return { status: 'ok', ...parsed };
  } catch (error) {
    return {
      status: 'failed',
      readings: [],
      rejected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAirNowReadings(
  lat: number,
  lon: number,
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<AirNowFetchResult> {
  const apiKey = env.AIRNOW_API_KEY?.trim();
  if (!apiKey) {
    const missing = {
      status: 'failed' as const,
      readings: [],
      rejected: 0,
      error: 'AIRNOW_API_KEY is not configured',
    };
    return { current: missing, forecast: missing };
  }
  const currentUrl = env.AIRNOW_CURRENT_OBSERVATIONS_URL?.trim() || DEFAULT_CURRENT_URL;
  const forecastUrl = env.AIRNOW_CURRENT_FORECASTS_URL?.trim() || DEFAULT_FORECAST_URL;
  const [current, forecast] = await Promise.all([
    fetchEndpoint(currentUrl, 'current', lat, lon, now, apiKey),
    fetchEndpoint(forecastUrl, 'forecast', lat, lon, now, apiKey),
  ]);
  return { current, forecast };
}

export function airNowSourceRegistration(env: NodeJS.ProcessEnv): RadarSourceRegistrationInput {
  return {
    key: AIRNOW_SOURCE_KEY,
    family: 'air_quality',
    sourceType: 'air_quality_provider',
    name: 'EPA AirNow air quality',
    provider: 'EPA AirNow',
    adapterVersion: AIRNOW_ADAPTER_VERSION,
    contractVersion: 1,
    isEnabled: true,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron: '*/30 * * * *',
    freshnessSeconds: 90 * 60,
    supportedEventTypes: ['air_quality', 'wildfire_smoke'],
    coverageDescription: 'United States AirNow reporting areas within 25 miles of a geocoded property',
    configJson: {
      currentObservationsEndpoint: env.AIRNOW_CURRENT_OBSERVATIONS_URL?.trim() || DEFAULT_CURRENT_URL,
      currentForecastsEndpoint: env.AIRNOW_CURRENT_FORECASTS_URL?.trim() || DEFAULT_FORECAST_URL,
      actionableAqiThreshold: AIRNOW_ACTIONABLE_AQI,
      searchRadiusMiles: AIRNOW_SEARCH_RADIUS_MILES,
      endpointGeneration: '2026-latitudeLongitude',
    },
    coverage: [{ coverageType: 'country', countryCode: 'US' }],
  };
}

const defaultDeps: AirNowDeps = {
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestQueue: radarIngestQueueService,
  iterateAllProperties,
  getPropertyGeo,
  fetchReadings: getAirNowReadings,
  logger,
  now: () => new Date(),
  correlationId: randomUUID,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env: process.env,
};

function readingScore(reading: AirNowReading): number {
  return reading.aqi ?? reading.categoryNumber ?? 0;
}

export async function airNowAirQualityJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: AirNowDeps = defaultDeps,
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[AirNowAirQuality] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }

  const startedAt = deps.now();
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('airnow-air-quality')
    : undefined;
  const source = dryRun
    ? { id: 'airnow-dry-run', key: AIRNOW_SOURCE_KEY }
    : await deps.registry.register(airNowSourceRegistration(deps.env));
  const correlationId = smokeCorrelationId ?? `airnow:${deps.correlationId()}`;
  const begun = dryRun
    ? { runnable: true, reason: 'dry run', run: { id: 'airnow-dry-run' } }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'airnow',
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      }, deps.env);
  if (!begun.runnable) {
    return {
      createdOrUpdated: 0,
      failed: 0,
      queued: 0,
      sourceRunStatus: 'skipped',
      smokeCorrelationId,
    };
  }

  const geoCache = new Map<string, Geo | null>();
  const queryCache = new Map<string, AirNowFetchResult>();
  const uniqueReadings = new Map<string, AirNowReading>();
  let propertiesEvaluated = 0;
  let endpointSucceeded = 0;
  let endpointFailed = 0;
  let providerRejected = 0;

  for await (const property of deps.iterateAllProperties()) {
    const candidate = property as PropertyRow;
    if (opts?.propertyId && candidate.id !== opts.propertyId) continue;
    const zipCode = candidate.zipCode?.trim();
    if (!zipCode) continue;
    const geo = await deps.getPropertyGeo(property, geoCache);
    if (!geo) continue;
    propertiesEvaluated += 1;

    let fetched = queryCache.get(zipCode);
    if (!fetched) {
      fetched = await deps.fetchReadings(geo.lat, geo.lon, startedAt, deps.env);
      queryCache.set(zipCode, fetched);
      for (const result of [fetched.current, fetched.forecast]) {
        if (result.status === 'ok') endpointSucceeded += 1;
        else endpointFailed += 1;
        providerRejected += result.rejected;
      }
      await deps.sleep(200);
    }
    for (const reading of [...fetched.current.readings, ...fetched.forecast.readings]) {
      if (!isActionableAirNowReading(reading)) continue;
      const key = airNowProviderEventId(reading);
      const existing = uniqueReadings.get(key);
      if (!existing || readingScore(reading) > readingScore(existing)) {
        uniqueReadings.set(key, reading);
      }
    }
  }

  let createdOrUpdated = 0;
  let observationsRejected = providerRejected;
  for (const reading of uniqueReadings.values()) {
    try {
      const observation = await airNowRadarAdapter.normalize(reading, {
        sourceDefinitionId: source.id,
        observedAt: startedAt.toISOString(),
      });
      if (dryRun) {
        createdOrUpdated += 1;
        continue;
      }
      await deps.ingestQueue.enqueue({
        observation,
        sourceRunId: begun.run.id,
        correlationId,
        enqueuedAt: deps.now().toISOString(),
        smokeCorrelationId,
      });
      createdOrUpdated += 1;
    } catch (error) {
      observationsRejected += 1;
      deps.logger.error(
        {
          err: error,
          providerEventId: airNowProviderEventId(reading),
        },
        '[AirNowAirQuality] Canonical observation rejected',
      );
    }
  }

  let sourceRunStatus: 'success' | 'successful_empty' | 'partial' | 'failed' | 'skipped';
  if (propertiesEvaluated === 0) sourceRunStatus = 'skipped';
  else if (endpointSucceeded === 0) sourceRunStatus = 'failed';
  else if (
    uniqueReadings.size > 0
    && observationsRejected >= uniqueReadings.size + providerRejected
  ) sourceRunStatus = 'failed';
  else if (endpointFailed > 0 || observationsRejected > 0) sourceRunStatus = 'partial';
  else if (uniqueReadings.size === 0) sourceRunStatus = 'successful_empty';
  else sourceRunStatus = 'success';

  if (!dryRun) {
    const errorMessage = sourceRunStatus === 'failed'
      ? endpointSucceeded === 0
        ? `All ${endpointFailed} AirNow endpoint requests failed`
        : 'All actionable AirNow observations were rejected'
      : sourceRunStatus === 'partial'
        ? `${endpointFailed} AirNow endpoint request(s) failed and ${observationsRejected} record(s) were rejected`
        : sourceRunStatus === 'skipped'
          ? 'No properties with usable geography were evaluated'
          : undefined;
    await deps.runs.complete(begun.run.id, {
      status: sourceRunStatus,
      finishedAt: deps.now(),
      dataFreshThrough: endpointSucceeded > 0 ? startedAt : undefined,
      observationsReceived: uniqueReadings.size,
      observationsRejected,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsResolved: 0,
      propertiesEvaluated,
      errorCode: errorMessage
        ? sourceRunStatus === 'failed'
          ? endpointSucceeded === 0 ? 'AIRNOW_FETCH_FAILED' : 'AIRNOW_OBSERVATIONS_REJECTED'
          : sourceRunStatus === 'partial' ? 'AIRNOW_PARTIAL' : 'NO_QUERY_POINTS'
        : undefined,
      errorMessage,
      metadataJson: {
        provider: 'airnow',
        queryPoints: queryCache.size,
        endpointSucceeded,
        endpointFailed,
        providerRejected,
        observationsQueued: createdOrUpdated,
        actionableAqiThreshold: AIRNOW_ACTIONABLE_AQI,
        searchRadiusMiles: AIRNOW_SEARCH_RADIUS_MILES,
      },
    });
  }

  return {
    createdOrUpdated,
    failed: endpointFailed + observationsRejected,
    queued: dryRun ? 0 : createdOrUpdated,
    sourceRunStatus: dryRun ? 'dry_run' : sourceRunStatus,
    endpointSucceeded,
    endpointFailed,
    queryPoints: queryCache.size,
    actionableReadings: uniqueReadings.size,
    rejected: observationsRejected,
    smokeCorrelationId,
  };
}
