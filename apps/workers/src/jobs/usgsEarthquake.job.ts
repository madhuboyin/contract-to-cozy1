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
  USGS_MINIMUM_MAGNITUDE,
  usgsEarthquakeRadarAdapter,
  usgsMaterialityRadiusMeters,
  type UsgsEarthquake,
} from '../radar/usgsEarthquakeRadarAdapter';

// Keep the source and worker-job keys aligned so the same fail-closed
// WORKER_JOB_USGS_EARTHQUAKES_ENABLED policy gates scheduling and source runs.
export const USGS_SOURCE_KEY = 'usgs-earthquakes';
export const USGS_ADAPTER_VERSION = 'usgs-geojson-v1';

const DEFAULT_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const REQUEST_TIMEOUT_MS = 8_000;
const EARTH_RADIUS_METERS = 6_371_008.8;

type PropertyRow = {
  id: string;
};

export type UsgsFeedResult = {
  status: 'ok' | 'failed';
  events: UsgsEarthquake[];
  rejected: number;
  generatedAt?: string;
  error?: string;
};

type UsgsDeps = {
  registry: Pick<typeof radarSourceRegistryService, 'register'>;
  runs: Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
  ingestQueue: Pick<typeof radarIngestQueueService, 'enqueue'>;
  iterateAllProperties: typeof iterateAllProperties;
  getPropertyGeo: typeof getPropertyGeo;
  fetchFeed(env: NodeJS.ProcessEnv): Promise<UsgsFeedResult>;
  logger: AppLogger;
  now(): Date;
  correlationId(): string;
  env: NodeJS.ProcessEnv;
};

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochIso(value: unknown): string | null {
  const millis = finiteNumber(value);
  if (millis === null) return null;
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nullableInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parseFeature(input: unknown): UsgsEarthquake | null {
  if (!input || typeof input !== 'object') return null;
  const feature = input as Record<string, unknown>;
  const id = typeof feature.id === 'string' ? feature.id.trim() : '';
  const properties = feature.properties;
  const geometry = feature.geometry;
  if (
    !id
    || !properties
    || typeof properties !== 'object'
    || !geometry
    || typeof geometry !== 'object'
  ) return null;
  const propertyRecord = properties as Record<string, unknown>;
  const geometryRecord = geometry as Record<string, unknown>;
  const eventType = typeof propertyRecord.type === 'string'
    ? propertyRecord.type.trim().toLowerCase()
    : '';
  // Explosions, quarry blasts, and other catalog event types are deliberately
  // excluded from homeowner earthquake monitoring.
  if (eventType !== 'earthquake') return null;
  const coordinates = geometryRecord.coordinates;
  if (geometryRecord.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 3) {
    return null;
  }
  const longitude = finiteNumber(coordinates[0]);
  const latitude = finiteNumber(coordinates[1]);
  const depthKm = finiteNumber(coordinates[2]);
  const magnitude = finiteNumber(propertyRecord.mag);
  const occurredAt = epochIso(propertyRecord.time);
  const updatedAt = epochIso(propertyRecord.updated);
  const place = typeof propertyRecord.place === 'string' ? propertyRecord.place.trim() : '';
  const statusValue = typeof propertyRecord.status === 'string'
    ? propertyRecord.status.trim().toLowerCase()
    : 'automatic';
  const reviewStatus = statusValue === 'deleted'
    ? 'deleted'
    : statusValue === 'reviewed'
      ? 'reviewed'
      : 'automatic';
  const providerUrl = typeof propertyRecord.url === 'string'
    ? propertyRecord.url.trim()
    : '';
  if (
    longitude === null
    || latitude === null
    || depthKm === null
    || magnitude === null
    || !occurredAt
    || !updatedAt
    || !place
  ) return null;
  const alertValue = typeof propertyRecord.alert === 'string'
    ? propertyRecord.alert.trim().toLowerCase()
    : '';
  const alert = alertValue === 'green'
    || alertValue === 'yellow'
    || alertValue === 'orange'
    || alertValue === 'red'
    ? alertValue
    : null;
  return {
    id,
    magnitude,
    place,
    latitude,
    longitude,
    depthKm,
    occurredAt,
    updatedAt,
    reviewStatus,
    alert,
    significance: nullableInteger(propertyRecord.sig),
    feltReports: nullableInteger(propertyRecord.felt),
    tsunamiFlag: propertyRecord.tsunami === 1 || propertyRecord.tsunami === true,
    canonicalUrl: providerUrl || `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(id)}`,
    rawPayload: input,
  };
}

export function parseUsgsGeoJson(payload: unknown): {
  valid: boolean;
  events: UsgsEarthquake[];
  rejected: number;
  ignored: number;
  generatedAt?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, events: [], rejected: 0, ignored: 0 };
  }
  const collection = payload as Record<string, unknown>;
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { valid: false, events: [], rejected: 0, ignored: 0 };
  }
  const events: UsgsEarthquake[] = [];
  let rejected = 0;
  let ignored = 0;
  for (const feature of collection.features) {
    const featureRecord = feature && typeof feature === 'object'
      ? feature as Record<string, unknown>
      : null;
    const properties = featureRecord?.properties;
    const providerType = properties && typeof properties === 'object'
      && typeof (properties as Record<string, unknown>).type === 'string'
      ? String((properties as Record<string, unknown>).type).trim().toLowerCase()
      : null;
    if (providerType && providerType !== 'earthquake') {
      ignored += 1;
      continue;
    }
    const event = parseFeature(feature);
    if (event) events.push(event);
    else rejected += 1;
  }
  const metadata = collection.metadata;
  const generatedAt = metadata && typeof metadata === 'object'
    ? epochIso((metadata as Record<string, unknown>).generated) ?? undefined
    : undefined;
  return { valid: true, events, rejected, ignored, generatedAt };
}

