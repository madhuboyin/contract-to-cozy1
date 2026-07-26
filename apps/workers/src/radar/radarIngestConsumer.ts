import type { Job } from 'bullmq';
import { radarEventIngestionService } from '@worker-shared/modules/homeEventRadar/services/radarEventIngestion.service';
import {
  RADAR_INGEST_JOB_NAME,
  radarIngestJobPayloadSchema,
  type RadarIngestJobPayload,
} from '@worker-shared/modules/homeEventRadar/queues/radarIngest.queue';
import {
  radarIngestDurationSeconds,
  radarIngestFailuresTotal,
  radarIngestLagSeconds,
  radarIngestObservationsTotal,
} from '../lib/metrics';

type IngestionPort = Pick<typeof radarEventIngestionService, 'ingest'>;

export type RadarIngestConsumerDeps = {
  ingestion: IngestionPort;
  now(): Date;
};

const defaultDeps: RadarIngestConsumerDeps = {
  ingestion: radarEventIngestionService,
  now: () => new Date(),
};

export function radarIngestConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RADAR_INGEST_CONCURRENCY ?? '';
  if (!/^\d+$/.test(raw)) return 4;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return 4;
  return Math.min(20, Math.max(1, parsed));
}

export function radarIngestErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'ZodError' || name === 'TypeError') return 'validation';
  if (name === 'RadarObservationSourceError') return 'source';
  if (name === 'RadarObservationConflictError') return 'conflict';
  if (name === 'RadarObservationStaleError') return 'stale';
  if (
    name === 'PrismaClientKnownRequestError' ||
    name === 'PrismaClientInitializationError' ||
    name === 'ReplyError' ||
    name === 'MaxRetriesPerRequestError'
  ) return 'transient';
  return 'unknown';
}

export function isFinalRadarIngestAttempt(
  job: Pick<Job<RadarIngestJobPayload>, 'attemptsMade' | 'opts'> | undefined,
): boolean {
  if (!job) return true;
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade >= attempts;
}

export async function processRadarIngestJob(
  job: Pick<Job<RadarIngestJobPayload>, 'name' | 'data'>,
  deps: RadarIngestConsumerDeps = defaultDeps,
) {
  if (job.name !== RADAR_INGEST_JOB_NAME) {
    throw new Error(`[RADAR-INGEST] Unknown job name: ${job.name}`);
  }
  const started = process.hrtime();
  try {
    const payload = radarIngestJobPayloadSchema.parse(job.data);
    const lagSeconds = Math.max(
      0,
      (deps.now().getTime() - new Date(payload.enqueuedAt).getTime()) / 1_000,
    );
    radarIngestLagSeconds.observe(lagSeconds);
    const result = await deps.ingestion.ingest(payload.observation, {
      sourceRunId: payload.sourceRunId,
      correlationId: payload.correlationId,
    });
    radarIngestObservationsTotal.inc({ outcome: result.outcome });
    return result;
  } catch (error) {
    radarIngestFailuresTotal.inc({ error_class: radarIngestErrorClass(error) });
    throw error;
  } finally {
    const [seconds, nanoseconds] = process.hrtime(started);
    radarIngestDurationSeconds.observe(seconds + nanoseconds / 1e9);
  }
}
