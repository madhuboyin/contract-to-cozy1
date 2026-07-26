import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { radarSourceRegistryService, resolveRadarRuntimeEnvironment } from '@worker-shared/modules/homeEventRadar/services/radarSourceRegistry.service';
import { radarSourceRunService } from '@worker-shared/modules/homeEventRadar/services/radarSourceRun.service';
import { radarEventIngestionService } from '@worker-shared/modules/homeEventRadar/services/radarEventIngestion.service';
import type {
  CanonicalRadarObservation,
  RadarSourceRegistrationInput,
} from '@worker-shared/modules/homeEventRadar/contracts';
import { logger, type AppLogger } from '../lib/logger';
import type { Geo } from '../lib/geocodeZip';
import { getPropertyGeo } from '../lib/propertyGeo';
import { iterateAllProperties } from '../lib/paginateProperties';
import {
  FREEZE_THRESHOLD_F,
  freezeRadarAdapter,
  type FreezeForecast,
} from '../radar/freezeRadarAdapter';

const FREEZE_SOURCE_KEY = 'open-meteo-freeze-forecast';
const FORECAST_WINDOW_HOURS = 36;

type ForecastOutcome =
  | { status: 'ok'; forecast: Omit<FreezeForecast, 'propertyId'> }
  | { status: 'failed'; error: string };

type FreezeDeps = {
  registry: Pick<typeof radarSourceRegistryService, 'register'>;
  runs: Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
  ingestion: Pick<typeof radarEventIngestionService, 'ingest'>;
  eventLookup: Pick<typeof prisma.radarEvent, 'findFirst' | 'findUnique'>;
  logger: AppLogger;
  iterateAllProperties: typeof iterateAllProperties;
  getPropertyGeo: typeof getPropertyGeo;
  getForecast(lat: number, lon: number, now: Date): Promise<ForecastOutcome>;
  now(): Date;
  correlationId(): string;
  sleep(ms: number): Promise<void>;
  env: NodeJS.ProcessEnv;
};

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

export function freezeProviderEventId(propertyId: string): string {
  return `open-meteo:freeze-risk:${propertyId}`;
}

