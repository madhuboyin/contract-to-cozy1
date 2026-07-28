import { randomUUID } from 'node:crypto';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
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
import {
  taxAssessmentFetchService,
  type PreparedTaxAssessmentSources,
  type PropertyForTaxFetch,
  type TaxAssessmentFetchBatch,
} from '@worker-shared/services/taxAssessmentFetch.service';
import {
  propertyTaxSourceIngestionService,
} from '@worker-shared/services/propertyTax/propertyTaxSourceIngestion.service';
import { iterateAllProperties } from '../lib/paginateProperties';
import type { WorkerRunResult } from '../lib/workerRunResult';
import { logger, type AppLogger } from '../lib/logger';
import { normalizeTaxAssessmentRecord } from '../radar/normalizeTaxAssessment';

export const TAX_ASSESSMENT_SOURCE_KEY = 'tax-assessment-ingest';
export const TAX_ASSESSMENT_ADAPTER_VERSION = 'socrata-tax-canonical-v3';
export const DEFAULT_TAX_ASSESSMENT_INGEST_CRON = '0 6 * * 1';
const TAX_SOURCE_FRESHNESS_SECONDS = 8 * 24 * 60 * 60;

export type TaxAssessmentIngestResult = WorkerRunResult & {
  sourceRunStatus:
    | 'success'
    | 'successful_empty'
    | 'partial'
    | 'failed'
    | 'skipped'
    | 'dry_run';
  configuredJurisdictions: number;
  invalidJurisdictions: number;
  coveredProperties: number;
  uncoveredProperties: number;
  fetchAttempts: number;
  fetchSucceeded: number;
  fetchFailed: number;
  rawRecords: number;
  queued: number;
  persisted: number;
  rejected: number;
  dryRun: boolean;
};

type TaxAssessmentIngestDeps = {
  registry: Pick<typeof radarSourceRegistryService, 'register'>;
  runs: Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
  ingestQueue: Pick<typeof radarIngestQueueService, 'enqueue'>;
  fetchService: Pick<
    typeof taxAssessmentFetchService,
    'prepareSources' | 'fetchForProperties'
  >;
  canonicalRecords: Pick<typeof propertyTaxSourceIngestionService, 'persist'>;
  iterateAllProperties: typeof iterateAllProperties;
  logger: AppLogger;
  now(): Date;
  correlationId(): string;
  env: NodeJS.ProcessEnv;
};

const defaultDeps: TaxAssessmentIngestDeps = {
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestQueue: radarIngestQueueService,
  fetchService: taxAssessmentFetchService,
  canonicalRecords: propertyTaxSourceIngestionService,
  iterateAllProperties,
  logger,
  now: () => new Date(),
  correlationId: randomUUID,
  env: process.env,
};

function sourceRegistration(
  prepared: PreparedTaxAssessmentSources,
  env: NodeJS.ProcessEnv,
): RadarSourceRegistrationInput {
  return {
    key: TAX_ASSESSMENT_SOURCE_KEY,
    family: 'tax',
    sourceType: 'tax_assessor_feed',
    name: 'Configured property tax assessor feeds',
    provider: 'County and municipal Socrata open-data portals',
    adapterVersion: TAX_ASSESSMENT_ADAPTER_VERSION,
    contractVersion: 1,
    isEnabled: prepared.sources.length > 0,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron:
      env.TAX_ASSESSMENT_INGEST_CRON?.trim()
      || DEFAULT_TAX_ASSESSMENT_INGEST_CRON,
    freshnessSeconds: TAX_SOURCE_FRESHNESS_SECONDS,
    supportedEventTypes: ['tax_reassessment'],
    coverageDescription:
      'Reviewed city, county-FIPS, and state tax assessor jurisdictions',
    configJson: {
      dataSourceIds: prepared.sources.map((source) => source.id),
      datasetIds: prepared.sources.map((source) => source.datasetId),
      adapterVersion: TAX_ASSESSMENT_ADAPTER_VERSION,
    },
    coverage: prepared.coverage,
  };
}

