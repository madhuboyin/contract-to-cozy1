import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { fetchDummyRadarSignals } from '../radar/dummyRadar.client';
import {
  canonicalDummyRadarAdapter,
  dummyRadarSourceFamily,
} from '../radar/canonicalDummyRadarAdapter';
import type { DummyRadarRawSignal } from '../radar/radar.types';
import {
  radarSourceRegistryService,
  resolveRadarRuntimeEnvironment,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRegistry.service';
import {
  radarSourceRunService,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRun.service';
import {
  radarEventIngestionService,
} from '@worker-shared/modules/homeEventRadar/services/radarEventIngestion.service';
import { logger } from '../lib/logger';

const DEFAULT_TARGET_ZIPS = ['08536', '10019'];
const DEFAULT_MAX_PROPERTIES = 25;
const TEST_SOURCE_PREFIX = 'test-home-event-radar-fixtures';

type TargetProperty = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type RadarDummyScope = {
  propertyIds: string[];
  postalCodes: string[];
  maxProperties: number;
};

type RegistryPort = Pick<typeof radarSourceRegistryService, 'register'>;
type RunPort = Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
type IngestionPort = Pick<typeof radarEventIngestionService, 'ingest'>;

type IngestRadarSignalsDependencies = {
  propertyRepository: {
    findMany(args: unknown): Promise<TargetProperty[]>;
  };
  registry: RegistryPort;
  runs: RunPort;
  ingestion: IngestionPort;
  fetchSignals(properties: TargetProperty[], now?: Date): Promise<DummyRadarRawSignal[]>;
  now(): Date;
  correlationId(): string;
  env: NodeJS.ProcessEnv;
  log: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

function listFromEnv(value: string | undefined): string[] {
  return Array.from(new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

export function resolveRadarDummyScope(env: NodeJS.ProcessEnv = process.env): RadarDummyScope {
  const propertyIds = listFromEnv(env.RADAR_DUMMY_TARGET_PROPERTY_IDS);
  const configuredZips = listFromEnv(env.RADAR_DUMMY_TARGET_ZIPS);
  const postalCodes = propertyIds.length > 0
    ? configuredZips
    : configuredZips.length > 0 ? configuredZips : DEFAULT_TARGET_ZIPS;
  const parsedMax = Number.parseInt((env.RADAR_DUMMY_MAX_PROPERTIES ?? '').trim(), 10);
  const maxProperties = Number.isInteger(parsedMax) && parsedMax > 0
    ? Math.min(parsedMax, 100)
    : DEFAULT_MAX_PROPERTIES;
  return { propertyIds, postalCodes, maxProperties };
}

export function assertRadarDummyEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (resolveRadarRuntimeEnvironment(env) === 'production') {
    throw new Error(
      'Refusing to run Home Event Radar test fixtures in production',
    );
  }
}

function propertyQuery(scope: RadarDummyScope) {
  const where = scope.propertyIds.length > 0
    ? { id: { in: scope.propertyIds } }
    : {
        address: { not: '' },
        city: { not: '' },
        state: { not: '' },
        zipCode: { in: scope.postalCodes },
      };
  return {
    where,
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
    },
    orderBy: { createdAt: 'asc' as const },
    take: scope.maxProperties,
  };
}

function sourceKey(family: string): string {
  return `${TEST_SOURCE_PREFIX}-${family.replace(/_/g, '-')}`;
}

function groupSignalsByFamily(signals: DummyRadarRawSignal[]) {
  const groups = new Map<string, DummyRadarRawSignal[]>();
  for (const signal of signals) {
    const family = dummyRadarSourceFamily(signal.provider);
    const group = groups.get(family) ?? [];
    group.push(signal);
    groups.set(family, group);
  }
  return groups;
}

function sourceRegistration(
  family: string,
  signals: DummyRadarRawSignal[],
  properties: TargetProperty[],
  env: NodeJS.ProcessEnv,
) {
  const postalCodes = Array.from(new Set(properties.map((property) => property.zipCode.trim())))
    .filter(Boolean);
  const eventTypes = Array.from(new Set(signals.map((signal) => signal.signalType)));
  const runtimeEnvironment = resolveRadarRuntimeEnvironment(env);
  return {
    key: sourceKey(family),
    family: family as 'weather' | 'air_quality' | 'disaster' | 'utility' | 'tax' | 'insurance' | 'other',
    sourceType: 'manual_import' as const,
    name: `Test data — Home Event Radar ${family.split('_').join(' ')} fixtures`,
    provider: 'Contract to Cozy reviewed test fixture provider',
    adapterVersion: 'canonical-dummy-v1',
    contractVersion: 1,
    isEnabled: true,
    environments: [runtimeEnvironment],
    freshnessSeconds: 3_600,
    supportedEventTypes: eventTypes,
    coverageDescription: `Test-only fixture coverage for allowlisted postal codes: ${postalCodes.join(', ')}`,
    configJson: {
      testData: true,
      testDataLabel: 'Test data',
      allowlistedPropertyIds: properties.map((property) => property.id),
      allowlistedPostalCodes: postalCodes,
    },
    coverage: postalCodes.map((postalCode) => ({
      coverageType: 'postal_code' as const,
      countryCode: 'US',
      postalCode,
    })),
  };
}

function defaultDependencies(): IngestRadarSignalsDependencies {
  return {
    propertyRepository: prisma.property,
    registry: radarSourceRegistryService,
    runs: radarSourceRunService,
    ingestion: radarEventIngestionService,
    fetchSignals: fetchDummyRadarSignals,
    now: () => new Date(),
    correlationId: randomUUID,
    env: process.env,
    log: logger,
  };
}

export function createIngestRadarSignalsJob(
  overrides: Partial<IngestRadarSignalsDependencies> = {},
) {
  const deps = { ...defaultDependencies(), ...overrides };

  return async function runRadarFixtureIngestion() {
    assertRadarDummyEnvironment(deps.env);
    const scope = resolveRadarDummyScope(deps.env);
    const startedAt = deps.now();
    const properties = (await deps.propertyRepository.findMany(propertyQuery(scope)))
      .filter((property) => property.zipCode.trim() !== '');

    if (properties.length === 0) {
      deps.log.info(
        { scope },
        '[RADAR-TEST-FIXTURE] No allowlisted properties with postal codes found; skipping',
      );
      return {
        testData: true,
        targetProperties: 0,
        rawSignals: 0,
        sourceRuns: 0,
        accepted: 0,
        rejected: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        duplicateRevisions: 0,
        matchJobsEnqueued: 0,
      };
    }

    const rawSignals = await deps.fetchSignals(properties, startedAt);
    const groups = groupSignalsByFamily(rawSignals);
    const result = {
      testData: true,
      targetProperties: properties.length,
      rawSignals: rawSignals.length,
      sourceRuns: 0,
      accepted: 0,
      rejected: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      duplicateRevisions: 0,
      matchJobsEnqueued: 0,
    };

    for (const [family, signals] of groups) {
      const source = await deps.registry.register(
        sourceRegistration(family, signals, properties, deps.env),
      );
      const correlationId = `test-fixture:${deps.correlationId()}:${family}`;
      const begun = await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          testData: true,
          testDataLabel: 'Test data',
          targetPropertyIds: properties.map((property) => property.id),
        },
      }, deps.env);
      result.sourceRuns += 1;
      if (!begun.runnable) {
        deps.log.warn(
          { sourceKey: source.key, reason: begun.reason },
          '[RADAR-TEST-FIXTURE] Source run skipped',
        );
        continue;
      }

      const errors: Error[] = [];
      let acceptedForRun = 0;
      let createdForRun = 0;
      let updatedForRun = 0;
      let resolvedForRun = 0;

      for (const signal of signals) {
        try {
          const observation = await canonicalDummyRadarAdapter.normalize(signal, {
            sourceDefinitionId: source.id,
            observedAt: startedAt.toISOString(),
            countryCode: 'US',
          });
          const ingested = await deps.ingestion.ingest(observation, {
            sourceRunId: begun.run.id,
            correlationId,
          });
          acceptedForRun += 1;
          result.accepted += 1;
          result.matchJobsEnqueued += 1;
          if (ingested.outcome === 'created') {
            createdForRun += 1;
            result.eventsCreated += 1;
          } else if (ingested.outcome === 'updated') {
            updatedForRun += 1;
            result.eventsUpdated += 1;
          } else {
            result.duplicateRevisions += 1;
          }
          if (ingested.lifecycleStatus === 'resolved') resolvedForRun += 1;
        } catch (error) {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          errors.push(normalizedError);
          result.rejected += 1;
          deps.log.error(
            { err: normalizedError, providerEventId: signal.providerEventId, sourceKey: source.key },
            '[RADAR-TEST-FIXTURE] Observation rejected',
          );
        }
      }

      const rejectedForRun = errors.length;
      const completionStatus = rejectedForRun === 0
        ? 'success' as const
        : acceptedForRun > 0 ? 'partial' as const : 'failed' as const;
      await deps.runs.complete(begun.run.id, {
        status: completionStatus,
        finishedAt: deps.now(),
        dataFreshThrough: startedAt,
        observationsReceived: signals.length,
        observationsRejected: rejectedForRun,
        eventsCreated: createdForRun,
        eventsUpdated: updatedForRun,
        eventsResolved: resolvedForRun,
        errorCode: rejectedForRun > 0 ? 'FIXTURE_OBSERVATION_REJECTED' : undefined,
        errorMessage: rejectedForRun > 0
          ? `${rejectedForRun} test fixture observation(s) were rejected: ${errors[0]?.message}`
          : undefined,
        metadataJson: {
          testData: true,
          testDataLabel: 'Test data',
        },
      });
    }

    deps.log.info({ data: result }, '[RADAR-TEST-FIXTURE] Canonical fixture ingestion completed');
    return result;
  };
}

export const ingestRadarSignalsJob = createIngestRadarSignalsJob();