export async function getFreezeForecast(
  lat: number,
  lon: number,
  now = new Date(),
): Promise<ForecastOutcome> {
  const end = new Date(now.getTime() + FORECAST_WINDOW_HOURS * 3_600_000);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('start_date', now.toISOString().slice(0, 10));
  url.searchParams.set('end_date', end.toISOString().slice(0, 10));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let json: any;
    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      if (!response.ok) return { status: 'failed', error: `Open-Meteo HTTP ${response.status}` };
      json = await response.json();
    } finally {
      clearTimeout(timeout);
    }
    const times: unknown[] = json?.hourly?.time ?? [];
    const temperatures: unknown[] = json?.hourly?.temperature_2m ?? [];
    if (!Array.isArray(times) || !Array.isArray(temperatures) || times.length !== temperatures.length) {
      return { status: 'failed', error: 'Open-Meteo returned malformed hourly data' };
    }
    const samples: Array<{ at: string; celsius: number }> = [];
    for (let index = 0; index < times.length; index += 1) {
      const rawTime = times[index];
      const at = typeof rawTime === 'string'
        ? new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime}Z`)
        : null;
      const celsius = Number(temperatures[index]);
      if (!at || !Number.isFinite(at.getTime()) || !Number.isFinite(celsius)) continue;
      if (at < now || at > end) continue;
      samples.push({ at: at.toISOString(), celsius });
    }
    if (samples.length === 0) return { status: 'failed', error: 'Open-Meteo returned no usable 36-hour samples' };
    const minimumFahrenheit = Math.round(
      Math.min(...samples.map((sample) => cToF(sample.celsius))) * 10,
    ) / 10;
    return {
      status: 'ok',
      forecast: {
        latitude: lat,
        longitude: lon,
        minimumFahrenheit,
        windowStart: now.toISOString(),
        windowEnd: end.toISOString(),
        sourceUrl: url.toString(),
        rawPayload: { samples },
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function registration(env: NodeJS.ProcessEnv): RadarSourceRegistrationInput {
  return {
    key: FREEZE_SOURCE_KEY,
    family: 'weather',
    sourceType: 'weather_provider',
    name: 'Open-Meteo freeze forecast',
    provider: 'Open-Meteo',
    adapterVersion: 'open-meteo-freeze-v1',
    contractVersion: 1,
    isEnabled: true,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron: '0 */6 * * *',
    freshnessSeconds: 8 * 3_600,
    supportedEventTypes: ['freeze'],
    coverageDescription: 'Open-Meteo point forecast coverage for geocoded properties',
    configJson: {
      endpoint: 'https://api.open-meteo.com/v1/forecast',
      forecastWindowHours: FORECAST_WINDOW_HOURS,
      freezeThresholdFahrenheit: FREEZE_THRESHOLD_F,
    },
    coverage: [{ coverageType: 'global' }],
  };
}

const defaultDeps: FreezeDeps = {
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestion: radarEventIngestionService,
  eventLookup: prisma.radarEvent,
  logger,
  iterateAllProperties,
  getPropertyGeo,
  getForecast: getFreezeForecast,
  now: () => new Date(),
  correlationId: randomUUID,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env: process.env,
};

export async function freezeRiskIncidentsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: FreezeDeps = defaultDeps,
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[FreezeRiskIncidents] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const startedAt = deps.now();
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('freeze-risk-incidents')
    : undefined;
  const source = dryRun
    ? { id: 'freeze-dry-run', key: FREEZE_SOURCE_KEY }
    : await deps.registry.register(registration(deps.env));
  const correlationId = smokeCorrelationId ?? `freeze:${deps.correlationId()}`;
  const begun = dryRun
    ? { runnable: true, run: { id: 'freeze-dry-run' } }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'open-meteo',
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      }, deps.env);
  if (!begun.runnable) {
    return { createdOrUpdated: 0, resolved: 0, failed: 0, sourceRunStatus: 'skipped', smokeCorrelationId };
  }

  const geoRunCache = new Map<string, Geo | null>();
  let propertiesEvaluated = 0;
  let forecastsSucceeded = 0;
  let forecastsFailed = 0;
  let observationsReceived = 0;
  let observationsRejected = 0;
  let verifiedNoEvent = 0;
  let failed = 0;
  let createdOrUpdated = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let resolved = 0;

  for await (const property of deps.iterateAllProperties()) {
    if (opts?.propertyId && property.id !== opts.propertyId) continue;
    if (!(property.zipCode ?? '').trim()) continue;
    const geo = await deps.getPropertyGeo(property, geoRunCache);
    if (!geo) continue;
    propertiesEvaluated += 1;
    const outcome = await deps.getForecast(geo.lat, geo.lon, startedAt);
    if (outcome.status === 'failed') {
      forecastsFailed += 1;
      failed += 1;
      deps.logger.error(
        { propertyId: property.id, error: outcome.error },
        '[FREEZE-RISK] Forecast unavailable; preserving existing lifecycle',
      );
      continue;
    }
    forecastsSucceeded += 1;
    const forecast: FreezeForecast = { propertyId: property.id, ...outcome.forecast };
    const isFreeze = forecast.minimumFahrenheit < FREEZE_THRESHOLD_F;
    if (!isFreeze) {
      const providerEventId = freezeProviderEventId(property.id);
      const existing = dryRun
        ? await deps.eventLookup.findFirst({
            where: {
              providerEventId,
              sourceDefinition: { key: FREEZE_SOURCE_KEY },
            },
            select: { id: true, status: true },
          })
        : await deps.eventLookup.findUnique({
            where: {
              sourceDefinitionId_providerEventId: {
                sourceDefinitionId: source.id,
                providerEventId,
              },
            },
            select: { id: true, status: true },
          });
      if (!existing || !['active', 'updated'].includes(String(existing.status))) {
        verifiedNoEvent += 1;
        continue;
      }
    }
    observationsReceived += 1;
    let observation: CanonicalRadarObservation;
    try {
      observation = await freezeRadarAdapter.normalize(forecast, {
        sourceDefinitionId: source.id,
        observedAt: startedAt.toISOString(),
      });
    } catch (error) {
      observationsRejected += 1;
      failed += 1;
      deps.logger.error(
        { err: error, propertyId: property.id },
        '[FREEZE-RISK] Canonical observation rejected',
      );
      await deps.sleep(200);
      continue;
    }
    if (dryRun) {
      if (isFreeze) createdOrUpdated += 1;
      else resolved += 1;
      continue;
    }
    try {
      const ingested = await deps.ingestion.ingest(observation, {
        sourceRunId: begun.run.id,
        correlationId,
      });
      if (ingested.lifecycleStatus === 'resolved') resolved += 1;
      else createdOrUpdated += 1;
      if (ingested.outcome === 'created') eventsCreated += 1;
      if (ingested.outcome === 'updated') eventsUpdated += 1;
    } catch (error) {
      observationsRejected += 1;
      failed += 1;
      deps.logger.error({ err: error, propertyId: property.id }, '[FREEZE-RISK] Canonical observation rejected');
    }
    await deps.sleep(200);
  }

  let sourceRunStatus: 'success' | 'successful_empty' | 'partial' | 'failed' | 'skipped';
  if (propertiesEvaluated === 0) sourceRunStatus = 'skipped';
  else if (forecastsSucceeded === 0) sourceRunStatus = 'failed';
  else if (
    observationsReceived > 0 &&
    observationsRejected === observationsReceived &&
    verifiedNoEvent === 0
  ) sourceRunStatus = 'failed';
  else if (forecastsFailed > 0 || observationsRejected > 0) sourceRunStatus = 'partial';
  else if (observationsReceived === 0) sourceRunStatus = 'successful_empty';
  else sourceRunStatus = 'success';

  if (!dryRun) {
    const errorMessage = sourceRunStatus === 'failed'
      ? forecastsSucceeded === 0
        ? `All ${forecastsFailed} Open-Meteo forecast requests failed`
        : `All ${observationsRejected} canonical freeze observation(s) were rejected`
      : sourceRunStatus === 'partial'
        ? `${forecastsFailed} Open-Meteo forecast request(s) failed and ${observationsRejected} canonical ingestion operation(s) were rejected`
        : sourceRunStatus === 'skipped'
          ? 'No properties with usable geography were evaluated'
          : undefined;
    await deps.runs.complete(begun.run.id, {
      status: sourceRunStatus,
      finishedAt: deps.now(),
      dataFreshThrough: forecastsSucceeded > 0 ? startedAt : undefined,
      observationsReceived,
      observationsRejected,
      eventsCreated,
      eventsUpdated,
      eventsResolved: resolved,
      propertiesEvaluated,
      errorCode: errorMessage
          ? sourceRunStatus === 'failed'
            ? forecastsSucceeded === 0 ? 'OPEN_METEO_FAILED' : 'FREEZE_OBSERVATIONS_REJECTED'
          : sourceRunStatus === 'partial' ? 'OPEN_METEO_PARTIAL' : 'NO_QUERY_POINTS'
        : undefined,
      errorMessage,
      metadataJson: {
        provider: 'open-meteo',
        forecastsSucceeded,
        forecastsFailed,
        observationsRejected,
        verifiedNoEvent,
        thresholdFahrenheit: FREEZE_THRESHOLD_F,
      },
    });
  }
  return {
    createdOrUpdated,
    resolved,
    failed,
    sourceRunStatus: dryRun ? 'dry_run' : sourceRunStatus,
    smokeCorrelationId,
  };
}
