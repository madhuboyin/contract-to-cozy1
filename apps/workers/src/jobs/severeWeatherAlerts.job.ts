// Canonical NWS ingestion. Provider code owns fetch/normalization/source health;
// downstream Radar matching owns property impact, Incident, and Guidance projection.
import { randomUUID } from 'node:crypto';
import {
  severeWeatherAlertService,
  type NwsFetchOutcome,
  type SevereWeatherAlert,
} from '@worker-shared/services/severeWeatherAlert.service';
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
import type { Geo } from '../lib/geocodeZip';
import { getPropertyGeo } from '../lib/propertyGeo';
import { iterateAllProperties } from '../lib/paginateProperties';
import { logger, type AppLogger } from '../lib/logger';
import { nwsFetchOutcomeTotal } from '../lib/metrics';
import { nwsRadarAdapter } from '../radar/nwsRadarAdapter';

const NWS_SOURCE_KEY = 'nws-active-alerts';

type PropertyRow = {
  id: string;
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type RegistryPort = Pick<typeof radarSourceRegistryService, 'register'>;
type RunPort = Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
type IngestQueuePort = Pick<typeof radarIngestQueueService, 'enqueue'>;

export interface SevereWeatherAlertsDeps {
  severeWeatherAlertService: Pick<typeof severeWeatherAlertService, 'getActiveAlerts'>;
  registry: RegistryPort;
  runs: RunPort;
  ingestQueue: IngestQueuePort;
  logger: AppLogger;
  iterateAllProperties: typeof iterateAllProperties;
  getPropertyGeo: typeof getPropertyGeo;
  now(): Date;
  correlationId(): string;
  env: NodeJS.ProcessEnv;
}

const defaultDeps: SevereWeatherAlertsDeps = {
  severeWeatherAlertService,
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestQueue: radarIngestQueueService,
  logger,
  iterateAllProperties,
  getPropertyGeo,
  now: () => new Date(),
  correlationId: randomUUID,
  env: process.env,
};

function sourceRegistration(env: NodeJS.ProcessEnv): RadarSourceRegistrationInput {
  return {
    key: NWS_SOURCE_KEY,
    family: 'weather' as const,
    sourceType: 'weather_provider' as const,
    name: 'National Weather Service active alerts',
    provider: 'National Weather Service',
    adapterVersion: 'nws-canonical-v1',
    contractVersion: 1,
    isEnabled: true,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron: '*/15 * * * *',
    freshnessSeconds: 30 * 60,
    supportedEventTypes: [
      'weather',
      'flood_risk',
      'heat_wave',
      'wind',
      'hail',
      'heavy_rain',
    ],
    coverageDescription: 'NWS active alert coverage for the United States',
    configJson: {
      canonicalHostAllowlist: ['api.weather.gov'],
      endpoint: 'https://api.weather.gov/alerts/active',
    },
    coverage: [{
      coverageType: 'country' as const,
      countryCode: 'US',
    }],
  };
}

function laterAlert(
  current: { alert: SevereWeatherAlert; geo: Geo } | undefined,
  candidate: SevereWeatherAlert,
  geo: Geo,
) {
  if (!current) return { alert: candidate, geo };
  const currentTime = Date.parse(current.alert.sent ?? current.alert.effective ?? '');
  const candidateTime = Date.parse(candidate.sent ?? candidate.effective ?? '');
  return Number.isFinite(candidateTime) && (!Number.isFinite(currentTime) || candidateTime > currentTime)
    ? { alert: candidate, geo }
    : current;
}

export async function severeWeatherAlertsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: SevereWeatherAlertsDeps = defaultDeps,
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[SevereWeatherAlerts] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }

  const startedAt = deps.now();
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('severe-weather-alerts')
    : undefined;
  const source = dryRun
    ? { id: 'nws-dry-run', key: NWS_SOURCE_KEY }
    : await deps.registry.register(sourceRegistration(deps.env));
  const correlationId = smokeCorrelationId ?? `nws:${deps.correlationId()}`;
  const begun = dryRun
    ? {
        runnable: true,
        reason: 'dry run',
        run: { id: 'nws-dry-run', correlationId },
      }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'nws',
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      }, deps.env);

  if (!begun.runnable) {
    deps.logger.warn(
      { reason: begun.reason },
      '[SevereWeatherAlerts] NWS source run skipped',
    );
    return {
      createdOrUpdated: 0,
      resolved: 0,
      smokeCorrelationId,
      sourceRunStatus: 'skipped',
      fetchSucceeded: 0,
      fetchFailed: 0,
      uniqueAlerts: 0,
      rejected: 0,
    };
  }

  const geoRunCache = new Map<string, Geo | null>();
  const alertsCache = new Map<
    string,
    { alerts: SevereWeatherAlert[]; outcome: NwsFetchOutcome; geo: Geo }
  >();
  const uniqueAlerts = new Map<string, { alert: SevereWeatherAlert; geo: Geo }>();
  let propertiesEvaluated = 0;

  for await (const property of deps.iterateAllProperties()) {
    const p = property as PropertyRow;
    if (opts?.propertyId && p.id !== opts.propertyId) continue;
    const zip = (p.zipCode ?? '').trim();
    if (!zip) continue;
    const geo = await deps.getPropertyGeo(property, geoRunCache);
    if (!geo) continue;
    propertiesEvaluated += 1;

    let cached = alertsCache.get(zip);
    if (!cached) {
      let outcome: NwsFetchOutcome = 'error';
      const alerts = await deps.severeWeatherAlertService.getActiveAlerts(
        geo.lat,
        geo.lon,
        (value) => {
          outcome = value;
          nwsFetchOutcomeTotal.inc({ outcome: value });
        },
      );
      cached = { alerts, outcome, geo };
      alertsCache.set(zip, cached);
    }
    if (cached.outcome !== 'ok') continue;
    for (const alert of cached.alerts) {
      uniqueAlerts.set(
        alert.nwsAlertId,
        laterAlert(uniqueAlerts.get(alert.nwsAlertId), alert, cached.geo),
      );
    }
  }

  const fetchSucceeded = Array.from(alertsCache.values())
    .filter((entry) => entry.outcome === 'ok').length;
  const fetchFailed = alertsCache.size - fetchSucceeded;
  let createdOrUpdated = 0;
  let resolved = 0;
  const errors: Error[] = [];

  for (const { alert, geo } of uniqueAlerts.values()) {
    try {
      const observation = await nwsRadarAdapter.normalize(alert, {
        sourceDefinitionId: source.id,
        observedAt: startedAt.toISOString(),
        queryPoint: {
          latitude: geo.lat,
          longitude: geo.lon,
        },
      });
      if (dryRun) {
        createdOrUpdated += 1;
        continue;
      }
      const enqueued = await deps.ingestQueue.enqueue({
        observation,
        sourceRunId: begun.run.id,
        correlationId,
        enqueuedAt: deps.now().toISOString(),
        smokeCorrelationId,
      });
      createdOrUpdated += 1;
      if (enqueued.lifecycleStatus === 'resolved' || enqueued.lifecycleStatus === 'retracted') {
        resolved += 1;
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      errors.push(normalized);
      deps.logger.error(
        { err: normalized, nwsAlertId: alert.nwsAlertId },
        '[SevereWeatherAlerts] Canonical NWS observation rejected',
      );
    }
  }

  let sourceRunStatus: 'success' | 'successful_empty' | 'partial' | 'failed' | 'skipped';
  if (alertsCache.size === 0) sourceRunStatus = 'skipped';
  else if (fetchSucceeded === 0) sourceRunStatus = 'failed';
  else if (uniqueAlerts.size > 0 && errors.length === uniqueAlerts.size) sourceRunStatus = 'failed';
  else if (fetchFailed > 0 || errors.length > 0) sourceRunStatus = 'partial';
  else if (uniqueAlerts.size === 0) sourceRunStatus = 'successful_empty';
  else sourceRunStatus = 'success';

  if (!dryRun) {
    const errorMessage = sourceRunStatus === 'failed'
      ? fetchSucceeded === 0
        ? `All ${fetchFailed} NWS fetches failed`
        : `All ${errors.length} canonical NWS observation(s) were rejected`
      : sourceRunStatus === 'partial'
        ? `${fetchFailed} NWS fetch(es) failed and ${errors.length} observation(s) were rejected`
        : sourceRunStatus === 'skipped'
          ? 'No properties with usable geography were evaluated'
          : undefined;
    await deps.runs.complete(begun.run.id, {
      status: sourceRunStatus,
      finishedAt: deps.now(),
      dataFreshThrough: fetchSucceeded > 0 ? startedAt : undefined,
      observationsReceived: uniqueAlerts.size,
      observationsRejected: errors.length,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsResolved: 0,
      propertiesEvaluated,
      errorCode: errorMessage
        ? sourceRunStatus === 'failed'
          ? fetchSucceeded === 0 ? 'NWS_FETCH_FAILED' : 'NWS_OBSERVATIONS_REJECTED'
          : sourceRunStatus === 'partial'
            ? 'NWS_PARTIAL'
            : 'NO_QUERY_POINTS'
        : undefined,
      errorMessage,
      metadataJson: {
        provider: 'nws',
        fetchSucceeded,
        fetchFailed,
        queryPoints: alertsCache.size,
        observationsQueued: createdOrUpdated,
      },
    });
  }

  return {
    createdOrUpdated,
    resolved,
    smokeCorrelationId,
    sourceRunStatus: dryRun ? 'dry_run' : sourceRunStatus,
    fetchSucceeded,
    fetchFailed,
    uniqueAlerts: uniqueAlerts.size,
    queued: dryRun ? 0 : createdOrUpdated,
    rejected: errors.length,
  };
}