export async function fetchUsgsEarthquakeFeed(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsgsFeedResult> {
  const endpoint = env.USGS_EARTHQUAKE_FEED_URL?.trim() || DEFAULT_FEED_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent': 'ContractToCozy-HomeEventRadar/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: 'failed',
        events: [],
        rejected: 0,
        error: `USGS HTTP ${response.status}`,
      };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/json|geo\+json/i.test(contentType)) {
      return {
        status: 'failed',
        events: [],
        rejected: 0,
        error: 'USGS returned a non-GeoJSON response',
      };
    }
    const parsed = parseUsgsGeoJson(await response.json());
    if (!parsed.valid) {
      return {
        status: 'failed',
        events: [],
        rejected: 0,
        error: 'USGS returned an invalid GeoJSON FeatureCollection',
      };
    }
    return { status: 'ok', ...parsed };
  } catch (error) {
    return {
      status: 'failed',
      events: [],
      rejected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function distanceMeters(a: Geo, b: Geo): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b.lon - a.lon);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function usgsSourceRegistration(env: NodeJS.ProcessEnv): RadarSourceRegistrationInput {
  return {
    key: USGS_SOURCE_KEY,
    family: 'disaster',
    sourceType: 'seismic_provider',
    name: 'USGS real-time earthquakes',
    provider: 'U.S. Geological Survey',
    adapterVersion: USGS_ADAPTER_VERSION,
    contractVersion: 1,
    isEnabled: true,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron: '*/5 * * * *',
    freshnessSeconds: 15 * 60,
    supportedEventTypes: ['earthquake'],
    coverageDescription:
      'United States properties within reviewed magnitude-dependent distance bands of USGS earthquakes',
    configJson: {
      feedEndpoint: env.USGS_EARTHQUAKE_FEED_URL?.trim() || DEFAULT_FEED_URL,
      feedVersion: 'v1.0',
      feedWindow: 'all_day',
      minimumMagnitude: USGS_MINIMUM_MAGNITUDE,
      materialityRadiusMeters: {
        '2.5-3.4': 25_000,
        '3.5-4.4': 75_000,
        '4.5-5.4': 200_000,
        '5.5-6.4': 500_000,
        '6.5+': 1_000_000,
      },
      copyPolicy: 'observational-non-alarmist-v1',
    },
    coverage: [{ coverageType: 'country', countryCode: 'US' }],
  };
}

const defaultDeps: UsgsDeps = {
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestQueue: radarIngestQueueService,
  iterateAllProperties,
  getPropertyGeo,
  fetchFeed: fetchUsgsEarthquakeFeed,
  logger,
  now: () => new Date(),
  correlationId: randomUUID,
  env: process.env,
};

export async function usgsEarthquakeJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: UsgsDeps = defaultDeps,
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[UsgsEarthquake] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const startedAt = deps.now();
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('usgs-earthquake')
    : undefined;
  const source = dryRun
    ? { id: 'usgs-dry-run', key: USGS_SOURCE_KEY }
    : await deps.registry.register(usgsSourceRegistration(deps.env));
  const correlationId = smokeCorrelationId ?? `usgs:${deps.correlationId()}`;
  const begun = dryRun
    ? { runnable: true, reason: 'dry run', run: { id: 'usgs-dry-run' } }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'usgs',
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

  const fetched = await deps.fetchFeed(deps.env);
  const actionable = fetched.events.filter(
    (event) => usgsMaterialityRadiusMeters(event.magnitude) !== null,
  );
  const matched = new Map<string, UsgsEarthquake>();
  const geoCache = new Map<string, Geo | null>();
  let propertiesEvaluated = 0;

  if (fetched.status === 'ok') {
    for await (const property of deps.iterateAllProperties()) {
      const candidate = property as PropertyRow;
      if (opts?.propertyId && candidate.id !== opts.propertyId) continue;
      const geo = await deps.getPropertyGeo(property, geoCache);
      if (!geo) continue;
      propertiesEvaluated += 1;
      for (const event of actionable) {
        const radius = usgsMaterialityRadiusMeters(event.magnitude);
        if (
          radius !== null
          && distanceMeters(geo, { lat: event.latitude, lon: event.longitude }) <= radius
        ) {
          matched.set(event.id, event);
        }
      }
    }
  }

  let createdOrUpdated = 0;
  let observationsRejected = fetched.rejected;
  let normalizationRejected = 0;
  for (const event of matched.values()) {
    try {
      const observation = await usgsEarthquakeRadarAdapter.normalize(event, {
        sourceDefinitionId: source.id,
        observedAt: startedAt.toISOString(),
      });
      if (!dryRun) {
        await deps.ingestQueue.enqueue({
          observation,
          sourceRunId: begun.run.id,
          correlationId,
          enqueuedAt: deps.now().toISOString(),
          smokeCorrelationId,
        });
      }
      createdOrUpdated += 1;
    } catch (error) {
      observationsRejected += 1;
      normalizationRejected += 1;
      deps.logger.error(
        { err: error, providerEventId: event.id },
        '[UsgsEarthquake] Canonical observation rejected',
      );
    }
  }

  let sourceRunStatus: 'success' | 'successful_empty' | 'partial' | 'failed' | 'skipped';
  if (fetched.status === 'failed') sourceRunStatus = 'failed';
  else if (propertiesEvaluated === 0) sourceRunStatus = 'skipped';
  else if (matched.size > 0 && normalizationRejected >= matched.size) {
    sourceRunStatus = 'failed';
  } else if (observationsRejected > 0) sourceRunStatus = 'partial';
  else if (matched.size === 0) sourceRunStatus = 'successful_empty';
  else sourceRunStatus = 'success';

  if (!dryRun) {
    const errorMessage = sourceRunStatus === 'failed'
      ? fetched.status === 'failed'
        ? fetched.error ?? 'USGS feed request failed'
        : 'All matched USGS observations were rejected'
      : sourceRunStatus === 'partial'
        ? `${observationsRejected} USGS record(s) were rejected`
        : sourceRunStatus === 'skipped'
          ? 'No properties with usable geography were evaluated'
          : undefined;
    await deps.runs.complete(begun.run.id, {
      status: sourceRunStatus,
      finishedAt: deps.now(),
      dataFreshThrough: fetched.status === 'ok'
        ? new Date(fetched.generatedAt ?? startedAt.toISOString())
        : undefined,
      observationsReceived: matched.size,
      observationsRejected,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsResolved: 0,
      propertiesEvaluated,
      errorCode: errorMessage
        ? sourceRunStatus === 'failed'
          ? fetched.status === 'failed' ? 'USGS_FETCH_FAILED' : 'USGS_OBSERVATIONS_REJECTED'
          : sourceRunStatus === 'partial' ? 'USGS_PARTIAL' : 'NO_QUERY_POINTS'
        : undefined,
      errorMessage,
      metadataJson: {
        provider: 'usgs',
        feedGeneratedAt: fetched.generatedAt,
        providerEvents: fetched.events.length,
        actionableEvents: actionable.length,
        matchedEvents: matched.size,
        observationsQueued: createdOrUpdated,
        rejected: observationsRejected,
        minimumMagnitude: USGS_MINIMUM_MAGNITUDE,
      },
    });
  }

  return {
    createdOrUpdated,
    failed: fetched.status === 'failed' ? 1 : observationsRejected,
    queued: dryRun ? 0 : createdOrUpdated,
    sourceRunStatus: dryRun ? 'dry_run' : sourceRunStatus,
    propertiesEvaluated,
    providerEvents: fetched.events.length,
    actionableEvents: actionable.length,
    matchedEvents: matched.size,
    rejected: observationsRejected,
    smokeCorrelationId,
  };
}
