import type { JobsOptions } from 'bullmq';
import { prisma } from '../lib/prisma';
import {
  propertyEnrichmentFactsTotal,
  propertyEnrichmentJobsTotal,
  propertyEnrichmentCacheSuppressionsTotal,
  propertyEnrichmentMatchOutcomesTotal,
  propertyEnrichmentRetriesTotal,
  rentCastEstimatedBillableRequestsTotal,
  rentCastRequestDurationSeconds,
  rentCastRequestsTotal,
  rentCastResultCountTotal,
} from '../lib/metrics';
import {
  createPropertyEnrichmentService,
  type PropertyEnrichmentResult,
} from '../propertyEnrichment/propertyEnrichment.service';
import { RentCastClient } from '../propertyEnrichment/rentCastClient';
import type { PropertyEnrichmentJobPayload } from '../propertyEnrichment/contracts';
import { PROPERTY_ENRICHMENT_CONTRACT_VERSION } from '../propertyEnrichment/contracts';

export const PROPERTY_ENRICHMENT_QUEUE_NAME = 'property-enrichment-queue';
export const PROPERTY_ENRICHMENT_JOB_NAME = 'rentcast-property-enrichment-v3';
export const PROPERTY_ENRICHMENT_MAX_ATTEMPTS = 3;
export const DEFAULT_PROPERTY_ENRICHMENT_CONCURRENCY = 4;

export function propertyEnrichmentJobId(propertyId: string, addressVersion: number): string {
  return `rentcast-${propertyId}-${addressVersion}-v${PROPERTY_ENRICHMENT_CONTRACT_VERSION}`;
}

interface PropertyEnrichmentJobLike {
  id?: string;
  data: PropertyEnrichmentJobPayload;
  attemptsMade: number;
  opts: Pick<JobsOptions, 'attempts'>;
}

interface PropertyEnrichmentProcessorDependencies {
  service?: { enrich(
    payload: PropertyEnrichmentJobPayload,
    execution: { attemptNumber: number; maxAttempts: number },
  ): Promise<PropertyEnrichmentResult> };
  recordResult?: (result: PropertyEnrichmentResult) => void;
}

export class RetryablePropertyEnrichmentError extends Error {
  constructor(readonly code: string) {
    super(`Property enrichment retry required: ${code}`);
    this.name = 'RetryablePropertyEnrichmentError';
  }
}

function resultOutcome(result: PropertyEnrichmentResult): string {
  if (result.kind === 'COMPLETED') return result.status.toLowerCase();
  return result.kind.toLowerCase();
}

function recordDefaultResult(result: PropertyEnrichmentResult): void {
  propertyEnrichmentJobsTotal.inc({ outcome: resultOutcome(result) });
  if (result.kind === 'RETRYABLE') {
    propertyEnrichmentRetriesTotal.inc({ error_class: result.code.toLowerCase() });
  }
  if (result.kind === 'CACHE_HIT') {
    propertyEnrichmentCacheSuppressionsTotal.inc({
      match_status: result.status.toLowerCase(),
    });
  }
  if (result.kind === 'COMPLETED') {
    propertyEnrichmentMatchOutcomesTotal.inc({ outcome: result.status.toLowerCase() });
    if (result.acceptedFactKeys.length > 0) {
      propertyEnrichmentFactsTotal.inc(
        { disposition: 'accepted' },
        result.acceptedFactKeys.length,
      );
    }
    if (result.protectedFactKeys.length > 0) {
      propertyEnrichmentFactsTotal.inc(
        { disposition: 'protected' },
        result.protectedFactKeys.length,
      );
    }
  }
}

function resultCountBand(count: number): string {
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 20) return '6_20';
  return '21_plus';
}

const defaultClient = new RentCastClient({
  observe(observation) {
    rentCastRequestsTotal.inc({ classification: observation.classification });
    rentCastRequestDurationSeconds.observe(
      { classification: observation.classification },
      observation.durationSeconds,
    );
    if (observation.resultCount !== null) {
      rentCastResultCountTotal.inc({ band: resultCountBand(observation.resultCount) });
    }
    if (observation.classification === 'success') {
      rentCastEstimatedBillableRequestsTotal.inc();
    }
  },
});
const defaultService = createPropertyEnrichmentService(prisma, defaultClient);

export function propertyEnrichmentConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number(env.RENTCAST_WORKER_CONCURRENCY);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    return DEFAULT_PROPERTY_ENRICHMENT_CONCURRENCY;
  }
  return parsed;
}

export async function processPropertyEnrichmentJob(
  job: PropertyEnrichmentJobLike,
  dependencies: PropertyEnrichmentProcessorDependencies = {},
): Promise<PropertyEnrichmentResult> {
  const configuredAttempts = Number(job.opts.attempts ?? PROPERTY_ENRICHMENT_MAX_ATTEMPTS);
  const maxAttempts = Math.min(
    PROPERTY_ENRICHMENT_MAX_ATTEMPTS,
    Number.isInteger(configuredAttempts) && configuredAttempts > 0
      ? configuredAttempts
      : PROPERTY_ENRICHMENT_MAX_ATTEMPTS,
  );
  const result = await (dependencies.service ?? defaultService).enrich(job.data, {
    attemptNumber: job.attemptsMade + 1,
    maxAttempts,
  });
  (dependencies.recordResult ?? recordDefaultResult)(result);
  if (result.kind === 'RETRYABLE') {
    throw new RetryablePropertyEnrichmentError(result.code);
  }
  return result;
}