async function loadPropertiesForTaxFetch(
  deps: TaxAssessmentIngestDeps,
  propertyId?: string,
): Promise<PropertyForTaxFetch[]> {
  const properties: PropertyForTaxFetch[] = [];
  for await (const property of deps.iterateAllProperties()) {
    if (propertyId && property.id !== propertyId) continue;
    if (
      !property.address
      || !property.city
      || !property.state
      || !property.zipCode
    ) continue;
    properties.push({
      id: property.id,
      address: property.address,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      countyFips: property.countyFips,
    });
  }
  return properties;
}

function emptyFetchBatch(
  invalidSources: number,
  propertiesExamined: number,
): TaxAssessmentFetchBatch {
  return {
    results: [],
    propertiesExamined,
    propertiesCovered: 0,
    propertiesUncovered: propertiesExamined,
    fetchAttempts: 0,
    fetchSucceeded: 0,
    fetchFailed: 0,
    invalidSources,
  };
}

function runStatus(
  propertiesExamined: number,
  fetch: TaxAssessmentFetchBatch,
  observationsReceived: number,
  rejected: number,
): Exclude<TaxAssessmentIngestResult['sourceRunStatus'], 'dry_run'> {
  if (propertiesExamined === 0 || fetch.fetchAttempts === 0) return 'skipped';
  if (fetch.fetchSucceeded === 0) return 'failed';
  if (observationsReceived > 0 && rejected === observationsReceived) return 'failed';
  if (fetch.fetchFailed > 0 || fetch.invalidSources > 0 || rejected > 0) {
    return 'partial';
  }
  return observationsReceived === 0 ? 'successful_empty' : 'success';
}

function errorSummary(
  status: Exclude<TaxAssessmentIngestResult['sourceRunStatus'], 'dry_run'>,
  fetch: TaxAssessmentFetchBatch,
  rejected: number,
): string | undefined {
  if (status === 'failed') {
    return fetch.fetchSucceeded === 0
      ? `All ${fetch.fetchFailed} tax assessor fetch request(s) failed`
      : `All ${rejected} tax observations were rejected`;
  }
  if (status === 'partial') {
    return `${fetch.fetchFailed} fetch request(s) failed, ${fetch.invalidSources} jurisdiction(s) were invalid, and ${rejected} observation(s) were rejected`;
  }
  if (status === 'skipped') {
    return fetch.invalidSources > 0
      ? 'No property could be routed through a valid reviewed tax jurisdiction'
      : 'No eligible property has configured tax source coverage';
  }
  return undefined;
}

export async function ingestTaxAssessmentEventsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: TaxAssessmentIngestDeps = defaultDeps,
): Promise<TaxAssessmentIngestResult> {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[TAX-ASSESSMENT-INGEST] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const startedAt = deps.now();
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId(TAX_ASSESSMENT_SOURCE_KEY)
    : undefined;
  const prepared = await deps.fetchService.prepareSources();
  const source = dryRun
    ? { id: 'tax-dry-run', key: TAX_ASSESSMENT_SOURCE_KEY }
    : await deps.registry.register(sourceRegistration(prepared, deps.env));
  const correlationId =
    smokeCorrelationId ?? `tax:${deps.correlationId()}`;
  const begun = dryRun
    ? {
        runnable: true,
        reason: 'dry run',
        run: { id: 'tax-dry-run', correlationId },
      }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: opts ? 'manual' : 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'socrata-tax',
          configuredJurisdictions: prepared.sources.length,
          invalidJurisdictions: prepared.invalidSources,
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      }, deps.env);

  const properties = await loadPropertiesForTaxFetch(deps, opts?.propertyId);
  if (!begun.runnable) {
    const failed = prepared.invalidSources;
    return {
      examined: properties.length,
      refreshed: 0,
      skipped: properties.length,
      failed,
      reason: begun.reason,
      smokeCorrelationId,
      sourceRunStatus: 'skipped',
      configuredJurisdictions: prepared.sources.length,
      invalidJurisdictions: prepared.invalidSources,
      coveredProperties: 0,
      uncoveredProperties: properties.length,
      fetchAttempts: 0,
      fetchSucceeded: 0,
      fetchFailed: 0,
      rawRecords: 0,
      queued: 0,
      persisted: 0,
      rejected: 0,
      dryRun,
    };
  }

  const fetch = properties.length > 0
    ? await deps.fetchService.fetchForProperties(
        properties,
        prepared,
        { recordBookkeeping: !dryRun },
      )
    : emptyFetchBatch(prepared.invalidSources, 0);
  let rawRecords = 0;
  let queued = 0;
  let persisted = 0;
  let rejected = 0;
  for (const { property, dataSource, records } of fetch.results) {
    rawRecords += records.length;
    for (const record of records) {
      try {
        const initialObservation = normalizeTaxAssessmentRecord(
          record,
          dataSource,
          property,
          {
            sourceDefinitionId: source.id,
            observedAt: startedAt.toISOString(),
          },
        );
        const canonicalRecord = dryRun
          ? null
          : await deps.canonicalRecords.persist(
              record,
              dataSource,
              property,
              {
                observedAt: startedAt,
                radarProviderEventId: initialObservation.providerEventId,
              },
            );
        if (canonicalRecord) persisted += 1;
        const observation = canonicalRecord
          ? normalizeTaxAssessmentRecord(
              record,
              dataSource,
              property,
              {
                sourceDefinitionId: source.id,
                observedAt: startedAt.toISOString(),
                canonicalAssessmentRecordId:
                  canonicalRecord.assessmentRecordId,
              },
            )
          : initialObservation;
        if (!dryRun) {
          await deps.ingestQueue.enqueue({
            observation,
            sourceRunId: begun.run.id,
            correlationId,
            enqueuedAt: deps.now().toISOString(),
            smokeCorrelationId,
          });
        }
        queued += 1;
      } catch (error) {
        rejected += 1;
        deps.logger.error(
          {
            err: error,
            propertyId: property.id,
            dataSourceId: dataSource.id,
            externalId: record.externalId,
          },
          '[TAX-ASSESSMENT-INGEST] Canonical observation rejected',
        );
      }
    }
  }
  const status = runStatus(
    properties.length,
    fetch,
    rawRecords,
    rejected,
  );
  const reason = errorSummary(status, fetch, rejected);
  if (!dryRun) {
    await deps.runs.complete(begun.run.id, {
      status,
      finishedAt: deps.now(),
      dataFreshThrough: fetch.fetchSucceeded > 0 ? startedAt : undefined,
      observationsReceived: rawRecords,
      observationsRejected: rejected,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsResolved: 0,
      propertiesEvaluated: fetch.propertiesCovered,
      errorCode: reason
        ? status === 'failed'
          ? 'TAX_SOURCE_FAILED'
          : status === 'partial'
            ? 'TAX_SOURCE_PARTIAL'
            : 'NO_TAX_COVERAGE'
        : undefined,
      errorMessage: reason,
      metadataJson: {
        configuredJurisdictions: prepared.sources.length,
        invalidJurisdictions: prepared.invalidSources,
        coveredProperties: fetch.propertiesCovered,
        uncoveredProperties: fetch.propertiesUncovered,
        fetchAttempts: fetch.fetchAttempts,
        fetchSucceeded: fetch.fetchSucceeded,
        fetchFailed: fetch.fetchFailed,
        queued,
        persisted,
      },
    });
  }
  const failed = fetch.fetchFailed + fetch.invalidSources + rejected;
  const result: TaxAssessmentIngestResult = {
    examined: properties.length + rawRecords,
    refreshed: queued,
    skipped: fetch.propertiesUncovered,
    failed,
    reason: failed > 0 ? reason : undefined,
    smokeCorrelationId,
    sourceRunStatus: dryRun ? 'dry_run' : status,
    configuredJurisdictions: prepared.sources.length,
    invalidJurisdictions: prepared.invalidSources,
    coveredProperties: fetch.propertiesCovered,
    uncoveredProperties: fetch.propertiesUncovered,
    fetchAttempts: fetch.fetchAttempts,
    fetchSucceeded: fetch.fetchSucceeded,
    fetchFailed: fetch.fetchFailed,
    rawRecords,
    queued: dryRun ? 0 : queued,
    persisted: dryRun ? 0 : persisted,
    rejected,
    dryRun,
  };
  deps.logger.info(
    { ...result },
    `[TAX-ASSESSMENT-INGEST] status=${result.sourceRunStatus} jurisdictions=${result.configuredJurisdictions} covered=${result.coveredProperties} fetched=${result.fetchSucceeded} queued=${result.queued} failed=${result.failed}`,
  );
  return result;
}
